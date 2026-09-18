// Otimiza as fotos de produto da TRY84 (baixadas de mont.ink) para webp+jpg locais.
import sharp from 'sharp';
const SRC = 'C:/Users/franc/AppData/Local/Temp/claude/C--Users-franc-OneDrive-Documentos-ChatGPT-Jogos-doavesso/0722807f-de1c-475c-b8d4-238c821ffb4b/scratchpad/try84';
const SLUGS = ['tryman', 't001', 't002', 'jonah', 'street'];
for (const s of SLUGS) {
  await sharp(`${SRC}/${s}.img`).resize({width: 800}).webp({quality: 82}).toFile(`dist/assets/try84-${s}.webp`);
  await sharp(`${SRC}/${s}.img`).resize({width: 800}).jpeg({quality: 82, mozjpeg: true}).toFile(`dist/assets/try84-${s}.jpg`);
  console.log(`try84-${s}: webp+jpg`);
}
