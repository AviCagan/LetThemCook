// Export / import codes. "BB1." + base64url(gzip(json)) when CompressionStream exists, else "BB0." + base64url(json).
import type { SaveData } from './types';

const PREFIX_GZIP = 'BB1.';
const PREFIX_PLAIN = 'BB0.';

export async function encodeSave(save: SaveData): Promise<string> {
  const json = JSON.stringify(save);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const gz = await pipe(bytes, new CompressionStream('gzip'));
    return PREFIX_GZIP + toBase64Url(gz);
  }
  return PREFIX_PLAIN + toBase64Url(bytes);
}

export async function decodeSave(code: string): Promise<SaveData> {
  const trimmed = code.trim().replace(/\s+/g, '');
  let bytes: Uint8Array;
  if (trimmed.startsWith(PREFIX_GZIP)) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot read compressed codes; import the JSON file instead.');
    bytes = await pipe(fromBase64Url(trimmed.slice(PREFIX_GZIP.length)), new DecompressionStream('gzip'));
  } else if (trimmed.startsWith(PREFIX_PLAIN)) {
    bytes = fromBase64Url(trimmed.slice(PREFIX_PLAIN.length));
  } else if (trimmed.startsWith('{')) {
    bytes = new TextEncoder().encode(trimmed);
  } else {
    throw new Error('That does not look like a Beaker Buddies code.');
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  return validateSave(data);
}

export function validateSave(data: unknown): SaveData {
  if (!data || typeof data !== 'object') throw new Error('Save is not an object');
  const s = data as SaveData;
  if (s.schemaVersion !== 1) throw new Error(`Unsupported save version ${String((s as { schemaVersion?: unknown }).schemaVersion)}`);
  if (!s.mastery || !s.profile || !Array.isArray(s.history)) throw new Error('Save is missing sections');
  return s;
}

async function pipe(bytes: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
