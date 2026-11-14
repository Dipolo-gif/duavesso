// ESS: site exclusivo da marca (serviço "site personalizado" da duavesso), na Edição Esporte.
// Estilo infantil de corrida: carros esportivos, pista e bandeira quadriculada. Mesma lógica de loja do site da Marileus.
// Usa o mesmo catálogo (commerce.js) e o mesmo banco (place_order, cupons, newsletter) da duavesso,
// com carrinho e checkout próprios. As peças são as da marca ess no catálogo.
import {PRODUCTS,sizesOf,money,installment,INSTALLMENTS,discountOf,totals,normalizeCart,setPromos,freeShippingMin,escapeHTML as esc} from './commerce.js';
import {online,rpc,checkCoupon,fetchPromos,fetchBrand,getUser} from './api.js';

const BRAND='ess';
// Filtros da vitrine: cada estampa numa categoria (troque aqui quando entrarem estampas novas)
const CATS=[['all','Todos'],['corrida','Corrida'],['esportivos','Esportivos'],['rally','Rally e off-road']];
const CAT_OF={};
// Coleção atual (rótulo da volta): as estampas na ordem do grid de largada
const DROP=[],DROP_NOW='VOLTA 1';
// Medidas da peça estendida (cm): [tamanho, largura, comprimento]. Troque pela tabela do fornecedor quando a coleção chegar.
const SIZE_GUIDE=[['P',54,70],['M',57,73],['G',60,76],['GG',63,79]];
// A sacola é a mesma da duavesso: o que entra aqui aparece lá, e vice-versa. Este site mostra e finaliza
// só as peças da ESS; as de outras lojas continuam na sacola da duavesso.
const CART_KEY='duavesso.cart.v1';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// O drop atual vem primeiro na vitrine
const items=PRODUCTS.filter(p=>p.brand===BRAND).sort((a,b)=>{const ia=DROP.indexOf(a.id),ib=DROP.indexOf(b.id);return (ia<0?99:ia)-(ib<0?99:ib);});
const byId=id=>items.find(p=>p.id===id);
// Antes da largada (sem peças à venda): o site vira a espera da primeira coleção, com a lista
const between=!items.length;
if(between){
 document.body.classList.add('es-between');
 $('.es-ticker-track').innerHTML=['Largada em breve','Primeira coleção na pista','Entre no grid e saiba primeiro','Largada em breve','Primeira coleção na pista','Entre no grid e saiba primeiro'].map(t=>`<span>${t}</span>`).join('');
 const cta=$('.es-ctas .es-btn-primary');cta.textContent='Entrar no grid';cta.href='ess#lista';
 const sec=$('.es-ctas .es-btn-ghost');sec.textContent='Conhecer a ESS';sec.href='ess#manifesto';
 $('.es-lead').textContent='A primeira coleção da ESS está nos boxes, ganhando os últimos ajustes. Quem entra no grid fica sabendo antes da largada.';
 $$('a[href="ess#drop"]').forEach(a=>{a.href='ess#lista';});
 $('#drop').hidden=true;$('#es-search-open').hidden=true;
 // Menu enxuto: sem vitrine, os atalhos são o próximo drop, a marca e a lista
 const nav='<a href="ess#estampas">Garagem</a><a href="ess#manifesto">Sobre a ESS</a><a href="ess#lista">Entrar no grid</a>';
 $('.es-links').innerHTML=nav;$('#es-mobile').innerHTML=nav;
 $('#es-cat-title').textContent='Nos boxes';$('.es-catalog .es-head .es-tag').textContent='Primeira coleção';
}
const photos=(p,base)=>{const v=p.variants?(p.variants.find(x=>x.base===base)||p.variants[0]):null;return v?v.photos:(p.photos||[]);};
const pic=(name,alt,sizes,lazy=true)=>`<picture><source type="image/webp" srcset="assets/${name}-400.webp 400w, assets/${name}-800.webp 800w, assets/${name}-1024.webp 1024w" sizes="${sizes}"><img src="assets/${name}-1024.jpg" alt="${esc(alt)}" width="1024" height="1536" decoding="async"${lazy?' loading="lazy"':''}></picture>`;
const price=p=>discountOf(p)?`<s>${money(p.compareAt)}</s><b>${money(p.price)}</b>`:`<b>${money(p.price)}</b>`;
// Entradas suaves conforme a página desce (desligadas com movimento reduzido)
const io='IntersectionObserver' in window&&!still()?new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.remove('pre');en.target.classList.add('in');io.unobserve(en.target);}}),{rootMargin:'0px 0px -8% 0px'}):null;
// Só os cartões da vitrine entram assim; se o navegador não avisar a tempo, aparecem mesmo assim
function reveal(els,safety=true){els.forEach(el=>{if(io){el.classList.add('pre');io.observe(el);}else el.classList.add('in');});if(io&&safety)setTimeout(()=>els.forEach(el=>{if(el.classList.contains('pre')){el.classList.remove('pre');el.classList.add('in');io.unobserve(el);}}),2500);}
// Confete: sai de um ponto da tela (o botão clicado, o selo do pedido) e cai
const CONF=['#e5231b','#ffbf1f','#fff','#141414','#bfe6ff','#2fb866'];
function confetti(from,n=44){
 if(still())return;
 const r=from?.getBoundingClientRect?.(),x=r?r.left+r.width/2:innerWidth/2,y=r?r.top+r.height/2:innerHeight/3;
 const box=document.createElement('div');box.className='es-conf';box.setAttribute('aria-hidden','true');
 box.innerHTML=Array.from({length:n},(_,i)=>{const a=Math.random()*Math.PI*2,d=120+Math.random()*260;
  return `<i style="--x:${x}px;--y:${y}px;--c:${CONF[i%CONF.length]};--dx:${Math.round(Math.cos(a)*d)}px;--up:${-Math.round(80+Math.random()*220)}px;--dy:${Math.round(200+Math.random()*320)}px;--r:${Math.round(Math.random()*900-450)}deg;--t:${(1.2+Math.random()*.9).toFixed(2)}s"></i>`;}).join('');
 document.body.append(box);setTimeout(()=>box.remove(),2400);
}
let toastTimer;
function toast(msg){const t=$('#es-toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('on'),3800);}
function openDialog(d){if(!d.open)d.showModal();document.documentElement.classList.add('es-lock');}
function closeDialog(d){if(!d.open)return;if(still()){d.close();return;}d.classList.add('closing');setTimeout(()=>{d.classList.remove('closing');d.close();},220);}
$$('dialog').forEach(d=>{
 d.addEventListener('close',()=>{if(!$$('dialog').some(x=>x.open))document.documentElement.classList.remove('es-lock');});
 d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d);});
 d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]'))closeDialog(d);});
});

