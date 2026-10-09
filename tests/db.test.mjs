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

test('all migrations apply in order and 0006 to 0013 can be applied twice',async()=>{
 for(const f of ['0006_catalogo_atual.sql','0007_seguranca_limites_rastreio.sql','0008_checkout_boleto_parcelas_cupom.sql','0009_marcas_base.sql','0010_sobre_e_pedidos_de_marca.sql','0011_excluir_marca.sql','0012_financeiro_e_vendas.sql','0013_tecidos_do_fornecedor.sql']){assert.ok(MIGRATIONS.includes(f));await db.exec(readFileSync(new URL(f,MIG),'utf8'));}
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

// 0008 -----------------------------------------------------------------------------------------
const orderWith=(items,{payment='Pix',shipping='standard',cust={}}={})=>db.query(`select public.place_order($1::jsonb,$2,$3,$4::jsonb) as r`,[JSON.stringify({...customer,...cust}),shipping,payment,JSON.stringify(items)]).then(r=>r.rows[0].r);
const tee=(id,qty=1)=>({kind:'catalog',product_id:id,size:'M',qty});
async function inTx(fn){await db.exec('begin');try{return await fn();}finally{await db.exec('rollback');}}

test('boleto is accepted; installments only on card, from 1 to the store maximum',async()=>{
 await inTx(async()=>{
  assert.equal((await orderWith([tee('simples')],{payment:'Boleto'})).installments,1);
  assert.equal((await orderWith([tee('simples')],{payment:'Cartão',cust:{installments:3}})).installments,3);
  assert.equal((await orderWith([tee('simples')],{payment:'Pix',cust:{installments:3}})).installments,1,'Pix ignora parcelas');
  const row=(await db.query('select installments from public.orders order by id desc limit 1')).rows[0];assert.equal(row.installments,1);
 });
 await inTx(()=>assert.rejects(orderWith([tee('simples')],{payment:'Cartão',cust:{installments:4}}),/Parcelamento inválido/));
 await inTx(()=>assert.rejects(orderWith([tee('simples')],{payment:'Dinheiro'}),/Pagamento inválido/));
});

test('promotions: free shipping threshold comes from the table and the cheapest piece can be free',async()=>{
 await inTx(async()=>{
  await db.query(`update public.promotions set min_subtotal_cents=30000 where kind='free_shipping'`);
  assert.equal((await orderWith([tee('heavy-avesso'),tee('simples')])).delivery_cents,1490,'27.980 não chega a 30.000');
  assert.equal((await orderWith([tee('heavy-avesso',2)])).delivery_cents,0,'31.980 libera o frete');
  await db.query(`insert into public.promotions (kind,min_subtotal_cents,label) values ('cheapest_free',40000,'Compre 400 e leve a mais barata')`);
  const r=await orderWith([tee('heavy-avesso',2),tee('simples')]);
  assert.deepEqual([r.subtotal_cents,r.promo_discount_cents,r.total_cents],[43970,11990,31980]);
  assert.equal(r.delivery_cents,0,'31.980 depois do desconto ainda libera o frete de 30.000');
  assert.equal((await orderWith([tee('heavy-avesso',2)])).promo_discount_cents,0,'abaixo de 400 não ganha');
  await db.query(`update public.promotions set ends_at=now()-interval '1 day' where kind='cheapest_free'`);
  assert.equal((await orderWith([tee('heavy-avesso',2),tee('simples')])).promo_discount_cents,0,'promoção vencida não vale');
 });
 const visible=await asApi(()=>db.query('select kind,min_subtotal_cents from public.promotions'));
 assert.deepEqual(visible.rows,[{kind:'free_shipping',min_subtotal_cents:25000}],'a chave pública lê só as promoções em vigor');
});

test('coupons: preview and order use the same server rule, limits and dates are enforced, codes stay private',async()=>{
 await inTx(async()=>{
  await db.query(`insert into public.coupons (code,kind,value,min_subtotal_cents,max_uses,uses,ends_at) values
   ('DEZ','percent',10,0,null,0,null),('VINTE','fixed',2000,20000,null,0,null),('ESGOTADO','percent',10,0,1,1,null),('VENCIDO','percent',10,0,null,0,now()-interval '1 day')`);
  const check=async(c,s)=>(await db.query('select public.check_coupon($1,$2) as r',[c,s])).rows[0].r;
  assert.deepEqual(await check('dez',15990),{ok:true,code:'DEZ',discount_cents:1599});
  assert.deepEqual(await check('VINTE',15990),{ok:false,message:'Este cupom vale para compras a partir de R$ 200,00.'});
  assert.equal((await check('ESGOTADO',15990)).ok,false);assert.equal((await check('VENCIDO',15990)).ok,false);assert.equal((await check('NADA',15990)).ok,false);
  const r=await orderWith([tee('heavy-avesso',2)],{cust:{coupon:'vinte'}});
  assert.deepEqual([r.subtotal_cents,r.coupon_discount_cents,r.delivery_cents,r.total_cents],[31980,2000,0,29980]);
  assert.equal((await db.query(`select uses from public.coupons where code='VINTE'`)).rows[0].uses,1,'conta o uso');
  assert.deepEqual((await db.query(`select coupon_code,discount_cents from public.orders order by id desc limit 1`)).rows[0],{coupon_code:'VINTE',discount_cents:2000});
  await assert.rejects(orderWith([tee('simples')],{cust:{coupon:'ESGOTADO'}}),/Cupom inválido ou expirado/);
 });
 await assert.rejects(asApi(()=>db.query('select * from public.coupons')),/permission denied/);
 await asApi(async()=>{
  for(let i=0;i<20;i++)await db.query(`select public.check_coupon('X',100)`);
  await assert.rejects(db.query(`select public.check_coupon('X',100)`),/Muitas tentativas/);
 },{ip:'5.5.5.5'});
});

// 0009 · Marcas parceiras ------------------------------------------------------------------------
const ADMIN='bbbbbbbb-0000-4000-8000-00000000000a',OWNER='bbbbbbbb-0000-4000-8000-00000000000b',OTHER='bbbbbbbb-0000-4000-8000-00000000000c';
async function brandUsers(){
 await db.query(`insert into auth.users (id,email,email_confirmed_at) values ($1,'duavesso.co@gmail.com',now()),($2,'dono@exemplo.com',now()),($3,'outra@exemplo.com',now()) on conflict (id) do nothing`,[ADMIN,OWNER,OTHER]);
}
// Executa como uma pessoa logada e desfaz no fim (o erro de uma consulta não contamina a outra)
async function as(sub,sql,params=[]){
 await db.exec('begin');
 try{if(sub)await db.query("select set_config('request.jwt.claim.sub',$1,true)",[sub]);await db.exec(`set local role ${sub?'authenticated':'anon'}`);return await db.query(sql,params);}
 finally{await db.exec('rollback');}
}
const asAdmin=(sql,p)=>as(ADMIN,sql,p);

test('marcas: só a conta da duavesso com e-mail confirmado é administradora',async()=>{
 await brandUsers();
 const admin=async sub=>(await as(sub,'select public.is_admin() as a')).rows[0].a;
 assert.equal(await admin(null),false);assert.equal(await admin(OWNER),false);assert.equal(await admin(ADMIN),true);
 await db.query(`update auth.users set email_confirmed_at=null where id=$1`,[ADMIN]);
 try{assert.equal(await admin(ADMIN),false,'e-mail não confirmado não vira admin');}
 finally{await db.query(`update auth.users set email_confirmed_at=now() where id=$1`,[ADMIN]);}
});

test('marcas: as 3 marcas de hoje estão no banco e o público só vê as ativas',async()=>{
 await brandUsers();
 const pub=(await as(null,'select slug,name,tagline from public.brands order by slug')).rows;
 assert.deepEqual(pub.map(b=>b.slug),['geek','solfado','try84']);
 assert.equal(pub.find(b=>b.slug==='try84').tagline,'rugby lifestyle · forward together');
 assert.deepEqual((await db.query(`select id from public.products where brand_slug='geek' order by id`)).rows.map(r=>r.id),['geek-carpa','geek-coracao']);
 await db.exec('begin');
 try{
  await db.query(`update public.brands set status='suspended' where slug='solfado'`);
  await db.query(`insert into public.brand_members (brand_slug,user_id) values ('solfado',$1)`,[OWNER]);
  await db.query("select set_config('request.jwt.claim.sub','',true)");await db.exec('set local role anon');
  assert.deepEqual((await db.query('select slug from public.brands order by slug')).rows.map(b=>b.slug),['geek','try84'],'suspensa some do público');
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER]);await db.exec('set local role authenticated');
  assert.deepEqual((await db.query(`select slug from public.brands where slug='solfado'`)).rows.length,1,'o dono ainda vê a própria marca suspensa');
 }finally{await db.exec('rollback');}
});

