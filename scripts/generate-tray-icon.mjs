/**
 * 生成 placeholder tray icon (16x16 grayscale PNG，深灰底白色 K 字形)
 * 純 Node：zlib + 自寫 CRC32，不引依賴。執行：node scripts/generate-tray-icon.mjs
 * 後續換正式圖示直接覆蓋 assets/tray-icon.png 即可，可以不用再跑此腳本。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 16;
const BG = 0x33;
const FG = 0xee;

// 16x16 K 字形 mask (1=前景白, 0=背景灰)
const MASK = [
  '0000000000000000',
  '0000000000000000',
  '0011000000011000',
  '0011000000110000',
  '0011000001100000',
  '0011000011000000',
  '0011000110000000',
  '0011001100000000',
  '0011011000000000',
  '0011110000000000',
  '0011011000000000',
  '0011001100000000',
  '0011000110000000',
  '0011000011000000',
  '0000000000000000',
  '0000000000000000',
];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // color type (grayscale)
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const pixels = Buffer.alloc(SIZE * (SIZE + 1));
for (let y = 0; y < SIZE; y++) {
  pixels[y * (SIZE + 1)] = 0; // filter type none
  for (let x = 0; x < SIZE; x++) {
    pixels[y * (SIZE + 1) + 1 + x] = MASK[y][x] === '1' ? FG : BG;
  }
}
const idat = deflateSync(pixels);

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(projectRoot, 'assets', 'tray-icon.png');
if (!existsSync(dirname(outPath))) mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, png);
console.log(`Wrote ${png.length} bytes to ${outPath}`);