// Carrinho ----------------------------------------------------------------------------------------
const mine=i=>i.id!=='custom'&&i.brand===BRAND;
let others=[],cart=read();
function read(){let all=[];try{all=normalizeCart(JSON.parse(localStorage.getItem(CART_KEY))||[]);}catch{}others=all.filter(i=>!mine(i));return all.filter(mine);}
function save(){try{localStorage.setItem(CART_KEY,JSON.stringify([...others,...cart]));}catch{}paintCount();}
function paintCount(){const n=cart.reduce((s,i)=>s+i.qty,0),el=$('#es-count');if(el.textContent!==String(n)){el.textContent=n;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}$('#es-cart-open').setAttribute('aria-label',`Abrir carrinho, ${n} ${n===1?'peça':'peças'}`);}
function add(p,size,base){
 const b=p.variants?(base||p.variants[0].base):p.base,key=p.variants?`${p.id}-${b}-${size}`:`${p.id}-${size}`;
 const found=cart.find(i=>i.key===key);
 if(found&&found.qty>=10){toast('Limite de 10 unidades por estampa e tamanho.');return false;}
 const raw=cart.map(({id,base,size,qty})=>({id,base,size,qty}));
 if(found)found.qty++;else raw.push({id:p.id,base:b,size,qty:1});
 cart=found?cart:normalizeCart(raw);save();return true;
}
window.addEventListener('storage',e=>{if(e.key===CART_KEY){cart=read();paintCount();if($('#es-drawer').open)renderDrawer();}});

// Hero: título que "decodifica" uma vez e o card do drop atual -------------------------------------------
// O título entra com o próprio CSS (largada); aqui não há efeito de letras
function decode(){}

// Pista do topo: o carro é um botão (clicar ou tocar dá o turbo) e dois rivais passam na faixa de trás
const road=$('#es-road'),WORDS=['VRUUUM!','BI-BI!','ZUUUM!','TURBO!','FIUUU!'];
let word=0,turboTimer;
function boost(say=true){
 if(still())return;
 road.classList.remove('turbo');void road.offsetWidth;road.classList.add('turbo');
 clearTimeout(turboTimer);turboTimer=setTimeout(()=>road.classList.remove('turbo'),1250);
 if(say){const v=$('#es-vroom');v.textContent=WORDS[word++%WORDS.length];v.classList.remove('on');void v.offsetWidth;v.classList.add('on');}
}
$('#es-car').addEventListener('click',()=>boost());
[['#1e63ff','7','r1'],['#19a35b','3','r2']].forEach(([color,num,cls])=>{
 const c=$('#es-car .es-car').cloneNode(true);c.classList.replace('es-car','es-rival');c.classList.add(cls);
 c.style.setProperty('--car',color);$('.es-car-num',c).textContent=num;$('#es-rivals').append(c);
});

// Luzes de largada do cartão de espera: acendem uma a uma e, quando apagam, é a largada (o carro arranca).
// Com movimento reduzido, ficam acesas.
function startLights(){const ls=$$('#es-drop-card .es-lights span');if(still()){ls.forEach(l=>l.classList.add('on'));return;}
 let n=0;setInterval(()=>{if(n<ls.length){ls[n].classList.add('on');n++;}else{ls.forEach(l=>l.classList.remove('on'));n=0;if(!document.hidden&&scrollY<innerHeight)boost(false);}},700);}
