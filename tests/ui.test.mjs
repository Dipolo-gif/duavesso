import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const commerce=(await readFile(new URL('../dist/commerce.js',import.meta.url),'utf8')).replaceAll('export ','');
const api=(await readFile(new URL('../dist/api.js',import.meta.url),'utf8')).replaceAll('export ','');
const placement=(await readFile(new URL('../dist/studio-placement.js',import.meta.url),'utf8')).replaceAll('export ','');
const brands=(await readFile(new URL('../dist/brands.js',import.meta.url),'utf8')).replaceAll('export ','');
const theme=(await readFile(new URL('../dist/brand-theme.js',import.meta.url),'utf8')).replaceAll('export ','');
const picker=(await readFile(new URL('../dist/color-picker.js',import.meta.url),'utf8')).replaceAll('export ','');
const pages=(await readFile(new URL('../dist/pages.js',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'').replaceAll('export ','');
const app=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'');
// path: abre o site já nesse endereço, com a página gerada correspondente (ex.: /produto/simples).
async function setup(storage={},fetchStub,{reducedMotion=true,path='/'}={}){
 const file=path==='/'||path.startsWith('/#')||!/^\/[a-z]/.test(path)?null:new URL(`../dist${path.split('#')[0]}.html`,import.meta.url);
 const page=file?await readFile(file,'utf8').catch(()=>readFile(new URL('../dist/404.html',import.meta.url),'utf8')):html;
 const dom=new JSDOM(page,{url:'http://localhost'+path,runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:reducedMotion});w.HTMLElement.prototype.scrollIntoView=()=>{};
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
 w.eval(commerce+'\n'+api+'\n'+placement+'\n'+brands+'\n'+theme+'\n'+picker+'\n'+pages+'\nconst esc=escapeHTML;\n'+app);
 await new Promise(resolve=>setTimeout(resolve,10));
 return {dom,w,doc:w.document,registry,click(selector){const e=w.document.querySelector(selector);assert(e,`Missing ${selector}`);e.click();},close(){dom.window.close();}};
}
test('catalog filters and product selection feed the same persisted cart',async()=>{
 const s=await setup();try{
 assert.equal(s.doc.querySelectorAll('.product-card').length,6,'4 da loja + 2 da geek na vitrine');
 assert.equal(s.doc.querySelector('[data-filter="essential"]'),null,'aba Essenciais removida');
 s.click('[data-filter="graphic"]');assert.equal(s.doc.querySelectorAll('.product-card').length,5,'estampadas: 3 Heavy + 2 geek');
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
 assert.equal(s.doc.querySelectorAll('.product-card').length,6,'catálogo curado local (6 peças), não a tabela antiga do servidor');
 assert.equal(s.doc.querySelector('[data-product="off-line"]'),null,'produto antigo do servidor é ignorado');
 assert(s.doc.querySelector('[data-product="heavy-eclipse"]'),'produto local presente');
 s.click('[data-product="heavy-eclipse"]');s.click('[data-size="M"]');s.click('#add-product');s.click('#begin-checkout');
 assert.equal(s.doc.querySelector('#fill-demo'),null);
 const form=s.doc.querySelector('#checkout-form');
 for(const [k,v] of Object.entries({name:'Cliente Real',email:'cliente@example.com',cep:'60000-000',uf:'CE',city:'Fortaleza',address:'Rua Um',number:'10'}))form.elements.namedItem(k).value=v;
 form.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,30));
 const order=calls.find(c=>c.url.includes('place_order'));assert(order);const body=JSON.parse(order.init.body);
 assert.deepEqual(body.p_items,[{kind:'catalog',product_id:'heavy-eclipse',base:'brown',size:'M',qty:1}]);assert.equal(body.p_customer.email,'cliente@example.com');
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
 assert(s.doc.querySelector('#detail-main .detail-slide.active img').getAttribute('src').includes('tee-porta-3'),'clicar na miniatura leva o carrossel para a foto certa');assert.equal(s.doc.querySelectorAll('#detail-main .detail-slide').length,3,'carrossel com as 3 fotos');assert.equal(s.doc.querySelector('#detail-count').textContent,'3 / 3','contador acompanha a foto');
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
  if(url.includes('/rest/v1/profiles'))return init.method==='PATCH'?json(null,204):json([{name:'Nova Cliente',cep:'60000-000',uf:'CE',city:'Fortaleza',address:'Rua Um, 10'}]);
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
 const form=s.doc.querySelector('#checkout-form');assert.equal(form.elements.namedItem('email').value,'nova@example.com');assert(form.elements.namedItem('email').readOnly);assert.equal(form.elements.namedItem('address').value,'Rua Um');assert.equal(form.elements.namedItem('number').value,'10','o número salvo no perfil volta separado');
 const authed=calls.find(c=>c.url.includes('/rest/v1/orders'));assert.equal(authed.init.headers.Authorization,'Bearer tok');
 s.click('#open-account');await new Promise(r=>setTimeout(r,30));s.click('#sign-out');await new Promise(r=>setTimeout(r,20));
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
test('Marcas: sem o banco, o hub mostra só as marcas no ar e a geek abre sua página com tema próprio',async()=>{
 const s=await setup();try{
 assert(s.doc.querySelector('.desktop-nav a[href="marcas"]'),'link Marcas no menu');
 s.w.location.hash='marcas';await new Promise(r=>setTimeout(r,10));
 assert.equal(s.doc.querySelector('#marcas-view').hidden,false,'tela Marcas visível');
 assert.equal(s.doc.querySelector('#shop-view').hidden,true,'loja escondida');
 assert.deepEqual([...s.doc.querySelectorAll('#marcas-view .brand-card')].map(a=>a.getAttribute('href')),['marcas/geek'],'só a geek: TRY84 e SolFáDó saíram da loja');
 s.w.location.hash='marca-geek';await new Promise(r=>setTimeout(r,10));
 assert.equal(s.doc.querySelectorAll('#marcas-view .product-grid .product-card').length,2,'geek: 2 peças com o cartão da página inicial');
 assert(s.doc.querySelector('#marcas-view .product-card .product-visual.poses .pose'),'geek: card com poses (Frente/Costas/Lado)');assert(s.doc.querySelector('#marcas-view .product-card .product-add'),'botão de adicionar como na página inicial');
 assert(s.doc.querySelector('#marcas-view .product-card .price').textContent.includes('159,90'),'geek: card com preço padrão');assert.match(s.doc.querySelector('#marcas-view .brand-collection .collection-count').textContent,/^2 peças$/);
 assert.equal(s.doc.querySelector('.brand-notify'),null,'geek com coleção: sem form de aviso');
 s.click('#marcas-view [data-product="geek-coracao"]');
 assert(s.doc.querySelector('#product-dialog').open,'clique abre o PDP de compra');
 assert.equal(s.doc.querySelectorAll('#detail-thumbs .detail-thumb').length,3,'PDP com as 3 fotos');
 assert(s.doc.querySelector('#detail-main img[src*="geek-coracao-1"]'),'PDP começa na frente');
 s.click('#product-dialog [data-size="M"]');s.click('#add-product');
 const geekCart=JSON.parse(s.w.localStorage.getItem('duavesso.cart.v1'));
 assert.equal(geekCart[0].base,'black');assert.equal(geekCart[0].color,'Preta');assert.equal(geekCart[0].size,'M');assert.equal(geekCart[0].price,15990);
 assert.equal(geekCart[0].key,'geek-coracao-M');
 s.doc.querySelector('#cart-dialog').close();
 s.w.location.hash='colecao';await new Promise(r=>setTimeout(r,10));
 assert.equal(s.doc.querySelector('#marcas-view').hidden,true,'ao sair, Marcas some');
 assert.equal(s.doc.querySelector('#shop-view').hidden,false,'loja volta');
 }finally{s.close();}
});
test('Marcas que voltam: reativadas no painel, TRY84 e SolFáDó reaparecem com as fotos, a capa e os links guardados',async()=>{
 const {rows,fetchStub}=brandsBackend();
 rows.push(brandRow({slug:'solfado',name:'SolFáDó',tagline:'camisetas inspiradas na música',bio:'Música é a arte do som.',theme:{mode:'solid',c1:'#f2efe7',c2:'#f2efe7',angle:135,accent:'#17324f'}}));
 const s=await setup({},fetchStub,{path:'/marcas'});try{
 await new Promise(r=>setTimeout(r,40));
 assert(s.doc.querySelector('.brand-card[href="marcas/solfado"][data-theme="music"]'),'card solfado com tema music');
 s.w.location.hash='marca-try84';await new Promise(r=>setTimeout(r,40));
 assert(s.doc.querySelector('#marcas-view .b2[data-theme="rugby"]'),'página try84 com tema rugby');assert.match(s.doc.querySelector('#marcas-view .b2').getAttribute('style'),/--brand-paint:#1c1d1f/,'cores da marca');
 assert.equal(s.doc.querySelectorAll('#marcas-view .brand-prod').length,5,'5 produtos reais da TRY84');
 assert(s.doc.querySelector('.brand-prod-img img[src*="try84-"]'),'foto de produto hospedada local');
 assert(s.doc.querySelector('.brand-prod[href^="https://try84.com.br/"]'),'produto linka pro site da marca');
 assert(s.doc.querySelector('.b2-cover img[src*="try84-hero"]'),'capa oficial da try84');
 assert(s.doc.querySelector('#marcas-view a[href="https://try84.com.br"]'),'link para o site da marca');
 assert.equal(s.doc.querySelector('.brand-notify'),null,'marca com coleção não mostra form de aviso');
 s.w.location.hash='marca-solfado';await new Promise(r=>setTimeout(r,40));
 assert.equal(s.doc.querySelectorAll('#marcas-view .brand-prod').length,10,'solfado: 10 estampas');
 assert(s.doc.querySelector('#marcas-view .brand-prod-img img[src*="solfado-"]'),'solfado: estampa com foto real');
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
test('checkout sends the chosen color and uploads every studio image in parallel',async()=>{
 const calls=[];let inFlight=0,peak=0;
 const fetchStub=async(url,init={})=>{
  url=String(url);calls.push({url,init});
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  if(url.includes('/storage/v1/object/designs/')){inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,15));inFlight--;return json({Key:'designs/x'});}
  if(url.includes('/rest/v1/rpc/place_order'))return json({code:'AV-TEST-0002',status:'aguardando_pagamento',count:2,subtotal_cents:24980,delivery_cents:1490,total_cents:26470});
  return json([],200);
 };
 const cart=[{id:'simples',base:'brown',size:'G',qty:1},{id:'custom',key:'custom-par-1',base:'white',size:'M',qty:1,preview:'data:image/jpeg;base64,AA==',design:{mode:'create',color:'white',prints:[{text:'A',image:'data:image/png;base64,AA=='},{text:'B'},{text:'C',image:'data:image/webp;base64,AA=='}]}}];
 const s=await setup({'duavesso.cart.v1':cart},fetchStub);try{
 s.click('#open-cart');s.click('#begin-checkout');
 const form=s.doc.querySelector('#checkout-form');
 for(const [k,v] of Object.entries({name:'Cliente Real',email:'cliente@example.com',cep:'60000-000',uf:'CE',city:'Fortaleza',address:'Rua Um',number:'10'}))form.elements.namedItem(k).value=v;
 form.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,80));
 const uploads=calls.filter(c=>c.url.includes('/storage/v1/object/designs/'));
 assert.equal(uploads.length,3,'1 prévia + 2 artes (a estampa só de texto não sobe nada)');
 assert.equal(peak,3,'as 3 imagens sobem ao mesmo tempo');
 const body=JSON.parse(calls.find(c=>c.url.includes('place_order')).init.body),[catalog,custom]=body.p_items;
 assert.deepEqual(catalog,{kind:'catalog',product_id:'simples',base:'brown',size:'G',qty:1});
 const paths=uploads.map(c=>c.url.split('/designs/')[1]);
 assert.equal(custom.preview_path,paths.find(p=>p.endsWith('/preview.jpg')));
 assert.deepEqual(custom.design.image_paths.map(p=>p&&p.endsWith('/art.webp')),[true,null,true]);
 assert.equal(custom.image_path,custom.design.image_paths[0]);
 assert(custom.design.prints.every(p=>!('image' in p)||p.image===null),'nenhuma imagem em base64 vai no pedido');
 assert(s.doc.querySelector('.order-id').textContent.includes('AV-TEST-0002'));
 }finally{s.close();}
});
test('sessions: one refresh at a time, other tabs stay in sync, sign out revokes an expired session, 30-day limit',async()=>{
 const now=Math.floor(Date.now()/1000),user={id:'u1',email:'c@example.com',name:'Cliente',provider:'email'};
 const stored=(extra={})=>({access_token:'tok1',refresh_token:'ref1',expires_at:now-10,started_at:now-100,user,...extra});
 let calls=[],offline=false;
 const fetchStub=async(url,init={})=>{
  url=String(url);calls.push({url,init});
  if(offline)throw new TypeError('Failed to fetch');
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  if(url.includes('grant_type=refresh_token')){await new Promise(r=>setTimeout(r,10));const n=calls.filter(c=>c.url.includes('refresh_token')).length+1;return json({access_token:`tok${n}`,refresh_token:`ref${n}`,expires_in:3600,user:{id:'u1',email:'c@example.com',user_metadata:{name:'Cliente'},app_metadata:{provider:'email'}}});}
  if(url.includes('/auth/v1/logout'))return json(null,204);
  return json([]);
 };
 const s=await setup({'duavesso.session.v1':stored()},fetchStub);try{
 const auth=[];s.w.addEventListener('duavesso:auth',e=>auth.push(e.detail));
 const headers=await Promise.all([s.w.authHeaders(),s.w.authHeaders(),s.w.authHeaders()]);
 assert.equal(calls.filter(c=>c.url.includes('refresh_token')).length,1,'3 pedidos ao mesmo tempo, 1 renovação só');
 assert(headers.every(h=>h.Authorization==='Bearer tok2'));
 assert.equal(JSON.parse(s.w.localStorage.getItem('duavesso.session.v1')).started_at,now-100,'renovar não reinicia o prazo de 30 dias');
 assert.equal(auth.length,0,'renovar não dispara troca de usuário (o perfil não é apagado)');

 // Outra aba renovou: esta passa a usar o token novo sem chamar o servidor.
 const other={...stored(),access_token:'tokX',refresh_token:'refX',expires_at:now+3600};
 s.w.localStorage.setItem('duavesso.session.v1',JSON.stringify(other));
 s.w.dispatchEvent(new s.w.StorageEvent('storage',{key:'duavesso.session.v1',newValue:JSON.stringify(other)}));
 calls=[];assert.equal((await s.w.authHeaders()).Authorization,'Bearer tokX');assert.equal(calls.length,0);
 // Outra aba saiu: esta também sai.
 s.w.localStorage.removeItem('duavesso.session.v1');
 s.w.dispatchEvent(new s.w.StorageEvent('storage',{key:'duavesso.session.v1',newValue:null}));
 assert.match((await s.w.authHeaders()).Authorization,/^Bearer sb_publishable_/);assert.equal(auth.at(-1),null);

 // Sem internet na hora de renovar: continua logado (não perde a sessão por uma queda de rede).
 s.w.localStorage.setItem('duavesso.session.v1',JSON.stringify(stored()));
 s.w.dispatchEvent(new s.w.StorageEvent('storage',{key:'duavesso.session.v1'}));
 offline=true;const kept=await s.w.authHeaders();offline=false;
 assert.equal(kept.Authorization,'Bearer tok1');assert(s.w.localStorage.getItem('duavesso.session.v1'));

 // Sair com o acesso vencido: renova primeiro e revoga com o token válido.
 calls=[];await s.w.signOut();
 assert.equal(s.w.localStorage.getItem('duavesso.session.v1'),null);
 const logout=calls.find(c=>c.url.includes('/auth/v1/logout'));assert(logout,'logout chamado');
 assert(calls.findIndex(c=>c.url.includes('refresh_token'))<calls.indexOf(logout),'renova antes de revogar');
 assert.notEqual(logout.init.headers.Authorization,'Bearer tok1','não usa o token vencido');
 }finally{s.close();}
 // Sessão com mais de 30 dias: ao abrir o site, pede login de novo.
 const t=await setup({'duavesso.session.v1':stored({expires_at:now+3600,started_at:now-31*24*3600})},fetchStub);try{
  assert.match((await t.w.authHeaders()).Authorization,/^Bearer sb_publishable_/);assert.equal(t.w.localStorage.getItem('duavesso.session.v1'),null);
 }finally{t.close();}
});
test('card photos: only the first pose downloads; poses 2 and 3 load on first hover',async()=>{
 const s=await setup({},undefined,{reducedMotion:false});try{
 const card=s.doc.querySelector('[data-product="heavy-avesso"]'),imgs=[...card.querySelectorAll('.pose img')],sources=[...card.querySelectorAll('.pose source')];
 assert.equal(imgs.length,3);
 assert(imgs[0].getAttribute('src')&&sources[0].getAttribute('srcset'),'pose 1 baixa na hora');
 for(const i of [1,2]){assert.equal(imgs[i].getAttribute('src'),null,'pose '+(i+1)+' sem src');assert.equal(sources[i].getAttribute('srcset'),null);assert(imgs[i].dataset.src.includes('-1024.jpg'));}
 (card.querySelector('.product-image-button')||card).dispatchEvent(new s.w.MouseEvent('mouseenter'));
 for(const i of [1,2]){assert(imgs[i].getAttribute('src').includes('tee-porta-'+(i+1)),'pose '+(i+1)+' carregada no hover');assert(sources[i].getAttribute('srcset').includes('.webp'));assert.equal(imgs[i].dataset.src,undefined);}
 }finally{s.close();}
});
test('profile: CPF goes through set_profile_cpf (falls back before migration 0007) and unexpected errors show a support code',async()=>{
 const now=Math.floor(Date.now()/1000);let calls=[],rpcMode='ok';
 const fetchStub=async(url,init={})=>{
  url=String(url);calls.push({url,init});
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  if(url.includes('/rpc/set_profile_cpf')){if(rpcMode==='missing')return json({code:'PGRST202',message:'not found'},404);return json(rpcMode==='ok'?{ok:true}:{ok:false,message:'Este CPF já está cadastrado em outra conta. Cada CPF pode ter só uma conta.'});}
  if(url.includes('/rest/v1/profiles'))return init.method==='PATCH'?json(null,204):json([]);
  if(url.includes('/rpc/get_order'))return json({code:'XX000',message:'internal'},500);
  return json([]);
 };
 const s=await setup({'duavesso.session.v1':{access_token:'tok',refresh_token:'ref',expires_at:now+3600,started_at:now,user:{id:'u1',email:'c@example.com',name:'C',provider:'email'}}},fetchStub);try{
 const patches=()=>calls.filter(c=>c.init.method==='PATCH').map(c=>JSON.parse(c.init.body)),rpcs=()=>calls.filter(c=>c.url.includes('set_profile_cpf'));
 await s.w.updateProfile({name:'C',cpf:'52998224725'},null);
 assert.deepEqual(patches(),[{name:'C'}],'o PATCH não leva o CPF');
 assert.deepEqual(JSON.parse(rpcs()[0].init.body),{p_cpf:'52998224725'});
 calls=[];await s.w.updateProfile({name:'C',cpf:'52998224725'},'52998224725');
 assert.equal(rpcs().length,0,'CPF igual ao anterior: não chama a função');
 calls=[];rpcMode='taken';
 await assert.rejects(s.w.updateProfile({name:'C',cpf:'11144477735'},'52998224725'),/já está cadastrado/);
 calls=[];rpcMode='missing';
 await s.w.updateProfile({name:'C',cpf:'11144477735'},'52998224725');
 assert.deepEqual(patches(),[{name:'C'},{cpf:'11144477735'}],'banco sem a 0007: grava o CPF como antes');
 await assert.rejects(s.w.rpc('get_order',{p_code:'AV-1',p_email:'c@example.com'}),/informe ao suporte o código XX000-[0-9A-Z]{1,6}\./);
 }finally{s.close();}
});
test('real addresses: product link opens over the shop, closing returns, history works and titles follow',async()=>{
 const s=await setup({},undefined,{path:'/produto/heavy-avesso'});try{
 const doc=s.doc,loc=()=>s.w.location.pathname+s.w.location.hash,wait=()=>new Promise(r=>setTimeout(r,30));
 assert(doc.querySelector('#product-dialog').open,'link direto abre a ficha');
 assert.equal(doc.querySelector('#shop-view').hidden,false,'a loja fica por trás');
 assert.equal(doc.title,'Heavy · Do Avesso · camiseta oversized · duavesso');
 assert.equal(doc.querySelector('link[rel="canonical"]').href,'https://loja-duavesso.vercel.app/produto/heavy-avesso');
 doc.querySelector('#product-dialog').close();
 assert.equal(loc(),'/','ao fechar, volta para a loja');assert.match(doc.title,/^duavesso · /);
 s.click('button[data-product="heavy-faces"]');
 assert.equal(loc(),'/produto/heavy-faces');assert(doc.querySelector('#product-dialog').open);
 s.w.history.back();await wait();
 assert.equal(loc(),'/');assert.equal(doc.querySelector('#product-dialog').open,false,'voltar no navegador fecha a ficha');
 // Rodapé: link real para a marca; o produto da marca abre por cima da página da marca.
 doc.querySelector('footer a[href="marcas/geek"]').click();
 assert.equal(loc(),'/marcas/geek');assert.equal(doc.querySelector('#marcas-view').hidden,false);assert.match(doc.title,/^duavessogeek · /);
 s.click('#marcas-view button[data-product="geek-coracao"]');
 assert.equal(loc(),'/produto/geek-coracao');assert.equal(doc.querySelector('#marcas-view').hidden,false,'a marca continua por trás');
 doc.querySelector('#product-dialog').close();await wait();
 assert.equal(loc(),'/marcas/geek','fechar volta para a marca');
 // Âncora da loja a partir de outra página
 doc.querySelector('.desktop-nav a[href="#colecao"]').click();
 assert.equal(loc(),'/#colecao');assert.equal(doc.querySelector('#shop-view').hidden,false);
 doc.querySelector('.desktop-nav a[href="estudio"]').click();
 assert.equal(loc(),'/estudio');assert.equal(doc.querySelector('#studio-view').hidden,false);assert.match(doc.title,/duavesso Studio/);
 }finally{s.close();}
});
test('old # links become real addresses and unknown addresses fall back to the shop with a notice',async()=>{
 for(const [from,to] of [['/#marca-geek','/marcas/geek'],['/#produto-simples','/produto/simples'],['/#estudio','/estudio'],['/#marcas','/marcas']]){
  const s=await setup({},undefined,{path:from});try{assert.equal(s.w.location.pathname,to,from);}finally{s.close();}
 }
 for(const [path,msg] of [['/nao-existe','Essa página não existe'],['/produto/off-line','Essa peça não está mais à venda'],['/marcas/sumiu','Essa marca não está mais']]){
  const s=await setup({},undefined,{path});try{
   assert.equal(s.w.location.pathname,'/',path);assert.equal(s.doc.querySelector('#shop-view').hidden,false);
   assert(s.doc.querySelector('#toast').textContent.includes(msg),path);
  }finally{s.close();}
 }
});
test('a product opened from history over a brand page closes back to that brand address and title',async()=>{
 const s=await setup({},undefined,{path:'/marcas/geek'});try{
 const doc=s.doc,loc=()=>s.w.location.pathname;
 s.w.history.replaceState(null,'','/produto/geek-carpa');s.w.dispatchEvent(new s.w.PopStateEvent('popstate'));
 assert(doc.querySelector('#product-dialog').open);assert.equal(doc.querySelector('#marcas-view').hidden,false);
 doc.querySelector('#product-dialog').close();
 assert.equal(loc(),'/marcas/geek');assert.match(doc.title,/^duavessogeek · /);
 }finally{s.close();}
});
test('checkout: the CEP fills state, city and street, and the state (UF) goes with the order',async()=>{
 const calls=[];
 const fetchStub=async(url,init={})=>{
  url=String(url);calls.push({url,init});
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  if(url.startsWith('https://viacep.com.br/ws/20040002/json/'))return json({uf:'RJ',localidade:'Rio de Janeiro',logradouro:'Avenida Rio Branco'});
  if(url.includes('/rpc/place_order'))return json({code:'AV-UF-1',status:'aguardando_pagamento',count:1,subtotal_cents:11990,delivery_cents:1490,total_cents:13480});
  return json([]);
 };
 const s=await setup({'duavesso.cart.v1':[{id:'simples',base:'black',size:'M',qty:1}]},fetchStub);try{
 s.click('#open-cart');s.click('#begin-checkout');
 const form=s.doc.querySelector('#checkout-form'),el=k=>form.elements.namedItem(k);
 assert.equal(el('uf').required,true);
 el('cep').value='20040002';el('cep').dispatchEvent(new s.w.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,30));
 assert.equal(el('cep').value,'20040-002');assert.equal(el('uf').value,'RJ');assert.equal(el('city').value,'Rio de Janeiro');assert.equal(el('address').value,'Avenida Rio Branco');
 assert.match(s.doc.querySelector('#checkout-cep-status').textContent,/preenchido pelo CEP/);
 el('name').value='Cliente RJ';el('email').value='rj@example.com';el('number').value='1';el('complement').value='Sala 2';
 form.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,40));
 const body=JSON.parse(calls.find(c=>c.url.includes('place_order')).init.body);
 assert.equal(body.p_customer.uf,'RJ');assert.equal(body.p_customer.address,'Avenida Rio Branco, 1 - Sala 2','rua, número e complemento viram um endereço só');
 }finally{s.close();}
});

