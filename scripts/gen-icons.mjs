// Generates public/icons/icon-192.png and icon-512.png from a code-defined pixel flask.
// Pure Node: a minimal PNG encoder (zlib from the standard library), no image dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAL = { '.': null, b: '#f6e7d8', o: '#4a3f5c', g: '#dff4ff', m: '#7fe0a8', w: '#ffffff', p: '#ffb7a1', y: '#ffe59a' };
const ROWS = [
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbooooooobbbbbbbbbbbb',
  'bbbbbbbbbbbbbogggggobbbbbbbbbbbb',
  'bbbbbbbbbbbbbbogggobbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbogwgobbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbogwgobbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbogwgobbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbogwgobbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbogggobbbbbbbbbbbbb',
  'bbbbbbbbbbbbbogggggobbbbbbbbbbbb',
  'bbbbbbbbbbbbogggggggobbbbbbbbbbb',
  'bbbbbbbbbbbogggggggggobbbbbbbbbb',
  'bbbbbbbbbbogggggwggggg0bbbbbbbbb'.replace('0', 'o'),
  'bbbbbbbbbogggggggggggggobbbbbbbb',
  'bbbbbbbbbogggggggggggggobbbbbbbb',
  'bbbbbbbbogmmmmmmmmmmmmmgobbbbbbb',
  'bbbbbbbbommmmmymmmmmmmmmobbbbbbb',
  'bbbbbbbbommmmmmmmmmymmmmobbbbbbb',
  'bbbbbbbbommmymmmmmmmmmmmobbbbbbb',
  'bbbbbbbbommmmmmmmmmmmmmmobbbbbbb',
  'bbbbbbbbommmmmmmymmmmmmmobbbbbbb',
  'bbbbbbbbbommmmmmmmmmmmmobbbbbbbb',
  'bbbbbbbbbboommmmmmmmmoobbbbbbbbb',
  'bbbbbbbbbbbbooooooooobbbbbbbbbbb',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'bbbbbbbbbbppbbbbbbbbbbppbbbbbbbb',
  'bbbbbbbbbpppbbbbbbbbbbpppbbbbbbb',
  'bbbbbbbbbbppbbbbbbbbbbppbbbbbbbb',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const scale = size / 32;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const ch = ROWS[Math.floor(y / scale)][Math.floor(x / scale)];
      const hex = PAL[ch] ?? '#f6e7d8';
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = parseInt(hex.slice(1, 3), 16);
      raw[o + 1] = parseInt(hex.slice(3, 5), 16);
      raw[o + 2] = parseInt(hex.slice(5, 7), 16);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
mkdirSync(join(root, 'public', 'icons'), { recursive: true });
for (const s of [192, 512]) writeFileSync(join(root, 'public', 'icons', `icon-${s}.png`), png(s));
console.log('icons written');
