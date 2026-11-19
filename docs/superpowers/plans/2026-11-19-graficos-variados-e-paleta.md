# Gráficos variados e paleta de cores — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Início e aba Geral do cliente com gráficos variados e coloridos (paleta de 9 cores), números que correm, e o
resto aprovado do Névoa (sombra, brilho do que mudou, botão que termina no resultado, faixa "está tudo bem?").

**Architecture:** Tokens novos em `src/index.css` (paleta `--cor-<nome>-texto|forte|suave` e trios de estado) com a
ordem das séries em `src/components/graficos/cores.js`; peças de gráfico novas em `src/components/graficos/` (sem
biblioteca, SVG na largura real, dica e "Ver em tabela"); 5 funções novas no banco para o Início e `hoje_do_cliente`
ampliado para a Geral; os blocos das telas montados com essas peças.

**Tech Stack:** React 19, Tailwind 4, Vitest, Postgres 17 + RLS + pgTAP (Supabase local). Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-19-graficos-variados-e-paleta-design.md` (e o protótipo aprovado
`docs/prototipo/cores-poc.html`, só referência visual e de comportamento). Regras dos gráficos: `CLAUDE.md`, seção
Gráficos, e `docs/superpowers/specs/2026-11-17-graficos-do-inicio-e-do-cliente-design.md`.

## Global Constraints

- Dados do Diego: nunca `supabase db reset`, nunca apagar o que os testes não criaram; migração com
  `npx supabase migration new <nome> < /dev/null` + `npx supabase migration up`, cópia antes
  (`docker exec supabase_db_consultoria pg_dump -U postgres --data-only --schema=public --schema=auth --schema=private > supabase/.copias/2026-11-19-antes-<nome>.sql`, conferir que não está vazia);
  nunca editar migração aplicada; corpo novo de função a partir do mais novo, com "Mesmo corpo de <migração>; muda só …" e os grants de volta. Portas 54521/54522; nunca 54321/54322/54721/54722.
- Funções novas: `security definer`, `search_path = ''`, pelo `private.liberado()`, recorte de quem vê igual ao do
  `painel_do_inicio`; período como ele (`p_mes` ou `p_de`/`p_ate`, `periodo_invalido`). pgTAP de quem vê (outra
  consultoria não vê nada), de período e de volume dentro dos limites do projeto; contagens do teste só nos dados do
  próprio teste (`testes.fx`), nunca na tabela inteira.
- Cores: só os tokens (`--cor-*`, estados e `--grafico-*`), nunca hex em componente; texto ≥ 4,5:1, marca ≥ 3:1, no
  claro e no escuro (`src/lib/contraste.test.js`); estado sempre com ícone e palavra.
- Gráficos: sem biblioteca; SVG na largura real (`useLargura`); texto do SVG por `TAMANHO` de `src/lib/tipografia.js`,
  nunca abaixo de 11 px; "Ver em tabela" com os mesmos números (`CartaoDeGrafico` `tabela`); dica no mouse, no toque e
  no teclado; frases só com números do banco, em `src/lib/frasesDosGraficos.js`, com teste; 360 px sem rolar para o lado.
- Movimento só com CSS e `requestAnimationFrame`; "reduzir movimento" = tudo pronto, sem contar.
- Padrão Hub, botões animados, tipografia da escala, `CLAUDE.md` atualizado onde a regra muda (com "pedido do Diego, 19/11").
- Node 26 (`export PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH`); vitest só com `--project`; nunca dois `test:db`
  juntos nem integração durante um `test:db`; commits só com os caminhos da tarefa (`git commit -m … -- <caminhos>`),
  nunca `git reset`, stash, troca de branch ou push.

## Review Focus

1. **Nada para mostrar:** período sem horas, consultoria sem check-list, todas as tarefas zero: a rosca, o calor, as
   empilhadas e os quadradinhos mostram o vazio do `CartaoDeGrafico` (nunca arco NaN, nem 0%/0 dividido).
2. **Mais itens que cores:** 12 consultores, 9 cidades: os 8 (ou 6) maiores e "Outros"/"Outras" em grafite, somando
   certo; nome longo corta com reticências e aparece inteiro na dica e na tabela.
3. **Fuso:** check-in às 23h30 de domingo em São Paulo conta no domingo, 20h (não na segunda em UTC); o dia do burn-up
   é o dia de São Paulo.
4. **Recorte:** o consultor só vê o que é dele em todas as funções novas; a gestão nunca vê outra consultoria; a central
   vê as séries por consultoria. Pessoa desativada aparece com o nome visível pela regra de sempre.
5. **Releitura:** um check-in feito no Início (`versao`) relê os blocos sem os números contarem de novo nem os gráficos
   crescerem de novo; trocar o período conta de novo.

---

### Task 1: Paleta e estados (tokens, guardas e regra)

**Files:**
- Modify: `src/index.css` (tokens claro e `.dark`; `@theme` com `--color-cor-<nome>-texto|forte|suave` e os trios),
  `src/components/graficos/cores.js`, `src/components/comum/CartoesDeNumeros.jsx` (`TONS` com as 9 cores),
  `src/lib/contraste.test.js`, `CLAUDE.md` (Padrão Hub/cores, Gráficos, a regra dos plugins).
- Test: `src/lib/contraste.test.js`, `src/components/graficos/cores.test.js` (novo).

**Interfaces — produz:**
- CSS: `--cor-{azul,turquesa,violeta,mostarda,rosa,verde,laranja,indigo,grafite}-{texto,forte,suave}`; trios
  `--positive|--positive-cheio|--positive-soft|--sobre-positive`, `--notice|--notice-cheio|--notice-soft|--sobre-notice`,
  `--destructive|--destructive-cheio|--destructive-soft|--sobre-destructive` (os nomes de hoje continuam; valores do desenho).
  Tailwind: `text-cor-azul-texto`, `bg-cor-azul-suave`, `fill-cor-azul-forte` etc.
- `cores.js`: `PALETA = ['azul','turquesa','violeta','mostarda','rosa','verde','laranja','indigo']`,
  `corDaSerie(i: number) => 'var(--cor-<PALETA[i % 8]>-forte)'`, `COR_OUTROS = 'var(--cor-grafite-forte)'`,
  `corDaPaleta(nome, tom = 'forte') => 'var(--cor-<nome>-<tom>)'`; `COR` ganha `feita`, `nsa`, `andamento`, `pausada`,
  `afazer`, `atrasada` (os da rosca e das etapas).
- `CartoesDeNumeros` `tom`: aceita os 9 nomes da paleta (fundo suave + ícone texto), além dos de hoje.

- [ ] **Passo 1 — testes:** em `contraste.test.js`, "paleta: texto ≥ 4,5 sobre o cartão e sobre o suave, forte ≥ 3
  sobre o cartão, nos dois temas" (lê os valores do CSS, como os testes de hoje) e "estados: texto/cartão, texto/suave e
  sobre/cheio ≥ 4,5 nos dois temas"; em `cores.test.js`, "corDaSerie segue a ordem e volta ao começo depois de 8" e
  "COR_OUTROS é grafite". Rodar `npx vitest run --project unidade src/lib/contraste.test.js src/components/graficos/cores.test.js`: FALHA.
- [ ] **Passo 2 — tokens e `cores.js`** com os valores exatos do desenho; `TONS` dos cartões; nenhuma cor de hoje muda
  de valor sem estar no desenho (o vermelho e o âmbar de texto mudam: conferir `contraste.test` e as telas).
- [ ] **Passo 3:** `npm test`, `npm run lint`, `npm run build`; no navegador (claro e escuro) Início e Clientes sem
  mudança visível além dos tons.
- [ ] **Passo 4 — `CLAUDE.md`:** a regra das cores passa a "as da consultoria e a paleta de 19/11 (pedido do Diego):
  categorias, nunca estado"; a seção Gráficos ganha a ordem das séries e o "Outros" em grafite. Commit
  `Paleta de 9 cores e estados em trios (tokens e guardas)`.

### Task 2: Banco — funções novas do Início e `hoje_do_cliente` ampliado

**Files:**
- Create: migração `graficos_variados`; `supabase/tests/database/graficos_variados.test.sql`;
  `tests/integracao/graficosVariados.test.js`.
- Modify: `supabase/tests/database/graficos_do_cliente.test.sql` (as chaves novas), `src/data/painel.js` (+ teste),
  `src/data/clientes.js` só se o formato pedir (as chaves de hoje não mudam).

**Interfaces — produz** (formatos exatos no desenho, seção 2 e 3):
- `horas_do_painel_por_dia`, `horas_por_unidade_por_semana`, `checkins_por_dia_e_hora`, `tarefas_por_situacao`,
  `clientes_por_cidade`; `hoje_do_cliente.checklist.etapas[].andamento|pausadas` e `hoje_do_cliente.checklist.mais_tempo`.
- `src/data/painel.js`: `horasDoPainelPorDia(periodo)`, `horasPorUnidadePorSemana(periodo)`,
  `checkinsPorDiaEHora(periodo)`, `tarefasPorSituacao()`, `clientesPorCidade()` (pelo `chamar` e
  `argumentosDoPeriodo` de hoje).

- [ ] **Passo 1 — pgTAP primeiro**, com os casos: cada papel vê o seu recorte (consultor, gestão, central, outra
  consultoria vazia); período inválido (`periodo_invalido`); burn-up com o dia de São Paulo; calor com o check-in de
  domingo 23h30 em SP no domingo/20h e o das 6h na 7h; "Outros" somando o resto com 10 unidades; tarefas: as partes somam
  o total e atrasada não conta em andamento/pausadas/a fazer; cidades: 6 maiores + Outras + "Sem cidade"; `hoje_do_cliente`
  com `andamento`, `pausadas` e `mais_tempo` (5, maior primeiro, só > 0) e as chaves de antes iguais; volume (5 mil
  clientes, 200 mil check-ins) dentro de 50 ms cada. Ver FALHAR.
- [ ] **Passo 2:** migração (cópia antes) e `src/data/painel.js` + teste.
- [ ] **Passo 3:** `npm run test:db` (uma vez), `npm test`, `npx vitest run --project integracao tests/integracao/graficosVariados.test.js tests/integracao/graficosDoCliente.test.js`, lint. Commit `Banco: gráficos variados do Início e etapas/tempo na faixa Hoje`.

### Task 3: Peças de gráfico novas e movimento

Depende da Task 1. **Files:**
- Create: `src/components/graficos/{Rosca,MapaDeCalor,ColunasEmpilhadas,Quadradinhos,FaixaDeGrupos}.jsx` (+ testes),
  `src/lib/useContagem.js` (+ teste).
- Modify: `src/components/graficos/BarrasHorizontais.jsx` (+ teste), `src/components/comum/CartoesDeNumeros.jsx`
  (+ teste), `src/index.css` (classes de movimento), `GraficoDeLinha.jsx` e `GraficoDeColunas.jsx` (a linha se desenha,
  as colunas crescem em onda; `GraficoDeLinha` aceita a cor da série tracejada, para a projeção vermelha), testes.

**Interfaces — produz:**
- `Rosca({ rotulo, partes: [{ nome, valor, cor }], centro: { valor: string, rotulo: string }, formatar = INTEIRO })`:
  arcos focáveis (aria-label "Nome: valor (N%)"), dica; total 0 → `null` (o cartão mostra o vazio).
- `MapaDeCalor({ rotulo, linhas: string[], colunas: string[], valores: number[][], cor, unidade, rotulosX = colunas })`:
  um alvo focável e as setas ← → ↑ ↓ andando de célula (Home/End), dica "seg, 10h: 12 check-ins"; zero = fundo afundado.
- `ColunasEmpilhadas({ rotulo, categorias: string[], series: [{ nome, cor, valores: number[] }], destaque?: number })`:
  coluna focável por categoria, dica com a série e o total.
- `Quadradinhos({ rotulo, grupos: [{ nome, n, cor }] })`: `role="img"` com o resumo, legenda com número e %.
- `FaixaDeGrupos({ rotulo, grupos: [{ nome, n, cor }] })`: uma faixa só e a legenda com números.
- `BarrasHorizontais`: item ganha `cor`; prop `zonas: [{ ate: number, cor }]` (folga/ideal/acima de fundo) com a marca do
  valor; `partes` aceita `feita | nsa | andamento | pausada | afazer | atrasada`.
- `useContagem(numero: number | null, { chave, atraso = 0 }) => number | null`: conta de 0 até o número (900 ms,
  easeOutCubic) quando a `chave` muda; com a mesma chave devolve o número direto; reduzir movimento devolve direto.
- `CartoesDeNumeros`: cartão aceita `contagem: { numero, formatar, chave }` (mostra `formatar(useContagem(...))`; a
  linha da variação aparece quando a contagem termina); o leitor de tela recebe só o valor final.
- CSS: `.grafico-onda` (cresce da base, atraso por `--i`), `.grafico-desenha` (linha), `.grafico-cascata` (opacidade).

- [ ] **Passo 1 — testes:** um arquivo por peça: estrutura e aria-label; teclado (setas no calor, foco por coluna);
  dica com o texto certo; vazio (`Rosca` total 0 → nada; `MapaDeCalor` todo zero → só fundo); nome longo inteiro no
  title/dica; `useContagem` com timers falsos: começa em 0, chega ao valor, mesma chave não reconta, reduzir movimento
  direto; `BarrasHorizontais` com `zonas` e `cor`. Ver FALHAR.
- [ ] **Passo 2:** escrever as peças com `useLargura`, `useDica`, `EixoY`, `Legenda`, `TAMANHO`.
- [ ] **Passo 3:** `npm test` (guardas: `tipografiaVarredura`, `contraste`, `button.test`), lint, build. Commit
  `Gráficos: rosca, mapa de calor, colunas empilhadas, quadradinhos, faixa e números que correm`.

### Task 4: Tela — Início com os gráficos variados

Depende das Tasks 2 e 3. **Files:** `src/pages/Inicio.jsx` (+ teste), `src/components/inicio/*` (novos:
`HorasNoPeriodoDoPainel`, `HorasPorUnidade`, `QuandoOsCheckins`, `TarefasDosChecklists`, `ClientesPorCidade`, cada um
com teste; mudam: `FilaDeClientes` → `FaixaDeGrupos`, `OcupacaoPorUnidade` → `zonas`, `HorasPorCliente` → `cor` por
cliente, `Indicadores` → tons da paleta e `contagem`), `src/lib/frasesDosGraficos.js` (+ teste).

**Interfaces — consome:** Task 2 (`src/data/painel.js`) e Task 3 (peças).

- [ ] **Passo 1 — testes de tela:** cada bloco novo com os números do banco, a leitura, "Ver em tabela" com os mesmos
  números, o vazio e o erro com "Tentar de novo"; quem vê cada bloco (tabela do desenho: consultor sem fila, ocupação,
  horas por unidade e cidades); a grade sem bloco sozinho numa linha; os cartões com as cores e a contagem; um check-in
  no Início (`versao`) relê sem recontar. Ver FALHAR.
- [ ] **Passo 2:** escrever (um `useLeituraDoBloco` por função, como hoje); frases novas com teste.
- [ ] **Passo 3:** `npm test`, lint, build; navegador como central, gestor e consultor, mês e período, 1440/390/360,
  claro e escuro. Commit `Início: gráficos variados e coloridos`.

### Task 5: Tela — aba Geral do cliente

Depende das Tasks 2, 3 e 4 (mesmo `frasesDosGraficos.js`). **Files:** `src/components/clientes/GraficosDoCliente.jsx`
(+ teste), `src/components/clientes/HojeDoCliente.jsx` (+ teste: ícones nos tons da paleta), `src/pages/Cliente.jsx`
(+ teste, só a ligação dos dados novos), `src/lib/frasesDosGraficos.js` (+ teste).

- [ ] **Passo 1 — testes de tela:** horas × previsão com a projeção vermelha quando passa da previsão (e azul quando
  não); horas por consultor em `Rosca` (total no meio); "Dias com check-in" em
  `MapaDeCalor` semanas × dias do período (mês, 90 dias, ano); "Check-list por etapa" com as seis partes e "N de M";
  "Onde foi o tempo" com as 5 tarefas; "Quadro do cliente" com a cor de cada coluna; horas por mês com o mês que passou
  da previsão em vermelho; vazios (sem check-list, sem quadro, sem tempo marcado); cliente arquivado. Ver FALHAR.
- [ ] **Passo 2:** escrever; o quadro lido por `quadro_do_cliente` (a leitura de hoje em `src/data/`).
- [ ] **Passo 3:** `npm test`, lint, build; navegador como gestor, consultor e central, 1440/390/360, claro e escuro.
  Commit `Cliente: aba Geral com gráficos variados`.

### Task 6: O resto do Névoa — sombra, brilho, botão com resultado e faixa do Início

Depende das Tasks 1 e 4. **Files:**
- Modify: `src/index.css` (`.card` com sombra longa no lugar da borda, nos dois temas; `.dentro-do-cartao` afundado com
  raio menor; `.mudou`), `src/pages/Clientes.jsx` (linha salva brilha), `src/components/quadro/*` (cartão movido
  brilha), `src/components/checkins/LinhaDaTarefa.jsx` (tarefa marcada brilha), `src/pages/Integracoes.jsx` e
  `src/components/clientes/BotaoCheckin.jsx` (botão com resultado), `src/pages/Inicio.jsx` (faixa), testes de cada um.
- Create: `src/lib/brilhar.js` (`brilhar(elemento)`: põe `.mudou`, tira depois de 1,6 s; nada com reduzir movimento),
  `src/components/comum/BotaoComResultado.jsx` (`({ acao: () => Promise<{ erro }>, rotulo, rotuloFeito = '✓ Salvo', ...Button })`:
  carregando ≥ 300 ms, depois o rótulo feito sobre `bg-positive-soft` por 2 s; erro volta ao rótulo e avisa),
  `src/components/inicio/FaixaDoInicio.jsx` (central e gestão: "N clientes precisam de você" com "Ver os N" levando ao
  bloco Clientes em risco; nada quando N = 0).

- [ ] **Passo 1 — testes:** `brilhar` põe e tira a classe (timers falsos) e não faz nada com reduzir movimento;
  `BotaoComResultado` (carregando, feito, erro, largura não muda); a faixa aparece com N > 0 e some com 0; consultor não
  a vê; a linha salva em Clientes, o cartão movido e a tarefa marcada recebem `.mudou` uma vez (nunca ao carregar).
  Ver FALHAR.
- [ ] **Passo 2:** escrever; a guarda `button.test` continua verde (o `BotaoComResultado` usa o `Button`).
- [ ] **Passo 3:** `npm test`, lint, build; navegador 1440/390, claro e escuro (a sombra separa o cartão do fundo nos
  dois). `CLAUDE.md` (Padrão Hub: sombra no lugar da borda, brilho, botão com resultado). Commit
  `Névoa: sombra nos cartões, brilho do que mudou, botão com resultado e faixa do Início`.
