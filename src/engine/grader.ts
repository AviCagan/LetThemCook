// Pure grading logic. No DOM, no Phaser, no RDKit: options are compared by identity, routes by bottle ids.
import type { QuestionItem, Reaction, Route, StereoLabel } from '../content/types';
import { getReagent, getTag } from '../content/bank';
import { bottleSet, jaccard, routeMatches, sameBottlesAnyOrder, stepKey } from './route';

export interface Mistake {
  tag: string;
  why: string;
}

export interface RouteGrade {
  correct: boolean;
  mistakes: Mistake[];
  matched?: Route;
}

export interface ProductGrade {
  correct: boolean;
  mistakes: Mistake[];
}

function allCorrectRoutes(item: QuestionItem, reaction: Reaction): Route[] {
  const routes: Route[] = [];
  if (item.route) routes.push(item.route.steps, ...(item.route.alt ?? []));
  if (reaction.altRoutes) routes.push(...reaction.altRoutes);
  return routes;
}

function isWorkupStep(stepReagents: string[]): boolean {
  return stepReagents.every((id) => getReagent(id).kind === 'workup');
}

/** Grade a player's route (bottles in order + conditions chosen in the minigames). */
export function gradeRoute(item: QuestionItem, reaction: Reaction, player: Route): RouteGrade {
  if (player.length === 0) {
    return { correct: false, mistakes: [{ tag: 'reagent_label_unknown', why: 'No reagents were added. Start by picking the bottle that does the job.' }] };
  }
  const candidates = allCorrectRoutes(item, reaction);
  for (const route of candidates) {
    if (routeMatches(route, player, true)) return { correct: true, mistakes: [], matched: route };
  }
  const mistakes: Mistake[] = [];

  // 1. exact match with an authored flawed route (conditions only where the distractor specifies them)
  for (const rd of item.routeDistractors ?? []) {
    if (routeMatches(rd.steps, player, true)) {
      return { correct: false, mistakes: [{ tag: rd.tag, why: rd.why }] };
    }
  }

  const primary = item.route?.steps ?? reaction.steps;

  // 2. right bottles, workup forgotten
  const withoutWorkup = primary.filter((s) => !isWorkupStep(s.reagents));
  if (withoutWorkup.length < primary.length && routeMatches(withoutWorkup, player, false)) {
    const missing = primary.filter((s) => isWorkupStep(s.reagents)).map((s) => s.reagents.map((id) => getReagent(id).label).join('/'));
    return {
      correct: false,
      mistakes: [{ tag: 'missing_workup', why: `The ${missing.join(' or ')} step is missing. ${getTag('missing_workup').rule}` }],
    };
  }

  // 3. right bottles, wrong order
  for (const route of candidates) {
    if (!routeMatches(route, player, false) && sameBottlesAnyOrder(route, player)) {
      return { correct: false, mistakes: [{ tag: 'wrong_reagent_order', why: getTag('wrong_reagent_order').rule }] };
    }
  }

  // 4. right bottles and order, wrong conditions
  for (const route of candidates) {
    if (routeMatches(route, player, false)) {
      const bad = route
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) => !routeMatches([s], [player[i]], true))
        .map(({ i }) => i + 1);
      return {
        correct: false,
        mistakes: [{ tag: 'wrong_temperature', why: `Step ${bad.join(' and ')} was run under the wrong conditions. ${getTag('wrong_temperature').rule}` }],
      };
    }
  }

  // 5. closest authored flawed route by bottle overlap, else "did not recognise the tool"
  const playerBottles = bottleSet(player);
  let best: { score: number; tag: string; why: string } | undefined;
  for (const rd of item.routeDistractors ?? []) {
    const score = jaccard(bottleSet(rd.steps), playerBottles);
    if (score > 0 && (!best || score > best.score)) best = { score, tag: rd.tag, why: rd.why };
  }
  if (best && best.score >= 0.5) {
    mistakes.push({ tag: best.tag, why: best.why });
  } else {
    const wrong = [...playerBottles].filter((id) => !primary.some((s) => s.reagents.includes(id)));
    const names = wrong.map((id) => getReagent(id).label).join(', ');
    mistakes.push({
      tag: 'reagent_label_unknown',
      why: names
        ? `${names} ${wrong.length > 1 ? 'do' : 'does'} not do this job. ${reaction.rules.summary}`
        : `The bottles are right but the recipe is not. ${reaction.rules.summary}`,
    });
    // a decoy with a known trap text adds a second, more specific hint
    for (const id of wrong) {
      const trap = getReagent(id).card.trap;
      if (trap) mistakes.push({ tag: decoyTag(id), why: trap });
    }
  }
  return { correct: false, mistakes };
}

function decoyTag(reagentId: string): string {
  const map: Record<string, string> = {
    O3: 'ozone_vs_osmium',
    HNO3_H2SO4: 'nitrite_vs_nitric',
    AlCl3: 'lewis_acid_as_base',
    KMnO4: 'reagent_label_unknown',
    tBuBr: 'williamson_E2',
  };
  return map[reagentId] ?? 'reagent_label_unknown';
}

/** Grade the picked product option. `optionTag` is undefined when the correct option was picked. */
export function gradeProduct(
  item: QuestionItem,
  picked: { correct: boolean; tag?: string; why?: string },
  stereoPick?: StereoLabel,
): ProductGrade {
  const mistakes: Mistake[] = [];
  if (!picked.correct) {
    mistakes.push({ tag: picked.tag ?? 'reagent_label_unknown', why: picked.why ?? item.explanation });
    return { correct: false, mistakes };
  }
  const expected = item.answer?.stereo ?? 'none';
  if (expected !== 'none' && stereoPick !== undefined && stereoPick !== expected) {
    if (stereoPick === 'none') {
      mistakes.push({ tag: 'missing_stereo', why: getTag('missing_stereo').rule });
    } else {
      mistakes.push({ tag: 'meso_vs_racemic', why: `${stereoLabelText(expected)} was the right call here. ${getTag('meso_vs_racemic').rule}` });
    }
    return { correct: false, mistakes };
  }
  return { correct: true, mistakes };
}

export function stereoLabelText(s: StereoLabel): string {
  return (
    {
      none: 'No stereochemistry to report',
      single_enantiomer: 'Single enantiomer',
      racemic: 'Racemic',
      meso: 'Meso',
      cis: 'cis',
      trans: 'trans',
      syn: 'syn',
      anti: 'anti',
    } as Record<StereoLabel, string>
  )[s];
}

export { stepKey };
