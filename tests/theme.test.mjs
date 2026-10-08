import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTheme,themeStyle,themeCSS,contrast,fixAccent,textColorFor,DEFAULT_THEME} from '../dist/brand-theme.js';
import {hexToRgb,rgbToHex,rgbToHsv,hsvToRgb,rgbToHsl,hslToRgb} from '../dist/color-picker.js';

test('color conversions round-trip between HEX, RGB, HSV and HSL',()=>{
 for(const hex of ['#000000','#ffffff','#1737bc','#e6ff3a','#8a6a4f','#3b1a4a','#7f7f7f']){
  const rgb=hexToRgb(hex);
  assert.equal(rgbToHex(...hsvToRgb(...rgbToHsv(...rgb))),hex,`hsv ${hex}`);
  assert.equal(rgbToHex(...hslToRgb(...rgbToHsl(...rgb))),hex,`hsl ${hex}`);
 }
 assert.deepEqual(hexToRgb('#1737bc'),[23,55,188]);
 assert.equal(rgbToHex(300,-5,127.6),'#ff0080','limita e arredonda');
});

test('theme: invalid or missing values fall back to safe defaults',()=>{
 assert.deepEqual(normalizeTheme(null),DEFAULT_THEME);
 assert.deepEqual(normalizeTheme({mode:'neon',c1:'red',angle:999,accent:'#ABCDEF'}),{...DEFAULT_THEME,accent:'#abcdef'});
 assert.equal(normalizeTheme({c1:'#112233'}).c2,'#112233','sem segunda cor, repete a primeira');
});

test('theme: text is black or white by the worst point of the background; accent keeps 3:1',()=>{
 assert.equal(textColorFor(['#141519']).color,'#ffffff');
 assert.equal(textColorFor(['#f4f2ec']).color,'#111111');
 const dark=themeStyle({mode:'solid',c1:'#1c1d1f',accent:'#e6ff3a'});
 assert.deepEqual([dark.text,dark.accent,dark.onAccent,dark.shadow,dark.notes],['#ffffff','#e6ff3a','#111111',false,[]]);
 const light=themeStyle({mode:'solid',c1:'#f4f2ec',accent:'#ffe600'});
 assert.notEqual(light.accent,'#ffe600','amarelo sobre claro é escurecido');
 assert(contrast(light.accent,'#f4f2ec')>=3);
 assert.match(light.notes[0],/Ajustamos o destaque/);
 const grad=themeStyle({mode:'gradient',c1:'#1c1d1f',c2:'#f4f2ec',angle:90,accent:'#3a5bff'});
 assert.equal(grad.paint,'linear-gradient(90deg,#1c1d1f,#f4f2ec)');
 assert.equal(grad.shadow,true,'degradê do escuro ao claro: sombra no texto');
 assert(grad.notes.some(n=>/sombra leve/.test(n)));
 assert(['#1c1d1f','#f4f2ec'].every(e=>contrast(grad.accent,e)>=3),'destaque legível nas duas pontas');
 assert.equal(fixAccent('#ffffff',['#ffffff']).color!=='#ffffff',true);
});

test('theme: CSS variables for the brand block',()=>{
 const css=themeCSS({mode:'solid',c1:'#141519',accent:'#3a5bff'});
 for(const v of ['--brand-paint:#141519','--brand-bg:#141519','--brand-text:#ffffff','--brand-accent:','--brand-on-accent:','--brand-logo-filter:brightness(0) invert(1)','--brand-shadow:none'])assert(css.includes(v),v);
});
