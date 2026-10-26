// Light / dark theme. 'auto' follows the OS (prefers-color-scheme); the choice lives in the save.
import { signal } from '@preact/signals';

export type Theme = 'auto' | 'light' | 'dark';
export const THEME_LABEL: Record<Theme, string> = { auto: 'System', light: 'Light', dark: 'Dark' };

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current: Theme = 'auto';

/** True when the page is currently dark (after applyTheme). */
export const darkMode = signal(false);

export function effectiveDark(theme: Theme = current): boolean {
  return theme === 'dark' || (theme === 'auto' && !!mq?.matches);
}

export function applyTheme(theme: Theme): void {
  current = theme;
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = effectiveDark(theme);
  darkMode.value = dark;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#171330' : '#fff4e3');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', dark ? 'black' : 'default');
}

mq?.addEventListener('change', () => applyTheme(current));
