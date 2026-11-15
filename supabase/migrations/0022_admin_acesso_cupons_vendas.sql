-- 0022 · Área /admin: acesso por usuário e senha, cupons no painel, vendas por marca e por peça, e saldo do caixa.
-- 1) Acesso: o login "usuário + senha" do /admin é uma conta do Supabase Auth com e-mail interno, que não
--    recebe mensagens: <usuario>@admin.duavesso.invalid (.invalid é um domínio reservado, que ninguém registra).
--    A conta é criada pela duavesso no painel do Supabase (Authentication > Add user, com Auto Confirm), e a
--    senha só passa pelo Supabase. Como esse endereço não recebe e-mail, um cadastro feito por fora nunca fica
--    confirmado, e is_admin() (0009) só aceita conta confirmada. A lista de quem entra continua em
--    private.admin_emails; aqui entram as funções para ver, adicionar e desligar acessos pelo painel.
-- 2) Cupons: a tabela é a da 0008; aqui entram as funções do painel (listar, criar, editar, pausar, excluir).
-- 3) Vendas: por marca e por peça no período, a partir do retrato das vendas pagas (private.sale_lines, 0012).
-- 4) Saldo: tudo o que entrou menos tudo o que saiu até hoje (vendas pagas do site + lançamentos manuais).
-- Roda numa transação só e pode ser aplicada de novo sem efeito colateral.

begin;

-- 1) Acesso por usuário e senha -------------------------------------------------------------------------
-- Primeiro usuário: admin. Só entra se ainda não houver nenhum acesso por usuário na lista.
insert into private.admin_emails (email)
select 'admin@admin.duavesso.invalid'
where not exists (select 1 from private.admin_emails where email like '%@admin.duavesso.invalid');

-- Nome de usuário de um acesso da lista (null quando o acesso é um e-mail de verdade)
create or replace function private.admin_username(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case when p_email like '%@admin.duavesso.invalid' then split_part(p_email, '@', 1) end
$$;

create or replace function public.admin_access_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'login', a.email, 'username', private.admin_username(a.email),
      'has_account', u.id is not null and u.email_confirmed_at is not null,
      'last_sign_in_at', u.last_sign_in_at,
      'me', u.id is not null and u.id = (select auth.uid()))
      order by (private.admin_username(a.email) is null), a.email)
    from private.admin_emails a left join auth.users u on lower(u.email) = a.email), '[]'::jsonb);
end;
$$;

-- Novo usuário: a conta precisa existir antes (criada no Supabase), para o acesso nunca ficar esperando por uma conta
create or replace function public.admin_access_add(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user text := lower(trim(coalesce(p_username, ''))); v_email text;
begin
  perform private.require_admin();
  if v_user !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Usuário inválido: use de 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado.' using errcode = '22023';
  end if;
  v_email := v_user || '@admin.duavesso.invalid';
  if exists (select 1 from private.admin_emails where email = v_email) then
    raise exception 'Este usuário já tem acesso.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where lower(u.email) = v_email and u.email_confirmed_at is not null) then
    raise exception 'Crie primeiro a conta % no Supabase (Authentication, Add user, com Auto Confirm) e depois adicione o usuário aqui.', v_email using errcode = '22023';
  end if;
  if (select count(*) from private.admin_emails) >= 10 then
    raise exception 'Limite de 10 acessos. Desligue um para adicionar outro.' using errcode = '22023';
  end if;
  insert into private.admin_emails (email) values (v_email);
  return v_email;
end;
$$;

-- Desligar um acesso: nunca o que a pessoa está usando agora (assim sempre sobra um acesso que funciona)
create or replace function public.admin_access_remove(p_login text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_login text := lower(trim(coalesce(p_login, ''))); v_me text;
begin
  perform private.require_admin();
  select lower(email) into v_me from auth.users where id = (select auth.uid());
  if v_login = v_me then
    raise exception 'Você está usando este acesso agora. Entre com outro acesso para desligar este.' using errcode = '22023';
  end if;
  delete from private.admin_emails where email = v_login;
  if not found then raise exception 'Acesso não encontrado.' using errcode = '22023'; end if;
end;
$$;

-- 2) Cupons no painel -------------------------------------------------------------------------------------
create or replace function public.admin_list_coupons()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'code', c.code, 'kind', c.kind, 'value', c.value, 'min_subtotal_cents', c.min_subtotal_cents,
      'max_uses', c.max_uses, 'uses', c.uses, 'active', c.active, 'starts_at', c.starts_at, 'ends_at', c.ends_at,
      'created_at', c.created_at,
      'state', case when not c.active then 'pausado'
                    when c.ends_at is not null and now() > c.ends_at then 'vencido'
                    when c.max_uses is not null and c.uses >= c.max_uses then 'esgotado'
                    when c.starts_at is not null and now() < c.starts_at then 'agendado'
                    else 'ativo' end,
      'paid_orders', coalesce(s.orders, 0), 'discount_cents', coalesce(s.discount, 0), 'sales_cents', coalesce(s.sales, 0))
      order by c.created_at desc, c.code)
    from public.coupons c
    left join (select o.coupon_code, count(*) as orders, sum(o.discount_cents) as discount, sum(o.total_cents) as sales
               from public.orders o where o.coupon_code is not null and private.is_paid(o.status)
               group by o.coupon_code) s on s.coupon_code = c.code), '[]'::jsonb);
