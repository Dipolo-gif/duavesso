-- 0012 · Financeiro da duavesso, pedidos no painel e vendas das marcas.
-- Desenho: docs/superpowers/specs/2026-10-08-financeiro-e-vendas-design.md
-- 1) orders.paid_at: quando o pedido entrou em "pago" pela primeira vez (data da venda).
-- 2) Custos e preço base por peça, retrato de cada item vendido e lançamentos manuais ficam no esquema
--    private (a API não expõe); saem só por funções que conferem quem chama.
-- 3) Lucro da marca = (preço de venda − preço base da duavesso) × quantidade, congelado quando o
--    pedido vira pago. Descontos ficam por conta da duavesso.
-- 4) Financeiro = livro caixa: vendas pagas do site + lançamentos manuais. A repassar a cada marca =
--    lucro dela nas vendas pagas − repasses lançados.
-- Datas de relatório no horário de Brasília (UTC−3, sem horário de verão).
-- Roda numa transação só e pode ser aplicada de novo sem efeito colateral.

begin;

-- 1) Pedido pago ----------------------------------------------------------------------------------
alter table public.orders add column if not exists paid_at timestamptz;

create or replace function private.is_paid(p_status text)
returns boolean language sql immutable set search_path = '' as $$
  select p_status in ('pago', 'em_producao', 'enviado', 'entregue')
$$;

create or replace function private.br_date(p_at timestamptz)
returns date language sql immutable set search_path = '' as $$
  select ((p_at at time zone 'UTC') - interval '3 hours')::date
$$;

-- 2) Custos, preço base e retrato das vendas --------------------------------------------------------
create table if not exists private.product_finance (
  product_id text primary key references public.products (id) on delete cascade on update cascade,
  unit_cost_cents integer not null default 0 check (unit_cost_cents between 0 and 10000000),
  brand_base_cents integer check (brand_base_cents is null or brand_base_cents between 1 and 10000000),
  updated_at timestamptz not null default now()
);
alter table private.product_finance enable row level security;

-- Custo de uma peça personalizada (estúdio), que não tem linha em products
create table if not exists private.finance_settings (
  id boolean primary key default true check (id),
  custom_unit_cost_cents integer not null default 0 check (custom_unit_cost_cents between 0 and 10000000)
);
insert into private.finance_settings (id) values (true) on conflict (id) do nothing;
alter table private.finance_settings enable row level security;

create table if not exists private.sale_lines (
  order_item_id bigint primary key references public.order_items (id) on delete cascade,
  order_id bigint not null references public.orders (id) on delete cascade,
  product_id text,
  brand_slug text,
  qty integer not null,
  unit_price_cents integer not null,
  unit_cost_cents integer not null default 0,
  brand_base_cents integer,
  brand_margin_cents integer not null default 0
);
create index if not exists sale_lines_order_idx on private.sale_lines (order_id);
create index if not exists sale_lines_brand_idx on private.sale_lines (brand_slug) where brand_slug is not null;
alter table private.sale_lines enable row level security;

-- Antes de gravar: marca a data em que o pedido virou pago (só da primeira vez)
create or replace function private.order_paid_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_paid(new.status) and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists orders_paid_at on public.orders;
create trigger orders_paid_at before insert or update of status on public.orders
  for each row execute function private.order_paid_at();

-- Depois de gravar: congela custo, preço base e lucro da marca de cada item (só da primeira vez)
create or replace function private.order_sale_lines()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_paid(new.status) and not exists (select 1 from private.sale_lines where order_id = new.id) then
    insert into private.sale_lines (order_item_id, order_id, product_id, brand_slug, qty, unit_price_cents,
                                    unit_cost_cents, brand_base_cents, brand_margin_cents)
    select i.id, i.order_id, i.product_id, p.brand_slug, i.qty, i.unit_price_cents,
           case when i.product_id is null
                then coalesce((select s.custom_unit_cost_cents from private.finance_settings s limit 1), 0)
                else coalesce(f.unit_cost_cents, 0) end,
           case when p.brand_slug is not null then f.brand_base_cents end,
           case when p.brand_slug is not null and f.brand_base_cents is not null
                then greatest(0, i.unit_price_cents - f.brand_base_cents) * i.qty else 0 end
    from public.order_items i
    left join public.products p on p.id = i.product_id
    left join private.product_finance f on f.product_id = i.product_id
    where i.order_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists orders_sale_lines on public.orders;
create trigger orders_sale_lines after update of status on public.orders
  for each row execute function private.order_sale_lines();

