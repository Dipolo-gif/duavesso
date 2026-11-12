-- 0020 · Linha Marileus: grade de tamanhos PP a XG, ficha técnica da base oversized do fornecedor
-- (malha suedine, no mínimo 85% algodão, 210 g/m²) e a nova estampa Critical Fate (preto e off white).
-- Gerada a partir de dist/commerce.js, que o tests/db.test.mjs confere campo a campo.
-- Pode ser aplicada de novo sem efeito colateral.

begin;

-- 1) Tamanhos: a Marileus vende de PP a XG (o site só oferece PP e XG nas peças dela)
alter table public.order_items drop constraint if exists order_items_size_check;
alter table public.order_items add constraint order_items_size_check check (size in ('PP', 'P', 'M', 'G', 'GG', 'XG'));

-- 2) Ficha técnica das peças da Marileus
update public.products set description = 'Coração anatômico em pixel art que se desmancha em blocos, com PLAYER 01 no peito. Oversized preta, malha de 210 g/m².', fabric = 'Malha suedine com no mínimo 85% de algodão e fio de alma · 210 g/m²', finish = 'Gola redonda canelada 2×1 de 3 cm e reforço ombro a ombro. Não encolhe, não desbota e mantém a estrutura após várias lavagens', fit = 'Oversized: caimento solto e moderno. Para menos volume, escolha um tamanho abaixo.', care = 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.' where id = 'geek-coracao';
update public.products set description = 'Carpa koi em nanquim com o sol laranja, entre a arte japonesa e o traço geek. Oversized off white, malha de 210 g/m².', fabric = 'Malha suedine com no mínimo 85% de algodão e fio de alma · 210 g/m²', finish = 'Gola redonda canelada 2×1 de 3 cm e reforço ombro a ombro. Não encolhe, não desbota e mantém a estrutura após várias lavagens', fit = 'Oversized: caimento solto e moderno. Para menos volume, escolha um tamanho abaixo.', care = 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.' where id = 'geek-carpa';
update public.products set description = 'Um dragão discreto no peito e, nas costas, duas katanas cruzadas num círculo azul-petróleo, com o dragão enroscado na lâmina. Oversized em malha de 210 g/m², em preto e off white.', fabric = 'Malha suedine com no mínimo 85% de algodão e fio de alma · 210 g/m²', finish = 'Gola redonda canelada 2×1 de 3 cm e reforço ombro a ombro. Não encolhe, não desbota e mantém a estrutura após várias lavagens', fit = 'Oversized: caimento solto e moderno. Para menos volume, escolha um tamanho abaixo.', care = 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.' where id = 'geek-dragao';
update public.products set description = 'Uma katana e uma folha de bordo vermelha no peito e, nas costas, o ronin de chapéu de palha diante do sol vermelho. Oversized em malha de 210 g/m², em preto e off white.', fabric = 'Malha suedine com no mínimo 85% de algodão e fio de alma · 210 g/m²', finish = 'Gola redonda canelada 2×1 de 3 cm e reforço ombro a ombro. Não encolhe, não desbota e mantém a estrutura após várias lavagens', fit = 'Oversized: caimento solto e moderno. Para menos volume, escolha um tamanho abaixo.', care = 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.' where id = 'geek-ronin';

-- 3) Critical Fate, da Marileus (brand_slug 'geek')
insert into public.products (id, name, category, color, base, price_cents, compare_at_cents, tag, graphic, graphic_class,
                             description, print, fabric, finish, fit, care, sort_order, active, brand_slug) values
  ('geek-critical', 'Critical Fate', 'graphic', 'Preta', 'black', 14390, 15990, 'ESTAMPA GEEK', '', '', 'Um d20 preso a uma adaga, com estrela e traço azul, no peito e, nas costas, o dragão enroscado numa lua crescente segurando o d20 pela corrente, e uma mão de esqueleto empunhando a adaga. Para quem decide o destino na rolagem. Oversized em preto e off white.', 'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica', 'Malha suedine com no mínimo 85% de algodão e fio de alma · 210 g/m²', 'Gola redonda canelada 2×1 de 3 cm e reforço ombro a ombro. Não encolhe, não desbota e mantém a estrutura após várias lavagens', 'Oversized: caimento solto e moderno. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 9, true, 'geek')
on conflict (id) do update set
  name = excluded.name, category = excluded.category, color = excluded.color, base = excluded.base,
  price_cents = excluded.price_cents, compare_at_cents = excluded.compare_at_cents, tag = excluded.tag,
  graphic = excluded.graphic, graphic_class = excluded.graphic_class, description = excluded.description,
  print = excluded.print, fabric = excluded.fabric, finish = excluded.finish, fit = excluded.fit,
  care = excluded.care, sort_order = excluded.sort_order, active = true, brand_slug = excluded.brand_slug;

-- 4) Cores da peça nova (place_order só aceita a cor se ela estiver aqui)
insert into public.product_variants (product_id, base, color) values
  ('geek-critical', 'black', 'Preta'),
  ('geek-critical', 'white', 'Off white')
on conflict (product_id, base) do update set color = excluded.color, active = true;

commit;
