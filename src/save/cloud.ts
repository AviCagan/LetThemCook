// Cloud save through Supabase (optional). A secret sync code, kept only on the device, identifies the
// save; the server stores it under the code's hash and exposes two RPCs (get, compare-and-swap put).
// Sync = pull -> merge record by record -> push, retried if another device wrote in between.
import { del, get, set } from 'idb-keyval';
import { signal } from '@preact/signals';
import { CLOUD } from './cloud.config';
import { mergeSaves } from './merge';
import { normalizeSave, onPersist, persistSave } from './store';
import type { SaveData } from './types';

const STATE_KEY = 'beaker-buddies:cloud:v1';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const CODE_LEN = 26; // 130 bits

interface CloudState {
  code: string;
  version: number;
  lastSync?: number;
}

export interface CloudStatus {
  enabled: boolean;
  code?: string;
  lastSync?: number;
  busy: boolean;
  error?: string;
}

export const cloudConfigured = (cfg = CLOUD) => !!(cfg.url && cfg.anonKey);
export const cloudStatus = signal<CloudStatus>({ enabled: false, busy: false });

/** Hooks into the game: read and replace the live save, and whether it is safe to swap it now. */
export interface CloudHost {
  getSave(): SaveData | null;
  setSave(s: SaveData): void;
  /** false while an order is on the bench: merging then could swap the save under the game */
  canApply(): boolean;
}
let host: CloudHost | null = null;
let state: CloudState | null = null;
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null;

export function generateCode(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = rand(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) out += B32[bytes[i] & 31];
  return out;
}

/** "abcde-fghij …" with any spacing, dashes or case -> canonical code, or null if malformed. */
export function normalizeCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B');
  return c.length === CODE_LEN && [...c].every((ch) => B32.includes(ch)) ? c : null;
}

export function formatCode(code: string): string {
  return code.match(/.{1,5}/g)!.join('-');
}

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { apikey: CLOUD.anonKey, 'Content-Type': 'application/json' };
  // legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys must not
  if (!CLOUD.anonKey.startsWith('sb_')) headers.Authorization = `Bearer ${CLOUD.anonKey}`;
  const res = await fetch(`${CLOUD.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function publish(patch: Partial<CloudStatus> = {}): void {
  cloudStatus.value = { ...cloudStatus.value, enabled: !!state, code: state?.code, lastSync: state?.lastSync, ...patch };
}

async function saveState(): Promise<void> {
  if (state) await set(STATE_KEY, state).catch(() => undefined);
  else await del(STATE_KEY).catch(() => undefined);
}

/** Load the device's sync code, wire up auto-sync, and sync once. Safe to call when not configured. */
export async function initCloud(h: CloudHost): Promise<void> {
  host = h;
  if (!cloudConfigured()) return;
  state = (await get<CloudState>(STATE_KEY).catch(() => undefined)) ?? null;
  publish();
  onPersist(() => {
    if (!applying) scheduleSync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(500);
  });
  window.addEventListener('online', () => scheduleSync(500));
  if (state) void syncNow();
}

export function scheduleSync(delay = 8000): void {
  if (!state) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

/** Pull, merge, push. Defers (and retries later) while an order is on the bench. */
export function syncNow(): Promise<void> {
  if (!state || !host) return Promise.resolve();
  if (inflight) return inflight;
  inflight = doSync().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doSync(): Promise<void> {
  if (!state || !host) return;
  if (!host.canApply()) {
    scheduleSync(15000);
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    publish({ error: 'offline: will sync when back online' });
    return;
  }
  publish({ busy: true, error: undefined });
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await rpc<{ found: boolean; version?: number; save?: unknown }>('bb_get_save', { sync_key: state.code });
      const local = host.getSave();
      if (!local) return;
      let merged = local;
      if (remote.found && remote.save) merged = mergeSaves(local, normalizeSave(remote.save));
      const base = remote.found ? remote.version ?? 0 : 0;
      if (merged !== local) {
        applying = true;
        try {
          persistSave(merged, true);
          host.setSave(merged);
        } finally {
          applying = false;
        }
      }
      const put = await rpc<{ ok: boolean; version: number }>('bb_put_save', { sync_key: state.code, save: merged, base_version: base, device_id: merged.deviceId });
      if (put.ok) {
        state.version = put.version;
        state.lastSync = Date.now();
        await saveState();
        publish({ busy: false, error: undefined });
        return;
      }
      // another device wrote first: pull again and merge on top
    }
    publish({ busy: false, error: 'another device kept writing; will retry' });
    scheduleSync(20000);
  } catch (e) {
    publish({ busy: false, error: (e as Error).message || 'sync failed' });
  }
}

/** Turn cloud save on with a new code (first device). */
export async function enableNew(): Promise<string> {
  state = { code: generateCode(), version: 0 };
  await saveState();
  publish();
  await syncNow();
  return state.code;
}

/** Link this device to an existing code (second device): pulls the cloud save and merges it in. */
export async function linkCode(input: string): Promise<void> {
  const code = normalizeCode(input);
  if (!code) throw new Error(`A sync code is ${CODE_LEN} letters and digits (dashes optional).`);
  const remote = await rpc<{ found: boolean }>('bb_get_save', { sync_key: code });
  if (!remote.found) throw new Error('No cloud save uses that code. Check it on the other device (Settings → Cloud save).');
  state = { code, version: 0 };
  await saveState();
  publish();
  await syncNow();
}

/** Forget the code on this device (the cloud copy stays for the other devices). */
export async function disableHere(): Promise<void> {
  state = null;
  if (timer) clearTimeout(timer);
  await saveState();
  publish({ error: undefined });
}
