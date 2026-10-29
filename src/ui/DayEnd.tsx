import { flow } from '../flow';
import { screen } from '../state';
import { getReaction, getTag } from '../content/bank';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';

export function DayEnd() {
  const r = flow.shiftReport.value!;
  const acc = r.orders ? Math.round((100 * r.correct) / r.orders) : 0;
  const tags = Object.entries(r.tags).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const weak = Object.entries(r.reactions).filter(([, v]) => v.ok < v.total).map(([id]) => id);
  const mm = (n?: number) => (n === undefined ? '' : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`);
  const title = r.mode === 'exam' ? 'Exam results' : r.mode === 'rush' ? 'Rush hour results' : 'Shift report card';
  return (
    <div class="panel dayend">
      <h2>{title}</h2>
      {r.mode === 'exam' && (
        <p class="exam-score"><b>{acc}%</b> correct on {r.orders} question{r.orders === 1 ? '' : 's'} in {mm(r.seconds)}{r.timeUp ? ' (time ran out)' : ''}.</p>
      )}
      {r.mode === 'rush' && <p class="exam-score"><b>{r.correct}</b> right in {mm(r.seconds)}.</p>}
      {r.unlocked?.length ? <p class="small">Unlocked: {r.unlocked.map((u) => <span key={u} class="chip chip-hot">{u}</span>)}</p> : null}
      <div class="report-grid">
        <div class="stat"><div class="stat-num">{r.orders}</div><div class="stat-label">orders</div></div>
        <div class="stat"><div class="stat-num">{acc}%</div><div class="stat-label">correct</div></div>
        <div class="stat"><div class="stat-num"><img class="icon" src={spriteDataUrl('ic_star', 0, 2)} alt="" /> {r.stars}</div><div class="stat-label">stars</div></div>
        <div class="stat"><div class="stat-num"><img class="icon" src={spriteDataUrl('ic_coin', 0, 2)} alt="" /> {r.coins}</div><div class="stat-label">coins</div></div>
        <div class="stat"><div class="stat-num">×{r.bestCombo}</div><div class="stat-label">best combo</div></div>
      </div>
      {tags.length > 0 && (
        <div>
          <h3>Mistake tags today</h3>
          <ul class="plain">
            {tags.map(([t, n]) => (
              <li key={t}><span class="chip chip-tag">{getTag(t).label}</span> ×{n}</li>
            ))}
          </ul>
        </div>
      )}
      {weak.length > 0 && (
        <div>
          <h3>Coming back soon</h3>
          <p class="small">{weak.map((id) => getReaction(id).name).join(' · ')}</p>
        </div>
      )}
      <div class="row gap">
        <button class="btn btn-primary btn-big" type="button" onClick={() => { sfx.tap(); flow.startShift(r.mode === 'exam' || r.mode === 'rush' ? r.mode : 'shift'); }}>{r.mode === 'exam' ? 'Another exam ▶' : r.mode === 'rush' ? 'Again ▶' : 'Another shift ▶'}</button>
        <button class="btn" type="button" onClick={() => { sfx.click(); screen.value = 'labbook'; }}>Lab book</button>
        <button class="btn" type="button" onClick={() => { sfx.click(); screen.value = 'notebook'; }}>Mastery</button>
        <button class="btn btn-ghost" type="button" onClick={() => { sfx.click(); flow.abandonShift(); }}>Home</button>
      </div>
    </div>
  );
}
