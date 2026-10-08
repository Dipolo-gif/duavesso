# Plataforma de marcas parceiras · desenho

Data: 08/10/2026 · Situação: aguardando a revisão do dono da loja

## Objetivo

Cada marca parceira tem uma loja própria dentro da duavesso (`/marcas/<nome>`), quase como um site separado, mas dependente da duavesso: a duavesso imprime, vende, cobra e entrega tudo (print on demand). O dono da marca entra com a mesma conta de cliente e edita a loja dele numa aba "Minha Marca". A conta dona do site controla tudo num painel.

## Decisões tomadas

| Tema | Decisão |
|------|---------|
| Endereço | Caminho no site: `/marcas/<nome>` |
| Conta do dono da marca | A mesma conta de cliente, com permissão de marca parceira |
| Conta dona do site | `duavesso.co@gmail.com` (vira administradora ao criar a conta e confirmar o e-mail) |
| Entrada de marcas | Convite pelo painel **e** formulário público "Quero minha marca na duavesso", com aprovação |
| Publicação das edições | Direto, dentro dos limites do plano; a dona pode suspender qualquer marca |
| Layout da loja | Perfil (B) com: topo na cor da marca, destaque grande de lançamento, contagem regressiva (só com data de fim) e faixa Novidades (só com 3 ou mais peças aprovadas nos últimos 30 dias). Sem compra rápida e sem faixa-manifesto |
| Cores | Livres: sólido ou degradê (2 cores + ângulo), destaque livre, roda de cores com quadrado de tom, abas HSL e RGB, campos HEX e RGB, conta-gotas, cores rápidas, cores usadas e sugestões tiradas do logo. Texto preto ou branco automático; destaque e degradê corrigidos quando ficam ilegíveis, com aviso |
| Sacola e checkout | Da duavesso (sacola única, um frete, um pagamento), com toque das marcas: etiqueta na cor de cada marca e "Você veio da loja X" |
| Preço das peças | A duavesso define um preço mínimo por modelo de camiseta; o dono pode aumentar à vontade |
| Peça nova | O dono envia a arte; fica "Em análise" até a duavesso aprovar; aprovada, entra na loja dele |
| Plano pago | R$ 400, pagamento único, para a equipe criar uma página exclusiva. Enquanto não houver cobrança online, a dona recebe por fora e marca no painel |

## O que é fixo em todas as marcas (DNA duavesso)

Barra do topo com o logo da duavesso, fontes, botões de tamanho, ficha do produto, sacola, checkout, faixa de garantias e o selo "produzido e entregue pela duavesso". O dono não altera nada disso no plano grátis.

## Papéis e permissões

- **Dona do site (admin):** e-mails listados em `private.admin_emails` (começa com `duavesso.co@gmail.com`). A função `public.is_admin()` responde verdadeiro só para a pessoa logada cujo e-mail está na lista **e** já foi confirmado (`auth.users.email_confirmed_at`). Nada disso fica no navegador.
- **Dono de marca:** linha em `public.brand_members` (marca, usuário, papel `owner`). Uma conta pode ter mais de uma marca.
- **Cliente:** como hoje.
- Toda escrita passa por RLS ou por funções `security definer` que conferem `is_admin()` ou a posse da marca. A chave pública continua sem acesso a dados privados.

## Modelo de dados (novas migrações)

- `public.brands`: `slug` (chave, `^[a-z0-9-]{2,40}$`), `name`, `tagline`, `bio` (até 160), `status` (`active`, `suspended`), `plan` (`free`, `paid`), `paid_at`, `paid_note`, `theme` (jsonb: `mode` sólido ou degradê, `c1`, `c2`, `angle`, `accent`), `logo_path`, `cover_path`, `links` (jsonb: instagram, site), `featured_product_id`, `featured_badge`, `featured_until`, `external_url` (para marcas que também vendem no próprio site), datas. Leitura pública só de marcas `active`; escrita do dono só nos campos de conteúdo (nome, frase, bio, cores, imagens, links, destaque), nunca em `status` ou `plan`.
- `public.brand_members`: marca, usuário, papel. Só a dona escreve.
- `public.brand_applications`: pedidos do formulário (nome da marca, e-mail, mensagem, situação). Inserção pela função `apply_for_brand()` com limite por IP; leitura só da dona.
- `public.bases`: modelos de camiseta que as marcas podem usar (ex.: Oversized Simples, Heavy), com cores disponíveis e `min_price_cents` (o preço mínimo).
- `public.products` ganha: `brand_slug`, `base_id`, `review_status` (`draft`, `in_review`, `approved`, `rejected`), `review_note`, `art_path`, `created_by`. Produtos de marca só ficam visíveis ao público quando `approved` e com a marca `active`. Preço nunca abaixo do `min_price_cents` da base (regra no banco).
- `public.order_items` ganha `brand_slug` e `brand_margin_cents` (preço vendido menos o mínimo da base), gravados pelo `place_order`, para o relatório de repasse.
- Storage: bucket público `brand-assets` (logos, capas, fotos das peças aprovadas) com escrita só na pasta da própria marca; bucket privado `brand-art` para a arte original enviada para análise.

