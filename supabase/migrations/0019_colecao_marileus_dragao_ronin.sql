-- 0019 · Nova coleção da Marileus à venda: Coração Pixelado e Carpa Japonesa voltam (reativadas) e
-- entram Dragão e Ronin, cada uma em preto e off white. Mesmos preços das outras peças da linha
-- (R$ 143,90, de R$ 159,90). O catálogo do banco continua igual ao de dist/commerce.js
-- (tests/db.test.mjs confere). Pode ser aplicada de novo sem efeito colateral.
-- Para tirar uma peça da loja de novo: update public.products set active = false where id = '...'.

begin;

-- 1) Voltam à venda (as fichas já estão certas desde as migrações 0013, 0016 e 0018)
update public.products set active = true where id in ('geek-coracao', 'geek-carpa');

-- 2) Peças novas, da Marileus (brand_slug 'geek')
insert into public.products (id, name, category, color, base, price_cents, compare_at_cents, tag, graphic, graphic_class,
                             description, print, fabric, finish, fit, care, sort_order, active, brand_slug) values
  ('geek-dragao', 'Dragão', 'graphic', 'Preta', 'black', 14390, 15990, 'ESTAMPA GEEK', '', '', 'Um dragão discreto no peito e, nas costas, duas katanas cruzadas num círculo azul-petróleo, com o dragão enroscado na lâmina. Oversized em algodão de 220 g/m², em preto e off white.', 'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica', '100% algodão penteado, fio 20.1 · 220 g/m²', 'Encolhimento zero, gola canelada de 3 cm com elastano e reforço ombro a ombro', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 7, true, 'geek'),
  ('geek-ronin', 'Ronin', 'graphic', 'Preta', 'black', 14390, 15990, 'ESTAMPA GEEK', '', '', 'Uma katana e uma folha de bordo vermelha no peito e, nas costas, o ronin de chapéu de palha diante do sol vermelho. Oversized em algodão de 220 g/m², em preto e off white.', 'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica', '100% algodão penteado, fio 20.1 · 220 g/m²', 'Encolhimento zero, gola canelada de 3 cm com elastano e reforço ombro a ombro', 'Oversized heavy: encorpada e pesada, cai reto no corpo. Para menos volume, escolha um tamanho abaixo.', 'Lavar do avesso, em água fria. Não usar alvejante. Secar à sombra.', 8, true, 'geek')
on conflict (id) do update set
  name = excluded.name, category = excluded.category, color = excluded.color, base = excluded.base,
  price_cents = excluded.price_cents, compare_at_cents = excluded.compare_at_cents, tag = excluded.tag,
  graphic = excluded.graphic, graphic_class = excluded.graphic_class, description = excluded.description,
  print = excluded.print, fabric = excluded.fabric, finish = excluded.finish, fit = excluded.fit,
  care = excluded.care, sort_order = excluded.sort_order, active = true, brand_slug = excluded.brand_slug;

-- 3) Cores de cada peça nova (place_order só aceita a cor se ela estiver aqui)
insert into public.product_variants (product_id, base, color) values
  ('geek-dragao', 'black', 'Preta'),
  ('geek-dragao', 'white', 'Off white'),
  ('geek-ronin', 'black', 'Preta'),
  ('geek-ronin', 'white', 'Off white')
on conflict (product_id, base) do update set color = excluded.color, active = true;

commit;
