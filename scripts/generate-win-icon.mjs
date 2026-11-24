#!/usr/bin/env node
/**
 * Generates build/icon.ico from public/pwa-512x512.png (downsampling RGBA 512x512 -> 256x256
 * as an embedded PNG inside a Windows .ico container) using pure Node built-ins.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcPngPath = path.join(rootDir, 'public', 'pwa-512x512.png');
const buildDir = path.join(rootDir, 'build');
const outIcoPath = path.join(buildDir, 'icon.ico');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcPayload = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcPayload), 0);
  return Buffer.concat([lenBuf, crcPayload, crcBuf]);
}

function decodePngRgba(pngBuf) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < pngBuf.length) {
    const length = pngBuf.readUInt32BE(offset);
    const type = pngBuf.toString('ascii', offset + 4, offset + 8);
    const data = pngBuf.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`Unsupported PNG format for ICO generation (bitDepth=${bitDepth}, colorType=${colorType})`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  const prevRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filterType = inflated[rowStart];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const raw = inflated[rowStart + 1 + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      let recon = raw;
      if (filterType === 1) recon = (raw + a) & 0xff;
      else if (filterType === 2) recon = (raw + b) & 0xff;
      else if (filterType === 3) recon = (raw + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        recon = (raw + pr) & 0xff;
      }
      row[x] = recon;
    }
    row.copy(prevRow);

    for (let px = 0; px < width; px++) {
      const dstIdx = (y * width + px) * 4;
      const srcIdx = px * bpp;
      rgba[dstIdx] = row[srcIdx];
      rgba[dstIdx + 1] = row[srcIdx + 1];
      rgba[dstIdx + 2] = row[srcIdx + 2];
      rgba[dstIdx + 3] = bpp === 4 ? row[srcIdx + 3] : 255;
    }
  }

  return { width, height, rgba };
}

function resizeRgbaNearestOrBox(src, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x * scaleX));
      const sy = Math.min(srcH - 1, Math.floor(y * scaleY));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

function encodePngRgba(rgba, width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowOut = y * (stride + 1);
    raw[rowOut] = 0;
    rgba.copy(raw, rowOut + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIcoFromPngBuffers(entries) {
  // entries: Array<{ size: number, png: Buffer }> (size 256 encoded as 0)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let currentOffset = 6 + entries.length * 16;

  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    const dimByte = entry.size >= 256 ? 0 : entry.size;
    dir[0] = dimByte;
    dir[1] = dimByte;
    dir[2] = 0; // palette count
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bpp
    dir.writeUInt32LE(entry.png.length, 8);
    dir.writeUInt32LE(currentOffset, 12);
    dirEntries.push(dir);
    currentOffset += entry.png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

fs.mkdirSync(buildDir, { recursive: true });
const srcBuf = fs.readFileSync(srcPngPath);
const decoded = decodePngRgba(srcBuf);
const sizes = [256, 128, 64, 48, 32, 16];
const icoEntries = sizes.map((size) => {
  const resized = resizeRgbaNearestOrBox(
    decoded.rgba,
    decoded.width,
    decoded.height,
    size,
    size
  );
  return { size, png: encodePngRgba(resized, size, size) };
});

const icoBuffer = createIcoFromPngBuffers(icoEntries);
fs.writeFileSync(outIcoPath, icoBuffer);
console.log(`Generated multi-size Windows icon -> build/icon.ico (${icoBuffer.length} bytes)`);
