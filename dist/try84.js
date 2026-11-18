// TRY84: site exclusivo da marca (serviço "site personalizado" da duavesso), na Edição Esporte.
// A coleção vem de dist/brands.js (a mesma lista da página da marca no marketplace). As peças da TRY84 não
// são vendidas pelo checkout da duavesso: o pedido vai direto para a marca pelo WhatsApp, com a peça e o
// tamanho já escritos na mensagem. A lista do "terceiro tempo" usa a newsletter da duavesso.
import {BRANDS} from './brands.js';
import {rpc,fetchBrand} from './api.js';

const BRAND='try84';
// Canais de pedido da marca (os do aviso "Pedidos e atendimento" do Instagram da TRY84). Troque aqui se mudar.
const WHATSAPP=[{label:'(84) 99864-9692',number:'5584998649692'},{label:'(19) 99866-8977',number:'5519998668977'}];
const SIZES=['P','M','G','GG','XG'];
// Texto de cada peça na janela de detalhe (pelo nome da imagem, que é fixo)
const DESC={
 'try84-tryman':'O try em câmera lenta: o mergulho, a bola no chão e o nome que todo jogador quer carregar nas costas.',
 'try84-street':'Rugby lifestyle no muro da rua. Traço de spray, o garoto de camisa TRY84 e a assinatura da marca.',
 'try84-jonah':'Homenagem a quem mudou o jogo. Retrato em preto e branco, tipografia TRY84 e ficha técnica nas costas.',
 'try84-t001':'A básica do vestiário. Preta, oversized, com a marca discreta para usar do treino ao terceiro tempo.',
 'try84-t002':'A mesma base, em off-white. Limpa, encorpada e com a assinatura TRY84.'
};

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brand=BRANDS.find(b=>b.slug===BRAND);
const items=brand?.products||[];
const pic=(name,alt,sizes,lazy=true)=>`<picture><source type="image/webp" srcset="assets/${name}.webp"><img src="assets/${name}.jpg" alt="${esc(alt)}" width="800" height="800" sizes="${sizes}" decoding="async"${lazy?' loading="lazy"':''}></picture>`;
const waLink=(n,text)=>`https://wa.me/${n}?text=${encodeURIComponent(text)}`;

let toastTimer;
function toast(msg){const t=$('#ty-toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('on'),3600);}

// Entradas suaves conforme a página desce (o que já está na tela aparece na hora)
const io='IntersectionObserver' in window&&!still()?new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.remove('pre');en.target.classList.add('in');io.unobserve(en.target);}}),{rootMargin:'0px 0px -8% 0px'}):null;
function reveal(els){els.forEach((el,i)=>{el.style.setProperty('--i',i%6);if(!io){el.classList.add('in');return;}if(el.getBoundingClientRect().top<innerHeight*.92){el.classList.add('in');return;}el.classList.add('pre');io.observe(el);});}

// Coleção --------------------------------------------------------------------------------------------------
$('#ty-grid').innerHTML=items.map((p,i)=>`<article class="ty-card"><button type="button" class="ty-shot" data-quick="${i}" aria-label="Ver ${esc(p.name)}">${pic(p.img,`${p.name}, ${p.type}`,'(max-width:1000px) 50vw, 33vw')}<span class="ty-view">Escolher tamanho</span></button>
<div class="ty-card-info"><div><h3>${esc(p.name)}</h3><small>${esc(p.type)}</small></div><span class="ty-price">${esc(p.price)}</span></div></article>`).join('');
reveal($$('.ty-card'));

