import { flow } from '../flow';
import { save, screen } from '../state';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';
import { useEffect, useState } from 'preact/hooks';

function Countdown() {
  const deadline = flow.deadline.value;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const left = Math.max(0, Math.round((deadline - now) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  return (
    <span class={`chip ${left <= 30 ? 'chip-hot' : ''}`} role="timer" aria-label="time left">
      <img class="icon" src={spriteDataUrl('ic_timer', 0, 2)} alt="" /> {left > 0 ? `${mm}:${ss}` : "time's up"}
    </span>
  );
}

export function Hud() {
  const s = save.value!;
  const phase = flow.phase.value;
  return (
    <div class="hud">
      <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); if (confirm('Leave this shift? Finished orders are saved.')) flow.abandonShift(); }} aria-label="Menu">☰</button>
      <span class="chip" title="Customer"><img class="icon icon-char" src={spriteDataUrl(flow.customerKey.value, 0, 2)} alt="customer" /> {flow.mode.value === 'rush' ? `#${flow.customerIndex.value + 1}` : `${Math.min(flow.customerIndex.value + 1, flow.customersTotal.value)}/${flow.customersTotal.value}`}</span>
      <Countdown />
      {flow.combo.value > 1 && <span class="chip chip-hot">×{flow.combo.value}</span>}
      <span class="chip"><img class="icon" src={spriteDataUrl('ic_coin', 0, 2)} alt="coins" /> {s.economy.coins}</span>
      <span class="spacer" />
      {(phase === 'bench' || phase === 'quiz') && (
        <button class="btn btn-sm btn-ghost" type="button" onClick={() => { if (confirm('Give up on this order? The mentor will show the route.')) flow.giveUp(); }}>Give up</button>
      )}
      <button class="btn btn-sm" type="button" aria-label="Lab book" onClick={() => { sfx.click(); screen.value = 'labbook'; }}><img class="icon" src={spriteDataUrl('ic_book', 0, 2)} alt="" /></button>
      <button class="btn btn-sm" type="button" aria-label="Notebook" onClick={() => { sfx.click(); screen.value = 'notebook'; }}><img class="icon" src={spriteDataUrl('ic_notepad', 0, 2)} alt="" /></button>
    </div>
  );
}