-- 3) Lançamentos manuais ----------------------------------------------------------------------------
create table if not exists private.finance_entries (
  id bigint generated always as identity primary key,
  occurred_on date not null,
  kind text not null check (kind in ('in', 'out')),
  category text not null,
  amount_cents integer not null check (amount_cents between 1 and 1000000000),
  method text not null default 'Pix' check (method in ('Pix', 'Cartão', 'Dinheiro', 'Boleto', 'Transferência', 'Outro')),
  description text not null default '' check (char_length(description) <= 200),
  brand_slug text,
  created_at timestamptz not null default now(),
  created_by uuid,
  check ((kind = 'in' and category in ('Venda por fora', 'Aporte', 'Outras entradas'))
      or (kind = 'out' and category in ('Produção', 'Frete', 'Embalagem', 'Anúncios', 'Taxas e tarifas',
                                        'Ferramentas', 'Impostos', 'Repasse a marcas', 'Outras saídas')))
);
create index if not exists finance_entries_on_idx on private.finance_entries (occurred_on desc);
create index if not exists finance_entries_brand_idx on private.finance_entries (brand_slug) where brand_slug is not null;
alter table private.finance_entries enable row level security;

-- 4) Funções da administradora ------------------------------------------------------------------------
create or replace function public.admin_list_orders(p_status text default null, p_search text default null,
                                                   p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
begin
  perform private.require_admin();
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.orders group by status) c), '{}'::jsonb),
    'orders', coalesce((
      select jsonb_agg(o.j order by o.created_at desc) from (
        select ord.created_at, jsonb_build_object(
          'code', ord.code, 'status', ord.status, 'created_at', ord.created_at, 'paid_at', ord.paid_at,
          'payment', ord.payment, 'installments', ord.installments, 'shipping', ord.shipping,
          'subtotal_cents', ord.subtotal_cents, 'delivery_cents', ord.delivery_cents,
          'discount_cents', ord.discount_cents + ord.promo_discount_cents, 'total_cents', ord.total_cents,
          'coupon_code', ord.coupon_code, 'customer_name', ord.customer_name, 'customer_email', ord.customer_email,
          'cep', ord.cep, 'city', ord.city, 'uf', ord.uf, 'address', ord.address,
          'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'kind', i.kind, 'base', i.base,
                    'color', i.color, 'size', i.size, 'qty', i.qty, 'unit_price_cents', i.unit_price_cents) order by i.id)
                    from public.order_items i where i.order_id = ord.id), '[]'::jsonb),
          'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'type', e.type, 'from', e.status_from,
                    'to', e.status_to, 'source', e.source) order by e.at)
                    from public.order_events e where e.order_id = ord.id), '[]'::jsonb)) as j
        from public.orders ord
        where (p_status is null or ord.status = p_status)
          and (v_search is null or lower(ord.code) like '%' || v_search || '%'
               or lower(ord.customer_name) like '%' || v_search || '%'
               or lower(ord.customer_email) like '%' || v_search || '%')
        order by ord.created_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
      ) o), '[]'::jsonb));
end;
$$;

create or replace function public.admin_set_order_status(p_code text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  perform set_config('app.event_source', 'painel', true);
  update public.orders set status = p_status where code = p_code;
  if not found then raise exception 'Pedido não encontrado.' using errcode = '22023'; end if;
end;
$$;

create or replace function public.admin_list_product_finance()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'custom_unit_cost_cents', (select s.custom_unit_cost_cents from private.finance_settings s limit 1),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'price_cents', p.price_cents,
        'active', p.active, 'brand_slug', p.brand_slug, 'brand_name', b.name,
        'unit_cost_cents', coalesce(f.unit_cost_cents, 0), 'brand_base_cents', f.brand_base_cents) order by p.active desc, p.sort_order)
      from public.products p
      left join public.brands b on b.slug = p.brand_slug
      left join private.product_finance f on f.product_id = p.id), '[]'::jsonb));
end;
$$;

