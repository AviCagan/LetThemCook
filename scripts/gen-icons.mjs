// Generates public/icons/icon-192.png and icon-512.png from a code-defined pixel flask,
// and, when the Capacitor android/ project exists, its launcher icons and splash screens.
// Pure Node: a minimal PNG encoder (zlib from the standard library), no image dependencies.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
/**
 * An RGBA PNG of w x h. The 32x32 art is drawn at artSize px, centred; `bg` fills the rest
 * (null = transparent). transparentArtBg drops the art's own background pixels; round masks a circle.
 */
function render({ w, h = w, artSize = Math.min(w, h), bg = PAL.b, transparentArtBg = false, round = false }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const ox = Math.floor((w - artSize) / 2);
  const oy = Math.floor((h - artSize) / 2);
  const fill = bg ? [...hexRgb(bg), 255] : [0, 0, 0, 0];
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      let px = fill;
      const ax = x - ox;
      const ay = y - oy;
      if (ax >= 0 && ay >= 0 && ax < artSize && ay < artSize) {
        const ch = ROWS[Math.floor((ay * 32) / artSize)][Math.floor((ax * 32) / artSize)];
        if (!(transparentArtBg && ch === 'b')) px = [...hexRgb(PAL[ch] ?? PAL.b), 255];
      }
      if (round) {
        const dx = x + 0.5 - w / 2;
        const dy = y + 0.5 - h / 2;
        if (dx * dx + dy * dy > (w / 2) * (w / 2)) px = [0, 0, 0, 0];
      }
      raw.set(px, y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const png = (size) => render({ w: size });

mkdirSync(join(root, 'public', 'icons'), { recursive: true });
for (const s of [192, 512]) writeFileSync(join(root, 'public', 'icons', `icon-${s}.png`), png(s));
console.log('icons written');

// ---- Android (Capacitor) launcher icons + splash, only when the native project exists
const res = join(root, 'android', 'app', 'src', 'main', 'res');
if (existsSync(res)) {
  const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, f] of Object.entries(DPI)) {
    const dir = join(res, `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });
    const legacy = Math.round(48 * f);
    writeFileSync(join(dir, 'ic_launcher.png'), render({ w: legacy }));
    writeFileSync(join(dir, 'ic_launcher_round.png'), render({ w: legacy, round: true }));
    // adaptive foreground: 108dp canvas, art kept inside the ~66dp safe circle
    const fg = Math.round(108 * f);
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), render({ w: fg, artSize: Math.round(fg * 0.6), bg: null, transparentArtBg: true }));
  }
  // splash: cream page with the flask in the middle (portrait, landscape, default)
  const CREAM = '#fff4e3';
  const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [name, [sw, sh]] of Object.entries(SPLASH)) {
    const art = Math.round(Math.min(sw, sh) * 0.35);
    writeFileSync(join(res, `drawable-port-${name}`, 'splash.png'), render({ w: sw, h: sh, artSize: art, bg: CREAM, transparentArtBg: true }));
    writeFileSync(join(res, `drawable-land-${name}`, 'splash.png'), render({ w: sh, h: sw, artSize: art, bg: CREAM, transparentArtBg: true }));
  }
  writeFileSync(join(res, 'drawable', 'splash.png'), render({ w: 480, h: 320, artSize: 112, bg: CREAM, transparentArtBg: true }));
  writeFileSync(
    join(res, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PAL.b.toUpperCase()}</color>\n</resources>\n`,
  );
  console.log('android icons + splash written');
}
