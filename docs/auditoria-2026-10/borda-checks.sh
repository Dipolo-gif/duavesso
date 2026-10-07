#!/usr/bin/env bash
# Auditoria de borda (Vercel) da loja DUAVESSO. SOMENTE LEITURA: nada aqui altera configuracao.
# Uso: bash borda-checks.sh            (checagens da Vercel)
#      KEY=<chave publishable de dist/api.js linha 3> bash borda-checks.sh supabase   (quando o Supabase voltar)
B=https://loja-duavesso.vercel.app
SB=https://bkyzkighkuswsssvicpy.supabase.co

echo "== 5) Compressao (bytes baixados por encoding)"
for p in / /app.js /api.js /commerce.js /styles.css /vendor/three.js; do
  id=$(curl -sS -o /dev/null -w '%{size_download}' -H 'Accept-Encoding: identity' "$B$p")
  gz=$(curl -sS -o /dev/null -w '%{size_download}' -H 'Accept-Encoding: gzip' "$B$p")
  br=$(curl -sS -o /dev/null -w '%{size_download}' -H 'Accept-Encoding: br' "$B$p")
  echo "$p identity=$id gzip=$gz br=$br"
done

echo "== 9) Cache de borda (2a chamada deve ser HIT com Age > 0)"
for i in 1 2; do curl -sS -o /dev/null -D - "$B/" | grep -iE '^(age|x-vercel-cache|cache-control)'; echo --; done

echo "== Cabecalhos de seguranca"
curl -sS -o /dev/null -D - "$B/" | grep -iE '^(content-security-policy|x-frame-options|strict-transport|x-content-type|referrer-policy|permissions-policy|cross-origin)'

echo "== 11/13/14/15) Firewall: estado atual (leitura)"
echo "vercel firewall rules list --project duavesso --scope marileuseldinho-3713s-projects"
echo "vercel firewall ip-blocks list --project duavesso --scope marileuseldinho-3713s-projects"
echo "vercel firewall traffic list --project duavesso --scope marileuseldinho-3713s-projects --dimension country --dimension bot --dimension rule"

echo "== Espelho antigo no GitHub Pages (deve sumir: 404)"
curl -sS -o /dev/null -w '%{http_code}\n' https://dipolo-gif.github.io/duavesso/

if [ "$1" = "supabase" ]; then
  echo "== 5) JSON do Supabase: comprimido?"
  for e in identity 'br, gzip'; do
    curl -sS -o /dev/null -D - -w 'bytes=%{size_download}\n' -H "Accept-Encoding: $e" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
      "$SB/rest/v1/products?select=id,name,category,color,base,price_cents,tag,description&active=eq.true&order=sort_order" \
      | grep -iE '^(HTTP|content-encoding|content-type|bytes=)'
  done
fi
