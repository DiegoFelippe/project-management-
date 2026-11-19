# Cores vivas — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aplicar no app a versão **Viva** aprovada pelo Diego (19/11 16:53, "Viva completa"): cor cheia nos ladrilhos,
selos, avatares, etiquetas e contadores; suaves mais ricos; marcas dos gráficos mais vivas (série a 3:1); um toque de
azul na moldura — com o texto sempre ≥ 4,5:1.

**Architecture:** só tokens em `src/index.css` (+ `@theme`) e a troca do suave pelo cheio nos componentes que pintam
fundo de categoria ou estado. Gráficos, ocupação, prazos, faixa do Início e brilho mudam sozinhos pelos tokens.

**Tech Stack:** React 19, Tailwind 4, Vitest. Sem banco.

**Spec:** `docs/auditoria-ux/cores/revisao-de-cores.md` (seções 2–4: tabelas de valores claro/escuro com contraste,
regras que mudam, arquivos) e o protótipo `docs/prototipo/cores-poc.html` com `?cores=viva` (tokens em
`[data-cores="viva"]`, os mesmos valores). A Task 1 copia a tabela para o desenho versionado
`docs/superpowers/specs/2026-11-19-graficos-variados-e-paleta-design.md`, seção 1, que passa a ser a autoridade.

## Global Constraints

- Texto ≥ 4,5:1 nos dois temas (inclusive o `sobre` em cima do `cheio`); marcas ≥ 3:1; a série dos gráficos passa a 3:1
  (aprovado, "Viva completa"); acima, folga e referência continuam 4,5:1. Estado sempre com ícone e palavra.
- Identidade: azul da consultoria no botão e no trilho, Inter, a escala de tipografia, o Padrão Hub, a cor da pessoa
  no avatar (o valor escolhido continua), os chips do Calendário fora desta entrega.
- Só tokens: nenhum hex em componente; o quadro deixa as classes do Tailwind (`bg-indigo-50`…) pelos tokens.
- Node 26 (`export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH`); vitest só com `--project`; commits só com os
  caminhos da tarefa; nunca `git reset`, stash, troca de branch ou push.

## Review Focus

1. Cada par `sobre/cheio` das 9 cores e dos estados ≥ 4,5:1 no claro e no escuro (o mostarda leva tinta escura).
2. Nenhum texto que hoje está sobre um suave fica sobre um cheio com a cor de texto antiga (ex.: `text-primary-texto`
   em cima de `bg-primary-cheio`).
3. Dark mode: o suave volta a se separar do cartão (≥ 1,8:1) sem virar fundo de texto ilegível.
4. As cores de estado iguais em toda tela (check-list, fluxograma, gráficos, faixa Hoje).
5. Telas que não estavam no protótipo (Calendário, Usuários, Times, Consultorias, Integrações) sem regressão.

---

### Task 1: Tokens Viva, guardas e regras

**Files:** `src/index.css`, `src/lib/contraste.test.js`, `src/components/graficos/cores.js` (só se o nome mudar),
`CLAUDE.md`, `docs/superpowers/specs/2026-11-19-graficos-variados-e-paleta-design.md` (seção 1).

**Interfaces — produz:** os valores Viva de todos os tokens listados na seção 4 do relatório (painel, muted, bordas,
accent, moldura/card no escuro, paleta 27, estados, `--grafico-serie`, `--grafico-acima`/`--grafico-folga` no escuro,
`.section-label`); tokens novos `--cor-<nome>-cheio` e `--cor-<nome>-sobre` (9 × 2) com `--color-cor-<nome>-cheio|sobre`
no `@theme` (classes `bg-cor-<nome>-cheio`, `text-cor-<nome>-sobre`); `COR.pausada` passa a turquesa (ruling: tira a
"pausada" de perto do âmbar de atenção; vale em toda tela).

- [ ] **Passo 1 — testes:** `contraste.test.js`: série ≥ 3:1 (no lugar de 4,5); `sobre/cheio` das 9 cores ≥ 4,5:1 nos
  dois temas; estados com o suave novo (texto/suave ≥ 4,5); suave × cartão no escuro ≥ 1,8:1. Ver FALHAR.
- [ ] **Passo 2 — tokens** com os valores exatos do relatório (seções 2 e "Paleta — claro/escuro (Viva)", "Estados",
  "Azul, moldura e gráficos").
