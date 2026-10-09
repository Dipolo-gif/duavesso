-- 0013 · Tecidos conforme o catálogo do fornecedor.
-- Linha Heavy e geek: Heavy Oversized 20.1 (100% algodão penteado, 220 g/m², encolhimento zero).
-- Oversized Simples: Basic Oversized 30.1 (100% algodão penteado, 180 g/m²).
-- Substitui o texto antigo ("suedine premium, algodão + poliamida, 250 g/m²"), que não confere com o fornecedor.
-- Pode ser aplicada de novo sem efeito colateral.

begin;

update public.products set fabric = '100% algodão penteado, fio 20.1 · 220 g/m²', finish = 'Encolhimento zero, gola canelada de 3 cm com elastano e reforço ombro a ombro'
where id in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'geek-coracao', 'geek-carpa');

update public.products set fabric = '100% algodão penteado, fio 30.1 · 180 g/m²', finish = 'Gola canelada de 3 cm com elastano, bainha de 4 cm e reforço ombro a ombro', fit = 'Oversized: ombro caído e corpo amplo, cai reto. Para menos volume, escolha um tamanho abaixo.'
where id = 'simples';

update public.products set description = 'Nossa peça mais encorpada, 100% algodão de 220 g/m², com uma estampa para vestir do seu avesso. O modelo também vem liso em preto, off-white e marrom.' where id = 'heavy-avesso';
update public.products set description = 'Algodão de 220 g/m² num marrom terroso, com a estampa Dois Lados nas costas: duas faces do mesmo avesso. Oversized, caimento reto.' where id = 'heavy-faces';
update public.products set description = 'Algodão de 220 g/m² em marrom, com a estampa Eclipse no peito. Oversized, encorpada e com caimento reto.' where id = 'heavy-eclipse';
update public.products set description = 'A base oversized da duavesso: 100% algodão penteado de 180 g/m², gola canelada e caimento reto. Sem estampa, só o dv na manga. Vem em preto, off-white e marrom.' where id = 'simples';
update public.products set description = 'Coração anatômico em pixel art que se desmancha em blocos, com PLAYER 01 no peito. Oversized preta em algodão de 220 g/m².' where id = 'geek-coracao';
update public.products set description = 'Carpa koi em nanquim com o sol laranja, entre a arte japonesa e o traço geek. Oversized off white em algodão de 220 g/m².' where id = 'geek-carpa';

commit;
