// App-wide reactive state (Preact signals). Pure data; no DOM or Phaser here.
import { signal } from '@preact/signals';
import type { SaveData } from './save/types';

export type Screen = 'boot' | 'title' | 'lab' | 'notebook' | 'settings' | 'practice' | 'report';

export const save = signal<SaveData | null>(null);
export const screen = signal<Screen>('boot');
export const rdkitReady = signal(false);
export const bootMessage = signal('Warming up the fume hood…');
export const toast = signal<string | null>(null);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string, ms = 2200): void {
  toast.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = null), ms);
}
