// Seletor de cor da aba "Minha Marca": roda de matiz com quadrado de saturação e brilho, abas HSL e RGB
// com barras coloridas, campos HEX e R G B, conta-gotas (Chrome e Edge), cores rápidas e cores usadas.
// Abre logo abaixo da linha da cor escolhida; cada mudança chama onChange(hex) na hora.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const hexToRgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
export const rgbToHex=(r,g,b)=>'#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
export function rgbToHsv(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}return [h,mx?d/mx:0,mx];}
export function hsvToRgb(h,s,v){const f=n=>{const k=(n+h/60)%6;return v-v*s*Math.max(0,Math.min(k,4-k,1));};return [f(5)*255,f(3)*255,f(1)*255];}
export function rgbToHsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}return [h,s,l];}
export function hslToRgb(h,s,l){const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};return [f(0)*255,f(8)*255,f(4)*255];}
export const QUICK_COLORS=['#161719','#f4f2ec','#1737bc','#3a5bff','#0f766e','#22c55e','#d4ff3a','#facc15','#f97316','#e11d48','#be185d','#7c3aed','#8a6a4f','#e8dcc6','#14233c','#4a1724'];
const RECENT_KEY='duavesso.cores-recentes';
const DROP_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4.5l5 5M17 2.5l4.5 4.5-3 3-4.5-4.5zM14 8l-9 9-1.5 4 4-1.5 9-9"/></svg>';
export const eyedropperIcon=DROP_ICON;
// Pega uma cor da tela; null se o navegador não tiver conta-gotas ou a pessoa cancelar
export async function pickFromScreen(){
 if(typeof window==='undefined'||!('EyeDropper' in window))return null;
 try{return (await new window.EyeDropper().open()).sRGBHex.toLowerCase();}catch{return null;}
}

