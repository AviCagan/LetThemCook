import { flow, describeStep } from '../flow';
import type { Order } from '../flow';
import { MoleculeCard } from './MoleculeCard';
import { getTag } from '../content/bank';
import { spriteDataUrl } from '../art/textures';
import { characterName } from '../art/characters';
import { stereoLabelText } from '../engine/stereo';
import { sfx } from '../audio/sfx';
import { isQuizType } from '../quiz';
import type { RouteStep } from '../content/types';

const routeLine = (r: RouteStep[]) => r.map((st, i) => `${i + 1}. ${describeStep(st)}`).join('  ');

/** What the player answered on a quiz order, and the right answer. */
function QuizReview({ order }: { order: Order }) {
  const o = flow.outcome.value!;
  const q = order.quiz;
  if (!q) return null;
  if (q.kind === 'predict_product' || q.kind === 'what_start') {
    const picked = q.options.find((x) => x.smiles === o.picked);
    const right = q.options.find((x) => x.correct)!;
    return (
      <div class="order-mols">
        {picked && !picked.correct && <MoleculeCard smiles={picked.smiles} label="You picked" sublabel={picked.name} size="sm" dimmed={false} />}
        {picked && !picked.correct && q.kind === 'what_start' && picked.gives && <MoleculeCard smiles={picked.gives} label="…which would give" size="sm" />}
        <MoleculeCard smiles={right.smiles} label={q.kind === 'what_start' ? 'Started with' : 'Major product'} sublabel={right.name} size="sm" highlight={q.kind === 'predict_product' ? order.target.highlightAtoms : undefined} />
      </div>
    );
  }
  if (q.kind === 'spot_flaw') {
    return (
      <div class="route-review">
        {q.routes.map((r, i) => (
          <div key={i} class={`route-card ${r.works ? 'is-ok' : 'is-nope'}`}>
            <b>Route {'AB'[i]} {r.works ? '✓ works' : '✕ fails'}</b>
            <div class="small">{routeLine(r.route)}</div>
          </div>
        ))}
        <MoleculeCard smiles={q.flaw.gives} label="The failing route makes" size="sm" />
      </div>
    );
  }
  return (
    <div class="name-review">
      {o.picked && <p class="small">You wrote: <b>{o.picked}</b></p>}
      <p class="small">Accepted: {q.accepted.join(' · ')}</p>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span class="stars" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => <img key={i} src={spriteDataUrl('ic_star', i < n ? 0 : 1, 2)} alt="" />)}
    </span>
  );
}

export function ResultPanel({ order }: { order: Order }) {
  const o = flow.outcome.value!;
  const routeLen = order.item.route.length;
  const used = o.steps.filter((s) => s.kind === 'step' && s.changed).length;
  const quiz = isQuizType(order.type);
  return (
    <div class="panel result-panel is-success">
      <div class="speech">
        <img class="avatar" src={spriteDataUrl(flow.customerKey.value, 0, 3)} alt="" />
        <div>
          <div class="speech-name">{characterName(flow.customerKey.value)}</div>
          <div class="speech-text">{flow.randomTip()}</div>
        </div>
      </div>
      <div class="row space wrap">
        <Stars n={o.stars} />
        <span class="chip"><img class="icon" src={spriteDataUrl('ic_coin', 0, 2)} alt="" /> +{o.coins}</span>
        {flow.combo.value > 1 && <span class="chip chip-hot">combo ×{flow.combo.value}</span>}
        {o.bonus?.map((b) => <span key={b} class="chip chip-hot">{b}</span>)}
      </div>
      <div class="score-bars">
        {quiz ? (
          <ScoreRow label="Chemistry" value={o.hinted || o.partial ? 0.5 : 1} note={o.hinted ? 'hint used' : o.partial ? 'half credit' : 'clean'} />
        ) : (
          <>
            <ScoreRow label="Chemistry" value={o.hinted || o.wasted > 0 || used > routeLen ? 0.5 : 1} note={o.hinted ? 'hint used' : o.wasted > 0 ? `${o.wasted} detour${o.wasted > 1 ? 's' : ''}` : 'clean'} />
            <ScoreRow label="Technique" value={Math.max(0, 1 - 0.15 * o.wasted)} note={`${used} step${used === 1 ? '' : 's'} (route: ${routeLen})`} />
          </>
        )}
        <ScoreRow label="Speed" value={Math.max(0, Math.min(1, 1 - Math.max(0, o.seconds - order.par) / order.par))} note={`${o.seconds}s`} />
      </div>
      {quiz ? (
        <>
          <QuizReview order={order} />
          {o.mistakes[0] && <div class="why-box why-secondary"><div class="chip chip-tag">{getTag(o.mistakes[0].tag).label}</div><p class="small">{o.mistakes[0].why}</p></div>}
        </>
      ) : (
        <>
          <div class="order-mols">
            <MoleculeCard smiles={order.target.smiles} highlight={order.target.highlightAtoms} label={order.target.name} sublabel={order.target.stereo !== 'none' ? stereoLabelText(order.target.stereo) : undefined} size="sm" />
          </div>
          <p class="small"><b>Your route:</b> {o.steps.filter((s) => s.kind === 'step' && s.changed).map((s) => describeStep({ reagent: s.reagentId, conditions: s.conditions })).join(' → ')}</p>
        </>
      )}
      <p class="muted small">{order.item.explanation}</p>
      <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.continueAfterResult(); }}>Next customer ▶</button>
    </div>
  );
}

