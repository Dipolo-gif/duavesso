-- 0018 · As estampas são em DTF têxtil, não em serigrafia: corrige a ficha das peças.
-- (As peças estão fora da loja desde a 0017; a ficha fica certa para quando voltarem.)
-- Pode ser aplicada de novo sem efeito colateral.

begin;

update public.products set print = 'DTF têxtil: cores vivas e traço fino, aplicado com prensa térmica'
  where id in ('heavy-avesso', 'heavy-faces', 'heavy-eclipse', 'geek-coracao', 'geek-carpa');

commit;