export function createColorPicker(){
 const pk=document.createElement('div');
 pk.className='cpk';pk.setAttribute('role','dialog');pk.setAttribute('aria-label','Seletor de cor');pk.hidden=true;
 pk.innerHTML=`<div class="cpk-top"><div class="cpk-wheel"><div class="cpk-ring" aria-label="Matiz: arraste para girar a roda"></div><span class="cpk-mk cpk-mk-h"></span><div class="cpk-sv" aria-label="Saturação e brilho"></div><span class="cpk-mk cpk-mk-sv"></span></div>
<div class="cpk-side"><div class="cpk-cmp"><span class="cpk-old">Atual</span><span class="cpk-new">Nova</span></div><div class="cpk-hexrow"><label>HEX<input class="cpk-hex" maxlength="7" spellcheck="false" autocomplete="off"></label><button type="button" class="cpk-drop" title="Conta-gotas: pegar uma cor da tela" aria-label="Conta-gotas">${DROP_ICON}</button></div>
<div class="cpk-rgb">${['R','G','B'].map(c=>`<label>${c}<input type="number" min="0" max="255" data-ch="${c}"></label>`).join('')}</div></div></div>
<div class="cpk-tabs" role="tablist"><button type="button" class="on" data-tab="hsl">HSL</button><button type="button" data-tab="rgb">RGB</button></div>
<div class="cpk-sliders">${[0,1,2].map(i=>`<label class="cpk-sl"><span></span><input type="range" min="0" step="1" data-i="${i}"><output></output></label>`).join('')}</div>
<div class="cpk-quick"><small>Cores rápidas</small><div class="cpk-row cpk-fixed">${QUICK_COLORS.map(c=>`<button type="button" style="background:${c}" data-c="${c}" title="${c.toUpperCase()}" aria-label="Usar ${c.toUpperCase()}"></button>`).join('')}</div><small class="cpk-rec-l" hidden>Usadas por você</small><div class="cpk-row cpk-recent"></div></div>
<div class="cpk-foot"><small class="cpk-msg">Arraste na roda e no quadrado, ou digite o código.</small><button type="button" class="button button-blue cpk-ok">Pronto</button></div>`;
 const q=s=>pk.querySelector(s);
 let hsv=[0,0,0],old='#000000',tab='hsl',onChange=null,anchor=null;
 const hexNow=()=>rgbToHex(...hsvToRgb(...hsv));
 const readRecent=()=>{try{const v=JSON.parse(localStorage.getItem(RECENT_KEY));return Array.isArray(v)?v.filter(c=>/^#[0-9a-f]{6}$/.test(c)).slice(0,8):[];}catch{return [];}};
 const paintRecent=()=>{const r=readRecent();q('.cpk-recent').innerHTML=r.map(c=>`<button type="button" style="background:${c}" data-c="${c}" title="${c.toUpperCase()}" aria-label="Usar ${c.toUpperCase()}"></button>`).join('');q('.cpk-rec-l').hidden=!r.length;};
 const light=h=>{const [r,g,b]=hexToRgb(h);return (.299*r+.587*g+.114*b)/255>.45;};
 function paint(skip){
  const hex=hexNow(),[r,g,b]=hexToRgb(hex),[hh,ss,ll]=rgbToHsl(r,g,b);
  pk.style.setProperty('--cpk-hue',`hsl(${hsv[0]},100%,50%)`);
  const a=hsv[0]*Math.PI/180;
  Object.assign(q('.cpk-mk-h').style,{left:`${50+Math.sin(a)*40.5}%`,top:`${50-Math.cos(a)*40.5}%`,background:`hsl(${hsv[0]},100%,50%)`});
  Object.assign(q('.cpk-mk-sv').style,{left:`${23+hsv[1]*54}%`,top:`${23+(1-hsv[2])*54}%`,background:hex});
  Object.assign(q('.cpk-old').style,{background:old,color:light(old)?'#111':'#fff'});
  Object.assign(q('.cpk-new').style,{background:hex,color:light(hex)?'#111':'#fff'});
  if(skip!=='hex'){q('.cpk-hex').value=hex.toUpperCase();q('.cpk-hex').classList.remove('bad');}
  if(skip!=='rgb')[r,g,b].forEach((v,i)=>{pk.querySelectorAll('.cpk-rgb input')[i].value=v;});
  const rows=tab==='hsl'
   ?[['H',hh,360,`linear-gradient(to right,${[0,60,120,180,240,300,360].map(x=>`hsl(${x},${ss*100}%,${ll*100}%)`).join(',')})`,`${Math.round(hh)}°`],['S',ss*100,100,`linear-gradient(to right,hsl(${hh},0%,${ll*100}%),hsl(${hh},100%,${ll*100}%))`,`${Math.round(ss*100)}%`],['L',ll*100,100,`linear-gradient(to right,#000,hsl(${hh},${ss*100}%,50%),#fff)`,`${Math.round(ll*100)}%`]]
   :[['R',r,255,`linear-gradient(to right,${rgbToHex(0,g,b)},${rgbToHex(255,g,b)})`,r],['G',g,255,`linear-gradient(to right,${rgbToHex(r,0,b)},${rgbToHex(r,255,b)})`,g],['B',b,255,`linear-gradient(to right,${rgbToHex(r,g,0)},${rgbToHex(r,g,255)})`,b]];
  pk.querySelectorAll('.cpk-sl').forEach((lab,i)=>{const [name,val,max,track,out]=rows[i],inp=lab.querySelector('input');lab.querySelector('span').textContent=name;inp.max=max;inp.setAttribute('aria-label',name);if(document.activeElement!==inp)inp.value=Math.round(val);inp.style.setProperty('--track',track);lab.querySelector('output').textContent=out;});
  onChange?.(hex);
 }
 const setRgb=(r,g,b,skip)=>{const keep=hsv[0];hsv=rgbToHsv(r,g,b);if(hsv[1]===0||hsv[2]===0)hsv[0]=keep;paint(skip);};
 const setHex=(h,skip)=>setRgb(...hexToRgb(h),skip);
 pk.querySelectorAll('.cpk-sl input').forEach(inp=>inp.addEventListener('input',()=>{
  const i=+inp.dataset.i,v=+inp.value,[r,g,b]=hexToRgb(hexNow());
  if(tab==='rgb'){const c=[r,g,b];c[i]=v;setRgb(...c);return;}
  const hsl=rgbToHsl(r,g,b);hsl[0]=i===0?v:hsl[0];hsl[1]=i===1?v/100:hsl[1];hsl[2]=i===2?v/100:hsl[2];
  const keep=i===0?v:hsv[0];hsv=rgbToHsv(...hslToRgb(...hsl));if(hsv[1]===0||hsv[2]===0||i===0)hsv[0]=keep;paint();
 }));
 function drag(node,fn){node.addEventListener('pointerdown',e=>{try{node.setPointerCapture(e.pointerId);}catch{}fn(e);const mv=ev=>fn(ev),up=()=>{node.removeEventListener('pointermove',mv);node.removeEventListener('pointerup',up);};node.addEventListener('pointermove',mv);node.addEventListener('pointerup',up);});}
 drag(q('.cpk-ring'),e=>{const r=q('.cpk-wheel').getBoundingClientRect();let a=Math.atan2(e.clientX-r.left-r.width/2,-(e.clientY-r.top-r.height/2))*180/Math.PI;if(a<0)a+=360;hsv[0]=a;paint();});
 drag(q('.cpk-sv'),e=>{const r=q('.cpk-sv').getBoundingClientRect();hsv[1]=clamp((e.clientX-r.left)/r.width,0,1);hsv[2]=clamp(1-(e.clientY-r.top)/r.height,0,1);paint();});
 q('.cpk-hex').addEventListener('input',e=>{let v=e.target.value.trim();if(v&&v[0]!=='#')v='#'+v;const ok=/^#[0-9a-f]{6}$/i.test(v);e.target.classList.toggle('bad',!ok);if(ok)setHex(v.toLowerCase(),'hex');});
 pk.querySelectorAll('.cpk-rgb input').forEach(inp=>inp.addEventListener('input',()=>{const v=[...pk.querySelectorAll('.cpk-rgb input')].map(i=>clamp(Math.round(+i.value||0),0,255));setRgb(...v,'rgb');}));
 pk.querySelectorAll('.cpk-tabs button').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;pk.querySelectorAll('.cpk-tabs button').forEach(x=>x.classList.toggle('on',x===b));paint();}));
 q('.cpk-drop').addEventListener('click',async()=>{if(!('EyeDropper' in window)){q('.cpk-msg').textContent='Seu navegador não tem conta-gotas. No Chrome ou no Edge ele funciona; aqui, digite o código.';return;}const c=await pickFromScreen();if(c)setHex(c);});
 pk.addEventListener('click',e=>{const b=e.target.closest('.cpk-row button');if(b)setHex(b.dataset.c);});
 function close(){
  if(pk.hidden)return;
  const h=hexNow();
  if(h!==old){const r=readRecent().filter(c=>c!==h);r.unshift(h);try{localStorage.setItem(RECENT_KEY,JSON.stringify(r.slice(0,8)));}catch{}}
  pk.hidden=true;anchor?.classList.remove('open');anchor?.setAttribute('aria-expanded','false');anchor=null;onChange=null;
 }
 q('.cpk-ok').addEventListener('click',close);
 pk.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();const a=anchor;close();a?.focus();}});
 return {
  element:pk,close,
  get isOpen(){return !pk.hidden;},
  // Abre logo abaixo de "row" (a linha da cor), com a seta apontando para "button"
  open(button,row,hex,cb){
   if(!pk.hidden&&anchor===button){close();return;}
   close();anchor=button;button.classList.add('open');button.setAttribute('aria-expanded','true');
   row.after(pk);pk.style.setProperty('--cpk-arrow',`${button.offsetLeft+14}px`);
   old=hex;onChange=null;setHex(hex);onChange=cb;paintRecent();q('.cpk-msg').textContent='Arraste na roda e no quadrado, ou digite o código.';pk.hidden=false;paint();
  }
 };
}
