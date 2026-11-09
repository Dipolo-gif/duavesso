-- 0017 · As 6 peças saem da loja: as estampas vão ser reformuladas.
-- As peças continuam no banco (pedidos antigos e financeiro apontam para elas), só deixam de estar
-- à venda: place_order recusa peça inativa e o site não mostra nenhuma. A peça em destaque das marcas
-- é limpa. Para voltar uma peça: update public.products set active = true where id = '...'.
-- O catálogo do banco continua igual ao de dist/commerce.js (PRODUCTS vazio; tests/db.test.mjs confere).
-- Pode ser aplicada de novo sem efeito colateral.

begin;

update public.products set active = false
  where id in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'simples', 'geek-coracao', 'geek-carpa');
update public.brands set featured_product_id = null, featured_badge = '', featured_until = null
  where featured_product_id in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'simples', 'geek-coracao', 'geek-carpa');

commit;