create or replace function public.admin_set_product_finance(p_product_id text, p_unit_cost_cents integer, p_brand_base_cents integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_price integer; v_brand text;
begin
  perform private.require_admin();
  select price_cents, brand_slug into v_price, v_brand from public.products where id = p_product_id;
  if v_price is null then raise exception 'Peça não encontrada.' using errcode = '22023'; end if;
  if p_brand_base_cents is not null and v_brand is null then
    raise exception 'Preço base é só para peças de marca parceira.' using errcode = '22023';
  end if;
  if p_brand_base_cents is not null and p_brand_base_cents > v_price then
    raise exception 'O preço base não pode passar do preço de venda.' using errcode = '22023';
  end if;
  insert into private.product_finance (product_id, unit_cost_cents, brand_base_cents, updated_at)
  values (p_product_id, coalesce(p_unit_cost_cents, 0), p_brand_base_cents, now())
  on conflict (product_id) do update set unit_cost_cents = excluded.unit_cost_cents,
    brand_base_cents = excluded.brand_base_cents, updated_at = now();
end;
$$;

create or replace function public.admin_set_custom_cost(p_cents integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update private.finance_settings set custom_unit_cost_cents = coalesce(p_cents, 0);
end;
$$;

create or replace function public.admin_add_entry(p_kind text, p_category text, p_amount_cents integer, p_occurred_on date,
                                                 p_method text, p_description text, p_brand_slug text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_brand text := nullif(trim(coalesce(p_brand_slug, '')), '');
begin
  perform private.require_admin();
  if p_category = 'Repasse a marcas' and v_brand is null then
    raise exception 'Escolha a marca do repasse.' using errcode = '22023';
  end if;
  if v_brand is not null and not exists (select 1 from public.brands where slug = v_brand) then
    raise exception 'Marca não encontrada.' using errcode = '22023';
  end if;
  if p_occurred_on is null or p_occurred_on > (private.br_date(now()) + 366) or p_occurred_on < date '2020-01-01' then
    raise exception 'Data inválida.' using errcode = '22023';
  end if;
  insert into private.finance_entries (occurred_on, kind, category, amount_cents, method, description, brand_slug, created_by)
  values (p_occurred_on, p_kind, p_category, p_amount_cents, coalesce(p_method, 'Pix'), trim(coalesce(p_description, '')),
          v_brand, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_delete_entry(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from private.finance_entries where id = p_id;
  if not found then raise exception 'Lançamento não encontrado.' using errcode = '22023'; end if;
end;
$$;

-- Período anterior de mesmo tamanho e baldes do gráfico (dia até 31 dias, semana até 180, mês acima)
create or replace function private.period_bucket(p_from date, p_to date)
returns text language sql immutable set search_path = '' as $$
  select case when p_to - p_from + 1 <= 31 then 'day' when p_to - p_from + 1 <= 180 then 'week' else 'month' end
$$;

create or replace function private.check_period(p_from date, p_to date)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
end;
$$;

-- Totais do caixa num período
create or replace function private.finance_totals(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with site as (
    select coalesce(sum(o.total_cents), 0) as cents, count(*) as orders
    from public.orders o where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
  ), lines as (
    select coalesce(sum(l.unit_cost_cents * l.qty), 0) as cost, coalesce(sum(l.brand_margin_cents), 0) as brands,
           coalesce(sum(l.qty), 0) as pieces
    from private.sale_lines l join public.orders o on o.id = l.order_id
    where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
  ), manual as (
    select coalesce(sum(amount_cents) filter (where kind = 'in'), 0) as cin,
           coalesce(sum(amount_cents) filter (where kind = 'out'), 0) as cout
    from private.finance_entries where occurred_on between p_from and p_to
  )
  select jsonb_build_object(
    'site_in', site.cents, 'manual_in', manual.cin, 'in', site.cents + manual.cin, 'out', manual.cout,
    'profit', site.cents + manual.cin - manual.cout, 'orders', site.orders, 'pieces', lines.pieces,
    'piece_cost', lines.cost, 'brand_share', lines.brands,
    'est_margin', site.cents - lines.cost - lines.brands)
  from site, lines, manual
$$;

create or replace function public.admin_finance_report(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_bucket text;
begin
  perform private.require_admin();
  perform private.check_period(p_from, p_to);
  v_days := p_to - p_from + 1;
  v_bucket := private.period_bucket(p_from, p_to);
  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', v_bucket,
    'current', private.finance_totals(p_from, p_to),
    'previous', private.finance_totals(p_from - v_days, p_from - 1),
    'pending', (select jsonb_build_object('orders', count(*), 'cents', coalesce(sum(total_cents), 0))
                from public.orders where status = 'aguardando_pagamento'),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('start', b.start, 'in', b.cin, 'out', b.cout) order by b.start) from (
        select g.start,
          coalesce((select sum(o.total_cents) from public.orders o where private.is_paid(o.status)
                    and date_trunc(v_bucket, private.br_date(o.paid_at)::timestamp)::date = g.start
                    and private.br_date(o.paid_at) between p_from and p_to), 0)
          + coalesce((select sum(e.amount_cents) from private.finance_entries e where e.kind = 'in'
                    and date_trunc(v_bucket, e.occurred_on::timestamp)::date = g.start and e.occurred_on between p_from and p_to), 0) as cin,
          coalesce((select sum(e.amount_cents) from private.finance_entries e where e.kind = 'out'
                    and date_trunc(v_bucket, e.occurred_on::timestamp)::date = g.start and e.occurred_on between p_from and p_to), 0) as cout
        from (select distinct date_trunc(v_bucket, d)::date as start
              from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d) g
      ) b), '[]'::jsonb),
    'out_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'cents', cents) order by cents desc)
      from (select category, sum(amount_cents) cents from private.finance_entries
            where kind = 'out' and occurred_on between p_from and p_to group by category) c), '[]'::jsonb),
    'in_by_source', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'cents', cents) order by cents desc)
      from (select 'Loja online' as source, sum(o.total_cents) as cents from public.orders o
            where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
            having sum(o.total_cents) > 0
            union all
            select category, sum(amount_cents) from private.finance_entries
            where kind = 'in' and occurred_on between p_from and p_to group by category) s), '[]'::jsonb),
    'to_pay_brands', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', coalesce(b.name, t.slug),
        'earned', t.earned, 'paid', t.paid, 'due', t.earned - t.paid) order by t.earned - t.paid desc)
      from (select coalesce(m.slug, p.slug) as slug, coalesce(m.earned, 0) as earned, coalesce(p.paid, 0) as paid
            from (select l.brand_slug as slug, sum(l.brand_margin_cents) as earned from private.sale_lines l
                  join public.orders o on o.id = l.order_id
                  where private.is_paid(o.status) and l.brand_slug is not null group by l.brand_slug) m
            full join (select brand_slug as slug, sum(amount_cents) as paid from private.finance_entries
                  where category = 'Repasse a marcas' and brand_slug is not null group by brand_slug) p on p.slug = m.slug) t
      left join public.brands b on b.slug = t.slug
      where t.earned <> 0 or t.paid <> 0), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(x.j order by x.on_date desc, x.created desc) from (
        select private.br_date(o.paid_at) as on_date, o.paid_at as created, jsonb_build_object(
          'source', 'site', 'code', o.code, 'on', private.br_date(o.paid_at), 'kind', 'in', 'category', 'Venda online',
          'description', 'Pedido ' || o.code || ' · ' || (select coalesce(sum(i.qty), 0) from public.order_items i where i.order_id = o.id)
                         || ' peça(s)',
          'method', o.payment, 'amount_cents', o.total_cents) as j
        from public.orders o where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
        union all
        select e.occurred_on, e.created_at, jsonb_build_object(
          'source', 'manual', 'id', e.id, 'on', e.occurred_on, 'kind', e.kind, 'category', e.category,
          'description', e.description, 'method', e.method, 'amount_cents', e.amount_cents,
          'brand_slug', e.brand_slug, 'brand_name', (select b.name from public.brands b where b.slug = e.brand_slug))
        from private.finance_entries e where e.occurred_on between p_from and p_to
        order by 1 desc, 2 desc limit 500) x), '[]'::jsonb));
