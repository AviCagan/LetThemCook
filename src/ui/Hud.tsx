import { flow } from '../flow';
import { save, screen } from '../state';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';

export function Hud() {
  const s = save.value!;
  const phase = flow.phase.value;
  const canHint = s.profile.settings.hintsEnabled && (phase === 'shelf' || phase === 'picker' || phase === 'stereo') && !flow.hintText.value;
  return (
    <div class="hud">
      <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); if (confirm('Leave this shift? Progress on finished orders is saved.')) flow.abandonShift(); }} aria-label="Menu">☰</button>
      <span class="chip">Customer {Math.min(flow.customerIndex.value + 1, flow.customersTotal.value)}/{flow.customersTotal.value}</span>
      {flow.combo.value > 1 && <span class="chip chip-hot">×{flow.combo.value}</span>}
      <span class="chip"><img class="icon" src={spriteDataUrl('coin', 0, 2)} alt="coins" /> {s.economy.coins}</span>
      <span class="spacer" />
      {canHint && (
        <button class="btn btn-sm btn-hint" type="button" onClick={() => flow.askMentor()}>Ask the mentor (−½ star)</button>
      )}
      <button class="btn btn-sm" type="button" aria-label="Lab notebook" onClick={() => { sfx.click(); screen.value = 'notebook'; }}>📓</button>
    </div>
  );
}
