import { useState } from 'preact/hooks';
import { flow, describeStep } from '../flow';
import type { Order } from '../flow';
import { MoleculeCard } from './MoleculeCard';
import { REAGENTS } from '../content/bank';
import type { Conditions, Reagent, TempPreset } from '../content/types';
import { spriteDataUrl } from '../art/textures';
import { sfx } from '../audio/sfx';
import { save } from '../state';
import { stereoLabelText } from '../engine/stereo';

const TEMP_LABEL: Record<TempPreset, string> = { ice: 'ice 0–5 °C', rt: 'room temp', reflux: 'heat', c140: '140 °C', c180: '180 °C' };
const SHELF_TABS: { id: string; label: string; filter: (r: Reagent) => boolean }[] = [
  { id: 'all', label: 'All', filter: () => true },
  { id: 'redox', label: 'Reduce / oxidise', filter: (r) => ['NaBH4', 'LiAlH4', 'H2_Pt', 'Zn_Hg_HCl', 'H2NNH2_KOH', 'PCC', 'H2CrO4', 'HIO4', 'OsO4', 'BH3_THF', 'H2O2_NaOH', 'mCPBA', 'H2O2', 'NaIO4', 'I2', 'NBS', 'O3', 'KMnO4', 'Swern', 'PDC', 'Sharpless'].includes(r.id) },
  { id: 'acids', label: 'Acids & halogens', filter: (r) => ['HBr', 'HI', 'HCl', 'HCl_ZnCl2', 'SOCl2', 'PBr3', 'H2SO4_heat', 'HNO3_dil', 'HNO3_H2SO4', 'NaNO2_H2SO4', 'Br2_H2O', 'Br2_CHCl3', 'H2SO4_H2O'].includes(r.id) },
  { id: 'bases', label: 'Bases & metals', filter: (r) => ['NaOH', 'NaHCO3', 'K2CO3', 'NaH', 'Na', 'AlCl3', 'Mg_ether', 'CO2'].includes(r.id) },
  { id: 'partners', label: 'Partners', filter: (r) => ['CH3I', 'EtBr', 'nPrBr', 'BnBr', 'AllylBr', 'iPrBr', 'tBuBr', 'HCHO', 'CH3CHO', 'PhCHO', 'acetone', 'cyclohexanone', 'ethylene_oxide', 'AcCl_pyr', 'BzCl_pyr', 'Ac2O', 'AcOH_H2SO4', 'MeOH_H2SO4', 'EtOH_H2SO4', 'AcCl_AlCl3', 'TsCl_pyr'].includes(r.id) },
  { id: 'nucs', label: 'Nucleophiles', filter: (r) => ['NaOMe', 'NaOEt', 'NaCN', 'NaN3', 'NH3', 'NaSH', 'NaSMe', 'KF_crown', 'KCN_crown', 'KOAc_crown', 'MeMgBr', 'PhMgBr'].includes(r.id) },
  { id: 'workup', label: 'Workup', filter: (r) => r.kind === 'workup' || r.id === 'H3O_plus' },
];
const BOTTLE_ICON: Record<string, string> = { H2_Pt: 'ic_gas_tank', CO2: 'ic_gas_tank', H2O: 'ic_water', H3O_plus: 'ic_bottle_dropper', H2O2_NaOH: 'ic_bottle_dropper', NBS: 'ic_lamp' };

function bottleIcon(r: Reagent): string {
  if (BOTTLE_ICON[r.id]) return BOTTLE_ICON[r.id];
  let h = 0;
  for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ['ic_bottle_tall', 'ic_bottle_round', 'ic_bottle_flask'][h % 3];
}

/** "naoh", "h2so4 heat", "jones", "pcc": case-, subscript- and punctuation-insensitive match on label, name and aliases. */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
function norm(t: string): string {
  return t.toLowerCase().replace(/[₀-₉]/g, (c) => String(SUB.indexOf(c))).replace(/[^a-z0-9+\-]/g, '');
}
function matches(r: Reagent, q: string): boolean {
  if (!q) return true;
  const hay = [r.id, r.label, r.name, ...(r.aliases ?? []), r.card.does].map(norm);
  return q.split(/\s+/).filter(Boolean).every((w) => hay.some((h) => h.includes(norm(w))));
}

function needsConditions(r: Reagent): boolean {
  const p = r.techniqueParams;
  return !!(p?.tempPresets?.length || p?.lightToggle || p?.equivOptions?.length || r.technique === 'pressure');
}

