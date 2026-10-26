import { useState } from 'preact/hooks';
import type { Reagent, Route } from '../content/types';
import { getReagent } from '../content/bank';
import { flow } from '../flow';
import { Bottle } from './Bottle';
import { sfx } from '../audio/sfx';

export function Shelf({ shelf }: { shelf: Reagent[] }) {
  const route = flow.playerRoute.value;
  const [info, setInfo] = useState<Reagent | null>(null);
  const [wobble, setWobble] = useState<string | null>(null);
  const maxSteps = 4;

  const add = (r: Reagent) => {
    if (route.length >= maxSteps) return;
    sfx.pick();
    setWobble(r.id);
    setTimeout(() => setWobble(null), 300);
    flow.setRoute([...route, { reagents: [r.id] }]);
  };
  const remove = (i: number) => {
    sfx.click();
    flow.setRoute(route.filter((_, j) => j !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= route.length) return;
    const next: Route = route.slice();
    [next[i], next[j]] = [next[j], next[i]];
    flow.setRoute(next);
  };

  return (
    <div class="shelf-panel">
      <div class="steps">
        <div class="steps-title">Recipe (order matters)</div>
        {Array.from({ length: Math.max(2, Math.min(maxSteps, route.length + 1)) }).map((_, i) => {
          const step = route[i];
          return (
            <div class={`step-slot ${step ? 'is-filled' : ''}`} key={i}>
              <span class="step-num">{i + 1}.</span>
              {step ? (
                <>
                  <span class="step-label">{step.reagents.map((id) => getReagent(id).label).join(' + ')}</span>
                  <span class="step-actions">
                    <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === route.length - 1}>↓</button>
                    <button type="button" aria-label="Remove" onClick={() => remove(i)}>✕</button>
                  </span>
                </>
              ) : (
                <span class="step-empty">tap a bottle</span>
              )}
            </div>
          );
        })}
      </div>
      <div class="shelf-board" role="list" aria-label="Reagent shelf">
        {shelf.map((r) => (
          <Bottle key={r.id} reagent={r} onClick={() => add(r)} onInfo={() => setInfo(r)} wobble={wobble === r.id} />
        ))}
      </div>
      <div class="row gap">
        <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.submitRoute(); }} disabled={route.length === 0}>
          Run the steps ▶
        </button>
        <button class="btn btn-ghost" type="button" onClick={() => flow.setRoute([])} disabled={route.length === 0}>Clear</button>
      </div>
      {info && (
        <div class="modal-backdrop" onClick={() => setInfo(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{info.label}</h3>
            <p class="muted">{info.name}</p>
            <p><b>Does:</b> {info.card.does}</p>
            {info.card.doesNot && <p><b>Doesn't:</b> {info.card.doesNot}</p>}
            <button class="btn btn-primary" type="button" onClick={() => setInfo(null)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
