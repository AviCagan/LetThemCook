// The game-flow controller: one order at a time, from customer arrival to the mastery log.
// Phaser scenes and Preact overlays both observe these signals; neither owns the rules.
import { signal, computed } from '@preact/signals';
import type { Conditions, OrderType, Reaction, Route, StereoLabel, Step } from './content/types';
import { getReaction, getReagent, getTag, playableReactions } from './content/bank';
import { buildOrder, type Order, type ProductOption } from './engine/order';
import { gradeProduct, gradeRoute, type Mistake } from './engine/grader';
import { coinsFor, scoreOrder } from './engine/scoring';
import { conditionText, describeRoute } from './engine/route';
import { applyResult, newRecord, type MasteryRecord } from './mastery/srs';
import { newSession, noteResult, noteServed, pickNext, type SessionState } from './mastery/scheduler';
import { SEEDS } from './mastery/seeds';
import { seeded } from './mastery/srs';
import { persistSave } from './save/store';
import type { HistoryEntry } from './save/types';
import { save, screen, showToast } from './state';
import { mulberry32, pick, randomSeed, type Rng } from './util/rng';
import { CHARACTER_KEYS } from './art/characters';
import { sfx } from './audio/sfx';

export type Mode = 'shift' | 'practice' | 'clinic';
export type Phase =
  | 'idle'
  | 'arrive'
  | 'card'
  | 'shelf'
  | 'minigame'
  | 'picker'
  | 'stereo'
  | 'result'
  | 'mentor'
  | 'dayend';

export interface MinigameRequest {
  kind: 'pour' | 'temperature' | 'stir' | 'light' | 'workup' | 'pressure';
  stepIndex: number;
  totalSteps: number;
  reagentId: string;
  label: string;
  /** conditions the step requires (predict_product) or undefined when the player chooses (make_it) */
  target?: Conditions;
  tempPresets?: string[];
  equivOptions?: number[];
  choose: boolean;
}

export interface MinigameResult {
  precision: number;
  conditions?: Conditions;
}

export interface OrderOutcome {
  correct: boolean;
  stars: 0 | 1 | 2 | 3;
  total: number;
  coins: number;
  mistakes: Mistake[];
  hinted: boolean;
  retried: boolean;
  seconds: number;
  technique: number;
  stage: 'route' | 'product' | 'stereo' | 'none';
  playerRoute?: Route;
  pickedOption?: ProductOption;
  pickedStereo?: StereoLabel;
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

const ALLOWED_TYPES: OrderType[] = ['make_it', 'predict_product'];

class GameFlow {
  mode = signal<Mode>('shift');
  phase = signal<Phase>('idle');
  order = signal<Order | null>(null);
  customerKey = signal<string>(CHARACTER_KEYS[0]);
  customerIndex = signal(0);
  customersTotal = signal(10);
  playerRoute = signal<Route>([]);
  minigame = signal<MinigameRequest | null>(null);
  outcome = signal<OrderOutcome | null>(null);
  combo = signal(0);
  shiftReport = signal<ShiftReport | null>(null);
  hintText = signal<string | null>(null);
  pickerLocked = signal<string[]>([]); // option ids already tried
  practiceOnly: string[] | undefined;
  /** true after the player used the mentor hint this order */
  private hinted = false;
  private retried = false;
  private startedAt = 0;
  private techniqueScores: number[] = [];
  private routeForMinigames: Route = [];
  private stepCursor = 0;
  private stageMistakes: Mistake[] = [];
  private session: SessionState = newSession();
  private rng: Rng = mulberry32(randomSeed());
  private report: ShiftReport = emptyReport();
  private lastCustomer = -1;
  private pendingMinigameResolve: ((r: MinigameResult) => void) | null = null;

  timeOfDay = computed(() => {
    const t = this.customersTotal.value <= 1 ? 1 : this.customerIndex.value / this.customersTotal.value;
    return t; // 0 morning -> 1 evening
  });

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
    this.nextCustomer();
  }

