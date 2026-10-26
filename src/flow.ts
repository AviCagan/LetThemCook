// Game-flow controller for the workbench loop: a customer names a target; the player adds bottles
// (plus heat / light / equivalents) to the flask and the reaction engine returns the real product
// each time, until the target is in the flask and handed over. Phaser and Preact observe the signals.
import { signal, computed } from '@preact/signals';
import type { Conditions, QuestionItem, Reaction, Reagent, StereoLabel } from './content/types';
import { getReaction, getReagent, getTag, playableReactions, REAGENTS } from './content/bank';
import { ReactionEngine, type Outcome } from './chem/engine';
import { loadRDKit } from './chem/rdkit';
import { scoreOrder, coinsFor } from './engine/scoring';
import { applyResult, newRecord, type MasteryRecord, seeded } from './mastery/srs';
import { newSession, noteResult, noteServed, pickNext, type SessionState } from './mastery/scheduler';
import { SEEDS } from './mastery/seeds';
import { persistSave } from './save/store';
import type { HistoryEntry, LabBookEntry, LabBookStep } from './save/types';
import { save, screen, showToast } from './state';
import { mulberry32, pick, randomSeed, shuffle, type Rng } from './util/rng';
import { CHARACTER_KEYS } from './art/characters';
import { sfx } from './audio/sfx';
import { stereoLabelText } from './engine/stereo';

export type Mode = 'shift' | 'practice' | 'clinic';
export type Phase = 'idle' | 'arrive' | 'request' | 'bench' | 'stereo' | 'result' | 'mentor' | 'dayend';

export interface Order {
  id: string;
  item: QuestionItem;
  reaction: Reaction;
  start: { smiles: string; name: string };
  target: { smiles: string; name: string; altNames?: string[]; stereo: StereoLabel; highlightAtoms?: number[] };
  stereoChoices?: StereoLabel[];
  /** bottles laid out on the bench for this order (route + decoys + fillers), shuffled */
  bench: Reagent[];
  par: number;
  retest?: boolean;
}

export interface StepRecord {
  index: number;
  reagentId: string;
  conditions?: Conditions;
  before: string;
  after: string;
  changed: boolean;
  label: string;
  reactionIds: string[];
  trapTag?: string;
  trapWhy?: string;
  blocked?: string;
  warnings: { tag: string; why: string }[];
  kind: 'step' | 'undo' | 'reset';
}

export interface Mistake {
  tag: string;
  why: string;
}

export interface OrderOutcome {
  correct: boolean;
  stars: 0 | 1 | 2 | 3;
  total: number;
  coins: number;
  mistakes: Mistake[];
  hinted: boolean;
  wasted: number;
  seconds: number;
  stage: 'handover' | 'stereo' | 'gaveup' | 'none';
  finalFlask: string;
  pickedStereo?: StereoLabel;
  steps: StepRecord[];
}

export interface ShiftReport {
  orders: number;
  correct: number;
  stars: number;
  coins: number;
  bestCombo: number;
  tags: Record<string, number>;
  reactions: Record<string, { ok: number; total: number }>;
}

const INTERMEDIATE_PATTERNS: [RegExp, string][] = [
  [/\[O-\]|\[S-\]/, 'This is still the anion (alkoxide / phenoxide / thiolate / carboxylate). Protonate it with H₂O or H₃O⁺ before handing it over.'],
  [/\[Mg\]/, 'This is the Grignard reagent, not a product. Add the carbonyl / epoxide partner, then H₃O⁺.'],
  [/\[N\+\]#N/, 'This is the diazonium salt, an intermediate. Add H₂O and heat to replace N₂ with OH.'],
  [/\[BH2\]|^B|\(B\)|B\)/, 'This is the alkylborane. Add H₂O₂/NaOH to swap the C–B bond for C–OH.'],
];

class GameFlow {
  mode = signal<Mode>('shift');
  phase = signal<Phase>('idle');
  order = signal<Order | null>(null);
  customerKey = signal<string>(CHARACTER_KEYS[0]);
  customerIndex = signal(0);
  customersTotal = signal(10);
  flask = signal<string>('');
  steps = signal<StepRecord[]>([]);
  lastOutcome = signal<Outcome | null>(null);
  targetReached = signal(false);
  outcome = signal<OrderOutcome | null>(null);
  combo = signal(0);
  shiftReport = signal<ShiftReport | null>(null);
  hintText = signal<string | null>(null);
  busy = signal(false);
  practiceOnly: string[] | undefined;
  engine: ReactionEngine | null = null;
  private hinted = false;
  private wasted = 0;
  private startedAt = 0;
  private session: SessionState = newSession();
  private rng: Rng = mulberry32(randomSeed());
  private report: ShiftReport = emptyReport();
  private lastCustomer = -1;
  private encounteredTags: Mistake[] = [];

