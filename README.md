# DUAVESSO — loja de camisetas

Loja em português com catálogo, filtro, busca, ordenação, tamanhos, sacola, checkout, histórico de pedidos e estúdio de estampas (criar na hora ou descrever a ideia). Site estático publicado na Vercel; catálogo, pedidos, artes e newsletter no Supabase.

- Site: https://loja-duavesso.vercel.app/
- Publicação: a Vercel publica `dist/` a cada push na `main`. O workflow de CI roda `npm audit`, `npm test` e `npm run validate` em todo push e em todo pull request.

## Executar

Node.js 22 ou mais recente. `npm start` abre o servidor local em http://127.0.0.1:5174 (com cabeçalhos de segurança). O site de produção é estático; não precisa de dependências de execução.

`npm test` executa verificações de compra e interação com DOM emulado (inclui o modo online com `fetch` simulado) e aplica todas as migrações num Postgres local (PGlite) para conferir que o catálogo do banco é o mesmo do site e que cada peça e cada cor podem ser pedidas. `npm run validate` verifica referências, sintaxe e estrutura estática. `npm run images` regenera as imagens de `dist/assets/` a partir dos originais em `assets-src/`.

## Backend (Supabase)

Projeto `duavesso` (região São Paulo). O navegador usa a chave pública de `dist/api.js`; o que ela pode fazer é definido pelas migrações em `supabase/migrations/`:

- `products`, `product_variants` e `store_settings`: leitura pública (catálogo, cores de cada peça, frete, preços do estúdio). O catálogo do banco precisa ser igual ao de `dist/commerce.js`: ao mudar uma peça no site, crie uma migração que atualize o banco (o teste `tests/db.test.mjs` falha se os dois divergirem).
- `orders` e `order_items`: sem acesso direto; gravados só por `place_order()`, que recalcula preços e frete no servidor, valida tudo e limita 10 pedidos/hora por e-mail. Status inicial `aguardando_pagamento`.
- `newsletter_subscribers`: só por `subscribe_newsletter()`.
- `get_order(código, e-mail)`: consulta de status sem login.
- Contas (Supabase Auth): e-mail + senha com confirmação obrigatória, senha mínima de 8 caracteres com letras e números, redefinição por e-mail, e botão “Continuar com Google” (PKCE) — ativo assim que o provedor for configurado no painel. `profiles` guarda nome e endereço de entrega (RLS: só o dono). Pedidos feitos logado recebem `user_id`; o cliente vê os próprios pedidos em “Minha conta” via RLS. Compra como visitante continua possível.
- `profiles` também guarda telefone, CPF, país/estado, foto (avatar em data URL, ≤80 KB) — colunas opcionais, RLS por dono; a cidade usa a API do IBGE e o CEP usa o ViaCEP (liberados na CSP).
- Storage `designs` (privado): prévia e arte de cada item do estúdio, em `uuid/preview.jpg` e `uuid/art.webp`.

Pedidos e artes são vistos no painel do Supabase (Table Editor → `orders`/`order_items`; Storage → `designs`). Para aplicar as migrações em um projeto novo, execute os arquivos de `supabase/migrations/` em ordem no SQL Editor e faça o seed dos produtos.

Se a API estiver fora do ar ou a chave não estiver configurada, o site cai no modo demonstrativo (catálogo embutido, pedido só local).

## Arquivos

- `dist/index.html`: estrutura, conteúdo e CSP.
- `dist/styles.css`: identidade, responsividade, animações e redução de movimento.
- `dist/app.js`: interações, editor canvas, checkout, histórico e consulta de pedidos.
- `dist/commerce.js`: catálogo embutido (fallback), preços em centavos, totais, saneamento da sacola.
- `dist/api.js`: acesso ao Supabase (catálogo, funções, upload de artes) e cliente de autenticação (sessão, login, cadastro, Google/PKCE, redefinição de senha) sem biblioteca externa.
- `dist/fonts/`: Barlow Condensed (4 pesos) e Manrope (variável), subconjunto latino, hospedadas no próprio site — sem chamadas ao Google Fonts.
- `dist/assets/`: versões WebP responsivas (com JPEG de fallback) das três fotografias, geradas por `scripts/optimize-images.mjs`.
- `assets-src/`: originais em PNG, fora do site publicado.
- `supabase/migrations/`: esquema, RLS, funções e políticas do Storage.
- `docs/seguranca.md`: os 20 pontos de segurança, item a item, e o que ainda falta.

