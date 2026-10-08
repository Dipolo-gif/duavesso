// Tema de cada marca: cores livres (sólido ou degradê + destaque) com leitura garantida.
// O texto vira preto ou branco, o que for mais legível no ponto mais difícil do fundo; o destaque
// é escurecido ou clareado até ter contraste 3:1 com todas as cores do fundo; se o degradê deixar
// parte do texto com pouco contraste, entra uma sombra leve. O dono vê um aviso quando algo é ajustado.
export const DEFAULT_THEME={mode:'solid',c1:'#161719',c2:'#161719',angle:135,accent:'#1737bc'};
export const isHex=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);

export function normalizeTheme(t){
 const x=t&&typeof t==='object'?t:{};
 const c1=isHex(x.c1)?x.c1.toLowerCase():DEFAULT_THEME.c1;
 return {mode:x.mode==='gradient'?'gradient':'solid',c1,c2:isHex(x.c2)?x.c2.toLowerCase():c1,
  angle:Number.isInteger(x.angle)&&x.angle>=0&&x.angle<=360?x.angle:DEFAULT_THEME.angle,
  accent:isHex(x.accent)?x.accent.toLowerCase():DEFAULT_THEME.accent};
}

const channels=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
export function luminance(hex){
 const [r,g,b]=channels(hex).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*r+.7152*g+.0722*b;
}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function mix(a,b,k){const x=channels(a),y=channels(b);return '#'+x.map((v,i)=>Math.round((v+(y[i]-v)*k)*255).toString(16).padStart(2,'0')).join('');}

// Preto ou branco, pelo pior ponto do fundo
export function textColorFor(ends){
 const worst=c=>Math.min(...ends.map(e=>contrast(e,c)));
 const w=worst('#ffffff'),k=worst('#111111');
 return w>=k?{color:'#ffffff',min:w}:{color:'#111111',min:k};
}
// Destaque com contraste mínimo de 3:1 contra todas as cores do fundo
export function fixAccent(accent,ends){
 const ok=c=>ends.every(e=>contrast(c,e)>=3);
 if(ok(accent))return {color:accent,adjusted:false};
 const avg=ends.reduce((s,e)=>s+luminance(e),0)/ends.length,target=avg>.4?'#000000':'#ffffff';
 for(let k=.05;k<=1.0001;k+=.05){const c=mix(accent,target,Math.min(1,k));if(ok(c))return {color:c,adjusted:true};}
 return {color:target,adjusted:true};
}

// Tudo o que a página precisa para pintar a marca, mais os avisos para o editor
export function themeStyle(theme){
 const t=normalizeTheme(theme),ends=t.mode==='gradient'?[t.c1,t.c2]:[t.c1];
 const text=textColorFor(ends),accent=fixAccent(t.accent,ends),notes=[];
 if(accent.adjusted)notes.push(`Ajustamos o destaque (${accent.color.toUpperCase()}) para continuar legível sobre o fundo.`);
 const shadow=text.min<4.5;
 if(shadow)notes.push('Parte do fundo ficou com pouco contraste para o texto: colocamos uma sombra leve nas letras.');
 return {theme:t,paint:t.mode==='gradient'?`linear-gradient(${t.angle}deg,${t.c1},${t.c2})`:t.c1,bg:t.c1,text:text.color,
  accent:accent.color,onAccent:textColorFor([accent.color]).color,shadow,notes};
}
// Variáveis CSS para o atributo style do bloco da marca
export function themeCSS(theme){
 const s=themeStyle(theme);
 return `--brand-paint:${s.paint};--brand-bg:${s.bg};--brand-text:${s.text};--brand-accent:${s.accent};--brand-on-accent:${s.onAccent};--brand-logo-filter:${s.text==='#ffffff'?'brightness(0) invert(1)':'none'};--brand-shadow:${s.shadow?'0 1px 2px #0000008c':'none'}`;
}