// Checkout novo -----------------------------------------------------------------------
const nb=s=>String(s).replace(/\u00a0/g,' '); // o Intl separa "R$" do número com espaço não separável
function checkoutStub(extra=()=>null){
 const calls=[];
 const fetchStub=async(url,init={})=>{
  url=String(url);calls.push({url,init});
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  const custom=await extra(url,init,json);if(custom)return custom;
  if(url.includes('/rest/v1/promotions'))return json([{kind:'free_shipping',min_subtotal_cents:25000,label:'Frete grátis'}]);
  if(url.includes('/rpc/place_order'))return json({code:'AV-CO-1',status:'aguardando_pagamento',count:2,subtotal_cents:27980,discount_cents:0,delivery_cents:0,total_cents:27980,installments:JSON.parse(init.body).p_customer.installments||1});
  return json([]);
 };
 return {calls,fetchStub};
}
const twoBrands=[{id:'simples',base:'brown',size:'G',qty:1},{id:'geek-coracao',size:'M',qty:1}];
async function openCheckout(s){s.click('#open-cart');s.click('#begin-checkout');await new Promise(r=>setTimeout(r,20));return s.doc.querySelector('#checkout-form');}
function fill(form){for(const [k,v] of Object.entries({name:'Cliente Real',email:'cliente@example.com',cep:'60000-000',uf:'CE',city:'Fortaleza',address:'Rua Um',number:'10'}))form.elements.namedItem(k).value=v;}
const submit=async(s,form)=>{form.dispatchEvent(new s.w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,40));};
const choose=(s,form,name,value)=>{const r=[...form.querySelectorAll(`input[name="${name}"]`)].find(i=>i.value===value);r.checked=true;r.dispatchEvent(new s.w.Event('change',{bubbles:true}));};

