import { useState } from 'preact/hooks';
import { flow } from '../flow';
import type { Order } from '../flow';
import { MoleculeCard } from './MoleculeCard';
import { characterName } from '../art/characters';
import { spriteDataUrl } from '../art/textures';
import { stereoLabelText } from '../engine/stereo';
import { sfx } from '../audio/sfx';
import { save } from '../state';

export function RequestCard({ order }: { order: Order }) {
  const [show, setShow] = useState(false);
  const name = characterName(flow.customerKey.value);
  const stereoNote = order.target.stereo !== 'none' ? ` (${stereoLabelText(order.target.stereo).toLowerCase()})` : '';
  return (
    <div class="panel request">
      <div class="speech">
        <img class="avatar" src={spriteDataUrl(flow.customerKey.value, 0, 3)} alt="" />
        <div>
          <div class="speech-name">{name}</div>
          <div class="speech-text">
            Could you turn this into <b class="target-name">{order.target.name}</b>{stereoNote} for me?
            {order.target.altNames?.length ? <span class="muted small"> (also called {order.target.altNames.join(', ')})</span> : null}
          </div>
        </div>
      </div>
      <div class="order-mols">
        <MoleculeCard smiles={order.start.smiles} label="You get" sublabel={order.start.name} size="sm" />
        {show ? (
          <MoleculeCard smiles={order.target.smiles} label="Wanted" sublabel={order.target.name} size="sm" />
        ) : (
          <button class="molcard molcard-sm reveal" type="button" onClick={() => { sfx.click(); setShow(true); noteReveal(); }}>
            <span class="reveal-q">?</span>
            <span class="small">Show the structure</span>
          </button>
        )}
      </div>
      <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.acceptOrder(); }}>To the bench ▶</button>
    </div>
  );
}

function noteReveal(): void {
  const s = save.value;
  if (!s) return;
  s.stats.reveals = (s.stats.reveals ?? 0) + 1;
}