  timeOfDay = computed(() => (this.customersTotal.value <= 1 ? 1 : this.customerIndex.value / this.customersTotal.value));

  async ensureEngine(): Promise<ReactionEngine> {
    if (!this.engine) this.engine = new ReactionEngine(await loadRDKit());
    return this.engine;
  }

  /* ---------- session ---------- */

  startShift(mode: Mode, opts: { customers?: number; only?: string[] } = {}): void {
    const s = save.value!;
    this.mode.value = mode;
    this.practiceOnly = opts.only;
    this.customersTotal.value = opts.customers ?? (mode === 'practice' ? 6 : s.profile.settings.shiftLength);
    this.customerIndex.value = 0;
    this.combo.value = 0;
    this.session = newSession();
    this.rng = mulberry32(randomSeed());
    this.report = emptyReport();
    this.shiftReport.value = null;
    this.ensureSeeds();
    screen.value = 'lab';
    void this.ensureEngine();
    this.nextCustomer();
  }

  private ensureSeeds(): void {
    const s = save.value!;
    const now = Date.now();
    const playable = new Set(playableReactions().map((r) => r.id));
    let changed = false;
    for (const seed of SEEDS) {
      if (!playable.has(seed.reactionId) || s.profile.seededReactions.includes(seed.reactionId)) continue;
      if (!s.mastery.reactions[seed.reactionId]) s.mastery.reactions[seed.reactionId] = seeded(seed.state, now);
      s.profile.seededReactions.push(seed.reactionId);
      changed = true;
    }
    if (changed) persistSave(s);
  }

  nextCustomer(): void {
    const s = save.value!;
    if (this.customerIndex.value >= this.customersTotal.value) {
      this.endShift();
      return;
    }
    const reactions = playableReactions(s.profile.chapters);
    const picked = pickNext(reactions, s.mastery.reactions, this.session, {
      allowedTypes: ['make_it'],
      now: Date.now(),
      rng: this.rng,
      only: this.practiceOnly,
      weakOnly: this.mode.value === 'clinic',
    });
    if (!picked) {
      showToast('No orders left for that selection.');
      this.endShift();
      return;
    }
    const item = picked.item;
    const target = item.target!;
    const order: Order = {
      id: `o${Date.now().toString(36)}`,
      item,
      reaction: picked.reaction,
      start: { smiles: item.start!.smiles, name: item.start!.name },
      target: { smiles: target.smiles!, name: target.name, altNames: target.altNames, stereo: target.stereo, highlightAtoms: target.highlightAtoms },
      stereoChoices: target.stereo === 'none' ? undefined : uniq([target.stereo, ...(target.stereoChoices ?? ['racemic', 'single_enantiomer', 'meso']), 'none' as StereoLabel]),
      bench: this.buildBench(item, picked.reaction),
      par: 60 + 40 * (item.route?.length ?? 1),
      retest: picked.retest,
    };
    noteServed(this.session, picked.reaction.id, item.id);
    let idx = Math.floor(this.rng() * CHARACTER_KEYS.length);
    if (idx === this.lastCustomer) idx = (idx + 1) % CHARACTER_KEYS.length;
    this.lastCustomer = idx;
    this.customerKey.value = CHARACTER_KEYS[idx];
    this.order.value = order;
    this.flask.value = order.start.smiles;
    this.steps.value = [];
    this.lastOutcome.value = null;
    this.targetReached.value = false;
    this.outcome.value = null;
    this.hintText.value = null;
    this.hinted = false;
    this.wasted = 0;
    this.encounteredTags = [];
    this.phase.value = 'arrive';
  }

  /** The bottles on the bench: every bottle the route needs, the reaction's decoys, and fillers. */
  private buildBench(item: QuestionItem, reaction: Reaction): Reagent[] {
    const needed = new Set<string>();
    for (const s of item.route ?? []) needed.add(s.reagent);
    for (const alt of item.altRoutes ?? []) alt.forEach((s) => needed.add(s.reagent));
    needed.add('H2O');
    needed.add('H3O_plus');
    const extras: string[] = [];
    for (const id of reaction.decoys ?? []) if (!needed.has(id)) extras.push(id);
    for (const rid of item.reactionIds.slice(1)) for (const id of getReaction(rid).decoys ?? []) if (!needed.has(id) && !extras.includes(id)) extras.push(id);
    const ids = [...needed, ...shuffle(this.rng, extras)];
    const pool = REAGENTS.filter((r) => !ids.includes(r.id) && r.kind === 'reagent').map((r) => r.id);
    for (const id of shuffle(this.rng, pool)) {
      if (ids.length >= 10) break;
      ids.push(id);
    }
    return shuffle(this.rng, ids).map(getReagent);
  }

