# Segurança — os 20 pontos, um a um

Arquitetura: site estático no GitHub Pages + Supabase (Postgres, Storage) acessado direto do navegador com a chave pública, sob RLS. Não há servidor próprio; a lógica sensível (preços, validação, gravação) vive em funções `SECURITY DEFINER` no banco.

| # | Item | Situação | Onde |
|---|------|----------|------|
| 1 | Esconder API keys | Só a chave **publishable** vai ao navegador (feita para isso). A chave `service_role`/secret nunca sai do painel do Supabase e não está no repositório. | `dist/api.js` |
| 2 | Limpar secrets do git | Histórico varrido: nenhum segredo. Secret scanning + push protection ativos no GitHub. | repositório |
| 3 | Public key DB | Chave pública com privilégios mínimos: leitura de `products` e `store_settings`; execução das 3 funções. Nada mais é exposto. | `supabase/migrations/0001` |
| 4 | Ativar RLS | RLS em todas as tabelas. `orders`, `order_items` e `newsletter_subscribers` não têm política nenhuma para a API: só as funções gravam. Bucket `designs` privado, com política de upload restrita a pastas UUID e nomes fixos. | migração 0001 |
| 5 | Criptografia de dados | TLS em tudo (Pages força HTTPS; Supabase só HTTPS); dados em repouso criptografados pelo Supabase. Nenhum dado bancário é coletado. | plataforma |
| 6 | Auth server side | Supabase Auth: sessão por JWT validada no servidor; `place_order` lê `auth.uid()` e o e-mail da conta no banco (não confia no cliente); pedidos e perfil só do dono via RLS. Visitantes ainda compram; consulta sem login exige código + e-mail. | migração 0003 |
| 7 | Restringir acessos | Exposição automática de tabelas desligada no projeto; grants explícitos; `authenticated` e `rls_auto_enable()` sem execução. | migrações 0001/0002 |
| 8 | Bloquear mass assignment | `place_order` só lê campos conhecidos do JSON; preço, nome e status são definidos pelo servidor, nunca pelo cliente. Colunas com `check`. | `place_order` |
| 9 | Proteger cookies | Sem cookies: a sessão (JWT de 1 h + refresh token) fica em `localStorage`, protegida pela CSP estrita (`script-src 'self'`, nenhum script de terceiros). Logout invalida o refresh token no servidor. Sacola saneada ao carregar. | `dist/api.js` |
| 10 | Hash nas senhas | Senhas nunca passam pelo código do site: o Supabase Auth guarda com bcrypt. Mínimo de 8 caracteres com letras e números, exigido no servidor (Supabase Auth → Password requirements) e no cliente, confirmação de e-mail obrigatória, redefinição por link. | Auth |
| 11 | Rate limit | Login/cadastro/recuperação: limites nativos do Supabase Auth por IP e por e-mail (painel → Rate Limits). Pedidos: 10/hora por e-mail em `place_order`; limites de tamanho na sacola. Falta limite por IP nas funções públicas — exigiria Edge Function ou Cloudflare. | Auth, `place_order` |
| 12 | Bot protection | Parcial: honeypot na newsletter, validação estrita no servidor, sem envio de e-mail automático (nada a abusar). Sem CAPTCHA — recomendado Cloudflare Turnstile antes de integrar pagamento. | `index.html`, `app.js` |
| 13 | Queries parametrizadas | Nenhum SQL montado no cliente. PostgREST e funções PL/pgSQL com parâmetros tipados. | — |
| 14 | Validação dos inputs | Cliente: `required`, `pattern`, `maxlength`, limites de upload (tipo, 5 MB, 40 MP, reencode). Servidor: `check` em todas as colunas, validação de tamanhos/quantidades/e-mail/CEP, briefing ≥ 10 caracteres, JSON de design ≤ 4 KB. | migração 0001 |
| 15 | Vazar conteúdo | Pedidos e artes não são legíveis pela API pública (401/400). Erros do servidor mostrados ao usuário só quando são mensagens de validação (códigos 22023/53400); o resto vira mensagem genérica. | `dist/api.js` |
| 16 | Restringir uploads | Bucket privado, 5 MB, apenas `image/webp` e `image/jpeg`, nomes `uuid/preview.jpg` ou `uuid/art.webp`; imagens reencodadas no navegador antes de subir (remove metadados). Sem leitura pública. | migração 0001 |
| 17 | Trim respostas de API | `select` explícito de colunas no catálogo; funções devolvem só o necessário (`get_order` não devolve endereço). | `dist/api.js`, `get_order` |
| 18 | Security headers | CSP (scripts, estilos e fontes só do próprio site; conexões ao Supabase + APIs públicas de CEP/municípios (ViaCEP, IBGE)), referrer policy, `Permissions-Policy`, COOP/CORP, `nosniff`. No GitHub Pages os cabeçalhos HTTP não são configuráveis: a CSP vai via `<meta>` e `X-Frame-Options`/`frame-ancestors` não têm efeito — por isso `frame-guard.js` protege contra clickjacking (tira a página de um iframe de outra origem). O servidor local envia todos os cabeçalhos. | `index.html`, `frame-guard.js`, `server.mjs` |
| 19 | Forçar HTTPS | GitHub Pages com "Enforce HTTPS" e `upgrade-insecure-requests` na CSP. | Pages |
| 20 | Scan de dependências | `npm audit --audit-level=high` no CI antes de publicar; Dependabot semanal (npm e Actions); alertas e correções automáticas ativos. O site não tem dependência em runtime. | `.github/` |

