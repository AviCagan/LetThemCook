// Game-flow controller for the workbench loop: a customer names a target; the player adds bottles
// (plus heat / light / equivalents) to the flask and the reaction engine returns the real product
// each time, until the target is in the flask and handed over. Phaser and Preact observe the signals.
import { signal, computed } from '@preact/signals';
import type { Conditions, OrderType, QuestionItem, Reaction, StereoLabel } from './content/types';
import { getReaction, getReagent, getTag, ITEMS, playableReactions } from './content/bank';
import { ReactionEngine, type Outcome } from './chem/engine';
import { loadRDKit } from './chem/rdkit';
import { scoreOrder, coinsFor } from './engine/scoring';
import { applyResult, newRecord, type MasteryRecord, seeded } from './mastery/srs';
import { newSession, noteResult, noteServed, pickNext, type SessionState } from './mastery/scheduler';
import { SEEDS } from './mastery/seeds';
import { persistSave } from './save/store';
import { trimHistory } from './save/economy';
import type { HistoryEntry, LabBookEntry, LabBookStep } from './save/types';
import { save, screen, showToast } from './state';
import { mulberry32, pick, randomSeed, type Rng } from './util/rng';
import { CHARACTER_KEYS } from './art/characters';
import { customerPool } from './shop';
import { sfx } from './audio/sfx';
import { stereoLabelText } from './engine/stereo';
import { buildQuiz, isQuizType, TYPE_LABEL, unlockedTypes, UNLOCKS, type Quiz } from './quiz';
import { checkName } from './engine/names';
import { topTags } from './mastery/stats';

export type Mode = 'shift' | 'practice' | 'clinic' | 'synthesis' | 'rush' | 'exam';
export type Phase = 'idle' | 'arrive' | 'request' | 'bench' | 'quiz' | 'stereo' | 'result' | 'mentor' | 'dayend';
export const MODE_LABEL: Record<Mode, string> = {
  shift: 'Shift', practice: 'Practice', clinic: 'Weakness clinic', synthesis: 'Synthesis shift', rush: 'Rush hour', exam: 'Exam',
};

export interface Order {
  id: string;
  item: QuestionItem;
  reaction: Reaction;
  start: { smiles: string; name: string };
  target: { smiles: string; name: string; altNames?: string[]; stereo: StereoLabel; highlightAtoms?: number[] };
  stereoChoices?: StereoLabel[];
  par: number;
  retest?: boolean;
  /** how this item is served (make_it / synthesis use the bench; the rest are quizzes) */
  type: OrderType;
  quiz?: Quiz;
  /** today's daily special: double coins */
  daily?: boolean;
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
  stage: 'handover' | 'stereo' | 'gaveup' | 'quiz' | 'none';
  /** quiz orders: the answer given (SMILES / name / route index) and whether it was half credit */
  picked?: string;
  partial?: boolean;
  /** rush hour fast-answer bonus and daily-special doubling, already included in coins */
  bonus?: string[];
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
  mode?: Mode;
  /** exam / rush: seconds used, and whether the clock ran out */
  seconds?: number;
  timeUp?: boolean;
  /** order types unlocked during this shift */
  unlocked?: string[];
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
  /** quiz progress: 'answer' -> (spot the flaw) 'reason'; name it: 'type' or 'choices' */
  quizStage = signal<'answer' | 'reason' | 'choices'>('answer');
  /** rush hour / exam deadline (ms epoch) */
  deadline = signal<number | null>(null);
  private shiftStartedAt = 0;
  private nameChoicesShown = false;
  practiceOnly: string[] | undefined;
  practiceReagents: string[] | undefined;
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