  customerArrived(): void {
    if (this.phase.value !== 'arrive') return;
    this.startedAt = Date.now();
    this.phase.value = 'request';
  }

  acceptOrder(): void {
    this.phase.value = 'bench';
  }

  /* ---------- workbench ---------- */

  async addReagent(reagentId: string, conditions?: Conditions): Promise<void> {
    if (this.busy.value || this.phase.value !== 'bench') return;
    this.busy.value = true;
    try {
      const engine = await this.ensureEngine();
      const order = this.order.value!;
      const before = this.flask.value;
      const out = engine.apply(reagentId, conditions, before);
      const rec: StepRecord = {
        index: this.steps.value.filter((s) => s.kind === 'step').length + 1,
        reagentId,
        conditions,
        before,
        after: out.product,
        changed: out.changed,
        label: out.changed ? out.rule!.label : out.blocked[0] ?? out.traps[0]?.why ?? 'Nothing happened.',
        reactionIds: out.rule?.reactionIds ?? [],
        trapTag: out.traps[0]?.tag,
        trapWhy: out.traps[0]?.why,
        blocked: out.blocked[0],
        warnings: out.warnings,
        kind: 'step',
      };
      this.steps.value = [...this.steps.value, rec];
      this.lastOutcome.value = out;
      if (out.changed) {
        this.flask.value = out.product;
        sfx.bubble();
      } else {
        this.wasted += 1;
        sfx.fizzle();
        if (out.traps[0]) this.encounteredTags.push({ tag: out.traps[0].tag, why: out.traps[0].why });
      }
      for (const w of out.warnings) this.encounteredTags.push(w);
      const reached = engine.containsTarget(this.flask.value, order.target.smiles);
      if (reached && !this.targetReached.value) {
        sfx.ding();
        showToast('That looks like what the customer wants. Hand it over!', 2600);
      }
      this.targetReached.value = reached;
    } finally {
      this.busy.value = false;
    }
  }

  undo(): void {
    const steps = this.steps.value;
    const last = [...steps].reverse().find((s) => s.kind === 'step');
    if (!last) return;
    this.wasted += 1;
    this.flask.value = last.before;
    this.steps.value = [...steps.filter((s) => s !== last), { ...last, kind: 'undo', after: last.before, label: `Undid: ${getReagent(last.reagentId).label}` }];
    this.targetReached.value = !!this.engine && this.engine.containsTarget(this.flask.value, this.order.value!.target.smiles);
    sfx.click();
  }

  resetFlask(): void {
    const order = this.order.value!;
    if (this.flask.value === order.start.smiles) return;
    this.wasted += 1;
    this.flask.value = order.start.smiles;
    this.steps.value = [...this.steps.value, { index: 0, reagentId: '', before: '', after: order.start.smiles, changed: true, label: 'Reset: fresh starting material', reactionIds: [], warnings: [], kind: 'reset' }];
    this.targetReached.value = false;
    sfx.click();
  }

  /** The mentor's hint: the next step of the intended route from where the flask is now. */
  async askMentor(): Promise<void> {
    const order = this.order.value!;
    if (this.phase.value !== 'bench' && this.phase.value !== 'stereo') return;
    this.hinted = true;
    if (this.phase.value === 'stereo') {
      this.hintText.value = order.reaction.rules.stereo ?? order.reaction.rules.summary;
      sfx.ding();
      return;
    }
    const engine = await this.ensureEngine();
    const route = order.item.route ?? [];
    let flask = engine.canonical(order.start.smiles)!;
    const cur = engine.canonical(this.flask.value)!;
    let nextIndex = -1;
    if (cur === flask) nextIndex = 0;
    for (let i = 0; i < route.length && nextIndex < 0; i++) {
      flask = engine.apply(route[i].reagent, route[i].conditions, flask).product;
      if (flask === cur) nextIndex = i + 1;
    }
    if (nextIndex < 0) {
      this.hintText.value = `You've wandered off the route. Reset the flask and start with ${describeStep(route[0])}. ${order.reaction.rules.summary}`;
    } else if (nextIndex >= route.length) {
      this.hintText.value = 'The target is in the flask. Hand it over!';
    } else {
      this.hintText.value = `Next: ${describeStep(route[nextIndex])}. ${order.reaction.rules.summary}`;
    }
    sfx.ding();
  }