let dropIdx=0,dropTimer;
function renderDropCard(){
 const list=DROP.map(byId).filter(Boolean),p=list[dropIdx%list.length];if(!p)return;
 $('#es-drop-card').innerHTML=`<span class="es-corner tl"></span><span class="es-corner tr"></span><span class="es-corner bl"></span><span class="es-corner br"></span>
<p class="es-badge"><span class="es-live" aria-hidden="true"></span>NA PISTA AGORA</p>
<button type="button" class="es-drop-shot" data-quick="${p.id}" aria-label="Ver ${esc(p.name)}">${pic(photos(p)[0],p.name,'(max-width:900px) 80vw, 30vw',false)}</button>
<div class="es-drop-info"><div><span class="es-mini">${DROP_NOW} · ${String(dropIdx%list.length+1).padStart(2,'0')}/${String(list.length).padStart(2,'0')}</span><h3>${esc(p.name)}</h3></div><p class="es-price">${price(p)}</p></div>
<div class="es-dots" role="group" aria-label="Escolher estampa da coleção">${list.map((x,i)=>`<button type="button" data-dot="${i}" aria-label="${esc(x.name)}"${i===dropIdx%list.length?' aria-current="true"':''}></button>`).join('')}</div>`;
}
function startDrop(){clearInterval(dropTimer);if(!still())dropTimer=setInterval(()=>{dropIdx++;renderDropCard();},5200);}
$('#es-drop-card').addEventListener('click',e=>{const d=e.target.closest('[data-dot]');if(d){dropIdx=+d.dataset.dot;renderDropCard();startDrop();}});
$('#es-drop-card').addEventListener('mouseenter',()=>clearInterval(dropTimer));
$('#es-drop-card').addEventListener('mouseleave',startDrop);
if(between){$('#es-drop-card').innerHTML=`<p class="es-badge"><span class="es-live" aria-hidden="true"></span>LARGADA EM BREVE</p>
<div class="es-lights" aria-hidden="true">${'<span><i></i><i></i></span>'.repeat(5)}</div>
<div class="es-drop-info"><div><span class="es-mini">PRIMEIRA COLEÇÃO</span><h3>Os carros estão nos boxes</h3></div></div>
<p class="es-wait-note">Quando as luzes apagarem, a coleção abre. Quem está no grid recebe o aviso antes.</p>
<a class="es-btn es-btn-primary es-wide" href="ess#lista">Avise-me na largada</a>`;startLights();}
else{renderDropCard();startDrop();}

// Vitrine ---------------------------------------------------------------------------------------------
let filter='all';
const catsWithItems=()=>CATS.filter(([k])=>k==='all'||items.some(p=>CAT_OF[p.id]===k));
function renderFilters(){$('#es-filters').innerHTML=catsWithItems().map(([k,l])=>`<button type="button" data-filter="${k}" aria-pressed="${k===filter}">${esc(l)}</button>`).join('');}
const shots=(p,base)=>{const ph=photos(p,base),v=p.variants?(p.variants.find(x=>x.base===base)||p.variants[0]):null;
 return `${pic(ph[0],`${p.name}, ${v?v.color:p.color}`,'(max-width:700px) 92vw, (max-width:1100px) 46vw, 31vw')}${ph[1]?`<span class="es-shot-alt">${pic(ph[1],'','(max-width:700px) 92vw, 31vw')}</span>`:''}`;};