end;
$$;

-- 5) Vendas da marca (dono ou administradora): só números, nunca dados de quem comprou --------------
create or replace function private.brand_totals(p_slug text, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sales', coalesce(sum(l.unit_price_cents * l.qty), 0), 'pieces', coalesce(sum(l.qty), 0),
    'profit', coalesce(sum(l.brand_margin_cents), 0), 'orders', count(distinct l.order_id))
  from private.sale_lines l join public.orders o on o.id = l.order_id
  where l.brand_slug = p_slug and private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
$$;

create or replace function public.brand_sales_report(p_slug text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_bucket text;
begin
  if not (public.can_edit_brand(p_slug) or public.is_admin()) then
    raise exception 'Só quem cuida da marca vê as vendas dela.' using errcode = '42501';
  end if;
  perform private.check_period(p_from, p_to);
  v_days := p_to - p_from + 1;
  v_bucket := private.period_bucket(p_from, p_to);
  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', v_bucket,
    'current', private.brand_totals(p_slug, p_from, p_to),
    'previous', private.brand_totals(p_slug, p_from - v_days, p_from - 1),
    -- Gráfico: lucro de cada balde deste período e do período anterior, na mesma posição
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('start', g.start, 'profit', g.cur, 'previous', g.prev) order by g.start) from (
        select s.start,
          coalesce((select sum(l.brand_margin_cents) from private.sale_lines l join public.orders o on o.id = l.order_id
                    where l.brand_slug = p_slug and private.is_paid(o.status)
                      and private.br_date(o.paid_at) between p_from and p_to
                      and date_trunc(v_bucket, private.br_date(o.paid_at)::timestamp)::date = s.start), 0) as cur,
          coalesce((select sum(l.brand_margin_cents) from private.sale_lines l join public.orders o on o.id = l.order_id
                    where l.brand_slug = p_slug and private.is_paid(o.status)
                      and private.br_date(o.paid_at) between p_from - v_days and p_from - 1
                      and date_trunc(v_bucket, (private.br_date(o.paid_at) + v_days)::timestamp)::date = s.start), 0) as prev
        from (select distinct date_trunc(v_bucket, d)::date as start
              from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d) s) g), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(t.j order by t.qty desc) from (
        select sum(l.qty) as qty, jsonb_build_object('product_id', l.product_id,
          'name', coalesce((select p.name from public.products p where p.id = l.product_id), 'Peça'),
          'qty', sum(l.qty), 'sales', sum(l.unit_price_cents * l.qty), 'profit', sum(l.brand_margin_cents),
          'base_cents', (select f.brand_base_cents from private.product_finance f where f.product_id = l.product_id),
          'price_cents', (select p.price_cents from public.products p where p.id = l.product_id)) as j
        from private.sale_lines l join public.orders o on o.id = l.order_id
        where l.brand_slug = p_slug and private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
        group by l.product_id) t), '[]'::jsonb),
    'sizes', coalesce((select jsonb_agg(jsonb_build_object('size', z.size, 'qty', z.qty) order by z.qty desc) from (
        select i.size, sum(l.qty) as qty from private.sale_lines l
        join public.orders o on o.id = l.order_id join public.order_items i on i.id = l.order_item_id
        where l.brand_slug = p_slug and private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
        group by i.size) z), '[]'::jsonb),
    'states', coalesce((select jsonb_agg(jsonb_build_object('uf', s.uf, 'qty', s.qty) order by s.qty desc) from (
        select coalesce(o.uf, '?') as uf, sum(l.qty) as qty from private.sale_lines l join public.orders o on o.id = l.order_id
        where l.brand_slug = p_slug and private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
        group by coalesce(o.uf, '?')) s), '[]'::jsonb),
    'balance', (select jsonb_build_object(
        'earned', coalesce((select sum(l.brand_margin_cents) from private.sale_lines l join public.orders o on o.id = l.order_id
                            where l.brand_slug = p_slug and private.is_paid(o.status)), 0),
        'received', coalesce((select sum(e.amount_cents) from private.finance_entries e
                              where e.brand_slug = p_slug and e.category = 'Repasse a marcas'), 0),
        'last', (select jsonb_build_object('on', e.occurred_on, 'cents', e.amount_cents, 'method', e.method)
                 from private.finance_entries e where e.brand_slug = p_slug and e.category = 'Repasse a marcas'
                 order by e.occurred_on desc, e.id desc limit 1))));
