import { flow } from '../flow';
import { save, screen } from '../state';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';

export function Hud() {
  const s = save.value!;
  const phase = flow.phase.value;
  return (
    <div class="hud">
      <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); if (confirm('Leave this shift? Finished orders are saved.')) flow.abandonShift(); }} aria-label="Menu">☰</button>
      <span class="chip" title="Customer"><img class="icon icon-char" src={spriteDataUrl(flow.customerKey.value, 0, 2)} alt="customer" /> {Math.min(flow.customerIndex.value + 1, flow.customersTotal.value)}/{flow.customersTotal.value}</span>
      {flow.combo.value > 1 && <span class="chip chip-hot">×{flow.combo.value}</span>}
      <span class="chip"><img class="icon" src={spriteDataUrl('ic_coin', 0, 2)} alt="coins" /> {s.economy.coins}</span>
      <span class="spacer" />
      {phase === 'bench' && (
        <button class="btn btn-sm btn-ghost" type="button" onClick={() => { if (confirm('Give up on this order? The mentor will show the route.')) flow.giveUp(); }}>Give up</button>
      )}
      <button class="btn btn-sm" type="button" aria-label="Lab book" onClick={() => { sfx.click(); screen.value = 'labbook'; }}><img class="icon" src={spriteDataUrl('ic_book', 0, 2)} alt="" /></button>
      <button class="btn btn-sm" type="button" aria-label="Notebook" onClick={() => { sfx.click(); screen.value = 'notebook'; }}><img class="icon" src={spriteDataUrl('ic_notepad', 0, 2)} alt="" /></button>
    </div>
  );
}
