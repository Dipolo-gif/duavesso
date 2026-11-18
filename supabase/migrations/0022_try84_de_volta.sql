-- 0022 · TRY84 de volta ao marketplace, na Edição Esporte, com site exclusivo em /try84.
-- As peças da TRY84 são pedidas direto com a marca pelo WhatsApp (não passam pelo checkout da duavesso).
-- Pode ser aplicada de novo sem efeito colateral.

begin;

insert into public.brands (slug, name, tagline, bio, theme, cover_path, external_url, edition, status) values
  ('try84', 'TRY84', 'rugby lifestyle · forward together',
   'Feita por jogadores. Rugby lifestyle em preto e branco, do treino ao terceiro tempo.',
   '{"mode":"solid","c1":"#1c1d1f","c2":"#1c1d1f","angle":135,"accent":"#ffffff"}', 'assets/try84-bola.jpg', null, 'esporte', 'active')
on conflict (slug) do update set
  status = 'active', edition = 'esporte', external_url = null, cover_path = excluded.cover_path, tagline = excluded.tagline, bio = excluded.bio;

commit;
