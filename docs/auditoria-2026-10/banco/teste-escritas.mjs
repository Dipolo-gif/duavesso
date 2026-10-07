// Escritas por pedido (banco limpo a cada medição) e FKs sem índice antes/depois da proposta 0006.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const MIG = 'D:/SSD-Offload/doavesso/supabase/migrations/';
const files = ['0001_avesso_init.sql', '0002_tighten_function_grants.sql', '0003_accounts.sql', '0004_profile_fields.sql', '0005_cpf_unique.sql'];
const fkSql = `select c.conrelid::regclass::text as tabela, a.attname as coluna
  from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)=1
    and not exists (select 1 from pg_index i where i.indrelid=c.conrelid and i.indkey[0]=c.conkey[1])
  order by 1,2`;
const items = n => Array.from({length: n}, (_, i) => ({kind: 'catalog', product_id: i % 2 ? 'heavy-avesso' : 'geek-carpa', size: ['P', 'M', 'G', 'GG'][i % 4], qty: 1}));
async function fresh(withProposal) {
  const db = new PGlite();
  await db.exec(readFileSync(new URL('./stubs.sql', import.meta.url), 'utf8'));
  for (const f of files) await db.exec(readFileSync(MIG + f, 'utf8'));
  await db.exec(`insert into public.products (id,name,category,color,base,price_cents) values
    ('heavy-avesso','Heavy · Do Avesso','graphic','Preto lavado','black',15990),('geek-carpa','Carpa Japonesa','graphic','Off white','white',15990)`);
  const fkBefore = (await db.query(fkSql)).rows;
  if (withProposal) await db.exec(readFileSync(new URL('./0006_proposta_banco_desempenho.sql', import.meta.url), 'utf8'));
  return {db, fkBefore};
}
for (const n of [1, 30]) {
  for (const proposal of [false, true]) {
    const {db, fkBefore} = await fresh(proposal);
    if (n === 1 && !proposal) console.log('FKs sem índice no esquema atual:', JSON.stringify(fkBefore));
    await db.exec('begin');
    const t0 = performance.now();
    await db.query(`select public.place_order($1::jsonb,'standard','Pix',$2::jsonb)`, [JSON.stringify({name: 'Cliente Teste', email: 'c@example.com', cep: '20040-002', city: 'Rio de Janeiro', address: 'Rua Um, 10'}), JSON.stringify(items(n))]);
    const ms = (performance.now() - t0).toFixed(1);
    const st = (await db.query(`select relname, n_tup_ins, n_tup_upd from pg_stat_xact_user_tables where relname in ('orders','order_items','order_events') order by relname`)).rows;
    await db.exec('commit');
    console.log(`${proposal ? 'PROPOSTO' : 'ATUAL   '} ${String(n).padStart(2)} itens: ${st.map(s => `${s.relname} ins=${s.n_tup_ins} upd=${s.n_tup_upd}`).join(', ')} | ${ms} ms (PGlite/WASM, só referência)`);
    await db.close();
  }
}
