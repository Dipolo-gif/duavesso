import {PRODUCTS,SIZES,CUSTOM,FREE_SHIPPING_MIN,INSTALLMENTS,installment,customMode,shippingSuggestion,money,escapeHTML as esc,totals,addItem,changeQuantity,normalizeCart,validImageURL,garmentLabel,PRINT_ZONES,PRINT_ZONE_AT,isZone,MAX_PRINTS,printsSummary} from './commerce.js';
import {CHEST_Y,UNIT} from './studio-placement.js';
import {online,rpc,uploadDesign,dataURLToBlob,getUser,signIn,signUp,signOut,resetPassword,updatePassword,signInWithGoogle,handleAuthRedirect,fetchProfile,updateProfile,fetchMyOrders} from './api.js';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
let filter='all';
const BASE_LABEL={white:'Off white',black:'Preto lavado',brown:'Marrom'};
const baseName=b=>BASE_LABEL[b]||'Preto lavado';
function graphicHTML(p){return p.graphic?`<span class="product-graphic ${p.graphicClass}">${esc(p.graphic)}</span>`:'';}
const TEE_WIDTHS=[400,800,1254];
function teePicture(base,alt,sizes,attrs=''){return `<picture><source type="image/webp" srcset="${TEE_WIDTHS.map(w=>`assets/tee-${base}-${w}.webp ${w}w`).join(', ')}" sizes="${sizes}"><img src="assets/tee-${base}-1254.jpg" alt="${alt}" width="1254" height="1254" decoding="async" ${attrs}></picture>`;}
const PHOTO_WIDTHS=[400,800,1024];
function photoPicture(name,alt,sizes,attrs=''){return `<picture><source type="image/webp" srcset="${PHOTO_WIDTHS.map(w=>`assets/${name}-${w}.webp ${w}w`).join(', ')}" sizes="${sizes}"><img src="assets/${name}-1024.jpg" alt="${alt}" width="1024" height="1536" decoding="async" ${attrs}></picture>`;}
const variantOf=(p,base)=>p.variants?(p.variants.find(v=>v.base===base)||p.variants[0]):null;
const photosOf=(p,base)=>{const v=variantOf(p,base);if(v)return v.photos;return Array.isArray(p.photos)&&p.photos.length?p.photos:null;};
const colorDots=p=>p.variants?`<span class="color-dots">${p.variants.map(v=>`<i class="color-dot" style="background:${v.swatch}"></i>`).join('')} ${p.variants.length} cores</span>`:`<span><i class="color-dot" style="background:${p.swatch}"></i>${p.color}</span>`;
function cardVisual(p){const ph=photosOf(p);if(!ph)return `<div class="product-visual">${teePicture(p.base,`${p.name}, ${p.color}`,'(max-width:700px) 48vw, 24vw','loading="lazy"')}${graphicHTML(p)}</div>`;return `<div class="product-visual poses">${ph.map((n,i)=>`<div class="pose${i?'':' is-active'}">${photoPicture(n,`${p.name}, ${p.color}, pose ${i+1}`,'(max-width:700px) 48vw, 24vw','loading="lazy"')}</div>`).join('')}</div>`;}
function wirePoseHovers(){if(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;$$('.product-visual.poses').forEach(v=>{const poses=$$('.pose',v);if(poses.length<2)return;let idx=0,timer=null;const show=i=>poses.forEach((el,k)=>el.classList.toggle('is-active',k===i));const stop=()=>{clearInterval(timer);timer=null;idx=0;show(0);};const start=()=>{if(timer)return;timer=setInterval(()=>{idx=(idx+1)%poses.length;show(idx);},760);};const host=v.closest('.product-image-button')||v;host.addEventListener('mouseenter',start);host.addEventListener('mouseleave',stop);host.addEventListener('focusin',start);host.addEventListener('focusout',stop);});}
function renderCatalog(){
 const query=$('#search').value.trim().toLocaleLowerCase('pt-BR');
 let products=PRODUCTS.filter(p=>(filter==='all'||p.category===filter)&&`${p.name} ${p.color}`.toLocaleLowerCase('pt-BR').includes(query));
 if($('#sort').value==='price-low')products.sort((a,b)=>a.price-b.price);
 if($('#sort').value==='price-high')products.sort((a,b)=>b.price-a.price);
 $('#product-grid').innerHTML=products.map((p,i)=>`<article class="product-card"><button class="product-image-button" data-product="${p.id}"><span class="sr-only">Ver ${p.name}: </span>${cardVisual(p)}<span class="product-tag">${p.tag}</span><span class="product-add" aria-hidden="true">＋</span></button><div class="product-meta"><h3><a href="#produto-${p.id}">${p.name}</a></h3><span class="price">${money(p.price)}</span></div><p class="installments">${INSTALLMENTS}x de ${money(installment(p.price))} sem juros</p><div class="product-sub">${colorDots(p)}<span>P a GG</span></div></article>`).join('');
 $('#product-count').textContent=`${products.length} ${products.length===1?'peça':'peças'} / coleção 01`;
 $('#empty-search').hidden=products.length>0;
 wirePoseHovers();
}
renderCatalog();
// O catálogo curado no código (commerce.js) é a fonte da verdade: tem os campos
// novos (swatch, fotos) e as cópias atuais. A tabela products do Supabase está
// desatualizada, então não sobrescrevemos mais a lista local com o servidor.

const CART_KEY='duavesso.cart.v1',ORDERS_KEY='duavesso.orders.v1';
function readStored(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
let cart=normalizeCart(readStored(CART_KEY,[]));
let orders=readStored(ORDERS_KEY,[]);
if(!Array.isArray(orders))orders=[];
orders=orders.filter(o=>o&&typeof o.id==='string'&&Array.isArray(o.items)&&Number.isFinite(o.total)).slice(0,20);
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function saveCart(){try{localStorage.setItem(CART_KEY,JSON.stringify(cart));}catch{toast('Sacola atualizada nesta sessão. O navegador não permitiu salvá-la.');}updateCartCount();}
function updateCartCount(){const count=totals(cart).count;$('#cart-count').textContent=count;$('#open-cart').setAttribute('aria-label',`Abrir sacola, ${count} ${count===1?'peça':'peças'}`);}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
function closeDialog(dialog){dialog.close();}
$$('dialog').forEach(d=>{
 $('.close-dialog',d).addEventListener('click',()=>closeDialog(d));
 d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d);}});
});
$('.mobile-menu-toggle').addEventListener('click',()=>{const menu=$('#mobile-menu');menu.hidden=!menu.hidden;$('.mobile-menu-toggle').setAttribute('aria-expanded',String(!menu.hidden));});
$$('#mobile-menu a').forEach(a=>a.addEventListener('click',()=>{$('#mobile-menu').hidden=true;$('.mobile-menu-toggle').setAttribute('aria-expanded','false');}));
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;$$('[data-filter]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCatalog();}));
$('#sort').addEventListener('change',renderCatalog);
$('#search').addEventListener('input',renderCatalog);
$('#clear-search').addEventListener('click',()=>{$('#search').value='';renderCatalog();$('#search').focus();});
$('.search-toggle').addEventListener('click',()=>{$('.search-row').hidden=false;location.hash='colecao';setTimeout(()=>$('#search').focus(),100);});

function showProduct(id){
 const p=PRODUCTS.find(p=>p.id===id);if(!p)return;
 $('#product-detail').innerHTML=`<div class="detail-layout"><div class="detail-gallery"><div class="detail-main" id="detail-main"></div><div class="detail-thumbs" id="detail-thumbs" role="group" aria-label="Fotos do produto"></div></div><div class="detail-copy"><span class="eyebrow">DUAVESSO · ${p.category==='graphic'?'ESTAMPADAS':p.category==='simples'?'SIMPLES':'ESSENCIAIS'}</span><h2>${p.name}</h2><div class="price">${money(p.price)}</div><p class="installments">ou ${INSTALLMENTS}x de ${money(installment(p.price))} sem juros</p><p>${p.description}</p>${p.variants?`<div class="color-select"><span class="field-label">Cor: <strong id="detail-color-name"></strong></span><div class="detail-swatches" role="group" aria-label="Cor da camiseta">${p.variants.map(v=>`<button type="button" class="detail-swatch" data-base="${v.base}" style="background:${v.swatch}" title="${v.color}"><span class="sr-only">${v.color}</span></button>`).join('')}</div></div>`:`<p class="detail-color"><i class="color-dot" style="background:${p.swatch}"></i> ${p.color}</p>`}<span style="font-size:14px">Escolha seu tamanho</span><div class="size-options" role="group" aria-label="Tamanho da camiseta">${SIZES.map(s=>`<button data-size="${s}" aria-pressed="false">${s}</button>`).join('')}</div><button class="text-link size-guide-button">Guia de medidas ↗</button><button class="button button-blue" id="add-product" disabled>Selecione um tamanho <span>＋</span></button><ul class="trust-row"><li>Frete grátis a partir de ${money(FREE_SHIPPING_MIN)}</li><li>Troca fácil em 30 dias</li><li>Pix ou cartão em até ${INSTALLMENTS}x</li></ul><dl class="specs"><div><dt>Tecido</dt><dd>${p.fabric}</dd></div><div><dt>Acabamento</dt><dd>${p.finish}</dd></div>${p.print?`<div><dt>Estampa</dt><dd>${p.print}</dd></div>`:''}<div><dt>Caimento</dt><dd>${p.fit}</dd></div><div><dt>Cuidados</dt><dd>${p.care}</dd></div></dl><p class="helper">Imagem, preço e características para demonstração.</p></div></div>`;
 let selected='',activeBase=p.variants?p.variants[0].base:p.base,activePose=0;
 const root=$('#product-detail'),mainEl=$('#detail-main',root),thumbsEl=$('#detail-thumbs',root);
 function renderGallery(){
  const ph=photosOf(p,activeBase);
  if(ph){
   mainEl.innerHTML=photoPicture(ph[activePose],`${p.name}, foto ${activePose+1} de ${ph.length}`,'(max-width:700px) 96vw, 560px');
   thumbsEl.innerHTML=ph.map((n,i)=>`<button type="button" class="detail-thumb${i===activePose?' active':''}" data-pose="${i}" aria-pressed="${i===activePose}"><span class="sr-only">Foto ${i+1}</span>${photoPicture(n,'','80px','loading="lazy"')}</button>`).join('');
  }else{mainEl.innerHTML=teePicture(p.base,p.name,'(max-width:700px) 96vw, 560px')+graphicHTML(p);thumbsEl.innerHTML='';}
  if(p.variants){const v=variantOf(p,activeBase);$('#detail-color-name',root).textContent=v.color;$$('.detail-swatch',root).forEach(b=>{const on=b.dataset.base===activeBase;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
 }
 renderGallery();
 thumbsEl.addEventListener('click',e=>{const b=e.target.closest('[data-pose]');if(!b)return;activePose=+b.dataset.pose;renderGallery();});
 $$('.detail-swatch',root).forEach(b=>b.addEventListener('click',()=>{activeBase=b.dataset.base;activePose=0;renderGallery();}));
 $$('[data-size]',root).forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.size;$$('[data-size]',root).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#add-product').disabled=false;$('#add-product').innerHTML='Adicionar à sacola <span>＋</span>';}));
 $('#add-product').addEventListener('click',()=>{if(addCatalogItem(p.id,selected,activeBase)){closeDialog($('#product-dialog'));showCart();}});
 $('.size-guide-button',root).addEventListener('click',showSizeGuide);
 openDialog('#product-dialog');
}
function addCatalogItem(id,size,base){
 const p=PRODUCTS.find(x=>x.id===id);if(!p||!SIZES.includes(size))throw new Error('Escolha um produto e um tamanho válidos.');
 const v=variantOf(p,base),{variants,...rest}=p;
 const item=v?{...rest,base:v.base,color:v.color,swatch:v.swatch,size,key:`${p.id}-${v.base}-${size}`}:{...rest,size,key:`${p.id}-${size}`};
 try{cart=addItem(cart,item);saveCart();return true;}catch(e){toast(e.message);return false;}
}
$('#product-grid').addEventListener('click',e=>{const b=e.target.closest('[data-product]');if(b)showProduct(b.dataset.product);});
function showSizeGuide(){showInfo('Guia de medidas',`<p>Medidas da peça estendida, em centímetros. Compare com uma camiseta que você já gosta de vestir.</p><table><thead><tr><th scope="col">Tamanho</th><th scope="col">Largura</th><th scope="col">Comprimento</th></tr></thead><tbody><tr><th scope="row">P</th><td>54 cm</td><td>70 cm</td></tr><tr><th scope="row">M</th><td>57 cm</td><td>73 cm</td></tr><tr><th scope="row">G</th><td>60 cm</td><td>76 cm</td></tr><tr><th scope="row">GG</th><td>63 cm</td><td>79 cm</td></tr></tbody></table><p style="margin-top:20px">Tabela demonstrativa. As medidas finais devem ser conferidas com o fornecedor antes da venda real.</p>`);}
$('#design-form .size-guide-button').addEventListener('click',showSizeGuide);
$('#footer-size-guide').addEventListener('click',showSizeGuide);
$('#open-returns').addEventListener('click',()=>showInfo('Trocas e devoluções','<p>Política demonstrativa. Os termos reais devem ser definidos antes de iniciar vendas.</p><h3>30 dias para decidir</h3><p>Peças do catálogo podem ser trocadas ou devolvidas em até 30 dias após o recebimento, sem uso, com etiqueta e na embalagem original.</p><h3>Primeira troca por nossa conta</h3><p>Errou o tamanho? A primeira troca de tamanho tem envio de ida e volta gratuito.</p><h3>Camisetas personalizadas</h3><p>Peças criadas no estúdio são produzidas sob demanda e só entram em troca por defeito de fabricação ou erro de produção. Por isso a prévia é aprovada antes de produzir.</p>'));
$('#open-shipping').addEventListener('click',()=>showInfo('Entregas e prazos',`<p>Valores e prazos demonstrativos.</p><h3>Padrão</h3><p>R$ 14,90 · 5 a 8 dias úteis. Grátis em pedidos a partir de ${money(FREE_SHIPPING_MIN)} em produtos.</p><h3>Expressa</h3><p>R$ 24,90 · 2 a 3 dias úteis.</p><h3>Personalizadas</h3><p>Peças do estúdio somam 3 dias úteis de produção ao prazo de entrega. Estampas sob medida entram em produção após a aprovação da prévia.</p><h3>Acompanhamento</h3><p>Em uma loja real, o código de rastreio seria enviado por e-mail assim que a peça saísse para entrega.</p>`));
$('#open-contact').addEventListener('click',()=>showInfo('Fale com a gente','<p>Canal de atendimento demonstrativo.</p><h3>Como funcionaria</h3><p>Atendimento por WhatsApp e e-mail, de segunda a sexta, das 9h às 18h. Dúvidas sobre tamanho, prazo ou estampa respondidas em até um dia útil.</p><h3>Por enquanto</h3><p>Esta versão não envia nem recebe mensagens. Consulte as dúvidas frequentes para as respostas mais comuns.</p>'));
async function submitSubscribe(form,demo,ok){if(!form.reportValidity())return;if(form.elements.namedItem('website')?.value){form.reset();return;}if(!online()){form.reset();toast(demo);return;}const button=$('button[type=submit]',form);button.disabled=true;try{await rpc('subscribe_newsletter',{p_email:form.elements.namedItem('email').value});form.reset();toast(ok);}catch(error){toast(error.message);}finally{button.disabled=false;}}
function subscribeForm(sel,demo,ok){const form=$(sel);if(form)form.addEventListener('submit',e=>{e.preventDefault();submitSubscribe(form,demo,ok);});}
subscribeForm('#newsletter','Cadastro demonstrativo: nenhum e-mail foi enviado ou guardado.','Pronto! Você está na lista. Sem spam, só novidades.');
$('#marcas-view').addEventListener('submit',e=>{const form=e.target.closest('.brand-notify');if(form){e.preventDefault();submitSubscribe(form,'Anotado! Te avisamos quando a linha lançar (demonstração).','Pronto! Te avisamos quando a linha lançar.');}});
function showInfo(title,html){$('#info-title').textContent=title;$('#info-content').innerHTML=html;openDialog('#info-dialog');}
/* Politica de Privacidade e Cookies (LGPD) */
const PRIVACY_HTML=`<p><strong>Última atualização:</strong> 22 de setembro de 2026.</p><p>A sua privacidade importa para a duavesso. Esta política explica quais dados a gente coleta, por que coleta, com quem compartilha e quais são os seus direitos, segundo a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).</p><p class="privacy-note"><strong>Pré-lançamento:</strong> a loja está em demonstração e ainda não cobra nem processa pagamentos. Alguns canais (atendimento, e-mail e rastreio) são ilustrativos e os termos finais serão revisados antes do início das vendas.</p><h3>Quais dados a gente coleta</h3><ul><li><strong>Conta:</strong> nome, e-mail e senha quando você cria uma conta. A senha fica guardada de forma criptografada pelo provedor de autenticação, então a gente nunca vê a sua senha.</li><li><strong>Login com Google:</strong> se você entrar com o Google, recebemos o nome e o e-mail dessa conta para criar ou acessar o seu perfil.</li><li><strong>Novidades:</strong> o seu e-mail, quando você pede para receber os lançamentos.</li><li><strong>Pedidos:</strong> nome, endereço de entrega e itens do pedido. Nesta versão de demonstração, o histórico fica apenas no seu navegador e nenhum pagamento é processado.</li><li><strong>Estúdio de estampas:</strong> os textos, as descrições e as imagens que você envia para criar a sua estampa.</li><li><strong>Dados técnicos:</strong> informações básicas de acesso (navegador, dispositivo e registros de segurança) geradas pela hospedagem para manter o site no ar e protegido.</li></ul><h3>Para que a gente usa</h3><ul><li>Criar e manter a sua conta e o seu login.</li><li>Organizar e, no futuro, entregar os seus pedidos.</li><li>Desenhar a arte que você pede no estúdio e enviar a prévia para aprovação.</li><li>Enviar novidades e lançamentos, quando você autoriza.</li><li>Responder ao seu contato e dar suporte.</li><li>Manter a loja segura e melhorar a experiência.</li></ul><h3>Bases legais</h3><p>Tratamos os seus dados com base na execução de contrato e nos procedimentos ligados ao pedido, no seu consentimento (novidades e dados opcionais de navegação), no legítimo interesse (segurança e melhoria da loja) e no cumprimento de obrigações legais, quando for o caso.</p><h3>Cookies e armazenamento no navegador</h3><p>A duavesso <strong>não usa cookies de publicidade nem rastreadores de terceiros</strong>. Para a loja funcionar, guardamos algumas informações no armazenamento local do seu próprio navegador (localStorage), e não em cookies de rastreio:</p><ul><li><strong>Essenciais (sempre ativos):</strong> a sua sacola, a sua sessão de login, a verificação de segurança do login social e a sua preferência de privacidade. Sem eles a loja não funciona.</li><li><strong>Opcionais (só com a sua permissão):</strong> dados de navegação para entender o uso e melhorar a loja. Hoje não há nenhuma ferramenta de análise ativa. Se um dia passarmos a usar, ela só carrega depois do seu aceite.</li></ul><p>Você decide no aviso que aparece na primeira visita e pode limpar esses dados quando quiser, nas configurações do navegador.</p><h3>Com quem a gente compartilha</h3><p>A gente <strong>não vende os seus dados</strong>. Compartilhamos apenas com prestadores que ajudam a loja a funcionar:</p><ul><li><strong>Supabase:</strong> login e banco de dados.</li><li><strong>Google:</strong> só quando você escolhe entrar com a conta Google.</li><li><strong>ViaCEP e IBGE:</strong> consulta pública de endereço a partir do CEP no checkout. Enviamos só o CEP, nunca os seus dados pessoais.</li><li><strong>Vercel:</strong> hospedagem do site.</li></ul><p>Também podemos compartilhar dados quando a lei ou uma autoridade competente exigir.</p><h3>Transferência internacional</h3><p>Alguns desses prestadores podem processar dados em servidores fora do Brasil. Nesses casos, escolhemos fornecedores reconhecidos, com salvaguardas de proteção compatíveis com a LGPD.</p><h3>Por quanto tempo a gente guarda</h3><p>Guardamos os seus dados enquanto a sua conta existir ou pelo tempo necessário para as finalidades acima e para cumprir a lei. Você pode pedir a exclusão a qualquer momento. Os dados que ficam só no navegador somem quando você limpa o navegador.</p><h3>Segurança</h3><p>Usamos conexão criptografada (HTTPS), senhas guardadas de forma criptografada e regras de acesso no banco de dados. Nenhum sistema é infalível, mas a gente trabalha para proteger as suas informações.</p><h3>Os seus direitos</h3><p>Pela LGPD, você pode a qualquer momento confirmar se tratamos os seus dados, acessar esses dados, corrigir informações incompletas ou desatualizadas, pedir a anonimização ou a exclusão, pedir a portabilidade, saber com quem compartilhamos e revogar o consentimento. Para exercer qualquer um desses direitos, fale com a gente pelo canal abaixo.</p><h3>Crianças e adolescentes</h3><p>A loja é destinada a maiores de 18 anos e a gente não coleta dados de crianças de forma intencional. Se isso acontecer, entre em contato para removermos.</p><h3>Mudanças nesta política</h3><p>Esta política pode mudar. Quando houver alteração relevante, a data no topo muda e, se necessário, avisamos na loja.</p><h3>Fale sobre privacidade</h3><p>Dúvidas e pedidos sobre os seus dados podem ir para <strong>privacidade@duavesso.com.br</strong> (canal ilustrativo nesta fase). O encarregado pelos dados (DPO) será indicado antes do início das vendas.</p>`;
function showPrivacy(){showInfo('Política de Privacidade e Cookies',PRIVACY_HTML);}
$('#open-privacy')?.addEventListener('click',showPrivacy);
/* Consentimento de armazenamento/cookies (LGPD) */
const CONSENT_KEY='duavesso.consent.v1';
function consentChoice(){const c=readStored(CONSENT_KEY,null);return c&&typeof c==='object'?c.choice:null;}
window.dvConsent={choice:consentChoice(),get analytics(){return consentChoice()==='accepted';}};
function saveConsent(choice){try{localStorage.setItem(CONSENT_KEY,JSON.stringify({v:1,choice,at:new Date().toISOString()}));}catch{}window.dvConsent.choice=choice;}
function cookieBanner(){
 if(consentChoice())return;
 const bar=document.createElement('section');
 bar.id='cookie-banner';bar.className='cookie-banner';bar.setAttribute('role','region');bar.setAttribute('aria-label','Aviso de privacidade e cookies');
 bar.innerHTML=`<p class="cookie-text">Guardamos a sua <strong>sacola</strong> e o seu <strong>login</strong> neste navegador só para a loja funcionar. Com a sua permissão, usamos dados de navegação para melhorar a experiência. Não usamos cookies de publicidade nem vendemos os seus dados. <button type="button" class="cookie-link" data-consent="more">Ler a política</button></p><div class="cookie-actions"><button type="button" class="cookie-ghost" data-consent="essential">Só o essencial</button><button type="button" class="button button-blue" data-consent="accepted">Aceitar</button></div>`;
 bar.addEventListener('click',e=>{const b=e.target.closest('[data-consent]');if(!b)return;const c=b.dataset.consent;if(c==='more'){showPrivacy();return;}saveConsent(c);bar.remove();toast(c==='accepted'?'Preferências salvas. Obrigado!':'Combinado: só o essencial.');});
 document.body.appendChild(bar);
}
function itemThumb(item){const prod=PRODUCTS.find(x=>x.id===item.id),ph=prod&&photosOf(prod,item.base);return `<div class="cart-thumb">${item.preview&&validImageURL(item.preview)?`<img src="${item.preview}" alt="${esc(item.name)}">`:ph?photoPicture(ph[0],esc(item.name),'88px'):teePicture(item.base,esc(item.name),'88px')+graphicHTML(item)}</div>`;}
function showCart(){renderCart();openDialog('#cart-dialog');}
function renderCart(){
 $('#cart-title-count').textContent=`(${totals(cart).count})`;
 if(!cart.length){$('#cart-content').innerHTML=`<div class="empty-state"><h3>Espaço para o seu próximo favorito.</h3><p>Sua sacola está vazia. Encontre uma peça ou crie a sua.</p><button class="button button-blue" id="continue-shopping">Explorar a coleção <span>↗</span></button></div>`;$('#continue-shopping').addEventListener('click',()=>{closeDialog($('#cart-dialog'));location.hash='colecao';});return;}
 const t=totals(cart);
 $('#cart-content').innerHTML=cart.map(item=>`<article class="cart-item">${itemThumb(item)}<div><h3>${esc(item.name)}</h3><p>${esc(item.color)} / ${esc(item.size)}</p>${item.id==='custom'?(customMode(item.design)==='brief'?`<p class="brief-excerpt">“${esc(item.design.brief)}”</p><p>Arte criada pela equipe · prévia para aprovação</p>`:`<p>${esc(printsSummary(item.design))}</p>`):''}<div class="cart-item-bottom"><div class="quantity"><button data-qty="-1" data-key="${esc(item.key)}" aria-label="Diminuir quantidade de ${esc(item.name)}">−</button><span>${item.qty}</span><button data-qty="1" data-key="${esc(item.key)}" aria-label="Aumentar quantidade de ${esc(item.name)}" ${item.qty>=10?'disabled':''}>+</button></div><strong class="price">${money(item.price*item.qty)}</strong></div><button class="remove-item" data-remove="${esc(item.key)}">Remover</button></div></article>`).join('')+`<div class="cart-summary"><div class="summary-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div><div class="summary-row"><span>Entrega padrão</span><span>${t.delivery?money(t.delivery):'Grátis'}</span></div>${shippingProgressHTML(t.subtotal)}<div class="summary-row summary-total"><span>Total estimado</span><span>${money(t.total)}</span></div><button class="button button-blue" id="begin-checkout">Continuar para compra <span>→</span></button><button class="text-button" id="keep-shopping">Continuar comprando</button><p class="helper">Pré-lançamento: nenhum valor é cobrado por enquanto.</p></div>`;
 $('#begin-checkout').addEventListener('click',()=>{closeDialog($('#cart-dialog'));showCheckout();});
 $('#keep-shopping').addEventListener('click',()=>{closeDialog($('#cart-dialog'));location.hash='colecao';});
 $('[data-suggest]',$('#cart-content'))?.addEventListener('click',e=>{closeDialog($('#cart-dialog'));showProduct(e.currentTarget.dataset.suggest);});
}
function shippingProgressHTML(subtotal){
 const remaining=FREE_SHIPPING_MIN-subtotal,pct=Math.min(100,Math.round(subtotal/FREE_SHIPPING_MIN*100));
 if(remaining<=0)return `<div class="shipping-progress unlocked"><p><strong>Frete grátis liberado.</strong> Entrega padrão por nossa conta.</p><div class="progress-track"><div class="progress-fill" style="width:100%"></div></div></div>`;
 const s=shippingSuggestion(cart);
 return `<div class="shipping-progress"><p>Faltam <strong>${money(remaining)}</strong> para o frete grátis.</p><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>${s?`<button class="suggestion" data-suggest="${s.id}"><span class="suggestion-thumb">${photosOf(s)?photoPicture(photosOf(s)[0],'','60px'):teePicture(s.base,'','60px')+graphicHTML(s)}</span><span><strong>Complete com ${esc(s.name)}</strong><small>${money(s.price)} · ${s.price>=remaining?'libera o frete grátis':'e chegue mais perto'}</small></span><span class="suggestion-arrow">→</span></button>`:''}</div>`;
}
$('#open-cart').addEventListener('click',showCart);
$('#cart-content').addEventListener('click',e=>{const q=e.target.closest('[data-qty]'),r=e.target.closest('[data-remove]');if(q)cart=changeQuantity(cart,q.dataset.key,Number(q.dataset.qty));if(r)cart=cart.filter(i=>i.key!==r.dataset.remove);if(q||r){saveCart();renderCart();}});

function showCheckout(){
 if(!cart.length){showCart();return;}
 const live=online();
 $('#checkout-content').innerHTML=`<div class="demo-note">${live?'Pagamento ainda não integrado: o pedido é registrado como “aguardando pagamento” e nenhum valor é cobrado agora.':'Este é um pedido de demonstração: não há cobrança nem envio de produtos. Use dados fictícios.'}</div><form id="checkout-form"><div class="checkout-columns"><div class="checkout-fields"><div style="display:flex;justify-content:space-between;gap:15px;align-items:center"><h3>Dados para entrega</h3>${live?'':'<button type="button" class="text-button" id="fill-demo">Preencher exemplo</button>'}</div><label>Nome<input name="name" autocomplete="name" required minlength="3" maxlength="80" placeholder="Seu nome"></label><label>E-mail<input name="email" type="email" autocomplete="email" required maxlength="120" placeholder="voce@exemplo.com"></label><div class="field-row" style="margin:0"><label>CEP<input name="cep" inputmode="numeric" autocomplete="postal-code" required pattern="[0-9]{5}-?[0-9]{3}" maxlength="9" placeholder="00000-000" title="Informe 8 dígitos, com ou sem hífen"></label><label>Cidade<input name="city" autocomplete="address-level2" required minlength="2" maxlength="80" placeholder="Sua cidade"></label></div><label>Endereço e número<input name="address" autocomplete="street-address" required minlength="5" maxlength="160" placeholder="Rua Exemplo, 123"></label><fieldset><legend>Entrega</legend><label class="radio-option"><input type="radio" name="shipping" value="standard" checked> Padrão · 5 a 8 dias úteis</label><label class="radio-option"><input type="radio" name="shipping" value="express"> Expressa · 2 a 3 dias úteis · R$ 24,90</label></fieldset><fieldset><legend>Pagamento</legend><label class="radio-option"><input type="radio" name="payment" value="Pix" checked> Pix</label><label class="radio-option"><input type="radio" name="payment" value="Cartão"> Cartão</label><p class="helper">${live?'Nenhum dado bancário é pedido aqui. A cobrança ainda não está ativa.':'Nenhum dado bancário é necessário. A aprovação é simulada.'}</p></fieldset></div><aside class="checkout-summary" id="checkout-summary" aria-live="polite"></aside></div><button type="submit" class="button button-blue checkout-submit">${live?'Confirmar pedido':'Confirmar pedido demonstrativo'} <span>→</span></button><p class="helper">${live?'Seus dados de entrega ficam guardados com segurança, só para este pedido. O histórico de itens fica também neste navegador.':'Nome, e-mail e endereço não são armazenados. O histórico de itens fica apenas neste navegador.'}</p></form>`;
 const form=$('#checkout-form');
 const user=getUser();
 if(user){const email=form.elements.namedItem('email');email.value=user.email;email.readOnly=true;loadProfile().then(p=>{for(const k of ['name','cep','city','address']){const input=form.elements.namedItem(k);if(p?.[k]&&!input.value)input.value=p[k];}if(!form.elements.namedItem('name').value&&user.name)form.elements.namedItem('name').value=user.name;});}
 const summary=()=>{const t=totals(cart,new FormData(form).get('shipping'));$('#checkout-summary').innerHTML=`<h3>Resumo · ${t.count} ${t.count===1?'peça':'peças'}</h3>${cart.map(i=>`<div class="summary-row"><span>${esc(i.name)} · ${esc(i.size)} × ${i.qty}</span><span>${money(i.price*i.qty)}</span></div>`).join('')}<div class="summary-row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div><div class="summary-row"><span>Entrega</span><span>${t.delivery?money(t.delivery):'Grátis'}</span></div><div class="summary-row summary-total"><span>Total</span><span>${money(t.total)}</span></div>`;};
 form.addEventListener('change',summary);summary();
 $('#fill-demo')?.addEventListener('click',()=>{for(const [key,value] of Object.entries({name:'Cliente de Exemplo',email:'cliente@example.com',cep:'60000-000',city:'Fortaleza',address:'Rua de Exemplo, 123'}))form.elements.namedItem(key).value=value;});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!form.reportValidity()||!cart.length)return;
  const data=new FormData(form),payment=data.get('payment'),shipping=data.get('shipping'),button=$('.checkout-submit',form);
  let result;
  if(live){
   button.disabled=true;button.textContent='Registrando pedido…';
   try{result=await submitOrder(data,shipping,payment);}
   catch(error){toast(error.message);button.disabled=false;button.innerHTML='Confirmar pedido <span>→</span>';return;}
  }else{const t=totals(cart,shipping);result={code:`AV-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`,status:'demo',count:t.count,subtotal_cents:t.subtotal,delivery_cents:t.delivery,total_cents:t.total};}
  const order={id:result.code,status:result.status,date:new Date().toISOString(),payment,shipping,subtotal:result.subtotal_cents,delivery:result.delivery_cents,total:result.total_cents,count:result.count,items:cart.map(({id,name,color,size,qty,price,preview,design})=>({id,name,color,size,qty,price,...(preview?{preview,design}:{})}))};
  orders=[order,...orders].slice(0,12);
  try{localStorage.setItem(ORDERS_KEY,JSON.stringify(orders));}catch{toast('Pedido confirmado nesta sessão. O histórico não pôde ser salvo no navegador.');}
  cart=[];saveCart();profile=null;
  $('#checkout-content').innerHTML=`<div class="success"><span class="success-mark">✓</span><p class="eyebrow">${live?'PEDIDO REGISTRADO':'SIMULAÇÃO CONCLUÍDA'}</p><h3>Seu pedido ganhou forma.</h3><p>Pedido <span class="order-id">${esc(order.id)}</span><br>${money(order.total)} · ${esc(payment)}${live?'':' simulado'}</p><div class="demo-note">${live?'Guarde o código do pedido. Nenhum valor foi cobrado: o pagamento ainda não está integrado e o pedido fica como “aguardando pagamento”.':'Nenhuma cobrança foi feita. Este pedido não será produzido nem enviado.'}</div><button class="button button-blue" id="finish-order">Voltar à coleção <span>↗</span></button><p class="helper" style="margin-top:20px">O resumo está em “Meus pedidos”, no rodapé.</p></div>`;
  $('#finish-order').addEventListener('click',()=>{closeDialog($('#checkout-dialog'));location.hash='colecao';});
 });
 openDialog('#checkout-dialog');
}
async function submitOrder(data,shipping,payment){
 const items=[];
 for(const item of cart){
  if(item.id!=='custom'){items.push({kind:'catalog',product_id:item.id,size:item.size,qty:item.qty});continue;}
  const folder=crypto.randomUUID(),mode=customMode(item.design),design=JSON.parse(JSON.stringify(item.design||{}));
  const preview_path=await uploadDesign(`${folder}/preview.jpg`,dataURLToBlob(item.preview));
  let image_path=null;delete design.image;
  for(const p of design.prints||[]){delete p.image_path;if(!p.image)continue;p.image_path=await uploadDesign(`${crypto.randomUUID()}/art.webp`,dataURLToBlob(p.image));delete p.image;image_path??=p.image_path;}
  if(design.prints)design.image_paths=design.prints.map(p=>p.image_path||null);
  items.push({kind:mode==='brief'?'brief':'custom',base:item.base,size:item.size,qty:item.qty,design,preview_path,image_path});
 }
 return rpc('place_order',{p_customer:{name:data.get('name'),email:data.get('email'),cep:data.get('cep'),city:data.get('city'),address:data.get('address')},p_shipping:shipping,p_payment:payment,p_items:items});
}
const STATUS_LABEL={aguardando_pagamento:'Aguardando pagamento',pago:'Pagamento confirmado',em_producao:'Em produção',enviado:'Enviado',entregue:'Entregue',cancelado:'Cancelado'};
function orderRecordHTML(code,total,line,items){return `<article class="order-record"><strong>${esc(code)} · ${money(total)}</strong><p>${line}</p><ul>${items}</ul></article>`;}
function ordersHTML(){
 const list=orders.length?`<p>Histórico deste navegador.${online()?' Para ver o status atual, consulte pelo código e e-mail abaixo.':' Todos os pedidos são demonstrativos.'}</p>${orders.map(o=>orderRecordHTML(o.id,o.total,`${esc(new Date(o.date).toLocaleDateString('pt-BR'))} · ${esc(o.payment)}${o.status==='demo'?' simulado':''}`,o.items.map(i=>`<li>${esc(i.name)} · ${esc(i.color)} · ${esc(i.size)} × ${esc(i.qty)}${i.design?.brief?`<br><small>“${esc(i.design.brief)}”</small>`:i.design?.prints?`<br><small>${esc(printsSummary(i.design))}</small>`:''}</li>`).join(''))).join('')}`:'<div class="empty-state"><h3>Nenhum pedido por aqui.</h3><p>Finalize uma compra para ver seu histórico.</p></div>';
 const lookup=online()?'<form id="order-lookup" class="order-lookup"><h3>Consultar status</h3><div class="field-row"><label>Código<input name="code" required maxlength="24" placeholder="AV-XXXXXXXXXXX-XXXX" autocomplete="off"></label><label>E-mail do pedido<input name="email" type="email" required maxlength="120" autocomplete="email"></label></div><button type="submit" class="button button-blue">Consultar <span>→</span></button><div id="lookup-result" aria-live="polite"></div></form>':'';
 return list+lookup;
}
$('#view-orders').addEventListener('click',()=>{
 if(getUser()){showAccount();return;}
 showInfo('Meus pedidos',ordersHTML());
 $('#order-lookup')?.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,out=$('#lookup-result');if(!form.reportValidity())return;
  out.textContent='Consultando…';
  try{const o=await rpc('get_order',{p_code:new FormData(form).get('code'),p_email:new FormData(form).get('email')});
   out.innerHTML=o?orderRecordHTML(o.code,o.total_cents,`${esc(STATUS_LABEL[o.status]||o.status)} · ${esc(new Date(o.created_at).toLocaleDateString('pt-BR'))} · ${esc(o.payment)}`,(o.items||[]).map(i=>`<li>${esc(i.name)} · ${baseName(i.base)} · ${esc(i.size)} × ${esc(i.qty)}</li>`).join('')):'<p class="helper">Nenhum pedido encontrado com esse código e e-mail.</p>';
  }catch(error){out.innerHTML=`<p class="helper">${esc(error.message)}</p>`;}
 });
});
$('#open-help').addEventListener('click',()=>showInfo('Dúvidas frequentes','<h3>Esta loja já vende produtos?</h3><p>Estamos em pré-lançamento. Os pedidos são registrados de verdade, com código para acompanhamento, mas o pagamento ainda não está integrado: nenhum valor é cobrado por enquanto e a equipe entra em contato pelo e-mail informado.</p><h3>Como funciona a personalização?</h3><p>Escolha uma base branca ou preta, escreva seu texto e envie uma imagem PNG, JPG ou WebP. Ajuste tamanho, posição e rotação; no 3D, leve a estampa para as costas, mangas ou lateral e adicione até 4 estampas na mesma peça. A prévia acompanha a peça na sacola.</p><h3>E se eu não souber desenhar?</h3><p>No estúdio, escolha “Descrever a ideia” e conte como imagina a estampa: cores, estilo, frases, referências. A equipe cria a arte e envia a prévia para aprovação antes de produzir. A criação está incluída no preço da peça sob medida.</p><h3>Minha imagem é enviada para algum lugar?</h3><p>A prévia é montada no seu navegador. Só quando você confirma o pedido a prévia e a arte enviada são guardadas em um espaço privado da loja, ligadas ao seu pedido, para a produção. A sacola fica salva apenas neste dispositivo.</p><h3>Como funciona a entrega?</h3><p>Frete padrão de R$ 14,90, grátis a partir de R$ 250 em produtos, ou expresso de R$ 24,90. Prazos e valores de pré-lançamento.</p><h3>E as trocas?</h3><p>A política demonstrativa está em “Trocas e devoluções”, no rodapé: 30 dias para peças do catálogo, primeira troca de tamanho grátis, e personalizadas só por defeito. Os termos reais devem ser definidos antes de iniciar vendas.</p>'));

