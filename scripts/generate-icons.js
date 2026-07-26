const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return result;
}

function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function createIcon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const scale = size / 512;
  const monogram = [[92,360],[92,146],[168,264],[256,114],[344,264],[420,146],[420,360],[362,360],[362,244],[256,414],[150,244],[150,360]];
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const offset = row + 1 + x * 4;
      const nx = x / scale;
      const ny = y / scale;
      const distance = Math.hypot(nx - 256, ny - 190) / 360;
      const shade = Math.max(7, Math.round(31 - distance * 24));
      let red = shade + 5;
      let green = shade + 3;
      let blue = shade;
      const border = nx >= 23 && nx <= 489 && ny >= 23 && ny <= 489 &&
        (nx <= 29 || nx >= 483 || ny <= 29 || ny >= 483);
      if (border) { red = 181; green = 140; blue = 59; }
      if (insidePolygon(nx, ny, monogram)) {
        const t = Math.max(0, Math.min(1, (ny - 110) / 310));
        red = Math.round(255 - 137 * t);
        green = Math.round(240 - 160 * t);
        blue = Math.round(173 - 149 * t);
      }
      if (ny >= 387 && ny <= 393 && nx >= 104 && nx <= 408) {
        red = 230; green = 194; blue = 103;
      }
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
      raw[offset + 3] = 255;
    }
  }
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const outputDirectory = path.join(__dirname, '..', 'public', 'assets');
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outputDirectory, `app-icon-${size}.png`), createIcon(size));
}
