import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// Deterministic PNG assets without a graphics dependency. The calendar artwork
// fits inside the central maskable safe zone; the background covers the icon.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, checksum]);
}
function icon(size) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  function rect(x, y, left, top, right, bottom) {
    return x >= left && x < right && y >= top && y < bottom;
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x / size;
      const py = y / size;
      let color = [37, 99, 235];
      if (rect(px, py, 0.25, 0.28, 0.75, 0.75)) color = [250, 250, 250];
      if (rect(px, py, 0.25, 0.28, 0.75, 0.4)) color = [191, 219, 254];
      if (
        rect(px, py, 0.34, 0.23, 0.39, 0.35) ||
        rect(px, py, 0.61, 0.23, 0.66, 0.35)
      )
        color = [24, 24, 27];
      for (const left of [0.34, 0.46, 0.58])
        for (const top of [0.47, 0.6]) {
          if (rect(px, py, left, top, left + 0.08, top + 0.07))
            color = [37, 99, 235];
        }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set([...color, 255], offset);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const [name, size] of [
  ["pwa-192.png", 192],
  ["pwa-512.png", 512],
  ["pwa-maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), icon(size));
  console.log(`Generated public/${name} (${size}×${size})`);
}