function ScoreRow({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div class="score-row">
      <span class="score-label">{label}</span>
      <span class="bar"><span class="bar-fill" style={{ width: `${Math.round(value * 100)}%` }} /></span>
      <span class="score-note">{note ?? `${Math.round(value * 100)}%`}</span>
    </div>
  );
}

export function MentorPanel({ order }: { order: Order }) {
  const o = flow.outcome.value!;
  const first = o.mistakes[0];
  const quiz = isQuizType(order.type);
  return (
    <div class="panel result-panel is-fail">
      <div class="speech">
        <img class="avatar" src={spriteDataUrl('mentor', 0, 3)} alt="" />
        <div>
          <div class="speech-name">Prof. Capy (mentor)</div>
          <div class="speech-text">{o.stage === 'gaveup' ? "No shame in asking. Here's how I'd do it." : o.stage === 'quiz' ? "Not that one. Here's the answer and why." : o.stage === 'stereo' ? 'Right molecule, wrong label. Let me show you.' : "Let me fix that batch. Here's what should have happened."}</div>
        </div>
      </div>
      {order.item.route.length > 0 && <div class="mentor-route"><b>Route:</b> {flow.routeText()}</div>}
      {quiz ? (
        <QuizReview order={order} />
      ) : (
        <div class="order-mols">
          <MoleculeCard smiles={order.start.smiles} label="Start" size="sm" />
          <MoleculeCard smiles={order.target.smiles} highlight={order.target.highlightAtoms} label={order.target.name} sublabel={order.target.stereo !== 'none' ? stereoLabelText(order.target.stereo) : undefined} size="sm" />
        </div>
      )}
      {o.stage === 'handover' && (
        <div class="picked-mol"><div class="muted small">You handed over:</div><MoleculeCard smiles={o.finalFlask} size="sm" /></div>
      )}
      {o.pickedStereo && o.stage === 'stereo' && <div class="muted small">You said: {stereoLabelText(o.pickedStereo)}</div>}
      {first && (
        <div class="why-box">
          <div class="chip chip-tag">{getTag(first.tag).label}</div>
          <p>{first.why}</p>
          {getTag(first.tag).rule && first.why !== getTag(first.tag).rule && <p class="muted small">{getTag(first.tag).rule}</p>}
        </div>
      )}
      {o.mistakes.slice(1, 3).map((m) => (
        <div class="why-box why-secondary" key={m.tag}>
          <div class="chip chip-tag">{getTag(m.tag).label}</div>
          <p class="small">{m.why}</p>
        </div>
      ))}
      {o.steps.some((s) => s.kind === 'step') && (
        <p class="small"><b>What you did:</b> {o.steps.filter((s) => s.kind === 'step').map((s) => `${describeStep({ reagent: s.reagentId, conditions: s.conditions })}${s.changed ? '' : ' (no reaction)'}`).join(' → ')}</p>
      )}
      <p class="muted small">{order.item.explanation}</p>
      <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.continueAfterResult(); }}>Next customer ▶</button>
    </div>
  );
}
