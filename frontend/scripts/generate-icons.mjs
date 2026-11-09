import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const carSrc = resolve(__dirname, '../assets/car.png');
const outDir = resolve(__dirname, '../public');

// 1. White car: the source is a black silhouette on opaque white, so the
//    inverted luminance becomes the alpha mask; fill it white.
const { width: carW, height: carH } = await sharp(carSrc).metadata();
const carAlpha = await sharp(carSrc)
  .flatten({ background: '#ffffff' })
  .toColourspace('b-w')
  .negate({ alpha: false })
  .raw({ depth: 'uchar' })
  .toBuffer();
const carWhite = await sharp({
  create: { width: carW, height: carH, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .joinChannel(carAlpha, { raw: { width: carW, height: carH, channels: 1 } })
  .png()
  .toBuffer();
writeFileSync(resolve(outDir, 'car-white.png'), carWhite);
console.log(`Generated car-white.png (${carW}x${carH})`);

// 2. icon.svg: brand gradient, corner ticks, white car embedded as a data URI.
const carHref = `data:image/png;base64,${carWhite.toString('base64')}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F5FAE"/><stop offset="1" stop-color="#174A8B"/></linearGradient></defs>
  <rect width="1000" height="1000" fill="url(#bg)"/>
  <g stroke="#fff" stroke-width="22" stroke-linecap="round" fill="none" opacity="0.5">
    <path d="M150,250 L150,205 L195,205"/>
    <path d="M850,750 L850,795 L805,795"/>
  </g>
  <image x="200" y="200" width="600" height="600" href="${carHref}"/>
</svg>
`;
writeFileSync(resolve(outDir, 'icon.svg'), svg);
console.log('Generated icon.svg');
const svgBuffer = Buffer.from(svg);

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
