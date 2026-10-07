// Auditoria (somente leitura do projeto): roda as migrações reais num Postgres local (PGlite)
// e compara o place_order atual com a proposta 0006.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';

const MIG = 'D:/SSD-Offload/doavesso/supabase/migrations/';
const db = new PGlite();
const out = (...a) => console.log(...a);
const tryq = async (sql, params = []) => {
  try { return {ok: true, rows: (await db.query(sql, params)).rows}; }
  catch (e) { return {ok: false, code: e.code, msg: e.message}; }
};

await db.exec(readFileSync(new URL('./stubs.sql', import.meta.url), 'utf8'));
for (const f of ['0001_avesso_init.sql', '0002_tighten_function_grants.sql', '0003_accounts.sql', '0004_profile_fields.sql', '0005_cpf_unique.sql']) {
  await db.exec(readFileSync(MIG + f, 'utf8'));
}
out('migrações 0001 a 0005 aplicadas');

out('\n== A) O catálogo atual do site cabe no esquema atual?');
for (const [id, cat, base] of [['heavy-faces', 'graphic', 'brown'], ['simples', 'simples', 'black']]) {
  const r = await tryq(`insert into public.products (id,name,category,color,base,price_cents) values ($1,'x',$2,'x',$3,15990)`, [id, cat, base]);
  out(id, r.ok ? 'OK' : `RECUSADO ${r.code}: ${r.msg}`);
}

// Produtos válidos no esquema antigo, com o mesmo preço da proposta, para comparar as duas versões.
await db.exec(`insert into public.products (id,name,category,color,base,price_cents,sort_order) values
  ('heavy-avesso','Heavy · Do Avesso','graphic','Preto lavado','black',15990,1),
  ('geek-carpa','Carpa Japonesa','graphic','Off white','white',15990,6),
  ('off-line','Oversized Off Line','graphic','Preto lavado','black',12990,9)`);

const customer = {name: 'Cliente Teste', email: 'cliente@example.com', cep: '20040-002', city: 'Rio de Janeiro', address: 'Rua Um, 10', uf: 'RJ'};
const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CASES = {
  valido: [
    {kind: 'catalog', product_id: 'heavy-avesso', size: 'M', qty: 2},
    {kind: 'catalog', product_id: 'geek-carpa', size: 'G', qty: 1},
    {kind: 'custom', base: 'white', size: 'G', qty: 1, design: {mode: 'create', prints: [{text: 'OI'}]}, preview_path: `${uuid}/preview.jpg`},
    {kind: 'brief', base: 'black', size: 'P', qty: 3, design: {mode: 'brief', brief: 'uma onda azul minimalista'}}
  ],
  qty_zero: [{kind: 'catalog', product_id: 'heavy-avesso', size: 'M', qty: 0}],
  kind_ruim: [{kind: 'hack', size: 'M', qty: 1}],
  produto_atual_do_site: [{kind: 'catalog', product_id: 'heavy-faces', size: 'M', qty: 1}],
  brief_curto: [{kind: 'brief', base: 'black', size: 'P', qty: 1, design: {brief: 'curto'}}],
  design_lista: [{kind: 'custom', base: 'white', size: 'P', qty: 1, design: [1, 2]}],
  design_grande: [{kind: 'custom', base: 'white', size: 'P', qty: 1, design: {x: 'a'.repeat(5000)}}],
  sacola_vazia: [],
  itens_nulos: null
};

async function runAll(label) {
  const res = {};
  for (const [name, items] of Object.entries(CASES)) {
    await db.exec('begin');
    const r = await tryq(`select public.place_order($1::jsonb,'standard','Pix',$2::jsonb) as r`, [JSON.stringify(customer), items === null ? null : JSON.stringify(items)]);
    const stats = r.ok ? (await db.query(`select relname, n_tup_ins, n_tup_upd from pg_stat_xact_user_tables
                                   where relname in ('orders','order_items','order_events') order by relname`)).rows : [];
    const itemsRows = r.ok ? (await db.query(`select product_id, kind, name, base, size, qty, unit_price_cents, design, preview_path
                                              from public.order_items order by id`)).rows : [];
    await db.exec('rollback');
    res[name] = r.ok ? {result: {...r.rows[0].r, code: 'AV-…'}, itemsRows} : {erro: `${r.code}: ${r.msg}`};
    out(`[${label}] ${name}:`, r.ok ? JSON.stringify({...r.rows[0].r, code: 'AV-…'}) + ' | escritas: ' + stats.map(s => `${s.relname} ins=${s.n_tup_ins} upd=${s.n_tup_upd}`).join(', ') : res[name].erro);
  }
  return res;
}

out('\n== B) place_order ATUAL (laço, migração 0003)');
const before = await runAll('atual');

out('\n== C) aplica a proposta 0006');
await db.exec(readFileSync(new URL('./0006_proposta_banco_desempenho.sql', import.meta.url), 'utf8'));
out('0006 aplicada sem erro');

out('\n== D) place_order PROPOSTO (em lote)');
const after = await runAll('proposto');