end;
$$;

-- Permissões -------------------------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.designs_upload_allowed() to anon, authenticated;

revoke all on function public.admin_list_orders(text, text, integer, integer) from public, anon;
revoke all on function public.admin_set_order_status(text, text) from public, anon;
revoke all on function public.admin_list_product_finance() from public, anon;
revoke all on function public.admin_set_product_finance(text, integer, integer) from public, anon;
revoke all on function public.admin_set_custom_cost(integer) from public, anon;
revoke all on function public.admin_add_entry(text, text, integer, date, text, text, text) from public, anon;
revoke all on function public.admin_delete_entry(bigint) from public, anon;
revoke all on function public.admin_finance_report(date, date) from public, anon;
revoke all on function public.brand_sales_report(text, date, date) from public, anon;
grant execute on function public.admin_list_orders(text, text, integer, integer) to authenticated;
grant execute on function public.admin_set_order_status(text, text) to authenticated;
grant execute on function public.admin_list_product_finance() to authenticated;
grant execute on function public.admin_set_product_finance(text, integer, integer) to authenticated;
grant execute on function public.admin_set_custom_cost(integer) to authenticated;
grant execute on function public.admin_add_entry(text, text, integer, date, text, text, text) to authenticated;
grant execute on function public.admin_delete_entry(bigint) to authenticated;
grant execute on function public.admin_finance_report(date, date) to authenticated;
grant execute on function public.brand_sales_report(text, date, date) to authenticated;

commit;
