// Valida rls-ao-vivo.sql e inventario-ao-vivo.sql no Postgres local (PGlite) com as migrações reais.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const db = new PGlite();
const src = await readFile('sim.mjs', 'utf8');
const stub = src.match(/await db\.exec\(`\n(create role anon[\s\S]*?)`\);/)[1].replace('create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default \'{}\');', "create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default clock_timestamp());\ncreate table auth.sessions (id uuid, not_after timestamptz, created_at timestamptz, refreshed_at timestamp);\ncreate table auth.refresh_tokens (id bigint, revoked boolean);");
await db.exec(stub);
for (const f of ['0001_avesso_init.sql','0002_tighten_function_grants.sql','0003_accounts.sql','0004_profile_fields.sql','0005_cpf_unique.sql'])
  await db.exec(await readFile('D:/SSD-Offload/doavesso/supabase/migrations/' + f, 'utf8'));
await db.exec(`insert into auth.users (id,email) values ('11111111-1111-4111-8111-111111111111','ana@example.com');
insert into auth.users (id,email) values ('22222222-2222-4222-8222-222222222222','bia@example.com');
update public.profiles set cpf='22222222222' where id='22222222-2222-4222-8222-222222222222';`);
const res = await db.exec(await readFile('rls-ao-vivo.sql', 'utf8'));
console.table(res.at(-1).rows);
const inv = (await readFile('inventario-ao-vivo.sql', 'utf8')).split(/\n(?=-- \[I\d+\])/);
for (const block of inv) { if (!block.startsWith('-- [I')) continue; try { const r = await db.exec(block); console.log(block.split('\n')[0], '=> ok,', r.at(-1).rows.length, 'linhas'); if (/\[I5\]/.test(block)) console.table(r.at(-1).rows); } catch (e) { console.log(block.split('\n')[0], '=> ERRO', e.message); } }
