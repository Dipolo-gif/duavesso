-- 0006 · Catálogo do banco alinhado ao site (dist/commerce.js).
-- Antes desta migração o banco só conhecia os 4 produtos antigos e recusava marrom e a linha
-- "simples", então todo pedido de peça do catálogo atual caía em "Produto indisponível".
-- Roda numa transação só (tudo ou nada) e pode ser aplicada de novo sem efeito colateral.
-- O teste tests/db.test.mjs aplica 0001 a 0006 num Postgres local e compara com o catálogo do site.

begin;

-- 1) Cores e categorias que o site vende
alter table public.products drop constraint if exists products_base_check;
alter table public.products add constraint products_base_check check (base in ('white', 'black', 'brown'));
alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (category in ('graphic', 'essential', 'simples'));
alter table public.order_items drop constraint if exists order_items_base_check;
alter table public.order_items add constraint order_items_base_check check (base in ('white', 'black', 'brown'));

-- 2) Variantes de cor (hoje só a Oversized Simples tem 3 cores)
create table if not exists public.product_variants (
  product_id text not null references public.products (id) on delete cascade,
  base text not null check (base in ('white', 'black', 'brown')),
  color text not null check (char_length(color) between 2 and 40),
  active boolean not null default true,
  primary key (product_id, base)
);
alter table public.product_variants enable row level security;
drop policy if exists "active variants are public" on public.product_variants;
create policy "active variants are public" on public.product_variants
  for select to anon, authenticated using (active);
grant select on public.product_variants to anon, authenticated;

-- A cor escolhida passa a ficar gravada no item do pedido (antes se perdia)
alter table public.order_items add column if not exists color text
  check (color is null or char_length(color) <= 60);

-- UF do pedido (opcional por enquanto; o checkout vai preencher pelo CEP)
alter table public.orders add column if not exists uf text check (uf is null or uf ~ '^[A-Z]{2}$');

-- 3) Índices que faltavam
create index if not exists order_items_product_idx on public.order_items (product_id) where product_id is not null;
create index if not exists orders_uf_idx on public.orders (uf) where uf is not null;

-- 4) Catálogo atual (gerado de dist/commerce.js) e desativação dos itens antigos
insert into public.products (id, name, category, color, base, price_cents, tag, graphic, graphic_class,
                             description, print, fabric, finish, fit, care, sort_order, active) values
  ('heavy-avesso', 'Heavy · Do Avesso', 'graphic', 'Preto lavado', 'black', 15990, 'ESTAMPA AUTORAL', E'DO SEU\nAVESSO.', 'graphic-off', 'Nossa peça mais encorpada, suedine 250 g, com uma estampa para vestir do seu avesso. O modelo também vem liso em preto, off-white e marrom.', 'Serigrafia à base d’água, toque leve, resistente a lavagens', 'Suedine premium (algodão + poliamida) · 250 g/m²', 'Toque Pima, alta gramatura, menor encolhimento e caimento estável', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 1, true),
  ('heavy-faces', 'Heavy · Dois Lados', 'graphic', 'Marrom', 'brown', 15990, 'NOVA ESTAMPA', '', '', 'Suedine premium 250 g num marrom terroso, com a estampa Dois Lados nas costas: duas faces do mesmo avesso. Oversized, caimento reto.', 'Serigrafia à base d’água, toque leve, resistente a lavagens', 'Suedine premium (algodão + poliamida) · 250 g/m²', 'Toque Pima, alta gramatura, menor encolhimento e caimento estável', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 2, true),
  ('heavy-eclipse', 'Heavy · Eclipse', 'graphic', 'Marrom', 'brown', 15990, 'NOVA ESTAMPA', '', '', 'Suedine premium 250 g em marrom, com a estampa Eclipse no peito. Oversized, encorpada e com caimento reto.', 'Serigrafia à base d’água, toque leve, resistente a lavagens', 'Suedine premium (algodão + poliamida) · 250 g/m²', 'Toque Pima, alta gramatura, menor encolhimento e caimento estável', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 3, true),
  ('simples', 'Oversized Simples', 'simples', 'Preto lavado', 'black', 11990, 'BÁSICA', '', '', 'A base oversized da duavesso: suedine premium 250 g, gola canelada e caimento reto. Sem estampa, só o dv na manga. Vem em preto, off-white e marrom.', '', 'Suedine premium (algodão + poliamida) · 250 g/m²', 'Toque Pima, alta gramatura, menor encolhimento e caimento estável', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 4, true),
  ('geek-coracao', 'Coração Pixelado', 'graphic', 'Preta', 'black', 15990, 'DUAVESSOGEEK', '', '', 'Coração anatômico em pixel art que se desmancha em blocos, com PLAYER 01 no peito. Oversized preta em suedine 250 g.', 'Serigrafia à base d’água, toque leve, resistente a lavagens', 'Suedine premium (algodão + poliamida) · 250 g/m²', 'Toque Pima, alta gramatura, menor encolhimento e caimento estável', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 5, true),
  ('geek-carpa', 'Carpa Japonesa', 'graphic', 'Off white', 'white', 15990, 'DUAVESSOGEEK', '', '', 'Carpa koi em nanquim com o sol laranja, entre a arte japonesa e o traço geek. Oversized off white em suedine 250 g.', 'Serigrafia à base d’água, toque leve, resistente a lavagens', 'Suedine premium (algodão + poliamida) · 250 g/m²', 'Toque Pima, alta gramatura, menor encolhimento e caimento estável', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 6, true)
