# Padrão Hub — referência para botões, formulários e abas (pedido do Diego, 16/11)

> Nota (tipografia, 2026-11-16): os tamanhos em px deste texto são os do Hub. No app vale a escala nomeada da seção
> "Tipografia" do `CLAUDE.md` (`text-titulo` … `text-mini`).


Decisão do Diego (16/11): manter as cores da consultoria (azul, opção C); do Hub vem só o padrão de layout (formato dos botões, estrutura dos formulários e abas). Onde este texto diz "índigo" ou "<destaque>", use o azul da consultoria (`--primary`).

Fonte: design system do Hub em `~/Documents/Karina/.claude/skills/hub-design/` (SKILL.md, references/botoes.md,
campos.md, janelas.md, menus.md, cores-e-texto.md; assets/janela-modelo.jsx, pagina-modelo.jsx) e
`~/Documents/Karina/src/index.css`. Screenshots em `~/Documents/Karina/.playwright-mcp/` (motivos-hub-form.png,
motivos-janela.png, okrs-abas.png, aba-plataforma.png, hub-dash.png, nov-hub-1440-light.png, nov-hub-1440-dark.png).

## Tokens
- Fonte Inter; um destaque só (no Hub: índigo `indigo-600` claro / `indigo-300/400` escuro).
- Raios: `rounded-lg` (8px) botão de ícone e item de menu; `rounded-xl` (12px) botão, campo e aba; `rounded-2xl`
  (16px) cartão e janela; `rounded-full` selo e avatar.
- Sombras por variável (`--shadow-card`, `--shadow-elevated`, `--shadow-overlay`, `--shadow-modal`); no escuro viram
  contorno de luz (`0 0 0 1px rgb(255 255 255/.05)`).
- Foco global: `:focus-visible{outline:2px solid <destaque>;outline-offset:2px}`.
- Tipografia: título de página 20px bold `tracking-[-0.015em]`; subtítulo `text-sm text-slate-500`; `.section-label`
  `text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400`; `.form-label` `block text-[12.5px]
  font-medium text-slate-700 mb-1.5`; corpo 13px; título de janela 15px bold; subtítulo de janela 12.5px.
- Ícones lucide: 14px em botão, 15px no principal com Plus, 16px no fechar.

## Botões (classes, um tamanho só ~36px)
Base: `inline-flex items-center justify-center gap-1.5 rounded-xl text-[13px] whitespace-nowrap transition-all duration-150`.
- `.btn-primary`: `px-3.5 py-2 font-semibold text-white bg-<destaque>-600 hover:bg-<destaque>-500 active:bg-<destaque>-700
  disabled:opacity-50`; sombra `inset 0 1px 0 rgba(255,255,255,.18), 0 4px 12px -4px rgba(<destaque>,.55)`; hover sobe
  1px e a sombra cresce; Plus gira 90° no hover.
- `.btn-secondary`: `px-3.5 py-2 font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200
  hover:border-slate-300` (escuro: `bg-white/[0.04] border-white/[0.1]`), sombra `0 1px 2px rgba(15,23,42,.05)`.
- `.btn-ghost`: `px-3 py-1.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800`.
- `.btn-danger`: como o primary em `rose-600`; só no botão final de confirmação, nunca no que abre a confirmação.
- Ícone sozinho: `w-8 h-8 rounded-lg` (celular `w-11 h-11`), `aria-label` + `title`, ícone 14px; excluir com hover rose.
- Carregando: `Loader2 animate-spin` no lugar do ícone e "Salvando…".
- Um principal por área; na barra de filtros fica no fim (`ml-auto`).

## Formulários = sempre janela (modal)
- Overlay `bg-black/50` (escuro `/60`); janela `rounded-2xl border border-black/[0.06] shadow-modal`, entra com
  `scaleIn .15s`; no celular sobe de baixo (bottom sheet), `max-height:95dvh`.
- Cabeçalho: quadrado de ícone `w-10 h-10 rounded-xl bg-<destaque>-50 text-<destaque>-600` + título 15px bold +
  subtítulo 12.5px ("o que acontece ao salvar") + botão fechar (ícone 16px); `px-6 py-4 border-b`.
- Corpo: `p-6 space-y-5`, seções com `.section-label` e `space-y-3`; campos com rótulo acima, em
  `grid sm:grid-cols-2 gap-3`; opcional coluna de apoio `md:grid-cols-[1fr_240px]` com prévia.
- Rodapé: `px-6 py-3.5 border-t`, alinhado à direita: Cancelar (`btn-secondary`) e o principal (`btn-primary`).
- Campo `.input`: `w-full px-3 py-2 text-[13.5px] bg-white border border-slate-200 rounded-xl hover:border-slate-300
  focus:ring-2 focus:ring-<destaque>-500/15 focus:border-<destaque>-400 disabled:bg-slate-50` (~38px); textarea igual.
- Sem asterisco de obrigatório; validação no salvar; erros por toast (no Hub). Ajuda `text-[11.5px] text-slate-500`.
- No Hub o nativo é proibido (`select`, `date`, `time`, `number`, `checkbox`): componentes próprios (PickerField,
  FilterCombobox, DatePicker, TimePicker, NumberField, Checkbox) — ver `references/campos.md`.
- Esc e X fecham; clique fora fecha só janela de leitura, não formulário.
- Larguras: `max-w-lg` curto, `max-w-2xl/3xl` com coluna de apoio.

## Abas = controle segmentado
Trilho `flex gap-0.5 bg-slate-200/60 p-1 rounded-xl overflow-x-auto` (escuro `bg-white/[0.05]`); botão
`px-3 py-1.5 text-[12.5px] font-medium rounded-lg`; ativo `bg-white text-<destaque>-700 shadow-[0_1px_3px_rgba(15,23,42,0.12)]`
(escuro `bg-slate-700 text-white`); inativo `text-slate-600 hover:text-slate-900`; contador em pílula
`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full` (índigo/destaque; âmbar quando é pendência). 2 a 5 visões.
Barra de filtros: `card px-4 py-3 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2` com abas, busca e principal no fim.

## Cartão
`.card`: `bg-white rounded-2xl border border-black/[0.05] shadow-card` (escuro `bg-[#13161f] border-white/[0.06]`).