  private ensureSeeds(): void {
    const s = save.value!;
    const now = Date.now();
    const existing = new Set(Object.keys(s.mastery.reactions));
    const playable = new Set(playableReactions().map((r) => r.id));
    let changed = false;
    for (const seed of SEEDS) {
      if (!playable.has(seed.reactionId)) continue;
      if (s.profile.seededReactions.includes(seed.reactionId)) continue;
      if (!existing.has(seed.reactionId)) s.mastery.reactions[seed.reactionId] = seeded(seed.state, now);
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
      allowedTypes: ALLOWED_TYPES,
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
    const order = buildOrder(picked.item, picked.type, this.rng, { retest: picked.retest });
    noteServed(this.session, picked.reaction.id, picked.item.id);
    // a different customer than last time
    let idx = Math.floor(this.rng() * CHARACTER_KEYS.length);
    if (idx === this.lastCustomer) idx = (idx + 1) % CHARACTER_KEYS.length;
    this.lastCustomer = idx;
    this.customerKey.value = CHARACTER_KEYS[idx];
    this.order.value = order;
    this.playerRoute.value = [];
    this.outcome.value = null;
    this.hintText.value = null;
    this.pickerLocked.value = [];
    this.hinted = false;
    this.retried = false;
    this.techniqueScores = [];
    this.stageMistakes = [];
    this.stepCursor = 0;
    this.phase.value = 'arrive';
  }

  /** Called by the Lab scene once the customer has walked in. */
  customerArrived(): void {
    if (this.phase.value !== 'arrive') return;
    this.startedAt = Date.now();
    this.phase.value = 'card';
  }

  /** Player read the card. */
  acceptOrder(): void {
    const order = this.order.value!;
    if (order.type === 'make_it') {
      this.phase.value = 'shelf';
    } else {
      this.routeForMinigames = order.givenRoute ?? [];
      this.beginMinigames();
    }
  }

  /* ---------- shelf (make_it) ---------- */

  setRoute(route: Route): void {
    this.playerRoute.value = route;
  }

  submitRoute(): void {
    const route = this.playerRoute.value;
    if (!route.length) {
      showToast('Add at least one reagent.');
      return;
    }
    this.routeForMinigames = route.map((s) => ({ reagents: [...s.reagents], conditions: { ...(s.conditions ?? {}) } }));
    this.beginMinigames();
  }

  /* ---------- minigames ---------- */

  private beginMinigames(): void {
    this.stepCursor = 0;
    this.runNextMinigame();
  }

  private runNextMinigame(): void {
    const order = this.order.value!;
    const route = this.routeForMinigames;
    if (this.stepCursor >= route.length) {
      this.afterMinigames();
      return;
    }
    const step = route[this.stepCursor];
    const reagent = getReagent(step.reagents[0]);
    const kind = reagent.technique === 'none' ? 'pour' : reagent.technique;
    const choose = order.type === 'make_it';
    const request: MinigameRequest = {
      kind,
      stepIndex: this.stepCursor,
      totalSteps: route.length,
      reagentId: reagent.id,
      label: step.reagents.map((id) => getReagent(id).label).join(' + '),
      target: choose ? undefined : step.conditions,
      tempPresets: reagent.techniqueParams?.tempPresets,
      equivOptions: reagent.techniqueParams?.equivOptions,
      choose,
    };
    this.minigame.value = request;
    this.phase.value = 'minigame';
  }

  /** Minigame scenes call this when the step is done. */
  completeMinigame(result: MinigameResult): void {
    const step = this.routeForMinigames[this.stepCursor];
    this.techniqueScores.push(Math.max(0, Math.min(1, result.precision)));
    if (result.conditions && this.order.value?.type === 'make_it') {
      step.conditions = { ...(step.conditions ?? {}), ...result.conditions };
    }
    this.stepCursor += 1;
    this.minigame.value = null;
    this.pendingMinigameResolve?.(result);
    this.runNextMinigame();
  }

  private afterMinigames(): void {
    const order = this.order.value!;
    if (order.type === 'make_it') {
      const grade = gradeRoute(order.item, order.reaction, this.routeForMinigames);
      if (!grade.correct) {
        this.stageMistakes.push(...grade.mistakes);
        if (!this.retried && this.mode.value !== 'practice') {
          this.retried = true;
          sfx.fizzle();
          showToast(`Hmm, that batch didn't work. ${grade.mistakes[0]?.why.split('. ')[0]}. One more try!`, 4200);
          this.phase.value = 'shelf';
          return;
        }
        this.finishOrder(false, 'route', { playerRoute: this.routeForMinigames });
        return;
      }
    }
    this.phase.value = 'picker';
  }

  /* ---------- product + stereo ---------- */

  pickProduct(option: ProductOption): void {
    const order = this.order.value!;
    const grade = gradeProduct(order.item, { correct: option.correct, tag: option.tag, why: option.why });
    if (!grade.correct) {
      this.stageMistakes.push(...grade.mistakes);
      if (!this.retried && this.mode.value !== 'practice') {
        this.retried = true;
        this.pickerLocked.value = [...this.pickerLocked.value, option.id];
        sfx.fizzle();
        showToast('Not that one. Try once more.', 2000);
        return;
      }
      this.finishOrder(false, 'product', { pickedOption: option, playerRoute: this.routeForMinigames });
      return;
    }
    if (order.stereoChoices && order.stereoChoices.length) {
      this.phase.value = 'stereo';
      return;
    }
    this.finishOrder(true, 'none', { pickedOption: option, playerRoute: this.routeForMinigames });
  }

  pickStereo(label: StereoLabel): void {
    const order = this.order.value!;
    const grade = gradeProduct(order.item, { correct: true }, label);
    if (!grade.correct) {
      this.stageMistakes.push(...grade.mistakes);
      this.finishOrder(false, 'stereo', { pickedStereo: label, playerRoute: this.routeForMinigames });
      return;
    }
    this.finishOrder(true, 'none', { pickedStereo: label, playerRoute: this.routeForMinigames });
  }

  /* ---------- hints ---------- */

  askMentor(): void {
    const order = this.order.value!;
    if (this.hinted) return;
    this.hinted = true;
    const r = order.reaction;
    let text = r.rules.summary;
    if (this.phase.value === 'shelf') {
      const first = order.item.route?.steps[0]?.reagents.map((id) => getReagent(id).label).join(' + ');
      text = `${r.rules.summary} Start with ${first}.`;
    } else if (this.phase.value === 'stereo') {
      text = r.rules.stereo ?? r.rules.summary;
    }
    this.hintText.value = text;
    sfx.ding();
  }

  /* ---------- result + mastery ---------- */

  private finishOrder(
    correct: boolean,
    stage: OrderOutcome['stage'],
    extra: Partial<OrderOutcome> = {},
  ): void {
    const order = this.order.value!;
    const s = save.value!;
    const seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const technique = this.techniqueScores.length ? this.techniqueScores.reduce((a, b) => a + b, 0) / this.techniqueScores.length : 1;
    const chemistry: 0 | 0.5 | 1 = !correct ? 0 : this.hinted || this.retried ? 0.5 : 1;
    const score = scoreOrder({ chemistry, technique, seconds, par: order.par });
    const combo = correct ? this.combo.value + 1 : 0;
    this.combo.value = combo;
    const coins = correct ? coinsFor(score.stars, combo) : 0;
    const mistakes = dedupeMistakes(this.stageMistakes);
    const tags = mistakes.map((m) => m.tag);

    // mastery per reaction
    const now = Date.now();
    const reactionIds = order.item.reactionIds ?? [order.reaction.id];
    for (const rid of reactionIds) {
      const rec: MasteryRecord = s.mastery.reactions[rid] ?? newRecord();
      const next = applyResult(rec, { correct, hinted: this.hinted || this.retried }, now, s.profile.examDate);
      s.mastery.reactions[rid] = next;
      noteResult(this.session, rid, order.item.id, next);
    }
    // mastery per reagent card (bottles the player used, or the given route)
    const usedRoute = extra.playerRoute ?? order.givenRoute ?? [];
    for (const step of usedRoute) {
      for (const id of step.reagents) {
        const rr = s.mastery.reagents[id] ?? { seen: 0, right: 0, wrong: 0, lastSeenAt: 0 };
        rr.seen += 1;
        if (correct) rr.right += 1;
        else rr.wrong += 1;
        rr.lastSeenAt = now;
        s.mastery.reagents[id] = rr;
      }
    }
    const entry: HistoryEntry = {
      t: now,
      item: order.item.id,
      type: order.type,
      reaction: order.reaction.id,
      ok: correct,
      tags,
      stars: score.stars,
      hinted: this.hinted,
      mode: this.mode.value,
      seconds,
    };
    s.history.push(entry);
    if (s.history.length > 5000) s.history.splice(0, s.history.length - 5000);
    s.economy.coins += coins;
    if (combo > s.stats.bestStreak) s.stats.bestStreak = combo;
    persistSave(s);
    save.value = { ...s };

    // shift report
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

    this.outcome.value = {
      correct,
      stars: score.stars,
      total: score.total,
      coins,
      mistakes,
      hinted: this.hinted,
      retried: this.retried,
      seconds,
      technique,
      stage,
      ...extra,
    };
    if (correct) sfx.success(score.stars);
    else sfx.puff();
    this.phase.value = correct ? 'result' : 'mentor';
  }

  /** From the result/mentor panel. */
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
    this.minigame.value = null;
    screen.value = 'title';
  }

  /* ---------- helpers for the UI ---------- */

  routeText(route: Route): string {
    return describeRoute(route, (id) => getReagent(id).label, conditionText);
  }

  correctRouteText(): string {
    const order = this.order.value;
    if (!order?.item.route) return '';
    return this.routeText(order.item.route.steps);
  }

  tagRule(tag: string): string {
    return getTag(tag).rule;
  }

  reactionFor(id: string): Reaction {
    return getReaction(id);
  }

  randomTip(): string {
    const order = this.order.value;
    return order?.item.tip ?? pick(this.rng, ['Nice work!', 'Clean bench, clean mind.', 'Textbook.']);
  }
}

function dedupeMistakes(ms: Mistake[]): Mistake[] {
  const seen = new Set<string>();
  const out: Mistake[] = [];
  for (const m of ms) {
    if (seen.has(m.tag)) continue;
    seen.add(m.tag);
    out.push(m);
  }
  return out;
}

function emptyReport(): ShiftReport {
  return { orders: 0, correct: 0, stars: 0, coins: 0, bestCombo: 0, tags: {}, reactions: {} };
}

export const flow = new GameFlow();
export type { Step };
