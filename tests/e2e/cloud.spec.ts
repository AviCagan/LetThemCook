// Two devices sync through the real cloud-save SQL: the RPC calls the app makes to the (fake)
// Supabase URL are answered by PGlite running supabase/migrations/*_cloud_save.sql as the anon role.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { answerCorrectly, boostSave, openGame } from './helpers';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

async function backend() {
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin;');
  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
  const calls: string[] = [];
  const attach = async (ctx: BrowserContext) => {
    await ctx.route('https://cloud.test/rest/v1/rpc/*', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const fn = new URL(req.url()).pathname.split('/').pop()!;
      const body = JSON.parse(req.postData() ?? '{}');
      calls.push(fn);
      try {
        await db.exec('set role anon');
        const rows = fn === 'bb_get_save'
          ? (await db.query('select public.bb_get_save($1) as r', [body.sync_key])).rows
          : fn === 'bb_put_save'
            ? (await db.query('select public.bb_put_save($1, $2, $3, $4) as r', [body.sync_key, body.save, body.base_version, body.device_id])).rows
            : null;
        await db.exec('reset role');
        if (!rows) return route.fulfill({ status: 404, headers: CORS, json: { message: 'no such function' } });
        return route.fulfill({ status: 200, headers: CORS, json: (rows[0] as { r: unknown }).r });
      } catch (e) {
        await db.exec('reset role');
        return route.fulfill({ status: 400, headers: CORS, json: { message: (e as Error).message } });
      }
    });
  };
  return { db, calls, attach };
}

async function settings(page: Page) {
  await page.getByRole('button', { name: /Settings/ }).click();
  await expect(page.locator('.cloud-panel')).toBeVisible();
}

test('cloud save: turn on, link a second device, progress and purchases merge both ways', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'once is enough');
  const be = await backend();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  await be.attach(ctxA);
  await be.attach(ctxB);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await openGame(a);
  await openGame(b);

  // device A: turn on, play one order
  await settings(a);
  await a.getByRole('button', { name: /Turn on/ }).click();
  await expect(a.locator('.sync-code')).toHaveText(/^[A-Z2-7]{5}(-[A-Z2-7]{1,5}){5}$/);
  const code = (await a.locator('.sync-code').textContent())!;
  await a.getByRole('button', { name: 'Close' }).click();
  await a.getByRole('button', { name: /Start a shift/ }).click();
  await answerCorrectly(a);
  await a.evaluate(() => window.__bb.flow.abandonShift());
  await settings(a);
  await a.getByRole('button', { name: 'Sync now' }).click();
  await expect(a.locator('.cloud-panel')).toContainText(/Last synced just now/);
  const coinsA = await a.evaluate(() => window.__bb.save.value.economy.coins);
  expect(coinsA).toBeGreaterThan(0);

  // device B: link with the code (lower case, spaces instead of dashes) and receive A's progress
  await boostSave(b, 300);
  await settings(b);
  await b.locator('.code-input').fill(code.toLowerCase().replace(/-/g, ' '));
  await b.getByRole('button', { name: 'Link this device' }).click();
  await expect(b.locator('.sync-code')).toHaveText(code);
  await expect.poll(() => b.evaluate(() => window.__bb.save.value.labBook.length)).toBe(1);
  // B spends coins in the shop and syncs
  await b.getByRole('button', { name: 'Close' }).click();
  await b.getByRole('button', { name: /Lab shop/ }).click();
  await b.locator('.shop-card', { hasText: 'Slime' }).click();
  await b.getByRole('button', { name: 'Close' }).click();
  await settings(b);
  await b.getByRole('button', { name: 'Sync now' }).click();
  await expect(b.locator('.cloud-panel')).toContainText(/Last synced just now/);
  const coinsB = await b.evaluate(() => window.__bb.save.value.economy.coins);

  // back on A: the purchase and B's coins arrive; balances agree exactly (coin ledger)
  await a.getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(() => a.evaluate(() => window.__bb.save.value.economy.unlocked)).toContain('pet_slime');
  expect(await a.evaluate(() => window.__bb.save.value.economy.coins)).toBe(coinsB);
  expect(coinsB).toBe(coinsA + 300 - 100);
  // each device keeps its own id
  const ids = [await a.evaluate(() => window.__bb.save.value.deviceId), await b.evaluate(() => window.__bb.save.value.deviceId)];
  expect(ids[0]).not.toBe(ids[1]);

  // the server only ever saw hashes of the code, and both RPCs were used
  const rows = (await be.db.query('select key_hash, version from public.bb_saves')).rows as { key_hash: string; version: number }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].key_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(rows[0].version).toBeGreaterThanOrEqual(3);
  expect(be.calls).toContain('bb_get_save');
  expect(be.calls).toContain('bb_put_save');
  await ctxA.close();
  await ctxB.close();
});