  startShift(mode: Mode, opts: { customers?: number; only?: string[]; reagents?: string[] } = {}): void {
    const s = save.value!;
    this.mode.value = mode;
    this.practiceOnly = opts.only;
    this.practiceReagents = opts.reagents;
    const st = s.profile.settings;
    this.customersTotal.value = opts.customers ?? (mode === 'practice' ? 6 : mode === 'exam' ? st.examLength ?? 25 : mode === 'rush' ? 99 : st.shiftLength);
    this.customerIndex.value = 0;
    this.shiftStartedAt = Date.now();
    const minutes = mode === 'rush' ? st.rushMinutes ?? 5 : mode === 'exam' ? st.examMinutes ?? 50 : 0;
    this.deadline.value = minutes > 0 ? this.shiftStartedAt + minutes * 60_000 : null;
    this.combo.value = 0;
    this.session = newSession();
    this.rng = mulberry32(randomSeed());
    this.report = { ...emptyReport(), mode };
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
    if (this.customerIndex.value >= this.customersTotal.value || this.timeIsUp()) {
      this.endShift();
      return;
    }
    const mode = this.mode.value;
    const reactions = playableReactions(s.profile.chapters);
    const unlocked = unlockedTypes(s.history.length);
    const ALL: OrderType[] = ['make_it', 'predict_product', 'what_start', 'spot_flaw', 'name_it', 'synthesis'];
    const allowedTypes: OrderType[] =
      mode === 'synthesis' ? ['synthesis']
      : mode === 'exam' ? ALL
      : mode === 'clinic' ? unlocked.filter((t) => t === 'make_it' || t === 'predict_product' || t === 'spot_flaw')
      : mode === 'rush' ? ALL.filter((t) => t !== 'synthesis' && (t === 'make_it' || unlocked.includes(t)))
      : [...unlocked, 'synthesis'];
    const ci = this.customerIndex.value;
    const opts = {
      allowedTypes,
      synthesisChance: mode === 'shift' ? 0.4 : mode === 'practice' ? 0.3 : mode === 'exam' ? 0.25 : 0,
      itemFilter: (q: QuestionItem) =>
        s.profile.chapters[String(q.chapter)] !== false && (!this.practiceReagents || q.route.some((st) => this.practiceReagents!.includes(st.reagent))),
      now: Date.now(),
      rng: this.rng,
      only: this.practiceOnly,
      weakOnly: mode === 'clinic',
      // a shift starts easy and gets harder; rush hour stays quick
      maxDifficulty: mode === 'shift' ? 1 + Math.ceil((3 * (ci + 1)) / this.customersTotal.value) : mode === 'rush' ? 2 : undefined,
      preferTags: mode === 'clinic' ? topTags(s.history, 5).map((t) => t.tag) : undefined,
      typeWeights: mode === 'rush' ? { make_it: 0.15, predict_product: 0.3, what_start: 0.2, spot_flaw: 0.15, name_it: 0.2 } : undefined,
    };
    // once a day, the second customer of a shift is the daily special: the most overdue reaction, double coins
    const today = new Date().toISOString().slice(0, 10);
    let daily = false;
    let picked = undefined as ReturnType<typeof pickNext>;
    if (mode === 'shift' && ci === 1 && s.profile.lastDailySpecial !== today) {
      const due = mostDue(reactions, s.mastery.reactions);
      if (due) {
        picked = pickNext(reactions, s.mastery.reactions, this.session, { ...opts, only: [due.id], maxDifficulty: undefined });
        if (picked) {
          daily = true;
          s.profile.lastDailySpecial = today;
          persistSave(s);
        }
      }
    }
    if (!picked) picked = pickNext(reactions, s.mastery.reactions, this.session, opts);
    if (!picked) {
      showToast('No orders left for that selection.');
      this.endShift();
      return;
    }
    this.serve(picked.item, picked.reaction, picked.type, !!picked.retest, daily);
  }

  /** Test hook (?debug=1 only): serve a specific item as a given order type. */
  debugServe(itemId: string, type: OrderType): void {
    const item = ITEMS.find((q) => q.id === itemId);
    if (!item) throw new Error(`no item ${itemId}`);
    this.serve(item, getReaction(item.reactionIds[0]), type, false, false);
    this.startedAt = Date.now();
    this.phase.value = 'request';
  }

  private serve(item: QuestionItem, reaction: Reaction, pickedType: OrderType, retest: boolean, daily: boolean): void {
    const s = save.value!;
    const mode = this.mode.value;
    const target = item.target!;
    let type: OrderType = pickedType;
    const quiz = isQuizType(type) ? buildQuiz(type, item, this.rng, topTags(s.history, 5).map((t) => t.tag)) : undefined;
    if (isQuizType(type) && !quiz) type = (item.orderTypes ?? ['make_it']).includes('synthesis') ? 'synthesis' : 'make_it';
    const PAR: Partial<Record<OrderType, number>> = { predict_product: 45, what_start: 45, spot_flaw: 60, name_it: 40 };
    const order: Order = {
      id: `o${Date.now().toString(36)}`,
      item,
      reaction,
      start: { smiles: item.start!.smiles, name: item.start!.name },
      target: { smiles: target.smiles!, name: target.name, altNames: target.altNames, stereo: target.stereo, highlightAtoms: target.highlightAtoms },
      stereoChoices: target.stereo === 'none' ? undefined : uniq([target.stereo, ...(target.stereoChoices ?? ['racemic', 'single_enantiomer', 'meso']), 'none' as StereoLabel]),
      par: PAR[type] ?? 60 + 40 * (item.route?.length ?? 1),
      retest,
      type,
      quiz,
      daily,
    };
    noteServed(this.session, reaction.id, item.id);
    const pool = customerPool(s, CHARACTER_KEYS);
    let idx = Math.floor(this.rng() * pool.length);
    if (idx === this.lastCustomer) idx = (idx + 1) % pool.length;
    this.lastCustomer = idx;
    this.customerKey.value = pool[idx];
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
    this.quizStage.value = 'answer';
    this.nameChoicesShown = false;
    if (mode === 'exam') {
      // exam mode: no customers walking in, just the next question
      this.startedAt = Date.now();
      this.phase.value = 'request';
    } else {
      this.phase.value = 'arrive';
    }
  }

