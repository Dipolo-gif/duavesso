// Optimize the imagegen-edited wordmark without changing its artwork.
import sharp from 'sharp';
const source=process.argv[2];
if(!source)throw new Error('Usage: node scripts/brand-wordmark.mjs <approved-transparent-png>');
const meta=await sharp(source).metadata();
if(!meta.hasAlpha)throw new Error('The logo must have a transparent background.');
// 800 px cobre o maior uso (44 px de altura em tela 3x); paleta de 16 cores: ~7 KB em vez de ~92 KB, sem diferença visível.
await sharp(source).trim().resize({width:800}).png({palette:true,colors:16,compressionLevel:9,effort:10}).toFile('dist/assets/logo-duavesso.png');
