-- 0010 · "Sobre a marca" e pedidos de quem quer ter uma marca na duavesso.
-- 1) Marcas ganham um texto longo "Sobre a marca" e uma foto opcional para essa seção. O dono edita os
--    dois como o resto do conteúdo; a foto vai para brand-assets/<marca>/about-<id>.webp.
-- 2) Pedidos de marca: qualquer pessoa manda pelo formulário "Quero minha marca na duavesso"; só a
--    conta dona da duavesso lê e responde, pelo painel. Limite por IP e por e-mail para ninguém lotar
--    a fila (mesmo limitador da 0007).
-- Roda numa transação só e pode ser aplicada de novo sem efeito colateral.

begin;

-- 1) Sobre a marca --------------------------------------------------------------------------------
alter table public.brands add column if not exists about text not null default '' check (char_length(about) <= 1500);
alter table public.brands add column if not exists about_path text;

-- Imagens aceitas: arquivos do próprio site (assets/...) ou enviados pelo dono (logo, capa e foto do "Sobre")
create or replace function public.brand_image_ok(p text, p_slug text)
returns boolean language sql immutable set search_path = '' as $$
  select p is null
      or p ~ '^assets/[a-z0-9-]{2,60}\.(jpg|webp|png|svg)$'
      or (split_part(p, '/', 1) = p_slug and p ~ '^[a-z0-9-]{2,40}/(logo|cover|about)-[0-9a-z-]{6,40}\.webp$')
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_about_path_ok' and conrelid = 'public.brands'::regclass) then
    alter table public.brands add constraint brands_about_path_ok check (public.brand_image_ok(about_path, slug));
  end if;
end;
$$;

-- O dono edita o "Sobre" como o resto do conteúdo (a política de update da 0009 limita às próprias marcas)
grant update (about, about_path) on public.brands to authenticated;

drop policy if exists "brand editors upload assets" on storage.objects;
create policy "brand editors upload assets" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and array_length(storage.foldername(name), 1) = 1
    and public.can_edit_brand((storage.foldername(name))[1])
    and storage.filename(name) ~ '^(logo|cover|about)-[0-9a-z-]{6,40}\.webp$'
  );

-- 2) Pedidos de marca -----------------------------------------------------------------------------
create table if not exists public.brand_applications (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  brand_name text not null check (char_length(brand_name) between 2 and 60),
  instagram text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  about text not null check (char_length(about) between 10 and 800),
  status text not null default 'new' check (status in ('new', 'contacted', 'approved', 'declined')),
  handled_at timestamptz
);
alter table public.brand_applications enable row level security;
-- Sem política: ninguém lê nem grava direto pela API; só pelas funções abaixo
revoke all on public.brand_applications from anon, authenticated;

create or replace function public.apply_brand(p_name text, p_email text, p_brand text, p_instagram text, p_about text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  perform private.take_ip('apply_brand', 3, 3600);
  perform private.take('apply_brand:' || v_email, 3, 86400);
  insert into public.brand_applications (user_id, name, email, brand_name, instagram, about)
  values ((select auth.uid()), trim(p_name), v_email, trim(p_brand),
          nullif(regexp_replace(trim(coalesce(p_instagram, '')), '^@', ''), ''), trim(p_about));
end;
$$;

create or replace function public.admin_list_applications()
returns setof public.brand_applications language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query select * from public.brand_applications a
    order by (a.status = 'new') desc, a.created_at desc limit 200;
end;
$$;

create or replace function public.admin_set_application_status(p_id bigint, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.brand_applications set status = p_status, handled_at = now() where id = p_id;
  if not found then raise exception 'Pedido não encontrado.' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.apply_brand(text, text, text, text, text) from public;
revoke all on function public.admin_list_applications() from public, anon;
revoke all on function public.admin_set_application_status(bigint, text) from public, anon;
grant execute on function public.apply_brand(text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_list_applications() to authenticated;
grant execute on function public.admin_set_application_status(bigint, text) to authenticated;

commit;
