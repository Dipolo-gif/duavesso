// Marileus: site exclusivo da marca (serviço "site personalizado" da duavesso).
// Usa o mesmo catálogo (commerce.js) e o mesmo banco (place_order, cupons, newsletter) da duavesso,
// com carrinho e checkout próprios. As peças são as da marca geek (Marileus) no catálogo.
import {PRODUCTS,SIZES,money,installment,INSTALLMENTS,discountOf,totals,normalizeCart,setPromos,freeShippingMin,escapeHTML as esc} from './commerce.js';
import {online,rpc,checkCoupon,fetchPromos,fetchBrand,getUser} from './api.js';

const BRAND='geek';
// Filtros da vitrine: cada estampa numa categoria (troque aqui quando entrarem estampas novas)
const CATS=[['all','Todos'],['gaming','Gaming e pixel'],['anime','Anime e Japão'],['autorais','Estampas autorais'],['basicas','Básicas']];
const CAT_OF={'geek-coracao':'gaming','geek-carpa':'anime','geek-dragao':'anime','geek-ronin':'anime','heavy-avesso':'autorais','heavy-faces':'autorais','heavy-eclipse':'autorais','simples':'basicas'};
// Drop atual (rótulo DROP_NN): as estampas da coleção, cada uma com as cores que existirem
const DROP=['geek-dragao','geek-ronin','geek-coracao','geek-carpa'],DROP_NOW='DROP_02',DROP_NEXT='DROP_03';
const SIZE_GUIDE=[['P',54,70],['M',57,73],['G',60,76],['GG',63,79]];
// A sacola é a mesma da duavesso: o que entra aqui aparece lá, e vice-versa. Este site mostra e finaliza
// só as peças da Marileus; as de outras lojas continuam na sacola da duavesso.
const CART_KEY='duavesso.cart.v1';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
// O drop atual vem primeiro na vitrine
const items=PRODUCTS.filter(p=>p.brand===BRAND).sort((a,b)=>{const ia=DROP.indexOf(a.id),ib=DROP.indexOf(b.id);return (ia<0?99:ia)-(ib<0?99:ib);});
const byId=id=>items.find(p=>p.id===id);
// Entre coleções (estampas em reformulação): sem peças à venda, o site vira a espera do próximo drop
const between=!items.length;
if(between){
 document.body.classList.add('ml-between');
 $('.ml-ticker-track').innerHTML=[`[${DROP_NEXT}] em produção`,'Estampas novas em breve','Entre na lista e saiba primeiro',`[${DROP_NEXT}] em produção`,'Estampas novas em breve','Entre na lista e saiba primeiro'].map(t=>`<span>${t}</span>`).join('');
 const cta=$('.ml-ctas .ml-btn-primary');cta.textContent='Entrar na lista';cta.href='marileus#lista';
 const sec=$('.ml-ctas .ml-btn-ghost');sec.textContent='Conhecer a marca';sec.href='marileus#manifesto';
 $('.ml-lead').textContent='As estampas da Marileus estão sendo redesenhadas. O próximo drop sai em lote pequeno: quem está na lista fica sabendo antes de abrir.';
 $$('a[href="marileus#drop"]').forEach(a=>{a.href='marileus#lista';});
 $('#drop').hidden=true;$('#ml-search-open').hidden=true;
 // Menu enxuto: sem vitrine, os atalhos são o próximo drop, a marca e a lista
 const nav='<a href="marileus#estampas">Próximo drop</a><a href="marileus#manifesto">Sobre a marca</a><a href="marileus#lista">Lista de espera</a>';
 $('.ml-links').innerHTML=nav;$('#ml-mobile').innerHTML=nav;
 $('#ml-cat-title').textContent='Próximo drop';$('.ml-catalog .ml-head .ml-tag').textContent=`[${DROP_NEXT}] em produção`;
}
const photos=(p,base)=>{const v=p.variants?(p.variants.find(x=>x.base===base)||p.variants[0]):null;return v?v.photos:(p.photos||[]);};
const pic=(name,alt,sizes,lazy=true)=>`<picture><source type="image/webp" srcset="assets/${name}-400.webp 400w, assets/${name}-800.webp 800w, assets/${name}-1024.webp 1024w" sizes="${sizes}"><img src="assets/${name}-1024.jpg" alt="${esc(alt)}" width="1024" height="1536" decoding="async"${lazy?' loading="lazy"':''}></picture>`;
const price=p=>discountOf(p)?`<s>${money(p.compareAt)}</s><b>${money(p.price)}</b>`:`<b>${money(p.price)}</b>`;
// Entradas suaves conforme a página desce (desligadas com movimento reduzido)
const io='IntersectionObserver' in window&&!still()?new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.remove('pre');en.target.classList.add('in');io.unobserve(en.target);}}),{rootMargin:'0px 0px -8% 0px'}):null;
// Só os cartões da vitrine entram assim; se o navegador não avisar a tempo, aparecem mesmo assim
function reveal(els){els.forEach(el=>{if(io){el.classList.add('pre');io.observe(el);}else el.classList.add('in');});if(io)setTimeout(()=>els.forEach(el=>{if(el.classList.contains('pre')){el.classList.remove('pre');el.classList.add('in');io.unobserve(el);}}),2500);}
let toastTimer;
function toast(msg){const t=$('#ml-toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('on'),3800);}
function openDialog(d){if(!d.open)d.showModal();document.documentElement.classList.add('ml-lock');}
function closeDialog(d){if(!d.open)return;if(still()){d.close();return;}d.classList.add('closing');setTimeout(()=>{d.classList.remove('closing');d.close();},220);}
$$('dialog').forEach(d=>{
 d.addEventListener('close',()=>{if(!$$('dialog').some(x=>x.open))document.documentElement.classList.remove('ml-lock');});
 d.addEventListener('cancel',e=>{e.preventDefault();closeDialog(d);});
 d.addEventListener('click',e=>{if(e.target===d||e.target.closest('[data-close]'))closeDialog(d);});
});

// Carrinho ----------------------------------------------------------------------------------------
const mine=i=>i.id!=='custom'&&i.brand===BRAND;
let others=[],cart=read();
function read(){let all=[];try{all=normalizeCart(JSON.parse(localStorage.getItem(CART_KEY))||[]);}catch{}others=all.filter(i=>!mine(i));return all.filter(mine);}
function save(){try{localStorage.setItem(CART_KEY,JSON.stringify([...others,...cart]));}catch{}paintCount();}
function paintCount(){const n=cart.reduce((s,i)=>s+i.qty,0),el=$('#ml-count');if(el.textContent!==String(n)){el.textContent=n;el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}$('#ml-cart-open').setAttribute('aria-label',`Abrir carrinho, ${n} ${n===1?'peça':'peças'}`);}
function add(p,size,base){
 const b=p.variants?(base||p.variants[0].base):p.base,key=p.variants?`${p.id}-${b}-${size}`:`${p.id}-${size}`;
 const found=cart.find(i=>i.key===key);
 if(found&&found.qty>=10){toast('Limite de 10 unidades por estampa e tamanho.');return false;}
 const raw=cart.map(({id,base,size,qty})=>({id,base,size,qty}));
 if(found)found.qty++;else raw.push({id:p.id,base:b,size,qty:1});
 cart=found?cart:normalizeCart(raw);save();return true;
}
window.addEventListener('storage',e=>{if(e.key===CART_KEY){cart=read();paintCount();if($('#ml-drawer').open)renderDrawer();}});

// Hero: título que "decodifica" uma vez e o card do drop atual -------------------------------------------
function decode(el){
 const final=el.textContent;if(still())return;
 // Letras e números de largura parecida e altura travada: o título não pula. O avanço é pelo relógio,
 // então termina no tempo certo mesmo se o navegador atrasar os quadros.
 const glyphs='ABCDEFGHKLMNOPRSTUVXZ0123456789',step=26,total=(final.length+12)*step,t0=performance.now();
 el.style.minHeight=`${el.offsetHeight}px`;el.setAttribute('aria-label',final);
 const tick=()=>{const t=performance.now()-t0;if(t>=total){el.textContent=final;el.removeAttribute('aria-label');el.style.minHeight='';return;}
  const n=t/step-12;el.textContent=[...final].map((c,i)=>c===' '?' ':i<n?c:glyphs[(Math.random()*glyphs.length)|0]).join('');setTimeout(tick,step);};
 tick();
}
decode($('[data-decode]'));
let dropIdx=0,dropTimer;
function renderDropCard(){
 const list=DROP.map(byId).filter(Boolean),p=list[dropIdx%list.length];if(!p)return;
 $('#ml-drop-card').innerHTML=`<span class="ml-corner tl"></span><span class="ml-corner tr"></span><span class="ml-corner bl"></span><span class="ml-corner br"></span>
<p class="ml-badge"><span class="ml-live" aria-hidden="true"></span>[DISPONÍVEL AGORA]</p>
<button type="button" class="ml-drop-shot" data-quick="${p.id}" aria-label="Ver ${esc(p.name)}">${pic(photos(p)[0],p.name,'(max-width:900px) 80vw, 30vw',false)}</button>
<div class="ml-drop-info"><div><span class="ml-mini">[${DROP_NOW}] ${String(dropIdx%list.length+1).padStart(2,'0')}/${String(list.length).padStart(2,'0')}</span><h3>${esc(p.name)}</h3></div><p class="ml-price">${price(p)}</p></div>
<div class="ml-dots" role="group" aria-label="Escolher estampa do drop">${list.map((x,i)=>`<button type="button" data-dot="${i}" aria-label="${esc(x.name)}"${i===dropIdx%list.length?' aria-current="true"':''}></button>`).join('')}</div>`;
}
function startDrop(){clearInterval(dropTimer);if(!still())dropTimer=setInterval(()=>{dropIdx++;renderDropCard();},5200);}
$('#ml-drop-card').addEventListener('click',e=>{const d=e.target.closest('[data-dot]');if(d){dropIdx=+d.dataset.dot;renderDropCard();startDrop();}});
$('#ml-drop-card').addEventListener('mouseenter',()=>clearInterval(dropTimer));
$('#ml-drop-card').addEventListener('mouseleave',startDrop);
if(between)$('#ml-drop-card').innerHTML=`<span class="ml-corner tl"></span><span class="ml-corner tr"></span><span class="ml-corner bl"></span><span class="ml-corner br"></span>
<p class="ml-badge"><span class="ml-live" aria-hidden="true"></span>[${DROP_NEXT}] EM PRODUÇÃO</p>
<div class="ml-wait"><img src="assets/marileus-mark.png" alt="" width="234" height="226"><span class="ml-wait-scan" aria-hidden="true"></span></div>
<div class="ml-drop-info"><div><span class="ml-mini">PRÓXIMO DROP</span><h3>Estampas em reformulação</h3></div></div>
<a class="ml-btn ml-btn-primary ml-wide" href="marileus#lista">Avise-me no lançamento</a>`;
else{renderDropCard();startDrop();}

// Vitrine ---------------------------------------------------------------------------------------------
let filter='all';
const catsWithItems=()=>CATS.filter(([k])=>k==='all'||items.some(p=>CAT_OF[p.id]===k));
function renderFilters(){$('#ml-filters').innerHTML=catsWithItems().map(([k,l])=>`<button type="button" data-filter="${k}" aria-pressed="${k===filter}">${esc(l)}</button>`).join('');}
const shots=(p,base)=>{const ph=photos(p,base),v=p.variants?(p.variants.find(x=>x.base===base)||p.variants[0]):null;
 return `${pic(ph[0],`${p.name}, ${v?v.color:p.color}`,'(max-width:700px) 92vw, (max-width:1100px) 46vw, 31vw')}${ph[1]?`<span class="ml-shot-alt">${pic(ph[1],'','(max-width:700px) 92vw, 31vw')}</span>`:''}`;};
function card(p,i){
 const off=discountOf(p),multi=p.variants&&p.variants.length>1,base=p.variants?p.variants[0].base:p.base;
 return `<article class="ml-card" style="--i:${i}" data-id="${p.id}" data-base="${base}"><button type="button" class="ml-shot" data-quick="${p.id}" aria-label="Ver ${esc(p.name)}"><span class="ml-shot-pics">${shots(p,base)}</span>${off?`<span class="ml-off">-${off}%</span>`:''}<span class="ml-view">Visualização rápida</span></button>
<div class="ml-card-body"><p class="ml-chips"><span>100% algodão</span><span>Oversized</span>${DROP.includes(p.id)?`<span class="hot">[${DROP_NOW}]</span>`:''}</p><h3>${esc(p.name)}</h3>
${multi?`<div class="ml-swatches" role="group" aria-label="Cor de ${esc(p.name)}"><span class="ml-swatch-name">${esc(p.variants[0].color)}</span>${p.variants.map(x=>`<button type="button" data-swatch="${x.base}" style="--c:${x.swatch}" aria-label="${esc(x.color)}" aria-pressed="${x.base===base}"></button>`).join('')}</div>`:`<p class="ml-swatches single"><span class="ml-swatch-name">${esc(p.variants?p.variants[0].color:p.color)}</span></p>`}
<p class="ml-price">${price(p)}<small>ou ${INSTALLMENTS}x de ${money(installment(p.price))}</small></p>
<div class="ml-sizes" role="group" aria-label="Adicionar ${esc(p.name)} ao carrinho por tamanho">${SIZES.map(s=>`<button type="button" data-add="${p.id}" data-size="${s}" aria-label="Adicionar tamanho ${s}">${s}</button>`).join('')}</div></div></article>`;
}
function renderProducts(){
 const q=$('#ml-search').value.trim().toLocaleLowerCase('pt-BR');
 const list=items.filter(p=>(filter==='all'||CAT_OF[p.id]===filter)&&`${p.name} ${p.color} ${p.description}`.toLocaleLowerCase('pt-BR').includes(q));
 $('#ml-products').innerHTML=list.length?list.map(card).join(''):`<div class="ml-empty"><p>Nenhuma estampa com “${esc(q)}”.</p><button type="button" class="ml-btn ml-btn-ghost" id="ml-clear">Ver todas</button></div>`;
 $('#ml-results').textContent=`${list.length} ${list.length===1?'peça':'peças'}`;
 reveal($$('#ml-products .ml-card'));
}
$('#ml-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;filter=b.dataset.filter;renderFilters();renderProducts();});
$('#ml-search').addEventListener('input',renderProducts);
$('#ml-products').addEventListener('click',e=>{
 if(e.target.closest('#ml-clear')){$('#ml-search').value='';filter='all';renderFilters();renderProducts();return;}
 const sw=e.target.closest('[data-swatch]');
 if(sw){const art=sw.closest('.ml-card'),p=byId(art.dataset.id),v=p.variants.find(x=>x.base===sw.dataset.swatch);
  art.dataset.base=v.base;art.querySelector('.ml-shot-pics').innerHTML=shots(p,v.base);art.querySelector('.ml-swatch-name').textContent=v.color;
  $$('[data-swatch]',art).forEach(b=>b.setAttribute('aria-pressed',String(b===sw)));return;}
 const a=e.target.closest('[data-add]');
 if(a){const p=byId(a.dataset.add),art=a.closest('.ml-card'),base=art?.dataset.base,v=p.variants?.find(x=>x.base===base);if(add(p,a.dataset.size,base)){a.classList.add('ok');setTimeout(()=>a.classList.remove('ok'),700);toast(`${p.name}${v?` ${v.color.toLowerCase()}`:''} · ${a.dataset.size} no carrinho.`);}}
});
$('#ml-search-open').addEventListener('click',()=>{$('#estampas').scrollIntoView({behavior:still()?'instant':'smooth'});setTimeout(()=>$('#ml-search').focus({preventScroll:true}),still()?0:450);});
if(between){$('#ml-filters').hidden=true;$('#ml-search-wrap').hidden=true;$('#ml-results').hidden=true;
 $('#ml-products').innerHTML=`<div class="ml-empty ml-soon"><img src="assets/marileus-mark.png" alt="" width="80" height="77"><p class="ml-tag">[${DROP_NEXT}] em produção</p><h3>As estampas estão sendo redesenhadas.</h3><p>A coleção anterior saiu da loja. As novas estampas chegam no próximo drop, em lote pequeno.</p><a class="ml-btn ml-btn-primary" href="marileus#lista">Entrar na lista</a></div>`;}
else{renderFilters();renderProducts();}

// Drop exclusivo ----------------------------------------------------------------------------------------
(function renderDrop(){
 if(between)return;
 const list=DROP.map(byId).filter(Boolean);if(!list.length)return;
 $('#ml-drop-media').innerHTML=list.map((p,i)=>`<button type="button" class="ml-drop-tile t${i}" data-quick="${p.id}" aria-label="Ver ${esc(p.name)}">${pic(photos(p)[0],p.name,'(max-width:900px) 50vw, 28vw')}</button>`).join('');
 $('#ml-drop-list').innerHTML=list.map(p=>`<li><button type="button" data-quick="${p.id}"><span>${esc(p.name)}</span><span class="ml-price">${price(p)}</span></button></li>`).join('');
})();

// Visualização rápida ----------------------------------------------------------------------------------
document.addEventListener('click',e=>{const q=e.target.closest('[data-quick]');if(q){e.preventDefault();openQuick(q.dataset.quick,q.closest('.ml-card')?.dataset.base);}});
function openQuick(id,start){
 const p=byId(id);if(!p)return;
 let base=p.variants?(p.variants.find(x=>x.base===start)||p.variants[0]).base:p.base,size=null,shot=0;
 const body=$('#ml-quick-body');
 const paint=()=>{
  const ph=photos(p,base),v=p.variants?.find(x=>x.base===base);
  body.innerHTML=`<button type="button" class="ml-icon ml-q-close" data-close aria-label="Fechar">×</button>
<div class="ml-q-gallery"><div class="ml-q-main">${pic(ph[shot]||ph[0],`${p.name}, foto ${shot+1}`,'(max-width:900px) 92vw, 50vw',false)}</div><div class="ml-q-thumbs">${ph.map((n,i)=>`<button type="button" data-shot="${i}" aria-label="Foto ${i+1}"${i===shot?' aria-current="true"':''}>${pic(n,'','96px')}</button>`).join('')}</div></div>
<div class="ml-q-info"><p class="ml-tag">${DROP.includes(p.id)?`[${DROP_NOW}] `:''}[${esc((CATS.find(([k])=>k===CAT_OF[p.id])||['',''])[1]).toUpperCase()}]</p><h2 id="ml-q-name">${esc(p.name)}</h2><p class="ml-price big">${price(p)}${discountOf(p)?`<em>-${discountOf(p)}%</em>`:''}<small>ou ${INSTALLMENTS}x de ${money(installment(p.price))} sem juros</small></p>
<p class="ml-q-desc">${esc(p.description)}</p>
${p.variants?`<div class="ml-field"><span>Cor: <b>${esc(v.color)}</b></span><div class="ml-colors">${p.variants.map(x=>`<button type="button" data-base="${x.base}" style="--c:${x.swatch}" aria-label="${esc(x.color)}" aria-pressed="${x.base===base}"></button>`).join('')}</div></div>`:`<div class="ml-field"><span>Cor: <b>${esc(p.color)}</b></span></div>`}
<div class="ml-field"><span>Tamanho</span><div class="ml-q-sizes">${SIZES.map(s=>`<button type="button" data-pick="${s}" aria-pressed="${s===size}">${s}</button>`).join('')}</div><details class="ml-guide"><summary>Guia de medidas</summary><table><thead><tr><th scope="col">Tamanho</th><th scope="col">Largura</th><th scope="col">Comprimento</th></tr></thead><tbody>${SIZE_GUIDE.map(([s,w,h])=>`<tr><th scope="row">${s}</th><td>${w} cm</td><td>${h} cm</td></tr>`).join('')}</tbody></table><p>Peça estendida, em centímetros. Para menos volume, escolha um tamanho abaixo.</p></details></div>
<button type="button" class="ml-btn ml-btn-primary ml-q-add" id="ml-q-add"${size?'':' disabled'}>${size?`Adicionar ao carrinho · ${size}`:'Escolha um tamanho'}</button>
<dl class="ml-q-specs"><div><dt>Tecido</dt><dd>${esc(p.fabric)}</dd></div>${p.print?`<div><dt>Estampa</dt><dd>${esc(p.print)}</dd></div>`:''}<div><dt>Caimento</dt><dd>${esc(p.fit)}</dd></div><div><dt>Cuidados</dt><dd>${esc(p.care)}</dd></div></dl></div>`;
 };
 body.onclick=e=>{
  const t=e.target.closest('[data-shot],[data-base],[data-pick],#ml-q-add');if(!t)return;
  if(t.dataset.shot){shot=+t.dataset.shot;paint();return;}
  if(t.dataset.base){base=t.dataset.base;shot=0;paint();return;}
  if(t.dataset.pick){size=t.dataset.pick;paint();$('#ml-q-add',body).focus();return;}
  if(t.id==='ml-q-add'&&size&&add(p,size,base)){closeDialog($('#ml-quick'));setTimeout(()=>{renderDrawer();openDialog($('#ml-drawer'));},still()?0:240);}
 };
 paint();openDialog($('#ml-quick'));
}

// Carrinho lateral --------------------------------------------------------------------------------------
const state={shipping:'standard',coupon:null};
function sums(){return totals(cart,state.shipping,{coupon:state.coupon?.discount||0});}
function renderDrawer(){
 const box=$('#ml-drawer-body');
 if(!cart.length){box.innerHTML=`<div class="ml-empty"><img src="assets/marileus-mark.png" alt="" width="80" height="77"><p>Nenhuma peça da Marileus no carrinho.</p><button type="button" class="ml-btn ml-btn-ghost" data-close data-go="estampas">Explorar estampas</button>${othersNote()}</div>`;return;}
 if(state.coupon){state.coupon=null;}
 const t=sums(),min=freeShippingMin(),left=min!==null?Math.max(0,min-(t.subtotal-t.promo)):null;
 box.innerHTML=`<ul class="ml-lines">${cart.map(i=>`<li><span class="ml-line-img">${pic(photos(byId(i.id),i.base)[0],'','72px')}</span><div><b>${esc(i.name)}</b><small>${esc(i.color)} · ${i.size}</small><div class="ml-qty"><button type="button" data-q="-1" data-k="${esc(i.key)}" aria-label="Menos uma ${esc(i.name)}">−</button><span>${i.qty}</span><button type="button" data-q="1" data-k="${esc(i.key)}" aria-label="Mais uma ${esc(i.name)}"${i.qty>=10?' disabled':''}>+</button></div></div><div class="ml-line-end"><span>${money(i.price*i.qty)}</span><button type="button" class="ml-link" data-rm="${esc(i.key)}">Remover</button></div></li>`).join('')}</ul>
${left!==null?`<div class="ml-ship-goal"><p>${left?`Faltam <b>${money(left)}</b> para o frete grátis.`:'Frete grátis liberado.'}</p><span><i style="width:${Math.min(100,Math.round((t.subtotal-t.promo)/min*100))}%"></i></span></div>`:''}
<fieldset class="ml-ship"><legend>Entrega</legend>
<label><input type="radio" name="ml-ship" value="standard"${state.shipping==='standard'?' checked':''}><span><b>Padrão</b><small>5 a 8 dias úteis</small></span><em>${min!==null&&t.subtotal-t.promo>=min?'Grátis':money(1490)}</em></label>
<label><input type="radio" name="ml-ship" value="express"${state.shipping==='express'?' checked':''}><span><b>Expressa</b><small>2 a 3 dias úteis</small></span><em>${money(2490)}</em></label></fieldset>
<p class="ml-drawer-note">O cupom de desconto entra na etapa de pagamento.</p>
<div class="ml-sum"><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.promo?`<div><span>Promoção</span><span>−${money(t.promo)}</span></div>`:''}<div><span>Frete</span><span>${t.delivery?money(t.delivery):'Grátis'}</span></div><div class="ml-total"><span>Total</span><span>${money(t.total)}</span></div></div>
<button type="button" class="ml-btn ml-btn-primary ml-wide" id="ml-go-checkout">Finalizar pedido</button>${othersNote()}`;
}
function othersNote(){const n=others.reduce((s,i)=>s+i.qty,0);return n?`<p class="ml-drawer-note">Você também tem ${n} ${n===1?'peça':'peças'} de outras lojas na sacola da duavesso. <a class="ml-link" href="checkout">Finalizar tudo na duavesso</a></p>`:'';}
$('#ml-drawer').addEventListener('click',e=>{
 const q=e.target.closest('[data-q]'),rm=e.target.closest('[data-rm]'),go=e.target.closest('[data-go]');
 if(q){const it=cart.find(i=>i.key===q.dataset.k);it.qty+=+q.dataset.q;cart=cart.filter(i=>i.qty>0);save();renderDrawer();}
 if(rm){cart=cart.filter(i=>i.key!==rm.dataset.rm);save();renderDrawer();}
 if(go)setTimeout(()=>$('#estampas').scrollIntoView({behavior:still()?'instant':'smooth'}),still()?0:240);
 if(e.target.closest('#ml-go-checkout')){closeDialog($('#ml-drawer'));setTimeout(openCheckout,still()?0:240);}
});
$('#ml-drawer').addEventListener('change',e=>{if(e.target.name==='ml-ship'){state.shipping=e.target.value;renderDrawer();}});
$('#ml-cart-open').addEventListener('click',()=>{renderDrawer();openDialog($('#ml-drawer'));});

// Checkout em etapas -----------------------------------------------------------------------------------
const UFS='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
let step=1;const ship={};
const user=getUser();
if(user){ship.name=user.name||'';ship.email=user.email||'';const a=$('#ml-account');a.textContent=`Olá, ${(user.name||user.email).split(/[\s@]/)[0]}`;a.title='Sua conta duavesso';}
function openCheckout(){if(!cart.length)return;step=1;renderCheckout();openDialog($('#ml-checkout'));}
function summaryHTML(){
 const t=sums();
 return `<aside class="ml-co-sum"><p class="ml-tag">[RESUMO]</p><ul>${cart.map(i=>`<li><span>${i.qty}× ${esc(i.name)}<small>${esc(i.color)} · ${i.size}</small></span><b>${money(i.price*i.qty)}</b></li>`).join('')}</ul>
<div class="ml-sum"><div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.promo?`<div><span>Promoção</span><span>−${money(t.promo)}</span></div>`:''}${t.coupon?`<div><span>Cupom ${esc(state.coupon.code)}</span><span>−${money(t.coupon)}</span></div>`:''}<div><span>Frete ${state.shipping==='express'?'expresso':'padrão'}</span><span>${t.delivery?money(t.delivery):'Grátis'}</span></div><div class="ml-total"><span>Total</span><span>${money(t.total)}</span></div></div></aside>`;
}
function stepsHTML(){return `<ol class="ml-steps">${['Envio','Pagamento','Confirmado'].map((s,i)=>`<li class="${i+1<step?'done':i+1===step?'on':''}"${i+1===step?' aria-current="step"':''}><span>${i+1}</span>${s}</li>`).join('')}</ol>`;}
function renderCheckout(result){
 const box=$('#ml-checkout-body');
 const head=`<div class="ml-co-head"><img src="assets/marileus-logo.png" alt="Marileus" width="1152" height="226"><h2 id="ml-co-title" class="ml-sr">Finalizar pedido</h2><button type="button" class="ml-icon" data-close aria-label="Fechar">×</button></div>${stepsHTML()}`;
 if(step===1){
  box.innerHTML=`${head}<div class="ml-co-grid"><form class="ml-co-form" id="ml-co-ship" novalidate>
<p class="ml-co-pre">${user?`Comprando com a sua conta duavesso (${esc(user.email)}): o pedido aparece em Minha conta.`:'O pedido fica registrado na duavesso. Entrando na sua conta, ele aparece em Minha conta.'} Pré-lançamento: nenhum valor é cobrado por enquanto.</p>
<div class="ml-row2"><label>Nome completo<input name="name" required maxlength="100" autocomplete="name" value="${esc(ship.name||'')}"></label><label>E-mail<input name="email" type="email" required maxlength="120" autocomplete="email" value="${esc(ship.email||'')}"></label></div>
<div class="ml-row3"><label>CEP<input name="cep" required inputmode="numeric" maxlength="9" placeholder="00000-000" autocomplete="postal-code" value="${esc(ship.cep||'')}"></label><label>Estado<select name="uf" required><option value="">UF</option>${UFS.map(u=>`<option${u===ship.uf?' selected':''}>${u}</option>`).join('')}</select></label><label>Cidade<input name="city" required maxlength="80" autocomplete="address-level2" value="${esc(ship.city||'')}"></label></div>
<div class="ml-row2 wide"><label>Rua<input name="street" required maxlength="120" autocomplete="address-line1" value="${esc(ship.street||'')}"></label><label>Número<input name="number" required maxlength="10" value="${esc(ship.number||'')}"></label></div>
<label>Complemento (opcional)<input name="extra" maxlength="60" autocomplete="address-line2" value="${esc(ship.extra||'')}"></label>
<p class="ml-co-msg" id="ml-co-msg" aria-live="polite"></p>
<button type="submit" class="ml-btn ml-btn-primary ml-wide">Continuar para o pagamento</button></form>${summaryHTML()}</div>`;
  const f=$('#ml-co-ship');
  f.elements.cep.addEventListener('input',async e=>{let v=e.target.value.replace(/\D/g,'').slice(0,8);e.target.value=v.length>5?`${v.slice(0,5)}-${v.slice(5)}`:v;if(v.length!==8)return;
   try{const r=await fetch(`https://viacep.com.br/ws/${v}/json/`).then(x=>x.json());if(r.erro){$('#ml-co-msg').textContent='CEP não encontrado. Confira os números.';return;}$('#ml-co-msg').textContent='';f.elements.uf.value=r.uf||'';f.elements.city.value=r.localidade||'';if(r.logradouro)f.elements.street.value=r.logradouro;f.elements.number.focus();}catch{}});
  f.addEventListener('submit',e=>{e.preventDefault();const bad=[...f.elements].find(x=>x.willValidate&&!x.checkValidity());if(bad){$('#ml-co-msg').textContent=`Confira o campo ${bad.closest('label').firstChild.textContent.trim().toLowerCase()}.`;bad.focus();return;}
   Object.assign(ship,Object.fromEntries(new FormData(f)));step=2;renderCheckout();});
  f.elements.name.focus();return;
 }
 if(step===2){
  const t=sums();
  box.innerHTML=`${head}<div class="ml-co-grid"><form class="ml-co-form" id="ml-co-pay" novalidate>
<p class="ml-co-to">Entrega para <b>${esc(ship.name)}</b>: ${esc(ship.street)}, ${esc(ship.number)}${ship.extra?` · ${esc(ship.extra)}`:''} · ${esc(ship.city)}/${esc(ship.uf)} <button type="button" class="ml-link" id="ml-back">Alterar</button></p>
<fieldset class="ml-pay"><legend>Pagamento</legend>
<label><input type="radio" name="pay" value="Pix" checked><span><b>Pix</b><small>Aprovação na hora</small></span></label>
<label><input type="radio" name="pay" value="Cartão"><span><b>Cartão de crédito</b><small>Até ${INSTALLMENTS}x sem juros</small></span></label></fieldset>
<div class="ml-pay-panel" id="ml-pay-panel"></div>
<div class="ml-coupon"><label>Cupom<input name="coupon" maxlength="30" autocomplete="off" placeholder="Seu cupom" value="${esc(state.coupon?.code||'')}"></label><button type="button" class="ml-btn ml-btn-ghost" id="ml-apply">Aplicar</button></div><p class="ml-co-msg" id="ml-cup-msg" aria-live="polite">${state.coupon?`Cupom ${esc(state.coupon.code)} aplicado: −${money(state.coupon.discount)}.`:''}</p>
<p class="ml-co-msg err" id="ml-co-msg" aria-live="assertive"></p>
<button type="submit" class="ml-btn ml-btn-primary ml-wide" id="ml-place">Confirmar pedido · ${money(t.total)}</button></form>${summaryHTML()}</div>`;
  const f=$('#ml-co-pay');
  const panel=()=>{const pay=f.elements.pay.value,tt=sums();$('#ml-pay-panel').innerHTML=pay==='Pix'?`<div class="ml-pix"><div class="ml-pix-frame" aria-hidden="true"><img src="assets/marileus-mark.png" alt="" width="60" height="58"></div><p><b>O QR Code e o Pix copia e cola aparecem depois de confirmar.</b> Pague no app do seu banco; o pedido entra em produção quando o pagamento cai.</p></div>`:`<label class="ml-inst">Parcelas<select name="installments">${Array.from({length:INSTALLMENTS},(_,i)=>`<option value="${i+1}">${i+1}x de ${money(Math.ceil(tt.total/(i+1)))} sem juros</option>`).join('')}</select></label><p class="ml-small">Os dados do cartão são digitados no ambiente seguro do provedor de pagamento, depois de confirmar. Eles nunca passam pela loja.</p>`;};
  panel();f.addEventListener('change',e=>{if(e.target.name==='pay')panel();});
  $('#ml-back').addEventListener('click',()=>{step=1;renderCheckout();});
  $('#ml-apply').addEventListener('click',async()=>{const code=f.elements.coupon.value.trim();const msg=$('#ml-cup-msg');if(!code){state.coupon=null;renderCheckout();return;}
   msg.textContent='Conferindo o cupom…';try{const tt=totals(cart,state.shipping);const r=await checkCoupon(code,tt.subtotal-tt.promo);if(r?.ok){state.coupon={code:r.code,discount:r.discount_cents};renderCheckout();}else{state.coupon=null;msg.textContent=r?.message||'Cupom inválido ou expirado.';}}catch(err){msg.textContent=err.message;}});
  f.addEventListener('submit',async e=>{
   e.preventDefault();const btn=$('#ml-place'),pay=f.elements.pay.value,inst=pay==='Cartão'?+(f.elements.installments?.value||1):1;
   if(!online()){$('#ml-co-msg').textContent='Sem conexão com a loja agora. Tente de novo em instantes.';return;}
   btn.disabled=true;btn.textContent='Registrando o pedido…';
   try{
    const res=await rpc('place_order',{p_customer:{name:ship.name,email:ship.email,cep:ship.cep,uf:ship.uf,city:ship.city,address:`${ship.street}, ${ship.number}${ship.extra?` - ${ship.extra}`:''}`,...(state.coupon?{coupon:state.coupon.code}:{}),...(pay==='Cartão'?{installments:inst}:{})},p_shipping:state.shipping,p_payment:pay,p_items:cart.map(i=>({kind:'catalog',product_id:i.id,base:i.base,size:i.size,qty:i.qty}))});
    cart=[];state.coupon=null;save();step=3;renderCheckout({...res,pay,inst});
   }catch(err){$('#ml-co-msg').textContent=err.message||'Não foi possível registrar o pedido. Tente de novo.';btn.disabled=false;btn.textContent=`Confirmar pedido · ${money(sums().total)}`;}
  });
  return;
 }
 const r=result||{};
 box.innerHTML=`${head}<div class="ml-done"><div class="ml-done-mark" aria-hidden="true"><img src="assets/marileus-mark.png" alt="" width="120" height="116"><span class="ml-scan"></span></div>
<p class="ml-done-code" data-decode>[PEDIDO #${esc(r.code||'')} CONFIRMADO]</p>
<p>${money(r.total_cents??0)} · ${esc(r.pay==='Cartão'?`Cartão em ${r.inst}x de ${money(Math.ceil((r.total_cents||0)/(r.inst||1)))}`:r.pay||'')}</p>
<p class="ml-small">${user?'O pedido já está em Minha conta, na duavesso.':`Guarde o código: você acompanha o pedido na duavesso, em Consultar status, com o código e o e-mail ${esc(ship.email||'')}.`} Pré-lançamento: nenhum valor é cobrado por enquanto.</p>
<div class="ml-ctas"><button type="button" class="ml-btn ml-btn-primary" data-close>Voltar às estampas</button><a class="ml-btn ml-btn-ghost" href="/">Acompanhar na duavesso</a></div></div>`;
 decode($('.ml-done-code',box));
}

// Newsletter estilo terminal ---------------------------------------------------------------------------
$('#ml-news').addEventListener('submit',async e=>{
 e.preventDefault();const f=e.target,out=$('#ml-news-out'),email=f.elements.email;
 if(f.elements.website.value){f.reset();return;}
 if(!email.checkValidity()){out.textContent='> erro: digite um e-mail válido, como nome@email.com';out.className='ml-term-out err';email.focus();return;}
 out.className='ml-term-out';out.textContent='> enviando…';
 try{await rpc('subscribe_newsletter',{p_email:email.value.trim()});out.textContent=`> acesso antecipado liberado para ${email.value.trim()}`;f.reset();}
 catch(err){out.className='ml-term-out err';out.textContent=`> erro: ${err.message}`;}
});

// Menu no celular, entradas da vitrine e números do manifesto ----------------------------------------------
$('#ml-menu-btn').addEventListener('click',()=>{const m=$('#ml-mobile'),open=m.hidden;m.hidden=!open;$('#ml-menu-btn').setAttribute('aria-expanded',String(open));});
$$('#ml-mobile a').forEach(a=>a.addEventListener('click',()=>{$('#ml-mobile').hidden=true;$('#ml-menu-btn').setAttribute('aria-expanded','false');}));
window.addEventListener('scroll',()=>$('#ml-nav').classList.toggle('scrolled',scrollY>24),{passive:true});

// Do banco: frete grátis atual e o Instagram da marca
fetchPromos().then(list=>{if(list){setPromos(list);if($('#ml-drawer').open)renderDrawer();}});
fetchBrand(BRAND).then(b=>{const ig=b?.links?.instagram;if(ig&&/^[A-Za-z0-9._]{1,30}$/.test(ig))$('#ml-social').innerHTML=`<a href="https://instagram.com/${ig}" target="_blank" rel="noopener">Instagram @${esc(ig)}</a>`;});
paintCount();
