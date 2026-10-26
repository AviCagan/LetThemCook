import { render } from 'preact';
import { App } from './ui/App';
import { bootMessage, rdkitReady, save, screen } from './state';
import { loadSave } from './save/store';
import { loadRDKit, warmCache } from './chem/rdkit';
import { createGame } from './game/game';
import { sfx } from './audio/sfx';
import { ITEMS } from './content/bank';
import './styles.css';

async function boot(): Promise<void> {
  render(<App />, document.getElementById('ui')!);
  const data = await loadSave();
  save.value = data;
  sfx.setMuted(data.profile.settings.mute);
  document.documentElement.classList.toggle('reduced-motion', data.profile.settings.reducedMotion);
  createGame(document.getElementById('game')!);
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
}

boot();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  }).catch(() => undefined);
}
