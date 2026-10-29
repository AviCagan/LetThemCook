import { save, screen } from '../state';
import { flow } from '../flow';
import { REACTIONS, playableReactions } from '../content/bank';
import { newRecord } from '../mastery/srs';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';
import { useState } from 'preact/hooks';
import { COURSE, daysUntil } from '../content/course';
import { REAGENTS, ITEMS } from '../content/bank';
import { UNLOCKS } from '../quiz';

export function Title() {
  const s = save.value!;
  const due = playableReactions(s.profile.chapters).filter((r) => {
    const rec = s.mastery.reactions[r.id] ?? newRecord();
    return rec.state === 'missed' || (rec.state !== 'new' && rec.dueAt <= Date.now());
  }).length;
  const examDate = s.profile.examDate;
  const exam = examDate ? COURSE.exams.find((e) => e.date === examDate) : undefined;
  const days = examDate ? daysUntil(examDate) : undefined;
  return (
    <div class="screen title">
      {examDate && days !== undefined && days >= 0 && (
        <div class="exam-banner">
          <b>{exam?.name ?? 'Exam'}</b> {days === 0 ? 'is today' : days === 1 ? 'is tomorrow' : `in ${days} days`}
          {exam?.topics ? ` · ${exam.topics}` : ''} · every reaction is reviewed at least once before it
        </div>
      )}
      <div class="title-art">
        <img src={spriteDataUrl('sci_frog', 0, 4)} alt="" />
        <img src={spriteDataUrl('player', 0, 4)} alt="" />
        <img src={spriteDataUrl('fx_flask', 3, 4)} alt="" />
        <img src={spriteDataUrl('sci_cat', 0, 4)} alt="" />
      </div>
      <h1>Beaker Buddies</h1>
      <p class="muted">Orgo II, one order at a time.</p>
      <div class="menu">
        <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.startShift('shift'); }}>
          Start a shift <span class="small">({s.profile.settings.shiftLength} customers)</span>
        </button>
        <button class="btn btn-big" type="button" onClick={() => { sfx.tap(); flow.startShift('clinic', { customers: 8 }); }}>
          Weakness clinic {due > 0 && <span class="chip chip-hot">{due} due</span>}
        </button>
        <button class="btn btn-big" type="button" onClick={() => { sfx.tap(); flow.startShift('synthesis', { customers: 6 }); }}>
          Synthesis shift <span class="small">(multi-step orders)</span>
        </button>
        <div class="row gap mode-row">
          <button class="btn btn-big" type="button" onClick={() => { sfx.tap(); flow.startShift('rush'); }}>
            <img class="icon" src={spriteDataUrl('ic_timer', 0, 2)} alt="" /> Rush hour <span class="small">({s.profile.settings.rushMinutes ?? 5} min)</span>
          </button>
          <button class="btn btn-big" type="button" onClick={() => { sfx.tap(); flow.startShift('exam'); }}>
            <img class="icon" src={spriteDataUrl('ic_exam', 0, 2)} alt="" /> Exam <span class="small">({s.profile.settings.examLength ?? 25} Qs{(s.profile.settings.examMinutes ?? 50) > 0 ? `, ${s.profile.settings.examMinutes ?? 50} min` : ''})</span>
          </button>
        </div>
        <button class="btn btn-big" type="button" onClick={() => { sfx.click(); screen.value = 'practice'; }}>Practice by reaction</button>
        <button class="btn" type="button" onClick={() => { sfx.click(); screen.value = 'shop'; }}><img class="icon" src={spriteDataUrl('ic_shop', 0, 2)} alt="" /> Lab shop <span class="small">({s.economy.coins} coins)</span></button>
        <button class="btn" type="button" onClick={() => { sfx.click(); screen.value = 'labbook'; }}>Lab book</button>
        <button class="btn" type="button" onClick={() => { sfx.click(); screen.value = 'notebook'; }}>Mastery notebook</button>
        <button class="btn" type="button" onClick={() => { sfx.click(); screen.value = 'settings'; }}>Settings · export / import</button>
      </div>
      <p class="muted small">{playableReactions(s.profile.chapters).length} reactions on the shelf · coins {s.economy.coins}</p>
      <UnlockProgress done={s.history.length} />
    </div>
  );
}

