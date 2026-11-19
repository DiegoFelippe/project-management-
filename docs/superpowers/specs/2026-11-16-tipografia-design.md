# Fonte e tamanhos padrão — design

Data: 2026-11-16. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).

## Pedido do Diego

- "Eu percebi que tem alguns lugares que a fonte parece estar diferente. Defina a fonte padrão, e o tipo de letra e
  tamanho também." (16/11)

## O que está diferente hoje (levantamento)

- A fonte é a do sistema (`ui-sans-serif, system-ui…` em `src/index.css`: San Francisco no Mac, Segoe no Windows) —
  muda de aparelho para aparelho.
- Títulos de janela usam a fonte **condensada** (`[font-stretch:88%]` no `DialogTitle`); só a `JanelaFormulario` e o
  `ConfirmarAcao` voltam para 100%. É o "parece outra fonte" mais visível.
- Tamanhos: além da escala do Tailwind (`text-xs` 40×, `text-sm` 75×, `text-base`, `lg`, `xl`, `2xl`, `3xl`), há 10
  tamanhos avulsos (`text-[9px]` a `text-[15px]`: 12,5, 12, 10, 13, 11, 15, 13,5, 10,5, 9, 14 px) e textos de gráfico
  em SVG com `fontSize` 10, 11 e 12.

## Decisões (minhas — o Diego delegou)

- **Fonte única: Inter**, a mesma do Hub (o padrão Hub já é a referência de layout). Servida pelo próprio app
  (`@fontsource-variable/inter`, versão fixa), sem chamar o Google: funciona offline no PWA e não expõe quem usa.
  Reserva: a fonte do sistema. Números que se comparam em coluna usam algarismos de largura fixa (`tabular-nums`).
- **Sem fonte condensada** em lugar nenhum (`font-stretch` sai).
- **Escala única, com nomes** (baseada no Hub; nada fora dela):

| Nome (classe) | Tamanho / altura da linha | Peso | Uso |
|---|---|---|---|
| `text-titulo` | 20 px / 28 | 700, `tracking-[-0.015em]` | título da página (h1) |
| `text-destaque` | 26 px / 32 | 700, `tabular-nums` | número grande dos indicadores |
| `text-janela` | 15 px / 20 | 700 | título de janela, título de bloco grande |
| `text-subtitulo` | 14 px / 20 | 600 | título de cartão/bloco (h2), subtítulo da página (400) |
| `text-corpo` | 13,5 px / 20 | 400 (600 nos botões) | texto, tabelas, botões, campos (16 px no celular) |
| `text-rotulo` | 12,5 px / 18 | 500 | rótulo de campo, texto de apoio, abas, legendas de tabela |
| `text-legenda` | 11 px / 16 | 400–500 | dicas, textos de gráfico, datas pequenas |
| `text-mini` | 10,5 px / 14 | 600, maiúsculas quando é `section-label` | rótulo de seção, contadores, nomes do trilho |

- Os campos continuam com 16 px no celular (iPhone não dá zoom), como já é hoje.
- Gráficos em SVG usam os mesmos tamanhos, de `src/lib/tipografia.js` (o SVG não lê classes do Tailwind), e o texto
  nunca fica abaixo de 11 px na tela.
- **Regra no `CLAUDE.md`** e um teste de varredura: nada de `text-[Npx]`, `text-xs/sm/base/lg/xl/2xl/3xl`,
  `font-stretch` ou `font-family` fora de `src/index.css`; `fontSize` de SVG só pelas constantes.

## Fora desta entrega

Trocar cores, pesos de marca ou o logo; fonte para a tela de login animada além do que a regra exige.
