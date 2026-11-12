// Fotos da nova coleção da Marileus: Carpa Japonesa, Coração Pixelado, Dragão e Ronin.
// Cada estampa tem 3 poses (Frente, Lado, Costas); Dragão e Ronin existem em preto e off white,
// e cada cor tem a sua galeria (o seletor de cor do site troca as fotos).
//   uso: node scripts/build-marileus-colecao.mjs <pasta com os PNGs originais>
// Saída em dist/assets/<nome>-<n>-{400,800,1024}.webp + <nome>-<n>-1024.jpg (n: 1 frente, 2 lado, 3 costas).
// Todas saem em 1024x1536 (2:3): as fotos mais "quadradas" são cortadas no centro para a galeria ficar uniforme.
import sharp from 'sharp';
import {existsSync} from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'assets-src/marileus-colecao';
// nome do arquivo de saída -> [frente, lado, costas] (nomes dos arquivos originais, sem a extensão)
const SETS = {
  'geek-carpa':            ['Carpa_Japonesa_Frente_Marileus', 'Carpa_Japonesa_Lado_Marileus', 'Carpa_Japonesa_Costas'],
  'geek-coracao':          ['Cora__o_Pixelado_Frente', 'Cora__o_Pixelado_lado', 'Cora__o_Pixelado_Costas'],
  'geek-dragao-preto':     ['Dragao_Frente_Preta', 'Dragao_Lateral_Pretea', 'Dragao_Costas_Preta'],
  'geek-dragao-branco':    ['Camisa_Off_White_Frente', 'Camisa_Off_White_Lateral', 'Camisa_Off_Wihte_Costas'],
  'geek-ronin-preto':      ['Ronin_Marileus_Frente', 'Ronin_Marileus_Lateral', 'Ronin_Marileus_Costas'],
  'geek-ronin-branco':     ['Frente_Ronin', 'Lado_Roonin', 'Costas_Ronin']
};
const WIDTHS = [400, 800, 1024];

for (const [name, files] of Object.entries(SETS)) {
  for (let i = 0; i < files.length; i++) {
    const input = path.join(SRC, `${files[i]}.png`);
    if (!existsSync(input)) throw new Error(`Falta o arquivo ${input}`);
    // 1024x1536 uma vez só; os tamanhos menores saem dessa versão
    const base = await sharp(input).flatten({background: '#ffffff'}).resize({width: 1024, height: 1536, fit: 'cover', position: 'centre'}).toBuffer();
    const n = i + 1;
    for (const w of WIDTHS) await sharp(base).resize({width: w}).webp({quality: 80, effort: 6}).toFile(`dist/assets/${name}-${n}-${w}.webp`);
    await sharp(base).jpeg({quality: 82, mozjpeg: true}).toFile(`dist/assets/${name}-${n}-1024.jpg`);
  }
  console.log(`${name}: 3 poses`);
}