  timeIsUp(): boolean {
    return this.deadline.value !== null && Date.now() >= this.deadline.value;
  }

  customerArrived(): void {
    if (this.phase.value !== 'arrive') return;
    this.startedAt = Date.now();
    this.phase.value = 'request';
  }

  acceptOrder(): void {
    const o = this.order.value;
    this.phase.value = o && isQuizType(o.type) ? 'quiz' : 'bench';
  }

  /* ---------- quiz orders ---------- */

  /** What do I get? / What did I start with?: pick one of four structures. */
  pickOption(i: number): void {
    const o = this.order.value;
    if (!o?.quiz || this.phase.value !== 'quiz' || (o.quiz.kind !== 'predict_product' && o.quiz.kind !== 'what_start')) return;
    const opt = o.quiz.options[i];
    if (opt.correct) {
      if (o.quiz.kind === 'predict_product' && o.stereoChoices?.length) {
        this.phase.value = 'stereo';
        return;
      }
      this.finishOrder(true, 'quiz', [], undefined, { picked: opt.smiles });
      return;
    }
    const why = o.quiz.kind === 'what_start' ? `${opt.why} The starting material was ${o.start.name}.` : opt.why ?? 'That is not the major product.';
    this.finishOrder(false, 'quiz', [{ tag: opt.tag ?? 'wrong_product', why }], undefined, { picked: opt.smiles });
  }

  /** Spot the flaw, part 1: which route works? */
  pickRoute(i: number): void {
    const o = this.order.value;
    if (!o?.quiz || o.quiz.kind !== 'spot_flaw' || this.phase.value !== 'quiz') return;
    if (o.quiz.routes[i].works) {
      this.quizStage.value = 'reason';
      sfx.ding();
      return;
    }
    this.finishOrder(false, 'quiz', [{ tag: o.quiz.flaw.tag, why: `That route fails: ${o.quiz.flaw.why}` }], undefined, { picked: `route ${'AB'[i]}` });
  }

  /** Spot the flaw, part 2: why does the other route fail? Right route + wrong reason = half credit. */
  pickReason(tag: string): void {
    const o = this.order.value;
    if (!o?.quiz || o.quiz.kind !== 'spot_flaw' || this.quizStage.value !== 'reason') return;
    const flaw = o.quiz.flaw;
    if (tag === flaw.tag) this.finishOrder(true, 'quiz', [], undefined, { picked: tag });
    else this.finishOrder(true, 'quiz', [{ tag: flaw.tag, why: `Right route, but the other one fails because: ${flaw.why}` }], undefined, { picked: tag, partial: true });
  }

  /** Name it: typed answer. */
  submitName(text: string): void {
    const o = this.order.value;
    if (!o?.quiz || o.quiz.kind !== 'name_it' || this.phase.value !== 'quiz') return;
    const v = checkName(text, o.quiz.accepted, o.quiz.traps);
    if (v.correct) this.finishOrder(true, 'quiz', [], undefined, { picked: text, partial: this.nameChoicesShown });
    else this.finishOrder(false, 'quiz', [{ tag: v.tag ?? 'naming_spelling', why: v.why ?? '' }], undefined, { picked: text });
  }

