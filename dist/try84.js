// TRY84: site exclusivo da marca na duavesso (Edição Esporte).
// As peças da TRY84 não passam pelo checkout da duavesso: o pedido vai direto para a marca pelo WhatsApp,
// com a peça e o tamanho já escritos na mensagem. A lista de espera usa a newsletter da duavesso.
import {rpc,fetchBrand} from './api.js';

const BRAND='try84';
// Canais de pedido da marca (os do aviso "Pedidos e atendimento" do Instagram da TRY84). Troque aqui se mudar.
const WHATSAPP=[{label:'(84) 99864-9692',number:'5584998649692'},{label:'(19) 99866-8977',number:'5519998668977'}];
const SIZES=['P','M','G','GG','XG'];
// Peças da Coleção 01 (a foto é assets/try84-<chave>.webp)
const PIECES={
 jonah:{name:'Jonah Lomu',price:'R$ 160,00',color:'Verde militar',desc:'Homenagem a quem mudou o jogo. Retrato em preto e branco, tipografia TRY84 e ficha técnica nas costas.'},
 street:{name:'Street XV',price:'R$ 159,90',color:'Marrom',desc:'Rugby lifestyle no muro da rua. Traço de spray, o garoto de camisa TRY84 e a assinatura da marca.'},
 tryman:{name:'Tryman',price:'R$ 159,90',color:'Preta',desc:'O try em câmera lenta: o mergulho, a bola no chão e o nome que todo jogador quer carregar nas costas.'},
 t001:{name:'Tee 001',price:'R$ 137,94',color:'Preta',desc:'A básica do vestiário. Preta, oversized, com a marca discreta para usar do treino ao terceiro tempo.'},
 t002:{name:'Tee 002',price:'R$ 137,94',color:'Off-white',desc:'A mesma base, em off-white. Limpa, encorpada e com a assinatura T84 Club.'}
};

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wa=(n,text)=>`https://wa.me/${n}?text=${encodeURIComponent(text)}`;
let toastTimer;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('on'),3600);}

// Entradas no scroll (se o navegador não avisar a tempo, mostra tudo mesmo assim)
const els=$$('.r');
if(!still&&'IntersectionObserver' in window){
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{rootMargin:'0px 0px -8% 0px'});
 els.forEach(el=>io.observe(el));setTimeout(()=>els.forEach(el=>el.classList.add('in')),2500);
}else els.forEach(el=>el.classList.add('in'));

// O jogador "mergulha" conforme a página desce
const dive=$('#dive');
if(!still&&dive){
 let tick=false;
 const move=()=>{tick=false;const r=dive.getBoundingClientRect(),p=Math.min(Math.max((r.top+r.height/2)/innerHeight,0),1);dive.style.transform=`translateX(${p*10}%) rotate(${p*-4}deg)`;};
 addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(move);}},{passive:true});move();
}

// Janela da peça: tamanho e pedido pelo WhatsApp com a mensagem pronta
const dlg=$('#quick'),body=$('#quick-body');
function openPiece(key){
 const p=PIECES[key];if(!p)return;let size=null;
 const paint=()=>{
  const msg=`Oi, TRY84! Vi no site e quero a ${p.name} (${p.color})${size?`, tamanho ${size}`:''}. Ainda tem?`;
  body.innerHTML=`<button type="button" class="q-close" data-close aria-label="Fechar">×</button>
<div class="q-img"><img src="assets/try84-${key}.webp" alt="${esc(p.name)}, ${esc(p.color)}" width="800" height="800"></div>
<div class="q-info"><p class="label">${esc(p.color)} · Oversized</p><h2 class="wide" id="q-name">${esc(p.name)}</h2><p class="q-price">${esc(p.price)}</p>
<p class="q-desc">${esc(p.desc)}</p>
<div><p class="label">Tamanho${size?`: ${size}`:''}</p><div class="sizes" role="group" aria-label="Tamanho">${SIZES.map(s=>`<button type="button" data-size="${s}" aria-pressed="${s===size}">${s}</button>`).join('')}</div></div>
${size?`<a class="btn" id="order" href="${wa(WHATSAPP[0].number,msg)}" target="_blank" rel="noopener">Pedir pelo WhatsApp</a>`:'<span class="btn" aria-disabled="true">Escolha um tamanho</span>'}
<p class="q-note">O pedido é feito direto com a TRY84, que confirma tamanho, prazo e pagamento. Também atende pelo ${WHATSAPP.slice(1).map(w=>`<a href="${wa(w.number,msg)}" target="_blank" rel="noopener">${esc(w.label)}</a>`).join(' e ')}.</p></div>`;
 };
 body.onclick=e=>{const s=e.target.closest('[data-size]');if(s){size=s.dataset.size;paint();$('#order',body)?.focus();}};
 paint();if(!dlg.open)dlg.showModal();document.documentElement.classList.add('lock');
}
const closePiece=()=>{if(dlg.open)dlg.close();};
$('.grid').addEventListener('click',e=>{const a=e.target.closest('[data-piece]');if(a)openPiece(a.dataset.piece);});
dlg.addEventListener('click',e=>{if(e.target===dlg||e.target.closest('[data-close]'))closePiece();if(e.target.closest('#order'))setTimeout(()=>toast('Abrindo o WhatsApp da TRY84 com o seu pedido.'),50);});
dlg.addEventListener('close',()=>document.documentElement.classList.remove('lock'));

// Lista de espera (a mesma newsletter da duavesso)
const form=$('#lista-form'),out=$('#form-out');
form.addEventListener('submit',async e=>{
 e.preventDefault();
 if(form.site.value){form.reset();return;}
 const email=form.email.value.trim();
 if(!form.email.checkValidity()||!email){out.className='form-out err';out.textContent='Digite um e-mail válido, como nome@email.com.';form.email.focus();return;}
 out.className='form-out';out.textContent='Enviando…';
 try{await rpc('subscribe_newsletter',{p_email:email});out.textContent='Fechado. Você fica sabendo antes de todo mundo.';form.reset();}
 catch(err){out.className='form-out err';out.textContent=err.message||'Não deu para enviar agora. Tente de novo em instantes.';}
});

// Instagram da marca, quando cadastrado no painel
fetchBrand(BRAND).then(b=>{const ig=b?.links?.instagram;if(ig&&/^[A-Za-z0-9._]{1,30}$/.test(ig))$('#ig-slot').innerHTML=`<a href="https://instagram.com/${ig}" target="_blank" rel="noopener">Instagram</a>`;}).catch(()=>{});
