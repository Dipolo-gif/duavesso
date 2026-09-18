// Otimiza as 10 estampas da SolFáDó (fotos enviadas pelo usuário) para webp+jpg locais.
import sharp from 'sharp';
const SRC = 'C:/Users/franc/Downloads';
const MAP = {
  'solfado-flor': 'o-minha-flor.png',
  'solfado-caquinho': 'caquinho.png',
  'solfado-petalas': 'petalas-de-rosa.png',
  'solfado-ester': 'te-chamo-de-ester.png',
  'solfado-asas': 'queria-ter-asas-para-voar.png',
  'solfado-violeiro': 'violeiro-de-guerra.png',
  'solfado-joias': 'somos-joias-preciosas.png',
  'solfado-brilha': 'brilha-mais-e-mais.png',
  'solfado-bencaos': 'bencaos-deus-derramara.png',
  'solfado-cordeirinho': 'eu-sou-um-cordeirinho.png',
};
for (const [slug, file] of Object.entries(MAP)) {
  const src = `${SRC}/${file}`;
  await sharp(src).resize({width: 800}).webp({quality: 82}).toFile(`dist/assets/${slug}.webp`);
  await sharp(src).resize({width: 800}).jpeg({quality: 82, mozjpeg: true}).toFile(`dist/assets/${slug}.jpg`);
  console.log(`${slug}: webp+jpg`);
}