end;
$$;

-- Cria (p_new) ou edita um cupom. percent: p_value em %, até 90; fixed: p_value em centavos.
create or replace function public.admin_save_coupon(p_code text, p_kind text, p_value integer,
  p_min_subtotal_cents integer default 0, p_max_uses integer default null, p_starts_at timestamptz default null,
  p_ends_at timestamptz default null, p_active boolean default true, p_new boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform private.require_admin();
  if v_code !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'O código precisa ter de 3 a 20 letras ou números, sem espaços nem acentos.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('percent', 'fixed') then
    raise exception 'Escolha o tipo do desconto.' using errcode = '22023';
  end if;
  if p_value is null or p_value < 1 then
    raise exception 'Informe o valor do desconto.' using errcode = '22023';
  end if;
  if p_kind = 'percent' and p_value > 90 then
    raise exception 'O desconto em porcentagem vai até 90%%.' using errcode = '22023';
  end if;
  if p_kind = 'fixed' and p_value > 100000000 then
    raise exception 'Valor do desconto alto demais.' using errcode = '22023';
  end if;
  if coalesce(p_min_subtotal_cents, 0) < 0 or coalesce(p_min_subtotal_cents, 0) > 100000000 then
    raise exception 'Compra mínima inválida.' using errcode = '22023';
  end if;
  if p_max_uses is not null and (p_max_uses < 1 or p_max_uses > 1000000) then
    raise exception 'O número máximo de usos precisa ser pelo menos 1.' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'A validade termina antes de começar.' using errcode = '22023';
  end if;
  if p_new and exists (select 1 from public.coupons where code = v_code) then
    raise exception 'Já existe um cupom com este código.' using errcode = '22023';
  end if;
  if not p_new and not exists (select 1 from public.coupons where code = v_code) then
    raise exception 'Cupom não encontrado.' using errcode = '22023';
  end if;
  insert into public.coupons (code, kind, value, min_subtotal_cents, max_uses, starts_at, ends_at, active)
  values (v_code, p_kind, p_value, coalesce(p_min_subtotal_cents, 0), p_max_uses, p_starts_at, p_ends_at, coalesce(p_active, true))
  on conflict (code) do update set kind = excluded.kind, value = excluded.value,
    min_subtotal_cents = excluded.min_subtotal_cents, max_uses = excluded.max_uses,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, active = excluded.active;
  return (select to_jsonb(c) from public.coupons c where c.code = v_code);
end;
$$;

create or replace function public.admin_set_coupon_active(p_code text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.coupons set active = coalesce(p_active, false) where code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'Cupom não encontrado.' using errcode = '22023'; end if;
end;
$$;

-- Excluir só cupom que nunca foi usado: o usado fica no histórico dos pedidos (pause em vez de excluir)
create or replace function public.admin_delete_coupon(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform private.require_admin();
  if exists (select 1 from public.coupons where code = v_code and uses > 0)
     or exists (select 1 from public.orders where coupon_code = v_code) then
    raise exception 'Este cupom já foi usado em pedidos. Pause o cupom em vez de excluir.' using errcode = '22023';
  end if;
  delete from public.coupons where code = v_code;
  if not found then raise exception 'Cupom não encontrado.' using errcode = '22023'; end if;
end;
$$;

-- 3) Vendas por marca e por peça ----------------------------------------------------------------------------
create or replace function private.sales_totals(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sales', coalesce(sum(l.unit_price_cents * l.qty), 0), 'pieces', coalesce(sum(l.qty), 0),
    'orders', count(distinct l.order_id), 'brand_share', coalesce(sum(l.brand_margin_cents), 0),
    'piece_cost', coalesce(sum(l.unit_cost_cents * l.qty), 0))
  from private.sale_lines l join public.orders o on o.id = l.order_id
  where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
$$;

-- Vendas pagas do período: totais, cada marca (peças da duavesso e personalizadas entram como linhas próprias),
-- as peças mais vendidas e os tamanhos. Só números: nenhum dado de quem comprou.
create or replace function public.admin_sales_report(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_days integer;
begin
  perform private.require_admin();
  perform private.check_period(p_from, p_to);
  v_days := p_to - p_from + 1;
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'current', private.sales_totals(p_from, p_to),
    'previous', private.sales_totals(p_from - v_days, p_from - 1),
    'by_brand', coalesce((select jsonb_agg(jsonb_build_object('slug', g.slug, 'kind', g.kind,
        'name', case g.kind when 'brand' then coalesce((select b.name from public.brands b where b.slug = g.slug), g.slug)
                            when 'custom' then 'Personalizadas (estúdio)' else 'duavesso' end,
        'sales', g.sales, 'pieces', g.pieces, 'orders', g.orders, 'brand_share', g.brand_share, 'piece_cost', g.piece_cost)
        order by g.sales desc, g.pieces desc)
      from (select l.brand_slug as slug,
                   case when l.brand_slug is not null then 'brand' when l.product_id is null then 'custom' else 'own' end as kind,
                   sum(l.unit_price_cents * l.qty) as sales, sum(l.qty) as pieces, count(distinct l.order_id) as orders,
                   sum(l.brand_margin_cents) as brand_share, sum(l.unit_cost_cents * l.qty) as piece_cost
            from private.sale_lines l join public.orders o on o.id = l.order_id
            where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
            group by 1, 2) g), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(t.j order by t.qty desc, t.sales desc) from (
        select sum(l.qty) as qty, sum(l.unit_price_cents * l.qty) as sales, jsonb_build_object(
          'product_id', l.product_id,
          'name', coalesce(max(p.name), case when l.product_id is null then 'Camiseta personalizada (estúdio)' else 'Peça fora do catálogo' end),
          'brand_slug', max(l.brand_slug), 'brand_name', coalesce(max(b.name), case when l.product_id is null then 'Estúdio' else 'duavesso' end),
          'qty', sum(l.qty), 'sales', sum(l.unit_price_cents * l.qty), 'orders', count(distinct l.order_id)) as j
        from private.sale_lines l join public.orders o on o.id = l.order_id
        left join public.products p on p.id = l.product_id
        left join public.brands b on b.slug = l.brand_slug
        where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
        group by l.product_id
        order by 1 desc, 2 desc limit 30) t), '[]'::jsonb),
    'sizes', coalesce((select jsonb_agg(jsonb_build_object('size', z.size, 'qty', z.qty) order by z.qty desc, z.size) from (
        select i.size, sum(l.qty) as qty from private.sale_lines l
        join public.orders o on o.id = l.order_id join public.order_items i on i.id = l.order_item_id
        where private.is_paid(o.status) and private.br_date(o.paid_at) between p_from and p_to
        group by i.size) z), '[]'::jsonb));
end;
$$;

-- 4) Saldo do caixa: tudo o que entrou menos tudo o que saiu, até hoje ---------------------------------------
create or replace function public.admin_balance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t jsonb;
begin
  perform private.require_admin();
  t := private.finance_totals(date '2000-01-01', private.br_date(now()));
  return jsonb_build_object('in', t->'in', 'out', t->'out', 'balance', t->'profit',
                            'site_in', t->'site_in', 'manual_in', t->'manual_in', 'on', private.br_date(now()));
