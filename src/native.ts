// Native (Capacitor) glue. On the web this module does nothing.
import { Capacitor } from '@capacitor/core';
import { flow } from './flow';
import { screen } from './state';

export const isNative = Capacitor.isNativePlatform();

/** Android back button: close an open sheet, then step back a screen, then leave the app from the title. */
export async function initNative(): Promise<void> {
  if (!isNative) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    const sheet = document.querySelector('.modal-backdrop') as HTMLElement | null;
    if (sheet) {
      sheet.click();
      return;
    }
    const sc = screen.value;
    if (sc === 'lab') {
      if (confirm('Leave this shift? Finished orders are saved.')) flow.abandonShift();
      return;
    }
    if (sc === 'labbook' || sc === 'notebook') {
      screen.value = flow.order.value ? 'lab' : 'title';
      return;
    }
    if (sc === 'settings' || sc === 'practice' || sc === 'report') {
      screen.value = 'title';
      return;
    }
    void App.exitApp();
  });
}
