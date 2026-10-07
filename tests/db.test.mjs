// Banco: aplica as migrações reais num Postgres local (PGlite) com stubs do Supabase e confere
// que o catálogo do banco é o mesmo do site e que o place_order aceita todas as peças à venda.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {PRODUCTS} from '../dist/commerce.js';

const MIG=new URL('../supabase/migrations/',import.meta.url);
const MIGRATIONS=readdirSync(MIG).filter(f=>/^\d{4}_.+\.sql$/.test(f)).sort();
const customer={name:'Cliente Teste',email:'cliente@example.com',cep:'20040-002',city:'Rio de Janeiro',address:'Rua Um, 10'};
const uuid='0f8fad5b-d9cb-469f-a165-70867728950e';

async function freshDB(){
 const db=new PGlite();
 await db.exec(readFileSync(new URL('./fixtures/supabase-stubs.sql',import.meta.url),'utf8'));
 for(const f of MIGRATIONS)await db.exec(readFileSync(new URL(f,MIG),'utf8'));
 return db;
}
const db=await freshDB();
// Cada pedido roda numa transação desfeita no fim, para um caso não contaminar o outro.
async function order(items,{shipping='standard',cust=customer}={}){
 await db.exec('begin');
 try{
  const r=await db.query(`select public.place_order($1::jsonb,$2,'Pix',$3::jsonb) as r`,[JSON.stringify(cust),shipping,items===null?null:JSON.stringify(items)]);
  const rows=(await db.query('select product_id,kind,name,base,color,size,qty,unit_price_cents from public.order_items order by id')).rows;
  const ord=(await db.query('select uf,subtotal_cents,delivery_cents,total_cents from public.orders order by id desc limit 1')).rows[0];
  return {result:r.rows[0].r,items:rows,order:ord};
 }finally{await db.exec('rollback');}
}
const rejects=(items,re,opts)=>assert.rejects(order(items,opts),re);

test('all migrations apply in order and 0006 can be applied twice',async()=>{
 assert.ok(MIGRATIONS.includes('0006_catalogo_atual.sql'));
 await db.exec(readFileSync(new URL('0006_catalogo_atual.sql',MIG),'utf8'));
});

test('active catalog in the database matches dist/commerce.js field by field',async()=>{
 const rows=(await db.query('select * from public.products where active order by sort_order')).rows;
 assert.deepEqual(rows.map(r=>r.id),PRODUCTS.map(p=>p.id));
 for(const p of PRODUCTS){
  const r=rows.find(x=>x.id===p.id);
  for(const [col,key] of [['name','name'],['category','category'],['color','color'],['base','base'],['price_cents','price'],['tag','tag'],['graphic','graphic'],['graphic_class','graphicClass'],['description','description'],['print','print'],['fabric','fabric'],['finish','finish'],['fit','fit'],['care','care']])
   assert.equal(r[col],p[key]??'',`${p.id}.${col}`);
 }
});

test('color variants in the database match the site and old products are inactive',async()=>{
 const rows=(await db.query('select product_id,base,color from public.product_variants where active order by product_id,base')).rows;
 const site=PRODUCTS.flatMap(p=>(p.variants||[]).map(v=>({product_id:p.id,base:v.base,color:v.color}))).sort((a,b)=>(a.product_id+a.base).localeCompare(b.product_id+b.base));
 assert.deepEqual(rows,site);
 const old=(await db.query(`select id from public.products where id in ('off-line','sol-sol','essencial-preta','essencial-branca') and active`)).rows;
 assert.deepEqual(old,[]);
});