test('checkout: payment on the left, order grouped by brand on the right, no emojis',async()=>{
 const {fetchStub}=checkoutStub();
 const s=await setup({'duavesso.cart.v1':twoBrands},fetchStub);try{
 const form=await openCheckout(s);
 assert.deepEqual([...form.querySelectorAll('.co-left .co-sec h3')].map(h=>h.textContent.replace(/\d/,'')),['Contato','Entrega','Pagamento']);
 assert.deepEqual([...form.querySelectorAll('.co-pm b')].map(b=>b.textContent),['Cartão de crédito','Pix','Boleto']);
 assert(form.querySelectorAll('.co-pm svg').length===3,'ícones de traço, não emojis');
 assert.deepEqual([...form.querySelectorAll('.co-right .co-chip')].map(c=>c.textContent),['duavesso','duavessogeek'],'peças agrupadas por marca');
 assert.equal(form.querySelector('.co-group[data-theme="geek"] .co-item b').textContent,'Coração Pixelado');
 assert(!/\p{Extended_Pictographic}/u.test(s.doc.querySelector('#checkout-view').textContent.replace(/[✓›×]/g,'')),'nenhum emoji no checkout');
 }finally{s.close();}
});

test('checkout: card shows installments and sends them; Pix and boleto are paid in full',async()=>{
 const {calls,fetchStub}=checkoutStub();
 const s=await setup({'duavesso.cart.v1':twoBrands},fetchStub);try{
 let form=await openCheckout(s);fill(form);
 const inst=form.elements.namedItem('installments');
 assert.deepEqual([...inst.options].map(o=>nb(o.textContent)),['1x de R$ 279,80 sem juros','2x de R$ 139,90 sem juros','3x de R$ 93,27 sem juros']);
 inst.value='3';inst.dispatchEvent(new s.w.Event('change',{bubbles:true}));
 assert.match(nb(s.doc.querySelector('#checkout-summary .co-inst').textContent),/3x de R\$ 93,27/);
 assert.match(form.querySelector('.co-secure').textContent,/nunca passam pela loja/);
 choose(s,form,'payment','Pix');
 assert.equal(form.elements.namedItem('installments'),null,'Pix não tem parcelas');assert.match(form.querySelector('#co-pay-panel').textContent,/QR Code/);
 choose(s,form,'payment','Boleto');assert.match(form.querySelector('#co-pay-panel').textContent,/2 dias úteis/);
 await submit(s,form);
 let body=JSON.parse(calls.filter(c=>c.url.includes('place_order')).at(-1).init.body);
 assert.equal(body.p_payment,'Boleto');assert.equal(body.p_customer.installments,undefined);
 }finally{s.close();}
 const t=checkoutStub(),s2=await setup({'duavesso.cart.v1':twoBrands},t.fetchStub);try{
  const form=await openCheckout(s2);fill(form);form.elements.namedItem('installments').value='3';
  await submit(s2,form);
  const body=JSON.parse(t.calls.find(c=>c.url.includes('place_order')).init.body);
  assert.equal(body.p_payment,'Cartão');assert.equal(body.p_customer.installments,3);assert.equal(body.p_customer.address,'Rua Um, 10');
  assert.match(nb(s2.doc.querySelector('.success').textContent),/em 3x de/);
 }finally{s2.close();}
});

