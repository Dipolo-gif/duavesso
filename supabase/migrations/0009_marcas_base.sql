-- 0009 · Plataforma de marcas, parte 1: permissões, marcas, donos de marca e painel da dona do site.
-- Desenho: docs/superpowers/specs/2026-10-08-plataforma-marcas-design.md
-- Roda numa transação só (tudo ou nada) e pode ser aplicada de novo sem efeito colateral.

begin;

-- 1) Dona do site: e-mails da lista, só depois de confirmados ---------------------------------
create table if not exists private.admin_emails (email text primary key check (email = lower(email)));
insert into private.admin_emails (email) values ('duavesso.co@gmail.com') on conflict do nothing;
alter table private.admin_emails enable row level security;
revoke all on private.admin_emails from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join private.admin_emails a on a.email = lower(u.email)
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  )
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2) Validação do tema e dos links ------------------------------------------------------------
create or replace function public.brand_theme_ok(t jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(t) = 'object'
     and (t - array['mode', 'c1', 'c2', 'angle', 'accent']) = '{}'::jsonb
     and t->>'mode' in ('solid', 'gradient')
     and coalesce(t->>'c1', '') ~* '^#[0-9a-f]{6}$'
     and coalesce(t->>'c2', '') ~* '^#[0-9a-f]{6}$'
     and coalesce(t->>'accent', '') ~* '^#[0-9a-f]{6}$'
     and coalesce(t->>'angle', '') ~ '^[0-9]{1,3}$' and (t->>'angle')::integer between 0 and 360
$$;
create or replace function public.brand_links_ok(l jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(l) = 'object'
     and (l - array['instagram', 'site']) = '{}'::jsonb
     and (l->>'instagram' is null or l->>'instagram' ~ '^[A-Za-z0-9._]{1,30}$')
     and (l->>'site' is null or (l->>'site' ~ '^https://[^\s<>"]{4,120}$'))
$$;
-- Imagens: arquivos do próprio site (assets/...) ou enviados pelo dono para brand-assets/<marca>/
create or replace function public.brand_image_ok(p text, p_slug text)
returns boolean language sql immutable set search_path = '' as $$
  select p is null
      or p ~ '^assets/[a-z0-9-]{2,60}\.(jpg|webp|png|svg)$'
      or (split_part(p, '/', 1) = p_slug and p ~ '^[a-z0-9-]{2,40}/(logo|cover)-[0-9a-z-]{6,40}\.webp$')
$$;

-- 3) Marcas e donos ---------------------------------------------------------------------------
create table if not exists public.brands (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 60),
  tagline text not null default '' check (char_length(tagline) <= 80),
  bio text not null default '' check (char_length(bio) <= 160),
  status text not null default 'active' check (status in ('active', 'suspended')),
  plan text not null default 'free' check (plan in ('free', 'paid')),
  paid_at timestamptz,
  paid_note text check (paid_note is null or char_length(paid_note) <= 200),
  theme jsonb not null default '{"mode":"solid","c1":"#161719","c2":"#161719","angle":135,"accent":"#1737bc"}'::jsonb
    check (public.brand_theme_ok(theme)),
  logo_path text,
  cover_path text,
  links jsonb not null default '{}'::jsonb check (public.brand_links_ok(links)),
  featured_product_id text references public.products (id) on delete set null,
  featured_badge text not null default '' check (char_length(featured_badge) <= 24),
  featured_until timestamptz,
  external_url text check (external_url is null or external_url ~ '^https://[^\s<>"]{4,200}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public.brand_image_ok(logo_path, slug) and public.brand_image_ok(cover_path, slug))
);
alter table public.brands enable row level security;
drop trigger if exists brands_touch on public.brands;
create trigger brands_touch before update on public.brands for each row execute function public.touch_updated_at();

create table if not exists public.brand_members (
  brand_slug text not null references public.brands (slug) on delete cascade on update cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (brand_slug, user_id)
);
create index if not exists brand_members_user_idx on public.brand_members (user_id);
alter table public.brand_members enable row level security;

-- Pode editar a marca: a dona do site ou alguém da equipe da marca
create or replace function public.can_edit_brand(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.brand_members m where m.brand_slug = p_slug and m.user_id = (select auth.uid())
  )
$$;
revoke all on function public.can_edit_brand(text) from public;
grant execute on function public.can_edit_brand(text) to authenticated;

drop policy if exists "active brands are public" on public.brands;
create policy "active brands are public" on public.brands for select to anon, authenticated
  using (status = 'active');
drop policy if exists "editors read their brands" on public.brands;
create policy "editors read their brands" on public.brands for select to authenticated
  using (public.can_edit_brand(slug));
drop policy if exists "editors update their brands" on public.brands;
create policy "editors update their brands" on public.brands for update to authenticated
  using (public.can_edit_brand(slug)) with check (public.can_edit_brand(slug));
-- Privilégios explícitos (o Supabase pode dar permissões automáticas a tabelas novas)
revoke all on public.brands, public.brand_members from anon, authenticated;
grant select on public.brands to anon, authenticated;
-- Só o conteúdo da página: situação, plano e endereço mudam pelo painel (funções abaixo)
grant update (name, tagline, bio, theme, logo_path, cover_path, links, featured_product_id, featured_badge, featured_until)
  on public.brands to authenticated;

drop policy if exists "members read own membership" on public.brand_members;
create policy "members read own membership" on public.brand_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
grant select on public.brand_members to authenticated;

-- Peças pertencem a uma marca (as da duavesso ficam sem marca)
alter table public.products add column if not exists brand_slug text references public.brands (slug) on update cascade;

-- A peça em destaque precisa ser da própria marca
create or replace function private.check_brand_featured()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.featured_product_id is not null and not exists (
    select 1 from public.products p where p.id = new.featured_product_id and p.brand_slug = new.slug and p.active
  ) then
    raise exception 'A peça em destaque precisa ser uma peça ativa da sua marca.' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists brands_featured_check on public.brands;
create trigger brands_featured_check before insert or update of featured_product_id on public.brands
  for each row execute function private.check_brand_featured();

-- 4) Funções da conta e do painel -------------------------------------------------------------
-- Marcas que a pessoa logada edita (a aba "Minha Marca" aparece quando a lista não é vazia)
create or replace function public.my_brands()
returns setof public.brands language sql stable security definer set search_path = '' as $$
  select b.* from public.brands b
  join public.brand_members m on m.brand_slug = b.slug and m.user_id = (select auth.uid())
  order by b.name
