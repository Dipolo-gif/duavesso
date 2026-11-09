-- 0016 · A loja vira marketplace de marcas.
-- 1) As 4 peças que eram da duavesso (Heavy Do Avesso, Dois Lados, Eclipse e Oversized Simples) passam
--    para a Marileus (endereço geek), por enquanto. A duavesso fica só como plataforma.
-- 2) Preço "de/por": products.compare_at_cents guarda o preço antigo (riscado no site). Promoção de
--    lançamento: 10% em todas as peças (R$ 159,90 → R$ 143,90 e R$ 119,90 → R$ 107,90).
--    place_order continua cobrando price_cents, o preço "por".
-- 3) Edição: categoria que junta marcas (Edição Geek, Edição Arte, Edição Esporte…). Fica em
--    brands.edition e muda pelo painel (admin_set_brand_edition). Os nomes das edições ficam no site.
-- O catálogo do banco precisa continuar igual ao de dist/commerce.js (tests/db.test.mjs confere).
-- Roda numa transação só e pode ser aplicada de novo sem efeito colateral.

begin;

-- 2) Preço antigo -------------------------------------------------------------------------------
alter table public.products add column if not exists compare_at_cents integer;
alter table public.products drop constraint if exists products_compare_at_check;
-- Só valores positivos: o site mostra o desconto quando o preço "de" é maior que o "por" (discountOf).
-- Comparar com price_cents aqui quebraria a 0006 aplicada de novo (ela volta os preços antigos).
alter table public.products add constraint products_compare_at_check
  check (compare_at_cents is null or compare_at_cents > 0);

-- 1) e 2) Peças: Marileus e 10% ----------------------------------------------------------------
update public.products set compare_at_cents = null;
update public.products set brand_slug = 'geek'
  where id in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'simples');
update public.products set price_cents = 14390, compare_at_cents = 15990
  where id in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'geek-coracao', 'geek-carpa');
update public.products set price_cents = 10790, compare_at_cents = 11990 where id = 'simples';
update public.products set tag = 'ESTAMPA GEEK' where id in ('geek-coracao', 'geek-carpa');

-- 3) Edições -----------------------------------------------------------------------------------
alter table public.brands add column if not exists edition text;
alter table public.brands drop constraint if exists brands_edition_check;
alter table public.brands add constraint brands_edition_check
  check (edition is null or edition ~ '^[a-z-]{2,30}$');
update public.brands set edition = 'geek' where slug = 'geek' and edition is null;
update public.brands set edition = 'arte' where slug = 'solfado' and edition is null;
update public.brands set edition = 'esporte' where slug = 'try84' and edition is null;

create or replace function public.admin_set_brand_edition(p_slug text, p_edition text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_edition text := nullif(lower(trim(coalesce(p_edition, ''))), '');
begin
  perform private.require_admin();
  if v_edition is not null and v_edition !~ '^[a-z-]{2,30}$' then
    raise exception 'Edição inválida.' using errcode = '22023';
  end if;
  update public.brands set edition = v_edition where slug = p_slug;
  if not found then raise exception 'Marca não encontrada.' using errcode = '22023'; end if;
end;
$$;
revoke all on function public.admin_set_brand_edition(text, text) from public, anon;
grant execute on function public.admin_set_brand_edition(text, text) to authenticated;

commit;
