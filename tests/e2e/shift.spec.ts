import { test, expect } from '@playwright/test';
import { addBottle, currentOrder, openGame, trackErrors } from './helpers';

test('a shift order: request, shelf search, wrong step + undo, notes, help, route, hand over, lab book', async ({ page }) => {
  const errors = trackErrors(page);
  await openGame(page);
  await page.getByRole('button', { name: /Start a shift/ }).click();
  await expect(page.getByRole('button', { name: /Let's see|To the bench/ })).toBeVisible({ timeout: 30_000 });
  // first customers are always make-it orders (other types unlock later)
  const o = await currentOrder(page);
  expect(o.type).toBe('make_it');
  await page.locator('button.reveal').click();
  await page.getByRole('button', { name: /To the bench/ }).click();

  // the wanted structure stays visible next to the flask
  await expect(page.locator('.flask-main .molcard')).toHaveCount(2);
  // the whole shelf, searchable
  await page.locator('.shelf-search').fill('jones');
  await expect(page.locator('.bottle')).toHaveCount(1);
  await page.locator('.shelf-search').fill('');

  // a wrong bottle first, then undo
  const wrong = ['KMnO4', 'NaBH4', 'HBr', 'PCC'].find((r) => !o.route.some((st) => st.reagent === r))!;
  await addBottle(page, { reagent: wrong });
  await expect(page.locator('.steplog-row')).toHaveCount(1);
  await page.getByRole('button', { name: /Undo/ }).click();

  await page.getByRole('button', { name: /Notes/ }).click();
  await page.locator('.notepad textarea').fill('Remember the workup!');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Help/ }).click();
  await expect(page.locator('.hint-box')).toContainText('Mentor');

  for (const st of o.route) await addBottle(page, st);
  await expect.poll(() => page.evaluate(() => window.__bb.flow.targetReached.value)).toBe(true);
  await page.getByRole('button', { name: /Hand over/ }).click();
  if (o.choices) await page.locator('.stereo-options button').nth(o.choices.indexOf(o.stereo)).click();
  await expect(page.getByRole('button', { name: /Next customer/ })).toBeVisible();
  expect(await page.evaluate(() => window.__bb.flow.outcome.value.correct)).toBe(true);

  // give up on the next one: the mentor shows the route
  await page.getByRole('button', { name: /Next customer/ }).click();
  await page.getByRole('button', { name: /Let's see|To the bench/ }).click();
  await page.getByRole('button', { name: /Give up/ }).click();
  await expect(page.locator('.result-panel.is-fail')).toBeVisible();

  await page.getByRole('button', { name: 'Lab book' }).first().click();
  await expect(page.locator('.book-entry')).toHaveCount(2);
  await page.locator('.book-head').nth(1).click();
  await expect(page.locator('.note-box')).toContainText('Remember the workup!');
  expect(errors).toEqual([]);
});

test('the lab room is drawn at least 3x on a phone-sized screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout only');
  await openGame(page);
  await page.getByRole('button', { name: /Start a shift/ }).click();
  await expect(page.getByRole('button', { name: /Let's see|To the bench/ })).toBeVisible({ timeout: 30_000 });
  const zoom = await page.evaluate(() => window.__bb.game.scene.getScene('lab').r.zoom);
  expect(zoom).toBeGreaterThanOrEqual(3);
  // a resize (e.g. the iOS toolbar) keeps the customer on screen
  await page.setViewportSize({ width: 390, height: 760 });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__bb.game.scene.getScene('lab').customer.img.visible)).toBe(true);
});
