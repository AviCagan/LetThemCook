import { test, expect } from '@playwright/test';
import { openGame } from './helpers';

test('works offline after the first load (service worker caches the app and RDKit)', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  await openGame(page);
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    for (const k of await caches.keys()) {
      const reqs = await (await caches.open(k)).keys();
      if (reqs.some((r) => r.url.includes('RDKit_minimal.wasm'))) return true;
    }
    return false;
  }), { timeout: 30_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Start a shift/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Start a shift/ }).click();
  await page.getByRole('button', { name: /To the bench/ }).click();
  // molecules still draw (RDKit came from the cache)
  await expect(page.locator('.flask-main .molcard-paper svg path').first()).toBeAttached();
  await context.setOffline(false);
});
