-- 0021 · Nova marca ESS, na Edição Esporte: estilo infantil de corrida (carros esportivos, pista e
-- bandeira quadriculada), com site exclusivo em /ess. Ainda sem peças à venda: o site e a página da
-- marca mostram a espera da primeira coleção. Cores iguais às de dist/brands.js (lista de reserva).
-- Pode ser aplicada de novo sem efeito colateral.

begin;

insert into public.brands (slug, name, tagline, bio, theme, cover_path, external_url, edition) values
  ('ess', 'ESS', 'carros esportivos · pista · diversão',
   'Camisetas com carros esportivos, pista e bandeira quadriculada, no estilo divertido de corrida, para pequenos pilotos e para quem nunca deixou de ser um.',
   '{"mode":"solid","c1":"#ffbf1f","c2":"#ffbf1f","angle":135,"accent":"#e5231b"}', null, null, 'esporte')
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, bio = excluded.bio, theme = excluded.theme, edition = excluded.edition;

commit;
