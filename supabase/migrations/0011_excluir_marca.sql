-- 0011 · Excluir uma loja de marca, só pelo painel da duavesso.
-- Suspender esconde a loja e dá para desfazer; excluir apaga para sempre a marca e os donos (em
-- cascata). As imagens dela em brand-assets/<marca>/ são apagadas em seguida pelo site, com a API de
-- Storage (por isso a administradora ganha leitura e exclusão nesse bucket).
-- Proteções: o nome da marca precisa ser digitado de novo (conferido aqui) e a exclusão é recusada
-- enquanto a marca tiver peças à venda no catálogo.
-- Roda numa transação só e pode ser aplicada de novo sem efeito colateral.

begin;

create or replace function public.admin_delete_brand(p_slug text, p_confirm text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text; v_products integer;
begin
  perform private.require_admin();
  select name into v_name from public.brands where slug = p_slug;
  if v_name is null then raise exception 'Marca não encontrada.' using errcode = '22023'; end if;
  if lower(trim(coalesce(p_confirm, ''))) <> lower(trim(v_name)) then
    raise exception 'O nome digitado não confere. Nada foi excluído.' using errcode = '22023';
  end if;
  select count(*) into v_products from public.products where brand_slug = p_slug and active;
  if v_products > 0 then
    raise exception 'A % tem % peça(s) à venda. Tire as peças do catálogo antes de excluir, ou só suspenda a loja.',
      v_name, v_products using errcode = '22023';
  end if;
  -- Peças antigas (fora do catálogo) deixam de apontar para a marca
  update public.products set brand_slug = null where brand_slug = p_slug;
  delete from public.brands where slug = p_slug;
end;
$$;
revoke all on function public.admin_delete_brand(text, text) from public, anon;
grant execute on function public.admin_delete_brand(text, text) to authenticated;

-- A administradora lista e apaga as imagens das marcas (a API de Storage exige leitura e exclusão)
drop policy if exists "admin lists brand assets" on storage.objects;
create policy "admin lists brand assets" on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and public.is_admin());
drop policy if exists "admin deletes brand assets" on storage.objects;
create policy "admin deletes brand assets" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and public.is_admin());

commit;