$$;
revoke all on function public.my_brands() from public;
grant execute on function public.my_brands() to authenticated;

create or replace function private.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Área restrita à duavesso.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_list_brands()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'owners', coalesce((select jsonb_agg(jsonb_build_object('email', u.email, 'name', coalesce(p.name, '')) order by m.created_at)
                          from public.brand_members m join auth.users u on u.id = m.user_id
                          left join public.profiles p on p.id = m.user_id
                          where m.brand_slug = b.slug), '[]'::jsonb),
      'products', (select count(*) from public.products pr where pr.brand_slug = b.slug and pr.active))
      order by b.created_at)
    from public.brands b), '[]'::jsonb);
end;
$$;

-- Torna uma conta existente dona de uma marca nova (ou de uma marca sem dono, como as antigas)
create or replace function public.admin_create_brand(p_email text, p_slug text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_slug text := lower(trim(p_slug));
begin
  perform private.require_admin();
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Não existe conta com esse e-mail. Peça para a pessoa criar a conta na loja primeiro.' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'Endereço inválido: use letras minúsculas, números e hífen (2 a 40).' using errcode = '22023';
  end if;
  if not exists (select 1 from public.brands where slug = v_slug) then
    insert into public.brands (slug, name) values (v_slug, trim(p_name));
  end if;
  insert into public.brand_members (brand_slug, user_id, role) values (v_slug, v_user, 'owner')
  on conflict (brand_slug, user_id) do nothing;
  return jsonb_build_object('slug', v_slug);
end;
$$;

create or replace function public.admin_set_brand_status(p_slug text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.brands set status = p_status where slug = p_slug;
  if not found then raise exception 'Marca não encontrada.' using errcode = '22023'; end if;
end;
$$;

-- Plano pago: R$ 400 uma vez, recebido por fora enquanto não há cobrança online
create or replace function public.admin_set_brand_plan(p_slug text, p_plan text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.brands
  set plan = p_plan,
      paid_at = case when p_plan = 'paid' then coalesce(paid_at, now()) else null end,
      paid_note = case when p_plan = 'paid' then nullif(trim(coalesce(p_note, '')), '') else null end
  where slug = p_slug;
  if not found then raise exception 'Marca não encontrada.' using errcode = '22023'; end if;
end;
$$;

create or replace function public.admin_remove_owner(p_slug text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  delete from public.brand_members m using auth.users u
  where m.brand_slug = p_slug and m.user_id = u.id and lower(u.email) = lower(trim(p_email));
end;
$$;

revoke all on function public.admin_list_brands() from public, anon;
revoke all on function public.admin_create_brand(text, text, text) from public, anon;
revoke all on function public.admin_set_brand_status(text, text) from public, anon;
revoke all on function public.admin_set_brand_plan(text, text, text) from public, anon;
revoke all on function public.admin_remove_owner(text, text) from public, anon;
grant execute on function public.admin_list_brands() to authenticated;
grant execute on function public.admin_create_brand(text, text, text) to authenticated;
grant execute on function public.admin_set_brand_status(text, text) to authenticated;
grant execute on function public.admin_set_brand_plan(text, text, text) to authenticated;
grant execute on function public.admin_remove_owner(text, text) to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.designs_upload_allowed() to anon, authenticated;

-- 5) Imagens das marcas (logo e faixa de capa): leitura pública, escrita só na pasta da própria marca
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 3145728, array['image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/webp'];
drop policy if exists "brand editors upload assets" on storage.objects;
create policy "brand editors upload assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and array_length(storage.foldername(name), 1) = 1
    and public.can_edit_brand((storage.foldername(name))[1])
    and storage.filename(name) ~ '^(logo|cover)-[0-9a-z-]{6,40}\.webp$'
  );

-- 6) As 3 marcas de hoje (dist/brands.js) -----------------------------------------------------
insert into public.brands (slug, name, tagline, bio, theme, cover_path, external_url) values
  ('geek', 'duavessogeek', 'games · pixel · sci-fi',
   'Cultura geek no avesso: games, pixel, sci-fi e as referências que só quem é do meio pega, no caimento oversized da duavesso.',
   '{"mode":"solid","c1":"#141519","c2":"#141519","angle":135,"accent":"#3a5bff"}', null, null),
  ('try84', 'TRY84', 'rugby lifestyle · forward together',
   'Feita por jogadores. Rugby lifestyle em preto e branco, do treino ao terceiro tempo.',
   '{"mode":"solid","c1":"#1c1d1f","c2":"#1c1d1f","angle":135,"accent":"#ffffff"}', 'assets/try84-hero.jpg', 'https://try84.com.br'),
  ('solfado', 'SolFáDó', 'camisetas inspiradas na música',
   'Música é a arte do som. Estampas inspiradas em hinos, para o 1º Encontro de Violeiros.',
   '{"mode":"solid","c1":"#f2efe7","c2":"#f2efe7","angle":135,"accent":"#17324f"}', null, 'https://solfado.com.br')
on conflict (slug) do nothing;
update public.products set brand_slug = 'geek' where id in ('geek-coracao', 'geek-carpa') and brand_slug is null;

commit;
