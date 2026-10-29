import { test, expect } from '@playwright/test';
import { answerCorrectly, boostSave, openGame, trackErrors } from './helpers';

test('exam mode: every order type can be answered through the UI and scores 100%', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page);
  await boostSave(page);
  await page.evaluate(() => {
    const s = window.__bb.save.value;
    s.profile.settings.examLength = 12;
    s.profile.settings.examMinutes = 0;
    window.__bb.save.value = { ...s };
  });
  await page.getByRole('button', { name: /^Exam/ }).click();
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    seen.add(await answerCorrectly(page));
    await page.getByRole('button', { name: /Next customer/ }).click();
  }
  await expect(page.locator('.dayend')).toContainText('Exam results');
  await expect(page.locator('.exam-score')).toContainText('100%');
  expect(seen.size).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('each quiz type renders and grades a wrong answer with a mentor explanation', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page);
  await boostSave(page);
  for (const type of ['predict_product', 'what_start', 'spot_flaw', 'name_it']) {
    // serve one order of this type straight from the scheduler's item pool
    await page.evaluate((t) => window.__bb.flow.startShift('practice', { customers: 1, only: undefined }), type);
    await expect(page.getByRole('button', { name: /Let's see|To the bench/ })).toBeVisible({ timeout: 30_000 });
    await page.evaluate((t) => {
      const f = window.__bb.flow;
      const items = window.__bb.items.filter((q: any) => (q.orderTypes ?? []).includes(t));
      const item = items[Math.floor(items.length / 2)];
      f.debugServe(item.id, t);
    }, type);
    await page.getByRole('button', { name: /Let's see/ }).click();
    await expect(page.locator('.quiz')).toBeVisible();
    if (type === 'predict_product' || type === 'what_start') {
      const wrong = await page.evaluate(() => window.__bb.flow.order.value.quiz.options.findIndex((o: any) => !o.correct));
      await page.locator('.options .molcard').nth(wrong).click();
    } else if (type === 'spot_flaw') {
      const bad = await page.evaluate(() => window.__bb.flow.order.value.quiz.routes.findIndex((r: any) => !r.works));
      await page.locator('.route-options .btn-option').nth(bad).click();
    } else {
      await page.locator('.name-input').fill('definitely not a name');
      await page.getByRole('button', { name: 'Check' }).click();
    }
    await expect(page.locator('.result-panel.is-fail .why-box')).toBeVisible();
    expect(await page.evaluate(() => window.__bb.flow.outcome.value.correct)).toBe(false);
    await page.evaluate(() => window.__bb.flow.abandonShift());
  }
  expect(errors).toEqual([]);
});

test('rush hour shows a countdown; the shop sells cosmetics that appear in the lab', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page);
  await boostSave(page, 600);
  await page.getByRole('button', { name: /Rush hour/ }).click();
  await expect(page.getByRole('timer')).toContainText(/\d:\d\d/);
  await page.evaluate(() => window.__bb.flow.abandonShift());

  await page.getByRole('button', { name: /Lab shop/ }).click();
  for (const name of ['Hamster', 'Coral counter', 'Dr. Goldie Croak']) await page.locator('.shop-card', { hasText: name }).first().click();
  const eco = await page.evaluate(() => window.__bb.save.value.economy);
  expect(eco.equipped.pet).toBe('pet_hamster');
  expect(eco.equipped.bench).toBe('bench_coral');
  expect(eco.unlocked).toContain('cust_sci_frog__gold');
  expect(eco.coins).toBe(600 - 120 - 60 - 60);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /Start a shift/ }).click();
  await expect(page.getByRole('button', { name: /Let's see|To the bench/ })).toBeVisible({ timeout: 30_000 });
  const keys = await page.evaluate(() => window.__bb.game.scene.getScene('lab').children.list.map((o: any) => o.texture?.key));
  expect(keys).toContain('pet_hamster');
  expect(keys).toContain('t_counter_m__coral');
  expect(errors).toEqual([]);
});
