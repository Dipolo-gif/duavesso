// Endereços do site e o título, a descrição e a imagem de cada página. Usado pelo app (navegação
// sem recarregar) e por scripts/build-pages.mjs (páginas pré-geradas para o Google e para prévias de link).
//   /                      loja (âncoras #inicio, #colecao e #sobre)
//   /produto/<id>          ficha do produto, aberta por cima da loja
//   /marcas                as marcas da família duavesso
//   /marcas/<slug>         página de uma marca
//   /estudio               estúdio para criar a estampa
//   /checkout              finalizar compra (fora do Google)
import {PRODUCTS,money,INSTALLMENTS,installment} from './commerce.js';
import {BRANDS} from './brands.js';

export const SITE='https://loja-duavesso.vercel.app/';
const SECTIONS=['#inicio','#colecao','#sobre'];
const HOME_DESCRIPTION='Camisetas oversized em suedine premium de 250 g/m² e um estúdio para criar sua camiseta personalizada: sua frase, sua imagem ou só a ideia, que a gente desenha. Frete grátis a partir de R$ 250.';
const HOME_IMAGE={image:'assets/editorial-1536.jpg',imageAlt:'Duas pessoas vestindo camisetas oversized duavesso'};

// Lê o endereço atual. Os links antigos com # (#produto-x, #marca-x, #marcas, #estudio) e as âncoras
// da loja usadas em outra página voltam com legacy=true e o endereço novo em path.
export function parseRoute(pathname,hash=''){
 const p=(pathname||'/').replace(/\/+$/,'')||'/';
 let m;
 if(SECTIONS.includes(hash))return {view:'shop',section:hash,path:'/'+hash,legacy:p!=='/'};
 if(hash==='#estudio')return {view:'studio',path:'/estudio',legacy:true};
 if(hash==='#marcas')return {view:'marcas',brand:null,path:'/marcas',legacy:true};
 if((m=hash.match(/^#marca-([a-z0-9-]+)$/)))return {view:'marcas',brand:m[1],path:`/marcas/${m[1]}`,legacy:true};
 if((m=hash.match(/^#produto-([a-z0-9-]+)$/)))return {view:'shop',product:m[1],path:`/produto/${m[1]}`,legacy:true};
 if(p==='/')return {view:'shop',path:'/'+hash};
 if(p==='/estudio')return {view:'studio',path:'/estudio'};
 if(p==='/checkout')return {view:'checkout',path:'/checkout'};
 if(p==='/marcas')return {view:'marcas',brand:null,path:'/marcas'};
 if((m=p.match(/^\/marcas\/([a-z0-9-]+)$/)))return {view:'marcas',brand:m[1],path:p};
 if((m=p.match(/^\/produto\/([a-z0-9-]+)$/)))return {view:'shop',product:m[1],path:p};
 return {view:'shop',path:'/',notFound:true};
}
export const isAppPath=pathname=>!parseRoute(pathname).notFound;

const productImage=p=>`assets/${(p.photos||p.variants?.[0]?.photos||[])[0]}-1024.jpg`;
export const productPath=id=>`/produto/${id}`;
export const brandPath=slug=>`/marcas/${slug}`;

// Metadados de uma rota (produto ou marca inexistente caem na loja).
export function pageMeta(r){
 const product=r.product&&PRODUCTS.find(p=>p.id===r.product);
 if(product){
  const brand=product.brand&&BRANDS.find(b=>b.slug===product.brand);
  return {path:productPath(product.id),title:`${product.name} · camiseta oversized · ${brand?brand.name:'duavesso'}`,
   description:`${product.description} ${money(product.price)} ou ${INSTALLMENTS}x de ${money(installment(product.price))} sem juros. Frete grátis a partir de R$ 250.`,
   image:productImage(product),imageAlt:`${product.name}, camiseta oversized ${product.color.toLowerCase()}`,product,brand};
 }
 if(r.view==='checkout')return {path:'/checkout',title:'Finalizar compra · duavesso',description:'Entrega, pagamento e resumo do seu pedido na duavesso.',noindex:true,...HOME_IMAGE};
 if(r.view==='studio')return {path:'/estudio',title:'Crie sua camiseta personalizada · duavesso Studio',
  description:'Monte sua camiseta oversized na hora: sua frase, sua imagem, até 4 estampas por peça em qualquer lugar da camiseta, com prévia em 3D. Ou só descreva a ideia, que a gente desenha.',...HOME_IMAGE};
 if(r.view==='marcas'){
  const brand=r.brand&&BRANDS.find(b=>b.slug===r.brand);
  if(brand)return {path:brandPath(brand.slug),title:`${brand.name} · ${brand.kicker} · duavesso`,description:brand.lead,
   image:brand.hero?`assets/${brand.hero}.jpg`:HOME_IMAGE.image,imageAlt:`${brand.name} · ${brand.kicker}`,brand};
  return {path:'/marcas',title:'Marcas · a família duavesso',
   description:`As linhas com identidade própria da duavesso: ${BRANDS.map(b=>b.name).join(', ')}. Cada uma com a sua página e a mesma base oversized.`,...HOME_IMAGE};
 }
 return {path:'/',title:'duavesso · Camisetas oversized e estampas personalizadas',description:HOME_DESCRIPTION,...HOME_IMAGE};
}

// Páginas que existem mas não vão para o Google (sem sitemap, com noindex).
export const privateRoutes=()=>[{view:'checkout'}];
// Todas as páginas públicas (para o gerador e o sitemap).
export function allRoutes(){
 return [{view:'shop'},{view:'marcas',brand:null},...BRANDS.map(b=>({view:'marcas',brand:b.slug})),{view:'studio'},...PRODUCTS.map(p=>({view:'shop',product:p.id}))];
}
