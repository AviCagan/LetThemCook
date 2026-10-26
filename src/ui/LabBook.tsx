import { useState } from 'preact/hooks';
import { save, screen } from '../state';
import { flow, describeStep } from '../flow';
import { MoleculeCard } from './MoleculeCard';
import { getTag, ITEMS } from '../content/bank';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';

export function LabBook() {
  const s = save.value!;
  const [open, setOpen] = useState<number | null>(null);
  const entries = [...s.labBook].reverse();
  return (
    <div class="screen labbook">
      <div class="row space">
        <h2><img class="icon" src={spriteDataUrl('ic_book', 0, 2)} alt="" /> Lab book</h2>
        <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); screen.value = flow.order.value ? 'lab' : 'title'; }}>Close</button>
      </div>
      <p class="muted small">Every order you have run, step by step, with your notes. Newest first.</p>
      {entries.length === 0 && <p class="muted">Nothing yet. Run a shift and your work shows up here.</p>}
      {entries.map((e, i) => {
        const item = ITEMS.find((q) => q.id === e.item);
        const isOpen = open === i;
        return (
          <div class={`book-entry ${e.ok ? 'is-ok' : 'is-fail'}`} key={`${e.t}-${i}`}>
            <button class="book-head" type="button" onClick={() => setOpen(isOpen ? null : i)}>
              <span class="book-mark" aria-hidden="true">{e.ok ? '✓' : '✕'}</span>
              <span class="book-title">{e.startName} → <b>{e.targetName}</b></span>
              <span class="muted small">{new Date(e.t).toLocaleDateString()} · {e.steps.filter((x) => x.kind === 'step').length} steps · {'★'.repeat(e.stars)}{'☆'.repeat(3 - e.stars)}</span>
            </button>
            {isOpen && (
              <div class="book-body">
                <div class="order-mols">
                  <MoleculeCard smiles={e.startSmiles} label="Start" size="sm" />
                  <MoleculeCard smiles={e.targetSmiles} label="Target" size="sm" />
                </div>
                <ol class="book-steps">
                  {e.steps.map((st, j) => (
                    <li key={j} class={st.kind !== 'step' ? 'is-meta' : st.changed ? 'is-ok' : 'is-nope'}>
                      {st.kind === 'step' ? <b>{describeStep({ reagent: st.reagent, conditions: st.conditions })}</b> : null} <span class="small">{st.label}</span>
                      {st.kind === 'step' && st.changed && <div class="book-mol"><MoleculeCard smiles={st.after} size="sm" /></div>}
                    </li>
                  ))}
                </ol>
                {!e.ok && item && <p class="small"><b>Intended route:</b> {item.route.map((r, k) => `${k + 1}. ${describeStep(r)}`).join('; ')}</p>}
                {e.tags.length > 0 && <p class="small">{e.tags.map((t) => <span class="chip chip-tag" key={t}>{getTag(t).label}</span>)}</p>}
                {(s.notes[e.item] ?? e.note) && <div class="note-box small"><b>Your note:</b> {s.notes[e.item] ?? e.note}</div>}
                {item && <p class="muted small">{item.explanation}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