out('\n== E) Paridade atual x proposto');
for (const name of Object.keys(CASES)) {
  const a = before[name], b = after[name];
  const same = JSON.stringify(a.result ?? a.erro) === JSON.stringify(b.result ?? b.erro)
    && JSON.stringify(a.itemsRows ?? []) === JSON.stringify(b.itemsRows ?? []);
  out(name.padEnd(22), same ? 'IGUAL' : `DIFERENTE  atual=${JSON.stringify(a.result ?? a.erro)}  proposto=${JSON.stringify(b.result ?? b.erro)}`);
}

out('\n== F) Cor da variante chega ao pedido (proposta)');
for (const base of ['brown', undefined, 'purple']) {
  await db.exec('begin');
  const item = {kind: 'catalog', product_id: 'simples', size: 'G', qty: 1, ...(base ? {base} : {})};
  const r = await tryq(`select public.place_order($1::jsonb,'standard','Pix',$2::jsonb) as r`, [JSON.stringify(customer), JSON.stringify([item])]);
  const rows = r.ok ? (await db.query('select name, base from public.order_items')).rows : [];
  await db.exec('rollback');
  out(`simples base=${base ?? '(não enviada)'} ->`, r.ok ? JSON.stringify(rows) : `${r.code}: ${r.msg}`);
}

out('\n== G) Linha do tempo do pedido (order_events)');
const placed = (await db.query(`select public.place_order($1::jsonb,'express','Cartão',$2::jsonb) as r`, [JSON.stringify(customer), JSON.stringify([{kind: 'catalog', product_id: 'heavy-faces', size: 'M', qty: 1}])])).rows[0].r;
await db.exec(`select set_config('app.event_source','webhook:teste',false); update public.orders set status='pago' where code='${placed.code}'`);
out((await db.query(`select e.type, e.status_from, e.status_to, e.source from public.order_events e join public.orders o on o.id=e.order_id where o.code=$1 order by e.id`, [placed.code])).rows);
out('uf gravada no pedido:', (await db.query('select uf, cep, city from public.orders where code=$1', [placed.code])).rows[0]);

out('\n== H) Índices usados pelas consultas do app (enable_seqscan=off só para provar que o índice serve)');
await db.exec('set enable_seqscan = off');
const plans = {
  'pedidos do usuário (fetchMyOrders + RLS)': `select code from public.orders where user_id='${uuid}' order by created_at desc limit 20`,
  'itens de um pedido (embed order_items)': `select name from public.order_items where order_id = 1`,
  'limite 10/hora por e-mail (place_order)': `select count(*) from public.orders where customer_email='a@b.c' and created_at > now() - interval '1 hour'`,
  'get_order por código': `select 1 from public.orders where code='AV-X' and customer_email='a@b.c'`,
  'perfil por id': `select name from public.profiles where id='${uuid}'`,
  'painel: pedidos aguardando pagamento': `select code from public.orders where status='aguardando_pagamento' order by created_at desc limit 50`,
  'eventos de um pedido': `select type from public.order_events where order_id=1 order by at`
};
for (const [k, sql] of Object.entries(plans)) {
  const plan = (await db.query('explain ' + sql)).rows.map(r => r['QUERY PLAN']).join(' | ');
  out(k.padEnd(42), plan.match(/Index[^|]*/g)?.join(' ; ') || plan);
}
await db.exec('reset enable_seqscan');

out('\n== I) Chaves estrangeiras sem índice (mesma checagem do Performance Advisor)');
const fkSql = `select c.conrelid::regclass as tabela, a.attname as coluna
  from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)=1
    and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])
  order by 1,2`;
out((await db.query(fkSql)).rows);

out('\n== J) "Quantos usuários são do Rio de Janeiro?"');
await db.exec(`insert into auth.users (id,email) values
  ('11111111-1111-4111-8111-111111111111','a@x.com'),('22222222-2222-4222-8222-222222222222','b@x.com'),('33333333-3333-4333-8333-333333333333','c@x.com');
  insert into public.profiles (id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333') on conflict do nothing;
  update public.profiles set state='RJ', city='Rio de Janeiro', cep='20040-002' where id='11111111-1111-4111-8111-111111111111';
  update public.profiles set state=null, city='rio de janeiro ', cep='28300000' where id='22222222-2222-4222-8222-222222222222';
  update public.profiles set state='SP', city='São Paulo', cep='01001-000' where id='33333333-3333-4333-8333-333333333333';`);
const rj = {
  'por UF do perfil (só quem preencheu)': `select count(*) from public.profiles where state='RJ'`,
  'por faixa de CEP do RJ (20000000 a 28999999)': `select count(*) from public.profiles where cep<>'' and replace(cep,'-','')::int between 20000000 and 28999999`,
  'cidade do Rio, texto livre normalizado': `select count(*) from public.profiles where lower(trim(city))='rio de janeiro'`
};
for (const [k, sql] of Object.entries(rj)) out(k.padEnd(48), (await db.query(sql)).rows[0].count);
await db.close();
