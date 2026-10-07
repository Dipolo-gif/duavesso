-- PROPOSTA (não aplicada) · 0006: catálogo alinhado ao site, cor da variante no pedido,
-- place_order em lote, UF no pedido, rastreamento de eventos/pagamentos e índices que faltam.
-- Testada num Postgres 17 local (PGlite) sobre as migrações 0001 a 0005 com stubs do Supabase.

-- 1) Catálogo: o site vende marrom e a categoria "simples", mas o banco recusa os dois.
alter table public.products drop constraint products_base_check;
alter table public.products add constraint products_base_check check (base in ('white', 'black', 'brown'));
alter table public.products drop constraint products_category_check;
alter table public.products add constraint products_category_check check (category in ('graphic', 'essential', 'simples'));
alter table public.order_items drop constraint order_items_base_check;
alter table public.order_items add constraint order_items_base_check check (base in ('white', 'black', 'brown'));

-- Variantes de cor (hoje só a "simples" tem 3 cores; antes a cor escolhida se perdia no pedido).
create table public.product_variants (
  product_id text not null references public.products (id) on delete cascade,
  base text not null check (base in ('white', 'black', 'brown')),
  color text not null check (char_length(color) between 2 and 40),
  active boolean not null default true,
  primary key (product_id, base)
);
alter table public.product_variants enable row level security;
create policy "active variants are public" on public.product_variants
  for select to anon, authenticated using (active);
grant select on public.product_variants to anon, authenticated;

-- Marcas parceiras (/marcas/<slug>): base para os donos das marcas entrarem com a mesma conta.
-- As políticas de escrita do dono da marca ficam para a migração de permissões.
create table public.brands (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.brand_members (
  brand_slug text not null references public.brands (slug) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (brand_slug, user_id)
);
create index brand_members_user_idx on public.brand_members (user_id);
alter table public.brands enable row level security;
alter table public.brand_members enable row level security;
create policy "active brands are public" on public.brands for select to anon, authenticated using (active);
create policy "member reads own memberships" on public.brand_members for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on public.brands to anon, authenticated;
grant select on public.brand_members to authenticated;
alter table public.products add column brand_slug text references public.brands (slug);
create index products_brand_idx on public.products (brand_slug) where brand_slug is not null;

-- Seed do catálogo que o site mostra hoje (dist/commerce.js); desativa os itens antigos.
insert into public.brands (slug, name) values ('geek', 'duavessogeek') on conflict (slug) do nothing;
insert into public.products (id, name, category, color, base, price_cents, tag, sort_order, active, brand_slug) values
  ('heavy-avesso', 'Heavy · Do Avesso', 'graphic', 'Preto lavado', 'black', 15990, 'ESTAMPA AUTORAL', 1, true, null),
  ('heavy-faces', 'Heavy · Dois Lados', 'graphic', 'Marrom', 'brown', 15990, 'NOVA ESTAMPA', 2, true, null),
  ('heavy-eclipse', 'Heavy · Eclipse', 'graphic', 'Marrom', 'brown', 15990, 'NOVA ESTAMPA', 3, true, null),
  ('simples', 'Oversized Simples', 'simples', 'Preto lavado', 'black', 11990, 'BÁSICA', 4, true, null),
  ('geek-coracao', 'Coração Pixelado', 'graphic', 'Preta', 'black', 15990, 'DUAVESSOGEEK', 5, true, 'geek'),
  ('geek-carpa', 'Carpa Japonesa', 'graphic', 'Off white', 'white', 15990, 'DUAVESSOGEEK', 6, true, 'geek')
on conflict (id) do update set name = excluded.name, category = excluded.category, color = excluded.color,
  base = excluded.base, price_cents = excluded.price_cents, tag = excluded.tag, sort_order = excluded.sort_order,
  active = true, brand_slug = excluded.brand_slug;
insert into public.product_variants (product_id, base, color) values
  ('simples', 'black', 'Preto lavado'), ('simples', 'white', 'Off white'), ('simples', 'brown', 'Marrom')
on conflict do nothing;
update public.products set active = false
where id not in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'simples', 'geek-coracao', 'geek-carpa');

-- 2) Endereço do pedido: UF explícita (hoje o pedido só tem CEP, cidade em texto livre e endereço).
alter table public.orders add column uf text check (uf is null or uf ~ '^[A-Z]{2}$');
create index orders_uf_idx on public.orders (uf) where uf is not null;

