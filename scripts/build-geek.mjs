// Assets dos primeiros drops da duavessogeek (2 produtos, 3 fotos cada), otimizados p/ web.
// Fontes originais enviadas pelo usuário (mantidas fora do repo).
import sharp from 'sharp';
const BASE = 'C:/Users/franc/AppData/Local/Temp/claude/C--Users-franc-OneDrive-Documentos-ChatGPT-Jogos-doavesso/0722807f-de1c-475c-b8d4-238c821ffb4b/images';
const SRC = {
  'geek-coracao-1': `${BASE}/2.webp`, // Coração Pixelado: frente (PLAYER 01)
  'geek-coracao-2': `${BASE}/3.webp`, // Coração Pixelado: costas
  'geek-coracao-3': `${BASE}/4.webp`, // Coração Pixelado: lado
  'geek-carpa-1':   `${BASE}/1.webp`, // Carpa Japonesa: frente (koi + sol)
  'geek-carpa-2':   `${BASE}/5.webp`, // Carpa Japonesa: costas
  'geek-carpa-3':   `${BASE}/6.webp`, // Carpa Japonesa: lado
};
const WIDTHS = [400, 800, 1024];
for (const [name, src] of Object.entries(SRC)) {
  for (const w of WIDTHS) {
    await sharp(src).resize({width: w}).webp({quality: 80}).toFile(`dist/assets/${name}-${w}.webp`);
  }
  await sharp(src).resize({width: 1024}).jpeg({quality: 82, mozjpeg: true}).toFile(`dist/assets/${name}-1024.jpg`);
  console.log(`${name}: ${WIDTHS.length} webp + 1 jpg`);
}
