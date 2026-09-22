import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const commerce=(await readFile(new URL('../dist/commerce.js',import.meta.url),'utf8')).replaceAll('export ','');
const api=(await readFile(new URL('../dist/api.js',import.meta.url),'utf8')).replaceAll('export ','');
const placement=(await readFile(new URL('../dist/studio-placement.js',import.meta.url),'utf8')).replaceAll('export ','');
const app=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'');
async function setup(storage={},fetchStub){
 const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 Object.defineProperty(w.document,'fonts',{value:{ready:Promise.resolve()}});
 w.Image=class {width=1000;height=1000;set src(value){this._src=value;queueMicrotask(()=>this.onload?.());}get src(){return this._src;}};
 w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},drawImage(){},save(){},translate(){},rotate(){},scale(){},beginPath(){},rect(){},clip(){},measureText(t){return {width:t.length*45};},fillText(){},restore(){},setLineDash(){},strokeRect(){},fillRect(){},roundRect(){},fill(){},stroke(){}});
 w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,AA==';
 w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new w.Blob(['test'],{type:'image/png'}));};
 for(const [key,value] of Object.entries(storage))w.localStorage.setItem(key,JSON.stringify(value));
 const registry=new Map();
 Object.defineProperty(w.document,'modelContext',{value:{registerTool(tool){registry.set(tool.name,tool);}}});
 if(fetchStub)w.fetch=fetchStub;
 w.eval(commerce+'\n'+api+'\n'+placement+'\nconst esc=escapeHTML;\n'+app);
 await new Promise(resolve=>setTimeout(resolve,10));
 return {dom,w,doc:w.document,registry,click(selector){const e=w.document.querySelector(selector);assert(e,`Missing ${selector}`);e.click();},close(){dom.window.close();}};
}
test('catalog filters and product selection feed the same persisted cart',async()=>{
 const s=await setup();try{
 assert.equal(s.doc.querySelectorAll('.product-card').length,4);
 assert.equal(s.doc.querySelector('[data-filter="essential"]'),null,'aba Essenciais removida');
 s.click('[data-filter="graphic"]');assert.equal(s.doc.querySelectorAll('.product-card').length,3);
 s.click('[data-product="heavy-eclipse"]');assert(s.doc.querySelector('#product-dialog').open);
 assert(s.doc.querySelector('#add-product').disabled);
 s.click('[data-size="G"]');s.click('#add-product');
 assert(s.doc.querySelector('#cart-dialog').open);assert.equal(s.doc.querySelector('#cart-count').textContent,'1');
 const stored=JSON.parse(s.w.localStorage.getItem('duavesso.cart.v1'));assert.equal(stored[0].size,'G');assert.equal(stored[0].price,15990);
 s.click('[data-qty="1"]');assert.equal(s.doc.querySelector('#cart-count').textContent,'2');
 s.click('[data-remove]');assert.equal(s.doc.querySelector('#cart-count').textContent,'0');assert(s.doc.querySelector('#continue-shopping'));
 }finally{s.close();}
});
test('checkout confirms a simulated order and never persists contact or address',async()=>{
 const s=await setup();try{
 s.click('[data-product="heavy-avesso"]');s.click('[data-size="M"]');s.click('#add-product');s.click('#begin-checkout');s.click('#fill-demo');
 const form=s.doc.querySelector('#checkout-form');assert(form.checkValidity());
 const express=s.doc.querySelector('[value="express"]');express.checked=true;express.dispatchEvent(new s.w.Event('change',{bubbles:true}));
 form.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));
 assert(s.doc.querySelector('#finish-order'));assert.equal(s.doc.querySelector('#cart-count').textContent,'0');
 const raw=s.w.localStorage.getItem('duavesso.orders.v1'),order=JSON.parse(raw)[0];assert.equal(order.total,18480);assert.equal(order.shipping,'express');assert.equal(order.items[0].size,'M');assert(!raw.includes('cliente@example.com'));assert(!raw.includes('Rua de Exemplo'));assert(!raw.includes('Cliente de Exemplo'));
 s.click('#finish-order');s.click('#view-orders');assert(s.doc.querySelector('#info-content').textContent.includes(order.id));
 }finally{s.close();}
});
test('customized variant includes snapshot and survives cart reload',async()=>{
 const s=await setup();let saved;try{
 s.w.location.hash='estudio';await new Promise(r=>setTimeout(r,10));assert.equal(s.doc.querySelector('#studio-view').hidden,false);
 s.doc.querySelector('#design-text').value='MINHA IDEIA';s.doc.querySelector('#design-size').value='GG';
 s.doc.querySelector('#design-form').dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,10));
 saved=JSON.parse(s.w.localStorage.getItem('duavesso.cart.v1'));assert.equal(saved[0].size,'GG');assert.equal(saved[0].design.prints[0].text,'MINHA IDEIA');assert.equal(saved[0].design.prints.length,1);assert(saved[0].preview.startsWith('data:image/jpeg'));assert.equal(saved[0].price,12990);
 }finally{s.close();}
 const r=await setup({'duavesso.cart.v1':saved});try{r.click('#open-cart');assert.equal(r.doc.querySelector('#cart-count').textContent,'1');assert(r.doc.querySelector('.cart-thumb img').src.startsWith('data:image/jpeg'));}finally{r.close();}
});
test('described print requires a brief, prices the design service and keeps the brief through reload',async()=>{
 const s=await setup();let saved;try{
 s.w.location.hash='estudio';await new Promise(r=>setTimeout(r,10));
 s.click('[data-mode="brief"]');assert.equal(s.doc.querySelector('#brief-fields').hidden,false);assert.equal(s.doc.querySelector('#create-fields').hidden,true);assert.equal(s.doc.querySelector('#custom-price').textContent,'R$ 149,90'.replace(' ',' '));
 const submit=()=>{s.doc.querySelector('#design-form').dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));return new Promise(r=>setTimeout(r,10));};
 s.doc.querySelector('#design-brief').value='curta';await submit();assert.equal(s.w.localStorage.getItem('duavesso.cart.v1'),null);
 s.doc.querySelector('#design-brief').value='Uma onda azul minimalista no peito com a frase sem pressa';s.doc.querySelector('#design-color').value='black';await submit();
 saved=JSON.parse(s.w.localStorage.getItem('duavesso.cart.v1'));assert.equal(saved[0].price,14990);assert.equal(saved[0].design.mode,'brief');assert(saved[0].design.brief.includes('onda azul'));assert.equal(saved[0].design.image,undefined);
 assert(s.doc.querySelector('#cart-content').textContent.includes('onda azul'));
 s.click('#reset-design');assert.equal(s.doc.querySelector('#brief-fields').hidden,true);assert.equal(s.doc.querySelector('#custom-price').textContent,'R$ 129,90'.replace(' ',' '));
 }finally{s.close();}
 const r=await setup({'duavesso.cart.v1':saved});try{r.click('#open-cart');assert.equal(r.doc.querySelector('.cart-item h3').textContent,'Sua camiseta · Estampa sob medida');assert(r.doc.querySelector('.brief-excerpt').textContent.includes('onda azul'));}finally{r.close();}
});
test('imperative tools register with schemas and reject invalid writes without changing cart',async()=>{
 const s=await setup();try{
 assert.equal(s.registry.size,2);const read=s.registry.get('read_duavesso_catalog_and_cart'),add=s.registry.get('add_duavesso_catalog_item_to_cart');
 assert.equal(read.annotations.readOnlyHint,true);assert.equal(add.inputSchema.required.length,2);
 assert.equal(read.execute({}).totals.count,0);assert.throws(()=>add.execute({productId:'heavy-avesso',size:'INVALID'}),/válidos/);assert.equal(read.execute({}).totals.count,0);
 const result=add.execute({productId:'heavy-avesso',size:'M'});assert.equal(result.added,true);assert.equal(read.execute({}).totals.count,1);assert.equal(s.doc.querySelector('#cart-count').textContent,'1');assert(s.doc.querySelector('#cart-dialog').open);
 }finally{s.close();}
});
test('the catalog stays local (stale server products ignored) and online checkout submits server-priced orders',async()=>{
 const calls=[];
 const fetchStub=async(url,init={})=>{
  calls.push({url:String(url),init});
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  if(url.includes('/rest/v1/products'))return json([{id:'off-line',name:'Oversized Off Line',category:'graphic',color:'Preto lavado',base:'black',price_cents:12345,tag:'X',graphic:'OFF\nLINE.',graphic_class:'graphic-off',description:'d',print:'',fabric:'f',finish:'f',fit:'f',care:'c'}]);
  if(url.includes('/rest/v1/rpc/place_order'))return json({code:'AV-TEST-0001',status:'aguardando_pagamento',count:1,subtotal_cents:12345,delivery_cents:1490,total_cents:13835});
  if(url.includes('/rest/v1/rpc/get_order'))return json({code:'AV-TEST-0001',status:'em_producao',created_at:'2026-09-11T00:00:00Z',total_cents:13835,payment:'Pix',shipping:'standard',items:[{name:'Oversized Off Line',base:'black',size:'M',qty:1,unit_price_cents:12345}]});
  return json({message:'nope'},404);
 };
 const s=await setup({},fetchStub);try{
 await new Promise(r=>setTimeout(r,20));
 assert.equal(s.doc.querySelectorAll('.product-card').length,4,'catálogo curado local (4 peças), não a tabela antiga do servidor');
 assert.equal(s.doc.querySelector('[data-product="off-line"]'),null,'produto antigo do servidor é ignorado');
 assert(s.doc.querySelector('[data-product="heavy-eclipse"]'),'produto local presente');
 s.click('[data-product="heavy-eclipse"]');s.click('[data-size="M"]');s.click('#add-product');s.click('#begin-checkout');
 assert.equal(s.doc.querySelector('#fill-demo'),null);
 const form=s.doc.querySelector('#checkout-form');
 for(const [k,v] of Object.entries({name:'Cliente Real',email:'cliente@example.com',cep:'60000-000',city:'Fortaleza',address:'Rua Um, 10'}))form.elements.namedItem(k).value=v;
 form.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,30));
 const order=calls.find(c=>c.url.includes('place_order'));assert(order);const body=JSON.parse(order.init.body);
 assert.deepEqual(body.p_items,[{kind:'catalog',product_id:'heavy-eclipse',size:'M',qty:1}]);assert.equal(body.p_customer.email,'cliente@example.com');
 assert(order.init.headers.apikey.startsWith('sb_publishable_'));
 assert(s.doc.querySelector('.order-id').textContent.includes('AV-TEST-0001'));assert.equal(s.doc.querySelector('#cart-count').textContent,'0');
 const raw=s.w.localStorage.getItem('duavesso.orders.v1');assert(raw.includes('AV-TEST-0001'));assert(!raw.includes('cliente@example.com'));
 s.click('#finish-order');s.click('#view-orders');
 const lookup=s.doc.querySelector('#order-lookup');assert(lookup);lookup.elements.namedItem('code').value='AV-TEST-0001';lookup.elements.namedItem('email').value='cliente@example.com';
 lookup.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert(s.doc.querySelector('#lookup-result').textContent.includes('Em produção'));
 }finally{s.close();}
});
test('produto de fotos: card com 3 poses e modal com galeria das 3',async()=>{
 const s=await setup();try{
 const card=s.doc.querySelector('[data-product="heavy-avesso"]');assert(card);
 assert(card.querySelector('.product-visual.poses'),'card usa poses (fotos reais)');
 assert.equal(card.querySelectorAll('.product-visual.poses .pose').length,3);
 assert.equal(card.querySelectorAll('.pose.is-active').length,1,'uma pose ativa por padrão');
 assert.equal(card.querySelector('.product-graphic'),null,'sem overlay de texto quando há foto');
 s.click('[data-product="heavy-avesso"]');
 assert(s.doc.querySelector('#product-detail .detail-gallery'),'modal abre com galeria');
 assert(s.doc.querySelector('#detail-main img'),'imagem principal presente');
 assert.equal(s.doc.querySelectorAll('#detail-thumbs .detail-thumb').length,3,'3 miniaturas de pose');
 assert.equal(s.doc.querySelectorAll('#detail-thumbs .detail-thumb.active').length,1,'uma miniatura ativa');
 s.click('#detail-thumbs [data-pose="2"]');
 assert(s.doc.querySelector('#detail-main img').getAttribute('src').includes('tee-porta-3'),'clicar na miniatura troca a foto principal');
 assert(s.doc.querySelector('#product-detail [data-size="M"]'),'ainda dá pra escolher tamanho');
 }finally{s.close();}
});
test('produto Simples: seletor de cor troca as fotos e a cor vai pro pedido',async()=>{
 const s=await setup();try{
 const card=s.doc.querySelector('[data-product="simples"]').closest('.product-card');assert(card,'card do Simples');
 assert.equal(card.querySelectorAll('.color-dots .color-dot').length,3,'3 bolinhas de cor no card');
 s.click('[data-product="simples"]');
 const sw=[...s.doc.querySelectorAll('.detail-swatch')];assert.equal(sw.length,3,'3 swatches no modal');
 const mainSrc=()=>s.doc.querySelector('#detail-main img').getAttribute('src');
 assert(mainSrc().includes('tee-simples-preto'),'começa no preto (padrão)');
 sw.find(b=>b.dataset.base==='brown').click();
 assert(mainSrc().includes('tee-simples-marrom'),'ao escolher marrom, a foto principal muda');
 assert.equal(s.doc.querySelector('#detail-color-name').textContent,'Marrom');
 assert.equal(s.doc.querySelectorAll('#detail-thumbs .detail-thumb')[0].querySelector('img').getAttribute('src').includes('tee-simples-marrom-1'),true,'miniaturas também trocam de cor');
 s.click('#product-detail [data-size="G"]');s.click('#add-product');
 const stored=JSON.parse(s.w.localStorage.getItem('duavesso.cart.v1'));
 assert.equal(stored[0].base,'brown');assert.equal(stored[0].color,'Marrom');assert.equal(stored[0].size,'G');assert.equal(stored[0].price,11990);
 assert.equal('variants' in stored[0],false,'não guarda o array de variantes na sacola');
 }finally{s.close();}
});
test('accounts: signup asks for confirmation, login updates header, account lists orders, checkout prefills, logout clears',async()=>{
 const calls=[];
 const fetchStub=async(url,init={})=>{
  calls.push({url:String(url),init});
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  if(url.includes('/rest/v1/products'))return json([]);
  if(url.includes('/auth/v1/signup'))return json({id:'u1',email:'nova@example.com',user_metadata:{name:'Nova'}});
  if(url.includes('/auth/v1/token?grant_type=password')){const body=JSON.parse(init.body);if(body.password!=='senha1234')return json({error_code:'invalid_credentials',msg:'Invalid login credentials'},400);return json({access_token:'tok',refresh_token:'ref',expires_in:3600,user:{id:'u1',email:'nova@example.com',user_metadata:{name:'Nova Cliente'},app_metadata:{provider:'email'}}});}
  if(url.includes('/rest/v1/profiles'))return init.method==='PATCH'?json(null,204):json([{name:'Nova Cliente',cep:'60000-000',city:'Fortaleza',address:'Rua Um, 10'}]);
  if(url.includes('/rest/v1/orders'))return json([{code:'AV-DB-1',status:'em_producao',created_at:'2026-09-11T00:00:00Z',total_cents:12480,payment:'Pix',shipping:'standard',order_items:[{name:'Essencial Preta',base:'black',size:'M',qty:1,unit_price_cents:8990}]}]);
  if(url.includes('/auth/v1/logout'))return json(null,204);
  return json({message:'nope'},404);
 };
 const s=await setup({},fetchStub);try{
 await new Promise(r=>setTimeout(r,20));
 assert.equal(s.doc.querySelector('#open-auth').hidden,false);assert.equal(s.doc.querySelector('#open-account').hidden,true);
 s.click('#open-auth');assert(s.doc.querySelector('#auth-dialog').open);s.click('[data-auth-tab="signup"]');
 const signup=s.doc.querySelector('#signup-form');signup.elements.namedItem('name').value='Nova';signup.elements.namedItem('email').value='nova@example.com';signup.elements.namedItem('password').value='senha1234';
 signup.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert(s.doc.querySelector('#auth-status').textContent.includes('confirma'));assert.equal(s.w.localStorage.getItem('duavesso.session.v1'),null);
 s.click('[data-auth-tab="login"]');const login=s.doc.querySelector('#login-form');login.elements.namedItem('email').value='nova@example.com';login.elements.namedItem('password').value='errada123';
 login.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert(s.doc.querySelector('#auth-status').textContent.includes('incorretos'));
 login.elements.namedItem('password').value='senha1234';login.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
 assert.equal(s.doc.querySelector('#auth-dialog').open,false);assert.equal(s.doc.querySelector('#open-account').hidden,false);assert(s.doc.querySelector('#open-account').textContent.includes('Nova'));
 assert(JSON.parse(s.w.localStorage.getItem('duavesso.session.v1')).access_token==='tok');
 s.click('#open-account');await new Promise(r=>setTimeout(r,30));
 const account=s.doc.querySelector('#account-content').textContent;assert(account.includes('AV-DB-1'));assert(account.includes('Em produção'));assert.equal(s.doc.querySelector('#profile-form input[name=city]').value,'Fortaleza');
 s.doc.querySelector('#account-dialog').close();
 s.click('[data-product="heavy-avesso"]');s.click('[data-size="M"]');s.click('#add-product');s.click('#begin-checkout');await new Promise(r=>setTimeout(r,20));
 const form=s.doc.querySelector('#checkout-form');assert.equal(form.elements.namedItem('email').value,'nova@example.com');assert(form.elements.namedItem('email').readOnly);assert.equal(form.elements.namedItem('address').value,'Rua Um, 10');
 const authed=calls.find(c=>c.url.includes('/rest/v1/orders'));assert.equal(authed.init.headers.Authorization,'Bearer tok');
 s.doc.querySelector('#checkout-dialog').close();s.click('#open-account');await new Promise(r=>setTimeout(r,30));s.click('#sign-out');await new Promise(r=>setTimeout(r,20));
 assert.equal(s.doc.querySelector('#open-auth').hidden,false);assert.equal(s.w.localStorage.getItem('duavesso.session.v1'),null);
 }finally{s.close();}
});
test('several prints: free zones, 2D zone buttons, placeholders left out of the order, tabs keep focus',async()=>{
 const s=await setup();let saved;try{
 s.w.location.hash='estudio';await new Promise(r=>setTimeout(r,10));
 const tabs=()=>[...s.doc.querySelectorAll('#print-tabs [data-print]')];
 const type=(text)=>{s.doc.querySelector('#design-text').value=text;s.doc.querySelector('#design-text').dispatchEvent(new s.w.Event('input',{bubbles:true}));};
 assert.equal(tabs().length,1);assert.equal(s.doc.querySelector('#print-tabs [role=tab]').getAttribute('tabindex'),'0');
 assert.equal(s.doc.querySelector('#print-tabs #add-print'),null,'botões de ação ficam fora do tablist');
 type('FRENTE');
 s.click('#add-print');assert.equal(tabs().length,2);assert.equal(tabs()[1].getAttribute('aria-selected'),'true');
 assert.equal(s.doc.querySelector('#design-text').value,'SUA\nESTAMPA');assert(tabs()[1].textContent.includes('costas'));
 assert.equal(s.doc.querySelector('#design-x').disabled,true,'posição por slider só vale na frente');
 assert.equal(s.doc.querySelector('#position-output').textContent,'Nas costas · mova no 3D');
 assert.equal(s.doc.querySelector('#zone-buttons [data-place=back]').getAttribute('aria-pressed'),'true');
 // seletor 2D "Onde fica" move a estampa ativa sem abrir o 3D
 s.click('#zone-buttons [data-place="sleeve-left"]');assert(tabs()[1].textContent.includes('manga esquerda'));
 assert.equal(s.doc.querySelector('#remove-print').getAttribute('aria-label'),'Remover estampa 2 (manga esquerda)');
 type('COSTAS');
 const d=s.w.duavessoStudio.getDesign();assert.equal(d.prints.map(p=>p.text).join('|'),'FRENTE|COSTAS');assert.equal(d.prints[1].place.zone,'sleeve-left');assert.equal(d.active,1);assert.equal(d.prints[1].placeholder,false);
 s.click('#zone-buttons [data-place="front"]');assert.equal(s.w.duavessoStudio.getDesign().prints[1].place,null);assert.equal(s.doc.querySelector('#design-x').disabled,false);
 s.w.duavessoStudio.updatePrint(1,{place:{p:[.3,.5,0],n:[1,0,0],zone:'sleeve-left'}});
 // trocar de aba mantém o foco na aba e limpa o input de arquivo
 s.doc.querySelector('#design-upload').value='';tabs()[0].click();assert.equal(s.doc.activeElement,tabs()[0]);assert.equal(s.doc.querySelector('#design-text').value,'FRENTE');assert.equal(s.doc.querySelector('#design-x').disabled,false);
 s.click('#add-print');s.click('#add-print');assert.equal(tabs().length,4);assert.equal(s.doc.querySelector('#add-print'),null,'máximo de 4 estampas');
 assert.equal(s.w.duavessoStudio.getDesign().prints.map(p=>p.place?.zone||'front').join(','),'front,sleeve-left,back,sleeve-right','cada nova estampa nasce numa zona livre');
 s.click('#remove-print');assert.equal(tabs().length,3);assert.equal(s.doc.activeElement,tabs()[2]);
 // modo "Descrever a ideia" não herda zona: sliders livres
 s.click('[data-mode="brief"]');assert.equal(s.doc.querySelector('#design-x').disabled,false);s.click('[data-mode="create"]');
 s.doc.querySelector('#design-form').dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,30));
 saved=JSON.parse(s.w.localStorage.getItem('duavesso.cart.v1'));
 assert.equal(saved[0].design.prints.map(p=>p.text).join('|'),'FRENTE|COSTAS','texto-modelo intacto fica de fora do pedido');
 assert.equal(saved[0].design.prints[1].place.zone,'sleeve-left');assert.equal(saved[0].design.image,undefined);assert.equal('placeholder' in saved[0].design.prints[0],false);
 assert(s.doc.querySelector('#toast').textContent.includes('ficou de fora: estampa 3 (nas costas)'));
 }finally{s.close();}
 const r=await setup({'duavesso.cart.v1':saved});try{r.click('#open-cart');assert(r.doc.querySelector('#cart-content').textContent.includes('2 estampas: frente, manga esquerda'));}finally{r.close();}
});
test('Marcas: hub lista as 3 linhas e cada uma abre sua página com tema próprio',async()=>{
 const s=await setup();try{
 assert(s.doc.querySelector('.desktop-nav a[href="#marcas"]'),'link Marcas no menu');
 s.w.location.hash='marcas';await new Promise(r=>setTimeout(r,10));
 assert.equal(s.doc.querySelector('#marcas-view').hidden,false,'tela Marcas visível');
 assert.equal(s.doc.querySelector('#shop-view').hidden,true,'loja escondida');
 assert.equal(s.doc.querySelectorAll('#marcas-view .brand-card').length,3,'3 marcas no hub');
 assert(s.doc.querySelector('.brand-card[href="#marca-solfado"][data-theme="music"]'),'card solfado com tema music');
 s.w.location.hash='marca-try84';await new Promise(r=>setTimeout(r,10));
 assert(s.doc.querySelector('#marcas-view .brand[data-theme="rugby"]'),'página try84 com tema rugby');
 assert.equal(s.doc.querySelectorAll('#marcas-view .brand-prod').length,5,'5 produtos reais da TRY84');
 assert(s.doc.querySelector('.brand-prod-img img[src*="try84-"]'),'foto de produto hospedada local');
 assert(s.doc.querySelector('.brand-prod[href^="https://try84.com.br/"]'),'produto linka pro site da marca');
 assert(s.doc.querySelector('.brand-banner img[src*="try84-hero"]'),'banner oficial no hero da try84');
 assert(s.doc.querySelector('#marcas-view a[href="https://try84.com.br"]'),'link para o site da marca');
 assert.equal(s.doc.querySelector('.brand-notify'),null,'marca com coleção não mostra form de aviso');
 s.w.location.hash='marca-solfado';await new Promise(r=>setTimeout(r,10));
 assert.equal(s.doc.querySelectorAll('#marcas-view .brand-prod').length,10,'solfado: 10 estampas');
 assert(s.doc.querySelector('#marcas-view .brand-prod-img img[src*="solfado-"]'),'solfado: estampa com foto real');
 s.w.location.hash='marca-geek';await new Promise(r=>setTimeout(r,10));
 assert.equal(s.doc.querySelectorAll('#marcas-view .brand-prod').length,2,'geek: 2 primeiros drops com foto');
 assert(s.doc.querySelector('#marcas-view .brand-prod-img.poses .pose'),'geek: card com poses (Frente/Costas/Lado)');
 assert.equal(s.doc.querySelector('.brand-notify'),null,'geek com produtos: sem form de aviso');
 s.click('#marcas-view [data-gallery="geek-coracao"]');
 assert(s.doc.querySelector('#product-dialog').open,'clicar abre a galeria');
 assert.equal(s.doc.querySelectorAll('#detail-thumbs .detail-thumb').length,3,'galeria com as 3 fotos');
 assert(s.doc.querySelector('#detail-main img[src*="geek-coracao-1"]'),'galeria começa na frente');
 s.doc.querySelector('#product-dialog').close();
 s.w.location.hash='colecao';await new Promise(r=>setTimeout(r,10));
 assert.equal(s.doc.querySelector('#marcas-view').hidden,true,'ao sair, Marcas some');
 assert.equal(s.doc.querySelector('#shop-view').hidden,false,'loja volta');
 }finally{s.close();}
});
test('LGPD: banner de consentimento aparece na primeira visita e registra a escolha',async()=>{
 const s=await setup();try{
 const bar=s.doc.querySelector('#cookie-banner');assert(bar,'banner aparece sem consentimento salvo');
 assert(bar.querySelector('[data-consent="accepted"]'));assert(bar.querySelector('[data-consent="essential"]'));assert(bar.querySelector('[data-consent="more"]'),'link para a política');
 s.click('#cookie-banner [data-consent="accepted"]');
 assert.equal(s.doc.querySelector('#cookie-banner'),null,'banner some depois de escolher');
 const stored=JSON.parse(s.w.localStorage.getItem('duavesso.consent.v1'));assert.equal(stored.choice,'accepted');
 assert.equal(s.w.dvConsent.analytics,true,'aceitar libera dados de navegação opcionais');
 }finally{s.close();}
});
test('LGPD: com consentimento salvo o banner não reaparece e só o essencial bloqueia opcionais',async()=>{
 const s=await setup({'duavesso.consent.v1':{v:1,choice:'essential'}});try{
 assert.equal(s.doc.querySelector('#cookie-banner'),null,'não reaparece com escolha salva');
 assert.equal(s.w.dvConsent.analytics,false,'só o essencial mantém os opcionais desligados');
 }finally{s.close();}
});
test('LGPD: a política de privacidade abre pelo rodapé com o conteúdo exigido',async()=>{
 const s=await setup({'duavesso.consent.v1':{v:1,choice:'accepted'}});try{
 assert(s.doc.querySelector('#open-privacy'),'link Privacidade no rodapé');
 s.click('#open-privacy');
 assert(s.doc.querySelector('#info-dialog').open,'diálogo abre');
 assert(s.doc.querySelector('#info-title').textContent.includes('Privacidade'));
 const text=s.doc.querySelector('#info-content').textContent;
 assert(text.includes('LGPD'),'cita a LGPD');
 assert(text.includes('Supabase'),'lista os operadores');
 assert(text.includes('privacidade@duavesso.com.br'),'canal de contato de privacidade');
 }finally{s.close();}
});
