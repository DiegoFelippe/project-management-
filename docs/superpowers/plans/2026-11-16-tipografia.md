# Fonte e tamanhos padrão — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** uma fonte (Inter) e uma escala de tamanhos com nomes em todo o app, sem fonte condensada e sem tamanhos
avulsos.

**Arquitetura:** `@fontsource-variable/inter` importada em `src/main.jsx`; `--font-sans` com Inter primeiro; a escala
como tokens `--text-*` no `@theme` de `src/index.css` (Tailwind 4 gera `text-titulo`, `text-corpo`…); constantes para
SVG em `src/lib/tipografia.js`; base (Button, Input, Label, Dialog, JanelaFormulario, `.section-label`, `.form-label`)
primeiro, depois todas as telas; teste de varredura e regra no `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-11-16-tipografia-design.md`.

## Restrições globais

- A tabela de escala do design é exata (nomes, tamanhos, alturas de linha, pesos).
- Cores, layout e comportamento não mudam; só fonte, tamanho, peso e altura de linha.
- Campos com 16 px no celular: a regra vai para o CSS (`.input` e uma classe `.texto-de-campo` em `src/index.css`,
  16 px abaixo de `sm` e `text-corpo` acima), não para classes avulsas; o guarda `tamanhoNoCelular.test.jsx` passa a
  exigir essa classe nos campos internos e nos `<textarea>`.
- `@fontsource-variable/inter` com versão exata (`npm install --save-exact`), única dependência nova.
- Node 26; vitest sempre com `--project unidade`; sem banco; nunca `git stash`, trocar de branch, push.

## Review Focus

- Texto que ficava em `text-[9px]`/`text-[10px]` (trilho, contadores) continua legível (≥ 10,5 px).
- Títulos de janela que usavam a condensada não quebram linha de forma estranha com a fonte normal.
- Números em colunas (horas, %) alinhados (`tabular-nums`).
- Gráficos em SVG: texto ≥ 11 px na tela em 390 px.

---

### Task 1: Fonte, escala e componentes de base

**Arquivos:** `package.json` (+ `@fontsource-variable/inter` exata), `src/main.jsx`, `src/index.css` (`--font-sans`,
tokens `--text-*` com `--text-*--line-height`, `.section-label`, `.form-label`, `.input`), `src/lib/tipografia.js`
(+ teste), `src/components/ui/{button,input,label,dialog}.jsx`, `src/components/comum/{JanelaFormulario,
ConfirmarAcao,Cabecalho,Tabela,AbasSegmentadas,BarraDeFiltros,NavegacaoDoMes}.jsx` (+ testes ajustados).
- [ ] **Passo 1:** testes (a classe `text-corpo` existe e o Button usa; `DialogTitle` sem `font-stretch`;
  `tipografia.js` exporta os tamanhos da tabela). **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:**
  `npm test`, lint, build. **Passo 5:** commit `Fonte Inter e escala de tamanhos com nomes`.

### Task 2: Todas as telas na escala, guarda e regra

**Arquivos:** todo `src/**/*.jsx` que usa `text-[Npx]`, `text-xs/sm/base/lg/xl/2xl/3xl`, `font-stretch`, `fontSize`
em SVG; novo `src/lib/tipografia.test.js` ou `src/components/comum/tipografiaVarredura.test.js` (varredura);
`CLAUDE.md` (seção "Tipografia").
- Mapear cada uso para o nome da escala pelo papel do texto (tabela do design), não só pelo tamanho mais próximo.
- [ ] **Passo 1:** teste de varredura (FALHA listando arquivo:linha). **Passo 2:** aplicar tela a tela. **Passo 3:**
  `npm test`, lint, build. **Passo 4:** commit `Todas as telas na escala de tipografia; regra no CLAUDE.md`.
  Conferência no navegador pelo controlador (claro/escuro, 1440 e 390 px: Início, Clientes, cliente, Usuários, uma
  janela de formulário).