test('checkout: coupon is checked by the server, shown as a discount and sent with the order',async()=>{
 let mode='ok';
 const {calls,fetchStub}=checkoutStub((url,init,json)=>{
  if(!url.includes('/rpc/check_coupon'))return null;
  if(mode==='missing')return json({code:'PGRST202'},404);
  const {p_code,p_subtotal_cents}=JSON.parse(init.body);
  return json(p_code==='DEZ'?{ok:true,code:'DEZ',discount_cents:Math.floor(p_subtotal_cents/10)}:{ok:false,message:'Cupom inválido ou expirado.'});
 });
 const s=await setup({'duavesso.cart.v1':twoBrands},fetchStub);try{
 const form=await openCheckout(s),msg=()=>nb(s.doc.querySelector('#co-cupom-msg').textContent),apply=async code=>{form.elements.namedItem('coupon').value=code;s.click('#co-apply');await new Promise(r=>setTimeout(r,20));};
 await apply('nada');assert.equal(msg(),'Cupom inválido ou expirado.');
 await apply('dez');
 assert.equal(msg(),'Cupom DEZ aplicado: −R$ 27,98.');
 assert.match(nb(s.doc.querySelector('#checkout-summary').textContent),/Cupom DEZ−R\$ 27,98/);
 assert.equal(nb(s.doc.querySelector('#co-sum-total').textContent),'R$ 251,82');
 fill(form);await submit(s,form);
 assert.equal(JSON.parse(calls.find(c=>c.url.includes('place_order')).init.body).p_customer.coupon,'DEZ');
 }finally{s.close();}
 mode='missing';const t=await setup({'duavesso.cart.v1':twoBrands},fetchStub);try{
  const form=await openCheckout(t);form.elements.namedItem('coupon').value='DEZ';t.click('#co-apply');await new Promise(r=>setTimeout(r,20));
  assert.equal(t.doc.querySelector('#co-cupom-msg').textContent,'Cupons ainda não estão disponíveis.');
 }finally{t.close();}
});

