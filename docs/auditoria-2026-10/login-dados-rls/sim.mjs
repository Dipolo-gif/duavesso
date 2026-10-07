// Simulação local (PGlite = Postgres 17 em WASM) das migrações reais do projeto DUAVESSO,
// com um "stub" mínimo do que o Supabase fornece (auth.users, auth.uid(), storage, papéis).
// Objetivo: provar o comportamento de RLS/grants enquanto o projeto real está pausado.
// Nada aqui toca o projeto: lê os .sql e roda num banco em memória.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

const MIG = 'D:/SSD-Offload/doavesso/supabase/migrations/';
const db = new PGlite();
const out = (label, value) => console.log(`\n### ${label}\n${typeof value === 'string' ? value : JSON.stringify(value, null, 1)}`);
async function q(sql, params) { return (await db.query(sql, params)).rows; }
async function tryq(label, sql, params) {
  try { const r = await db.query(sql, params); out(label, {ok: true, rows: r.rows, affectedRows: r.affectedRows}); }
  catch (e) { out(label, {ok: false, code: e.code, error: e.message}); }
}
// Executa como um papel do PostgREST, com as claims do JWT, dentro de transação (igual ao PostgREST).
async function as(role, sub, label, sql, params) {
  const claims = sub ? JSON.stringify({sub, role}) : JSON.stringify({role});
  try {
    await db.exec('begin');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.exec(`set local role ${role}`);
    const r = await db.query(sql, params);
    await db.exec('commit');
    out(label, {ok: true, rows: r.rows, affectedRows: r.affectedRows});
    return r.rows;
  } catch (e) {
    await db.exec('rollback');
    out(label, {ok: false, code: e.code, error: e.message});
    return null;
  }
}

// --- Stub do ambiente Supabase -------------------------------------------------------------
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql as $$
  declare p text[]; begin p := string_to_array(name, '/'); return p[1:array_length(p,1)-1]; end $$;
create function storage.filename(name text) returns text language plpgsql as $$
  declare p text[]; begin p := string_to_array(name, '/'); return p[array_length(p,1)]; end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
`);

// --- Migrações reais, na ordem ----------------------------------------------------------------
for (const f of ['0001_avesso_init.sql', '0002_tighten_function_grants.sql', '0003_accounts.sql', '0004_profile_fields.sql', '0005_cpf_unique.sql']) {
  await db.exec(await readFile(MIG + f, 'utf8'));
  console.log('migração aplicada:', f);
}

// --- Dados de teste ---------------------------------------------------------------------------
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
await db.exec(`
insert into auth.users (id, email, raw_user_meta_data) values
 ('${A}', 'ana@example.com', '{"name":"Ana"}'), ('${B}', 'bia@example.com', '{"name":"Bia"}');