## Escopo atual

Pré-lançamento: os pedidos são registrados de verdade, mas **não há cobrança** — o pagamento (Pix/cartão com webhook) ainda não está integrado, e não há e-mail automático. Preços, medidas, especificações de tecido e políticas de troca/entrega são texto de exemplo; substitua pelos dados reais antes de vender.

O editor oferece bases branca/preta, tamanho P–GG, texto, três fontes, cores prontas ou livre, upload PNG/JPG/WebP de até 5 MB, escala, posição vertical e horizontal, rotação, até 4 estampas por peça (cada uma em qualquer zona: frente, costas, mangas ou lateral) e exportação PNG. O modo “Descrever a ideia” troca texto/imagem por um briefing de até 400 caracteres (estampa sob medida, R$ 149,90). A prévia é ilustrativa; não é arquivo técnico de impressão nem prova de cor.

WebMCP opcional: leitura de catálogo/sacola e adição de produto usam as mesmas ações da interface. O navegador precisa suportar `document.modelContext`; suporte não obrigatório para utilizar a loja.

## SEO e presença

`dist/robots.txt`, `dist/sitemap.xml` e `dist/llms.txt` (resumo da loja para assistentes de IA) são publicados junto com o site. O `index.html` traz canonical, Open Graph/Twitter Card e JSON-LD (`OnlineStore`, `WebSite` e a coleção como `ItemList` de `Product`). `npm run validate` confere que esses arquivos existem, que as URLs apontam para arquivos reais e que **nenhum segredo** (`sk_…`, `service_role`, JWT, `sb_secret_`, chave privada) está em `dist/` — a publicação falha se encontrar. Para o Google indexar mais rápido, cadastre o site no Search Console e envie o sitemap.

## Animações (Motion)

`dist/motion-ui.js` usa a biblioteca [Motion](https://motion.dev) (`animate`, `inView`, `stagger`) para revelar blocos ao rolar: faixa de confiança, coleção, teaser e estúdio, "sobre", pilares e rodapé. A biblioteca é servida pelo próprio site em `dist/vendor/motion.js` (só as três funções, ~23 KB gzip) por causa da CSP `script-src 'self'`; `npm run vendor` regenera o arquivo a partir do pacote npm. Com `prefers-reduced-motion` ou sem JS nada é escondido; blocos pulados pelo usuário (tecla End, rolagem rápida) aparecem sem animação.

## Prévia 3D (Three.js)

No estúdio, o botão **Ver em 3D** troca a prévia 2D por uma camiseta em três dimensões (`dist/studio-3d.js`, modelo `dist/assets/tee.glb` adaptado do exemplo t-shirt-configurator da Poimandres, MIT — ver `docs/studio-3d.md`). Cada estampa é um *projetor*: a arte desenhada pelo `app.js` (`window.duavessoStudio.drawPrint`) é projetada no tecido a partir de um ponto e uma normal da superfície, então pode ficar na frente, nas costas, nas mangas ou na lateral — arraste a estampa direto na peça, use os botões de zona ou os sliders (frente). A cor da peça é livre (paleta ou seletor), a roda do mouse sobre a estampa muda o tamanho, e a sacola recebe uma prévia composta (frente + costas/mangas quando há estampa fora da frente). A biblioteca (`dist/vendor/three.js`, só as classes usadas) e o modelo carregam **apenas ao clicar** no botão; sem WebGL a prévia 2D segue como está. `npm run vendor` regenera os dois bundles (Motion e Three).
