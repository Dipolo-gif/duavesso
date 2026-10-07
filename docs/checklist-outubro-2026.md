# Checklist da loja duavesso: outubro de 2026

Revisão dos 24 pontos da sua lista, feita em 07/10/2026 por cinco auditorias em modo somente leitura (login e dados, borda e firewall, banco e desempenho, SEO e presença no Google, operações). Este documento junta tudo num lugar só. Ele parte do `docs/seguranca.md` (os 20 pontos de setembro), que continua valendo como base, mas está desatualizado num ponto importante: o site hoje é servido pela **Vercel**, não pelo GitHub Pages.

**Três coisas que você precisa saber primeiro:**

1. **O Supabase voltou a responder hoje, às 20:20 UTC (17:20 em Brasília).** Durante quase toda a auditoria ele estava pausado, então a maior parte do banco foi testada numa cópia local que roda as mesmas migrações. Quando ele voltou, conferi ao vivo tudo o que dá para conferir só com a chave pública do site (sem login e sem gravar nada).
2. **Achado mais grave (item 7): o banco não conhece os produtos que o site vende.** A tabela de produtos do Supabase tem só os 4 produtos antigos (Off Line, Sol a Sol, Essencial Preta e Essencial Branca). Os 6 produtos do site não existem lá. Como o Supabase está no ar de novo, **toda compra de peça do catálogo é recusada com a mensagem "Produto indisponível"**. Isso vem antes de qualquer outra coisa.
3. Nada do projeto foi alterado na auditoria. A única escrita foi este arquivo. Os arquivos de apoio (scripts, rascunhos, resultados de teste) estão em `docs/auditoria-2026-10/`.

**Legenda:** ✅ já existe (com prova) · 🟡 parcial · ❌ falta ou tem problema · 👤 depende de você

**Placar:** 3 ✅ · 14 🟡 · 6 ❌ · 1 👤

## Os 24 itens

