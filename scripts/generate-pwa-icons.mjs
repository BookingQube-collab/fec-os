/**
 * Rasterizes FEC-OS PWA icons (charcoal mark + mustard F on cream).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CREAM = [253, 248, 236, 255];
const CHARCOAL = [26, 26, 26, 255];
const MUSTARD = [245, 197, 24, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function setPx(rgba, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, size, x0, y0, w, h, color) {
  const x1 = Math.round(x0 + w);
  const y1 = Math.round(y0 + h);
  for (let y = Math.round(y0); y < y1; y++) {
    for (let x = Math.round(x0); x < x1; x++) setPx(rgba, size, x, y, color);
  }
}

function fillCircle(rgba, size, cx, cy, r, color) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(size - 1, Math.ceil(cx + r));
  const y1 = Math.min(size - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPx(rgba, size, x, y, color);
    }
  }
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = CREAM[0];
    rgba[i * 4 + 1] = CREAM[1];
    rgba[i * 4 + 2] = CREAM[2];
    rgba[i * 4 + 3] = CREAM[3];
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  fillCircle(rgba, size, cx, cy, r, CHARCOAL);

  const unit = r / 5.2;
  const left = cx - unit * 2.05;
  const top = cy - unit * 2.35;
  const stemW = unit * 1.15;
  const barH = unit * 1.05;
  const topW = unit * 4.1;
  const midW = unit * 3.05;
  const midY = top + unit * 2.15;

  fillRect(rgba, size, left, top, stemW, unit * 4.7, MUSTARD);
  fillRect(rgba, size, left, top, topW, barH, MUSTARD);
  fillRect(rgba, size, left, midY, midW, barH, MUSTARD);

  return encodePng(size, size, rgba);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon-192.png"), drawIcon(192));
writeFileSync(join(outDir, "icon-512.png"), drawIcon(512));
writeFileSync(join(outDir, "apple-touch-icon.png"), drawIcon(180));
console.log("Wrote icon-192.png, icon-512.png, apple-touch-icon.png");
