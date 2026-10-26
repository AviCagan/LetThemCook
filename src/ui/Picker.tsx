import { flow } from '../flow';
import type { Order } from '../engine/order';
import { MoleculeCard } from './MoleculeCard';
import { stereoLabelText } from '../engine/grader';
import type { StereoLabel } from '../content/types';
import { sfx } from '../audio/sfx';

export function ProductPicker({ order }: { order: Order }) {
  const locked = flow.pickerLocked.value;
  return (
    <div class="panel picker">
      <div class="panel-title">What did you make? Pick the major product.</div>
      <div class="options">
        {order.options.map((o, i) => (
          <MoleculeCard
            key={o.id}
            smiles={o.smiles}
            size="sm"
            badge={String.fromCharCode(65 + i)}
            dimmed={locked.includes(o.id)}
            onClick={() => {
              if (locked.includes(o.id)) return;
              sfx.tap();
              flow.pickProduct(o);
            }}
          />
        ))}
      </div>
    </div>
  );
}

const STEREO_HELP: Record<StereoLabel, string> = {
  none: 'no stereocenters or geometry to report',
  single_enantiomer: 'one enantiomer only',
  racemic: 'both enantiomers, 1:1',
  meso: 'achiral despite stereocenters (internal mirror plane)',
  cis: 'same side',
  trans: 'opposite sides',
  syn: 'added to the same face',
  anti: 'added to opposite faces',
};

export function StereoPicker({ order }: { order: Order }) {
  const choices = order.stereoChoices ?? [];
  return (
    <div class="panel picker">
      <div class="panel-title">Right molecule! What's in the flask, stereo-wise?</div>
      <div class="stereo-options">
        {choices.map((c) => (
          <button key={c} class="btn btn-option" type="button" onClick={() => { sfx.tap(); flow.pickStereo(c); }}>
            <b>{stereoLabelText(c)}</b>
            <span class="muted small">{STEREO_HELP[c]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