// Janela da peça: tamanho e pedido pelo WhatsApp com a mensagem pronta
function openQuick(i){
 const p=items[i];if(!p)return;let size=null;
 const body=$('#ty-quick-body'),d=$('#ty-quick');
 const paint=()=>{
  const msg=`Oi, TRY84! Vi no site e quero a ${p.name} (${p.type})${size?`, tamanho ${size}`:''}. Ainda tem?`;
  body.innerHTML=`<button type="button" class="ty-icon ty-q-close" data-close aria-label="Fechar">×</button>
<div class="ty-q-img">${pic(p.img,`${p.name}, ${p.type}`,'(max-width:1000px) 94vw, 50vw',false)}</div>
<div class="ty-q-info"><p class="ty-q-type">${esc(p.type)}</p><h2 id="ty-q-name">${esc(p.name)}</h2><p class="ty-q-price">${esc(p.price)}</p>
<p class="ty-q-desc">${esc(DESC[p.img]||'Camiseta oversized TRY84, com estampa em preto e branco.')}</p>
<div><p class="ty-q-label">Tamanho${size?`: <b>${size}</b>`:''}</p><div class="ty-sizes" role="group" aria-label="Tamanho">${SIZES.map(s=>`<button type="button" data-size="${s}" aria-pressed="${s===size}">${s}</button>`).join('')}</div></div>
${size?`<a class="ty-btn ty-btn-dark" id="ty-order" href="${waLink(WHATSAPP[0].number,msg)}" target="_blank" rel="noopener">Pedir pelo WhatsApp</a>`:'<button type="button" class="ty-btn ty-btn-dark" disabled>Escolha um tamanho</button>'}
<p class="ty-q-note">O pedido é feito direto com a TRY84, que confirma tamanho, prazo e pagamento. Também atende pelo ${WHATSAPP.slice(1).map(w=>`<a href="${waLink(w.number,msg)}" target="_blank" rel="noopener">${esc(w.label)}</a>`).join(' e ')||'Instagram'}.</p></div>`;
 };
 body.onclick=e=>{const s=e.target.closest('[data-size]');if(s){size=s.dataset.size;paint();$('#ty-order',body)?.focus();}};
 paint();
 if(!d.open)d.showModal();document.documentElement.classList.add('ty-lock');
}
function closeQuick(){const d=$('#ty-quick');if(!d.open)return;if(still()){d.close();return;}d.classList.add('closing');setTimeout(()=>{d.classList.remove('closing');d.close();},220);}
$('#ty-grid').addEventListener('click',e=>{const q=e.target.closest('[data-quick]');if(q)openQuick(+q.dataset.quick);});
$('#ty-quick').addEventListener('click',e=>{if(e.target===e.currentTarget||e.target.closest('[data-close]'))closeQuick();if(e.target.closest('#ty-order'))setTimeout(()=>toast('Abrindo o WhatsApp da TRY84 com o seu pedido.'),50);});
$('#ty-quick').addEventListener('cancel',e=>{e.preventDefault();closeQuick();});
$('#ty-quick').addEventListener('close',()=>document.documentElement.classList.remove('ty-lock'));

// Menu ganha uma borda quando a página desce
addEventListener('scroll',()=>$('#ty-nav').classList.toggle('scrolled',scrollY>24),{passive:true});

// Novidades: lista de e-mails (a mesma newsletter da duavesso)
$('#ty-news').addEventListener('submit',async e=>{
 e.preventDefault();const f=e.target,out=$('#ty-news-out'),email=f.elements.email;
 if(f.elements.website.value){f.reset();return;}
 if(!email.checkValidity()){out.textContent='Digite um e-mail válido, como nome@email.com';out.className='ty-news-out err';email.focus();return;}
 out.className='ty-news-out';out.textContent='Enviando…';
 try{await rpc('subscribe_newsletter',{p_email:email.value.trim()});out.textContent=`Pronto! Avisamos ${email.value.trim()} no próximo drop.`;f.reset();}
 catch(err){out.className='ty-news-out err';out.textContent=err.message;}
});

// Instagram da marca, quando cadastrado no painel
fetchBrand(BRAND).then(b=>{const ig=b?.links?.instagram;if(ig&&/^[A-Za-z0-9._]{1,30}$/.test(ig))$('#ty-social').innerHTML=`<a href="https://instagram.com/${ig}" target="_blank" rel="noopener">Instagram @${esc(ig)}</a>`;});