test('marcas: o dono edita só o conteúdo da própria marca, nunca situação ou plano',async()=>{
 await brandUsers();
 await db.exec('begin');
 try{
  await db.query(`insert into public.brand_members (brand_slug,user_id) values ('try84',$1)`,[OWNER]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER]);await db.exec('set local role authenticated');
  const up=await db.query(`update public.brands set bio='Nova bio', theme='{"mode":"gradient","c1":"#112233","c2":"#ffeedd","angle":90,"accent":"#ff0066"}', links='{"instagram":"try84","site":"https://try84.com.br"}' where slug='try84'`);
  assert.equal(up.affectedRows,1);
  assert.equal((await db.query(`update public.brands set bio='invasão' where slug='geek'`)).affectedRows,0,'marca de outro: nada muda');
  assert.deepEqual((await db.query('select slug from public.my_brands()')).rows.map(r=>r.slug),['try84']);
 }finally{await db.exec('rollback');}
 for(const sql of [`update public.brands set status='active' where slug='try84'`,`update public.brands set plan='paid' where slug='try84'`,`update public.brands set slug='x' where slug='try84'`,`insert into public.brands (slug,name) values ('nova','Nova')`,`delete from public.brands where slug='try84'`])
  await assert.rejects(as(OWNER,sql),/permission denied/,sql);
});