  /** Name it: give up typing and choose from four (half credit). */
  showNameChoices(): void {
    this.nameChoicesShown = true;
    this.quizStage.value = 'choices';
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
    if (this.mode.value === 'exam') return; // no hints in the exam
    if (this.phase.value !== 'bench' && this.phase.value !== 'stereo' && this.phase.value !== 'quiz') return;
    this.hinted = true;
    if (this.phase.value === 'quiz') {
      const q = order.quiz!;
      this.hintText.value =
        q.kind === 'name_it' ? `${order.item.explanation.split('. ')[0]}.`
        : q.kind === 'spot_flaw' ? 'Run each route in your head one step at a time: does every step find the group it needs, in the right order, under the right conditions?'
        : order.reaction.rules.summary;
      sfx.ding();
      return;
    }
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
      this.finishOrder(true, isQuizType(order.type) ? 'quiz' : 'none', [], label);
      return;
    }
    const tag = label === 'none' ? 'missing_stereo' : 'meso_vs_racemic';
    const why = label === 'none' ? getTag('missing_stereo').rule : `${stereoLabelText(order.target.stereo)} was right here. ${getTag('meso_vs_racemic').rule}`;
    this.finishOrder(false, 'stereo', [{ tag, why }], label);
  }

  giveUp(): void {
    const o = this.order.value!;
    const why = o.quiz?.kind === 'name_it' ? `It is ${o.target.name}. ${o.item.explanation}` : `The intended route: ${this.routeText()}. ${o.item.explanation}`;
    this.finishOrder(false, 'gaveup', [{ tag: 'gave_up', why }]);
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

  private finishOrder(correct: boolean, stage: OrderOutcome['stage'], mistakes: Mistake[], pickedStereo?: StereoLabel, extra: { picked?: string; partial?: boolean } = {}): void {
    const order = this.order.value!;
    const s = save.value!;
    const unlockedBefore = unlockedTypes(s.history.length);
    const seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const quiz = isQuizType(order.type);
    const routeLen = order.item.route?.length ?? 1;
    const usedSteps = this.steps.value.filter((x) => x.kind === 'step' && x.changed).length;
    const clean = correct && !this.hinted && !extra.partial && (quiz || (this.wasted === 0 && usedSteps <= routeLen));
    const chemistry: 0 | 0.5 | 1 = !correct ? 0 : clean ? 1 : 0.5;
    const technique = quiz ? (this.nameChoicesShown ? 0.5 : 1) : Math.max(0, 1 - 0.15 * this.wasted);
    const score = scoreOrder({ chemistry, technique, seconds, par: order.par });
    const combo = correct ? this.combo.value + 1 : 0;
    this.combo.value = combo;
    let coins = correct ? coinsFor(score.stars, combo) : 0;
    const bonus: string[] = [];
    if (correct && this.mode.value === 'rush' && seconds <= order.par / 2) {
      coins += 3;
      bonus.push('fast answer +3');
    }
    if (correct && order.daily) {
      coins *= 2;
      bonus.push('daily special ×2');
    }
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
    const entry: HistoryEntry = { t: now, item: order.item.id, type: order.type, reaction: order.reaction.id, ok: correct, tags, stars: score.stars, hinted: this.hinted, mode: this.mode.value, seconds, coins };
    s.history.push(entry);
    trimHistory(s, 5000);
    const book: LabBookEntry = {
      type: order.type,
      picked: extra.picked ?? pickedStereo,
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

    const newly = unlockedTypes(s.history.length).filter((t) => !unlockedBefore.includes(t));
    for (const t of newly) {
      const label = UNLOCKS.find((u) => u.type === t)?.label ?? TYPE_LABEL[t];
      this.report.unlocked = [...(this.report.unlocked ?? []), label];
      showToast(`New order type unlocked: ${label}${label.endsWith('?') ? '' : '!'}`, 3500);
    }
    this.outcome.value = { correct, stars: score.stars, total: score.total, coins, mistakes: all, hinted: this.hinted, wasted: this.wasted, seconds, stage, finalFlask: this.flask.value, pickedStereo, steps: this.steps.value, picked: extra.picked, partial: extra.partial, bonus };
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
    this.shiftReport.value = { ...this.report, seconds: Math.round((Date.now() - this.shiftStartedAt) / 1000), timeUp: this.timeIsUp() };
    this.deadline.value = null;
    this.phase.value = 'dayend';
  }

  abandonShift(): void {
    this.deadline.value = null;
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

/** The reaction whose review is most overdue (missed first). */
function mostDue(reactions: Reaction[], mastery: Record<string, MasteryRecord>): Reaction | undefined {
  const now = Date.now();
  const due = reactions
    .map((r) => ({ r, rec: mastery[r.id] }))
    .filter((x) => x.rec && x.rec.state !== 'new' && (x.rec.state === 'missed' || x.rec.dueAt <= now));
  due.sort((a, b) => (a.rec!.state === 'missed' ? -1 : 0) - (b.rec!.state === 'missed' ? -1 : 0) || a.rec!.dueAt - b.rec!.dueAt);
  return due[0]?.r;
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
