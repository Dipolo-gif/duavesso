-- 0008 · Checkout novo: boleto, parcelas do cartão, promoções e cupom de desconto.
-- Promoções (tabela promotions, editável no painel do Supabase, Table Editor > promotions):
--   free_shipping   frete padrão grátis quando as peças somam min_subtotal_cents (já com descontos)
--   cheapest_free   quando as peças somam min_subtotal_cents, a peça mais barata sai de graça
-- O site lê as promoções ativas para mostrar "faltam R$ X para..."; o valor final é sempre
-- calculado aqui no banco. Cupons ficam em coupons (só o painel e as funções leem).
-- Depende da 0007 (limites por IP). Roda numa transação só e pode ser aplicada de novo.

begin;

-- 1) Boleto e parcelas -------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_payment_check;
alter table public.orders add constraint orders_payment_check check (payment in ('Pix', 'Cartão', 'Boleto'));
alter table public.payment_attempts drop constraint if exists payment_attempts_method_check;
alter table public.payment_attempts add constraint payment_attempts_method_check check (method in ('Pix', 'Cartão', 'Boleto'));
alter table public.orders add column if not exists installments smallint not null default 1 check (installments between 1 and 12);
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);
alter table public.orders add column if not exists promo_discount_cents integer not null default 0 check (promo_discount_cents >= 0);
insert into public.store_settings (key, value) values ('max_installments', '3') on conflict (key) do nothing;

-- 1b) Promoções ----------------------------------------------------------------------------------
create table if not exists public.promotions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('free_shipping', 'cheapest_free')),
  min_subtotal_cents integer not null check (min_subtotal_cents >= 0),
  label text not null default '' check (char_length(label) <= 80),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.promotions enable row level security;
drop policy if exists "current promotions are public" on public.promotions;
create policy "current promotions are public" on public.promotions for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
grant select on public.promotions to anon, authenticated;
-- O frete grátis que já existia (store_settings) vira a primeira promoção
insert into public.promotions (kind, min_subtotal_cents, label)
select 'free_shipping', coalesce((select (value)::text::integer from public.store_settings where key = 'free_shipping_min_cents'), 25000), 'Frete grátis'
where not exists (select 1 from public.promotions where kind = 'free_shipping');

-- Menor valor de compra que libera uma promoção agora (null = nenhuma ativa)
create or replace function private.promo_min(p_kind text)
returns integer language sql stable security definer set search_path = '' as $$
  select min(min_subtotal_cents) from public.promotions
  where kind = p_kind and active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
$$;

-- 2) Cupons -------------------------------------------------------------------------------------
create table if not exists public.coupons (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  kind text not null check (kind in ('percent', 'fixed')),   -- percent: value em %; fixed: value em centavos
  value integer not null check (value > 0),
  min_subtotal_cents integer not null default 0 check (min_subtotal_cents >= 0),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 90)
);
alter table public.coupons enable row level security; -- sem política: só o painel e as funções

-- Regra única do desconto, usada pela prévia (check_coupon) e pelo pedido (place_order).
create or replace function private.coupon_discount(p_code text, p_subtotal integer,
  out discount integer, out code text, out message text)
language plpgsql stable security definer set search_path = '' as $$
declare c public.coupons%rowtype;
begin
  discount := 0;
  if nullif(trim(coalesce(p_code, '')), '') is null then return; end if;
  select * into c from public.coupons where coupons.code = upper(trim(p_code));
  if not found or not c.active
     or (c.starts_at is not null and now() < c.starts_at)
     or (c.ends_at is not null and now() > c.ends_at)
     or (c.max_uses is not null and c.uses >= c.max_uses) then
    message := 'Cupom inválido ou expirado.';
    return;
  end if;
  if p_subtotal < c.min_subtotal_cents then
    message := 'Este cupom vale para compras a partir de R$ ' || replace(to_char(c.min_subtotal_cents / 100.0, 'FM999990.00'), '.', ',') || '.';
    return;
  end if;
  discount := least(p_subtotal, case c.kind when 'percent' then (p_subtotal * c.value) / 100 else c.value end);
  code := c.code;
end;
$$;

