// Acento pixel (invader) da duavessogeek — placeholder minimalista, gerado como SVG.
import {writeFileSync} from 'node:fs';
const G = [
  '00100000100',
  '00010001000',
  '00111111100',
  '01101110110',
  '11111111111',
  '10111111101',
  '10100000101',
  '00011011000',
];
const cell = 24, cols = G[0].length, rows = G.length, gap = 2;
let rects = '';
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  if (G[y][x] === '1') rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell - gap}" height="${cell - gap}"/>`;
}
const w = cols * cell, h = rows * cell;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="#3a5bff"><title>duavessogeek</title>${rects}</svg>\n`;
writeFileSync('dist/assets/geek-invader.svg', svg);
console.log(`geek-invader.svg ${w}x${h}`);
