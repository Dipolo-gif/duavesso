-- 0007 · Segurança, limites por IP e rastreamento dos pedidos.
-- 1) Funções internas que a chave pública ainda podia chamar ficam fechadas.
-- 2) CPF: dígitos conferidos no banco (set_profile_cpf) e troca limitada a 5 tentativas por dia por conta, para ninguém
--    usar a loja para descobrir se um CPF tem conta (o índice único revelava isso a cada tentativa).
-- 3) Limite por IP (cabeçalho cf-connecting-ip, que o Supabase recebe da Cloudflare) em pedidos,
--    newsletter e consulta de pedido, e teto de envios de arte por hora no Storage.
-- 4) Linha do tempo de cada pedido e tabelas para tentativas de pagamento e webhooks do provedor.
-- Roda numa transação só (tudo ou nada) e pode ser aplicada de novo sem efeito colateral.

begin;

-- 1) Funções de gatilho não precisam de EXECUTE para disparar ----------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- Esquema privado: não é exposto pela API do Supabase
create schema if not exists private;
revoke all on schema private from public;

-- 3) Limite de requisições por chave e janela fixa --------------------------------------------
create table if not exists private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table private.rate_limits enable row level security;

-- IP real de quem chamou a API (null fora de uma requisição da API, por exemplo no painel).
create or replace function private.client_ip()
returns text language sql stable set search_path = '' as $$
  select nullif(trim(coalesce(
    nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1)
  )), '')
$$;

-- Conta mais um uso de p_key na janela atual; passa do limite, recusa com a mesma mensagem amigável
-- dos outros limites (código 53400, que o site mostra ao cliente).
create or replace function private.take(p_key text, p_limit integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if v_hits > p_limit then
    raise exception 'Muitas tentativas em pouco tempo. Tente novamente mais tarde.' using errcode = '53400';
  end if;
  -- Faxina ocasional das janelas antigas
  if random() < 0.02 then
    delete from private.rate_limits where window_start < now() - interval '2 days';
  end if;
end;
$$;

-- Limite por IP; sem IP conhecido (chamada fora da API) não limita.
create or replace function private.take_ip(p_action text, p_limit integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ip text := private.client_ip();
begin
  if v_ip is not null then
    perform private.take(p_action || ':' || v_ip, p_limit, p_window_seconds);
  end if;
end;
$$;

-- Pedidos: 20 por hora por IP (além dos 10 por hora por e-mail que o place_order já aplica)
create or replace function private.orders_ip_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.take_ip('pedido', 20, 3600);
  return new;
end;
$$;
drop trigger if exists orders_ip_limit on public.orders;
create trigger orders_ip_limit before insert on public.orders
  for each row execute function private.orders_ip_limit();

-- Newsletter: 10 inscrições por hora por IP e 300 por hora no total
create or replace function private.newsletter_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.take_ip('newsletter', 10, 3600);
  perform private.take('newsletter:total', 300, 3600);
  return new;
end;
$$;
drop trigger if exists newsletter_limit on public.newsletter_subscribers;
create trigger newsletter_limit before insert on public.newsletter_subscribers
  for each row execute function private.newsletter_limit();

-- Consulta de pedido sem login: 30 por hora por IP (dificulta adivinhar códigos)
create or replace function public.get_order(p_code text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  perform private.take_ip('consulta', 30, 3600);
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'created_at', o.created_at,
    'total_cents', o.total_cents, 'payment', o.payment, 'shipping', o.shipping,
    'items', (select jsonb_agg(jsonb_build_object('name', i.name, 'base', i.base, 'color', i.color, 'size', i.size,
                                                  'qty', i.qty, 'unit_price_cents', i.unit_price_cents) order by i.id)
              from public.order_items i where i.order_id = o.id)
  ) into v_result
  from public.orders o
  where o.code = upper(trim(p_code)) and o.customer_email = lower(trim(p_email));
  return v_result;
end;
$$;

-- Envio de artes do estúdio: teto de arquivos por hora no bucket (configurável em store_settings)
insert into public.store_settings (key, value) values ('designs_uploads_per_hour', '300')
on conflict (key) do nothing;
create or replace function private.designs_upload_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select count(*) < coalesce((select (value)::text::integer from public.store_settings
                              where key = 'designs_uploads_per_hour'), 300)
  from storage.objects
  where bucket_id = 'designs' and created_at > now() - interval '1 hour'
$$;
grant usage on schema private to anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.designs_upload_allowed() to anon, authenticated;

drop policy if exists "anon uploads designs into uuid folders" on storage.objects;
create policy "anon uploads designs into uuid folders" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'designs'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and storage.filename(name) in ('preview.jpg', 'art.webp')
    and private.designs_upload_allowed()
  );
drop policy if exists "users upload designs into uuid folders" on storage.objects;
create policy "users upload designs into uuid folders" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'designs'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and storage.filename(name) in ('preview.jpg', 'art.webp')
    and private.designs_upload_allowed()
  );