## Telas

1. **Painel da duavesso** (`/painel`, só admin): marcas parceiras (criar por e-mail, nome e endereço; ver loja; mudar plano e marcar o pagamento de R$ 400; suspender e reativar), peças em análise (ver arte, aprovar ou recusar com motivo), pedidos de marca do formulário, relatório de repasse por marca e período, além das promoções e cupons que já existem.
2. **Minha Marca** (aba em "Minha conta", só para donos de marca): identidade (nome, frase, bio, logo, faixa de capa, links), cores (seletor descrito acima), destaque (peça, selo, data de fim), peças (lista com situação, ordem, "Enviar nova estampa": arte, base, cores e preço com o mínimo visível e o quanto o dono ganha por venda). Prévia ao vivo no celular ao lado (embaixo, no celular). Botão "Publicar alterações" e "Ver minha loja".
3. **Loja da marca** (`/marcas/<nome>`): lida do banco na hora. Marca suspensa ou inexistente cai na loja com aviso.
4. **Formulário "Quero minha marca"**: na página `/marcas`.
5. **Sacola e checkout**: como já estão no ar, com a linha "Você veio da loja X" quando a pessoa chegou por uma marca.

Os esboços aprovados estão em `.superpowers/brainstorm/` (fora do git): `layout-marca-v2`, `cores-marca`, `checkout`, `minha-marca-v3`.

## Endereços e Google

- `/marcas/<nome>` de qualquer marca nova funciona na hora: a Vercel serve a página genérica de marcas e o app carrega a marca do banco, ajustando título e descrição.
- Uma rotina diária no GitHub Actions lê as marcas ativas pela chave pública, regenera as páginas pré-geradas (título, descrição, prévia de link e dados estruturados) e o sitemap, e publica se algo mudou.

## Repasse para as marcas

Cada item vendido guarda `brand_margin_cents`. O painel mostra, por marca e por período, peças vendidas e valor a repassar, e permite marcar o repasse como feito. O pagamento ao dono da marca é feito por fora (Pix) até existir integração.

## As 3 marcas de hoje

`geek`, `try84` e `solfado` viram linhas em `brands` com o conteúdo atual (`dist/brands.js`) e continuam no ar sem interrupção. A geek fica com a conta da duavesso. A TRY84 e a SolFáDó ficam sem dono até a dona ligar a conta certa no painel. Os produtos externos da TRY84 e da SolFáDó (links para o site delas) continuam como vitrine externa até virarem peças duavesso.

## Erros e limites

- Uploads: só PNG, JPG ou WebP; logo até 2 MB, capa até 3 MB, arte até 10 MB; reencode no navegador antes de enviar (remove metadados).
- Textos com tamanho máximo no banco e no formulário.
- Limites por IP no formulário de marca (5 por dia) e no envio de arte (20 por dia por marca).
- Mensagens de erro em português; erro inesperado mostra o código para o suporte (já existe).

## Testes

- `tests/db.test.mjs`: permissões (admin só com e-mail confirmado, dono só edita a própria marca e nunca `status` ou `plan`, cliente não lê nada privado), preço mínimo, aprovação de peças, margem gravada no pedido, marca suspensa some do público.
- `tests/ui.test.mjs`: painel aparece só para admin, aba Minha Marca só para dono, prévia acompanha a edição, seletor de cor (HEX, RGB, HSL, cores rápidas), loja da marca lida do banco, aviso para marca inexistente.
- Validador: páginas das marcas atualizadas e no sitemap.

## Entrega em 3 partes (cada uma publicada e testada)

1. **Base:** papéis e permissões, `brands` e `brand_members`, migração das 3 marcas, painel (marcas parceiras), aba Minha Marca (identidade, cores, destaque), loja da marca lida do banco, rotina diária do Google.
2. **Peças:** `bases`, envio de arte e análise, preço mínimo, venda no checkout com margem, relatório de repasse.
3. **Entrada e plano:** formulário público com aprovação no painel, marcação do plano pago (R$ 400) e da página exclusiva.

## Fora do escopo agora

Cobrança online (depende da escolha do provedor de pagamento), domínio próprio por marca, editor livre de layout do plano pago (a equipe faz à mão), repasse automático.
