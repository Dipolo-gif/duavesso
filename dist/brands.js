// Marcas da família duavesso: dados das páginas /marcas/<slug> (usados pelo site e pelo gerador de páginas).
// off: fora da loja (suspensa no banco). Não entra na lista de reserva, mas os dados ficam para quando voltar.
export const BRANDS=[
 {slug:'geek',name:'duavessogeek',theme:'geek',kicker:'games · pixel · sci-fi',logo:'<span class="brand-logo-word">duavesso</span><b class="brand-logo-tag">geek</b>',lead:'Cultura geek no avesso: games, pixel, sci-fi e as referências que só quem é do meio pega, no caimento oversized da duavesso.',art:{src:'geek-invader.svg',w:264,h:192},site:null,collection:'Primeiros drops',drops:[['&lt;3','Pixel Heart'],['1UP','Continue?'],['404','Not Found']]},
 {slug:'try84',off:true,name:'TRY84',theme:'rugby',kicker:'rugby lifestyle · forward together',logo:'<span class="brand-logo-word">TRY84</span>',lead:'Feita por jogadores. Rugby lifestyle em preto e branco, do treino ao terceiro tempo.',art:{src:'brand-try84.svg',w:280,h:180},site:'https://try84.com.br',hero:'try84-hero',collection:'A coleção',products:[{name:'TRYMAN',type:'Oversized Tee',price:'R$ 159,90',img:'try84-tryman',href:'https://try84.com.br/tryman-oversized-tee-62pk7'},{name:'STREET XV',type:'Oversized Tee',price:'R$ 159,90',img:'try84-street',href:'https://try84.com.br/street-xv-w8hgn'},{name:'JONAH LOMU',type:'Oversized Tee',price:'R$ 160,00',img:'try84-jonah',href:'https://try84.com.br/jonah-lomu-oversized-tee-ypjxy'},{name:'Oversized Tee · 001',type:'Preto',price:'R$ 137,94',img:'try84-t001',href:'https://try84.com.br/oversized-tee-001-ndp8q'},{name:'Oversized Tee · 002',type:'Off-white',price:'R$ 137,94',img:'try84-t002',href:'https://try84.com.br/oversized-tee-002-8dosx'}]},
 {slug:'solfado',off:true,name:'SolFáDó',theme:'music',kicker:'camisetas inspiradas na música',logo:'<span class="brand-logo-word">SolFáDó</span>',lead:'Música é a arte do som. Estampas inspiradas em hinos, para o 1º Encontro de Violeiros.',art:{src:'brand-solfado.svg',w:280,h:170},site:'https://solfado.com.br',collection:'Coleção 1º Encontro de Violeiros',collectionNote:'10 estampas · R$ 59,90 a R$ 99,90 · retirada no evento',products:[{name:'Ó Minha Flor',img:'solfado-flor'},{name:'Caquinho',img:'solfado-caquinho'},{name:'Pétalas de Rosa',img:'solfado-petalas'},{name:'Te Chamo de Ester',img:'solfado-ester'},{name:'Queria Ter Asas para Voar',img:'solfado-asas'},{name:'Violeiro de Guerra',img:'solfado-violeiro'},{name:'Somos Joias Preciosas',type:'Kids',img:'solfado-joias'},{name:'Brilha Mais e Mais',type:'Kids',img:'solfado-brilha'},{name:'Bênçãos e Bênçãos Deus Derramará',type:'Kids',img:'solfado-bencaos'},{name:'Eu Sou um Cordeirinho',type:'Kids',img:'solfado-cordeirinho'}]},
];

// Cores e capas das 3 marcas quando o banco não responde (o banco é a fonte principal, migração 0009).
const FALLBACK={
 geek:{theme:{mode:'solid',c1:'#141519',c2:'#141519',angle:135,accent:'#3a5bff'}},
 try84:{theme:{mode:'solid',c1:'#1c1d1f',c2:'#1c1d1f',angle:135,accent:'#ffffff'}},
 solfado:{theme:{mode:'solid',c1:'#f2efe7',c2:'#f2efe7',angle:135,accent:'#17324f'}}
};
// Formato único de marca usado pelo site (venha do banco ou desta lista de reserva)
export function brandFromStatic(b){
 return {slug:b.slug,name:b.name,tagline:b.kicker||'',bio:b.lead||'',about:'',aboutPhoto:null,theme:FALLBACK[b.slug]?.theme||null,logo:null,
  cover:b.hero?`assets/${b.hero}.jpg`:null,links:{},external:b.site||null,featured:null,plan:'free',status:'active',static:b};
}
export function brandFromRow(r){
 return {slug:r.slug,name:r.name,tagline:r.tagline||'',bio:r.bio||'',about:r.about||'',aboutPhoto:r.about_path||null,theme:r.theme||null,logo:r.logo_path||null,cover:r.cover_path||null,
  links:r.links&&typeof r.links==='object'?r.links:{},external:r.external_url||null,
  featured:r.featured_product_id?{id:r.featured_product_id,badge:r.featured_badge||'',until:r.featured_until||null}:null,
  plan:r.plan||'free',status:r.status||'active',updated:r.updated_at||null,static:BRANDS.find(b=>b.slug===r.slug)||null};
}