-- 2) CPF --------------------------------------------------------------------------------------
create or replace function public.cpf_valido(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  s integer;
  d integer;
begin
  if p is null then return true; end if;
  if p !~ '^[0-9]{11}$' or p = repeat(substr(p, 1, 1), 11) then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(p, i, 1)::integer * (11 - i); end loop;
  d := (s * 10) % 11; if d = 10 then d := 0; end if;
  if d <> substr(p, 10, 1)::integer then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(p, i, 1)::integer * (12 - i); end loop;
  d := (s * 10) % 11; if d = 10 then d := 0; end if;
  return d = substr(p, 11, 1)::integer;
end;
$$;
-- Sem restrição na tabela: ela barraria qualquer atualização de um perfil antigo com CPF inválido
-- (inclusive dentro do place_order). Como só set_profile_cpf grava o CPF, a conferência fica nela.
-- Só a função abaixo muda o CPF: a pessoa logada não grava mais a coluna diretamente.
revoke insert, update on public.profiles from authenticated;
grant insert (id, name, cep, city, address, phone, country, state, avatar) on public.profiles to authenticated;
grant update (name, cep, city, address, phone, country, state, avatar) on public.profiles to authenticated;

-- Responde em JSON em vez de erro para que a tentativa fique registrada mesmo quando é recusada.
create or replace function public.set_profile_cpf(p_cpf text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g'), '');
  v_current text;
begin
  if v_user is null then
    raise exception 'Entre na sua conta para alterar o CPF.' using errcode = '22023';
  end if;
  select cpf into v_current from public.profiles where id = v_user;
  if v_current is not distinct from v_cpf then
    return jsonb_build_object('ok', true);
  end if;
  if v_cpf is not null and not public.cpf_valido(v_cpf) then
    return jsonb_build_object('ok', false, 'message', 'CPF inválido. Confira os números.');
  end if;
  insert into private.rate_limits as r (key, window_start, hits)
  values ('cpf:' || v_user, date_trunc('day', now()), 1)
  on conflict (key, window_start) do update set hits = r.hits + 1;
  if (select hits from private.rate_limits where key = 'cpf:' || v_user and window_start = date_trunc('day', now())) > 5 then
    return jsonb_build_object('ok', false, 'message', 'Muitas alterações de CPF hoje. Tente de novo amanhã.');
  end if;
  if v_cpf is not null and exists (select 1 from public.profiles where cpf = v_cpf and id <> v_user) then
    return jsonb_build_object('ok', false, 'message', 'Este CPF já está cadastrado em outra conta. Cada CPF pode ter só uma conta.');
  end if;
  update public.profiles set cpf = v_cpf where id = v_user;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.set_profile_cpf(text) from public, anon;
grant execute on function public.set_profile_cpf(text) to authenticated;

-- 4) Rastreamento -----------------------------------------------------------------------------
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  at timestamptz not null default now(),
  type text not null check (type in ('created', 'status_changed', 'payment_requested', 'payment_approved',
                                     'payment_declined', 'payment_error', 'webhook_received', 'note')),
  status_from text,
  status_to text,
  source text not null default 'db' check (char_length(source) <= 40),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 8192)
);
create index if not exists order_events_order_at_idx on public.order_events (order_id, at);
create index if not exists order_events_type_at_idx on public.order_events (type, at desc);
alter table public.order_events enable row level security; -- sem política: só funções e painel

create table if not exists public.payment_attempts (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  provider text not null,
  method text not null check (method in ('Pix', 'Cartão')),
  amount_cents integer not null check (amount_cents > 0),
  idempotency_key uuid not null unique default gen_random_uuid(),
  provider_payment_id text unique,
  status text not null default 'created'
    check (status in ('created', 'pending', 'approved', 'declined', 'error', 'refunded', 'expired')),
  -- responde "foi o cartão, foi o nosso código ou o provedor caiu?"
  failure_kind text check (failure_kind in ('card_declined', 'insufficient_funds', 'fraud_suspected', 'invalid_data',
                                            'provider_unavailable', 'timeout', 'internal_bug')),
  provider_status text,
  provider_status_detail text,
  http_status integer,
  latency_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_attempts_order_idx on public.payment_attempts (order_id, created_at desc);
create index if not exists payment_attempts_status_idx on public.payment_attempts (status, created_at desc);
alter table public.payment_attempts enable row level security;

-- Caixa de entrada dos webhooks: grava o bruto ANTES de processar (nada se perde se o processamento falhar)
create table if not exists public.payment_webhooks (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  signature_ok boolean not null,
  processed_at timestamptz,
  process_error text,
  payload jsonb not null,
  unique (provider, event_id)
);
alter table public.payment_webhooks enable row level security;

create index if not exists orders_status_created_idx on public.orders (status, created_at desc);

create or replace function private.log_order_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, type, status_to, source)
    values (new.id, 'created', new.status, 'checkout');
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, type, status_from, status_to, source)
    values (new.id, 'status_changed', old.status, new.status,
            coalesce(nullif(current_setting('app.event_source', true), ''), 'painel'));
  end if;
  return new;
end;
$$;
drop trigger if exists orders_event_log on public.orders;
create trigger orders_event_log after insert or update of status on public.orders
  for each row execute function private.log_order_event();

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.designs_upload_allowed() to anon, authenticated;

commit;
