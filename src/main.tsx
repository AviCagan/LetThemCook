import { render } from 'preact';
import { App } from './ui/App';
import { bootMessage, rdkitReady, save, screen } from './state';
import { loadSave } from './save/store';
import { loadRDKit, warmCache } from './chem/rdkit';
import { createGame } from './game/game';
import { sfx } from './audio/sfx';
import { ITEMS } from './content/bank';
import { flow } from './flow';
import { applyTheme } from './theme';
import { initNative, isNative } from './native';
import { initCloud } from './save/cloud';
import '@fontsource/press-start-2p/400.css';
import './styles.css';

async function boot(): Promise<void> {
  // ?debug exposes the game state for smoke tests and console poking
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __bb: unknown }).__bb = { flow, save, screen };
  render(<App />, document.getElementById('ui')!);
  const data = await loadSave();
  save.value = data;
  sfx.setMuted(data.profile.settings.mute);
  document.documentElement.classList.toggle('reduced-motion', data.profile.settings.reducedMotion);
  applyTheme(data.profile.settings.theme ?? 'auto');
  const game = createGame(document.getElementById('game')!);
  const dbg = (window as unknown as { __bb?: { game?: unknown } }).__bb;
  if (dbg) dbg.game = game;
  bootMessage.value = 'Loading the molecule drawer (first time takes a moment)…';
  try {
    await loadRDKit();
    rdkitReady.value = true;
    warmCache(ITEMS.slice(0, 12).flatMap((q) => (q.start ? [q.start.smiles] : [])));
  } catch (e) {
    bootMessage.value = `Could not load RDKit: ${(e as Error).message}. Reload to retry.`;
    return;
  }
  screen.value = 'title';
  void initCloud({
    getSave: () => save.value,
    setSave: (s) => (save.value = s),
    canApply: () => !(screen.value === 'lab' && (flow.phase.value === 'bench' || flow.phase.value === 'stereo')),
  });
}

boot();
void initNative();

// the installed Android app ships its files inside the APK, so no service worker there
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(() => undefined);
}