- [ ] **Passo 3 — regras:** `CLAUDE.md` com as três mudanças da seção 3 do relatório (pedido do Diego, 19/11, "Viva
  completa"); a tabela da seção 1 do desenho com os valores Viva e a coluna "cheio · sobre".
- [ ] **Passo 4:** `npm test`, lint, build; navegador (claro e escuro) Início e Clientes. Commit `Cores vivas: tokens, guardas e regras`.

### Task 2: Componentes no cheio

Depende da Task 1. **Files:** `src/components/comum/CartoesDeNumeros.jsx`, `src/components/clientes/HojeDoCliente.jsx`,
`src/components/ui/badge.jsx` (+ quem usa as variantes `notice`/`positive`), `src/components/quadro/cores.js` (+ etiquetas
e prioridade em `src/components/quadro/`), `src/components/checkins/ListaDoChecklist.jsx` (número da etapa),
`src/components/checkins/Fluxograma.jsx` e os selos de situação da tarefa (as cores de estado do `COR`),
`src/components/comum/AbasSegmentadas.jsx`, `src/components/comum/BarraDeFiltros.jsx`, `src/components/comum/Tabela.jsx`,
os testes de cada um.

- [ ] **Passo 1 — testes:** os ladrilhos dos cartões e da faixa Hoje com `bg-*-cheio` e o ícone no `sobre`; o selo de
  estado sólido; a coluna do quadro e a etiqueta nos tokens (nenhuma classe `bg-<cor>-50`); o número da etapa no cheio;
  o fluxograma e os selos da tarefa com as mesmas cores de estado dos gráficos; a aba ativa e o ícone de Filtros no
  `text-primary-texto`. Ver FALHAR.
- [ ] **Passo 2:** escrever (TONS do cartão: azul → `bg-primary-cheio text-primary-foreground`; aviso/positivo/perigo →
  cheios de estado; `ceu` → turquesa cheio; neutro → grafite cheio; paleta → `bg-cor-<nome>-cheio text-cor-<nome>-sobre`).
- [ ] **Passo 3:** `npm test` (guardas `contraste`, `button.test`, `tipografiaVarredura`), lint, build; navegador como
  central, gestor e consultor em todas as telas do menu e na página do cliente (todas as abas), 1440 e 390, claro e
  escuro, comparando com as capturas de `docs/auditoria-ux/cores/`. Commit `Cores vivas: ladrilhos, selos, etiquetas e abas no cheio`.

---

## Fase 2 — paleta Tropical (19/11, "Aplicar a Tropical")

O Diego trocou a direção (17:22): não queria cores fortes; quer cores alegres e leves (fundo suave com texto escuro, sem
cor cheia além dos botões) e gráficos em tons frescos com o número escrito, conferidos pelo método da dataviz. Escolheu a
paleta **Tropical** (19:13) e aprovou a aplicação (19:33). **Spec desta fase:** `docs/auditoria-ux/cores/versao-tropical.md`
(tabelas claro/escuro mapeadas aos 9 nomes, estados, ordem das séries, saída do validador, linhas do `CLAUDE.md` que
mudam, lista do que muda em `src/`) e `docs/auditoria-ux/cores/versao-leve.md` (a estrutura: suave + texto escuro);
protótipo `docs/prototipo/cores-poc.html?cores=tropical`. A moldura (fundo da página, menu, bordas, azul dos botões) volta
ao **Atual** (os valores de antes de `918f1ac`).

### Task 3: Tokens Tropical, moldura de volta, ordem das séries, guardas e regras

**Files:** `src/index.css` (paleta 9 × texto/forte/suave/cheio/sobre com os valores Tropical — `cheio` = o suave, `sobre`
= o texto escuro —, estados, `--grafico-*`, moldura de volta ao Atual, `src/tema/tema.js`/`index.html` se a moldura
escura voltar), `src/components/graficos/cores.js` (`PALETA` na ordem do validador: azul, mostarda, rosa, laranja,
turquesa, indigo, violeta, verde; `COR` dos estados: feita verde, atenção âmbar, atrasada/perigo coral, em andamento
azul, a fazer violeta, não se aplica grafite, pausada mostarda), `src/lib/contraste.test.js`, `CLAUDE.md` (as linhas que o
relatório lista: sem cor cheia além de botões; ordem das séries; marcas leves com o número escrito e só a referência a
4,5:1), `docs/superpowers/specs/2026-11-19-graficos-variados-e-paleta-design.md` seção 1.

- [ ] Testes de contraste primeiro (texto/suave e sobre/cheio ≥ 4,5 nos dois temas; marcas no escuro ≥ 3; no claro, o
  piso que o relatório justifica para marca com número escrito; estados), ver FALHAR; tokens; regras; `npm test`, lint,
  build; navegador Início e Clientes claro/escuro. Commit `Cores: paleta Tropical (tokens, moldura de volta, ordem das séries e regras)`.

### Task 4: Componentes de volta ao suave e número escrito nos gráficos

Depende da Task 3. **Files:** os cinco componentes que o relatório da Leve lista (de cheio para suave: ladrilhos dos
cartões e da faixa Hoje, selos, etiquetas/contadores do quadro, número da etapa, avatares se for o caso), e os gráficos
que precisam do número ao lado da marca (totais das colunas empilhadas, totais por pessoa/situação na legenda, valores de
hoje e da projeção na linha), com os testes.

- [ ] Testes primeiro (nenhuma classe `bg-*-cheio` com `text-*-sobre` claro sobrando onde agora é suave; número escrito
  em cada gráfico de marcas leves), ver FALHAR; escrever; `npm test` (guardas), lint, build; navegador como central,
  gestor e consultor em todas as telas e abas do cliente, 1440/390, claro e escuro, comparando com o protótipo
  `?cores=tropical`. Commit `Cores: componentes no suave e número escrito nos gráficos (Tropical)`.
