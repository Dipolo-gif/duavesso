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

test('all migrations apply in order and 0006 and 0007 can be applied twice',async()=>{
 for(const f of ['0006_catalogo_atual.sql','0007_seguranca_limites_rastreio.sql']){assert.ok(MIGRATIONS.includes(f));await db.exec(readFileSync(new URL(f,MIG),'utf8'));}
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

// Executa como a API do Supabase faria: papel, usuário logado (sub) e IP do cliente, numa transação desfeita no fim.
async function asApi(fn,{role='anon',sub=null,ip=null}={}){
 await db.exec('begin');
 try{
  if(sub)await db.query("select set_config('request.jwt.claim.sub',$1,true)",[sub]);
  if(ip)await db.query("select set_config('request.headers',$1,true)",[JSON.stringify({'cf-connecting-ip':ip})]);
  await db.exec(`set local role ${role}`);
  return await fn();
 }finally{await db.exec('rollback');}
}
// Como asApi, mas grava (commit): para o que precisa persistir entre chamadas, como o limite de CPF.
async function asUser(sub,sql,params=[]){
 await db.exec('begin');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[sub]);
  await db.exec('set local role authenticated');
  const r=await db.query(sql,params);await db.exec('commit');return r;
 }catch(error){await db.exec('rollback');throw error;}
}
const placeAs=email=>db.query(`select public.place_order($1::jsonb,'standard','Pix',$2::jsonb) as r`,[JSON.stringify({...customer,email}),JSON.stringify([{kind:'catalog',product_id:'simples',size:'M',qty:1}])]);
// CPF válido a partir dos 9 primeiros dígitos
function cpf(base){const d=[...base].map(Number);for(const n of [9,10]){let s=0;for(let i=0;i<n;i++)s+=d[i]*(n+1-i);const r=(s*10)%11;d.push(r===10?0:r);}return d.join('');}

test('internal trigger functions and the private schema are closed to the public key',async()=>{
 const can=async(role,fn)=>(await db.query('select has_function_privilege($1,$2,$3) as ok',[role,fn,'execute'])).rows[0].ok;
 for(const role of ['anon','authenticated']){
  assert.equal(await can(role,'public.handle_new_user()'),false,role);
  assert.equal(await can(role,'public.touch_updated_at()'),false,role);
  assert.equal(await can(role,'private.take(text,integer,integer)'),false,role);
 }
 assert.equal(await can('anon','public.set_profile_cpf(text)'),false);
 assert.equal(await can('authenticated','public.set_profile_cpf(text)'),true);
});

test('orders: 20 per IP per hour, other IPs unaffected, calls without IP only hit the e-mail limit',async()=>{
 await asApi(async()=>{
  for(let i=0;i<20;i++)await placeAs(`ip${i}@example.com`);
  await assert.rejects(placeAs('ip20@example.com'),/Muitas tentativas/);
 },{ip:'1.1.1.1'});
 await asApi(()=>placeAs('outro@example.com'),{ip:'2.2.2.2'});
 await asApi(async()=>{for(let i=0;i<25;i++)await placeAs(`semip${i}@example.com`);});
});

test('newsletter: 10 per IP per hour; order lookup: 30 per IP per hour',async()=>{
 await asApi(async()=>{
  for(let i=0;i<10;i++)await db.query('select public.subscribe_newsletter($1)',[`n${i}@example.com`]);
  await assert.rejects(db.query('select public.subscribe_newsletter($1)',['n10@example.com']),/Muitas tentativas/);
 },{ip:'3.3.3.3'});
 await asApi(async()=>{
  for(let i=0;i<30;i++)await db.query(`select public.get_order('AV-X','a@example.com')`);
  await assert.rejects(db.query(`select public.get_order('AV-X','a@example.com')`),/Muitas tentativas/);
 },{ip:'4.4.4.4'});
});

test('order timeline records creation and every status change; tracking tables are private',async()=>{
 await db.exec('begin');
 try{
  const code=(await placeAs('linha@example.com')).rows[0].r.code;
  await db.query(`update public.orders set status='pago' where code=$1`,[code]);
  await db.query(`update public.orders set status='em_producao' where code=$1`,[code]);
  const ev=(await db.query('select e.type,e.status_from,e.status_to from public.order_events e join public.orders o on o.id=e.order_id where o.code=$1 order by e.id',[code])).rows;
  assert.deepEqual(ev.map(e=>[e.type,e.status_from,e.status_to]),[['created',null,'aguardando_pagamento'],['status_changed','aguardando_pagamento','pago'],['status_changed','pago','em_producao']]);
 }finally{await db.exec('rollback');}
 for(const sql of ['select * from public.order_events','select * from public.payment_attempts','select * from public.payment_webhooks'])
  await assert.rejects(asApi(()=>db.query(sql)),/permission denied/,sql);
});

test('CPF: only set_profile_cpf writes it, digits are checked and changes are capped at 5 a day',async()=>{
 const u1='aaaaaaaa-0000-4000-8000-000000000001',u2='aaaaaaaa-0000-4000-8000-000000000002';
 await db.query('insert into auth.users (id,email,raw_user_meta_data) values ($1,$2,$3::jsonb),($4,$5,$6::jsonb)',[u1,'u1@example.com',JSON.stringify({name:'Um'}),u2,'u2@example.com','{}']);
 try{
  assert.equal((await db.query('select name from public.profiles where id=$1',[u1])).rows[0].name,'Um','o cadastro ainda cria o perfil');
  const A=cpf('529982247'),set=async(c,sub=u1)=>(await asUser(sub,'select public.set_profile_cpf($1) as r',[c])).rows[0].r;
  assert.deepEqual(await set(A,u2),{ok:true});
  assert.equal((await db.query('select cpf from public.profiles where id=$1',[u2])).rows[0].cpf,A);
  await assert.rejects(asUser(u1,'update public.profiles set cpf=$1 where id=$2',[cpf('111444777'),u1]),/permission denied/);
  assert.equal((await asUser(u1,`update public.profiles set name='Novo' where id=$1`,[u1])).affectedRows,1,'o resto do perfil continua editável');
  assert.match((await set('12345678900')).message,/CPF inválido/);
  assert.match((await set(A)).message,/já está cadastrado/,'1ª tentativa conta');
  for(const base of ['111444777','222333444','333222111','444555666'])assert.deepEqual(await set(cpf(base)),{ok:true});
  assert.match((await set(cpf('555666777'))).message,/Muitas alterações de CPF/,'6ª tentativa no dia');
  assert.equal((await db.query('select cpf from public.profiles where id=$1',[u1])).rows[0].cpf,cpf('444555666'));
  assert.deepEqual(await set(cpf('444555666')),{ok:true},'repetir o CPF atual não gasta tentativa');
  await assert.rejects(asApi(()=>db.query('select public.set_profile_cpf($1)',[A])),/permission denied/,'a chave pública sem login não chama');
 }finally{
  await db.query('delete from auth.users where id in ($1,$2)',[u1,u2]);await db.query('delete from private.rate_limits');
 }
});

test('studio uploads stop at the hourly cap set in store_settings',async()=>{
 await db.exec('begin');
 try{
  await db.query(`update public.store_settings set value='3' where key='designs_uploads_per_hour'`);
  await db.exec('set local role anon');
  const up=()=>db.query(`insert into storage.objects (bucket_id,name) values ('designs',gen_random_uuid()||'/preview.jpg')`);
  for(let i=0;i<3;i++)await up();
  await assert.rejects(up(),/row-level security/);
 }finally{await db.exec('rollback');}
});
