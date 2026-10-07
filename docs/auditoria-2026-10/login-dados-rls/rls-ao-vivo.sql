-- DUAVESSO: teste de RLS por personificação, para rodar QUANDO o projeto bkyzkighkuswsssvicpy voltar.
-- Onde: Supabase > SQL Editor (roda como postgres). Cole o arquivo inteiro e execute uma vez.
-- Seguro: toda escrita de teste é desfeita por uma exceção proposital (subtransação), nada fica gravado.
-- Pré-requisito: pelo menos 2 contas em auth.users (A = mais antiga, B = segunda). Se quiser escolher,
-- troque os dois "set_config('audit.a'/'audit.b')" pelos UUIDs desejados.
-- Resultado: a última consulta lista cada teste com "OK" ou "FALHA".

drop table if exists pg_temp.audit_result;
create temp table audit_result (n serial, teste text, esperado text, obtido text, veredito text);
grant insert, select on audit_result to anon, authenticated;
grant usage on sequence audit_result_n_seq to anon, authenticated;

select set_config('audit.a', (select id::text from auth.users order by created_at limit 1), false),
       set_config('audit.b', (select id::text from auth.users order by created_at offset 1 limit 1), false),
       set_config('audit.b_cpf', coalesce((select cpf from public.profiles where id = (select id from auth.users order by created_at offset 1 limit 1)), ''), false);

do $audit$
declare
  a uuid := current_setting('audit.a')::uuid;
  b uuid := current_setting('audit.b')::uuid;
  n bigint;
  procedure_dummy int;
begin
  if a is null or b is null then raise exception 'Preciso de 2 usuários em auth.users'; end if;

  -- ===================== Como A, papel authenticated (igual ao PostgREST) =====================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.profiles where id = b;                         -- GET profiles?id=eq.<B>
  insert into audit_result (teste, esperado, obtido, veredito) values ('T1 A lê perfil de B', '0', n::text, case when n = 0 then 'OK' else 'FALHA' end);

  select count(*) into n from public.profiles where id <> a;
  insert into audit_result (teste, esperado, obtido, veredito) values ('T2 A enxerga perfis que não são dela', '0', n::text, case when n = 0 then 'OK' else 'FALHA' end);

  begin                                                                               -- PATCH profiles?id=eq.<B>
    update public.profiles set name = name where id = b; get diagnostics n = row_count;
    raise exception using errcode = 'P0001', message = n::text;
  exception when sqlstate 'P0001' then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T3 A altera perfil de B', '0 linhas', sqlerrm || ' linhas', case when sqlerrm = '0' then 'OK' else 'FALHA' end);
  end;

  begin
    insert into public.profiles (id, name) values (gen_random_uuid(), 'audit');
    raise exception using errcode = 'P0001', message = 'inseriu';
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T4 A cria perfil com id alheio', '42501', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' then 'OK' else 'FALHA' end);
  end;

  begin
    update public.profiles set id = b where id = a;
    raise exception using errcode = 'P0001', message = 'trocou id';
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T5 A troca o próprio id pelo de B', '42501 ou 23505', sqlstate || ' ' || sqlerrm, case when sqlstate in ('42501', '23505') then 'OK' else 'FALHA' end);
  end;

  begin
    delete from public.profiles where id = b; get diagnostics n = row_count;
    raise exception using errcode = 'P0001', message = n::text;
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T6 A apaga perfil de B', '42501 (sem grant) ou 0', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' or sqlerrm = '0' then 'OK' else 'FALHA' end);
  end;

  select count(*) into n from public.orders where user_id is distinct from a;          -- GET orders?user_id=eq.<B>
  insert into audit_result (teste, esperado, obtido, veredito) values ('T7 A enxerga pedidos que não são dela', '0', n::text, case when n = 0 then 'OK' else 'FALHA' end);

  select count(*) into n from public.order_items i where not exists (select 1 from public.orders o where o.id = i.order_id and o.user_id = a);
  insert into audit_result (teste, esperado, obtido, veredito) values ('T8 A enxerga itens de pedidos alheios', '0', n::text, case when n = 0 then 'OK' else 'FALHA' end);

  begin
    perform 1 from public.newsletter_subscribers limit 1;
    raise exception using errcode = 'P0001', message = 'leu';
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T9 A lê newsletter', '42501', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' then 'OK' else 'FALHA' end);
  end;

  begin
    update public.orders set status = status where user_id = a; get diagnostics n = row_count;
    raise exception using errcode = 'P0001', message = n::text;
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T10 A altera status do próprio pedido', '42501', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' then 'OK' else 'FALHA' end);
  end;

  begin
    insert into public.orders (code, payment, shipping, subtotal_cents, delivery_cents, total_cents, customer_name, customer_email, cep, city, address)
    values ('AUDIT', 'Pix', 'standard', 0, 0, 0, 'Audit', 'audit@example.com', '20040-020', 'Rio', 'Rua Audit 1');
    raise exception using errcode = 'P0001', message = 'inseriu';
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T11 A grava pedido direto na tabela', '42501', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' then 'OK' else 'FALHA' end);
  end;

  select count(*) into n from storage.objects where bucket_id = 'designs';
  insert into audit_result (teste, esperado, obtido, veredito) values ('T12 A lista artes do bucket designs', '0', n::text, case when n = 0 then 'OK' else 'FALHA' end);

  if current_setting('audit.b_cpf') <> '' then
    begin
      update public.profiles set cpf = current_setting('audit.b_cpf') where id = a;
      raise exception using errcode = 'P0001', message = 'aceitou';
    exception when others then
      insert into audit_result (teste, esperado, obtido, veredito) values ('T13 oráculo de CPF (A grava CPF de B)', 'não revelar (hoje: 23505 revela)', sqlstate || ' ' || sqlerrm, case when sqlstate = '23505' then 'FALHA (oráculo)' else 'OK' end);
    end;
  end if;

  execute 'reset role';

  -- ===================== Como visitante, papel anon =====================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform 1 from public.profiles limit 1; raise exception using errcode = 'P0001', message = 'leu';
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T14 anon lê profiles', '42501', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' then 'OK' else 'FALHA' end);
  end;
  begin
    perform 1 from public.orders limit 1; raise exception using errcode = 'P0001', message = 'leu';
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T15 anon lê orders', '42501', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' then 'OK' else 'FALHA' end);
  end;
  begin
    perform 1 from public.order_items limit 1; raise exception using errcode = 'P0001', message = 'leu';
  exception when others then
    insert into audit_result (teste, esperado, obtido, veredito) values ('T16 anon lê order_items', '42501', sqlstate || ' ' || sqlerrm, case when sqlstate = '42501' then 'OK' else 'FALHA' end);
  end;
  select count(*) into n from storage.objects where bucket_id = 'designs';
  insert into audit_result (teste, esperado, obtido, veredito) values ('T17 anon lista artes do bucket', '0', n::text, case when n = 0 then 'OK' else 'FALHA' end);
  execute 'reset role';
end
$audit$;

select n, teste, esperado, obtido, veredito from audit_result order by n;