  async handOver(): Promise<void> {
    const order = this.order.value!;
    const engine = await this.ensureEngine();
    const ok = engine.containsTarget(this.flask.value, order.target.smiles);
    if (!ok) {
      const mistakes = this.diagnoseWrongHandover();
      this.finishOrder(false, 'handover', mistakes);
      return;
    }
    if (order.stereoChoices?.length) {
      this.phase.value = 'stereo';
      return;
    }
    this.finishOrder(true, 'none', []);
  }

  pickStereo(label: StereoLabel): void {
    const order = this.order.value!;
    if (label === order.target.stereo) {
      this.finishOrder(true, 'none', [], label);
      return;
    }
    const tag = label === 'none' ? 'missing_stereo' : 'meso_vs_racemic';
    const why = label === 'none' ? getTag('missing_stereo').rule : `${stereoLabelText(order.target.stereo)} was right here. ${getTag('meso_vs_racemic').rule}`;
    this.finishOrder(false, 'stereo', [{ tag, why }], label);
  }

  giveUp(): void {
    this.finishOrder(false, 'gaveup', [{ tag: 'gave_up', why: `The intended route: ${this.routeText()}. ${this.order.value!.item.explanation}` }]);
  }

  private diagnoseWrongHandover(): Mistake[] {
    const order = this.order.value!;
    const flask = this.flask.value;
    const engine = this.engine!;
    const mistakes: Mistake[] = [];
    for (const [re, why] of INTERMEDIATE_PATTERNS) {
      if (re.test(flask)) {
        mistakes.push({ tag: 'missing_workup', why });
        break;
      }
    }
    const frags = flask.split('.').map((f) => engine.canonical(f, false));
    for (const trap of order.item.traps ?? []) {
      const t = engine.canonical(trap.smiles, false);
      if (t && frags.includes(t)) mistakes.push({ tag: trap.tag, why: trap.why });
    }
    if (!mistakes.length) {
      if (engine.canonical(flask, false) === engine.canonical(order.start.smiles, false)) {
        mistakes.push({ tag: 'wrong_product', why: `Nothing changed. The route was ${this.routeText()}.` });
      } else {
        mistakes.push({ tag: 'wrong_product', why: `That is not ${order.target.name}. The intended route: ${this.routeText()}.` });
      }
    }
    return mistakes;
  }

  routeText(): string {
    const route = this.order.value?.item.route ?? [];
    return route.map((s, i) => `${i + 1}. ${describeStep(s)}`).join('; ');
  }

  /* ---------- result + mastery ---------- */