test('promotions from the database drive the "faltam R$ X" notices in the bag and the checkout',async()=>{
 const promos=[{kind:'free_shipping',min_subtotal_cents:30000,label:'Frete grátis'},{kind:'cheapest_free',min_subtotal_cents:40000,label:'Leve a mais barata'}];
 const {fetchStub}=checkoutStub((url,init,json)=>url.includes('/rest/v1/promotions')?json(promos):null);
 const s=await setup({'duavesso.cart.v1':twoBrands},fetchStub);try{
 s.click('#open-cart');await new Promise(r=>setTimeout(r,30));
 const bag=()=>nb(s.doc.querySelector('#cart-content').textContent);
 assert.match(bag(),/Faltam R\$ 20,20 para o frete grátis/,'27.980 de 30.000');
 assert.match(bag(),/Faltam R\$ 120,20 para a peça mais barata sair de graça/);
 s.click('[data-qty="1"][data-key="geek-coracao-M"]');await new Promise(r=>setTimeout(r,10));
 assert.match(bag(),/Frete grátis liberado/);assert.match(bag(),/Promoção liberada/);
 assert.match(bag(),/Promoção · peça mais barata grátis−R\$ 119,90/,'a mais barata (Simples) sai de graça');
 s.click('#begin-checkout');await new Promise(r=>setTimeout(r,20));
 assert.match(nb(s.doc.querySelector('#checkout-summary').textContent),/Promoção · peça mais barata grátis−R\$ 119,90/);
 assert.equal(s.doc.querySelector('#co-price-standard').textContent,'Grátis');
 }finally{s.close();}
});
test('checkout is its own page at /checkout: opens from the bag, works when loaded directly and survives changes from another tab',async()=>{
 const s=await setup({'duavesso.cart.v1':[{id:'simples',base:'black',size:'M',qty:1}]});try{
 const loc=()=>s.w.location.pathname;
 s.click('#open-cart');s.click('#begin-checkout');
 assert.equal(loc(),'/checkout');assert.equal(s.doc.querySelector('#checkout-view').hidden,false);assert.equal(s.doc.querySelector('#shop-view').hidden,true);
 assert(s.doc.querySelector('#checkout-view #checkout-form'),'formulário dentro da página');assert.equal(s.doc.querySelector('#checkout-dialog'),null,'não existe mais a janela flutuante');
 assert.equal(s.doc.title,'Finalizar compra · duavesso');
 s.w.localStorage.setItem('duavesso.cart.v1',JSON.stringify([]));s.w.dispatchEvent(new s.w.StorageEvent('storage',{key:'duavesso.cart.v1'}));
 assert.match(s.doc.querySelector('#checkout-content').textContent,/Sua sacola está vazia/,'sacola esvaziada em outra aba');
 s.w.history.back();await new Promise(r=>setTimeout(r,30));
 assert.equal(loc(),'/');assert.equal(s.doc.querySelector('#checkout-view').hidden,true);
 }finally{s.close();}
 const t=await setup({'duavesso.cart.v1':[{id:'simples',base:'black',size:'M',qty:1}]},undefined,{path:'/checkout'});try{
  assert.equal(t.doc.querySelector('#checkout-view').hidden,false);assert(t.doc.querySelector('#checkout-form'));
  assert.equal(t.doc.querySelector('meta[name="robots"]').content,'noindex','checkout fora do Google');
 }finally{t.close();}
});

