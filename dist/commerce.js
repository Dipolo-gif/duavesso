export const SIZES=['P','M','G','GG'];
// A Marileus (marca geek) usa a grade completa do fornecedor, de PP a XG; as outras peças seguem em P a GG.
export const MARILEUS_SIZES=['PP','P','M','G','GG','XG'];
export const ALL_SIZES=MARILEUS_SIZES;
export const sizesOf=p=>p&&p.brand==='geek'?MARILEUS_SIZES:SIZES;
// Medidas da peça estendida (cm) da linha Marileus, tabela do fornecedor: [tamanho, comprimento, largura, manga]
export const MARILEUS_MEASURES=[['PP',69,55,21],['P',74,58,23],['M',76,60,25],['G',80,62,26],['GG',82,65,28],['XG',84,65,28]];
const CARE='Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.';
// Tecidos conforme o catálogo do fornecedor: Heavy Oversized 20.1 (linha Heavy e geek) e Basic Oversized 30.1 (Simples)
const HEAVY_SPEC={fabric:'100% algodão penteado, fio 20.1 · 220 g/m²',finish:'Encolhimento zero, gola canelada de 3 cm com elastano e reforço ombro a ombro',fit:'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.',care:CARE};
const BASIC_SPEC={fabric:'100% algodão penteado, fio 30.1 · 180 g/m²',finish:'Gola canelada de 3 cm com elastano, bainha de 4 cm e reforço ombro a ombro',fit:'Oversized: ombro caído e corpo amplo, cai reto. Para menos volume, escolha um tamanho abaixo.',care:CARE};
// Linha Marileus: base oversized do fornecedor (malha suedine, no mínimo 85% algodão, 210 g/m²)
const MARILEUS_SPEC={fabric:'Malha suedine com no mínimo 85% de algodão e fio de alma · 210 g/m²',finish:'Gola redonda canelada 2×1 de 3 cm e reforço ombro a ombro. Não encolhe, não desbota e mantém a estrutura após várias lavagens',fit:'Oversized: caimento solto e moderno. Para menos volume, escolha um tamanho abaixo.',care:CARE};
// Coleção anterior, fora da loja desde nov/2026 (as estampas foram reformuladas). Fica guardada aqui como
// referência e como peças de exemplo nos testes; Coração Pixelado e Carpa Japonesa voltaram em PRODUCTS.
// Para voltar outra peça, coloque-a em PRODUCTS e reative no banco (products.active).
export const ARCHIVE=[
 {id:'heavy-avesso',brand:'geek',name:'Heavy · Do Avesso',category:'graphic',color:'Preto lavado',base:'black',swatch:'#26272a',photos:['tee-porta-1','tee-porta-2','tee-porta-3'],price:14390,compareAt:15990,tag:'ESTAMPA AUTORAL',graphic:'DO SEU\nAVESSO.',graphicClass:'graphic-off',description:'Nossa peça mais encorpada, 100% algodão de 220 g/m², com uma estampa para vestir do seu avesso. O modelo também vem liso em preto, off-white e marrom.',print:'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica',...HEAVY_SPEC},
 {id:'heavy-faces',brand:'geek',name:'Heavy · Dois Lados',category:'graphic',color:'Marrom',base:'brown',swatch:'#8a6a4f',photos:['tee-faces-1','tee-faces-2','tee-faces-3'],price:14390,compareAt:15990,tag:'NOVA ESTAMPA',graphic:'',graphicClass:'',description:'Algodão de 220 g/m² num marrom terroso, com a estampa Dois Lados nas costas: duas faces do mesmo avesso. Oversized, caimento reto.',print:'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica',...HEAVY_SPEC},
 {id:'heavy-eclipse',brand:'geek',name:'Heavy · Eclipse',category:'graphic',color:'Marrom',base:'brown',swatch:'#8a6a4f',photos:['tee-eclipse-1','tee-eclipse-2','tee-eclipse-3'],price:14390,compareAt:15990,tag:'NOVA ESTAMPA',graphic:'',graphicClass:'',description:'Algodão de 220 g/m² em marrom, com a estampa Eclipse no peito. Oversized, encorpada e com caimento reto.',print:'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica',...HEAVY_SPEC},
 {id:'simples',brand:'geek',name:'Oversized Simples',category:'simples',color:'Preto lavado',base:'black',swatch:'#26272a',price:10790,compareAt:11990,tag:'BÁSICA',graphic:'',graphicClass:'',variants:[{base:'black',color:'Preto lavado',swatch:'#26272a',photos:['tee-simples-preto-1','tee-simples-preto-2','tee-simples-preto-3']},{base:'white',color:'Off white',swatch:'#efece3',photos:['tee-simples-branco-1','tee-simples-branco-2','tee-simples-branco-3']},{base:'brown',color:'Marrom',swatch:'#8a6a4f',photos:['tee-simples-marrom-1','tee-simples-marrom-2','tee-simples-marrom-3']}],description:'A base oversized da duavesso: 100% algodão penteado de 180 g/m², gola canelada e caimento reto. Sem estampa, só o dv na manga. Vem em preto, off-white e marrom.',print:'',...BASIC_SPEC},
 {id:'geek-coracao',name:'Coração Pixelado',brand:'geek',category:'graphic',color:'Preta',base:'black',swatch:'#26272a',photos:['geek-coracao-1','geek-coracao-2','geek-coracao-3'],price:14390,compareAt:15990,tag:'ESTAMPA GEEK',graphic:'',graphicClass:'',description:'Coração anatômico em pixel art que se desmancha em blocos, com PLAYER 01 no peito. Oversized preta em algodão de 220 g/m².',print:'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica',...HEAVY_SPEC},
 {id:'geek-carpa',name:'Carpa Japonesa',brand:'geek',category:'graphic',color:'Off white',base:'white',swatch:'#efece3',photos:['geek-carpa-1','geek-carpa-2','geek-carpa-3'],price:14390,compareAt:15990,tag:'ESTAMPA GEEK',graphic:'',graphicClass:'',description:'Carpa koi em nanquim com o sol laranja, entre a arte japonesa e o traço geek. Oversized off white em algodão de 220 g/m².',print:'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica',...HEAVY_SPEC}
]
// Peças à venda: a nova coleção da Marileus. Coração Pixelado e Carpa Japonesa voltam (ficha acima, fotos
// novas); Dragão e Ronin são estampas novas e vêm em preto e off white: cada cor tem a sua galeria, e o
// seletor de cor do site troca as fotos. As fotos saem de scripts/build-marileus-colecao.mjs.
const archived=id=>ARCHIVE.find(p=>p.id===id);
const BLACK={base:'black',color:'Preta',swatch:'#26272a'},OFF_WHITE={base:'white',color:'Off white',swatch:'#efece3'};
const fromArchive=(id,d)=>({...archived(id),...MARILEUS_SPEC,description:d});
const poses=name=>[1,2,3].map(n=>`${name}-${n}`);
const DTF='DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica';
export const PRODUCTS=[
 fromArchive('geek-coracao','Coração anatômico em pixel art que se desmancha em blocos, com PLAYER 01 no peito. Oversized preta, malha de 210 g/m².'),
 fromArchive('geek-carpa','Carpa koi em nanquim com o sol laranja, entre a arte japonesa e o traço geek. Oversized off white, malha de 210 g/m².'),
 {id:'geek-dragao',brand:'geek',name:'Dragão',category:'graphic',color:BLACK.color,base:BLACK.base,swatch:BLACK.swatch,price:14390,compareAt:15990,tag:'ESTAMPA GEEK',graphic:'',graphicClass:'',variants:[{...BLACK,photos:poses('geek-dragao-preto')},{...OFF_WHITE,photos:poses('geek-dragao-branco')}],description:'Um dragão discreto no peito e, nas costas, duas katanas cruzadas num círculo azul-petróleo, com o dragão enroscado na lâmina. Oversized em malha de 210 g/m², em preto e off white.',print:DTF,...MARILEUS_SPEC},
 {id:'geek-ronin',brand:'geek',name:'Ronin',category:'graphic',color:BLACK.color,base:BLACK.base,swatch:BLACK.swatch,price:14390,compareAt:15990,tag:'ESTAMPA GEEK',graphic:'',graphicClass:'',variants:[{...BLACK,photos:poses('geek-ronin-preto')},{...OFF_WHITE,photos:poses('geek-ronin-branco')}],description:'Uma katana e uma folha de bordo vermelha no peito e, nas costas, o ronin de chapéu de palha diante do sol vermelho. Oversized em malha de 210 g/m², em preto e off white.',print:DTF,...MARILEUS_SPEC},
 {id:'geek-critical',brand:'geek',name:'Critical Fate',category:'graphic',color:BLACK.color,base:BLACK.base,swatch:BLACK.swatch,price:14390,compareAt:15990,tag:'ESTAMPA GEEK',graphic:'',graphicClass:'',variants:[{...BLACK,photos:poses('geek-critical-preto')},{...OFF_WHITE,photos:poses('geek-critical-branco')}],description:'Um d20 preso a uma adaga, com estrela e traço azul, no peito e, nas costas, o dragão enroscado numa lua crescente segurando o d20 pela corrente, e uma mão de esqueleto empunhando a adaga. Para quem decide o destino na rolagem. Oversized em preto e off white.',print:DTF,...MARILEUS_SPEC},
];
export function setProducts(list){PRODUCTS.splice(0,PRODUCTS.length,...list);}
// Preço "de/por": compareAt é o preço antigo (riscado). Devolve o desconto em % (0 se não está em promoção).
export const discountOf=p=>p&&p.compareAt>p.price?Math.round((1-p.price/p.compareAt)*100):0;
export const INSTALLMENTS=3;
export const installment=cents=>Math.ceil(cents/INSTALLMENTS);
export const CUSTOM={create:{name:'Sua camiseta · Studio',price:12990},brief:{name:'Sua camiseta · Estampa sob medida',price:14990}};
export const customMode=design=>design?.mode==='brief'?'brief':'create';
// Rótulo da cor no carrinho/pedido: base do catálogo ou a cor livre escolhida no estúdio 3D.
export const garmentLabel=design=>design?.garment?`Cor personalizada ${design.garment}`:design?.color==='black'?'Preto lavado':'Branco giz';
export const money=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Promoções em vigor: vêm da tabela promotions do banco (migração 0008); sem conexão vale o padrão.
//   free_shipping: frete padrão grátis quando as peças, já com descontos, somam min
//   cheapest_free: quando as peças somam min, uma unidade da peça mais barata sai de graça
// A mesma regra está no place_order; o banco sempre dá a palavra final.
export const DEFAULT_PROMOS=[{kind:'free_shipping',min:25000,label:'Frete grátis'}];
let PROMOS=DEFAULT_PROMOS;
export function setPromos(list){PROMOS=Array.isArray(list)?list.filter(p=>['free_shipping','cheapest_free'].includes(p?.kind)&&Number.isInteger(p.min)&&p.min>=0):DEFAULT_PROMOS;}
const promoMin=kind=>{const v=PROMOS.filter(p=>p.kind===kind).map(p=>p.min);return v.length?Math.min(...v):null;};
export const freeShippingMin=()=>promoMin('free_shipping');
// coupon: desconto do cupom já calculado pelo banco (check_coupon) sobre o valor depois da promoção.
export function totals(items,shipping='standard',{coupon=0}={}){
 const subtotal=items.reduce((sum,item)=>sum+item.price*item.qty,0),count=items.reduce((sum,item)=>sum+item.qty,0);
 const gift=promoMin('cheapest_free'),promo=items.length&&gift!==null&&subtotal>=gift?Math.min(...items.map(i=>i.price)):0;
 const couponOff=Math.min(Math.max(0,coupon|0),subtotal-promo),goods=subtotal-promo-couponOff,ship=freeShippingMin();
 const delivery=items.length?(shipping==='express'?2490:ship!==null&&goods>=ship?0:1490):0;
 return {subtotal,promo,coupon:couponOff,discount:promo+couponOff,delivery,total:goods+delivery,count};
}
// Quanto falta para cada promoção (para os avisos "faltam R$ X para...").
export function promoGoals(items,opts){
 const t=totals(items,'standard',opts),goals=[],ship=freeShippingMin(),gift=promoMin('cheapest_free');
 if(ship!==null){const have=t.subtotal-t.discount;goals.push({kind:'free_shipping',min:ship,have,remaining:Math.max(0,ship-have)});}
 if(gift!==null)goals.push({kind:'cheapest_free',min:gift,have:t.subtotal,remaining:Math.max(0,gift-t.subtotal),value:t.promo});
 return goals;
}
export function shippingSuggestion(items){
 const ship=freeShippingMin();if(ship===null)return null;
 const t=totals(items),remaining=ship-(t.subtotal-t.discount);
 if(remaining<=0)return null;
 const inCart=new Set(items.map(i=>i.id)),candidates=[...PRODUCTS].sort((a,b)=>a.price-b.price);
 return candidates.find(p=>p.price>=remaining&&!inCart.has(p.id))||candidates.find(p=>p.price>=remaining)||candidates.at(-1);
}
export function addItem(items,item){
 if(!ALL_SIZES.includes(item.size)||!Number.isInteger(item.price)||item.price<=0)throw new Error('Produto ou tamanho inválido.');
 const existing=items.find(x=>x.key===item.key);
 if(existing?.qty>=10)throw new Error('Limite de 10 unidades por modelo e tamanho.');
 if(items.length>=30&&!existing)throw new Error('Limite de 30 itens diferentes na sacola.');
 return existing?items.map(x=>x.key===item.key?{...x,qty:x.qty+1}:x):[...items,{...item,qty:1}];
}
export function changeQuantity(items,key,delta){
 if(![1,-1].includes(delta))throw new Error('Quantidade inválida.');
 return items.map(x=>x.key===key?{...x,qty:Math.min(10,x.qty+delta)}:x).filter(x=>x.qty>0);
}
export function validImageURL(value){return typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<1500000;}
// Zonas da peça onde uma estampa pode ficar (rótulo em português para carrinho/pedido).
export const PRINT_ZONES={front:'frente',back:'costas','sleeve-left':'manga esquerda','sleeve-right':'manga direita',side:'lateral'};
export const PRINT_ZONE_AT={front:'na frente',back:'nas costas','sleeve-left':'na manga esquerda','sleeve-right':'na manga direita',side:'na lateral'};
export const isZone=z=>typeof z==='string'&&Object.hasOwn(PRINT_ZONES,z);
export const MAX_PRINTS=4;
const str=(v,max)=>typeof v==='string'?v.slice(0,max):'';
const num=(v,min,max,fallback)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
function sanitizePlace(v){
 if(!v||typeof v!=='object'||!isZone(v.zone))return null;
 const vec=k=>Array.isArray(v[k])&&v[k].length===3&&v[k].every(x=>Number.isFinite(x)&&Math.abs(x)<=2)?v[k].map(x=>Math.round(x*1e4)/1e4):null;
 const p=vec('p'),n=vec('n');if(!p||!n)return null;
 return {p,n,zone:v.zone};
}
// Uma estampa: texto e/ou imagem, tamanho, rotação e lugar (sliders x/y na frente, ou place em qualquer zona).
// image_path nunca vem da sacola: só o checkout o cria, depois de subir a arte.
export function sanitizePrint(p){
 if(!p||typeof p!=='object')return null;
 return {text:str(p.text,70),font:['condensed','sans','serif'].includes(p.font)?p.font:'condensed',ink:/^#[0-9a-f]{6}$/i.test(p.ink)?p.ink:'#1737bc',scale:num(p.scale,45,100,80),x:num(p.x,-30,30,0),y:num(p.y,-25,25,0),rotation:num(p.rotation,-15,15,0),place:sanitizePlace(p.place),image:validImageURL(p.image)?p.image:null};
}
export function sanitizeDesign(d){
 if(!d||typeof d!=='object')return null;
 const mode=d.mode==='brief'?'brief':'create';
 const base={mode,color:['white','black'].includes(d.color)?d.color:'white',garment:/^#[0-9a-f]{6}$/i.test(d.garment)?d.garment.toLowerCase():'',size:SIZES.includes(d.size)?d.size:'M'};
 if(mode==='brief')return {...base,brief:str(d.brief,400)};
 // Pedidos/sacolas antigos guardavam uma estampa só nos campos de cima; viram uma lista de 1.
 const list=(Array.isArray(d.prints)?d.prints:[d]).slice(0,MAX_PRINTS).map(sanitizePrint).filter(Boolean);
 return {...base,prints:list.length?list:[sanitizePrint({})]};
}
export const printZone=p=>isZone(p?.place?.zone)?p.place.zone:'front';
export const printZoneLabel=p=>PRINT_ZONES[printZone(p)];
export function printsSummary(design){
 const prints=design?.prints||[];
 if(prints.length<=1)return `Estampa ${PRINT_ZONE_AT[printZone(prints[0])]}`;
 return `${prints.length} estampas: ${prints.map(printZoneLabel).join(', ')}`;
}
export function normalizeCart(value){
 if(!Array.isArray(value))return [];
 return value.slice(0,30).flatMap(x=>{
  if(!x||!ALL_SIZES.includes(x.size)||!Number.isInteger(x.qty)||x.qty<1||x.qty>10)return [];
  const p=PRODUCTS.find(p=>p.id===x.id);
  if(p){
   if(p.variants){const v=p.variants.find(v=>v.base===x.base)||p.variants[0],{variants,...rest}=p;return [{...rest,base:v.base,color:v.color,swatch:v.swatch,key:`${p.id}-${v.base}-${x.size}`,size:x.size,qty:x.qty}];}
   return [{...p,key:`${p.id}-${x.size}`,size:x.size,qty:x.qty}];
  }
  if(x.id==='custom'&&typeof x.key==='string'&&/^custom-[\w-]+$/.test(x.key)&&['white','black'].includes(x.base)&&validImageURL(x.preview)){const design=sanitizeDesign(x.design),mode=customMode(design);return [{id:'custom',key:x.key,name:CUSTOM[mode].name,category:'custom',base:x.base,color:garmentLabel({...design,color:x.base}),size:x.size,qty:x.qty,price:CUSTOM[mode].price,preview:x.preview,design}];}
  return [];
 });
}
