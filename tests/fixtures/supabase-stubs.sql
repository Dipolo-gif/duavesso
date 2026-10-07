-- Stubs mínimos do Supabase para rodar as migrações do projeto num Postgres local (PGlite).
-- Simula auth.uid(), auth.users, os papéis anon e authenticated e as funções de storage das políticas.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  metadata jsonb not null default '{}'::jsonb,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create function storage.filename(name text) returns text language sql immutable as $$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
-- Como no Supabase: a API (anon e authenticated) enxerga o esquema storage e grava em storage.objects via RLS.
grant usage on schema storage to anon, authenticated;
grant select, insert on storage.objects to anon, authenticated;
