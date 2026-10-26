import { flow } from '../flow';
import type { Order } from '../engine/order';
import { MoleculeCard } from './MoleculeCard';
import { getTag } from '../content/bank';
import { spriteDataUrl } from '../art/textures';
import { characterName } from '../art/characters';
import { stereoLabelText } from '../engine/grader';
import { sfx } from '../audio/sfx';

function Stars({ n }: { n: number }) {
  return (
    <span class="stars" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <img key={i} src={spriteDataUrl('star', i < n ? 0 : 1, 3)} alt="" />
      ))}
      <span class="sr-only">{n} of 3 stars</span>
    </span>
  );
}

export function ResultPanel({ order }: { order: Order }) {
  const o = flow.outcome.value!;
  return (
    <div class="panel result-panel is-success">
      <div class="speech">
        <img class="avatar" src={spriteDataUrl(flow.customerKey.value, 3, 3)} alt="" />
        <div>
          <div class="speech-name">{characterName(flow.customerKey.value)}</div>
          <div class="speech-text">{flow.randomTip()}</div>
        </div>
      </div>
      <div class="row space">
        <Stars n={o.stars} />
        <span class="chip">+{o.coins} coins</span>
        {flow.combo.value > 1 && <span class="chip chip-hot">combo ×{flow.combo.value}</span>}
      </div>
      <div class="score-bars">
        <ScoreRow label="Chemistry" value={o.hinted || o.retried ? 0.5 : 1} note={o.hinted ? 'hint used' : o.retried ? 'second try' : 'first try'} />
        <ScoreRow label="Technique" value={o.technique} />
        <ScoreRow label="Speed" value={Math.max(0, Math.min(1, 1 - Math.max(0, o.seconds - order.par) / order.par))} note={`${o.seconds}s`} />
      </div>
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
  const answer = order.item.answer!;
  const first = o.mistakes[0];
  return (
    <div class="panel result-panel is-fail">
      <div class="speech">
        <img class="avatar" src={spriteDataUrl('mentor', 2, 3)} alt="" />
        <div>
          <div class="speech-name">Prof. Capy (mentor)</div>
          <div class="speech-text">Let me fix that batch. Here's what should have happened.</div>
        </div>
      </div>
      <div class="mentor-route">
        <b>Route:</b> {flow.correctRouteText()}
        {o.playerRoute && o.stage === 'route' && (
          <div class="muted small">You ran: {flow.routeText(o.playerRoute)}</div>
        )}
      </div>
      <div class="order-mols">
        <MoleculeCard smiles={order.start.smiles} label="Start" size="sm" />
        <MoleculeCard
          smiles={answer.smiles}
          highlight={answer.highlightAtoms}
          label="Correct product"
          sublabel={answer.stereo !== 'none' ? stereoLabelText(answer.stereo) : undefined}
          size="sm"
        />
      </div>
      {o.pickedOption && !o.pickedOption.correct && (
        <div class="muted small picked-mol">You picked: <MoleculeCard smiles={o.pickedOption.smiles} size="sm" /></div>
      )}
      {o.pickedStereo && o.stage === 'stereo' && <div class="muted small">You said: {stereoLabelText(o.pickedStereo)}</div>}
      {first && (
        <div class="why-box">
          <div class="chip chip-tag">{getTag(first.tag).label}</div>
          <p>{first.why}</p>
          {getTag(first.tag).rule && first.why !== getTag(first.tag).rule && <p class="muted small">{getTag(first.tag).rule}</p>}
        </div>
      )}
      {o.mistakes.slice(1).map((m) => (
        <div class="why-box why-secondary" key={m.tag}>
          <div class="chip chip-tag">{getTag(m.tag).label}</div>
          <p class="small">{m.why}</p>
        </div>
      ))}
      <p class="muted small">{order.item.explanation}</p>
      <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.continueAfterResult(); }}>Next customer ▶</button>
    </div>
  );
}