// Marcas parceiras (banco, Minha Marca e painel) -------------------------------------------------------
function brandRow(o){return {slug:'x',name:'X',tagline:'',bio:'',status:'active',plan:'free',theme:{mode:'solid',c1:'#161719',c2:'#161719',angle:135,accent:'#1737bc'},logo_path:null,cover_path:null,links:{},featured_product_id:null,featured_badge:'',featured_until:null,external_url:null,updated_at:'2026-10-08T10:00:00Z',...o};}
function brandsBackend({admin=false,mine=['estudio-mar']}={}){
 const now=Date.now();
 const rows=[
  brandRow({slug:'geek',name:'duavessogeek',tagline:'games · pixel · sci-fi',bio:'Cultura geek no avesso.',theme:{mode:'solid',c1:'#141519',c2:'#141519',angle:135,accent:'#3a5bff'},featured_product_id:'geek-coracao',featured_badge:'Drop 01',featured_until:new Date(now+3*864e5-60e3).toISOString()}),
  brandRow({slug:'try84',name:'TRY84',tagline:'rugby lifestyle',bio:'Feita por jogadores.',theme:{mode:'solid',c1:'#1c1d1f',c2:'#1c1d1f',angle:135,accent:'#ffffff'},cover_path:'assets/try84-hero.jpg',external_url:'https://try84.com.br'}),
  brandRow({slug:'estudio-mar',name:'Estúdio Mar',tagline:'surf · Niterói',bio:'Estampas de quem vive no mar.',theme:{mode:'gradient',c1:'#0b3d91',c2:'#00a6a6',angle:120,accent:'#ffd166'},links:{instagram:'estudiomar'}})
 ];
 const calls=[];
 const fetchStub=async(url,init={})=>{
  url=String(url);calls.push({url,init});
  const json=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  const slug=decodeURIComponent((url.match(/slug=eq\.([^&]+)/)||[])[1]||'');
  if(url.includes('/rest/v1/brands')&&init.method==='PATCH'){const r=rows.find(b=>b.slug===slug);Object.assign(r,JSON.parse(init.body),{updated_at:new Date().toISOString()});return json([r]);}
  if(url.includes('/rest/v1/brands'))return json(slug?rows.filter(b=>b.slug===slug):rows.filter(b=>b.status==='active'));
  if(url.includes('/rpc/my_brands'))return json(rows.filter(b=>mine.includes(b.slug)));
  if(url.includes('/rpc/is_admin'))return json(admin);
  if(url.includes('/rpc/admin_list_brands'))return admin?json(rows.map(b=>({...b,owners:mine.includes(b.slug)?[{email:'dono@exemplo.com',name:'Dono'}]:[],products:b.slug==='geek'?2:0}))):json({code:'42501',message:'Área restrita à duavesso.'},403);
  if(url.includes('/rpc/admin_'))return json(url.includes('create')?{slug:JSON.parse(init.body).p_slug}:null,url.includes('create')?200:204);
  if(url.includes('/storage/v1/object/brand-assets/'))return json({Key:'ok'});
  return json([]);
 };
 return {rows,calls,fetchStub};
}
const sessionFor=email=>({'duavesso.session.v1':{access_token:'tok',refresh_token:'ref',expires_at:Math.floor(Date.now()/1000)+3600,started_at:Math.floor(Date.now()/1000),user:{id:'u-dono',email,name:'Dono',provider:'email'}}});
const tick=(ms=30)=>new Promise(r=>setTimeout(r,ms));