// All image processing stays in this browser. Preview and exported design share one renderer.
const canvas=$('#design-canvas'),ctx=canvas.getContext('2d');
const imageCache={};
function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível carregar a imagem.'));img.src=src;});}
function readAsDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Não foi possível ler esse arquivo. Escolha outra imagem.'));r.readAsDataURL(file);});}
let designReady=false;
// Estampas: até MAX_PRINTS por peça, editadas uma por vez; o formulário sempre mostra a estampa ativa.
// Cada estampa tem texto e/ou imagem, tamanho, rotação e um lugar: (x, y) na frente ou `place` em qualquer zona da peça.
const designDefaults={color:'white',garment:'',size:'M',brief:''};
const printDefaults={text:'DO MEU\nJEITO.',font:'condensed',ink:'#1737bc',scale:80,x:0,y:0,rotation:0,place:null,image:null,rev:0,placeholder:false};
// Lugares aproximados por zona para estampas novas (o 3D encaixa na superfície pela profundidade do projetor).
const ZONE_PLACES={back:{p:[0,CHEST_Y+.02,-.12],n:[0,0,-1],zone:'back'},'sleeve-left':{p:[.3,.55,.03],n:[.88,0,.47],zone:'sleeve-left'},'sleeve-right':{p:[-.3,.55,.03],n:[-.88,0,.47],zone:'sleeve-right'}};
let prints=[{...printDefaults}],activePrint=0;
const imgCache=new Map();
let designMode='create';
const zoneOfPrint=p=>isZone(p?.place?.zone)?p.place.zone:'front';
const zoneName=p=>PRINT_ZONES[zoneOfPrint(p)];
const zoneAt=p=>PRINT_ZONE_AT[zoneOfPrint(p)];
const isFilled=p=>Boolean(p.image||(p.text.trim()&&!p.placeholder));
// Nova estampa nasce na primeira zona livre: costas, manga esquerda, manga direita; senão na frente, mais abaixo.
function freePlace(){const used=new Set(prints.map(zoneOfPrint));for(const zone of ['back','sleeve-left','sleeve-right'])if(!used.has(zone))return {place:{...ZONE_PLACES[zone]}};return {place:null,y:used.has('front')?18:0};}
function setMode(mode){
 designMode=mode;
 $$('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 $('#create-fields').hidden=mode!=='create';$('#brief-fields').hidden=mode!=='brief';
 $('#custom-label').textContent=mode==='brief'?'Sua camiseta com estampa sob medida':'Sua camiseta personalizada';
 $('#custom-price').textContent=money(CUSTOM[mode].price);
 const base=8990;
 $('#custom-breakdown').textContent=`Camiseta base ${money(base)} + ${mode==='brief'?'criação da arte e estampa':'estampa'} ${money(CUSTOM[mode].price-base)}`;
 $('#custom-helper').textContent=mode==='brief'?'Criação da arte inclusa. Você aprova a prévia antes da produção.':'Personalização inclusa: frente, costas, mangas ou lateral, com até 4 estampas.';
 renderDesign();
}
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{setMode(b.dataset.mode);if(b.dataset.mode==='brief')$('#design-brief').focus();}));
$$('.starter').forEach(b=>b.addEventListener('click',()=>{$('#design-text').value=b.dataset.starter;prints[activePrint].placeholder=false;renderDesign();$('#design-text').focus();}));
function syncSwatches(){const ink=$('#design-ink').value.toLowerCase();$$('.swatch[data-ink]').forEach(b=>{const on=b.dataset.ink===ink;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});}
$$('.swatch[data-ink]').forEach(b=>b.addEventListener('click',()=>{$('#design-ink').value=b.dataset.ink;syncSwatches();renderDesign();}));
// Formulário ↔ estampa ativa.
function readPrintFields(){const p=prints[activePrint];p.text=$('#design-text').value;p.font=$('#design-font').value;p.ink=$('#design-ink').value;p.scale=Number($('#design-scale').value);if(!p.place){p.x=Number($('#design-x').value);p.y=Number($('#design-y').value);}p.rotation=Number($('#design-rotation').value);}
function writePrintFields(){
 const p=prints[activePrint];
 $('#design-text').value=p.text;$('#design-font').value=p.font;$('#design-ink').value=p.ink;$('#design-scale').value=p.scale;$('#design-x').value=p.x;$('#design-y').value=p.y;$('#design-rotation').value=p.rotation;
 syncSwatches();$('#design-upload').value='';$('#remove-upload').hidden=!p.image;$('#upload-status').textContent=p.image?'Imagem pronta nesta estampa.':'Use uma imagem sua ou que você tenha autorização para usar.';
}
// Abas: reconstruídas só quando a estrutura muda (foco e leitores de tela não perdem a aba ativa).
let tabsKey='';
function renderPrintTabs(){
 const box=$('#print-tabs'),actions=$('#print-actions');if(!box)return;
 const key=JSON.stringify([prints.map(zoneOfPrint),activePrint]);
 if(key===tabsKey)return;tabsKey=key;
 box.innerHTML=prints.map((p,i)=>`<button type="button" role="tab" class="print-tab" data-print="${i}" aria-selected="${i===activePrint}" tabindex="${i===activePrint?0:-1}">Estampa ${i+1}<small>${esc(zoneName(p))}</small></button>`).join('');
 actions.innerHTML=(prints.length<MAX_PRINTS?'<button type="button" class="print-tab print-add" id="add-print" title="Adicionar outra estampa (costas, mangas…)">＋ Outra estampa</button>':'')+(prints.length>1?`<button type="button" class="text-button" id="remove-print" aria-label="Remover estampa ${activePrint+1} (${esc(zoneName(prints[activePrint]))})">Remover esta</button>`:'');
}
function focusTab(){$(`#print-tabs [data-print="${activePrint}"]`)?.focus();}
function selectPrint(i,focus){if(!prints[i]||i===activePrint)return;readPrintFields();activePrint=i;writePrintFields();renderDesign();if(focus)focusTab();}
function addPrint(){
 if(prints.length>=MAX_PRINTS)return;readPrintFields();
 prints.push({...printDefaults,text:'SUA\nESTAMPA',placeholder:true,...freePlace()});
 activePrint=prints.length-1;writePrintFields();renderDesign();$('#design-text').focus();$('#design-text').select();
}
function removePrint(){if(prints.length<=1)return;prints.splice(activePrint,1);activePrint=Math.max(0,activePrint-1);writePrintFields();renderDesign();focusTab();}
// Usado pelo 3D e pelo seletor "Onde fica": altera uma estampa (ativa ou não) sem passar pelo formulário.
function updatePrint(i,patch){if(!prints[i])return;readPrintFields();Object.assign(prints[i],patch);if(i===activePrint)writePrintFields();renderDesign();}
$('#print-tabs')?.addEventListener('click',e=>{const tab=e.target.closest('[data-print]');if(tab)selectPrint(Number(tab.dataset.print),true);});
$('#print-tabs')?.addEventListener('keydown',e=>{
 const step={ArrowRight:1,ArrowLeft:-1,Home:-Infinity,End:Infinity}[e.key];if(step===undefined)return;
 e.preventDefault();const next=step===-Infinity?0:step===Infinity?prints.length-1:(activePrint+step+prints.length)%prints.length;selectPrint(next,true);
});
$('#print-actions')?.addEventListener('click',e=>{if(e.target.closest('#add-print'))addPrint();else if(e.target.closest('#remove-print'))removePrint();});
$$('#zone-buttons [data-place]').forEach(b=>b.addEventListener('click',()=>{const z=b.dataset.place;updatePrint(activePrint,z==='front'?{x:0,y:0,place:null}:{place:{...ZONE_PLACES[z]}});}));
function getDesign(){readPrintFields();return {mode:designMode,color:$('#design-color').value,garment:$('#design-garment').value,size:$('#design-size').value,brief:$('#design-brief').value.trim(),prints:prints.map(p=>({...p})),active:activePrint};}
const colorName=d=>d.garment?`cor personalizada ${d.garment}`:d.color==='white'?'branca':'preta';
const fontFamily={condensed:'"Barlow Condensed", Impact, sans-serif',sans:'Manrope, Arial, sans-serif',serif:'Georgia, serif'};
function ensureImages(d){for(const p of d.prints)if(p.image&&!imgCache.has(p.image)){imgCache.set(p.image,null);loadImage(p.image).then(img=>{imgCache.set(p.image,img);renderDesign();}).catch(()=>{});}}
// opts.export: desenho limpo para sacola/download (sem contorno de seleção, selo ou miniatura de UI).
function renderDesign(opts={}){
 const d=getDesign(),p=prints[activePrint],free=d.mode!=='brief'&&Boolean(p.place);
 $('#scale-output').textContent=`${p.scale}%`;$('#rotation-output').textContent=`${p.rotation}°`;
 $('#position-output').textContent=free?`${zoneAt(p)[0].toUpperCase()+zoneAt(p).slice(1)} · mova no 3D`:p.y===0?'Centro':p.y<0?'Mais acima':'Mais abaixo';
 $('#x-output').textContent=free?'Mova no 3D':p.x===0?'Centro':p.x<0?'Para a esquerda':'Para a direita';
 $('#design-x').disabled=$('#design-y').disabled=free;
 const zone=zoneOfPrint(p);$$('#zone-buttons [data-place]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.place===zone)));
 renderPrintTabs();ensureImages(d);
 if(!imageCache[d.color])return;
 ctx.clearRect(0,0,1000,1000);ctx.drawImage(imageCache[d.color],0,0,1000,1000);
 const elsewhere=[];let hasText=false;
 d.prints.forEach((q,i)=>{
  if(d.mode==='brief'&&i!==d.active)return;
  if(d.mode!=='brief'&&q.place&&q.place.zone!=='front'){elsewhere.push({i,q});return;}
  if(drawPrint(ctx,q,d,true,!opts.export&&d.prints.length>1&&i===d.active))hasText=true;
 });
 const summary=d.mode==='brief'?', área reservada para a estampa descrita':`${hasText?', com texto':''}${d.prints.some(q=>q.image)?', com imagem':''}${elsewhere.length?`, ${elsewhere.map(({i,q})=>`estampa ${i+1} ${zoneAt(q)}`).join(', ')}`:''}`;
 canvas.setAttribute('aria-label',`Prévia: camiseta ${colorName(d)}, tamanho ${d.size}${summary}`);
 document.dispatchEvent(new CustomEvent('duavesso:design',{detail:d}));
 if(d.garment && window.duavessoStudio.capturePreview && !window.duavessoStudio.is3DActive?.())ctx.drawImage(window.duavessoStudio.capturePreview(d),0,0,1000,1000);
 if(opts.export||!elsewhere.length)return;
 // Estampa ativa fora da frente: miniatura da arte com a zona; as demais só aparecem no selo.
 const activeAway=elsewhere.find(({i})=>i===d.active);
 if(activeAway)drawAwayInset(ctx,activeAway.q,d,`Estampa ${activeAway.i+1} · ${zoneAt(activeAway.q)}`);
 const rest=elsewhere.filter(({i})=>i!==d.active);
 if(rest.length)drawZoneBadge(ctx,rest.map(({i,q})=>`Estampa ${i+1} · ${zoneAt(q)}`),activeAway?700:1000);
}
function drawAwayInset(c,q,d,label){
 const w=300,h=356,x=1000-w-28,y=1000-h-28;
 c.save();c.fillStyle='rgba(255,255,255,.94)';c.strokeStyle='rgba(22,23,25,.18)';c.lineWidth=2;c.beginPath();c.roundRect(x,y,w,h,16);c.fill();c.stroke();
 c.save();c.beginPath();c.rect(x+12,y+12,w-24,h-70);c.clip();c.translate(x+w/2,y+12+(h-70)/2);c.scale(.82,.82);c.translate(-500,-500);drawPrint(c,q,d,false,false);c.restore();
 c.fillStyle='#161719';c.font=`700 19px ${fontFamily.sans}`;c.textAlign='center';c.textBaseline='middle';c.fillText(label.toUpperCase(),x+w/2,y+h-40,w-24);
 c.fillStyle='#64666e';c.font=`600 14px ${fontFamily.sans}`;c.fillText('MOVA NO 3D OU EM “ONDE FICA”',x+w/2,y+h-18,w-24);
 c.restore();
}
function drawZoneBadge(c,lines,right){
 c.save();c.font=`700 22px ${fontFamily.sans}`;c.textAlign='center';c.textBaseline='middle';
 const w=Math.max(...lines.map(l=>c.measureText(l.toUpperCase()).width))+56,h=lines.length*34+24,cx=right===1000?500:Math.min(500,(right-w)/2+w/2-40),x=cx-w/2,y=1000-h-28;
 c.fillStyle='rgba(22,23,25,.82)';c.beginPath();c.roundRect(x,y,w,h,14);c.fill();c.fillStyle='#fff';
 lines.forEach((l,i)=>c.fillText(l.toUpperCase(),cx,y+12+17+i*34));
 c.restore();
}
// Desenha uma estampa em um contexto 1000×1000. Com placed=true aplica posição/rotação/escala como na prévia;
// senão, centrada e sem transformação (textura do 3D). `selected` marca a estampa ativa quando há mais de uma.
function drawPrint(c,p,d,placed,selected){
 c.save();
 if(placed){const pos=p.place&&p.place.zone==='front'?{x:p.place.p[0]/UNIT,y:(CHEST_Y-p.place.p[1])/UNIT}:{x:p.x||0,y:p.y||0};c.translate(500+pos.x*3.3,485+pos.y*3.3);c.rotate(p.rotation*Math.PI/180);c.scale(p.scale/100,p.scale/100);}else c.translate(500,500);
 const width=300,height=330;
 if(d.mode==='brief'){drawBriefPlaceholder(c,d,width,height);c.restore();return false;}
 if(selected){c.save();c.strokeStyle='rgba(23,55,188,.6)';c.lineWidth=2.5;c.setLineDash([12,9]);c.strokeRect(-width/2-8,-height/2-8,width+16,height+16);c.restore();}
 c.beginPath();c.rect(-width/2,-height/2,width,height);c.clip();
 const img=p.image?imgCache.get(p.image):null;
 const hasText=(p.text||'').trim().length>0;
 let textTop=-height/2,textHeight=height;
 if(img){const available=hasText?height*.61:height;const fit=Math.min(width/img.width,available/img.height);const w=img.width*fit,h=img.height*fit;c.drawImage(img,-w/2,-height/2+(available-h)/2,w,h);if(hasText){textTop=-height/2+available+10;textHeight=height-available-10;}}
 if(hasText){
  const lines=p.text.split('\n');let fontSize=Math.min(100,textHeight/(lines.length*1.03));
  c.font=`800 ${fontSize}px ${fontFamily[p.font]||fontFamily.condensed}`;
  const widest=Math.max(...lines.map(line=>c.measureText(line).width));if(widest>width-8)fontSize*=(width-8)/widest;
  c.font=`800 ${fontSize}px ${fontFamily[p.font]||fontFamily.condensed}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle=p.placeholder?'rgba(100,102,110,.55)':p.ink;
  const spacing=fontSize*1.03,start=textTop+textHeight/2-(lines.length-1)*spacing/2;
  lines.forEach((line,i)=>c.fillText(line,0,start+i*spacing,width));
 }
 c.restore();return hasText;
}
window.duavessoStudio={getDesign,drawPrint:(c,p,d)=>drawPrint(c,p,d,false,false),ready:()=>readyDesign,updatePrint,selectPrint,MAX_PRINTS};
function drawBriefPlaceholder(ctx,d,width,height){
 const ink=d.color==='white'?'#1737bc':'#f7f8f9';
 ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.setLineDash([14,10]);ctx.strokeRect(-width/2,-height/2,width,height);ctx.setLineDash([]);
 for(const [x,y] of [[-width/2,-height/2],[width/2,-height/2],[-width/2,height/2],[width/2,height/2]]){ctx.fillStyle='#fff';ctx.fillRect(x-7,y-7,14,14);ctx.strokeRect(x-7,y-7,14,14);}
 ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.font=`800 48px ${fontFamily.condensed}`;ctx.fillText('SUA ESTAMPA',0,-32,width-20);ctx.fillText('SOB MEDIDA',0,18,width-20);
 ctx.font=`600 15px ${fontFamily.sans}`;ctx.fillText(d.brief?'A PARTIR DA SUA DESCRIÇÃO':'DESCREVA A IDEIA AO LADO',0,78,width-24);
}
const readyDesign=Promise.all([loadImage('assets/tee-white-1000.webp'),loadImage('assets/tee-black-1000.webp'),document.fonts.ready]).then(([white,black])=>{imageCache.white=white;imageCache.black=black;designReady=true;renderDesign();}).catch(()=>toast('Não foi possível carregar a base da camiseta. Atualize a página para tentar de novo.'));
$('#design-form').addEventListener('input',e=>{if(e.target.id==='design-brief')$('#brief-count').textContent=e.target.value.length;if(e.target.id==='design-ink')syncSwatches();if(e.target.id==='design-text')prints[activePrint].placeholder=false;if(e.target.id==='design-x'||e.target.id==='design-y')prints[activePrint].place=null;if(e.target.type!=='file')renderDesign();});
$('#design-form').addEventListener('change',e=>{if(e.target.type!=='file')renderDesign();});
$('#design-color').addEventListener('change',()=>{$('#design-garment').value='';});
function clearUpload(){const p=prints[activePrint];p.image=null;p.rev++;$('#design-upload').value='';$('#remove-upload').hidden=true;$('#upload-status').textContent='Use uma imagem sua ou que você tenha autorização para usar.';renderDesign();}
$('#remove-upload').addEventListener('click',clearUpload);
$('#design-upload').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 const p=prints[activePrint],generation=++p.rev;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){$('#upload-status').textContent='Escolha PNG, JPG ou WebP de até 5 MB.';e.target.value='';return;}
 $('#upload-status').textContent='Preparando sua imagem…';
 try{const url=await readAsDataURL(file);const original=await loadImage(url);if(original.width*original.height>40000000)throw new Error('Imagem muito grande. Use uma versão com até 40 megapixels.');const temp=document.createElement('canvas');const ratio=Math.min(1,700/Math.max(original.width,original.height));temp.width=Math.round(original.width*ratio);temp.height=Math.round(original.height*ratio);temp.getContext('2d').drawImage(original,0,0,temp.width,temp.height);const data=temp.toDataURL('image/webp',.85),image=await loadImage(data);if(generation!==p.rev)return;imgCache.set(data,image);p.image=data;if(p.placeholder){p.placeholder=false;p.text='';}if(prints[activePrint]===p){$('#design-text').value=p.text;$('#remove-upload').hidden=false;$('#upload-status').textContent=`${file.name} · imagem pronta`;}renderDesign();}catch(error){if(generation===p.rev){$('#upload-status').textContent=error.message||'Não foi possível ler esse arquivo. Escolha outra imagem.';}}
 finally{e.target.value='';}
});
$('#reset-design').addEventListener('click',()=>{for(const [key,value] of Object.entries(designDefaults))$(`#design-${key}`).value=value;$('#brief-count').textContent='0';prints=[{...printDefaults}];activePrint=0;writePrintFields();setMode('create');toast('Estúdio pronto para uma nova ideia.');});
// Prévia limpa para download e sacola: carrega o 3D quando há estampa fora da frente (para compor costas/mangas).
async function exportPreview(d){
 if(d.mode!=='brief'&&d.prints.some(p=>p.place&&p.place.zone!=='front')&&!window.duavessoStudio.capturePreview&&window.duavessoStudio.ensure3D){toast('Preparando a prévia das costas e mangas…');try{await window.duavessoStudio.ensure3D();}catch{}}
 renderDesign({export:true});
 const out=document.createElement('canvas');out.width=out.height=1000;out.getContext('2d').drawImage(window.duavessoStudio.capturePreview?.(d)||canvas,0,0,1000,1000);
 renderDesign();return out;
}
$('#download-design').addEventListener('click',async()=>{await readyDesign;if(!designReady)return;const source=await exportPreview(getDesign());source.toBlob(blob=>{if(!blob){toast('Não foi possível gerar a prévia. Tente novamente.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='duavesso-minha-camiseta.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');});
$('#design-form').addEventListener('submit',async e=>{
 e.preventDefault();await readyDesign;if(!designReady)return;
 const d=getDesign();
 if(d.mode==='brief'){if(d.brief.length<10){toast('Descreva sua ideia com pelo menos 10 caracteres para a equipe entender.');$('#design-brief').focus();return;}}
 else{
  const filled=d.prints.filter(isFilled),dropped=d.prints.map((p,i)=>isFilled(p)?null:`estampa ${i+1} (${zoneAt(p)})`).filter(Boolean);
  if(!filled.length){toast('Adicione um texto ou uma imagem à sua estampa.');$('#design-text').focus();return;}
  if(dropped.length)toast(`Sem texto ou imagem, ficou de fora: ${dropped.join(', ')}.`);
  d.prints=filled;
 }
 const source=await exportPreview(d),thumb=document.createElement('canvas');thumb.width=500;thumb.height=500;thumb.getContext('2d').drawImage(source,0,0,500,500);
 const design=d.mode==='brief'?{mode:'brief',color:d.color,garment:d.garment,size:d.size,brief:d.brief}:{mode:'create',color:d.color,garment:d.garment,size:d.size,prints:d.prints.map(({rev,placeholder,...p})=>p)};
 const item={id:'custom',key:`custom-${crypto.randomUUID()}`,name:CUSTOM[d.mode].name,category:'custom',base:d.color,color:garmentLabel(design),size:d.size,price:CUSTOM[d.mode].price,preview:thumb.toDataURL('image/jpeg',.85),design};
 try{cart=addItem(cart,item);saveCart();showCart();}catch(error){toast(error.message);}
});

const BRANDS=[
 {slug:'geek',name:'duavessogeek',theme:'geek',kicker:'games · pixel · sci-fi',logo:'<span class="brand-logo-word">duavesso</span><b class="brand-logo-tag">geek</b>',lead:'Cultura geek no avesso: games, pixel, sci-fi e as referências que só quem é do meio pega, no caimento oversized da duavesso.',art:{src:'geek-invader.svg',w:264,h:192},site:null,drops:[['&lt;3','Pixel Heart'],['1UP','Continue?'],['404','Not Found']]},
 {slug:'try84',name:'TRY84',theme:'rugby',kicker:'rugby lifestyle · forward together',logo:'<span class="brand-logo-word">TRY84</span>',lead:'Feita por jogadores. Rugby lifestyle em preto e branco, do treino ao terceiro tempo.',art:{src:'brand-try84.svg',w:280,h:180},site:'https://try84.com.br',hero:'try84-hero',collection:'A coleção',products:[{name:'TRYMAN',type:'Oversized Tee',price:'R$ 159,90',img:'try84-tryman',href:'https://try84.com.br/tryman-oversized-tee-62pk7'},{name:'STREET XV',type:'Oversized Tee',price:'R$ 159,90',img:'try84-street',href:'https://try84.com.br/street-xv-w8hgn'},{name:'JONAH LOMU',type:'Oversized Tee',price:'R$ 160,00',img:'try84-jonah',href:'https://try84.com.br/jonah-lomu-oversized-tee-ypjxy'},{name:'Oversized Tee · 001',type:'Preto',price:'R$ 137,94',img:'try84-t001',href:'https://try84.com.br/oversized-tee-001-ndp8q'},{name:'Oversized Tee · 002',type:'Off-white',price:'R$ 137,94',img:'try84-t002',href:'https://try84.com.br/oversized-tee-002-8dosx'}]},
 {slug:'solfado',name:'SolFáDó',theme:'music',kicker:'camisetas inspiradas na música',logo:'<span class="brand-logo-word">SolFáDó</span>',lead:'Música é a arte do som. Estampas inspiradas em hinos, para o 1º Encontro de Violeiros.',art:{src:'brand-solfado.svg',w:280,h:170},site:'https://solfado.com.br',collection:'Coleção 1º Encontro de Violeiros',collectionNote:'10 estampas · R$ 59,90 a R$ 99,90 · retirada no evento',products:[{name:'Ó Minha Flor',img:'solfado-flor'},{name:'Caquinho',img:'solfado-caquinho'},{name:'Pétalas de Rosa',img:'solfado-petalas'},{name:'Te Chamo de Ester',img:'solfado-ester'},{name:'Queria Ter Asas para Voar',img:'solfado-asas'},{name:'Violeiro de Guerra',img:'solfado-violeiro'},{name:'Somos Joias Preciosas',type:'Kids',img:'solfado-joias'},{name:'Brilha Mais e Mais',type:'Kids',img:'solfado-brilha'},{name:'Bênçãos e Bênçãos Deus Derramará',type:'Kids',img:'solfado-bencaos'},{name:'Eu Sou um Cordeirinho',type:'Kids',img:'solfado-cordeirinho'}]},
];
function brandCollection(brand){
 if(!brand.products)return `<div class="brand-drops"><div class="section-heading"><h2>Primeiros drops</h2><span class="brand-kicker">em produção</span></div><div class="brand-grid">${brand.drops.map(d=>`<div class="brand-drop"><span class="brand-drop-art">${d[0]}</span><span class="brand-drop-name">${d[1]}</span><span class="brand-drop-soon">EM BREVE</span></div>`).join('')}</div></div>`;
 const cards=brand.products.map(p=>`<a class="brand-prod"${p.href?` href="${p.href}"`:brand.site?` href="${brand.site}"`:''} target="_blank" rel="noopener">${p.img?`<div class="brand-prod-img"><picture><source type="image/webp" srcset="assets/${p.img}.webp"><img src="assets/${p.img}.jpg" alt="${esc(p.name)}" width="800" height="800" loading="lazy"></picture></div>`:`<div class="brand-prod-tile"><span>${esc(p.name)}</span></div>`}<div class="brand-prod-meta"><span class="brand-prod-name">${esc(p.name)}</span>${p.type?`<span class="brand-prod-type">${p.type}</span>`:''}${p.price?`<span class="brand-prod-price">${p.price}</span>`:''}</div></a>`).join('');
 return `<div class="brand-drops"><div class="section-heading"><h2>${brand.collection}</h2>${brand.collectionNote?`<span class="brand-kicker">${brand.collectionNote}</span>`:''}</div><div class="brand-prods">${cards}</div>${brand.site?`<a class="button button-blue brand-fullcol" href="${brand.site}" target="_blank" rel="noopener">Ver a coleção completa em ${brand.site.replace('https://','')} <span>↗</span></a>`:''}</div>`;
}
function renderMarcas(slug){
 const view=$('#marcas-view'),brand=BRANDS.find(b=>b.slug===slug);
 if(!brand){view.innerHTML=`<div class="editor-heading"><a href="#inicio" class="text-link">← Voltar</a><span class="eyebrow">MARCAS · A FAMÍLIA DUAVESSO</span></div><div class="marcas-intro"><h1>As linhas da duavesso.</h1><p>Sub-linhas com identidade própria e a mesma pegada: minimalismo e roupa que faz sentido pra você. Cada uma tem a sua página; a base oversized é a mesma.</p></div><div class="marcas-grid">${BRANDS.map(b=>`<a class="brand-card" data-theme="${b.theme}" href="#marca-${b.slug}"><span class="brand-kicker">${b.kicker}</span><span class="brand-logo">${b.logo}</span><p>${b.lead}</p><span class="brand-ver">Ver a linha <span aria-hidden="true">↗</span></span></a>`).join('')}</div>`;return;}
 const notify=brand.products?'':`<form class="brand-notify"><label>Avise-me quando a ${brand.name} lançar.</label><div class="brand-notify-row"><input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><input type="email" name="email" placeholder="seu@email.com" required maxlength="120" autocomplete="off"><button type="submit" class="button button-blue">Quero</button></div></form>`;
 const hero=brand.hero?`<div class="brand-banner"><picture><source type="image/webp" srcset="assets/${brand.hero}.webp"><img src="assets/${brand.hero}.jpg" alt="${brand.name} · ${brand.kicker}" width="2172" height="724" fetchpriority="high"></picture></div><div class="brand-bannercta"><a href="#colecao" class="button button-blue">Ver a base oversized <span>↗</span></a>${brand.site?`<a class="brand-bannerlink" href="${brand.site}" target="_blank" rel="noopener">${brand.site.replace('https://','')} <span aria-hidden="true">↗</span></a>`:''}</div>`:`<div class="brand-hero"><div class="brand-hero-copy"><span class="brand-kicker">${brand.kicker}</span><div class="brand-logo">${brand.logo}${brand.theme==='geek'?'<span class="brand-cursor" aria-hidden="true"></span>':''}</div><p class="brand-lead">${brand.lead}</p><div class="brand-cta"><a href="#colecao" class="button button-blue">Ver a base oversized <span>↗</span></a>${brand.site?`<a class="brand-site" href="${brand.site}" target="_blank" rel="noopener">${brand.site.replace('https://','')} ↗</a>`:''}${brand.products?'':'<span class="brand-soon">drops: <b>em breve</b></span>'}</div></div><div class="brand-hero-art"><img src="assets/${brand.art.src}" alt="" width="${brand.art.w}" height="${brand.art.h}" loading="lazy"></div></div>`;
 view.innerHTML=`<div class="editor-heading"><a href="#marcas" class="text-link">← Todas as marcas</a><span class="eyebrow">MARCAS · ${brand.name}</span></div><article class="brand" data-theme="${brand.theme}">${hero}${brandCollection(brand)}${notify}</article>`;
}
function route(){
 const hash=location.hash||'#inicio',studio=hash==='#estudio',marcas=hash==='#marcas'||hash.startsWith('#marca-');
 $('#shop-view').hidden=studio||marcas;$('#studio-view').hidden=!studio;$('#marcas-view').hidden=!marcas;document.documentElement.classList.toggle('studio',studio);
 if(marcas)renderMarcas(hash.startsWith('#marca-')?hash.slice(7):null);
 document.title=studio?'Crie sua camiseta personalizada · duavesso Studio':marcas?'Marcas · duavesso':'duavesso · Camisetas oversized e estampas personalizadas';
 if(hash.startsWith('#produto-'))showProduct(hash.slice(9));
 if(studio){window.scrollTo({top:0,behavior:'instant'});renderDesign();}
 else if(marcas)window.scrollTo({top:0,behavior:'instant'});
 else if(['#inicio','#colecao','#sobre'].includes(hash))requestAnimationFrame(()=>$(hash).scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
}
window.addEventListener('hashchange',route);
$('#product-dialog').addEventListener('close',()=>{if(location.hash.startsWith('#produto-'))history.replaceState(null,'','#colecao');});
window.addEventListener('storage',e=>{if(e.key===CART_KEY){cart=normalizeCart(readStored(CART_KEY,[]));updateCartCount();if($('#cart-dialog').open)renderCart();if($('#checkout-dialog').open){closeDialog($('#checkout-dialog'));toast('A sacola mudou em outra aba. Confira os itens antes de finalizar.');}}});
updateCartCount();route();cookieBanner();

// Contas ------------------------------------------------------------------------
let profile=null;
const firstName=user=>(user?.name||user?.email||'').split(/[\s@]/)[0];
function renderAuthState(){
 const user=getUser();
 $('#open-auth').hidden=!!user;$('#open-account').hidden=!user;
 if(user)$('#open-account').textContent=`Olá, ${firstName(user)}`;
 $('#mobile-account').textContent=user?'Minha conta':'Entrar';
}
window.addEventListener('duavesso:auth',()=>{profile=null;renderAuthState();});
function setAuthStatus(message,kind=''){const el=$('#auth-status');el.textContent=message;el.className=`auth-status ${kind}`;}
function showAuthTab(tab){
 $$('[data-auth-tab]').forEach(b=>{const on=b.dataset.authTab===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
 $('#login-form').hidden=tab!=='login';$('#signup-form').hidden=tab!=='signup';$('#password-form').hidden=tab!=='password';
 $('.auth-tabs').hidden=tab==='password';$('#google-signin').hidden=tab==='password';$('.auth-divider').hidden=tab==='password';
 $('#auth-title').textContent=tab==='signup'?'Criar conta':tab==='password'?'Nova senha':'Entrar';
 setAuthStatus('');
}
function openAuth(tab='login'){if(!online()){toast('Contas indisponíveis no modo offline.');return;}showAuthTab(tab);openDialog('#auth-dialog');setTimeout(()=>$(`#${tab}-form input`)?.focus(),50);}
$('#open-auth').addEventListener('click',()=>openAuth('login'));
$('#mobile-account').addEventListener('click',()=>{$('#mobile-menu').hidden=true;getUser()?showAccount():openAuth('login');});
$$('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>showAuthTab(b.dataset.authTab)));
async function busy(form,work){
 const button=$('button[type=submit]',form);button.disabled=true;
 try{await work();}catch(error){setAuthStatus(error.message,'error');}finally{button.disabled=false;}
}
$('#login-form').addEventListener('submit',e=>{
 e.preventDefault();const form=e.target;if(!form.reportValidity())return;
 busy(form,async()=>{const user=await signIn(form.elements.namedItem('email').value.trim(),form.elements.namedItem('password').value);form.reset();closeDialog($('#auth-dialog'));toast(`Bem-vindo de volta, ${firstName(user)}.`);});
});
$('#signup-form').addEventListener('submit',e=>{
 e.preventDefault();const form=e.target;if(!form.reportValidity())return;
 busy(form,async()=>{const result=await signUp(form.elements.namedItem('email').value.trim(),form.elements.namedItem('password').value,form.elements.namedItem('name').value.trim());form.reset();if(result.confirmed){closeDialog($('#auth-dialog'));toast('Conta criada. Bem-vindo à duavesso.');}else setAuthStatus('Conta criada! Enviamos um e-mail de confirmação. Abra o link para ativar e depois entre aqui.','ok');});
});
$('#forgot-password').addEventListener('click',async()=>{
 const email=$('#login-form input[name=email]').value.trim();
 if(!email){setAuthStatus('Digite seu e-mail acima e clique de novo em “Esqueci minha senha”.','error');$('#login-form input[name=email]').focus();return;}
 try{await resetPassword(email);setAuthStatus('Se existir conta com este e-mail, você recebe um link para criar uma nova senha.','ok');}catch(error){setAuthStatus(error.message,'error');}
});
$('#password-form').addEventListener('submit',e=>{
 e.preventDefault();const form=e.target;if(!form.reportValidity())return;
 busy(form,async()=>{await updatePassword(form.elements.namedItem('password').value);form.reset();closeDialog($('#auth-dialog'));toast('Senha atualizada.');});
});
$('#google-signin').addEventListener('click',()=>{setAuthStatus('Redirecionando para o Google…');signInWithGoogle().catch(error=>setAuthStatus(error.message,'error'));});

const ORDER_STATUS={aguardando_pagamento:'Aguardando pagamento',pago:'Pagamento confirmado',em_producao:'Em produção',enviado:'Enviado',entregue:'Entregue',cancelado:'Cancelado'};
async function loadProfile(){if(profile||!getUser())return profile;try{profile=await fetchProfile();}catch{profile=null;}return profile;}
const UF_LIST=[['AC','Acre'],['AL','Alagoas'],['AP','Amapá'],['AM','Amazonas'],['BA','Bahia'],['CE','Ceará'],['DF','Distrito Federal'],['ES','Espírito Santo'],['GO','Goiás'],['MA','Maranhão'],['MT','Mato Grosso'],['MS','Mato Grosso do Sul'],['MG','Minas Gerais'],['PA','Pará'],['PB','Paraíba'],['PR','Paraná'],['PE','Pernambuco'],['PI','Piauí'],['RJ','Rio de Janeiro'],['RN','Rio Grande do Norte'],['RS','Rio Grande do Sul'],['RO','Rondônia'],['RR','Roraima'],['SC','Santa Catarina'],['SP','São Paulo'],['SE','Sergipe'],['TO','Tocantins']];
function shipLabel(s){return s==='express'?'Frete expresso':'Frete padrão';}
function orderCardHTML(o){
 const items=(o.order_items||[]).map(i=>`<li><span class="oi-name">${esc(i.name)}</span><span class="oi-meta">${baseName(i.base)} · Tam ${esc(i.size)} · ${esc(i.qty)}×</span><span class="oi-price">${money((i.unit_price_cents||0)*i.qty)}</span></li>`).join('');
 const st=o.status||'';
 return `<article class="order-card"><div class="order-card-top"><div class="order-code-wrap"><span class="order-code">${esc(o.code)}</span><span class="order-date">${esc(new Date(o.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}))}</span></div><span class="status-badge status-${esc(st)}">${esc(ORDER_STATUS[st]||st)}</span></div><ul class="order-items">${items}</ul><div class="order-card-foot"><span class="order-ship">${esc(shipLabel(o.shipping))} · ${esc(o.payment)}</span><span class="order-total">Total <strong>${money(o.total_cents)}</strong></span></div></article>`;
}
function maskCEP(s){return s.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');}
function maskCPF(s){return s.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');}
function maskPhone(s){s=s.replace(/\D/g,'').slice(0,11);if(s.length<=10)return s.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2');return s.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2');}
function validCPF(cpf){cpf=cpf.replace(/\D/g,'');if(cpf.length!==11||/^(\d)\1{10}$/.test(cpf))return false;let s=0;for(let i=0;i<9;i++)s+=+cpf[i]*(10-i);let d=11-s%11;if(d>=10)d=0;if(d!==+cpf[9])return false;s=0;for(let i=0;i<10;i++)s+=+cpf[i]*(11-i);d=11-s%11;if(d>=10)d=0;return d===+cpf[10];}
function resizeAvatar(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const size=200,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);resolve(c.toDataURL('image/webp',.82));};img.onerror=()=>reject(new Error('Não foi possível ler essa imagem.'));img.src=src;});}
async function loadCities(uf,cityInput,keep){
 const dl=$('#duavesso-cities');if(dl)dl.innerHTML='';
 cityInput.disabled=false;if(!keep)cityInput.value='';
 if(!uf)return;
 try{const res=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);if(!res.ok)return;const cities=await res.json();if(dl)dl.innerHTML=cities.map(c=>`<option value="${esc(c.nome)}"></option>`).join('');}catch{}
}
async function cepLookup(cep,fields){
 const digits=cep.replace(/\D/g,'');if(digits.length!==8)return;
 fields.status.textContent='Buscando endereço…';
 try{const res=await fetch(`https://viacep.com.br/ws/${digits}/json/`);if(!res.ok)throw 0;const d=await res.json();if(d.erro){fields.status.textContent='CEP não encontrado.';return;}
  if(d.uf){fields.state.value=d.uf;await loadCities(d.uf,fields.city,false);}
  if(d.localidade)fields.city.value=d.localidade;
  if(d.logradouro&&!fields.address.value.trim())fields.address.value=d.logradouro;
  fields.status.textContent='Endereço preenchido pelo CEP.';fields.address.focus();
 }catch{fields.status.textContent='Não foi possível buscar o CEP agora. Preencha manualmente.';}
}
function avatarInner(p,user){return p&&p.avatar?`<img src="${esc(p.avatar)}" alt="Sua foto de perfil">`:esc((user.name||user.email||'?').trim().charAt(0).toUpperCase());}
async function showAccount(tab){
 const user=getUser();if(!user){openAuth('login');return;}
 $('#account-content').innerHTML='<p class="helper">Carregando sua conta…</p>';openDialog('#account-dialog');
 let orders=[],p=null;
 try{[orders,p]=await Promise.all([fetchMyOrders(),loadProfile()]);}catch(error){$('#account-content').innerHTML=`<p class="helper">${esc(error.message)}</p>`;return;}
 let avatarData=p?.avatar||'';
 const ordersPanel=orders.length?`<div class="order-list">${orders.map(orderCardHTML).join('')}</div>`:'<div class="empty-state"><h3>Nenhum pedido ainda.</h3><p>Quando você comprar logado, seus pedidos aparecem aqui com o status atualizado.</p><button class="button button-blue" id="empty-shop">Ver a coleção <span>↗</span></button></div>';
 const cityEnabled=!!(p?.state||p?.city);
 const profilePanel=`<form id="profile-form" class="profile-form" novalidate>
  <div class="avatar-field"><div class="avatar-preview" id="avatar-preview">${avatarInner(p,user)}</div><div class="avatar-actions"><label class="text-button avatar-upload" for="avatar-input">${p?.avatar?'Trocar foto':'Enviar foto'}</label><input id="avatar-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="text-button" id="avatar-remove"${p?.avatar?'':' hidden'}>Remover</button><p class="helper" id="avatar-status">Foto opcional · JPG, PNG ou WebP · até 5 MB</p></div></div>
  <p class="panel-note">Seus dados ficam só com você e preenchem o checkout automaticamente.</p>
  <label>Nome completo<input name="name" maxlength="80" value="${esc(p?.name||'')}" autocomplete="name" placeholder="Como no documento"></label>
  <div class="field-row"><label>Telefone<input name="phone" inputmode="tel" maxlength="16" value="${esc(p?.phone?maskPhone(p.phone):'')}" autocomplete="tel" placeholder="(00) 00000-0000"></label><label>CPF<input name="cpf" inputmode="numeric" maxlength="14" value="${esc(p?.cpf?maskCPF(p.cpf):'')}" autocomplete="off" placeholder="000.000.000-00"></label></div>
  <div class="field-row"><label>CEP<input name="cep" inputmode="numeric" maxlength="9" value="${esc(p?.cep||'')}" autocomplete="postal-code" placeholder="00000-000"></label><label>País<select name="country"><option value="BR"${(p?.country||'BR')==='BR'?' selected':''}>Brasil</option></select></label></div>
  <div class="field-row"><label>Estado<select name="state"><option value="">Selecione…</option>${UF_LIST.map(([s,n])=>`<option value="${s}"${p?.state===s?' selected':''}>${esc(n)}</option>`).join('')}</select></label><label>Cidade<input name="city" list="duavesso-cities" maxlength="80" value="${esc(p?.city||'')}" autocomplete="address-level2" placeholder="${cityEnabled?'Sua cidade':'Escolha o estado primeiro'}"${cityEnabled?'':' disabled'}><datalist id="duavesso-cities"></datalist></label></div>
  <label>Endereço e número<input name="address" maxlength="160" value="${esc(p?.address||'')}" autocomplete="street-address" placeholder="Rua, número, complemento"></label>
  <div class="profile-actions"><button type="submit" class="button button-blue">Salvar dados <span>→</span></button>${user.provider==='google'?'':'<button type="button" class="text-button" id="change-password">Trocar senha</button>'}</div>
 </form>`;
 $('#account-content').innerHTML=`<header class="account-id"><span class="account-avatar" aria-hidden="true">${avatarInner(p,user)}</span><div class="account-id-text"><strong>${esc(user.name||firstName(user))}</strong><p>${esc(user.email)}${user.provider==='google'?' · <span class="provider-badge">Google</span>':''}</p></div><button class="account-signout" id="sign-out">Sair</button></header><nav class="account-tabs" role="tablist" aria-label="Seções da conta"><button type="button" role="tab" class="account-tab" data-acc-tab="orders" aria-selected="true">Pedidos${orders.length?`<span class="tab-count">${orders.length}</span>`:''}</button><button type="button" role="tab" class="account-tab" data-acc-tab="profile" aria-selected="false">Perfil</button></nav><section class="account-panel" data-acc-panel="orders">${ordersPanel}</section><section class="account-panel" data-acc-panel="profile" hidden>${profilePanel}</section>`;
 const accTabs=$$('.account-tab');
 accTabs.forEach(t=>t.addEventListener('click',()=>{accTabs.forEach(x=>x.setAttribute('aria-selected',String(x===t)));$$('.account-panel').forEach(pl=>{pl.hidden=pl.dataset.accPanel!==t.dataset.accTab;});}));
 if(tab==='profile')$('.account-tab[data-acc-tab="profile"]')?.click();
 $('#empty-shop')?.addEventListener('click',()=>{closeDialog($('#account-dialog'));location.hash='#colecao';});
 $('#sign-out').addEventListener('click',async()=>{await signOut();closeDialog($('#account-dialog'));toast('Você saiu da sua conta.');});
 $('#change-password')?.addEventListener('click',()=>{closeDialog($('#account-dialog'));openAuth('password');});
 const form=$('#profile-form'),el=n=>form.elements.namedItem(n);
 const stateEl=el('state'),cityEl=el('city'),addressEl=el('address'),cepEl=el('cep'),statusEl=$('#avatar-status');
 if(p?.state)loadCities(p.state,cityEl,true);
 stateEl.addEventListener('change',()=>loadCities(stateEl.value,cityEl,false));
 cepEl.addEventListener('input',()=>{cepEl.value=maskCEP(cepEl.value);if(cepEl.value.replace(/\D/g,'').length===8)cepLookup(cepEl.value,{state:stateEl,city:cityEl,address:addressEl,status:statusEl});});
 el('cpf').addEventListener('input',e=>e.target.value=maskCPF(e.target.value));
 el('phone').addEventListener('input',e=>e.target.value=maskPhone(e.target.value));
 const setAvatar=data=>{avatarData=data;const inner=data?`<img src="${esc(data)}" alt="Sua foto de perfil">`:esc((user.name||user.email||'?').trim().charAt(0).toUpperCase());$('#avatar-preview').innerHTML=inner;$('.account-avatar').innerHTML=inner;$('#avatar-remove').hidden=!data;$('.avatar-upload').textContent=data?'Trocar foto':'Enviar foto';};
 $('#avatar-input').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){statusEl.textContent='Escolha JPG, PNG ou WebP de até 5 MB.';e.target.value='';return;}statusEl.textContent='Preparando foto…';try{const data=await resizeAvatar(await readAsDataURL(file));setAvatar(data);statusEl.textContent='Foto pronta. Salve para confirmar.';}catch(err){statusEl.textContent=err.message;}e.target.value='';});
 $('#avatar-remove').addEventListener('click',()=>{setAvatar('');statusEl.textContent='Foto removida. Salve para confirmar.';});
 form.addEventListener('submit',e=>{
  e.preventDefault();
  const cpfDigits=el('cpf').value.replace(/\D/g,''),phoneDigits=el('phone').value.replace(/\D/g,''),cepDigits=cepEl.value.replace(/\D/g,'');
  if(cepDigits&&cepDigits.length!==8){toast('CEP incompleto.');return;}
  if(phoneDigits&&phoneDigits.length<10){toast('Telefone incompleto.');return;}
  if(cpfDigits&&!validCPF(cpfDigits)){toast('CPF inválido. Confira os números.');return;}
  busyToast(form,async()=>{
   const data={name:el('name').value.trim(),cep:cepEl.value.trim(),country:el('country').value||'BR',state:stateEl.value||null,city:cityEl.value.trim(),address:addressEl.value.trim(),phone:phoneDigits||null,cpf:cpfDigits||null,avatar:avatarData||null};
   await updateProfile(data);profile={...profile,...data};renderAuthState();toast('Perfil salvo.');
  });
 });
}
async function busyToast(form,work){const button=$('button[type=submit]',form);button.disabled=true;try{await work();}catch(error){toast(error.message);}finally{button.disabled=false;}}
$('#open-account').addEventListener('click',showAccount);

handleAuthRedirect().then(outcome=>{
 renderAuthState();
 if(!outcome)return;
 if(outcome.type==='recovery')openAuth('password');
 else if(outcome.type==='signed_in')toast(`Bem-vindo, ${firstName(getUser())}.`);
 else if(outcome.type==='error')toast(outcome.message);
}).catch(()=>renderAuthState());

// Optional imperative WebMCP surface. Uses the same cart actions as the interface.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
 register({name:'read_duavesso_catalog_and_cart',title:'Ver catálogo e sacola',description:'Consulta produtos, tamanhos e sacola atual.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Informe um objeto vazio.');return {products:PRODUCTS.map(({id,name,price,color})=>({id,name,priceCents:price,color,sizes:SIZES})),cart:cart.map(({name,size,qty,price})=>({name,size,qty,priceCents:price})),totals:totals(cart)};}});
 register({name:'add_duavesso_catalog_item_to_cart',title:'Adicionar camiseta à sacola',description:'Adiciona uma unidade de um produto do catálogo à sacola local; não finaliza a compra.',inputSchema:{type:'object',properties:{productId:{type:'string',enum:PRODUCTS.map(p=>p.id)},size:{type:'string',enum:SIZES}},required:['productId','size'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['productId','size'].includes(k)))throw new Error('Parâmetros inválidos.');if(!addCatalogItem(input.productId,input.size))throw new Error('Item não adicionado. Verifique os limites da sacola.');showCart();return {added:true,...totals(cart)};}});
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
