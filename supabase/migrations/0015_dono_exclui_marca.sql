-- 0015 · O dono da marca também pode excluir a própria loja, pela Minha Marca.
-- Mesmas proteções do painel (0011): o nome da marca precisa ser digitado de novo e a exclusão é
-- recusada enquanto a marca tiver peças à venda. Só quem é dono (role 'owner') ou a duavesso exclui;
-- quem é só editor da marca, não.
-- p_check_only = true só confere (nome, permissão e peças) sem apagar: o site confere primeiro, apaga
-- as imagens da pasta da marca e depois exclui a marca (depois de excluída, o dono já não teria
-- permissão sobre a pasta).
-- Roda numa transação só e pode ser aplicada de novo sem efeito colateral.

begin;

create or replace function public.delete_my_brand(p_slug text, p_confirm text, p_check_only boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text; v_products integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para excluir a loja.' using errcode = '42501';
  end if;
  select name into v_name from public.brands where slug = p_slug;
  if v_name is null then raise exception 'Marca não encontrada.' using errcode = '22023'; end if;
  if not (public.is_admin() or exists (
    select 1 from public.brand_members m
    where m.brand_slug = p_slug and m.user_id = (select auth.uid()) and m.role = 'owner'
  )) then
    raise exception 'Só quem é dono da marca pode excluir a loja.' using errcode = '42501';
  end if;
  if lower(trim(coalesce(p_confirm, ''))) <> lower(trim(v_name)) then
    raise exception 'O nome digitado não confere. Nada foi excluído.' using errcode = '22023';
  end if;
  select count(*) into v_products from public.products where brand_slug = p_slug and active;
  if v_products > 0 then
    raise exception 'A % tem % peça(s) à venda. Fale com a duavesso para tirar as peças do catálogo antes de excluir.',
      v_name, v_products using errcode = '22023';
  end if;
  if p_check_only then return; end if;
  -- Peças antigas (fora do catálogo) deixam de apontar para a marca
  update public.products set brand_slug = null where brand_slug = p_slug;
  delete from public.brands where slug = p_slug;
end;
$$;
revoke all on function public.delete_my_brand(text, text, boolean) from public, anon;
grant execute on function public.delete_my_brand(text, text, boolean) to authenticated;

-- Quem edita a marca lista e apaga as imagens da pasta dela (a API de Storage exige leitura e exclusão)
drop policy if exists "brand editors list assets" on storage.objects;
create policy "brand editors list assets" on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and public.can_edit_brand((storage.foldername(name))[1]));
drop policy if exists "brand editors delete assets" on storage.objects;
create policy "brand editors delete assets" on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and public.can_edit_brand((storage.foldername(name))[1]));

commit;
