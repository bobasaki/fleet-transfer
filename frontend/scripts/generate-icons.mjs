import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/icon.svg');
const outDir = resolve(__dirname, '../public');
const svgBuffer = readFileSync(svgPath);

const icons = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

for (const { name, size } of icons) {
  await sharp(svgBuffer).resize(size, size).png().toFile(resolve(outDir, name));
  console.log(`Generated ${name} (${size}x${size})`);
}

// Maskable: content scaled to 80% centred on brand-color canvas
const maskableSize = 512;
const contentSize = Math.round(maskableSize * 0.8); // 410
const offset = Math.round((maskableSize - contentSize) / 2); // 51

const contentBuffer = await sharp(svgBuffer).resize(contentSize, contentSize).png().toBuffer();

await sharp({
  create: { width: maskableSize, height: maskableSize, channels: 3, background: { r: 23, g: 74, b: 139 } },
})
  .composite([{ input: contentBuffer, left: offset, top: offset }])
  .png()
  .toFile(resolve(outDir, 'icon-512-maskable.png'));

console.log(`Generated icon-512-maskable.png (${maskableSize}x${maskableSize}, content ${contentSize}x${contentSize})`);