function card(p,i){
 const off=discountOf(p),multi=p.variants&&p.variants.length>1,base=p.variants?p.variants[0].base:p.base;
 return `<article class="es-card" style="--i:${i}" data-id="${p.id}" data-base="${base}"><button type="button" class="es-shot" data-quick="${p.id}" aria-label="Ver ${esc(p.name)}"><span class="es-shot-pics">${shots(p,base)}</span>${off?`<span class="es-off">-${off}%</span>`:''}<span class="es-view">Visualização rápida</span></button>
<div class="es-card-body"><p class="es-chips"><span>Estampa DTF</span>${DROP.includes(p.id)?`<span class="hot">${DROP_NOW}</span>`:''}</p><h3>${esc(p.name)}</h3>
${multi?`<div class="es-swatches" role="group" aria-label="Cor de ${esc(p.name)}"><span class="es-swatch-name">${esc(p.variants[0].color)}</span>${p.variants.map(x=>`<button type="button" data-swatch="${x.base}" style="--c:${x.swatch}" aria-label="${esc(x.color)}" aria-pressed="${x.base===base}"></button>`).join('')}</div>`:`<p class="es-swatches single"><span class="es-swatch-name">${esc(p.variants?p.variants[0].color:p.color)}</span></p>`}
<p class="es-price">${price(p)}<small>ou ${INSTALLMENTS}x de ${money(installment(p.price))}</small></p>
<div class="es-sizes" role="group" aria-label="Adicionar ${esc(p.name)} ao carrinho por tamanho">${sizesOf(p).map(s=>`<button type="button" data-add="${p.id}" data-size="${s}" aria-label="Adicionar tamanho ${s}">${s}</button>`).join('')}</div></div></article>`;
}
function renderProducts(){
 const q=$('#es-search').value.trim().toLocaleLowerCase('pt-BR');
 const list=items.filter(p=>(filter==='all'||CAT_OF[p.id]===filter)&&`${p.name} ${p.color} ${p.description}`.toLocaleLowerCase('pt-BR').includes(q));
 $('#es-products').innerHTML=list.length?list.map(card).join(''):`<div class="es-empty"><p>Nenhuma estampa com “${esc(q)}”.</p><button type="button" class="es-btn es-btn-ghost" id="es-clear">Ver todas</button></div>`;
 $('#es-results').textContent=`${list.length} ${list.length===1?'peça':'peças'}`;
 reveal($$('#es-products .es-card'));
}
$('#es-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;renderFilters();renderProducts();});
$('#es-search').addEventListener('input',renderProducts);
$('#es-products').addEventListener('click',e=>{
 if(e.target.closest('#es-clear')){$('#es-search').value='';filter='all';renderFilters();renderProducts();return;}
 const sw=e.target.closest('[data-swatch]');
 if(sw){const art=sw.closest('.es-card'),p=byId(art.dataset.id),v=p.variants.find(x=>x.base===sw.dataset.swatch);
  art.dataset.base=v.base;art.querySelector('.es-shot-pics').innerHTML=shots(p,v.base);art.querySelector('.es-swatch-name').textContent=v.color;
  $$('[data-swatch]',art).forEach(b=>b.setAttribute('aria-pressed',String(b===sw)));return;}
 const a=e.target.closest('[data-add]');
 if(a){const p=byId(a.dataset.add),art=a.closest('.es-card'),base=art?.dataset.base,v=p.variants?.find(x=>x.base===base);if(add(p,a.dataset.size,base)){a.classList.add('ok');setTimeout(()=>a.classList.remove('ok'),700);toast(`${p.name}${v?` ${v.color.toLowerCase()}`:''} · ${a.dataset.size} no carrinho.`);}}
});
$('#es-search-open').addEventListener('click',()=>{$('#estampas').scrollIntoView({behavior:still()?'instant':'smooth'});setTimeout(()=>$('#es-search').focus({preventScroll:true}),still()?0:450);});
if(between){$('#es-filters').hidden=true;$('#es-search-wrap').hidden=true;$('#es-results').hidden=true;
 $('#es-products').innerHTML=`<div class="es-empty es-soon"><p class="es-tag">Primeira coleção</p><h3>Os carros estão nos boxes.</h3><p>As primeiras estampas da ESS chegam na largada: carros esportivos, pista e bandeira quadriculada, feitas para os pequenos pilotos.</p>
<div class="es-boxes" aria-hidden="true">${[1,2,3].map(n=>`<div class="es-box" style="--i:${n-1}"><span class="es-box-n">Box ${n}</span><div class="es-box-in"><i class="es-eye"></i><i class="es-eye"></i><b>?</b></div><div class="es-box-door"></div></div>`).join('')}</div>
<a class="es-btn es-btn-primary" href="ess#lista">Entrar no grid</a></div>`;}
else{renderFilters();renderProducts();}

// Drop exclusivo ----------------------------------------------------------------------------------------
(function renderDrop(){
 if(between)return;
 const list=DROP.map(byId).filter(Boolean);if(!list.length)return;
 $('#es-drop-media').innerHTML=list.map((p,i)=>`<button type="button" class="es-drop-tile t${i}" data-quick="${p.id}" aria-label="Ver ${esc(p.name)}">${pic(photos(p)[0],p.name,'(max-width:900px) 50vw, 28vw')}</button>`).join('');
 $('#es-drop-list').innerHTML=list.map(p=>`<li><button type="button" data-quick="${p.id}"><span>${esc(p.name)}</span><span class="es-price">${price(p)}</span></button></li>`).join('');
})();

// Visualização rápida ----------------------------------------------------------------------------------
document.addEventListener('click',e=>{const q=e.target.closest('[data-quick]');if(q){e.preventDefault();openQuick(q.dataset.quick,q.closest('.es-card')?.dataset.base);}});
function openQuick(id,start){
 const p=byId(id);if(!p)return;
 let base=p.variants?(p.variants.find(x=>x.base===start)||p.variants[0]).base:p.base,size=null,shot=0;
 const body=$('#es-quick-body');
 const paint=()=>{
  const ph=photos(p,base),v=p.variants?.find(x=>x.base===base);
  body.innerHTML=`<button type="button" class="es-icon es-q-close" data-close aria-label="Fechar">×</button>
<div class="es-q-gallery"><div class="es-q-main">${pic(ph[shot]||ph[0],`${p.name}, foto ${shot+1}`,'(max-width:900px) 92vw, 50vw',false)}</div><div class="es-q-thumbs">${ph.map((n,i)=>`<button type="button" data-shot="${i}" aria-label="Foto ${i+1}"${i===shot?' aria-current="true"':''}>${pic(n,'','96px')}</button>`).join('')}</div></div>
<div class="es-q-info"><p class="es-tag">${DROP.includes(p.id)?`${DROP_NOW} · `:''}${esc((CATS.find(([k])=>k===CAT_OF[p.id])||['',''])[1])}</p><h2 id="es-q-name">${esc(p.name)}</h2><p class="es-price big">${price(p)}${discountOf(p)?`<em>-${discountOf(p)}%</em>`:''}<small>ou ${INSTALLMENTS}x de ${money(installment(p.price))} sem juros</small></p>
<p class="es-q-desc">${esc(p.description)}</p>
${p.variants?`<div class="es-field"><span>Cor: <b>${esc(v.color)}</b></span><div class="es-colors">${p.variants.map(x=>`<button type="button" data-base="${x.base}" style="--c:${x.swatch}" aria-label="${esc(x.color)}" aria-pressed="${x.base===base}"></button>`).join('')}</div></div>`:`<div class="es-field"><span>Cor: <b>${esc(p.color)}</b></span></div>`}
<div class="es-field"><span>Tamanho</span><div class="es-q-sizes">${sizesOf(p).map(s=>`<button type="button" data-pick="${s}" aria-pressed="${s===size}">${s}</button>`).join('')}</div><details class="es-guide"><summary>Guia de medidas</summary><table><thead><tr><th scope="col">Tamanho</th><th scope="col">Largura</th><th scope="col">Comprimento</th></tr></thead><tbody>${SIZE_GUIDE.map(([s,w,c])=>`<tr><th scope="row">${s}</th><td>${w} cm</td><td>${c} cm</td></tr>`).join('')}</tbody></table><p>Peça estendida, em centímetros. Para menos volume, escolha um tamanho abaixo.</p></details></div>
<button type="button" class="es-btn es-btn-primary es-q-add" id="es-q-add"${size?'':' disabled'}>${size?`Adicionar ao carrinho · ${size}`:'Escolha um tamanho'}</button>
<dl class="es-q-specs"><div><dt>Tecido</dt><dd>${esc(p.fabric)}</dd></div>${p.print?`<div><dt>Estampa</dt><dd>${esc(p.print)}</dd></div>`:''}<div><dt>Caimento</dt><dd>${esc(p.fit)}</dd></div><div><dt>Cuidados</dt><dd>${esc(p.care)}</dd></div></dl></div>`;
 };
 body.onclick=e=>{
  const t=e.target.closest('[data-shot],[data-base],[data-pick],#es-q-add');if(!t)return;
  if(t.dataset.shot){shot=+t.dataset.shot;paint();return;}
  if(t.dataset.base){base=t.dataset.base;shot=0;paint();return;}
  if(t.dataset.pick){size=t.dataset.pick;paint();$('#es-q-add',body).focus();return;}
  if(t.id==='es-q-add'&&size&&add(p,size,base)){closeDialog($('#es-quick'));setTimeout(()=>{renderDrawer();openDialog($('#es-drawer'));},still()?0:240);}
 };
 paint();openDialog($('#es-quick'));
}

// Carrinho lateral --------------------------------------------------------------------------------------
const state={shipping:'standard',coupon:null};
function sums(){return totals(cart,state.shipping,{coupon:state.coupon?.discount||0});}
function renderDrawer(){
 const box=$('#es-drawer-body');
 if(!cart.length){box.innerHTML=`<div class="es-empty"><img src="assets/ess-mark.png" alt="" width="80" height="80"><p>Nenhuma peça da ESS no carrinho.</p><button type="button" class="es-btn es-btn-ghost" data-close data-go="estampas">Explorar estampas</button>${othersNote()}</div>`;return;}
 if(state.coupon){state.coupon=null;}
 const t=sums(),min=freeShippingMin(),left=min!==null?Math.max(0,min-(t.subtotal-t.promo)):null;
 box.innerHTML=`<ul class="es-lines">${cart.map(i=>`<li><span class="es-line-img">${pic(photos(byId(i.id),i.base)[0],'','72px')}</span><div><b>${esc(i.name)}</b><small>${esc(i.color)} · ${i.size}</small><div class="es-qty"><button type="button" data-q="-1" data-k="${esc(i.key)}" aria-label="Menos uma ${esc(i.name)}">−</button><span>${i.qty}</span><button type="button" data-q="1" data-k="${esc(i.key)}" aria-label="Mais uma ${esc(i.name)}"${i.qty>=10?' disabled':''}>+</button></div></div><div class="es-line-end"><span>${money(i.price*i.qty)}</span><button type="button" class="es-link" data-rm="${esc(i.key)}">Remover</button></div></li>`).join('')}</ul>
${left!==null?`<div class="es-ship-goal"><p>${left?`Faltam <b>${money(left)}</b> para o frete grátis.`:'Frete grátis liberado.'}</p><span><i style="width:${Math.min(100,Math.round((t.subtotal-t.promo)/min*100))}%"></i></span></div>`:''}
<fieldset class="es-ship"><legend>Entrega</legend>
<label><input type="radio" name="es-ship" value="standard"${state.shipping==='standard'?' checked':''}><span><b>Padrão</b><small>5 a 8 dias úteis</small></span><em>${min!==null&&t.subtotal-t.promo>=min?'Grátis':money(1490)}</em></label>
<label><input type="radio" name="es-ship" value="express"${state.shipping==='express'?' checked':''}><span><b>Expressa</b><small>2 a 3 dias úteis</small></span><em>${money(2490)}</em></label></fieldset>
<p class="es-drawer-note">O cupom de desconto entra na etapa de pagamento.</p>
<div class="es-sum"><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.promo?`<div><span>Promoção</span><span>−${money(t.promo)}</span></div>`:''}<div><span>Frete</span><span>${t.delivery?money(t.delivery):'Grátis'}</span></div><div class="es-total"><span>Total</span><span>${money(t.total)}</span></div></div>
<button type="button" class="es-btn es-btn-primary es-wide" id="es-go-checkout">Finalizar pedido</button>${othersNote()}`;
}
function othersNote(){const n=others.reduce((s,i)=>s+i.qty,0);return n?`<p class="es-drawer-note">Você também tem ${n} ${n===1?'peça':'peças'} de outras lojas na sacola da duavesso. <a class="es-link" href="checkout">Finalizar tudo na duavesso</a></p>`:'';}
$('#es-drawer').addEventListener('click',e=>{
 const q=e.target.closest('[data-q]'),rm=e.target.closest('[data-rm]'),go=e.target.closest('[data-go]');
 if(q){const it=cart.find(i=>i.key===q.dataset.k);it.qty+=+q.dataset.q;cart=cart.filter(i=>i.qty>0);save();renderDrawer();}
 if(rm){cart=cart.filter(i=>i.key!==rm.dataset.rm);save();renderDrawer();}
 if(go)setTimeout(()=>$('#estampas').scrollIntoView({behavior:still()?'instant':'smooth'}),still()?0:240);
 if(e.target.closest('#es-go-checkout')){closeDialog($('#es-drawer'));setTimeout(openCheckout,still()?0:240);}
});
$('#es-drawer').addEventListener('change',e=>{if(e.target.name==='es-ship'){state.shipping=e.target.value;renderDrawer();}});
$('#es-cart-open').addEventListener('click',()=>{renderDrawer();openDialog($('#es-drawer'));});

// Checkout em etapas -----------------------------------------------------------------------------------
const UFS='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
let step=1;const ship={};
const user=getUser();
if(user){ship.name=user.name||'';ship.email=user.email||'';}
function openCheckout(){if(!cart.length)return;step=1;renderCheckout();openDialog($('#es-checkout'));}
function summaryHTML(){
 const t=sums();
 return `<aside class="es-co-sum"><p class="es-tag">Resumo</p><ul>${cart.map(i=>`<li><span>${i.qty}× ${esc(i.name)}<small>${esc(i.color)} · ${i.size}</small></span><b>${money(i.price*i.qty)}</b></li>`).join('')}</ul>
<div class="es-sum"><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.promo?`<div><span>Promoção</span><span>−${money(t.promo)}</span></div>`:''}${t.coupon?`<div><span>Cupom ${esc(state.coupon.code)}</span><span>−${money(t.coupon)}</span></div>`:''}<div><span>Frete ${state.shipping==='express'?'expresso':'padrão'}</span><span>${t.delivery?money(t.delivery):'Grátis'}</span></div><div class="es-total"><span>Total</span><span>${money(t.total)}</span></div></div></aside>`;
}
function stepsHTML(){return `<ol class="es-steps">${['Envio','Pagamento','Confirmado'].map((s,i)=>`<li class="${i+1<step?'done':i+1===step?'on':''}"${i+1===step?' aria-current="step"':''}><span>${i+1}</span>${s}</li>`).join('')}</ol>`;}
function renderCheckout(result){
 const box=$('#es-checkout-body');
 const head=`<div class="es-co-head"><img src="assets/ess-logo.png" alt="ESS" width="900" height="308"><h2 id="es-co-title" class="es-sr">Finalizar pedido</h2><button type="button" class="es-icon" data-close aria-label="Fechar">×</button></div>${stepsHTML()}`;
 if(step===1){
  box.innerHTML=`${head}<div class="es-co-grid"><form class="es-co-form" id="es-co-ship" novalidate>
<p class="es-co-pre">${user?`Comprando com a sua conta duavesso (${esc(user.email)}): o pedido aparece em Minha conta.`:'O pedido fica registrado na duavesso. Entrando na sua conta, ele aparece em Minha conta.'} Pré-lançamento: nenhum valor é cobrado por enquanto.</p>
<div class="es-row2"><label>Nome completo<input name="name" required maxlength="100" autocomplete="name" value="${esc(ship.name||'')}"></label><label>E-mail<input name="email" type="email" required maxlength="120" autocomplete="email" value="${esc(ship.email||'')}"></label></div>
<div class="es-row3"><label>CEP<input name="cep" required inputmode="numeric" maxlength="9" placeholder="00000-000" autocomplete="postal-code" value="${esc(ship.cep||'')}"></label><label>Estado<select name="uf" required><option value="">UF</option>${UFS.map(u=>`<option${u===ship.uf?' selected':''}>${u}</option>`).join('')}</select></label><label>Cidade<input name="city" required maxlength="80" autocomplete="address-level2" value="${esc(ship.city||'')}"></label></div>
<div class="es-row2 wide"><label>Rua<input name="street" required maxlength="120" autocomplete="address-line1" value="${esc(ship.street||'')}"></label><label>Número<input name="number" required maxlength="10" value="${esc(ship.number||'')}"></label></div>
<label>Complemento (opcional)<input name="extra" maxlength="60" autocomplete="address-line2" value="${esc(ship.extra||'')}"></label>
<p class="es-co-msg" id="es-co-msg" aria-live="polite"></p>
<button type="submit" class="es-btn es-btn-primary es-wide">Continuar para o pagamento</button></form>${summaryHTML()}</div>`;
  const f=$('#es-co-ship');
  f.elements.cep.addEventListener('input',async e=>{let v=e.target.value.replace(/\D/g,'').slice(0,8);e.target.value=v.length>5?`${v.slice(0,5)}-${v.slice(5)}`:v;if(v.length!==8)return;
   try{const r=await fetch(`https://viacep.com.br/ws/${v}/json/`).then(x=>x.json());if(r.erro){$('#es-co-msg').textContent='CEP não encontrado. Confira os números.';return;}$('#es-co-msg').textContent='';f.elements.uf.value=r.uf||'';f.elements.city.value=r.localidade||'';if(r.logradouro)f.elements.street.value=r.logradouro;f.elements.number.focus();}catch{}});
  f.addEventListener('submit',e=>{e.preventDefault();const bad=[...f.elements].find(x=>x.willValidate&&!x.checkValidity());if(bad){$('#es-co-msg').textContent=`Confira o campo ${bad.closest('label').firstChild.textContent.trim().toLowerCase()}.`;bad.focus();return;}
   Object.assign(ship,Object.fromEntries(new FormData(f)));step=2;renderCheckout();});
  f.elements.name.focus();return;
 }
 if(step===2){
  const t=sums();
  box.innerHTML=`${head}<div class="es-co-grid"><form class="es-co-form" id="es-co-pay" novalidate>
<p class="es-co-to">Entrega para <b>${esc(ship.name)}</b>: ${esc(ship.street)}, ${esc(ship.number)}${ship.extra?` · ${esc(ship.extra)}`:''} · ${esc(ship.city)}/${esc(ship.uf)} <button type="button" class="es-link" id="es-back">Alterar</button></p>
<fieldset class="es-pay"><legend>Pagamento</legend>
<label><input type="radio" name="pay" value="Pix" checked><span><b>Pix</b><small>Aprovação na hora</small></span></label>
<label><input type="radio" name="pay" value="Cartão"><span><b>Cartão de crédito</b><small>Até ${INSTALLMENTS}x sem juros</small></span></label></fieldset>
<div class="es-pay-panel" id="es-pay-panel"></div>
<div class="es-coupon"><label>Cupom<input name="coupon" maxlength="30" autocomplete="off" placeholder="Seu cupom" value="${esc(state.coupon?.code||'')}"></label><button type="button" class="es-btn es-btn-ghost" id="es-apply">Aplicar</button></div><p class="es-co-msg" id="es-cup-msg" aria-live="polite">${state.coupon?`Cupom ${esc(state.coupon.code)} aplicado: −${money(state.coupon.discount)}.`:''}</p>
<p class="es-co-msg err" id="es-co-msg" aria-live="assertive"></p>
<button type="submit" class="es-btn es-btn-primary es-wide" id="es-place">Confirmar pedido · ${money(t.total)}</button></form>${summaryHTML()}</div>`;
  const f=$('#es-co-pay');
  const panel=()=>{const pay=f.elements.pay.value,tt=sums();$('#es-pay-panel').innerHTML=pay==='Pix'?`<div class="es-pix"><div class="es-pix-frame" aria-hidden="true"><img src="assets/ess-mark.png" alt="" width="60" height="60"></div><p><b>O QR Code e o Pix copia e cola aparecem depois de confirmar.</b> Pague no app do seu banco; o pedido entra em produção quando o pagamento cai.</p></div>`:`<label class="es-inst">Parcelas<select name="installments">${Array.from({length:INSTALLMENTS},(_,i)=>`<option value="${i+1}">${i+1}x de ${money(Math.ceil(tt.total/(i+1)))} sem juros</option>`).join('')}</select></label><p class="es-small">Os dados do cartão são digitados no ambiente seguro do provedor de pagamento, depois de confirmar. Eles nunca passam pela loja.</p>`;};
  panel();f.addEventListener('change',e=>{if(e.target.name==='pay')panel();});
  $('#es-back').addEventListener('click',()=>{step=1;renderCheckout();});
  $('#es-apply').addEventListener('click',async()=>{const code=f.elements.coupon.value.trim();const msg=$('#es-cup-msg');if(!code){state.coupon=null;renderCheckout();return;}
   msg.textContent='Conferindo o cupom…';try{const tt=totals(cart,state.shipping);const r=await checkCoupon(code,tt.subtotal-tt.promo);if(r?.ok){state.coupon={code:r.code,discount:r.discount_cents};renderCheckout();}else{state.coupon=null;msg.textContent=r?.message||'Cupom inválido ou expirado.';}}catch(err){msg.textContent=err.message;}});
  f.addEventListener('submit',async e=>{
   e.preventDefault();const btn=$('#es-place'),pay=f.elements.pay.value,inst=pay==='Cartão'?+(f.elements.installments?.value||1):1;
   if(!online()){$('#es-co-msg').textContent='Sem conexão com a loja agora. Tente de novo em instantes.';return;}
   btn.disabled=true;btn.textContent='Registrando o pedido…';
   try{
    const res=await rpc('place_order',{p_customer:{name:ship.name,email:ship.email,cep:ship.cep,uf:ship.uf,city:ship.city,address:`${ship.street}, ${ship.number}${ship.extra?` - ${ship.extra}`:''}`,...(state.coupon?{coupon:state.coupon.code}:{}),...(pay==='Cartão'?{installments:inst}:{})},p_shipping:state.shipping,p_payment:pay,p_items:cart.map(i=>({kind:'catalog',product_id:i.id,base:i.base,size:i.size,qty:i.qty}))});
    cart=[];state.coupon=null;save();step=3;renderCheckout({...res,pay,inst});
   }catch(err){$('#es-co-msg').textContent=err.message||'Não foi possível registrar o pedido. Tente de novo.';btn.disabled=false;btn.textContent=`Confirmar pedido · ${money(sums().total)}`;}
  });
  return;
 }
 const r=result||{};
 box.innerHTML=`${head}<div class="es-done"><div class="es-done-mark" aria-hidden="true"><img src="assets/ess-mark.png" alt="" width="120" height="120"><span class="es-flag"></span></div>
<p class="es-done-code">Bandeirada! Pedido #${esc(r.code||'')} confirmado</p>
<p>${money(r.total_cents??0)} · ${esc(r.pay==='Cartão'?`Cartão em ${r.inst}x de ${money(Math.ceil((r.total_cents||0)/(r.inst||1)))}`:r.pay||'')}</p>
<p class="es-small">${user?'O pedido já está em Minha conta, na duavesso.':`Guarde o código: você acompanha o pedido na duavesso, em Consultar status, com o código e o e-mail ${esc(ship.email||'')}.`} Pré-lançamento: nenhum valor é cobrado por enquanto.</p>
<div class="es-ctas"><button type="button" class="es-btn es-btn-primary" data-close>Voltar às estampas</button><a class="es-btn es-btn-ghost" href="/">Acompanhar na duavesso</a></div></div>`;
 decode($('.es-done-code',box));
 setTimeout(()=>confetti($('.es-done-mark',box),60),still()?0:350);
}

// Lista de espera ("entrar no grid") ---------------------------------------------------------------------------
$('#es-news').addEventListener('submit',async e=>{
 e.preventDefault();const f=e.target,out=$('#es-news-out'),email=f.elements.email;
 if(f.elements.website.value){f.reset();return;}
 if(!email.checkValidity()){out.textContent='Digite um e-mail válido, como nome@email.com';out.className='es-news-out err';email.focus();return;}
 out.className='es-news-out';out.textContent='Enviando…';
 try{await rpc('subscribe_newsletter',{p_email:email.value.trim()});out.textContent=`Você está no grid! Avisamos ${email.value.trim()} na largada.`;f.reset();confetti($('button',f));}
 catch(err){out.className='es-news-out err';out.textContent=err.message;}
});

// Menu no celular, entradas da vitrine e números do manifesto ----------------------------------------------
$('#es-menu-btn').addEventListener('click',()=>{const m=$('#es-mobile'),open=m.hidden;m.hidden=!open;$('#es-menu-btn').setAttribute('aria-expanded',String(open));});
$$('#es-mobile a').forEach(a=>a.addEventListener('click',()=>{$('#es-mobile').hidden=true;$('#es-menu-btn').setAttribute('aria-expanded','false');}));
// Menu ganha a borda ao rolar, e o carrinho da "volta" anda debaixo dele conforme a página desce
function onScroll(){const nav=$('#es-nav'),max=document.documentElement.scrollHeight-innerHeight;nav.classList.toggle('scrolled',scrollY>24);nav.style.setProperty('--lap',max>0?Math.min(1,scrollY/max).toFixed(4):0);
 // Garantia das entradas: o que já está na tela nunca fica escondido esperando o aviso do navegador
 $$('.pre').forEach(el=>{if(el.getBoundingClientRect().top<innerHeight*.92){el.classList.remove('pre');el.classList.add('in');io?.unobserve(el);}});}
window.addEventListener('scroll',onScroll,{passive:true});onScroll();
// Sobre a ESS e o bilhete do rodapé entram conforme aparecem na tela
$$('.es-specs div').forEach((d,i)=>d.style.setProperty('--i',i));
reveal([...$$('.es-man-copy,.es-podium,.es-specs div,.es-ticket'),...$$('.es-soon')],false);

// Do banco: frete grátis atual e o Instagram da marca
fetchPromos().then(list=>{if(list){setPromos(list);if($('#es-drawer').open)renderDrawer();}});
fetchBrand(BRAND).then(b=>{const ig=b?.links?.instagram;if(ig&&/^[A-Za-z0-9._]{1,30}$/.test(ig))$('#es-social').innerHTML=`<a href="https://instagram.com/${ig}" target="_blank" rel="noopener">Instagram @${esc(ig)}</a>`;});
paintCount();
