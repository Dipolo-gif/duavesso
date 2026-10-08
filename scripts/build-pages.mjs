// Gera as páginas com endereço próprio a partir de dist/index.html (o molde), do catálogo
// (dist/commerce.js), das marcas (dist/brands.js) e dos metadados de dist/pages.js:
//   dist/produto/<id>.html, dist/marcas.html, dist/marcas/<slug>.html, dist/estudio.html, dist/404.html,
//   dist/sitemap.xml e dist/llms.txt; e atualiza no próprio index.html os metadados da loja, a lista de
//   produtos dos dados estruturados e os links do rodapé.
// Cada página é o mesmo app com título, descrição, prévia de link (Open Graph) e dados estruturados
// próprios; o app lê o endereço e abre a tela certa. Rode `npm run pages` depois de mudar o catálogo,
// as marcas ou o index.html; o teste tests/pages.test.mjs falha se algo ficar desatualizado.
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {PRODUCTS,money} from '../dist/commerce.js';
import {SITE,pageMeta,allRoutes,privateRoutes,productPath,brandPath,brandList,findBrand,setBrandList} from '../dist/pages.js';

const DIST=new URL('../dist/',import.meta.url);
// Marcas: retrato das marcas ativas do banco em dist/marcas.json (a rotina diária atualiza com --live).
// Sem o arquivo, vale a lista de reserva de dist/brands.js.
const SNAPSHOT=new URL('marcas.json',DIST);
const BRAND_FIELDS='slug,name,tagline,bio,status,plan,theme,logo_path,cover_path,links,featured_product_id,featured_badge,featured_until,external_url';
export function loadBrandSnapshot(){if(existsSync(SNAPSHOT))setBrandList(JSON.parse(readFileSync(SNAPSHOT,'utf8')));}
export async function fetchLiveBrands(){
 const api=readFileSync(new URL('api.js',DIST),'utf8'),url=api.match(/SUPABASE_URL='([^']+)'/)[1],key=api.match(/SUPABASE_KEY='(sb_publishable_[\w-]+)'/)[1];
 const res=await fetch(`${url}/rest/v1/brands?select=${BRAND_FIELDS}&status=eq.active&order=slug`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});
 if(!res.ok)throw new Error(`Não consegui ler as marcas do banco (HTTP ${res.status}).`);
 return res.json();
}
const abs=path=>SITE+String(path).replace(/^\//,'');
const attr=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const text=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;');

// Largura e altura de um JPEG (marcador SOF) ou PNG, para og:image:width/height.
function imageSize(rel){
 const b=readFileSync(new URL(rel,DIST));
 if(b[0]===0x89&&b[1]===0x50)return [b.readUInt32BE(16),b.readUInt32BE(20)];
 for(let i=2;i<b.length;){
  if(b[i]!==0xff){i++;continue;}
  const m=b[i+1],len=b.readUInt16BE(i+2);
  if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return [b.readUInt16BE(i+7),b.readUInt16BE(i+5)];
  i+=2+len;
 }
 throw new Error(`não consegui ler o tamanho de ${rel}`);
}

const brandOf=p=>p.brand&&findBrand(p.brand);
const photosOf=p=>p.photos||p.variants?.[0]?.photos||[];
function productLD(p){
 const url=abs(productPath(p.id));
 return {'@type':'Product','@id':url,name:p.name,description:p.description,sku:p.id,
  image:photosOf(p).map(n=>abs(`assets/${n}-1024.jpg`)),brand:{'@type':'Brand',name:brandOf(p)?.name||'duavesso'},
  color:p.variants?p.variants.map(v=>v.color).join(', '):p.color,material:/suedine/i.test(p.fabric)?'Algodão e poliamida (suedine)':p.fabric,url,
  offers:{'@type':'Offer',price:(p.price/100).toFixed(2),priceCurrency:'BRL',availability:'https://schema.org/PreOrder',itemCondition:'https://schema.org/NewCondition',url}};
}
const crumbs=list=>({'@type':'BreadcrumbList',itemListElement:list.map(([name,path],i)=>({'@type':'ListItem',position:i+1,name,item:abs(path)}))});
const webPage=(type,m,extra={})=>({'@type':type,'@id':abs(m.path)+'#pagina',url:abs(m.path),name:m.title,description:m.description,inLanguage:'pt-BR',isPartOf:{'@id':abs('/#website')},...extra});

function jsonLD(r,m,template){
 if(r.product){
  const brand=brandOf(m.product);
  return [productLD(m.product),crumbs([['Início','/'],...(brand?[['Marcas','/marcas'],[brand.name,brandPath(brand.slug)]]:[['Coleção','/#colecao']]),[m.product.name,m.path]])];
 }
 if(r.view==='studio')return [webPage('WebPage',m),crumbs([['Início','/'],['Estúdio','/estudio']])];
 if(['checkout','editor','admin'].includes(r.view))return [webPage('WebPage',m)];
 if(r.view==='marcas'&&m.brand){
  const own=PRODUCTS.filter(p=>p.brand===m.brand.slug);
  return [webPage('CollectionPage',m,{about:{'@type':'Brand',name:m.brand.name,description:m.brand.bio,...(m.brand.external?{url:m.brand.external}:{})},
   ...(own.length?{mainEntity:{'@type':'ItemList',itemListElement:own.map((p,i)=>({'@type':'ListItem',position:i+1,url:abs(productPath(p.id))}))}}:{})}),
   crumbs([['Início','/'],['Marcas','/marcas'],[m.brand.name,m.path]])];
 }
 if(r.view==='marcas')return [webPage('CollectionPage',m,{mainEntity:{'@type':'ItemList',itemListElement:brandList().map((b,i)=>({'@type':'ListItem',position:i+1,name:b.name,url:abs(brandPath(b.slug))}))}}),crumbs([['Início','/'],['Marcas','/marcas']])];
 // Loja: mantém OnlineStore e WebSite do molde e refaz a lista de produtos a partir do catálogo.
 const graph=template['@graph'].filter(x=>x['@type']!=='ItemList').map(x=>x['@type']==='OnlineStore'?{...x,description:m.description}:x);
 return [...graph,{'@type':'ItemList',name:'Coleção duavesso',itemListElement:PRODUCTS.map((p,i)=>({'@type':'ListItem',position:i+1,item:productLD(p)}))}];
}

const FOOTER_START='<!--gerado:rodape-->',FOOTER_END='<!--/gerado:rodape-->';
const footerLinks=()=>`${FOOTER_START}<div><span class="footer-heading">Peças</span>${PRODUCTS.map(p=>`<a href="${productPath(p.id).slice(1)}">${text(p.name)}</a>`).join('')}</div><div><span class="footer-heading">Marcas</span>${brandList().map(b=>`<a href="${brandPath(b.slug).slice(1)}">${text(b.name)}</a>`).join('')}</div>${FOOTER_END}`;

function render(template,r){
 const m=pageMeta(r),url=abs(m.path),[w,h]=imageSize(m.image),ld=JSON.parse(template.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
 let html=template;
 const set=(re,value,label)=>{if(!re.test(html))throw new Error(`molde sem ${label}`);html=html.replace(re,value);};
 set(/<title>.*?<\/title>/s,`<title>${text(m.title)}</title>`,'title');
 set(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${attr(m.description)}">`,'description');
 set(/<link rel="canonical" href="[^"]*">/,`<link rel="canonical" href="${url}">`,'canonical');
 set(/<meta property="og:type" content="[^"]*">/,`<meta property="og:type" content="${r.product?'product':'website'}">`,'og:type');
 set(/<meta property="og:title" content="[^"]*">/,`<meta property="og:title" content="${attr(m.title)}">`,'og:title');
 set(/<meta property="og:description" content="[^"]*">/,`<meta property="og:description" content="${attr(m.description)}">`,'og:description');
 set(/<meta property="og:url" content="[^"]*">/,`<meta property="og:url" content="${url}">`,'og:url');
 set(/<meta property="og:image" content="[^"]*">/,`<meta property="og:image" content="${abs(m.image)}">`,'og:image');
 set(/<meta property="og:image:width" content="[^"]*">/,`<meta property="og:image:width" content="${w}">`,'og:image:width');
 set(/<meta property="og:image:height" content="[^"]*">/,`<meta property="og:image:height" content="${h}">`,'og:image:height');
 set(/<meta property="og:image:alt" content="[^"]*">/,`<meta property="og:image:alt" content="${attr(m.imageAlt)}">`,'og:image:alt');
 set(/<meta name="twitter:title" content="[^"]*">/,`<meta name="twitter:title" content="${attr(m.title)}">`,'twitter:title');
 set(/<meta name="twitter:description" content="[^"]*">/,`<meta name="twitter:description" content="${attr(m.description)}">`,'twitter:description');
 set(/<meta name="twitter:image" content="[^"]*">/,`<meta name="twitter:image" content="${abs(m.image)}">`,'twitter:image');
 set(/<script type="application\/ld\+json">.*?<\/script>/s,`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':jsonLD(r,m,ld)})}</script>`,'JSON-LD');
 set(new RegExp(`(${FOOTER_START}.*?${FOOTER_END}|(?=</nav><form class="newsletter"))`,'s'),footerLinks(),'rodapé');
 // A foto grande da capa só aparece na loja: nas telas de marcas e do estúdio não vale baixá-la antes.
 if(r.view!=='shop')html=html.replace(/\s*<link rel="preload" as="image"[^>]*>/,'');
 return html;
}

function notFoundPage(template){
 let html=render(template,{view:'shop'});
 html=html.replace(/<title>.*?<\/title>/s,'<title>Página não encontrada · duavesso</title>')
  .replace(/<meta name="robots" content="[^"]*">/,'<meta name="robots" content="noindex">')
  .replace(/\s*<link rel="canonical" href="[^"]*">/,'')
  .replace(/<script type="application\/ld\+json">.*?<\/script>/s,'');
 return html;
}

function sitemap(){
 const urls=allRoutes().map(r=>{
  const m=pageMeta(r),images=r.product?photosOf(m.product).map(n=>`assets/${n}-1024.jpg`):[m.image];
  return `  <url>\n    <loc>${abs(m.path)}</loc>\n${images.map(i=>`    <image:image><image:loc>${abs(i)}</image:loc></image:image>\n`).join('')}  </url>`;
 });
 return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`;
}

function llms(){
 const line=p=>`- [${p.name}](${abs(productPath(p.id))}) · ${money(p.price)}${p.variants?` · ${p.variants.map(v=>v.color.toLowerCase()).join(', ')}`:` · ${p.color.toLowerCase()}`}${brandOf(p)?` · linha ${brandOf(p).name}`:''}: ${p.description}`;
 return `# duavesso

> Loja brasileira de camisetas oversized em suedine premium de 250 g/m² (algodão e poliamida), com estúdio online para criar a própria estampa (texto, imagem ou uma ideia descrita, que a marca desenha). Site em português, preços em reais, pré-lançamento.

## Peças

${PRODUCTS.map(line).join('\n')}

Tamanhos P, M, G e GG. Estúdio: criar a estampa na hora (R$ 129,90) ou descrever a ideia para a marca desenhar (R$ 149,90). Frete grátis a partir de R$ 250; Pix ou cartão em até 3x; troca em 30 dias.

## Marcas

${brandList().map(b=>`- [${b.name}](${abs(brandPath(b.slug))}): ${b.bio}`).join('\n')}

## Páginas

- [Loja e coleção](${abs('/')}): catálogo com filtros e busca.
- [Estúdio](${abs('/estudio')}): editor de estampas com prévia em 3D.
- [Marcas](${abs('/marcas')}): as linhas da família duavesso.

## Como comprar

Escolha a peça, a cor e o tamanho, adicione à sacola e finalize com nome, e-mail e endereço. Contas são opcionais: com login (e-mail e senha ou Google) o cliente acompanha os pedidos e guarda o endereço. O pedido recebe um código (AV-…) consultável com o e-mail em "Meus pedidos".

## Observações

- Pré-lançamento: pedidos são registrados, mas ainda não há cobrança.
- A prévia da estampa é ilustrativa, não é arquivo técnico de impressão.
`;
}

// Arquivos gerados, como {caminho relativo a dist/: conteúdo}
export function buildPages(){
 loadBrandSnapshot();
 const template=readFileSync(new URL('index.html',DIST),'utf8');
 const files={'index.html':render(template,{view:'shop'})};
 for(const r of allRoutes()){
  if(r.view==='shop'&&!r.product)continue;
  files[pageMeta(r).path.slice(1)+'.html']=render(files['index.html'],r);
 }
 for(const r of privateRoutes()){
  const m=pageMeta(r);
  files[m.path.slice(1)+'.html']=render(files['index.html'],r).replace(/<meta name="robots" content="[^"]*">/,'<meta name="robots" content="noindex">');
 }
 files['404.html']=notFoundPage(files['index.html']);
 files['sitemap.xml']=sitemap();
 files['llms.txt']=llms();
 return files;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.includes('--live'))writeFileSync(SNAPSHOT,JSON.stringify(await fetchLiveBrands(),null,1)+'\n');
 const files=buildPages();
 // Remove páginas de produtos e marcas que saíram do catálogo
 for(const dir of ['produto','marcas']){
  if(!existsSync(new URL(dir+'/',DIST)))continue;
  for(const f of readdirSync(new URL(dir+'/',DIST)))if(!files[`${dir}/${f}`])rmSync(new URL(`${dir}/${f}`,DIST));
 }
 for(const [rel,content] of Object.entries(files)){
  mkdirSync(new URL('.',new URL(rel,DIST)),{recursive:true});
  writeFileSync(new URL(rel,DIST),content);
 }
 console.log(`${Object.keys(files).length} arquivos gerados em dist/`);
}
