#!/usr/bin/env bash
# PROPOSTA de firewall para o projeto duavesso (Vercel, plano Hobby: maximo 3 regras personalizadas, 1 delas de rate limit).
# NAO EXECUTAR sem autorizacao do dono. Tudo entra como rascunho e so vale depois do "publish".
# Ordem importa: a regra de liberacao (bypass) tem que ficar em 1o lugar.
# Recomendado: criar as regras 2 e 3 primeiro com --action log, observar 24 h, depois trocar para challenge.
set -e
S="--project duavesso --scope marileuseldinho-3713s-projects"

# Regra 1: buscadores e ferramentas verificadas passam direto (Google e Bing, decisao do dono).
# bot_name existe no esquema oficial da API (enum de conditionGroup.type); se a CLI recusar, criar igual pelo painel.
vercel firewall rules add --json '{
  "name": "Liberar buscadores verificados",
  "description": "Google e Bing verificados (IP + DNS reverso) nao recebem desafio",
  "active": true,
  "conditionGroup": [{ "conditions": [{ "type": "bot_name", "op": "inc",
    "value": ["googlebot","googleother","google-inspectiontool","google-site-verifier","google-storebot","chrome-lighthouse","bingbot","adidxbot"] }] }],
  "action": { "mitigate": { "action": "bypass" } }
}' $S --yes

# Regra 2: desafio unico (sessao de 1 h por navegador) para quem esta fora do Brasil OU vem de rede de datacenter/VPN.
# Grupos de condicao sao combinados com OU. Sem --duration (acao persistente e so Pro e viraria bloqueio repetido).
vercel firewall rules add --json '{
  "name": "Desafio fora do BR e VPN",
  "description": "Fora do Brasil ou ASN de datacenter/VPN: desafio do navegador",
  "active": true,
  "conditionGroup": [
    { "conditions": [{ "type": "geo_country", "op": "neq", "value": "BR" }] },
    { "conditions": [{ "type": "geo_as_number", "op": "inc",
      "value": ["9009","60068","212238","16276","24940","14061","20473","63949","16509","14618","396982","31898","51167"] }] }
  ],
  "action": { "mitigate": { "action": "challenge" } }
}' $S --yes

# Regra 3: limite de requisicoes (Hobby: 1 regra, janela fixa 10 s a 10 min, chaves IP e JA4).
vercel firewall rules add "Limite por IP" \
  --condition '{"type":"path","op":"pre","value":"/"}' \
  --action rate_limit --rate-limit-window 60 --rate-limit-requests 600 \
  --rate-limit-keys ip --rate-limit-keys ja4 --rate-limit-action challenge $S --yes

# Gerenciado (nao conta nas 3): Bot Protection em desafio; ja exclui bots verificados.
vercel firewall rules edit bot-protection --action challenge $S --yes

vercel firewall diff $S
# vercel firewall publish $S --yes      # <- so com o OK do dono

# Em ataque: vercel firewall attack-mode enable --duration 1h $S --yes   (gratis em todos os planos)