test('every product and every color sold on the site can be ordered at the database price',async()=>{
 for(const p of PRODUCTS){
  for(const v of p.variants||[{base:p.base,color:p.color}]){
   const {result,items}=await order([{kind:'catalog',product_id:p.id,base:v.base,size:'M',qty:2}]);
   assert.equal(result.subtotal_cents,p.price*2,p.id);
   assert.deepEqual({base:items[0].base,color:items[0].color,price:items[0].unit_price_cents},{base:v.base,color:v.color,price:p.price},`${p.id}/${v.base}`);
  }
 }
 // O site antigo (sem base no item) continua funcionando: usa a cor padrão do produto.
 const {items}=await order([{kind:'catalog',product_id:'simples',size:'G',qty:1}]);
 assert.deepEqual([items[0].base,items[0].color],['black','Preto lavado']);
});

test('order rejects unknown colors, old products, empty or null bags and bad quantities',async()=>{
 await rejects([{kind:'catalog',product_id:'heavy-faces',base:'white',size:'M',qty:1}],/Cor indisponível/);
 await rejects([{kind:'catalog',product_id:'off-line',size:'M',qty:1}],/Produto indisponível: off-line/);
 await rejects(null,/Sacola vazia/);
 await rejects([],/Sacola vazia/);
 await rejects([{kind:'catalog',product_id:'simples',size:'M',qty:0}],/Quantidade inválida/);
 await rejects([{kind:'catalog',product_id:'simples',size:'M',qty:'1;drop'}],/Quantidade inválida/);
 await rejects([{kind:'catalog',product_id:'simples',size:'XXL',qty:1}],/order_items_size_check/);
 await rejects([{kind:'hack',size:'M',qty:1}],/Item inválido/);
 await rejects([{kind:'catalog',product_id:'simples',size:'M',qty:1}],/UF inválida/,{cust:{...customer,uf:'Rio'}});
});

test('studio items, free shipping threshold, UF and order lookup with color',async()=>{
 const {result,order:o}=await order([
  {kind:'catalog',product_id:'heavy-avesso',size:'M',qty:1},
  {kind:'custom',base:'white',size:'G',qty:1,design:{mode:'create',prints:[{text:'OI'}]},preview_path:`${uuid}/preview.jpg`},
  {kind:'brief',base:'black',size:'P',qty:1,design:{mode:'brief',brief:'uma onda azul minimalista'}}
 ],{cust:{...customer,uf:'rj'}});
 assert.equal(result.subtotal_cents,15990+12990+14990);
 assert.equal(result.delivery_cents,0);
 assert.equal(o.uf,'RJ');
 const small=await order([{kind:'catalog',product_id:'simples',size:'M',qty:1}],{shipping:'standard'});
 assert.equal(small.result.delivery_cents,1490);
 await db.exec('begin');
 try{
  const r=(await db.query(`select public.place_order($1::jsonb,'express','Pix','[{"kind":"catalog","product_id":"simples","base":"brown","size":"G","qty":1}]'::jsonb) as r`,[JSON.stringify(customer)])).rows[0].r;
  const found=(await db.query('select public.get_order($1,$2) as o',[r.code,'CLIENTE@example.com'])).rows[0].o;
  assert.deepEqual(found.items.map(i=>[i.name,i.base,i.color]),[['Oversized Simples','brown','Marrom']]);
  assert.equal(found.total_cents,11990+2490);
 }finally{await db.exec('rollback');}
});

// Roda a consulta como o papel da chave pública, numa transação própria (um erro aborta a transação).
async function asAnon(sql){
 await db.exec('begin');
 try{await db.exec('set local role anon');return (await db.query(sql)).rows;}
 finally{await db.exec('rollback');}
}
test('public key sees only active catalog and variants and cannot read orders',async()=>{
 assert.deepEqual((await asAnon('select id from public.products order by sort_order')).map(r=>r.id),PRODUCTS.map(p=>p.id));
 assert.equal((await asAnon('select count(*)::int as n from public.product_variants'))[0].n,3);
 for(const sql of ['select * from public.orders','select * from public.order_items',`insert into public.product_variants values ('simples','black','X')`])
  await assert.rejects(asAnon(sql),/permission denied/,sql);
});