test('marcas: cores, links, imagens e peça em destaque são conferidos pelo banco',async()=>{
 await brandUsers();
 const bad=[[`theme='{"mode":"solid","c1":"red","c2":"#000000","angle":0,"accent":"#ffffff"}'`,'cor fora do formato'],[`theme='{"mode":"neon","c1":"#000000","c2":"#000000","angle":0,"accent":"#ffffff"}'`,'modo inválido'],[`theme='{"mode":"solid","c1":"#000000","c2":"#000000","angle":999,"accent":"#ffffff"}'`,'ângulo'],[`links='{"site":"javascript:alert(1)"}'`,'link perigoso'],[`links='{"tiktok":"x"}'`,'link desconhecido'],[`logo_path='geek/logo-abcdef.webp'`,'imagem de outra marca'],[`cover_path='http://evil.com/x.jpg'`,'imagem externa']];
 for(const [set,why] of bad)await assert.rejects(asAdmin(`update public.brands set ${set} where slug='try84'`),/check|violates/,why);
 await asAdmin(`update public.brands set logo_path='try84/logo-abc123.webp', cover_path='assets/try84-hero.jpg' where slug='try84'`);
 await asAdmin(`update public.brands set featured_product_id='geek-coracao', featured_badge='Lançamento', featured_until=now()+interval '3 days' where slug='geek'`);
 await assert.rejects(asAdmin(`update public.brands set featured_product_id='heavy-avesso' where slug='geek'`),/peça ativa da sua marca/);
});