export function Workbench({ order }: { order: Order }) {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Reagent | null>(null);
  const [info, setInfo] = useState<Reagent | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const flask = flow.flask.value;
  const steps = flow.steps.value;
  const last = flow.lastOutcome.value;
  const reached = flow.targetReached.value;
  const busy = flow.busy.value;
  const hint = flow.hintText.value;
  const list = REAGENTS.filter(SHELF_TABS.find((t) => t.id === tab)!.filter).filter((r) => matches(r, query));
  const frags = flask.split('.');

  const choose = (r: Reagent) => {
    if (busy) return;
    sfx.pick();
    if (needsConditions(r)) setPending(r);
    else void flow.addReagent(r.id);
  };

  return (
    <div class="bench">
      <div class="flask-area">
        <div class="flask-main">
          <MoleculeCard smiles={flask} label={reached ? '✓ Target in the flask' : 'In the flask'} size="md" highlight={reached && frags.length === 1 ? order.target.highlightAtoms : undefined} />
          <MoleculeCard smiles={order.target.smiles} highlight={order.target.highlightAtoms} label={`Wanted: ${order.target.name}`} sublabel={order.target.stereo !== 'none' ? stereoLabelText(order.target.stereo) : undefined} size="md" />
          <div class="flask-side">
            {last && (
              <div class={`flask-msg ${last.changed ? 'is-ok' : 'is-nope'}`}>
                {last.changed ? last.rule!.label : (last.blocked[0] ?? last.traps[0]?.why ?? 'Nothing happened.')}
                {last.warnings.map((w) => <div class="small" key={w.tag}>⚠ {w.why}</div>)}
              </div>
            )}
            {hint && <div class="hint-box small"><b>Mentor:</b> {hint}</div>}
          </div>
        </div>
        <div class="bench-actions">
          <button class="btn btn-sm" type="button" disabled={!steps.some((s) => s.kind === 'step')} onClick={() => flow.undo()} title="Undo the last step">↶ Undo</button>
          <button class="btn btn-sm" type="button" disabled={flask === order.start.smiles} onClick={() => { if (confirm('Throw it out and start from the original material?')) flow.resetFlask(); }}>Reset</button>
          <button class="btn btn-sm btn-hint" type="button" disabled={!save.value?.profile.settings.hintsEnabled} onClick={() => void flow.askMentor()} title="Ask the mentor for the next step (counts as a hint)">? Help</button>
          <button class="btn btn-sm" type="button" onClick={() => setNotesOpen(true)}>📝 Notes</button>
          <span class="spacer" />
          <button class={`btn btn-sm ${reached ? 'btn-primary' : ''}`} type="button" onClick={() => { sfx.tap(); void flow.handOver(); }}>Hand over ▶</button>
        </div>
      </div>

      <div class="steplog">
        <div class="steplog-title">Lab book for this order</div>
        {steps.length === 0 && <div class="muted small">No steps yet. Pick a bottle from the shelf.</div>}
        {steps.map((s, i) => (
          <div class={`steplog-row ${s.kind !== 'step' ? 'is-meta' : s.changed ? 'is-ok' : 'is-nope'}`} key={i}>
            {s.kind === 'step' ? <span class="step-num">{s.index}.</span> : <span class="step-num">·</span>}
            <span class="step-text">
              {s.kind === 'step' ? <b>{describeStep({ reagent: s.reagentId, conditions: s.conditions })}</b> : null}
              <span class="small"> {s.label}</span>
            </span>
          </div>
        ))}
      </div>

      <div class="shelf">
        <div class="shelf-head">
          <input class="shelf-search" type="search" inputMode="search" autocomplete="off" placeholder="Find a bottle (NaBH4, PCC, heat, Jones…)" aria-label="Find a bottle" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
          <span class="muted small">{list.length}/{REAGENTS.length}</span>
        </div>
        <div class="tabs small" role="tablist">
          {SHELF_TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} class={`tab ${tab === t.id ? 'is-active' : ''}`} type="button" onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        {list.length === 0 && <div class="muted small">No bottle matches "{query}" on this shelf. Try another tab or a shorter word.</div>}
        <div class="shelf-board" role="list">
          {list.map((r) => (
            <div class="bottle" key={r.id} role="button" tabIndex={0} onClick={() => choose(r)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(r); } }} aria-label={r.name}>
              <img src={spriteDataUrl(bottleIcon(r), 0, 3)} alt="" draggable={false} />
              <span class="bottle-label">{r.label}</span>
              <button class="bottle-info" type="button" aria-label={`About ${r.name}`} onClick={(e) => { e.stopPropagation(); setInfo(r); }}>?</button>
            </div>
          ))}
        </div>
      </div>

      {pending && <ConditionsSheet reagent={pending} onCancel={() => setPending(null)} onAdd={(c) => { setPending(null); void flow.addReagent(pending.id, c); }} />}
      {info && (
        <div class="modal-backdrop" onClick={() => setInfo(null)}>
          <div class="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{info.label}</h3>
            <p class="muted">{info.name}</p>
            <p><b>Does:</b> {info.card.does}</p>
            {info.card.doesNot && <p><b>Doesn't:</b> {info.card.doesNot}</p>}
            <button class="btn btn-primary" type="button" onClick={() => setInfo(null)}>Got it</button>
          </div>
        </div>
      )}
      {notesOpen && <Notepad onClose={() => setNotesOpen(false)} />}
    </div>
  );
}