test('brand pages come from the database: colors, gradient, featured piece with countdown, and brands created after the build',async()=>{
 const {fetchStub}=brandsBackend();
 const s=await setup({},fetchStub,{path:'/marcas/geek'});try{
 await tick(40);
 const art=s.doc.querySelector('#marcas-view .b2');
 assert(art,'loja da geek');assert.match(art.getAttribute('style'),/--brand-paint:#141519/);
 assert.equal(s.doc.querySelector('.b2-feat .b2-badge').textContent,'Drop 01');
 assert.match(s.doc.querySelector('.b2-feat .b2-count').textContent,/^acaba em 2d 23h$/);
 assert.equal(s.doc.querySelector('.b2-feat').dataset.product,'geek-coracao');
 s.click('.b2-feat');assert.equal(s.w.location.pathname,'/produto/geek-coracao','destaque abre a peça');
 }finally{s.close();}
 const t=await setup({},fetchStub,{path:'/marcas/estudio-mar'});try{
  await tick(40);
  assert.equal(t.w.location.pathname,'/marcas/estudio-mar','marca nova (sem página pré-gerada) carrega do banco');
  assert.equal(t.doc.querySelector('.b2-name').textContent,'Estúdio Mar');
  assert.match(t.doc.querySelector('#marcas-view .b2').getAttribute('style'),/linear-gradient\(120deg,#0b3d91,#00a6a6\)/);
  assert(t.doc.querySelector('.b2-links a[href="https://instagram.com/estudiomar"]'));
  assert.match(t.doc.title,/^Estúdio Mar · surf · Niterói · duavesso$/);
  t.doc.querySelector('.editor-heading a[href="marcas"]').click();await tick(40);
  assert.deepEqual([...t.doc.querySelectorAll('#marcas-view .b2-card .b2-card-name')].map(n=>n.textContent),['duavessogeek','TRY84','Estúdio Mar'],'página de marcas lista as do banco');
 }finally{t.close();}
 const u=await setup({},fetchStub,{path:'/marcas/sumiu'});try{
  await tick(40);
  assert.equal(u.w.location.pathname,'/marcas');assert.match(u.doc.querySelector('#toast').textContent,/não está mais na duavesso/);
 }finally{u.close();}
});

test('Minha Marca: the owner gets the tab, edits identity and free colors (gradient, HEX, color wheel, logo) with a live preview and publishes only content',async()=>{
 const {rows,calls,fetchStub}=brandsBackend();
 const s=await setup(sessionFor('dono@exemplo.com'),fetchStub);try{
 // A CSP do site bloqueia imagens blob: (foi o que quebrou o envio de logo no ar); o logo tem de ser lido como data:
 s.w.URL.createObjectURL=()=>{throw new Error('blob: é bloqueado pela CSP do site');};
 s.click('#open-account');await tick(40);
 const tab=s.doc.querySelector('.account-tab[data-acc-tab="brand"]');assert(tab,'aba Minha Marca na conta');
 tab.click();const link=s.doc.querySelector('.acc-brand a[href="minha-marca?marca=estudio-mar"]');assert(link);
 link.click();await tick(40);
 assert.equal(s.w.location.pathname,'/minha-marca');assert.equal(s.doc.querySelector('#account-dialog').open,false,'a janela da conta fecha');
 const v=s.doc.querySelector('#editor-view'),form=v.querySelector('#me-form'),art=()=>v.querySelector('#me-screen .b2');
 assert.equal(v.querySelector('.me-title').textContent,'Estúdio Mar');
 assert.match(art().getAttribute('style'),/linear-gradient\(120deg,#0b3d91,#00a6a6\)/,'prévia com o degradê salvo');
 const name=form.elements.namedItem('name');name.value='Estúdio Mar Surf';name.dispatchEvent(new s.w.Event('input',{bubbles:true}));
 assert.equal(art().querySelector('.b2-name').textContent,'Estúdio Mar Surf','prévia ao vivo');
 v.querySelector('.me-seg [data-mode="solid"]').click();
 assert.match(art().getAttribute('style'),/--brand-paint:#0b3d91;/,'sólido');
 v.querySelector('.me-seg [data-mode="gradient"]').click();
 const hex2=v.querySelector('.me-color[data-key="c2"] .me-hex');hex2.value='ff7a00';hex2.dispatchEvent(new s.w.Event('input',{bubbles:true}));
 assert.match(art().getAttribute('style'),/linear-gradient\(120deg,#0b3d91,#ff7a00\)/,'código digitado sem #');
 v.querySelector('.me-color[data-key="accent"] .me-swatch').click();
 const cpk=v.querySelector('.cpk');assert(cpk&&!cpk.hidden,'roda de cores abre embaixo do destaque');
 assert.equal(cpk.querySelectorAll('.cpk-fixed button').length,16);assert(cpk.querySelector('.cpk-ring')&&cpk.querySelector('.cpk-sv'),'roda e quadrado');
 cpk.querySelector('.cpk-fixed [data-c="#e11d48"]').click();
 assert.equal(cpk.querySelector('.cpk-hex').value,'#E11D48');assert.equal(v.querySelector('.me-color[data-key="accent"] .me-hex').value,'#E11D48');
 cpk.querySelector('.cpk-tabs [data-tab="rgb"]').click();
 const r=cpk.querySelector('.cpk-sl input[data-i="0"]');r.value='0';r.dispatchEvent(new s.w.Event('input',{bubbles:true}));
 assert.equal(cpk.querySelector('.cpk-hex').value,'#001D48','barra R muda a cor');
 cpk.querySelector('.cpk-ok').click();assert.equal(cpk.hidden,true);
 assert.deepEqual(JSON.parse(s.w.localStorage.getItem('duavesso.cores-recentes')),['#001d48'],'cor usada fica guardada');
 const file=new s.w.File(['x'],'logo.png',{type:'image/png'}),up=v.querySelector('input[data-up="logo"]');
 Object.defineProperty(up,'files',{value:[file]});up.dispatchEvent(new s.w.Event('change',{bubbles:true}));await tick(40);
 let crop=s.doc.querySelector('.crop-dialog');assert(crop?.open,'ao enviar o logo, abre o enquadramento');
 assert.equal(crop.querySelector('#crop-title').textContent,'Ajuste o logo');assert(crop.querySelector('.crop-stage.crop-round'),'logo com máscara redonda');
 assert.equal(calls.some(c=>c.url.includes('/storage/v1/object/brand-assets/')),false,'nada sobe antes de confirmar');
 crop.querySelector('[data-crop="ok"]').click();await tick(40);
 assert.equal(s.doc.querySelector('.crop-dialog'),null,'enquadramento fecha');
 const upload=calls.find(c=>c.url.includes('/storage/v1/object/brand-assets/estudio-mar/logo-'));assert(upload,'logo enviado para a pasta da marca');
 assert(art().querySelector('.b2-logo img').getAttribute('src').includes('/storage/v1/object/public/brand-assets/estudio-mar/logo-'),'prévia com o logo novo');
 assert.equal(v.querySelector('#me-up-status').textContent,'Imagem pronta. Publique para aparecer na loja.');
 assert.match(v.querySelector('.me-up:has([data-up="cover"])').textContent,/1800 × 600 px \(3 por 1\).*Aparece inteira em qualquer tela/,'medidas da capa à vista');
 const pickCover=async()=>{const cover=v.querySelector('input[data-up="cover"]');Object.defineProperty(cover,'files',{value:[new s.w.File(['x'],'capa.png',{type:'image/png'})],configurable:true});
  cover.dispatchEvent(new s.w.Event('change',{bubbles:true}));await tick(40);return s.doc.querySelector('.crop-dialog');};
 crop=await pickCover();
 assert.equal(crop.querySelector('#crop-title').textContent,'Ajuste a faixa de capa');
 assert.deepEqual([...crop.querySelectorAll('figcaption')].map(f=>f.textContent),['Computador','Celular'],'prévias de computador e celular');
 assert.equal(crop.querySelectorAll('.crop-prev .crop-logo').length,2,'logo por cima nas duas prévias');
 const stageImg=()=>crop.querySelector('.crop-stage img').style,phoneImg=()=>crop.querySelector('.crop-prev-phone img').style;
 assert.deepEqual([stageImg().width,stageImg().height,stageImg().top],['100%','300%','-100%'],'imagem quadrada começa centralizada na faixa 3:1');
 assert.match(crop.querySelector('.crop-note').textContent,/1000 × 333 px, menor que 1800 × 600/,'avisa que pode ficar borrada');
 const stage=crop.querySelector('.crop-stage');
 for(let i=0;i<30;i++)stage.dispatchEvent(new s.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 assert.equal(stageImg().top,'0%','seta para baixo desce a imagem até mostrar o topo, e para na borda');
 assert.equal(phoneImg().top,'0%','a prévia do celular acompanha');
 const zoom=crop.querySelector('.crop-zoom input');zoom.value='2';zoom.dispatchEvent(new s.w.Event('input',{bubbles:true}));
 assert.deepEqual([stageImg().width,stageImg().height],['200%','600%'],'zoom aproxima');
 crop.querySelector('[data-crop="cancel"]').click();await tick(40);
 assert.equal(s.doc.querySelector('.crop-dialog'),null);
 assert.equal(calls.some(c=>c.url.includes('/brand-assets/estudio-mar/cover-')),false,'cancelar não envia nada');
 crop=await pickCover();crop.querySelector('[data-crop="ok"]').click();await tick(40);
 assert(calls.some(c=>c.url.includes('/storage/v1/object/brand-assets/estudio-mar/cover-')),'capa enquadrada enviada');
 const ig=form.elements.namedItem('instagram'),site=form.elements.namedItem('site');
 assert.equal(ig.value,'@estudiomar','perfil salvo aparece como @usuario');
 ig.value='https://www.instagram.com/estudio.mar_surf/?igsh=MWx0eDJ5';ig.dispatchEvent(new s.w.Event('input',{bubbles:true}));ig.dispatchEvent(new s.w.Event('change',{bubbles:true}));
 assert.equal(ig.value,'@estudio.mar_surf','link inteiro colado vira @usuario ao sair do campo');
 const igLink=art().querySelector('.b2-links a[aria-label^="Instagram"]');
 assert.equal(igLink.textContent,'@estudio.mar_surf','a página mostra só o @usuario');
 assert.equal(igLink.getAttribute('href'),'https://instagram.com/estudio.mar_surf','o clique abre o perfil, sem o código de rastreio');
 site.value='estudiomar.com.br';site.dispatchEvent(new s.w.Event('input',{bubbles:true}));site.dispatchEvent(new s.w.Event('change',{bubbles:true}));
 assert.equal(site.value,'https://estudiomar.com.br','site sem https:// é completado');
 v.querySelector('#me-save').click();await tick(40);
 const patch=calls.find(c=>c.init.method==='PATCH');assert(patch,'publicou');
 const body=JSON.parse(patch.init.body);
 assert.deepEqual(Object.keys(body).sort(),['bio','cover_path','featured_badge','featured_product_id','featured_until','links','logo_path','name','tagline','theme'],'só o conteúdo editável');
 assert.equal(body.name,'Estúdio Mar Surf');assert.deepEqual(body.theme,{mode:'gradient',c1:'#0b3d91',c2:'#ff7a00',angle:120,accent:'#001d48'});
 assert.match(body.logo_path,/^estudio-mar\/logo-[0-9a-z-]+\.webp$/);
 assert.deepEqual(body.links,{instagram:'estudio.mar_surf',site:'https://estudiomar.com.br'},'banco recebe só o nome de usuário e o site com https');
 assert.match(s.doc.querySelector('#toast').textContent,/publicada/);
 assert.equal(rows.find(b=>b.slug==='estudio-mar').name,'Estúdio Mar Surf');
 }finally{s.close();}
});

test('Painel da duavesso: only the admin gets in, creates a partner brand from an e-mail, adds owners to existing brands, warns about look-alike names, suspends and marks the R$ 400 plan',async()=>{
 const notAdmin=brandsBackend();
 const s=await setup(sessionFor('dono@exemplo.com'),notAdmin.fetchStub,{path:'/painel'});try{
  await tick(40);assert.match(s.doc.querySelector('#admin-view').textContent,/Área restrita/);
 }finally{s.close();}
 const {calls,fetchStub}=brandsBackend({admin:true});
 const t=await setup(sessionFor('duavesso.co@gmail.com'),fetchStub,{path:'/painel'});try{
  await tick(40);
  t.w.confirm=()=>true;t.w.prompt=()=>'Pix recebido em 08/10';
  const v=t.doc.querySelector('#admin-view');
  assert.equal(v.querySelectorAll('.ad-row').length,3);
  assert(v.querySelector('.ad-row[data-slug="geek"] a[href="minha-marca?marca=geek"]'),'editar a página de qualquer marca');
  const f=v.querySelector('#ad-add'),fe=n=>f.elements.namedItem(n);fe('email').value='nova@marca.com';fe('name').value='Ação & Reação';fe('name').dispatchEvent(new t.w.Event('input',{bubbles:true}));
  assert.equal(fe('slug').value,'acao-reacao','endereço sugerido a partir do nome');
  assert.equal(v.querySelector('#ad-twin').hidden,true,'nome novo: sem aviso');
  const typeName=n=>{fe('name').value=n;fe('name').dispatchEvent(new t.w.Event('input',{bubbles:true}));};
  typeName('Duavesso Geek');assert.equal(v.querySelector('#ad-twin').hidden,false,'nome parecido com a geek: avisa');
  assert.match(v.querySelector('#ad-twin').textContent,/Parece a duavessogeek.*\/marcas\/geek.*Adicionar dono/);
  fe('slug').value='geek';fe('slug').dispatchEvent(new t.w.Event('input',{bubbles:true}));assert.match(v.querySelector('#ad-twin').textContent,/já é da duavessogeek: a conta vira dona dela/);
  delete fe('slug').dataset.touched;typeName('Ação & Reação');assert.equal(v.querySelector('#ad-twin').hidden,true);
  f.dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));await tick(40);
  const create=calls.find(c=>c.url.includes('/rpc/admin_create_brand'));assert.deepEqual(JSON.parse(create.init.body),{p_email:'nova@marca.com',p_slug:'acao-reacao',p_name:'Ação & Reação'});
  t.doc.querySelector('.ad-row[data-slug="try84"] [data-act="status"]').click();await tick(40);
  assert.deepEqual(JSON.parse(calls.find(c=>c.url.includes('/rpc/admin_set_brand_status')).init.body),{p_slug:'try84',p_status:'suspended'});
  t.doc.querySelector('.ad-row[data-slug="try84"] [data-act="plan"]').click();await tick(40);
  assert.deepEqual(JSON.parse(calls.find(c=>c.url.includes('/rpc/admin_set_brand_plan')).init.body),{p_slug:'try84',p_plan:'paid',p_note:'Pix recebido em 08/10'});
  t.w.prompt=()=>' parceiro@geek.com ';t.doc.querySelector('.ad-row[data-slug="geek"] [data-act="add-owner"]').click();await tick(40);
  assert.deepEqual(JSON.parse(calls.filter(c=>c.url.includes('/rpc/admin_create_brand')).at(-1).init.body),{p_email:'parceiro@geek.com',p_slug:'geek',p_name:'duavessogeek'},'Adicionar dono liga a conta à marca que já existe');
  assert.match(t.doc.querySelector('#toast').textContent,/vê a aba Minha Marca/);
  t.click('#open-account');await tick(40);assert(t.doc.querySelector('.account-admin[href="painel"]'),'atalho do painel na conta da dona');
 }finally{t.close();}
});