test('marcas: painel da duavesso cria marca por e-mail, suspende e marca o plano pago',async()=>{
 await brandUsers();
 await assert.rejects(as(OWNER,`select public.admin_list_brands()`),/Área restrita/);
 await assert.rejects(as(null,`select public.admin_list_brands()`),/permission denied/);
 await db.exec('begin');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ADMIN]);await db.exec('set local role authenticated');
  assert.deepEqual((await db.query(`select public.admin_create_brand('DONO@exemplo.com','estudio-mar','Estúdio Mar') as r`)).rows[0].r,{slug:'estudio-mar'});
  await assert.rejects(db.query(`select public.admin_create_brand('ninguem@exemplo.com','x-y','X')`),/Não existe conta/);
 }finally{await db.exec('rollback');}
 await db.exec('begin');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ADMIN]);await db.exec('set local role authenticated');
  await db.query(`select public.admin_create_brand('dono@exemplo.com','try84','TRY84')`);
  await db.query(`select public.admin_set_brand_plan('try84','paid','Pix recebido em 08/10')`);
  await db.query(`select public.admin_set_brand_status('try84','suspended')`);
  const list=(await db.query('select public.admin_list_brands() as l')).rows[0].l,t=list.find(b=>b.slug==='try84');
  assert.deepEqual([t.plan,t.status,t.paid_note,t.owners.map(o=>o.email)],['paid','suspended','Pix recebido em 08/10',['dono@exemplo.com']]);
  assert(t.paid_at,'data do pagamento');
  assert.equal(list.find(b=>b.slug==='geek').products,2);
  await db.query(`select public.admin_remove_owner('try84','dono@exemplo.com')`);
  assert.equal((await db.query(`select count(*)::int as n from public.brand_members where brand_slug='try84'`)).rows[0].n,0);
 }finally{await db.exec('rollback');}
});

test('marcas: imagens só na pasta da própria marca e com nome no padrão',async()=>{
 await brandUsers();
 await db.exec('begin');
 try{
  await db.query(`insert into public.brand_members (brand_slug,user_id) values ('try84',$1)`,[OWNER]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER]);await db.exec('set local role authenticated');
  await db.query(`insert into storage.objects (bucket_id,name) values ('brand-assets','try84/logo-a1b2c3d4.webp')`);
  for(const name of ['geek/logo-a1b2c3d4.webp','try84/script-a1b2c3d4.webp','try84/sub/logo-a1b2c3d4.webp'])
   await db.query('savepoint s').then(()=>assert.rejects(db.query(`insert into storage.objects (bucket_id,name) values ('brand-assets',$1)`,[name]),/row-level security/,name)).then(()=>db.query('rollback to savepoint s'));
 }finally{await db.exec('rollback');}
});

test('marcas: o dono escreve o "Sobre a marca" e envia a foto dele; o banco confere tamanho e caminho',async()=>{
 await brandUsers();
 await db.exec('begin');
 try{
  await db.query(`insert into public.brand_members (brand_slug,user_id) values ('geek',$1)`,[OWNER]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER]);await db.exec('set local role authenticated');
  const up=await db.query(`update public.brands set about=$1, about_path='geek/about-a1b2c3d4.webp' where slug='geek' returning about`,['Nasceu numa lan house, entre um campeonato e outro.']);
  assert.equal(up.rows[0].about,'Nasceu numa lan house, entre um campeonato e outro.');
  await db.query(`insert into storage.objects (bucket_id,name) values ('brand-assets','geek/about-a1b2c3d4.webp')`);
  for(const [set,why] of [[`about=repeat('x',1501)`,'texto longo demais'],[`about_path='try84/about-a1b2c3d4.webp'`,'foto na pasta de outra marca'],[`about_path='geek/about.png'`,'nome fora do padrão']])
   await db.query('savepoint s').then(()=>assert.rejects(db.query(`update public.brands set ${set} where slug='geek'`),/check|violates/,why)).then(()=>db.query('rollback to savepoint s'));
 }finally{await db.exec('rollback');}
});

