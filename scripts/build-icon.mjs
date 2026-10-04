// Regenerates build/icon.ico (PNG-compressed, multi-size) from build/icon.png.
// Usage: node scripts/build-icon.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

export async function buildIco(sourcePng, sizes = ICO_SIZES) {
  const images = await Promise.all(
    sizes.map((size) =>
      sharp(sourcePng).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer(),
    ),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const out = path.join(root, "build", "icon.ico");
  fs.writeFileSync(out, await buildIco(path.join(root, "build", "icon.png")));
  console.log(`wrote ${out}`);
}