-- Prévia do cupom no checkout: 20 tentativas por hora por IP (dificulta adivinhar códigos).
create or replace function public.check_coupon(p_code text, p_subtotal_cents integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  perform private.take_ip('cupom', 20, 3600);
  if p_subtotal_cents is null or p_subtotal_cents < 0 then
    raise exception 'Sacola vazia ou inválida.' using errcode = '22023';
  end if;
  select * into r from private.coupon_discount(p_code, p_subtotal_cents);
  if r.code is null then
    return jsonb_build_object('ok', false, 'message', coalesce(r.message, 'Digite o código do cupom.'));
  end if;
  return jsonb_build_object('ok', true, 'code', r.code, 'discount_cents', r.discount);
end;
$$;
revoke all on function public.check_coupon(text, integer) from public;
grant execute on function public.check_coupon(text, integer) to anon, authenticated;
revoke all on function private.coupon_discount(text, integer) from public, anon, authenticated;
revoke all on function private.promo_min(text) from public, anon, authenticated;

-- 3) place_order: boleto, parcelas e cupom (o resto igual à 0006) -------------------------------
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
  v_item jsonb;
  v_product public.products%rowtype;
  v_kind text;
  v_qty integer;
  v_price integer;
  v_base text;
  v_color text;
  v_subtotal integer := 0;
  v_count integer := 0;
  v_delivery integer;
  v_discount integer := 0;
  v_promo integer := 0;
  v_coupon text;
  v_coupon_message text;
  v_installments integer := 1;
  v_order_id bigint;
  v_code text;
  v_email text;
  v_design jsonb;
  v_user uuid := (select auth.uid());
  v_uf text := nullif(upper(trim(coalesce(p_customer->>'uf', ''))), '');
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Sacola vazia ou inválida.' using errcode = '22023';
  end if;
  if p_shipping is null or p_shipping not in ('standard', 'express') then
    raise exception 'Entrega inválida.' using errcode = '22023';
  end if;
  if p_payment is null or p_payment not in ('Pix', 'Cartão', 'Boleto') then
    raise exception 'Pagamento inválido.' using errcode = '22023';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida.' using errcode = '22023';
  end if;

  select jsonb_object_agg(key, value) into v_settings from public.store_settings;

  -- Parcelas só no cartão, de 1 até o máximo da loja (store_settings.max_installments)
  if p_payment = 'Cartão' and coalesce(p_customer->>'installments', '') <> '' then
    if (p_customer->>'installments') !~ '^[0-9]{1,2}$'
       or (p_customer->>'installments')::integer not between 1 and coalesce((v_settings->>'max_installments')::integer, 3) then
      raise exception 'Parcelamento inválido.' using errcode = '22023';
    end if;
    v_installments := (p_customer->>'installments')::integer;
  end if;

  v_email := lower(trim(p_customer->>'email'));
  if v_user is not null then
    select lower(email) into v_email from auth.users where id = v_user;
  end if;
  if (select count(*) from public.orders
      where customer_email = v_email and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos pedidos em pouco tempo. Tente novamente mais tarde.' using errcode = '53400';
  end if;

  v_code := 'AV-' || upper(to_hex((extract(epoch from now()) * 1000)::bigint)) || '-'
            || upper(substr(md5(gen_random_uuid()::text), 1, 4));

  insert into public.orders (code, payment, shipping, subtotal_cents, delivery_cents, total_cents,
                             customer_name, customer_email, cep, city, address, uf, user_id, installments)
  values (v_code, p_payment, p_shipping, 0, 0, 0,
          trim(p_customer->>'name'), v_email, trim(p_customer->>'cep'),
          trim(p_customer->>'city'), trim(p_customer->>'address'), v_uf, v_user, v_installments)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_kind := v_item->>'kind';
    v_qty := case when (v_item->>'qty') ~ '^[0-9]{1,3}$' then (v_item->>'qty')::integer end;
    if v_qty is null or v_qty < 1 or v_qty > 10 then
      raise exception 'Quantidade inválida.' using errcode = '22023';
    end if;

    if v_kind = 'catalog' then
      select * into v_product from public.products where id = v_item->>'product_id' and active;
      if not found then
        raise exception 'Produto indisponível: %', v_item->>'product_id' using errcode = '22023';
      end if;
      v_price := v_product.price_cents;
      v_base := coalesce(nullif(v_item->>'base', ''), v_product.base);
      select color into v_color from public.product_variants
      where product_id = v_product.id and base = v_base and active;
      if not found then
        if v_base <> v_product.base then
          raise exception 'Cor indisponível para este produto.' using errcode = '22023';
        end if;
        v_color := v_product.color;
      end if;
      insert into public.order_items (order_id, product_id, kind, name, base, color, size, qty, unit_price_cents)
      values (v_order_id, v_product.id, 'catalog', v_product.name, v_base, v_color, v_item->>'size', v_qty, v_price);
    elsif v_kind in ('custom', 'brief') then
      v_price := case v_kind when 'brief' then (v_settings->>'custom_brief_cents')::integer
                                          else (v_settings->>'custom_create_cents')::integer end;
      v_design := coalesce(v_item->'design', '{}'::jsonb);
      if v_kind = 'brief' and char_length(coalesce(v_design->>'brief', '')) < 10 then
        raise exception 'Descreva a estampa com pelo menos 10 caracteres.' using errcode = '22023';
      end if;
      if jsonb_typeof(v_design) <> 'object' or pg_column_size(v_design) > 4096 then
        raise exception 'Personalização inválida.' using errcode = '22023';
      end if;
      insert into public.order_items (order_id, kind, name, base, size, qty, unit_price_cents, design, preview_path, image_path)
      values (v_order_id, v_kind,
              case v_kind when 'brief' then 'Sua camiseta · Estampa sob medida' else 'Sua camiseta · Studio' end,
              v_item->>'base', v_item->>'size', v_qty, v_price, v_design,
              v_item->>'preview_path', v_item->>'image_path');
    else
      raise exception 'Item inválido.' using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
    v_count := v_count + v_qty;
  end loop;

  -- 1º promoção "a mais barata sai de graça": vale uma unidade da peça mais barata do pedido
  if v_subtotal >= coalesce(private.promo_min('cheapest_free'), 2147483647) then
    select min(unit_price_cents) into v_promo from public.order_items where order_id = v_order_id;
  end if;

  -- 2º cupom, sobre o valor que sobrou. Trava a linha: dois pedidos ao mesmo tempo não passam do limite.
  if nullif(trim(coalesce(p_customer->>'coupon', '')), '') is not null then
    perform 1 from public.coupons where code = upper(trim(p_customer->>'coupon')) for update;
    select d.discount, d.code, d.message into v_discount, v_coupon, v_coupon_message
    from private.coupon_discount(p_customer->>'coupon', v_subtotal - v_promo) d;
    if v_coupon is null then
      raise exception '%', v_coupon_message using errcode = '22023';
    end if;
    update public.coupons set uses = uses + 1 where code = v_coupon;
  end if;

  -- 3º frete: grátis (no padrão) quando as peças, já com os descontos, chegam à promoção de frete
  v_delivery := case
    when p_shipping = 'express' then (v_settings->>'shipping_express_cents')::integer
    when v_subtotal - v_promo - v_discount >= coalesce(private.promo_min('free_shipping'), 2147483647) then 0
    else (v_settings->>'shipping_standard_cents')::integer end;

  update public.orders
  set subtotal_cents = v_subtotal, promo_discount_cents = v_promo, discount_cents = v_promo + v_discount,
      coupon_code = v_coupon, delivery_cents = v_delivery, total_cents = v_subtotal - v_promo - v_discount + v_delivery
  where id = v_order_id;

  if v_user is not null then
    update public.profiles
    set name = coalesce(nullif(trim(p_customer->>'name'), ''), name),
        cep = trim(p_customer->>'cep'), city = trim(p_customer->>'city'), address = trim(p_customer->>'address'),
        state = coalesce(v_uf, state)
    where id = v_user;
  end if;

  return jsonb_build_object(
    'code', v_code, 'status', 'aguardando_pagamento', 'count', v_count,
    'subtotal_cents', v_subtotal, 'promo_discount_cents', v_promo, 'coupon_discount_cents', v_discount,
    'discount_cents', v_promo + v_discount, 'delivery_cents', v_delivery,
    'total_cents', v_subtotal - v_promo - v_discount + v_delivery, 'installments', v_installments
  );
end;
$$;

commit;