test('pedidos de marca: qualquer pessoa envia, só a duavesso lê e responde, com limite por IP e por e-mail',async()=>{
 await brandUsers();
 const apply=(email,brand='Estúdio Mar')=>db.query('select public.apply_brand($1,$2,$3,$4,$5)',['Ana Souza',email,brand,'@estudiomar','Estampas de surf feitas em Niterói.']);
 await asApi(async()=>{
  for(let i=0;i<3;i++)await apply(`ana${i}@exemplo.com`);
  await assert.rejects(apply('ana3@exemplo.com'),/Muitas tentativas/,'3 por IP por hora');
 },{ip:'5.5.5.5'});
 await asApi(async()=>{
  for(let i=0;i<3;i++)await apply('mesma@exemplo.com');
  await assert.rejects(apply('mesma@exemplo.com'),/Muitas tentativas/,'3 por e-mail por dia');
 });
 await asApi(()=>assert.rejects(apply('curto@exemplo.com','A'),/check|violates/,'nome da marca curto demais'),{ip:'6.6.6.6'});
 await asApi(()=>assert.rejects(db.query('select * from public.brand_applications'),/permission denied/,'visitante não lê a fila'));
 await asApi(()=>assert.rejects(db.query(`insert into public.brand_applications (name,email,brand_name,about) values ('Ana','a@exemplo.com','Mar','Estampas de surf.')`),/permission denied/,'nem grava direto'));
 await db.exec('begin');
 try{
  await db.exec('set local role anon');await apply('Pedido@Exemplo.com');await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER]);await db.exec('set local role authenticated');
  await db.query('savepoint s');await assert.rejects(db.query('select * from public.admin_list_applications()'),/Área restrita/,'dono de marca não vê a fila');await db.query('rollback to savepoint s');
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ADMIN]);await db.exec('set local role authenticated');
  const list=(await db.query('select id,email,instagram,status from public.admin_list_applications()')).rows;
  assert.deepEqual(list.map(r=>[r.email,r.instagram,r.status]),[['pedido@exemplo.com','estudiomar','new']]);
  await db.query('select public.admin_set_application_status($1,$2)',[list[0].id,'contacted']);
  assert.equal((await db.query('select status from public.admin_list_applications()')).rows[0].status,'contacted');
 }finally{await db.exec('rollback');}
});

test('excluir loja: só a duavesso, com o nome digitado, e nunca com peças à venda; apaga donos e libera as imagens',async()=>{
 await brandUsers();
 const del=(slug,confirm)=>db.query('select public.admin_delete_brand($1,$2)',[slug,confirm]);
 await db.exec('begin');
 try{
  await db.query(`insert into public.brand_members (brand_slug,user_id) values ('try84',$1)`,[OWNER]);
  await db.query(`insert into storage.objects (bucket_id,name) values ('brand-assets','try84/logo-a1b2c3d4.webp')`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[OWNER]);await db.exec('set local role authenticated');
  const step=async(fn,re,why)=>{await db.query('savepoint s');await assert.rejects(fn(),re,why);await db.query('rollback to savepoint s');};
  await step(()=>del('try84','TRY84'),/Área restrita/,'dono de marca não exclui');
  assert.equal((await db.query(`delete from storage.objects where bucket_id='brand-assets' returning name`)).rows.length,0,'dono não apaga imagens');
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ADMIN]);await db.exec('set local role authenticated');
  await step(()=>del('try84','TRY 84'),/não confere/,'nome errado');
  await step(()=>del('geek','duavessogeek'),/tem 2 peça\(s\) à venda/,'marca com peças à venda');
  await step(()=>del('nao-existe','x'),/não encontrada/);
  await del('try84','  try84 ');
  assert.equal((await db.query(`select count(*)::int as n from public.brands where slug='try84'`)).rows[0].n,0,'marca apagada');
  assert.equal((await db.query(`select count(*)::int as n from public.brand_members where brand_slug='try84'`)).rows[0].n,0,'donos apagados');
  assert.deepEqual((await db.query(`select name from storage.objects where bucket_id='brand-assets' and name like 'try84/%'`)).rows.map(r=>r.name),['try84/logo-a1b2c3d4.webp'],'a administradora lista as imagens');
  assert.equal((await db.query(`delete from storage.objects where bucket_id='brand-assets' and name like 'try84/%' returning name`)).rows.length,1,'e apaga');
 }finally{await db.exec('rollback');}
});