end;
$$;

-- Permissões ---------------------------------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.designs_upload_allowed() to anon, authenticated;

revoke all on function public.admin_access_list() from public, anon;
revoke all on function public.admin_access_add(text) from public, anon;
revoke all on function public.admin_access_remove(text) from public, anon;
revoke all on function public.admin_list_coupons() from public, anon;
revoke all on function public.admin_save_coupon(text, text, integer, integer, integer, timestamptz, timestamptz, boolean, boolean) from public, anon;
revoke all on function public.admin_set_coupon_active(text, boolean) from public, anon;
revoke all on function public.admin_delete_coupon(text) from public, anon;
revoke all on function public.admin_sales_report(date, date) from public, anon;
revoke all on function public.admin_balance() from public, anon;
grant execute on function public.admin_access_list() to authenticated;
grant execute on function public.admin_access_add(text) to authenticated;
grant execute on function public.admin_access_remove(text) to authenticated;
grant execute on function public.admin_list_coupons() to authenticated;
grant execute on function public.admin_save_coupon(text, text, integer, integer, integer, timestamptz, timestamptz, boolean, boolean) to authenticated;
grant execute on function public.admin_set_coupon_active(text, boolean) to authenticated;
grant execute on function public.admin_delete_coupon(text) to authenticated;
grant execute on function public.admin_sales_report(date, date) to authenticated;
grant execute on function public.admin_balance() to authenticated;

commit;