-- 3) Índices que faltam
create index order_items_product_idx on public.order_items (product_id) where product_id is not null; -- FK sem índice
create index orders_status_created_idx on public.orders (status, created_at desc);                   -- painel de atendimento

-- 4) Rastreamento: linha do tempo do pedido e tentativas de pagamento.
create table public.order_events (
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
create index order_events_order_at_idx on public.order_events (order_id, at);
create index order_events_type_at_idx on public.order_events (type, at desc);
alter table public.order_events enable row level security; -- sem política: só funções e painel

create table public.payment_attempts (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  provider text not null,
  method text not null check (method in ('Pix', 'Cartão')),
  amount_cents integer not null check (amount_cents > 0),
  idempotency_key uuid not null unique default gen_random_uuid(),
  provider_payment_id text unique,
  status text not null default 'created'
    check (status in ('created', 'pending', 'approved', 'declined', 'error', 'refunded', 'expired')),
  -- a resposta para "foi o cartão, o código ou a API caiu?"
  failure_kind text check (failure_kind in ('card_declined', 'insufficient_funds', 'fraud_suspected', 'invalid_data',
                                            'provider_unavailable', 'timeout', 'internal_bug')),
  provider_status text,
  provider_status_detail text,
  http_status integer,
  latency_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_attempts_order_idx on public.payment_attempts (order_id, created_at desc);
create index payment_attempts_status_idx on public.payment_attempts (status, created_at desc);
alter table public.payment_attempts enable row level security;

-- Caixa de entrada dos webhooks: grava o bruto ANTES de processar (nada se perde se o processamento falhar).
create table public.payment_webhooks (
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

create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_events (order_id, type, status_from, status_to, source)
    values (new.id, 'status_changed', old.status, new.status,
            coalesce(nullif(current_setting('app.event_source', true), ''), 'db'));
  end if;
  return new;
end;
$$;
create trigger orders_status_event after update of status on public.orders
  for each row execute function public.log_order_status();
revoke all on function public.log_order_status() from public, anon, authenticated;

-- 5) place_order em lote: 1 leitura para todos os itens, 1 insert no pedido (já com totais),
--    1 insert ... select para os itens e o evento "created". Mesmas mensagens e códigos de erro.
create or replace function public.place_order(
  p_customer jsonb,
  p_shipping text,
  p_payment text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_user uuid := (select auth.uid());
  v_email text;
  v_rows jsonb;
  v_bad jsonb;
  v_subtotal integer;
  v_count integer;
  v_delivery integer;
  v_order_id bigint;
  v_code text;
  v_uf text := nullif(upper(trim(p_customer->>'uf')), '');
begin
  -- "is distinct from" fecha a brecha de p_items nulo (a versão atual aceita e cria pedido sem itens).
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Sacola vazia ou inválida.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Sacola vazia ou inválida.' using errcode = '22023';
  end if;
  if p_shipping is null or p_shipping not in ('standard', 'express') then
    raise exception 'Entrega inválida.' using errcode = '22023';
  end if;
  if p_payment is null or p_payment not in ('Pix', 'Cartão') then
    raise exception 'Pagamento inválido.' using errcode = '22023';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida.' using errcode = '22023';
  end if;

  v_email := lower(trim(p_customer->>'email'));
  if v_user is not null then
    select lower(email) into v_email from auth.users where id = v_user;
  end if;
  if (select count(*) from public.orders
      where customer_email = v_email and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.' using errcode = '53400';
  end if;

  select jsonb_object_agg(key, value) into v_settings from public.store_settings;

  -- Uma única consulta resolve todos os itens: preço, nome e cor vêm do servidor.
  select jsonb_agg(to_jsonb(r) order by r.ord) into v_rows
  from (
    select t.ord,
           t.e->>'kind' as kind,
           case when (t.e->>'qty') ~ '^[0-9]{1,3}$' then (t.e->>'qty')::integer end as qty,
           t.e->>'product_id' as requested_id,
           p.id as product_id,
           case t.e->>'kind' when 'catalog' then p.name
                             when 'brief' then 'Sua camiseta · Estampa sob medida'
                             when 'custom' then 'Sua camiseta · Studio' end as name,
           case when t.e->>'kind' = 'catalog' then coalesce(v.base, p.base) else t.e->>'base' end as base,
           (t.e->>'kind' = 'catalog' and p.id is not null and t.e ? 'base'
              and v.base is null and t.e->>'base' is distinct from p.base) as variant_invalid,
           t.e->>'size' as size,
           case t.e->>'kind' when 'catalog' then p.price_cents
                             when 'brief' then (v_settings->>'custom_brief_cents')::integer
                             when 'custom' then (v_settings->>'custom_create_cents')::integer end as unit_price_cents,
           case when t.e->>'kind' in ('custom', 'brief') then coalesce(t.e->'design', '{}'::jsonb) end as design,
           case when t.e->>'kind' in ('custom', 'brief') then t.e->>'preview_path' end as preview_path,
           case when t.e->>'kind' in ('custom', 'brief') then t.e->>'image_path' end as image_path
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    left join public.products p on t.e->>'kind' = 'catalog' and p.id = t.e->>'product_id' and p.active
    left join public.product_variants v on v.product_id = p.id and v.base = t.e->>'base' and v.active
  ) r;

  if exists (select 1 from jsonb_array_elements(v_rows) x
             where (x->>'qty') is null or (x->>'qty')::integer not between 1 and 10) then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) x
             where x->>'kind' is null or x->>'kind' not in ('catalog', 'custom', 'brief')) then
    raise exception 'Item inválido.' using errcode = '22023';
  end if;
  select x into v_bad from jsonb_array_elements(v_rows) x
  where x->>'kind' = 'catalog' and x->>'product_id' is null order by (x->>'ord')::integer limit 1;
  if v_bad is not null then
    raise exception 'Produto indisponível: %', v_bad->>'requested_id' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) x where (x->>'variant_invalid')::boolean) then
    raise exception 'Cor indisponível para este produto.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) x
             where x->>'kind' = 'brief' and char_length(coalesce(x->'design'->>'brief', '')) < 10) then
    raise exception 'Descreva a estampa com pelo menos 10 caracteres.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) x
             where x->>'kind' in ('custom', 'brief')
               and (jsonb_typeof(x->'design') <> 'object' or pg_column_size(x->'design') > 4096)) then
    raise exception 'Personalização inválida.' using errcode = '22023';
  end if;

  select sum((x->>'unit_price_cents')::integer * (x->>'qty')::integer), sum((x->>'qty')::integer)
    into v_subtotal, v_count
  from jsonb_array_elements(v_rows) x;

  v_delivery := case
    when p_shipping = 'express' then (v_settings->>'shipping_express_cents')::integer
    when v_subtotal >= (v_settings->>'free_shipping_min_cents')::integer then 0
    else (v_settings->>'shipping_standard_cents')::integer end;

  v_code := 'AV-' || upper(to_hex((extract(epoch from now()) * 1000)::bigint)) || '-'
            || upper(substr(md5(gen_random_uuid()::text), 1, 4));

  insert into public.orders (code, payment, shipping, subtotal_cents, delivery_cents, total_cents,
                             customer_name, customer_email, cep, city, address, uf, user_id)
  values (v_code, p_payment, p_shipping, v_subtotal, v_delivery, v_subtotal + v_delivery,
          trim(p_customer->>'name'), v_email, trim(p_customer->>'cep'),
          trim(p_customer->>'city'), trim(p_customer->>'address'), v_uf, v_user)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, kind, name, base, size, qty, unit_price_cents,
                                  design, preview_path, image_path)
  select v_order_id, x.product_id, x.kind, x.name, x.base, x.size, x.qty, x.unit_price_cents,
         x.design, x.preview_path, x.image_path
  from jsonb_to_recordset(v_rows) as x(ord bigint, product_id text, kind text, name text, base text, size text,
                                       qty integer, unit_price_cents integer, design jsonb,
                                       preview_path text, image_path text)
  order by x.ord;

  insert into public.order_events (order_id, type, status_to, source, detail)
  values (v_order_id, 'created', 'aguardando_pagamento', 'checkout',
          jsonb_build_object('items', v_count, 'logged_in', v_user is not null));

  if v_user is not null then
    update public.profiles
    set name = coalesce(nullif(trim(p_customer->>'name'), ''), name),
        cep = trim(p_customer->>'cep'), city = trim(p_customer->>'city'), address = trim(p_customer->>'address'),
        state = coalesce(v_uf, state)
    where id = v_user;
  end if;

  return jsonb_build_object(
    'code', v_code, 'status', 'aguardando_pagamento', 'count', v_count,
    'subtotal_cents', v_subtotal, 'delivery_cents', v_delivery, 'total_cents', v_subtotal + v_delivery
  );
end;
$$;