// Financeiro e vendas das marcas (migração 0012) ---------------------------------------------------
const brToday=()=>new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
const daysAgo=n=>new Date(Date.now()-3*3600e3-n*864e5).toISOString().slice(0,10);
async function roleIs(sub){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[sub]);await db.exec('set local role authenticated');}
async function rejectsIn(fn,re,why){await db.query('savepoint s');try{await assert.rejects(fn(),re,why);}finally{await db.query('rollback to savepoint s');}}

test('financeiro: pedido pago congela custo e lucro da marca; caixa, comparação, a repassar e vendas da marca sem dados de cliente',async()=>{
 await brandUsers();
 await db.exec('begin');
 try{
  await db.query(`insert into public.brand_members (brand_slug,user_id) values ('geek',$1)`,[OWNER]);
  await db.query(`insert into private.product_finance (product_id,unit_cost_cents,brand_base_cents) values ('geek-coracao',4500,11990),('heavy-avesso',5200,null)`);
  const order=await orderWith([tee('geek-coracao',2),tee('heavy-avesso',1)],{cust:{uf:'SP'}});
  const id=(await db.query('select id from public.orders where code=$1',[order.code])).rows[0].id;
  assert.equal((await db.query('select paid_at from public.orders where id=$1',[id])).rows[0].paid_at,null,'aguardando pagamento não tem data de venda');
  // A administradora marca como pago pelo painel
  await roleIs(OWNER);
  await rejectsIn(()=>db.query('select public.admin_set_order_status($1,$2)',[order.code,'pago']),/Área restrita/,'dono de marca não mexe em pedidos');
  await rejectsIn(()=>db.query('select * from private.sale_lines'),/permission denied/,'esquema privado fechado');
  await roleIs(ADMIN);
  await db.query('select public.admin_set_order_status($1,$2)',[order.code,'pago']);
  await db.exec('reset role');
  const lines=(await db.query('select product_id,brand_slug,qty,unit_cost_cents,brand_margin_cents from private.sale_lines where order_id=$1 order by product_id',[id])).rows;
  assert.deepEqual(lines.map(l=>[l.product_id,l.brand_slug,l.qty,l.unit_cost_cents,l.brand_margin_cents]),
   [['geek-coracao','geek',2,4500,8000],['heavy-avesso',null,1,5200,0]],'lucro da marca = (159,90 − 119,90) × 2; peça da duavesso sem parte de marca');
  assert.equal((await db.query(`select source from public.order_events where order_id=$1 and type='status_changed'`,[id])).rows[0].source,'painel');
  // Mudar o preço base depois não muda a venda já feita
  await db.query(`update private.product_finance set brand_base_cents=13990 where product_id='geek-coracao'`);
  await db.query(`update public.orders set status='em_producao' where id=$1`,[id]);
  assert.equal((await db.query(`select brand_margin_cents from private.sale_lines where order_id=$1 and product_id='geek-coracao'`,[id])).rows[0].brand_margin_cents,8000);
  // Lançamentos manuais
  await roleIs(ADMIN);
  const add=(kind,cat,cents,brand=null,on=brToday())=>db.query('select public.admin_add_entry($1,$2,$3,$4::date,$5,$6,$7) as id',[kind,cat,cents,on,'Pix','teste',brand]).then(r=>r.rows[0].id);
  await add('in','Venda por fora',45000);
  const prod=await add('out','Produção',38000);
  await add('out','Repasse a marcas',3000,'geek');
  await add('in','Venda por fora',10000,null,daysAgo(40));
  await rejectsIn(()=>add('out','Repasse a marcas',100),/Escolha a marca/,'repasse sem marca');
  await rejectsIn(()=>add('in','Produção',100),/check|violates/,'categoria de saída como entrada');
  await rejectsIn(()=>db.query(`select public.admin_set_product_finance('heavy-avesso',100,9000)`),/só para peças de marca/);
  await rejectsIn(()=>db.query(`select public.admin_set_product_finance('geek-coracao',100,99999)`),/não pode passar do preço/);
  const rep=(await db.query('select public.admin_finance_report($1::date,$2::date) as r',[daysAgo(29),brToday()])).rows[0].r;
  assert.equal(rep.current.site_in,order.total_cents);assert.equal(rep.current.in,order.total_cents+45000);
  assert.equal(rep.current.out,41000);assert.equal(rep.current.profit,order.total_cents+45000-41000);
  assert.equal(rep.current.est_margin,order.total_cents-(4500*2+5200)-8000,'margem estimada = vendas − custo das peças − parte das marcas');
  assert.equal(rep.previous.in,10000,'período anterior de mesmo tamanho');
  assert.deepEqual(rep.to_pay_brands.map(b=>[b.slug,b.earned,b.paid,b.due]),[['geek',8000,3000,5000]]);
  assert.deepEqual(rep.out_by_category.map(c=>c.category),['Produção','Repasse a marcas']);
  assert.equal(rep.entries.length,4,'pedido do site + 3 lançamentos do período');
  assert.equal(rep.series.length,30,'um ponto por dia');
  assert.equal(rep.series.reduce((s,b)=>s+Number(b.in),0),rep.current.in,'gráfico soma o mesmo que os números');
  await db.query('select public.admin_delete_entry($1)',[prod]);
  assert.equal((await db.query('select public.admin_finance_report($1::date,$2::date) as r',[daysAgo(29),brToday()])).rows[0].r.current.out,3000);
  // Vendas da marca: o dono vê números, nunca dados de quem comprou
  await roleIs(OTHER);
  await rejectsIn(()=>db.query('select public.brand_sales_report($1,$2::date,$3::date)',['geek',daysAgo(29),brToday()]),/Só quem cuida da marca/);
  await roleIs(OWNER);
  const br=(await db.query('select public.brand_sales_report($1,$2::date,$3::date) as r',['geek',daysAgo(29),brToday()])).rows[0].r;
  assert.deepEqual(br.current,{sales:31980,pieces:2,profit:8000,orders:1});
  assert.deepEqual(br.previous,{sales:0,pieces:0,profit:0,orders:0});
  assert.deepEqual(br.top.map(t=>[t.product_id,t.qty,t.profit]),[['geek-coracao',2,8000]]);
  assert.deepEqual(br.sizes,[{size:'M',qty:2}]);assert.deepEqual(br.states,[{uf:'SP',qty:2}]);
  assert.equal(br.balance.earned,8000);assert.equal(br.balance.received,3000);assert.equal(br.balance.last.cents,3000);
  const raw=JSON.stringify(br);for(const secret of [customer.email,customer.name,customer.address,customer.cep])assert(!raw.includes(secret),`sem ${secret}`);
  // Cancelado sai da conta
  await roleIs(ADMIN);await db.query('select public.admin_set_order_status($1,$2)',[order.code,'cancelado']);
  await roleIs(OWNER);
  assert.equal((await db.query('select public.brand_sales_report($1,$2::date,$3::date) as r',['geek',daysAgo(29),brToday()])).rows[0].r.current.sales,0);
  // Pedidos no painel: lista com contagem por situação, itens e linha do tempo
  await roleIs(ADMIN);
  const list=(await db.query(`select public.admin_list_orders('cancelado',null,50,0) as r`)).rows[0].r;
  assert.equal(list.orders.length,1);assert.equal(list.orders[0].code,order.code);assert.equal(list.counts.cancelado,1);
  assert.deepEqual(list.orders[0].events.map(e=>e.to),['aguardando_pagamento','pago','em_producao','cancelado']);
  assert.equal((await db.query(`select public.admin_list_orders(null,'cliente teste',50,0) as r`)).rows[0].r.orders.length,1,'busca pelo nome');
 }finally{await db.exec('rollback');}
});