  private finishOrder(correct: boolean, stage: OrderOutcome['stage'], mistakes: Mistake[], pickedStereo?: StereoLabel): void {
    const order = this.order.value!;
    const s = save.value!;
    const seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const routeLen = order.item.route?.length ?? 1;
    const usedSteps = this.steps.value.filter((x) => x.kind === 'step' && x.changed).length;
    const clean = correct && !this.hinted && this.wasted === 0 && usedSteps <= routeLen;
    const chemistry: 0 | 0.5 | 1 = !correct ? 0 : clean ? 1 : 0.5;
    const technique = Math.max(0, 1 - 0.15 * this.wasted);
    const score = scoreOrder({ chemistry, technique, seconds, par: order.par });
    const combo = correct ? this.combo.value + 1 : 0;
    this.combo.value = combo;
    const coins = correct ? coinsFor(score.stars, combo) : 0;
    const all = dedupe([...mistakes, ...this.encounteredTags]);
    const tags = all.map((m) => m.tag);
    const now = Date.now();
    for (const rid of order.item.reactionIds) {
      const rec: MasteryRecord = s.mastery.reactions[rid] ?? newRecord();
      const next = applyResult(rec, { correct, hinted: !clean && correct }, now, s.profile.examDate);
      s.mastery.reactions[rid] = next;
      noteResult(this.session, rid, order.item.id, next);
    }
    for (const st of this.steps.value) {
      if (st.kind !== 'step') continue;
      const rr = s.mastery.reagents[st.reagentId] ?? { seen: 0, right: 0, wrong: 0, lastSeenAt: 0 };
      rr.seen += 1;
      if (st.changed) rr.right += 1;
      else rr.wrong += 1;
      rr.lastSeenAt = now;
      s.mastery.reagents[st.reagentId] = rr;
    }
    const entry: HistoryEntry = { t: now, item: order.item.id, type: 'make_it', reaction: order.reaction.id, ok: correct, tags, stars: score.stars, hinted: this.hinted, mode: this.mode.value, seconds };
    s.history.push(entry);
    if (s.history.length > 5000) s.history.splice(0, s.history.length - 5000);
    const book: LabBookEntry = {
      t: now,
      item: order.item.id,
      startSmiles: order.start.smiles,
      startName: order.start.name,
      targetSmiles: order.target.smiles,
      targetName: order.target.name,
      ok: correct,
      stars: score.stars,
      steps: this.steps.value.map<LabBookStep>((x) => ({ reagent: x.reagentId, conditions: x.conditions, before: x.before, after: x.after, changed: x.changed, label: x.label, kind: x.kind })),
      finalSmiles: this.flask.value,
      tags,
      note: s.notes[order.item.id],
    };
    s.labBook.push(book);
    if (s.labBook.length > 400) s.labBook.splice(0, s.labBook.length - 400);
    s.economy.coins += coins;
    if (combo > s.stats.bestStreak) s.stats.bestStreak = combo;
    persistSave(s);
    save.value = { ...s };

    this.report.orders += 1;
    if (correct) this.report.correct += 1;
    this.report.stars += score.stars;
    this.report.coins += coins;
    this.report.bestCombo = Math.max(this.report.bestCombo, combo);
    for (const t of tags) this.report.tags[t] = (this.report.tags[t] ?? 0) + 1;
    const rr = this.report.reactions[order.reaction.id] ?? { ok: 0, total: 0 };
    rr.total += 1;
    if (correct) rr.ok += 1;
    this.report.reactions[order.reaction.id] = rr;

    this.outcome.value = { correct, stars: score.stars, total: score.total, coins, mistakes: all, hinted: this.hinted, wasted: this.wasted, seconds, stage, finalFlask: this.flask.value, pickedStereo, steps: this.steps.value };
    if (correct) sfx.success(score.stars);
    else sfx.puff();
    this.phase.value = correct ? 'result' : 'mentor';
  }

  continueAfterResult(): void {
    this.customerIndex.value += 1;
    this.phase.value = 'idle';
    this.order.value = null;
    this.outcome.value = null;
    this.nextCustomer();
  }

  endShift(): void {
    const s = save.value!;
    if (this.report.orders > 0) {
      s.stats.shiftsPlayed += 1;
      persistSave(s, true);
      save.value = { ...s };
    }
    this.shiftReport.value = { ...this.report };
    this.phase.value = 'dayend';
  }

  abandonShift(): void {
    this.phase.value = 'idle';
    this.order.value = null;
    screen.value = 'title';
  }

  /* ---------- notes ---------- */

  setNote(text: string): void {
    const s = save.value!;
    const id = this.order.value?.item.id;
    if (!id) return;
    if (text.trim()) s.notes[id] = text;
    else delete s.notes[id];
    persistSave(s);
  }

  getNote(): string {
    const id = this.order.value?.item.id;
    return id ? save.value?.notes[id] ?? '' : '';
  }

  randomTip(): string {
    const order = this.order.value;
    return order?.item.tip ?? pick(this.rng, ['Nice work!', 'Clean bench, clean mind.', 'Textbook.']);
  }

  reactionFor(id: string): Reaction {
    return getReaction(id);
  }
}

export function describeStep(step: { reagent: string; conditions?: Conditions }): string {
  const r = getReagent(step.reagent);
  const c = step.conditions ?? {};
  const parts: string[] = [];
  if (c.temp) parts.push({ ice: '0–5 °C', rt: 'room temp', c140: '140 °C', c180: '180 °C', reflux: 'heat' }[c.temp]);
  if (c.light) parts.push('light');
  if (c.equiv !== undefined) parts.push(`${c.equiv} equiv`);
  if (c.pressure) parts.push('pressure');
  return parts.length ? `${r.label} (${parts.join(', ')})` : r.label;
}

function dedupe(ms: Mistake[]): Mistake[] {
  const seen = new Set<string>();
  const out: Mistake[] = [];
  for (const m of ms) {
    if (seen.has(m.tag)) continue;
    seen.add(m.tag);
    out.push(m);
  }
  return out;
}
function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
function emptyReport(): ShiftReport {
  return { orders: 0, correct: 0, stars: 0, coins: 0, bestCombo: 0, tags: {}, reactions: {} };
}

export const flow = new GameFlow();