## Checklist dos reels 2 e 3 (login)

- Rotas de API protegidas: tabelas de escrita sem acesso direto; leitura de pedidos/perfil exige JWT válido + RLS por `auth.uid()`.
- Senhas criptografadas: bcrypt pelo Supabase Auth; o site nunca vê nem armazena senha.
- Tentativas de login limitadas: rate limit do Auth (painel → Authentication → Rate Limits) + bloqueio de e-mails inválidos.
- RLS: todas as tabelas, políticas por dono.
- Dados do usuário criptografados: em repouso (AES-256 pelo Supabase) e em trânsito (TLS). Criptografia por coluna (Vault) fica como opção se houver dados sensíveis além de endereço.
- Chaves no cliente: só a publishable; verificação automática no CI impede `sk_`, `service_role` ou JWT em `dist/`.
- Google: exige OAuth Client no Google Cloud + Client ID/Secret no painel do Supabase (feito pelo dono da conta).

## Sondagem de segurança (2026-09-11)

Ataque autorizado ao próprio site com a chave pública. Resultado:

- **OK**: leitura de `orders`/`order_items`/`newsletter_subscribers`/`profiles` negada (401); escrita direta negada (401), inclusive com colunas válidas; `PATCH` de preço negado; `place_order` ignora preço enviado pelo cliente e recalcula no servidor; upload fora do padrão negado (403 RLS / 415 mime); download anônimo negado; `get_order` não devolve endereço/e-mail/nome e retorna `null` com e-mail errado; nenhum segredo no bundle publicado; introspecção REST não lista tabelas/funções ao anônimo; filtro com aspa/OR bloqueado (há WAF na frente); HTTPS forçado; HSTS presente; recover e login não revelam se a conta existe.
- **Corrigido — clickjacking**: o site podia ser embutido em iframe de terceiros (Pages não permite `X-Frame-Options`; `frame-ancestors` é ignorado em `<meta>`). Adicionado `frame-guard.js`.
- **Corrigido — senha fraca aceita**: o cadastro aceitava `12345678` (só dígitos). A regra "letras e números" existia no cliente, mas o Supabase não a exigia. Ativado em Authentication → Providers → Email → *Password requirements: Letters and digits* (mínimo já era 8). Reteste: agora `422 weak_password`.

Pendências desta sondagem: "Prevent use of leaked passwords" (HaveIBeenPwned) só no plano Pro; limite por IP nas funções públicas (edge/Cloudflare). Dados de teste criados na sondagem (1 pedido e 1 conta com e-mail `pentest…@mailinator.com`) a remover no painel.

## Pendências antes de vender de verdade

- Integrar pagamento (Pix/cartão) com webhook verificado que mude `orders.status` — hoje o pedido nasce como `aguardando_pagamento` e ninguém cobra nada.
- Notificação por e-mail (confirmação de pedido e mudança de status).
- CAPTCHA (Turnstile) e limite por IP se houver abuso.
- Painel de atendimento: hoje os pedidos e as artes são vistos no painel do Supabase (Table Editor e Storage → `designs`).

## Área /admin: acesso por usuário e senha (migração 0022)

- Endereço: `/admin`. Tela de login própria (usuário e senha), sem cadastro e sem Google. A sessão do /admin é separada da conta de cliente da loja (chave `duavesso.admin.session.v1`) e vale no máximo 12 horas.
- O usuário é uma conta do Supabase Auth com e-mail interno `<usuario>@admin.duavesso.invalid`. Esse endereço não recebe mensagens, então um cadastro feito por fora nunca fica confirmado, e `is_admin()` só aceita conta confirmada que esteja em `private.admin_emails`.
- Criar um usuário: no painel do Supabase, Authentication, Users, Add user, com o e-mail interno, a senha escolhida e Auto Confirm User ligado. O primeiro usuário (`admin`) já está na lista; os seguintes são adicionados na aba Acessos do painel, depois de criar a conta.
- A senha só passa pelo Supabase. Trocar: aba Acessos, "Trocar a minha senha". Esqueceu: apagar a conta no Supabase e criar de novo com o mesmo e-mail (o acesso volta, porque a lista é por e-mail).
- Acesso antigo: a conta da loja `duavesso.co@gmail.com` continua abrindo o painel em `/painel` até ser desligada na aba Acessos. O painel não deixa desligar o acesso que está em uso, então sempre sobra um que funciona.
- Depende de "Confirm email" continuar ligado no Supabase Auth (hoje está: `mailer_autoconfirm: false`).
