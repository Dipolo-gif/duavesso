#!/usr/bin/env bash
# DUAVESSO: provas ao vivo de login/sessão/RLS pela API, para rodar QUANDO o projeto voltar.
# Quem roda: o dono, no próprio terminal (Git Bash). Usa duas contas DE TESTE (A e B), nunca contas reais.
# Nada aqui é enviado a terceiros; só fala com o Supabase do projeto.
#
#   export SB=https://bkyzkighkuswsssvicpy.supabase.co
#   export KEY=sb_publishable_9rzjsC4wmHSmBxlKZfIwJg_SlDprprm      # chave pública (já está no site)
#   export A_EMAIL=... A_PASS=... B_EMAIL=... B_PASS=...              # contas de teste
#   export SUPABASE_ACCESS_TOKEN=...   # só para o passo 0 (token pessoal do painel; não salvar em arquivo)
set -u
J='Content-Type: application/json'

echo "== 0. Configuração de Auth no painel (somente leitura, Management API) =="
curl -s "https://api.supabase.com/v1/projects/bkyzkighkuswsssvicpy/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" |
  jq 'to_entries | map(select(.key | test("jwt_exp|refresh_token|reuse|sessions_|captcha|rate_limit|password_|hibp|mailer_autoconfirm|smtp_host|site_url|uri_allow"))) | from_entries'
# Esperado para fechar o item 1: jwt_exp <= 3600, refresh_token_rotation_enabled = true,
#   security_refresh_token_reuse_interval = 10. sessions_timebox/inactivity só existem no plano Pro.
# Item 2: rate_limit_* preenchidos; security_captcha_enabled (hoje: false) e provider turnstile depois do ajuste no api.js.

login() { curl -s "$SB/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "$J" -d "{\"email\":\"$1\",\"password\":\"$2\"}"; }
refresh() { curl -s "$SB/auth/v1/token?grant_type=refresh_token" -H "apikey: $KEY" -H "$J" -d "{\"refresh_token\":\"$1\"}"; }

echo "== 1. Rotação: cada refresh devolve um refresh token NOVO; o avô reutilizado derruba a sessão =="
S=$(login "$A_EMAIL" "$A_PASS"); R1=$(jq -r .refresh_token <<<"$S")
R2=$(refresh "$R1" | jq -r .refresh_token); R3=$(refresh "$R2" | jq -r .refresh_token)
echo "R1=$R1 R2=$R2 R3=$R3 (esperado: três valores diferentes)"
sleep 12   # passa do intervalo de reuso (10 s)
echo "reuso de R1 (avô):"; refresh "$R1" | jq -c '{error_code, msg}'      # esperado: refresh_token_already_used
echo "R3 depois do reuso:"; refresh "$R3" | jq -c '{error_code, msg}'     # esperado: erro (sessão inteira revogada)

echo "== 2. Logout: refresh token morre na hora; o JWT antigo continua aceito pelo PostgREST até expirar =="
S=$(login "$A_EMAIL" "$A_PASS"); AT=$(jq -r .access_token <<<"$S"); RT=$(jq -r .refresh_token <<<"$S"); A_ID=$(jq -r .user.id <<<"$S")
curl -s -o /dev/null -w "logout HTTP %{http_code}\n" -X POST "$SB/auth/v1/logout" -H "apikey: $KEY" -H "Authorization: Bearer $AT"   # esperado 204
refresh "$RT" | jq -c '{error_code, msg}'                                                                                            # esperado: erro
curl -s "$SB/rest/v1/profiles?select=id&id=eq.$A_ID" -H "apikey: $KEY" -H "Authorization: Bearer $AT"; echo "  <- JWT pós-logout no PostgREST (esperado hoje: ainda funciona até exp)"
curl -s "$SB/auth/v1/user" -H "apikey: $KEY" -H "Authorization: Bearer $AT" | jq -c '{error_code, msg, id}'                        # esperado: session_not_found

echo "== 3. Troca de ID na URL (RLS) com o JWT real da A =="
SA=$(login "$A_EMAIL" "$A_PASS"); TA=$(jq -r .access_token <<<"$SA"); A_ID=$(jq -r .user.id <<<"$SA")
SBB=$(login "$B_EMAIL" "$B_PASS"); B_ID=$(jq -r .user.id <<<"$SBB")
H=(-H "apikey: $KEY" -H "Authorization: Bearer $TA")
echo "GET perfil da B:";            curl -s "$SB/rest/v1/profiles?select=id,name,cpf,phone&id=eq.$B_ID" "${H[@]}"; echo "   (esperado: [])"
echo "PATCH perfil da B:";          curl -s -X PATCH "$SB/rest/v1/profiles?id=eq.$B_ID" "${H[@]}" -H "$J" -H "Prefer: return=representation" -d '{"name":"x"}'; echo "   (esperado: [])"
echo "GET pedidos que não são da A:"; curl -s "$SB/rest/v1/orders?select=code,user_id&user_id=neq.$A_ID" "${H[@]}"; echo "   (esperado: [])"
echo "GET itens (todos):";          curl -s "$SB/rest/v1/order_items?select=order_id" "${H[@]}"; echo "   (esperado: só itens dos pedidos da A)"
echo "GET newsletter:";             curl -s -w " HTTP %{http_code}" "$SB/rest/v1/newsletter_subscribers?select=email&limit=1" "${H[@]}"; echo "   (esperado: 401/403 42501)"
echo "PATCH status do próprio pedido:"; curl -s -w " HTTP %{http_code}" -X PATCH "$SB/rest/v1/orders?user_id=eq.$A_ID" "${H[@]}" -H "$J" -d '{"status":"pago"}'; echo "   (esperado: 401/403 42501)"
echo "GET listar artes:";           curl -s -X POST "$SB/storage/v1/object/list/designs" "${H[@]}" -H "$J" -d '{"prefix":"","limit":5}'; echo "   (esperado: [])"

echo "== 4. Limite de tentativas de login (CUIDADO: bloqueia o seu IP por alguns minutos) =="
for i in $(seq 1 40); do
  code=$(curl -s -o /tmp/r.json -w "%{http_code}" "$SB/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "$J" -d "{\"email\":\"$A_EMAIL\",\"password\":\"errada-$i\"}")
  echo "$i -> $code $(jq -r '.error_code // empty' /tmp/r.json)"; [ "$code" = 429 ] && break
done
# Esperado: 400 invalid_credentials e, a partir de ~30 tentativas em 5 min, 429 over_request_rate_limit.
