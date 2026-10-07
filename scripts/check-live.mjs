// Verificação ao vivo, usada pelo monitor (.github/workflows/monitor.yml) a cada 30 minutos:
// loja no ar com os cabeçalhos de segurança, login e banco do Supabase respondendo, e catálogo
// do banco igual ao de dist/commerce.js (se divergir, os pedidos são recusados).
// Imprime um relatório em Markdown e sai com código 1 se alguma verificação falhar.
// A consulta ao banco também conta como atividade e evita a pausa do plano grátis do Supabase.
import {readFileSync} from 'node:fs';
import {PRODUCTS} from '../dist/commerce.js';

const SITE=process.env.SITE||'https://loja-duavesso.vercel.app/';
const api=readFileSync(new URL('../dist/api.js',import.meta.url),'utf8');
const SUPABASE_URL=api.match(/SUPABASE_URL='([^']+)'/)[1];
const KEY=api.match(/SUPABASE_KEY='(sb_publishable_[\w-]+)'/)[1]; // chave pública, a mesma do site
const HEADERS=['content-security-policy','strict-transport-security','x-frame-options','x-content-type-options'];

const rows=[];let failures=0;
const check=(name,ok,got,ms='')=>{rows.push(`| ${name} | ${ok?'ok':`**${got}**`} | ${ms} |`);if(!ok)failures++;};

async function get(url,headers={}){
 const t=Date.now();
 for(let attempt=0;;attempt++){
  try{
   const res=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
   return {res,ms:((Date.now()-t)/1000).toFixed(2)};
  }catch(error){
   if(attempt>=2)return {error:error.cause?.code||error.name||'sem resposta',ms:((Date.now()-t)/1000).toFixed(2)};
   await new Promise(r=>setTimeout(r,5000));
  }
 }
}

const site=await get(SITE);
check('Loja: página inicial',site.res?.status===200,site.res?.status??site.error,site.ms);
if(site.res){
 check('Loja: conteúdo da duavesso',/duavesso/i.test(await site.res.text()),'não contém duavesso');
 for(const h of HEADERS)check(`Cabeçalho ${h}`,site.res.headers.has(h),'ausente');
}

const auth=await get(`${SUPABASE_URL}/auth/v1/health`,{apikey:KEY});
check('Supabase: login (Auth)',auth.res?.status===200,auth.res?.status??auth.error,auth.ms);

const db=await get(`${SUPABASE_URL}/rest/v1/products?select=id,price_cents&active=eq.true&order=sort_order`,{apikey:KEY,Authorization:`Bearer ${KEY}`});
check('Supabase: banco (catálogo)',db.res?.status===200,db.res?.status??db.error,db.ms);
if(db.res?.status===200){
 const live=await db.res.json();
 const want=PRODUCTS.map(p=>`${p.id}:${p.price}`).join(', ');
 const got=live.map(p=>`${p.id}:${p.price_cents}`).join(', ');
 check('Catálogo do banco igual ao do site',got===want,`banco tem ${got||'nada'}; site vende ${want}`);
}

console.log(`Verificação de ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC\n`);
console.log('| Verificação | Resultado | Tempo (s) |\n|---|---|---|');
console.log(rows.join('\n'));
if(failures){
 console.log('\nDicas: Supabase sem resposta (sem DNS ou erro 540) costuma ser projeto pausado: painel do Supabase, Restore project.');
 console.log('Catálogo diferente: falta aplicar no SQL Editor a migração mais nova de supabase/migrations/.');
}
process.exitCode=failures?1:0;
