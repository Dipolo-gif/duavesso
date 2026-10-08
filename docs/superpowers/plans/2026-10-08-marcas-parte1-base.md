# Plataforma de marcas · Parte 1 (Base) · passo a passo

Desenho: `docs/superpowers/specs/2026-10-08-plataforma-marcas-design.md`. Cada tarefa termina com testes passando e um commit.

1. **Banco (migração 0009):** `private.admin_emails` com `duavesso.co@gmail.com`; `public.is_admin()` (e-mail na lista e confirmado); `public.brands` (conteúdo, tema em jsonb validado, status, plano) e `public.brand_members`; leitura pública só de marcas ativas; dono edita só colunas de conteúdo da própria marca (admin edita qualquer uma); RPCs `my_brands`, `admin_list_brands`, `admin_create_brand`, `admin_set_brand_status`, `admin_set_brand_plan`; bucket público `brand-assets` com escrita só na pasta da própria marca; seed das 3 marcas atuais. Testes em `tests/db.test.mjs`.
2. **Tema e seletor de cor:** `dist/brand-theme.js` (contraste, texto automático, correção do destaque e do degradê, CSS da marca) e `dist/color-picker.js` (roda de matiz, quadrado de tom, HSL/RGB, HEX/RGB, conta-gotas, cores rápidas e usadas). Testes de unidade e de interface.
3. **API:** `fetchBrands`, `fetchBrand`, `myBrands`, `updateBrand`, `uploadBrandAsset`, `isAdmin` e as funções do painel em `dist/api.js`.
4. **Loja da marca:** `/marcas` e `/marcas/<slug>` lidas do banco, layout B com topo na cor da marca, destaque grande com selo e contagem regressiva, peças e faixa da duavesso; sem banco, cai nos dados de `dist/brands.js`. Testes.
5. **Minha Marca:** aba em "Minha conta" para donos (e para a admin, em qualquer marca), com identidade (nome, frase, bio, logo, capa, links), cores (seletor), destaque, prévia ao vivo e "Publicar alterações". Testes.
6. **Painel `/painel`:** só admin; criar marca parceira por e-mail, suspender e reativar, plano e pagamento, editar a página de qualquer marca. Testes.
7. **Endereços e Google:** rewrite da Vercel para `/marcas/<slug>` sem página pré-gerada; `npm run pages` lê as marcas ativas do banco quando houver conexão; rotina diária no GitHub Actions que regenera e publica. Validador atualizado.
8. **No ar:** aplicar a 0009 pelo conector do Supabase, conferir ao vivo, publicar.
