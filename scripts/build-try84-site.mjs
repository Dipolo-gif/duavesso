// Logos do site exclusivo da TRY84 (/try84), a partir das artes oficiais em assets-src/try84/.
// As artes vêm em preto sobre branco (ou branco sobre preto); aqui viram PNG transparente, recortado,
// em branco (para o fundo escuro do site) e em preto (para o fundo claro), mais o ícone da aba e a
// imagem de prévia de link. Rodar de novo quando a marca mandar arte nova:  node scripts/build-try84-site.mjs
import sharp from 'sharp';

const SRC = new URL('../assets-src/try84/', import.meta.url);
const OUT = new URL('../dist/assets/', import.meta.url);
const src = name => new URL(name, SRC).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = name => new URL(name, OUT).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Tinta da arte vira opacidade: em arte escura sobre fundo claro, quanto mais escuro, mais opaco
async function ink(file, {inkIsDark = true, width, region} = {}) {
  let base = sharp(src(file));
  if (region) base = sharp(await base.extract(region).toBuffer());
  const {data, info} = await base.greyscale().raw().toBuffer({resolveWithObject: true});
  const n = info.width * info.height, alpha = new Uint8Array(n);
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) {
    const lum = data[i * info.channels];
    let a = inkIsDark ? 255 - lum : lum;
    a = a < 40 ? 0 : a > 215 ? 255 : Math.round((a - 40) / 175 * 255); // limpa o ruído do JPG
    alpha[i] = a;
    if (a) {const x = i % info.width, y = (i / info.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;}
  }
  // Recorta na tinta, com uma margem pequena
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(info.width - 1, x1 + pad); y1 = Math.min(info.height - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const make = async ({r, g, b}, name) => {
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = alpha[(y + y0) * info.width + (x + x0)];
    }
    let img = sharp(rgba, {raw: {width: w, height: h, channels: 4}});
    if (width && w > width) img = img.resize({width});
    const meta = await img.png({compressionLevel: 9}).toFile(out(name));
    console.log(`${name}: ${meta.width}x${meta.height}`);
  };
  return {white: n => make({r: 245, g: 244, b: 240}, n), black: n => make({r: 20, g: 20, b: 20}, n)};
}

const player = await ink('logo-jogador.jpg', {width: 900});
await player.white('try84-logo.png');
await player.black('try84-logo-dark.png');
const mark = await ink('monograma-t84.jpg', {width: 600});
await mark.white('try84-mark.png');
await mark.black('try84-mark-dark.png');
const word = await ink('wordmark-branco.jpg', {inkIsDark: false, width: 900});
await word.white('try84-word.png');
await word.black('try84-word-dark.png');

// Ícone da aba: monograma branco num quadrado preto
const icon = await sharp(out('try84-mark.png')).resize({width: 200}).toBuffer();
await sharp({create: {width: 256, height: 256, channels: 4, background: '#0d0d0e'}})
  .composite([{input: icon, gravity: 'center'}]).png().toFile(out('try84-icon.png'));
console.log('try84-icon.png: 256x256');

// Prévia de link (1200x630): bola no concreto escurecida, com o logo do jogador por cima
const hero = await sharp(out('try84-hero.jpg')).resize({width: 1200, height: 630, fit: 'cover', position: 'right'})
  .modulate({brightness: 0.55}).toBuffer();
const logo = await sharp(out('try84-logo.png')).resize({width: 560}).toBuffer();
await sharp(hero).composite([{input: logo, left: 70, top: 150}]).jpeg({quality: 84, mozjpeg: true}).toFile(out('try84-og.jpg'));
console.log('try84-og.jpg: 1200x630');
