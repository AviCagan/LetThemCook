import { useState } from 'preact/hooks';
import { save, screen } from '../state';
import { REAGENTS, getReaction, getTag, itemsForReaction, playableReactions, REACTIONS } from '../content/bank';
import { accuracy, newRecord, reagentState, type MasteryState } from '../mastery/srs';
import { accuracyByDay, bestStreak, currentStreak, overallAccuracy, topTags } from '../mastery/stats';
import { flow } from '../flow';
import { sfx } from '../audio/sfx';

const STATE_LABEL: Record<MasteryState, string> = { new: 'New', missed: 'Missed', shaky: 'Shaky', solid: 'Solid' };
const STATE_ICON: Record<MasteryState, string> = { new: '·', missed: '✕', shaky: '~', solid: '✓' };

function dueText(dueAt: number, state: MasteryState): string {
  if (state === 'new') return 'not seen yet';
  const d = Math.ceil((dueAt - Date.now()) / 86400000);
  if (d <= 0) return 'due now';
  return d === 1 ? 'due tomorrow' : `due in ${d} d`;
}

export function Notebook() {
  const s = save.value!;
  const [tab, setTab] = useState<'reactions' | 'reagents' | 'mistakes' | 'stats'>('reactions');
  const playable = new Set(playableReactions(s.profile.chapters).map((r) => r.id));
  const recs = s.mastery.reactions;
  const tags = topTags(s.history, 5);
  const due = REACTIONS.filter((r) => playable.has(r.id)).sort((a, b) => {
    const ra = recs[a.id] ?? newRecord();
    const rb = recs[b.id] ?? newRecord();
    const pa = ra.state === 'missed' ? 0 : ra.state === 'shaky' ? 1 : ra.state === 'new' ? 2 : 3;
    const pb = rb.state === 'missed' ? 0 : rb.state === 'shaky' ? 1 : rb.state === 'new' ? 2 : 3;
    return pa - pb || ra.dueAt - rb.dueAt;
  });
  const practiceNext = due.slice(0, 3).map((r) => r.id);

  return (
    <div class="screen notebook">
      <div class="row space">
        <h2>Lab notebook</h2>
        <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); screen.value = flow.order.value ? 'lab' : 'title'; }}>Close</button>
      </div>
      <div class="tabs" role="tablist">
        {(['reactions', 'reagents', 'mistakes', 'stats'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} class={`tab ${tab === t ? 'is-active' : ''}`} type="button" onClick={() => setTab(t)}>
            {t === 'reactions' ? 'Reactions' : t === 'reagents' ? 'Reagent cards' : t === 'mistakes' ? 'Mistake tags' : 'Stats'}
          </button>
        ))}
      </div>
      <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.startShift('practice', { only: practiceNext, customers: 6 }); }}>
        Practice this next ▶ <span class="small">({practiceNext.map((id) => getReaction(id).name).join(', ')})</span>
      </button>

      {tab === 'reactions' && (
        <div class="grid-list">
          {REACTIONS.map((r) => {
            const rec = recs[r.id] ?? newRecord();
            const items = itemsForReaction(r.id).length;
            const enabled = playable.has(r.id);
            return (
              <div key={r.id} class={`mastery-cell state-${rec.state} ${enabled ? '' : 'is-off'}`}>
                <div class="cell-head">
                  <span class="cell-id">{r.id}</span>
                  <span class="cell-state"><span aria-hidden="true">{STATE_ICON[rec.state]}</span> {STATE_LABEL[rec.state]}</span>
                </div>
                <div class="cell-name">{r.name}</div>
                <div class="cell-meta small muted">
                  {items === 0 ? 'coming in phase 2' : !enabled ? `chapter ${r.chapter} off` : `${rec.correct}/${rec.seen} · ${dueText(rec.dueAt, rec.state)}`}
                </div>
                {enabled && items > 0 && (
                  <button class="btn btn-xs" type="button" onClick={() => { sfx.tap(); flow.startShift('practice', { only: [r.id], customers: 6 }); }}>Drill</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'reagents' && (
        <div class="grid-list">
          {REAGENTS.filter((r) => r.kind !== 'decoy').map((r) => {
            const rec = s.mastery.reagents[r.id];
            const st = reagentState(rec);
            return (
              <div key={r.id} class={`mastery-cell state-${st}`}>
                <div class="cell-head"><span class="cell-id">{r.label}</span><span class="cell-state"><span aria-hidden="true">{STATE_ICON[st]}</span> {STATE_LABEL[st]}</span></div>
                <div class="cell-meta small">{r.card.does}</div>
                {rec && <div class="small muted">{rec.right}/{rec.seen} right</div>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'mistakes' && (
        <div>
          {tags.length === 0 && <p class="muted">No mistakes logged yet. Go make some, that is the point.</p>}
          {tags.map((t) => (
            <div key={t.tag} class="tag-row">
              <div class="row space"><span class="chip chip-tag">{getTag(t.tag).label}</span><span class="muted small">×{t.count}</span></div>
              <p class="small">{getTag(t.tag).rule}</p>
              <p class="small muted">Examples: {t.examples.map((e) => `${getReaction(e.reaction).name} (${e.item})`).join('; ')}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'stats' && (
        <div>
          <div class="report-grid">
            <div class="stat"><div class="stat-num">{s.history.length}</div><div class="stat-label">orders</div></div>
            <div class="stat"><div class="stat-num">{Math.round(overallAccuracy(s.history) * 100)}%</div><div class="stat-label">accuracy</div></div>
            <div class="stat"><div class="stat-num">{currentStreak(s.history)}</div><div class="stat-label">streak</div></div>
            <div class="stat"><div class="stat-num">{Math.max(bestStreak(s.history), s.stats.bestStreak)}</div><div class="stat-label">best streak</div></div>
            <div class="stat"><div class="stat-num">{s.stats.shiftsPlayed}</div><div class="stat-label">shifts</div></div>
          </div>
          <h3>Accuracy by day</h3>
          <div class="daybars">
            {accuracyByDay(s.history).map((d) => (
              <div key={d.day} class="daybar" title={`${d.day}: ${d.correct}/${d.orders}`}>
                <div class="daybar-fill" style={{ height: `${d.orders ? Math.round((100 * d.correct) / d.orders) : 0}%` }} />
                <div class="daybar-label">{d.day.slice(5)}</div>
                <div class="daybar-num">{d.orders ? Math.round((100 * d.correct) / d.orders) : 0}%</div>
              </div>
            ))}
            {accuracyByDay(s.history).length === 0 && <p class="muted">Play a shift to see your history.</p>}
          </div>
          <h3>Reactions by accuracy</h3>
          <ul class="plain small">
            {REACTIONS.filter((r) => (recs[r.id]?.seen ?? 0) > 0)
              .sort((a, b) => accuracy(recs[a.id]) - accuracy(recs[b.id]))
              .map((r) => (
                <li key={r.id}>{r.id} {r.name}: {Math.round(accuracy(recs[r.id]) * 100)}% ({recs[r.id].seen} seen)</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
