import { expect, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    __bb: any;
  }
}

export interface Step {
  reagent: string;
  conditions?: { temp?: string; light?: boolean; equiv?: number; pressure?: boolean };
}

const TEMP: Record<string, string> = { ice: 'ice 0–5 °C', rt: 'room temp', reflux: 'heat', c140: '140 °C', c180: '180 °C' };

/** Open the game with the debug hook and wait for the title screen (RDKit loaded). */
export async function openGame(page: Page): Promise<void> {
  page.on('dialog', (d) => d.accept());
  await page.goto('./?debug=1');
  await expect(page.getByRole('button', { name: /Start a shift/ })).toBeVisible({ timeout: 90_000 });
}

/** Collect uncaught page errors; assert none at the end of a test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Find a bottle on the shelf by searching for its id, set its conditions, add it to the flask. */
export async function addBottle(page: Page, step: Step): Promise<void> {
  await page.locator('.shelf-search').fill(step.reagent);
  await page.locator('.bottle').first().click();
  const sheet = page.locator('.modal', { hasText: 'Add to flask' });
  if (await sheet.isVisible({ timeout: 700 }).catch(() => false)) {
    const c = step.conditions ?? {};
    if (c.temp) await sheet.getByRole('button', { name: TEMP[c.temp], exact: true }).click();
    if (c.light) await sheet.getByRole('button', { name: 'on', exact: true }).click();
    if (c.equiv) await sheet.getByRole('button', { name: `${c.equiv} equiv`, exact: true }).click();
    if (c.pressure) await sheet.getByRole('button', { name: 'under pressure' }).click();
    await sheet.getByRole('button', { name: 'Add to flask' }).click();
  }
  await expect(page.locator('.shelf-search')).toBeVisible();
  await page.locator('.shelf-search').fill('');
}

export async function currentOrder(page: Page) {
  return page.evaluate(() => {
    const o = window.__bb.flow.order.value;
    return { type: o.type as string, quiz: o.quiz, route: o.item.route as Step[], stereo: o.target.stereo as string, choices: o.stereoChoices as string[] | undefined, name: o.target.name as string, id: o.item.id as string };
  });
}

/** Answer whatever order is on the request card correctly, through the UI. Returns the order type. */
export async function answerCorrectly(page: Page): Promise<string> {
  const go = page.getByRole('button', { name: /Let's see|To the bench/ });
  await expect(go).toBeVisible({ timeout: 30_000 });
  const o = await currentOrder(page);
  await go.click();
  if (o.type === 'make_it' || o.type === 'synthesis') {
    await expect(page.getByRole('button', { name: /Hand over/ })).toBeVisible();
    for (const st of o.route) await addBottle(page, st);
    await expect.poll(() => page.evaluate(() => window.__bb.flow.targetReached.value)).toBe(true);
    await page.getByRole('button', { name: /Hand over/ }).click();
  } else if (o.type === 'predict_product' || o.type === 'what_start') {
    await page.locator('.options .molcard').nth(o.quiz.options.findIndex((x: any) => x.correct)).click();
  } else if (o.type === 'spot_flaw') {
    await page.locator('.route-options .btn-option').nth(o.quiz.routes.findIndex((r: any) => r.works)).click();
    await page.locator('.stereo-options .btn-option').nth(o.quiz.reasons.indexOf(o.quiz.flaw.tag)).click();
  } else if (o.type === 'name_it') {
    // the checker ignores case, spaces and hyphens
    await page.locator('.name-input').fill(o.name.toUpperCase().replace(/-/g, ' '));
    await page.getByRole('button', { name: 'Check' }).click();
  }
  const stereo = page.locator('.stereo-options');
  if (o.choices && (await stereo.isVisible({ timeout: 800 }).catch(() => false)) && (await page.locator('.picker').isVisible().catch(() => false))) {
    await stereo.locator('button').nth(o.choices.indexOf(o.stereo)).click();
  }
  await expect(page.getByRole('button', { name: /Next customer/ })).toBeVisible();
  expect(await page.evaluate(() => window.__bb.flow.outcome.value.correct), `${o.type} ${o.id} should be graded correct`).toBe(true);
  return o.type;
}

/** Unlock every order type (as if 20 orders had been played) and add coins, through the debug hook. */
export async function boostSave(page: Page, coins = 0): Promise<void> {
  await page.evaluate((c) => {
    const s = window.__bb.save.value;
    for (let i = 0; i < 20; i++) s.history.push({ t: i + 1, item: `seed-${i}`, type: 'make_it', reaction: 'R2', ok: true, tags: [], stars: 3, hinted: false, mode: 'shift', seconds: 20, coins: 0 });
    s.economy.legacyCoins = (s.economy.legacyCoins ?? 0) + c;
    s.economy.coins += c;
    window.__bb.save.value = { ...s };
  }, coins);
}
