# Financeiro da duavesso e Vendas das marcas

Data: 08/10/2026. Desenho aprovado pelo dono em conversa ("segue"), a partir do esboço
`financeiro-e-vendas.html` (tela de esboços).

## Objetivo

1. **Painel da duavesso com cara de sistema** (estilo Shopify): menu lateral com as abas Início,
   Pedidos, Financeiro, Peças e custos, Marcas e Pedidos de marca.
2. **Financeiro da empresa**: entradas e saídas do período, com as vendas do site entrando sozinhas e
   lançamentos manuais (venda por fora, produção, frete, anúncios, repasses...), comparação com o
   período anterior, gráfico, "para onde foi o dinheiro", lista de lançamentos e exportação em planilha.
3. **Vendas em Minha Marca**: o dono vê vendas, peças, lucro, ticket médio, comparação com o período
   anterior, saldo a receber, peças que mais vendem, tamanhos e estados. Nunca dados de clientes.

## Regras de conta (decididas)

- **Lucro da marca** = preço de venda − preço base da duavesso, por peça. O preço base é definido pela
  duavesso em "Peças e custos". Descontos de cupom e promoção ficam por conta da duavesso (a marca
  recebe a diferença sobre o preço de tabela).
- **Só conta como venda pedido pago**: situações `pago`, `em_producao`, `enviado`, `entregue`.
  `cancelado` sai da conta; `aguardando_pagamento` aparece à parte ("aguardando pagamento").
- **Data da venda** = quando o pedido virou pago (`orders.paid_at`, gravado na primeira vez).
- **Custo e preço base congelados** no momento em que o pedido vira pago (mudar o preço depois não
  altera meses passados).
- **Financeiro é livro caixa**: Entradas = vendas pagas do site (valor pago pelo cliente) + entradas
  manuais; Saídas = saídas manuais (incluindo produção e repasses). Lucro líquido = Entradas − Saídas.
  À parte, informativo: **margem estimada das vendas** = vendas − custo das peças − parte das marcas
  (como o "lucro bruto" da Shopify), sem contar duas vezes com o caixa.
- **A repassar a cada marca** = lucro da marca nas vendas pagas − repasses lançados como saída na
  categoria "Repasse a marcas" com aquela marca.
- **Comparação**: sempre com o período anterior de mesmo tamanho.

## Dados (migração 0012)

Tudo o que é sensível fica no esquema `private` (a API do Supabase não expõe) e só sai por funções
`security definer` que conferem quem chama.

- `orders.paid_at timestamptz`: gravado por gatilho quando a situação entra em pago pela primeira vez.
- `private.product_finance (product_id pk → products, unit_cost_cents ≥ 0, brand_base_cents > 0 ou
  nulo, updated_at)`: custo por peça e preço base da marca.
- `private.sale_lines (order_item_id pk → order_items, order_id, product_id, brand_slug, qty,
  unit_price_cents, unit_cost_cents, brand_base_cents, brand_margin_cents)`: retrato de cada item no
  momento em que o pedido vira pago (gatilho). Margem da marca = max(0, preço − base) × qtd, só quando
  a peça é de uma marca e tem preço base.
- `private.finance_entries (id, occurred_on date, kind in/out, category, amount_cents > 0, method,
  description ≤ 200, brand_slug → brands on delete set null, created_at, created_by)`.
  Categorias de entrada: Venda por fora, Aporte, Outras entradas. Saída: Produção, Frete, Embalagem,
  Anúncios, Taxas e tarifas, Ferramentas, Impostos, Repasse a marcas, Outras saídas.
  Formas: Pix, Cartão, Dinheiro, Boleto, Transferência, Outro.

Funções (todas `security definer`, `search_path = ''`):

- Administradora (`private.require_admin()`): `admin_list_orders(status, busca, limite, início)`,
  `admin_set_order_status(código, situação)`, `admin_list_product_finance()`,
  `admin_set_product_finance(peça, custo, base)`, `admin_add_entry(...)`, `admin_delete_entry(id)`,
  `admin_finance_report(de, até)`.
- Dono da marca (`can_edit_brand` ou administradora): `brand_sales_report(marca, de, até)`, só com
  números agregados (sem nome, e-mail ou endereço).

## Telas

**Painel** (`/painel?aba=...`): menu lateral fixo no computador; no celular vira faixa de abas
rolável. Abas:
- **Início**: vendas pagas de hoje e dos 7 dias, pedidos para enviar, aguardando pagamento, pedidos de
  marca novos, atalhos.
- **Pedidos**: lista com filtro por situação e busca (código, nome, e-mail); abrir um pedido mostra
  itens, entrega e a linha do tempo; botões para mudar a situação.
- **Financeiro**: período (7, 30, 90 dias, 12 meses, datas), quatro números com comparação, gráfico
  de entradas, saídas e lucro, "para onde foi" e "de onde veio", a repassar por marca, lançamentos
  (site + manuais, apagar lançamento manual), "Novo lançamento" e "Exportar planilha" (CSV).
- **Peças e custos**: cada peça com preço, custo, preço base da marca e margem calculada; editar.
- **Marcas** e **Pedidos de marca**: o que já existe, dentro do layout novo.

**Minha Marca**: abas "Minha página" (editor de hoje) e "Vendas" (`/minha-marca?marca=x&aba=vendas`).

Gráficos em SVG feito à mão (a CSP não libera scripts de fora), com cores da duavesso.

## Entrega em etapas

1. Banco (0012) + testes do banco.
2. Painel novo: layout, Início, Pedidos, Peças e custos, Financeiro.
3. Vendas em Minha Marca.

Cada etapa: testes, conferência no navegador, publicação.