| # | Item | Situação | O que foi verificado | O que fazer | Quem |
|---|------|----------|----------------------|-------------|------|
| 1 | Troca automática dos tokens de login | 🟡 Parcial | O site renova o acesso sozinho quando falta menos de 1 minuto para vencer (`dist/api.js:32-37`), e o Supabase troca o token de renovação a cada uso (uso único). Porém, no plano grátis a sessão não tem prazo final (doc do Supabase: limite de tempo e de inatividade só no plano Pro). E o botão Sair pode falhar em silêncio se o acesso já venceu (`api.js:80-84` usa o token antigo e engole o erro), deixando a sessão viva no servidor. A configuração real do painel não foi lida (precisa do seu acesso). | Claude: corrigir o Sair (renovar antes e repetir se falhar), sincronizar a sessão entre abas, fazer uma renovação por vez e criar um prazo máximo de 30 dias de sessão. Você: rodar o passo 0 do `auth-ao-vivo.sh` (só leitura) para confirmar a rotação ligada. | Os dois |
| 2 | Bloqueio por excesso de tentativas de login | 🟡 Parcial | Existe só o limite nativo do Supabase, por IP (doc: 150 pedidos de token a cada 5 min e 30 logins ou cadastros a cada 5 min). Não há CAPTCHA: nenhuma menção a Turnstile ou captcha em `dist/`. Atenção: ligar o CAPTCHA só no painel **quebraria o login**, porque o site não envia o token (`api.js:72`, `77` e `86`) e a CSP bloquearia o widget (`vercel.json:13` e `index.html:5`). | Claude: colocar o Turnstile nos formulários de entrar, cadastrar e recuperar senha, enviar o token e liberar o domínio da Cloudflare nas duas CSPs. Você: criar o widget na Cloudflare e, só depois do deploy, ligar no Supabase. Configurar um SMTP próprio (sem ele, o Supabase manda só 2 e-mails por hora). | Os dois |
| 3 | Cada pessoa só vê os próprios dados | 🟡 Parcial | **Ao vivo hoje, sem login:** `profiles`, `orders`, `order_items` e `newsletter_subscribers` respondem HTTP 401 "permission denied"; a lista de artes do bucket vem vazia. **Na cópia local com as migrações reais:** um usuário logado que troca o ID na requisição não vê nem altera dados de outro (17 testes; as regras usam `auth.uid()`, `0003_accounts.sql:14-16` e `40-42`). Falhas: (a) qualquer pessoa logada descobre se um CPF já tem conta na loja (erro 23505, mensagem em `api.js:62`); (b) a função `handle_new_user` continua executável pela chave pública (inofensiva hoje); (c) não existe permissão para donos de marca. O teste com usuário logado no banco real ainda não foi feito. | Você: colar `rls-ao-vivo.sql` no SQL Editor (ele desfaz tudo no final) e rodar o Security Advisor. Claude: migração que fecha a função, acaba com a descoberta de CPF e cria marcas e membros de marca antes das lojas `/marcas/<slug>`. | Os dois |
| 4 | Ferramenta contínua de vulnerabilidades, com aviso de queda e relatório | 🟡 Parcial | Ligados no GitHub: Dependabot, alertas, secret scanning e push protection (conferido com `gh api`). Mas o CI falhou nas 3 execuções de hoje por 2 falhas altas (`sharp` e `source-map-js`, confirmadas com `npm audit`), a Vercel publicou mesmo assim, não existe monitor de queda, o CodeQL está desligado (`not-configured`) e o PR #8 do Dependabot está parado desde 02/10. | Claude: monitor a cada 30 min que abre um aviso no GitHub (você recebe e-mail) quando a loja ou o Supabase caem, relatório semanal e CI que testa os PRs. Você: autorizar o merge do PR #8 (ou o `npm audit fix`), ligar CodeQL e relato privado, e cadastrar um monitor externo gratuito (ex.: UptimeRobot). | Os dois |
| 5 | O JSON trafega sem compressão? | ✅ Já existe | Não trafega. Site na Vercel com Brotli: `app.js` cai de 86.858 para 29.829 bytes. JSON do Supabase, medido ao vivo hoje: `Content-Encoding: gzip`, de 1.014 para 485 bytes. Único ponto de atenção: a foto de perfil vai dentro do JSON do perfil (até 80 KB, `0004_profile_fields.sql:12-13`). | Nada obrigatório. Opcional: guardar a foto de perfil no Storage. | Claude |
| 6 | O app grava uma linha de cada vez sem necessidade? | 🟡 Parcial | No banco, o pedido grava os itens um a um (`0003_accounts.sql:108-144`) e depois atualiza os totais (`151-153`), mas tudo numa única chamada e transação, com no máximo 30 itens: cerca de 15 ms na cópia local, não é gargalo. O que custa tempo é no navegador: as artes do estúdio sobem uma de cada vez antes do pedido (`app.js:178-186`). | Claude: subir as artes em paralelo e mandar a cor escolhida em cada item. Opcional: pedido gravado em lote (proposta 0006). | Claude |
| 7 | Gargalo escondido | ❌ Problema grave | **Confirmado ao vivo hoje:** o banco tem só `off-line`, `sol-sol`, `essencial-preta` e `essencial-branca`; o site vende `heavy-avesso`, `heavy-faces`, `heavy-eclipse`, `simples`, `geek-coracao` e `geek-carpa` (`commerce.js:5-10`). O pedido procura o produto no banco e recusa com "Produto indisponível" (`0003_accounts.sql:116-118`). Pior: o banco nem aceita cadastrar os novos, porque só permite as cores branca e preta e as categorias graphic e essential (`0001_avesso_init.sql:24`, `26` e `71`). Outros achados: artes ficam esquecidas no Storage quando o pedido falha (`app.js:181-187`); cada card baixa 3 fotos e mostra 1 (cerca de 184 KB a mais); o logo PNG pesa 92 KB; falta um índice em `order_items.product_id`. | Claude (prioridade 1): migração que aceita marrom e "simples", cria as variantes de cor, cadastra os 6 produtos e desativa os antigos, mais um teste que compara site e banco. Depois: limpar órfãos, carregar fotos sob demanda, logo leve e índice. Você: aplicar a migração no SQL Editor. | Os dois |
| 8 | Todo clique fica esperando o servidor? | ✅ Já existe | Não. A home não faz nenhuma chamada ao Supabase (19 recursos, todos do próprio site). Filtro, busca, produto, sacola, frete e estúdio funcionam no navegador. Só esperam o servidor as ações que precisam dele (pedido, login, Minha conta, consulta de pedido, newsletter), com aviso de carregamento. | Opcional: resposta imediata na newsletter e no perfil; parar de apagar o perfil em memória a cada renovação de token (`app.js:444`). | Claude |
| 9 | O site reconstrói a página a cada visitante? | ✅ Já existe | Não. O site é estático (`vercel.json`: `buildCommand` "echo skip-build") e sai do cache de São Paulo: `X-Vercel-Cache: HIT` (conferido de novo hoje). | Opcional: cache longo para as fontes, que nunca mudam de nome. | Claude |
| 10 | Modelagem de dados (quantos clientes são do RJ?) | 🟡 Parcial | A resposta sai incompleta. A UF só existe no perfil (`0004_profile_fields.sql:10-11`) e só é preenchida quando o cliente edita Minha conta; o checkout não pede UF e a tabela de pedidos não tem essa coluna (`0001_avesso_init.sql:58-60`). Cidade é texto livre e o CEP aceita com e sem hífen. A cor escolhida se perde no pedido (`app.js:179` não manda a cor). As marcas existem só no código (`app.js:396-400`). | Claude: proposta 0006 (UF no pedido, variantes de cor, marcas, catálogo no banco) e UF no checkout preenchida pelo CEP; depois separar número, complemento e bairro. Você: aplicar. Consulta pronta no apêndice. | Os dois |
| 11 | As requisições têm limite? | 🟡 Parcial | Supabase: login com limite nativo por IP; pedidos com 10 por hora por e-mail (`0003_accounts.sql:91-94`), que se contorna trocando o e-mail e ainda pode ser usado para bloquear um cliente de verdade. Newsletter e envio de artes sem limite nenhum (na cópia local, 300 inscrições e 50 envios seguidos foram aceitos). Vercel: nenhuma regra (`vercel firewall rules list` respondeu "No custom rules configured", conferido hoje). Como o navegador fala direto com o Supabase, uma regra na Vercel não protege login nem pedidos. | Claude: limite por IP dentro do banco (função "pre-request" da documentação do Supabase), limite por usuário ou IP no pedido, limite na newsletter. Você: aplicar a migração e aprovar a regra de limite da Vercel (600 por minuto por IP). | Os dois |
| 12 | Rastreamento de cada passo (ex.: pagamento falhou) | ❌ Falta | Não há trilha: nenhuma tabela de eventos, de pagamento ou de webhook nas migrações, e a tabela de pedidos guarda só o status atual (`0001_avesso_init.sql:49-50`). O site troca o erro técnico por uma mensagem genérica e descarta o código (`api.js:59-64`). O pagamento ainda não existe. Logs do Supabase grátis: só 1 dia. | Claude, antes de integrar pagamento: linha do tempo do pedido, registro de tentativas de pagamento (separando cartão recusado, erro nosso e provedor fora do ar) e registro de webhooks (proposta 0006, parte 4), mais um código de erro mostrado ao cliente para passar ao suporte. Você: aplicar e decidir sobre o Supabase Pro (7 dias de log). | Os dois |
| 13 | Proteção contra DDoS | 🟡 Parcial | A Vercel mitiga DDoS automaticamente em todos os planos (documentação oficial). Mas o firewall nunca foi configurado; o plano é Hobby, que pela documentação é só para uso não comercial e não tem controle de gastos; uma cópia velha da loja continua no ar no GitHub Pages (HTTP 200 hoje), fora dessa proteção; e o Supabase é chamado direto. | Você: desligar o GitHub Pages e passar para o Vercel Pro antes de vender. Claude: deixar pronto o Bot Protection em modo desafio e o procedimento do Attack Mode para dias de ataque. | Os dois |
| 14 | Barreira para IP e VPN suspeitos (desafio) | ❌ Falta | Nenhuma regra: acessos de robô (python-requests, navegador falso) recebem 200. A Vercel não tem lista pronta de VPN; a cobertura possível é por rede de datacenter (ASN) e pelo Bot Protection. | Regras prontas em `firewall-proposta.sh`: desafio uma vez só (vale 1 hora, sem desafio infinito, como você decidiu) para redes de datacenter e VPN, começando 24 h em modo "só registrar". Precisa do seu OK para publicar. | Os dois |
| 15 | Limitar acessos de fora do Brasil | ❌ Falta | Nenhuma regra por país. O plano Hobby permite 3 regras. Uma regra de país sem exceção barraria Google, Bing e PageSpeed, que acessam dos EUA. | Regra 1: liberar Googlebot, Bingbot e as ferramentas do Google; regra 2: desafio para quem está fora do Brasil (junto com as redes de VPN). Nessa ordem. Precisa do seu OK. Não cobre o Supabase. | Os dois |
| 16 | Site no Google Search Console | 🟡 Parcial | O site tem 2 metas de verificação (`index.html:16-17`), mas dos endereços antigos (GitHub Pages e doavesso.vercel.app); nenhuma para loja-duavesso.vercel.app, que é o endereço oficial (canonical em `index.html:10`). O sitemap tem 1 endereço só, de 11/09. Não tenho acesso à sua conta Google para ver se a propriedade existe. | Você: decidir o domínio definitivo, criar a propriedade e me passar o código da meta. Claude: adicionar a meta e refazer o sitemap. | Os dois |
| 17 | Perfil da Empresa no Google (Meu Negócio) | 👤 Depende de você | O site não tem endereço, telefone nem horário (os dados estruturados dizem só "loja online", e "Fale com a gente" ainda é demonstrativo, `app.js:104`). Regra do Google: o perfil é para empresa com local que o cliente visita ou que atende o cliente onde ele está. Loja só online não é elegível. | Só crie se houver ateliê, showroom ou ponto de retirada. Se não houver, Claude completa os dados da marca no site (redes sociais, contato) e, mais tarde, avaliamos o Google Merchant Center. | Você |
| 18 | Google Analytics | ❌ Falta | Nenhum código do Google no site (`gtag` e `googletagmanager` não aparecem). O banner de cookies já guarda a escolha (`app.js:116-125`), mas nada usa essa escolha. A CSP atual bloquearia o Analytics. A política de privacidade diz que não há ferramenta de análise. | Você: criar a propriedade GA4 e me passar o ID (G-...). Claude: carregar o Analytics só depois do "Aceitar", ajustar as duas CSPs, atualizar a política de privacidade e criar um teste automático. | Os dois |
| 19 | Bing Webmaster Tools | ❌ Falta | Sem meta `msvalidate.01` e `BingSiteAuth.xml` dá 404 (conferido hoje). O robots.txt libera o Bing. | Você: depois do Search Console, importar o site no Bing (ele entra já verificado). Claude só entra se você preferir o caminho manual. | Você |
| 20 | Teste de velocidade do site | 🟡 Parcial | Lighthouse (o mesmo motor do PageSpeed), celular: nota 99, LCP 2,0 s, 747 KiB; computador: 99. A API oficial do PageSpeed respondeu 429 (cota esgotada) e só a home foi medida, porque produtos e marcas não têm endereço próprio. | Claude: logo em SVG ou WebP (maior ganho), tirar o `frame-guard.js` (redundante na Vercel) e carregar o `motion.js` só quando precisar. Você (opcional): criar uma chave gratuita do PageSpeed para o teste oficial. | Claude |
| 21 | Título de cada página | 🟡 Parcial | Só existem 3 títulos (`app.js:424`); produtos e cada marca ficam com o título genérico. Todas as "páginas" são `#` dentro da mesma URL, e o Google trata isso como uma página só (documentação oficial). `/marcas/geek` dá 404 (conferido hoje). | Claude: endereços reais (`/marcas/geek`, `/produto/simples` e assim por diante), com páginas pré-geradas, título, descrição e canonical próprios. | Claude |
| 22 | Backup e rollback | 🟡 Parcial | Código: tudo no git (54 commits), push forçado bloqueado, a Vercel guarda os deploys por 30 dias; no Hobby o rollback rápido só volta para a versão anterior. Banco: no plano grátis o Supabase não faz backup para você, não existe rotina de backup e o repositório é público (um dump nunca pode ir para ele). Nenhuma tag de versão (`git tag` vazio). | Claude: workflow de backup diário criptografado (rascunho pronto) e roteiro de rollback. Você: cadastrar 2 segredos no GitHub e testar a restauração. | Os dois |
| 23 | Proteger o projeto (repositório, contas, segredos) | 🟡 Parcial | Nenhum segredo no histórico (varredura dos 54 commits), só a chave pública no site, `.gitignore` cobre `.env`. Lacunas: o CI não segura o deploy; a proteção da branch não exige testes; o GitHub Pages velho continua no ar; 2FA não é verificável daqui; ações do GitHub sem restrição. | Você: 2FA no GitHub, Vercel, Supabase e Google; desligar o Pages; apagar os dados de teste do pentest. Claude: trocar o `pages.yml` por um CI só de testes e fazer o deploy esperar o CI. | Os dois |
| 24 | Links internos entre as páginas | 🟡 Parcial | Todos os links apontam para `#` da mesma página; os produtos das marcas são botões sem link (`app.js:404`); o rodapé tem botões que abrem janelas sem URL. Não há "veja também" nem trilha de navegação. | Claude, junto com o item 21: links reais, rodapé com marcas e políticas, "veja também", trilha de navegação, página 404 e um teste que exige link para cada página do sitemap. | Claude |

