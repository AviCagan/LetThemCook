import { useState } from 'preact/hooks';
import { save, screen, showToast } from '../state';
import { persistSave } from '../save/store';
import { decodeSave, encodeSave } from '../save/codec';
import { mergeSaves } from '../save/merge';
import { emptySave } from '../save/types';
import { sfx } from '../audio/sfx';
import { applyTheme, THEME_LABEL, type Theme } from '../theme';

export function Settings() {
  const s = save.value!;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (fn: (d: typeof s) => void) => {
    fn(s);
    persistSave(s);
    save.value = { ...s };
  };

  const exportCode = async () => {
    setBusy(true);
    try {
      const c = await encodeSave(s);
      setCode(c);
      try {
        await navigator.clipboard.writeText(c);
        showToast('Code copied to clipboard');
      } catch {
        showToast('Code ready below; copy it by hand');
      }
    } finally {
      setBusy(false);
    }
  };
  const exportFile = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `beaker-buddies-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importText = async (text: string) => {
    try {
      const incoming = await decodeSave(text);
      const merged = mergeSaves(s, incoming);
      persistSave(merged, true);
      save.value = merged;
      showToast('Progress imported and merged');
    } catch (e) {
      showToast(`Import failed: ${(e as Error).message}`, 4000);
    }
  };
  const importFile = (file: File) => {
    file.text().then(importText);
  };

  return (
    <div class="screen settings">
      <div class="row space">
        <h2>Settings</h2>
        <button class="btn btn-sm" type="button" onClick={() => { sfx.click(); screen.value = 'title'; }}>Close</button>
      </div>
      <label class="field">
        <span>Exam date (caps review intervals so everything comes back before it; defaults to the next exam in content/course.json)</span>
        <input type="date" value={s.profile.examDate ?? ''} onChange={(e) => update((d) => { d.profile.examDate = (e.target as HTMLInputElement).value || undefined; })} />
      </label>
      <label class="field">
        <span>Customers per shift</span>
        <input type="number" min={4} max={16} value={s.profile.settings.shiftLength} onChange={(e) => update((d) => { d.profile.settings.shiftLength = Math.max(4, Math.min(16, Number((e.target as HTMLInputElement).value) || 10)); })} />
      </label>
      <label class="field check">
        <input type="checkbox" checked={s.profile.chapters['17'] !== false} onChange={(e) => update((d) => { d.profile.chapters['17'] = (e.target as HTMLInputElement).checked; })} />
        <span>Include chapter 17 (ethers, epoxides, sulfides)</span>
      </label>
      <label class="field check">
        <input type="checkbox" checked={s.profile.settings.hintsEnabled} onChange={(e) => update((d) => { d.profile.settings.hintsEnabled = (e.target as HTMLInputElement).checked; })} />
        <span>Allow "Ask the mentor" hints (cost half the chemistry score)</span>
      </label>
      <label class="field check">
        <input type="checkbox" checked={s.profile.settings.mute} onChange={(e) => update((d) => { d.profile.settings.mute = (e.target as HTMLInputElement).checked; sfx.setMuted(d.profile.settings.mute); })} />
        <span>Mute sound</span>
      </label>
      <div class="field">
        <span>Theme</span>
        <div class="chips" role="radiogroup" aria-label="Theme">
          {(['auto', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={(s.profile.settings.theme ?? 'auto') === t} class={`chip chip-btn ${(s.profile.settings.theme ?? 'auto') === t ? 'is-on' : ''}`} onClick={() => update((d) => { d.profile.settings.theme = t; applyTheme(t); })}>{THEME_LABEL[t]}</button>
          ))}
        </div>
      </div>
      <label class="field check">
        <input type="checkbox" checked={s.profile.settings.reducedMotion} onChange={(e) => update((d) => { d.profile.settings.reducedMotion = (e.target as HTMLInputElement).checked; document.documentElement.classList.toggle('reduced-motion', d.profile.settings.reducedMotion); })} />
        <span>Reduce motion</span>
      </label>

      <h3>Move progress between devices</h3>
      <div class="row gap wrap">
        <button class="btn btn-primary" type="button" disabled={busy} onClick={exportCode}>Copy export code</button>
        <button class="btn" type="button" onClick={exportFile}>Download JSON</button>
        <label class="btn">
          Import JSON file
          <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) importFile(f); }} />
        </label>
      </div>
      <textarea class="code-box" rows={4} placeholder="Paste an export code here to import" value={code} onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} />
      <div class="row gap">
        <button class="btn" type="button" disabled={!code.trim()} onClick={() => importText(code)}>Import from code</button>
        <button class="btn btn-ghost" type="button" onClick={() => { if (confirm('Erase all progress on this device?')) { const fresh = emptySave(); persistSave(fresh, true); save.value = fresh; showToast('Progress reset'); } }}>Reset progress</button>
      </div>
      <p class="muted small">Device id {s.deviceId.slice(0, 8)} · saved {new Date(s.updatedAt).toLocaleString()}</p>
    </div>
  );
}