update public.profiles set cpf = '22222222222', state = 'RJ', city = 'Rio de Janeiro', phone = '21999990000' where id = '${B}';
update public.profiles set state = 'SP', city = 'São Paulo' where id = '${A}';
insert into public.products (id, name, category, color, base, price_cents) values ('heavy-eclipse', 'Heavy · Eclipse', 'graphic', 'Marrom', 'black', 15990);
`);
out('perfis criados pelo gatilho handle_new_user', await q('select id, name, cpf, state, city from public.profiles order by name'));

const item = JSON.stringify([{kind: 'catalog', product_id: 'heavy-eclipse', size: 'M', qty: 1}]);
const cust = e => JSON.stringify({name: 'Cliente Teste', email: e, cep: '20040-020', city: 'Rio de Janeiro', address: 'Rua Teste, 10'});
await as('authenticated', B, 'B faz um pedido logada', `select public.place_order($1::jsonb, 'standard', 'Pix', $2::jsonb) as r`, [cust('bia@example.com'), item]);
await as('authenticated', A, 'A faz um pedido logada', `select public.place_order($1::jsonb, 'standard', 'Pix', $2::jsonb) as r`, [cust('ana@example.com'), item]);

// --- Item 3: troca de ID na requisição (equivalente a /rest/v1/profiles?id=eq.<B>) ------------
await as('authenticated', A, 'T1 A lê profiles?id=eq.<B> (esperado: 0 linhas)', `select id, name, cpf, phone from public.profiles where id = $1`, [B]);
await as('authenticated', A, 'T2 A lê profiles sem filtro (esperado: só a própria linha)', `select id, name from public.profiles`);
await as('authenticated', A, 'T3 A faz PATCH profiles?id=eq.<B> (esperado: 0 linhas afetadas)', `update public.profiles set name = 'hackeado' where id = $1`, [B]);
out('T3b nome de B depois do ataque (visão do superusuário)', await q('select name from public.profiles where id = $1', [B]));
await as('authenticated', A, 'T4 A insere perfil com id de outra pessoa (esperado: erro RLS)', `insert into public.profiles (id, name) values ('33333333-3333-4333-8333-333333333333', 'x')`);
await as('authenticated', A, 'T5 A troca o próprio id para o de B (esperado: erro)', `update public.profiles set id = $1 where id = $2`, [B, A]);
await as('authenticated', A, 'T6 A apaga o próprio perfil (sem grant de delete)', `delete from public.profiles where id = $1`, [A]);
await as('authenticated', A, 'T7 A lê orders?user_id=eq.<B> (esperado: 0)', `select code, customer_email, address from public.orders where user_id = $1`, [B]);
await as('authenticated', A, 'T8 A lê todos os orders (esperado: só os seus)', `select code, customer_email from public.orders`);
await as('authenticated', A, 'T9 A lê order_items?order_id=eq.1 (pedido 1 é da B; esperado: 0)', `select i.order_id, i.name from public.order_items i where i.order_id = (select 1)`);
await as('authenticated', A, 'T10 A lê newsletter_subscribers (esperado: permissão negada)', `select * from public.newsletter_subscribers`);
await as('authenticated', A, 'T11 A tenta gravar pedido direto na tabela (esperado: permissão negada)', `insert into public.orders (code,payment,shipping,subtotal_cents,delivery_cents,total_cents,customer_name,customer_email,cep,city,address) values ('X','Pix','standard',0,0,0,'abc','a@b.co','20040-020','Rio','Rua x 1')`);
await as('authenticated', A, 'T12 A muda status do próprio pedido (esperado: permissão negada)', `update public.orders set status = 'pago'`);
await as('anon', null, 'T13 anon lê profiles (esperado: permissão negada)', `select * from public.profiles`);
await as('anon', null, 'T14 anon lê orders (esperado: permissão negada)', `select * from public.orders`);

// --- Oráculo de CPF -----------------------------------------------------------------------------
await as('authenticated', A, 'T15 A grava no próprio perfil o CPF de B (oráculo: 23505 revela que o CPF existe)', `update public.profiles set cpf = '22222222222' where id = $1`, [A]);
await as('authenticated', A, 'T15b A grava um CPF que ninguém usa (passa)', `update public.profiles set cpf = '99999999999' where id = $1`, [A]);

// --- Funções SECURITY DEFINER: quem pode executar ------------------------------------------------
out('T16 privilégios de EXECUTE', await q(`
select p.proname, p.prosecdef as security_definer, p.proconfig as config,
  has_function_privilege('anon', p.oid, 'execute') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1`));
await as('anon', null, 'T17 anon chama handle_new_user() direto', `select public.handle_new_user()`);

// --- Item 11: limites --------------------------------------------------------------------------
let ok = 0;
for (let i = 0; i < 10; i++) {
  const r = await as('anon', null, `anon pedido ${i + 1} com e-mail da A`, `select (public.place_order($1::jsonb,'standard','Pix',$2::jsonb))->>'code' as code`, [cust('ana@example.com'), item]);
  if (r) ok++;
}
out('T18 pedidos de visitante aceitos usando o e-mail da A', ok);
await as('authenticated', A, 'T19 A (logada, dona do e-mail) tenta comprar depois disso (esperado: 53400, bloqueada por terceiros)', `select public.place_order($1::jsonb,'standard','Pix',$2::jsonb)`, [cust('qualquer@x.com'), item]);
let subs = 0;
for (let i = 0; i < 300; i++) { try { await db.exec(`begin; select set_config('request.jwt.claims','{"role":"anon"}',true); set local role anon; select public.subscribe_newsletter('bot${i}@spam.example'); commit;`); subs++; } catch { await db.exec('rollback'); } }
out('T20 newsletter: inscrições aceitas em sequência pelo anon (sem limite)', {aceitas: subs, total_na_tabela: (await q('select count(*)::int c from public.newsletter_subscribers'))[0].c});
let up = 0;
for (let i = 0; i < 50; i++) { const id = crypto.randomUUID(); try { await db.exec(`begin; set local role anon; insert into storage.objects (bucket_id, name) values ('designs', '${id}/art.webp'); commit;`); up++; } catch (e) { await db.exec('rollback'); } }
out('T21 storage: uploads aceitos do anon em sequência (limite só de tamanho por arquivo)', up);
await as('anon', null, 'T22 anon lista objetos do bucket (esperado: 0, sem política de select)', `select count(*) from storage.objects`);
await as('anon', null, 'T23 anon sobe arquivo fora do padrão (esperado: erro RLS)', `insert into storage.objects (bucket_id, name) values ('designs', 'qualquer/virus.png')`);
await as('anon', null, 'T24 get_order com código certo e e-mail errado (esperado: null)', `select public.get_order($1, 'outro@x.com') r`, [(await q('select code from public.orders order by id limit 1'))[0].code]);
await as('anon', null, 'T24b get_order com código e e-mail certos (devolve sem endereço)', `select public.get_order($1, 'bia@example.com') r`, [(await q('select code from public.orders order by id limit 1'))[0].code]);

// --- Item 10: modelagem --------------------------------------------------------------------------
await tryq('T25 catálogo atual tem base brown e categoria simples: o banco aceita?', `insert into public.products (id,name,category,color,base,price_cents) values ('simples','Oversized Simples','simples','Marrom','brown',11990)`);
await tryq('T26 order_items aceita base brown?', `insert into public.order_items (order_id, kind, name, base, size, qty, unit_price_cents) values (1,'custom','x','brown','M',1,100)`);
out('T27 quantos usuários são do RJ (profiles.state)', await q(`select state, count(*)::int from public.profiles group by state order by 1`));
await tryq('T28 orders tem coluna de estado?', `select state from public.orders`);
out('T29 pedidos do RJ pela faixa de CEP (20000-000 a 28999-999)', await q(`select count(*)::int as pedidos_rj, count(distinct customer_email)::int as clientes_rj from public.orders where substr(regexp_replace(cep,'\\D','','g'),1,2)::int between 20 and 28`));
out('T30 colunas de profiles e orders', await q(`select table_name, string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' and table_name in ('profiles','orders','order_items') group by 1`));
