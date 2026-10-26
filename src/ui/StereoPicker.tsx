import { flow } from '../flow';
import type { Order } from '../flow';
import { stereoLabelText, STEREO_HELP } from '../engine/stereo';
import { sfx } from '../audio/sfx';

export function StereoPicker({ order }: { order: Order }) {
  const choices = order.stereoChoices ?? [];
  const hint = flow.hintText.value;
  return (
    <div class="panel picker">
      <div class="panel-title">Right molecule! What's in the flask, stereo-wise?</div>
      {hint && <div class="hint-box small"><b>Mentor:</b> {hint}</div>}
      <div class="stereo-options">
        {choices.map((c) => (
          <button key={c} class="btn btn-option" type="button" onClick={() => { sfx.tap(); flow.pickStereo(c); }}>
            <b>{stereoLabelText(c)}</b>
            <span class="muted small">{STEREO_HELP[c]}</span>
          </button>
        ))}
      </div>
      <button class="btn btn-sm btn-hint" type="button" onClick={() => void flow.askMentor()}>? Help</button>
    </div>
  );
}
