import { useState } from 'preact/hooks';
import { showToast } from '../state';
import { cloudConfigured, cloudStatus, disableHere, enableNew, formatCode, linkCode, syncNow } from '../save/cloud';
import { spriteDataUrl } from '../art/textures';

function ago(t?: number): string {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

/** Settings → Cloud save: turn on (new code), link another device (paste code), sync now, turn off here. */
export function CloudPanel() {
  const st = cloudStatus.value;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(ok);
    } catch (e) {
      showToast((e as Error).message, 4500);
    } finally {
      setBusy(false);
    }
  };
  const icon = (() => {
    try {
      return spriteDataUrl('ic_cloud', 0, 2);
    } catch {
      return null;
    }
  })();
  return (
    <section class="cloud-panel">
      <h3>{icon && <img class="icon" src={icon} alt="" />} Cloud save</h3>
      {!cloudConfigured() ? (
        <p class="muted small">Cloud save is not set up for this build yet. Export / import below still moves progress by hand.</p>
      ) : st.enabled ? (
        <>
          <p class="small">On. This device syncs automatically after each order and whenever the app comes back to the front.</p>
          <div class="sync-code" aria-label="Sync code">{formatCode(st.code!)}</div>
          <p class="muted small">To add another device: open Settings → Cloud save there, choose "Link this device", and enter this code. Keep it private: anyone with it can load and change this save.</p>
          <p class="muted small">Last synced {ago(st.lastSync)}{st.busy ? ' · syncing…' : ''}{st.error ? ` · ${st.error}` : ''}</p>
          <div class="row gap wrap">
            <button class="btn btn-primary" type="button" disabled={busy || st.busy} onClick={() => run(() => syncNow(), 'Synced')}>Sync now</button>
            <button class="btn" type="button" onClick={() => run(() => navigator.clipboard.writeText(formatCode(st.code!)), 'Code copied')}>Copy code</button>
            <button class="btn btn-ghost" type="button" onClick={() => { if (confirm('Stop syncing on this device? Your progress stays here and in the cloud.')) void run(disableHere, 'Cloud save off on this device'); }}>Turn off here</button>
          </div>
        </>
      ) : (
        <>
          <p class="small">Keep phone, laptop and the Android app in sync. One device makes a code; the others enter it.</p>
          <div class="row gap wrap">
            <button class="btn btn-primary" type="button" disabled={busy} onClick={() => run(enableNew, 'Cloud save on: your code is below')}>Turn on (new code)</button>
          </div>
          <label class="field">
            <span>Already on another device? Enter its code to link this one:</span>
            <input class="code-input" type="text" inputMode="text" autocomplete="off" autocapitalize="characters" spellcheck={false} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
          </label>
          <button class="btn" type="button" disabled={busy || !code.trim()} onClick={() => run(() => linkCode(code), 'Linked: progress merged from the cloud')}>Link this device</button>
          {st.error && <p class="muted small">{st.error}</p>}
        </>
      )}
    </section>
  );
}