on conflict (id) do update set
  name = excluded.name, category = excluded.category, color = excluded.color, base = excluded.base,
  price_cents = excluded.price_cents, tag = excluded.tag, graphic = excluded.graphic,
  graphic_class = excluded.graphic_class, description = excluded.description, print = excluded.print,
  fabric = excluded.fabric, finish = excluded.finish, fit = excluded.fit, care = excluded.care,
  sort_order = excluded.sort_order, active = true;

insert into public.product_variants (product_id, base, color) values
  ('simples', 'black', 'Preto lavado'),
  ('simples', 'white', 'Off white'),
  ('simples', 'brown', 'Marrom')
on conflict (product_id, base) do update set color = excluded.color, active = true;

-- Itens antigos saem da vitrine, mas continuam no banco (pedidos antigos apontam para eles)
update public.products set active = false
where id not in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'simples', 'geek-coracao', 'geek-carpa');

-- 5) place_order: aceita a cor (base) escolhida, grava o nome da cor e a UF, e fecha a brecha
--    de p_items nulo. Mesmas mensagens e códigos de erro de antes; preço sempre vem do banco.
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

  v_code := 'AV-' || upper(to_hex((extract(epoch from now()) * 1000)::bigint)) || '-'
            || upper(substr(md5(gen_random_uuid()::text), 1, 4));

  insert into public.orders (code, payment, shipping, subtotal_cents, delivery_cents, total_cents,
                             customer_name, customer_email, cep, city, address, uf, user_id)
  values (v_code, p_payment, p_shipping, 0, 0, 0,
          trim(p_customer->>'name'), v_email, trim(p_customer->>'cep'),
          trim(p_customer->>'city'), trim(p_customer->>'address'), v_uf, v_user)
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

  v_delivery := case
    when p_shipping = 'express' then (v_settings->>'shipping_express_cents')::integer
    when v_subtotal >= (v_settings->>'free_shipping_min_cents')::integer then 0
    else (v_settings->>'shipping_standard_cents')::integer end;

  update public.orders
  set subtotal_cents = v_subtotal, delivery_cents = v_delivery, total_cents = v_subtotal + v_delivery
  where id = v_order_id;

  -- Guarda o endereço no perfil para o próximo checkout.
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

-- 6) Consulta de pedido também devolve a cor de cada item
create or replace function public.get_order(p_code text, p_email text)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'created_at', o.created_at,
    'total_cents', o.total_cents, 'payment', o.payment, 'shipping', o.shipping,
    'items', (select jsonb_agg(jsonb_build_object('name', i.name, 'base', i.base, 'color', i.color, 'size', i.size,
                                                  'qty', i.qty, 'unit_price_cents', i.unit_price_cents) order by i.id)
              from public.order_items i where i.order_id = o.id)
  )
  from public.orders o
  where o.code = upper(trim(p_code)) and o.customer_email = lower(trim(p_email));
$$;

commit;
