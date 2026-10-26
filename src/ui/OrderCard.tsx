import { flow } from '../flow';
import type { Order } from '../engine/order';
import { MoleculeCard } from './MoleculeCard';
import { orderTypeLabel } from '../content/bank';
import { characterName } from '../art/characters';
import { spriteDataUrl } from '../art/textures';
import { stereoLabelText } from '../engine/grader';
import { sfx } from '../audio/sfx';

export function OrderCard({ order }: { order: Order }) {
  const name = characterName(flow.customerKey.value);
  const stereoNote = order.target && order.target.stereo && order.target.stereo !== 'none' ? ` (${stereoLabelText(order.target.stereo)})` : '';
  return (
    <div class="panel order-card">
      <div class="speech">
        <img class="avatar" src={spriteDataUrl(flow.customerKey.value, 3, 3)} alt="" />
        <div>
          <div class="speech-name">{name}</div>
          <div class="speech-text">
            {order.type === 'make_it'
              ? `Could you turn this into the product on my card${stereoNote}? Pick the reagents from the shelf, in order.`
              : `I ran these steps on this. What did I make?`}
          </div>
        </div>
      </div>
      <div class="order-mols">
        <MoleculeCard smiles={order.start.smiles} label="Starting material" sublabel={order.start.name} size="sm" />
        {order.target && <MoleculeCard smiles={order.target.smiles} label="Wanted" sublabel={order.target.name} size="sm" />}
      </div>
      {order.givenRoute && (
        <div class="route-box">
          <b>Steps:</b> {flow.routeText(order.givenRoute)}
        </div>
      )}
      <div class="row space">
        <span class="chip">{orderTypeLabel(order.type)}</span>
        <span class="chip chip-muted">{order.reaction.name}</span>
      </div>
      <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.acceptOrder(); }}>
        {order.type === 'make_it' ? 'To the shelf ▶' : 'Run the steps ▶'}
      </button>
    </div>
  );
}