function ConditionsSheet({ reagent, onCancel, onAdd }: { reagent: Reagent; onCancel: () => void; onAdd: (c: Conditions) => void }) {
  const p = reagent.techniqueParams ?? {};
  const [temp, setTemp] = useState<TempPreset | undefined>(p.tempPresets?.includes('rt') ? 'rt' : p.tempPresets?.[0]);
  const [light, setLight] = useState(false);
  const [equiv, setEquiv] = useState<number | undefined>(p.equivOptions?.[0]);
  const [pressure, setPressure] = useState(reagent.technique === 'pressure');
  const c: Conditions = {};
  if (temp) c.temp = temp;
  if (p.lightToggle) c.light = light;
  if (equiv !== undefined) c.equiv = equiv;
  if (reagent.technique === 'pressure') c.pressure = pressure;
  return (
    <div class="modal-backdrop" onClick={onCancel}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add {reagent.label}</h3>
        <p class="muted small">{reagent.name}</p>
        {p.tempPresets && (
          <div class="cond-row">
            <div class="small"><img class="icon" src={spriteDataUrl('ic_flame', 0, 2)} alt="" /> Temperature</div>
            <div class="chips">
              {p.tempPresets.map((t) => (
                <button key={t} type="button" class={`chip chip-btn ${temp === t ? 'is-on' : ''}`} onClick={() => setTemp(t)}>{TEMP_LABEL[t]}</button>
              ))}
            </div>
          </div>
        )}
        {p.lightToggle && (
          <div class="cond-row">
            <div class="small"><img class="icon" src={spriteDataUrl('ic_lamp', 0, 2)} alt="" /> Lamp / peroxide</div>
            <div class="chips">
              <button type="button" class={`chip chip-btn ${!light ? 'is-on' : ''}`} onClick={() => setLight(false)}>off</button>
              <button type="button" class={`chip chip-btn ${light ? 'is-on' : ''}`} onClick={() => setLight(true)}>on</button>
            </div>
          </div>
        )}
        {p.equivOptions && (
          <div class="cond-row">
            <div class="small">Equivalents</div>
            <div class="chips">
              {p.equivOptions.map((e) => (
                <button key={e} type="button" class={`chip chip-btn ${equiv === e ? 'is-on' : ''}`} onClick={() => setEquiv(e)}>{e} equiv</button>
              ))}
            </div>
          </div>
        )}
        {reagent.technique === 'pressure' && (
          <div class="cond-row">
            <div class="small"><img class="icon" src={spriteDataUrl('ic_gas_tank', 0, 2)} alt="" /> Pressure</div>
            <div class="chips">
              <button type="button" class={`chip chip-btn ${!pressure ? 'is-on' : ''}`} onClick={() => setPressure(false)}>1 atm</button>
              <button type="button" class={`chip chip-btn ${pressure ? 'is-on' : ''}`} onClick={() => setPressure(true)}>under pressure</button>
            </div>
          </div>
        )}
        <div class="row gap">
          <button class="btn btn-primary" type="button" onClick={() => onAdd(c)}>Add to flask</button>
          <button class="btn btn-ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function Notepad({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState(flow.getNote());
  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal notepad" onClick={(e) => e.stopPropagation()}>
        <h3>📝 Notes on this problem</h3>
        <p class="muted small">Saved with your progress and shown in the lab book next time this order comes around.</p>
        <textarea rows={7} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="e.g. NaBH₄ won't touch the ester; need LiAlH₄ then water" />
        <div class="row gap">
          <button class="btn btn-primary" type="button" onClick={() => { flow.setNote(text); onClose(); }}>Save</button>
          <button class="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