function UnlockProgress({ done }: { done: number }) {
  const next = UNLOCKS.find((u) => u.after > done);
  if (!next) return <p class="muted small">All order types unlocked.</p>;
  return <p class="muted small">Next order type, <b>{next.label}</b>, unlocks after {next.after - done} more order{next.after - done === 1 ? '' : 's'}.</p>;
}

export function Practice() {
  const s = save.value!;
  const [by, setBy] = useState<'reaction' | 'reagent'>('reaction');
  const [sel, setSel] = useState<string[]>([]);
  const [selR, setSelR] = useState<string[]>([]);
  const rows = REACTIONS.filter((r) => playableReactions(s.profile.chapters).some((p) => p.id === r.id));
  const toggle = (id: string) => setSel((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  const toggleR = (id: string) => setSelR((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  // reagent drill: every reaction that has an order whose route uses one of the chosen bottles
  const usedReagents = REAGENTS.filter((r) => ITEMS.some((q) => q.route.some((st) => st.reagent === r.id)));
  const reactionsForReagents = (ids: string[]) => rows.filter((r) => ITEMS.some((q) => q.reactionIds.includes(r.id) && q.route.some((st) => ids.includes(st.reagent)))).map((r) => r.id);
  return (
    <div class="screen practice">
      <div class="row space">
        <h2>Practice</h2>
        <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); screen.value = 'title'; }}>Close</button>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={by === 'reaction'} class={`tab ${by === 'reaction' ? 'is-active' : ''}`} type="button" onClick={() => setBy('reaction')}>By reaction</button>
        <button role="tab" aria-selected={by === 'reagent'} class={`tab ${by === 'reagent' ? 'is-active' : ''}`} type="button" onClick={() => setBy('reagent')}>By reagent</button>
      </div>
      {by === 'reagent' && (
        <>
          <div class="grid-list">
            {usedReagents.map((r) => {
              const rec = s.mastery.reagents[r.id];
              const acc = rec && rec.seen ? Math.round((100 * rec.right) / rec.seen) : null;
              return (
                <label key={r.id} class={`mastery-cell selectable ${selR.includes(r.id) ? 'is-selected' : ''}`}>
                  <input type="checkbox" checked={selR.includes(r.id)} onChange={() => toggleR(r.id)} />
                  <span class="cell-name">{r.label}</span>
                  <div class="small muted">{r.card.does}</div>
                  {acc !== null && <div class="small">{acc}% right over {rec!.seen} uses</div>}
                </label>
              );
            })}
          </div>
          <button class="btn btn-primary btn-big" type="button" disabled={selR.length === 0} onClick={() => { sfx.tap(); flow.startShift('practice', { only: reactionsForReagents(selR), reagents: selR, customers: Math.max(6, selR.length * 2) }); }}>
            Drill {selR.length || ''} reagent{selR.length === 1 ? '' : 's'} ▶
          </button>
        </>
      )}
      {by === 'reaction' && <>
      <div class="grid-list">
        {rows.map((r) => {
          const rec = s.mastery.reactions[r.id] ?? newRecord();
          return (
            <label key={r.id} class={`mastery-cell state-${rec.state} selectable ${sel.includes(r.id) ? 'is-selected' : ''}`}>
              <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
              <span class="cell-id">{r.id}</span> <span class="cell-name">{r.name}</span>
              <div class="small muted">{r.reagentsText}</div>
            </label>
          );
        })}
      </div>
      <button class="btn btn-primary btn-big" type="button" disabled={sel.length === 0} onClick={() => { sfx.tap(); flow.startShift('practice', { only: sel, customers: Math.max(6, sel.length * 2) }); }}>
        Drill {sel.length || ''} reaction{sel.length === 1 ? '' : 's'} ▶
      </button>
      </>}
    </div>
  );
}
