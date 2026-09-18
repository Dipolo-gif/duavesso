// Banner oficial da TRY84 (bola no concreto) — hero da página da marca.
import sharp from 'sharp';
const url = 'https://r2.mont.ink/430443/iqh1lr3d36.png';
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
await sharp(buf).resize({width: 1800}).webp({quality: 82}).toFile('dist/assets/try84-hero.webp');
await sharp(buf).resize({width: 1800}).jpeg({quality: 82, mozjpeg: true}).toFile('dist/assets/try84-hero.jpg');
console.log('try84-hero: webp+jpg', (await sharp(buf).metadata()).width + 'w');
