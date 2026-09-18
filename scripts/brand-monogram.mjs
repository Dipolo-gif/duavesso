// Export the imagegen artwork at delivery sizes, preserving its transparency.
import sharp from 'sharp';
const source=process.argv[2];
if(!source)throw new Error('Usage: node scripts/brand-monogram.mjs <generated-png>');
await sharp(source).resize({width:1024}).png({compressionLevel:9}).toFile('dist/assets/duavesso-monogram.png');
// O favicon é montado por scripts/brand-favicon.mjs (usa a marca recortada, ampliada).