## Plano em fases

### Fase 0: urgente (agora que o Supabase voltou)

| O quê | Itens | Quem | Depende de |
|-------|-------|------|------------|
| Alinhar catálogo do site e banco (aceitar marrom e "simples", variantes de cor, cadastrar os 6 produtos, desativar os antigos) e criar o teste que compara os dois | 7, 10 | Claude escreve, você aplica no SQL Editor | Sua autorização para mexer no código e acesso ao SQL Editor |
| Primeiro backup do banco, antes de qualquer migração | 22 | Você (com o roteiro abaixo) | Supabase no ar (já está) |
| Destravar o CI (atualizar `sharp` e `source-map-js` pelo PR #8 ou `npm audit fix`) | 4, 23 | Claude, com seu OK | Nada |
| Desligar a cópia velha no GitHub Pages | 13, 23 | Você | Nada |

### Fase 1: o Claude faz assim que você autorizar (não depende do Supabase nem das suas contas)

- Login no site: Sair confiável, sessão sincronizada entre abas, uma renovação por vez, prazo máximo de sessão (item 1).
- Envio das artes em paralelo e cor escolhida chegando ao pedido (itens 6 e 10, parte do site).
- Velocidade: logo leve, fotos dos cards sob demanda, tirar `frame-guard.js`, `motion.js` sob demanda, cache longo das fontes (itens 7, 9 e 20).
- Endereços reais, títulos, páginas pré-geradas, links internos, sitemap e página 404 (itens 21 e 24).
- Código de erro visível para o cliente passar ao suporte (item 12, parte do site).
- Monitor de queda, relatório semanal e CI só de testes que também testa os PRs (itens 4 e 23).
- Rascunho do workflow de backup no repositório (item 22).
- Código do Turnstile pronto nos formulários, sem ligar no painel (item 2).

### Fase 2: com o Supabase no ar (já está), migrações e provas ao vivo

- Migrações que o Claude escreve e você aplica: limite por IP (item 11), linha do tempo do pedido e registro de pagamento (item 12), correções de permissão e da descoberta de CPF, marcas e membros de marca (item 3), UF no pedido (item 10), índice que falta (item 7).
- Provas que você roda no painel: `rls-ao-vivo.sql`, `inventario-ao-vivo.sql`, `auth-ao-vivo.sh`, contagem de artes órfãs, Advisors de segurança e de desempenho (itens 1, 2, 3, 7 e 11).
- Revisar Authentication > Rate Limits e configurar SMTP próprio (item 2).

### Fase 3: firewall da Vercel (precisa do seu OK para publicar)

- Ordem obrigatória: regra 1 libera Google e Bing; regra 2 desafia fora do Brasil e redes de VPN; regra 3 limita 600 acessos por minuto por IP; Bot Protection em desafio (itens 11, 13, 14 e 15).
- Tudo começa 24 h em modo "só registrar"; depois vira desafio único (resolve uma vez e entra).
- Lembrete: isso protege só o site da Vercel. Login e pedidos no Supabase dependem da Fase 2.

### Fase 4: só você pode fazer

Search Console, Analytics, Bing, decisão sobre o Perfil da Empresa, 2FA nas contas, widget do Turnstile, segredos do backup, domínio definitivo, plano Vercel Pro antes de vender, SMTP próprio e apagar os dados de teste do pentest. O passo a passo está logo abaixo.

## Passo a passo das suas tarefas

Regra de ouro: **códigos públicos** (ID do Analytics, código de verificação do Google ou do Bing, sitekey do Turnstile) você pode me passar no chat. **Segredos** (senha do banco, secret key do Turnstile, frase do backup, códigos de recuperação) nunca vão para o chat nem para o repositório: você cola direto no painel onde eles serão usados.

### 1. Supabase: confirmar que voltou e evitar nova pausa

1. Entre em supabase.com/dashboard e abra o projeto `bkyzkighkuswsssvicpy`. Confirme que ele aparece como ativo (sem aviso de "Paused").
2. Se um dia ele pausar de novo: abra o projeto e clique em **Restore project**. Pela documentação, projeto grátis pausa depois de 7 dias com pouca atividade e pode ser restaurado em até 1 ano.
3. Para não pausar: o monitor do item 4 faz uma consulta a cada 30 minutos, o que já conta como atividade. A outra saída é o plano Pro, que não pausa.
4. Faça o primeiro backup (passo 2 abaixo) antes de aplicar qualquer migração.

### 2. Segredos do backup do banco

1. Supabase > botão **Connect** > aba do **Session pooler** > copie a string de conexão (ela contém a senha do banco).
2. Invente uma frase longa para criptografar o backup e guarde no seu gerenciador de senhas (sem ela o backup não abre).
3. GitHub > repositório `Dipolo-gif/duavesso` > **Settings > Secrets and variables > Actions > New repository secret**. Crie `SUPABASE_DB_URL` (a string do passo 1) e `BACKUP_PASSPHRASE` (a frase do passo 2).
4. Melhor ainda: o Claude te passa um comando SQL para criar um usuário só de leitura (`backup_ro`), e a string de conexão usa esse usuário em vez do dono do banco.
5. Depois que o Claude subir o workflow, rode-o uma vez, baixe o arquivo e teste a restauração num banco de teste. Repita o teste uma vez por mês.

### 3. Turnstile (verificação contra robôs no login)

1. Entre em dash.cloudflare.com (conta grátis) > **Turnstile > Add widget**.
2. Nome: duavesso. Hostnames: `loja-duavesso.vercel.app` (e o domínio próprio, quando houver). Modo: **Managed** (combina com "verificação única").
3. Copie a **Sitekey** e me passe (é pública). A **Secret Key** fica com você.
4. Espere o Claude publicar o site com o Turnstile nos formulários. **Só depois** vá em Supabase > **Project Settings > Authentication > Bot and Abuse Protection > Enable CAPTCHA protection**, escolha Turnstile, cole a Secret Key e salve. Se fizer na ordem inversa, o login para de funcionar.
5. Teste: entrar, criar conta e recuperar senha.

### 4. Verificação em duas etapas (2FA)

Ligue em todas as contas que mexem na loja, de preferência com app autenticador ou passkey (evite SMS), e guarde os códigos de recuperação no gerenciador de senhas. O nome exato do menu pode variar.

- GitHub: Settings > Password and authentication > Two-factor authentication.
- Vercel: Account Settings > Authentication.
- Supabase: Account preferences > Security (Multi-factor authentication).
- Google: myaccount.google.com > Segurança > Verificação em duas etapas.

### 5. Google Search Console

1. Antes de tudo, decida o domínio definitivo. O `duavesso.com.br` está registrado no Registro.br, mas não aponta para lugar nenhum. Se ele for seu, aponte para a Vercel agora e use a propriedade de **Domínio** (verificação por DNS); trocar de domínio depois faz perder o histórico.
2. Se ficar com o endereço da Vercel: search.google.com/search-console > **Adicionar propriedade > Prefixo do URL** > `https://loja-duavesso.vercel.app/` > método **Tag HTML** > copie só o valor de `content` e me passe.
3. Depois que o Claude publicar a tag, clique em **Verificar**.
4. Menu **Sitemaps** > envie `sitemap.xml`.
5. **Inspeção de URL** > cole `https://loja-duavesso.vercel.app/` > **Solicitar indexação**.
6. **Configurações > Usuários e permissões** > adicione uma segunda conta sua como proprietária (reserva).
7. Mais tarde, quando os redirecionamentos estiverem prontos, apague as propriedades antigas (GitHub Pages e doavesso.vercel.app).

### 6. Google Analytics

1. analytics.google.com > **Administrador > Criar conta** "duavesso" > propriedade com fuso America/Sao_Paulo e moeda BRL.
2. **Fluxo de dados > Web** > URL `loja-duavesso.vercel.app` > copie o ID que começa com `G-` e me passe (é público).
3. Na propriedade: retenção de dados em 14 meses; Google Signals e personalização de anúncios **desligados**; Medição otimizada ligada, com "mudanças de página com base em eventos do histórico do navegador".
4. **Administrador > Links de produtos** > vincule ao Search Console.
5. Aceite os termos de processamento de dados (só o dono da conta pode).
6. O Claude faz o resto: o Analytics só liga depois que o visitante clica em "Aceitar" no aviso de cookies.

### 7. Bing Webmaster Tools

1. Faça primeiro o Search Console (passo 5).
2. bing.com/webmasters > entrar > **Importar do Google Search Console** > autorizar > marque `loja-duavesso.vercel.app` > **Importar**. O site entra já verificado e com o sitemap.
3. Se preferir o caminho manual: **Adicionar site > Meta tag** > me passe o valor de `content` da `msvalidate.01`.
4. Importante: o desafio para fora do Brasil (Fase 3) só pode ser publicado com a regra que libera o Bingbot, senão o Bing não consegue ler o site.

### 8. Perfil da Empresa no Google

1. Pergunta que decide: existe um lugar físico onde o cliente pode ir (ateliê, showroom, ponto de retirada) ou você atende presencialmente numa região?
2. **Se não existe:** não crie. Perfil com endereço que o cliente não pode visitar corre risco de suspensão. O Claude completa os dados da marca no site, e mais tarde avaliamos o Google Merchant Center (vitrine gratuita no Shopping), que exige páginas reais de produto, políticas de troca e entrega e contato real.
3. **Se existe:** business.google.com > **Adicionar empresa** > nome "duavesso" > categoria "Loja de roupas" > endereço (ou área de atendimento com endereço oculto) > telefone e site `https://loja-duavesso.vercel.app/` > verificação pelo método que o Google oferecer (vídeo, telefone ou carta) > horários, fotos e produtos.

### 9. Outras decisões suas

- **GitHub Pages:** GitHub > repositório > **Settings > Pages** > despublicar. Conferência: `https://dipolo-gif.github.io/duavesso/` deve dar 404.
- **Vercel Pro antes de vender:** pela documentação, o Hobby é só para uso não comercial. O Pro traz controle de gastos, mais regras de firewall e rollback para qualquer versão.
- **SMTP próprio no Supabase** (no painel, em Authentication, na parte de configurações de SMTP; o nome do menu pode variar): sem ele, só 2 e-mails por hora no projeto inteiro, o que trava cadastros no lançamento.
- **Dados de teste do pentest de setembro:** apagar a conta e o pedido com e-mail `pentest...@mailinator.com` (pendência antiga do `docs/seguranca.md`).
- **Firewall da Vercel:** dar o OK para publicar as regras da Fase 3.

## O que mudou desde o docs/seguranca.md

- Hospedagem: o site agora é servido pela Vercel, que envia de verdade os cabeçalhos de segurança (CSP, X-Frame-Options DENY, HSTS de 1 ano, COOP, CORP, nosniff; conferido hoje com `curl -I`). O `frame-guard.js` ficou redundante.
- Ponto 20 ("npm audit no CI antes de publicar"): não barra mais nada, porque a Vercel publica a cada push sem esperar o CI, e o CI está vermelho.
- Ponto 9 ("Logout invalida o refresh token no servidor"): vale só quando o acesso ainda não venceu (ver item 1).
- O documento ainda fala em GitHub Pages nos pontos 5, 18 e 19 e precisa ser atualizado depois que o Pages for desligado.
- Continuam pendentes: CAPTCHA, limite por IP nas funções públicas e a limpeza dos dados de teste do pentest.

## Apêndice: provas e comandos prontos

**Rodado hoje ao vivo (só leitura, chave pública do site):**

```text
GET /auth/v1/health        -> {"version":"v2.197.0","name":"GoTrue",...}
GET /rest/v1/products      -> off-line, sol-sol, essencial-preta, essencial-branca (só os 4 antigos)
GET /rest/v1/profiles      -> HTTP 401, 42501 permission denied (o mesmo para orders, order_items, newsletter_subscribers)
JSON do Supabase           -> Content-Encoding: gzip, 1014 bytes sem compressão, 485 com
vercel firewall rules list -> No custom rules configured.
node --test tests/*.test.mjs -> 30 aprovados, 0 falhas; node scripts/validate.mjs -> OK
```

Observação sobre os testes: eles passam porque usam um servidor simulado que aceita qualquer produto (`tests/ui.test.mjs:84-114`), por isso não pegaram o problema do catálogo.

**Arquivos de apoio** (em `docs/auditoria-2026-10/`):

- `login-dados-rls/rls-ao-vivo.sql`: teste de "cada um só vê o seu" no SQL Editor; desfaz tudo no final.
- `login-dados-rls/inventario-ao-vivo.sql`: confere se o banco real bate com as migrações (12 blocos).
- `login-dados-rls/auth-ao-vivo.sh`: configuração do login, rotação de token, logout e limite de tentativas (usa o seu token pessoal do Supabase; rode você).
- `banco/0006_proposta_banco_desempenho.sql`: proposta de migração (catálogo, variantes, UF, marcas, rastreamento), testada numa cópia local, **não aplicada**.
- `firewall-proposta.sh`: comandos exatos das regras da Vercel (o publish está comentado).
- `operacoes/monitor.yml`, `operacoes/seguranca-semanal.yml`, `operacoes/backup-supabase.yml`: rascunhos dos workflows.
- `borda-checks.sh`: repete as medições de compressão, cache e cabeçalhos.

**Consultas para o SQL Editor do Supabase:**

Migrações aplicadas (comparar com 0001 a 0005):

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Clientes por UF (item 10):

```sql
select coalesce(state, '(sem UF)') as uf, count(*) from public.profiles group by 1 order by 2 desc;
select count(*) from public.profiles
 where cep <> '' and replace(cep, '-', '')::int between 20000000 and 28999999;
```

Artes órfãs no Storage (item 7):

```sql
select count(*) as orfaos,
       pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) as tamanho
  from storage.objects o
 where o.bucket_id = 'designs'
   and not exists (select 1 from public.order_items i
                    where i.preview_path = o.name or i.image_path = o.name
                       or coalesce(i.design->'image_paths', '[]'::jsonb) ? o.name);
```

Pedidos sem itens (item 7):

```sql
select count(*) from public.orders o
 where not exists (select 1 from public.order_items i where i.order_id = o.id);
```

Consultas mais caras (item 7):

```sql
select calls, mean_exec_time::numeric(10,2) as media_ms, total_exec_time::numeric(10,2) as total_ms, query
  from pg_stat_statements order by total_exec_time desc limit 20;
```

**Conferências rápidas pelo terminal:**

```bash
# Cópia velha no GitHub Pages: depois de desligar, deve responder 404
curl -sS -o /dev/null -w '%{http_code}\n' https://dipolo-gif.github.io/duavesso/
# PageSpeed oficial (com uma chave sua do Google Cloud)
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Floja-duavesso.vercel.app%2F&strategy=mobile&category=performance&key=$PSI_KEY"
```

## Observações

- O arquivo `.gitignore` do projeto tem uma alteração ainda não commitada (acrescenta `.superpowers/`), salva às 17:18 de hoje. Ela não foi feita por esta auditoria; confira se é sua.
- O site diz "algodão pesado 210 g/m²" na descrição, nos dados estruturados e na faixa de garantias (`index.html:9`), enquanto o catálogo diz "Suedine premium 250 g/m²" (`commerce.js:3`). O `dist/llms.txt` (linha 8) ainda lista produtos e preços antigos (Off Line, Sol a Sol, Essencial Preta e Branca). Vale alinhar para não dar informação errada ao cliente.
- O endereço `doavesso.vercel.app` mostra o mesmo site com HTTP 200 em vez de redirecionar para `loja-duavesso.vercel.app`; vale um redirecionamento permanente.
