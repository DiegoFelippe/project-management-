# Gráficos variados e paleta de cores — desenho

Pedido do Diego (19/11): analisar o design system Névoa e trazer o que der sem perder a identidade, "mas eu gostaria
de mais cores"; depois, "vamos ir mais pelo lado dos gráficos variados, tanto na tela inicial quanto na geral do
cliente". Protótipo `docs/prototipo/cores-poc.html` (abas Início, Geral, Clientes, Quadro, Check-list, Paleta,
Decidir) **aprovado inteiro** ("Aprovar todos", 19/11 14:29): as 8 perguntas da aba Decidir ficam com a primeira opção.

## O que fica (a identidade)

Botão principal azul, Inter, a escala de tipografia, o trilho com as animações, o Padrão Hub, os formulários e o molde
de tela do `CLAUDE.md`. Do Névoa não entram: o botão preto, a Plus Jakarta Sans, a moldura dele, o fundo verde-amarelo
do celular e os componentes de automação.

## 1. Paleta de 9 cores

Para **separar coisas** (pessoas, séries, clientes, cidades, etapas, colunas): nunca para estado. Cada cor em três tons:
**texto** (≥ 4,5:1 sobre o cartão e sobre o suave), **forte** (barras, ícones, marcas: ≥ 3:1 sobre o cartão) e
**suave** (fundo de selo, chip e ícone). Conferido no protótipo (aba Paleta, cálculo na própria página).

| Cor | Claro (texto · forte · suave) | Escuro (texto · forte · suave) |
|---|---|---|
| azul | `#1d4ed8` · `#2563eb` · `#dbeafe` | `#93c5fd` · `#3b82f6` · `#172554` |
| turquesa | `#0e7490` · `#0891b2` · `#cffafe` | `#67e8f9` · `#06b6d4` · `#083344` |
| violeta | `#6d28d9` · `#7c3aed` · `#ede9fe` | `#c4b5fd` · `#8b5cf6` · `#2e1065` |
| mostarda | `#a16207` · `#b07d04` · `#fef9c3` | `#fde047` · `#eab308` · `#422006` |
| rosa | `#be185d` · `#db2777` · `#fce7f3` | `#f9a8d4` · `#ec4899` · `#500724` |
| verde | `#15803d` · `#16a34a` · `#dcfce7` | `#86efac` · `#22c55e` · `#052e16` |
| laranja | `#c2410c` · `#ea580c` · `#ffedd5` | `#fdba74` · `#f97316` · `#431407` |
| índigo | `#4338ca` · `#4f46e5` · `#e0e7ff` | `#a5b4fc` · `#6366f1` · `#1e1b4b` |
| grafite | `#475569` · `#64748b` · `#f1f5f9` | `#cbd5e1` · `#94a3b8` · `#1e293b` |

- **Ordem das séries** (a mesma em todo gráfico): azul, turquesa, violeta, mostarda, rosa, verde, laranja, índigo;
  grafite fica para "Outros" e para o que é neutro (aguardando, a fazer). Mais de 8 itens: os 8 maiores e "Outros".
- **Estados continuam verde, âmbar e vermelho**, sempre com ícone e palavra, e ganham o trio que faltava (texto · cheio
  · suave · cor do que vai sobre o cheio), igual no claro e no escuro: sucesso `#15803d`·`#15803d`·`#dcfce7`·branco
  (escuro `#4ade80`·`#22c55e`·`#0c2e1a`·`#04140a`); atenção `#975a04`·`#d97706`·`#fef3c7`·`#1c1300` (escuro
  `#fbbf24`·`#f59e0b`·`#33260f`·`#1c1300`); perigo `#b91c1c`·`#dc2626`·`#fee2e2`·branco (escuro `#fca5a5`·`#dc2626`·
  `#3b161c`·branco).
- **Cor de pessoa** continua a que a pessoa escolheu (`perfis.cor`, avatar e agenda). Nos gráficos, a série segue a
  ordem acima, não a cor da pessoa (algumas cores de pessoa não chegam a 3:1 como marca).
- Isto **muda a regra das cores do `CLAUDE.md`** ("as cores da consultoria"): passa a ser "as da consultoria e a paleta de
  19/11", com o pedido do Diego anotado.

## 2. Gráficos do Início

Cada bloco carrega e falha sozinho, com a leitura (frase), a legenda, "Ver em tabela" e a dica no mouse, no toque e no
teclado, como hoje. No recorte de quem vê (central: tudo, por consultoria; gestão: a consultoria, por consultor;
consultor: o dele) e seguindo o período da barra.

| Bloco | Tipo | Dados | Quem vê |
|---|---|---|---|
| Horas no período × capacidade | área acumulada dia a dia, projeção tracejada no ritmo de hoje (vermelha se passa), linha da capacidade | **novo**: horas por dia no recorte + capacidade do período | todos |
| Fila de clientes (hoje: barras) | faixa única colorida + legenda com números | `fila_de_clientes` | central e gestão |
| Horas por consultor por semana (central: por consultoria) | colunas empilhadas, uma cor por unidade (8 maiores + Outros) | **novo** | central e gestão |
| Quando os check-ins acontecem | mapa de calor seg–dom × 7h–20h (início do check-in, hora de São Paulo), uma cor só | **novo** | todos |
| Ocupação por unidade (hoje: barras) | faixas: folga (< 70%), 70–100%, acima; a barra e o marcador do valor | `painel_do_inicio` (ranking) | central e gestão |
| Check-lists dos clientes | rosca: feitas, não se aplicam, em andamento, pausadas, a fazer no prazo, atrasadas; o % resolvido no meio | **novo**: tarefas por situação | todos |
| Horas por cliente (hoje: barras azuis) | ranking com uma cor por cliente | `horas_por_cliente` | todos |
| Clientes por cidade | quadradinhos: um por cliente ativo, colorido pela cidade (6 maiores + Outras) | **novo** | central e gestão |

Os blocos de hoje que não estão na tabela (horas por mês × capacidade, clientes em risco, check-ins por semana)
continuam. A grade não deixa bloco sozinho numa linha: o último bloco ímpar ocupa a largura toda.

**Funções novas** (todas `security definer`, `search_path = ''`, pelo `private.liberado()`, no recorte do
`painel_do_inicio`, aceitando o período como ele — `p_mes` ou `p_de`/`p_ate`, com `periodo_invalido` igual —, com
pgTAP de quem vê e de volume):
- `horas_do_painel_por_dia(p_mes, p_de, p_ate)` → `{ dias: [{ dia, horas }], capacidade, hoje }`.
- `horas_por_unidade_por_semana(p_mes, p_de, p_ate)` → `{ recorte, semanas: ['AAAA-MM-DD'], series: [{ id, nome, horas: [] }] }` (8 maiores + `{ id: null, nome: 'Outros' }`).
- `checkins_por_dia_e_hora(p_mes, p_de, p_ate)` → `{ celulas: [{ dia_semana 0–6 (dom = 0), hora 7–20, checkins }] }` (antes das 7h conta na 7h; depois das 20h, na 20h).
- `tarefas_por_situacao()` → `{ feitas, nao_se_aplica, andamento, pausadas, a_fazer, atrasadas, checklists }` dos check-lists ativos (atrasada = pendente vencida; andamento, pausadas e a_fazer contam só as no prazo: as partes somam o total).
- `clientes_por_cidade()` → `{ cidades: [{ cidade, uf, clientes }], outras, total }` (6 maiores; sem cidade conta em "Sem cidade").

## 3. Gráficos da aba Geral do cliente

Embaixo da barra de filtros e da faixa Hoje (que ganham os ícones coloridos), na grade de hoje.

| Bloco | Tipo | Dados |
|---|---|---|
| Horas × previsão | área com a projeção (como hoje), a projeção vermelha quando passa | já existe |
| Horas por consultor (hoje: barras) | rosca com o total no meio | já existe |
| Horas por mês | colunas com a linha da previsão; o mês que passou dela em vermelho; o atual em azul | já existe |
| Dias com check-in | calendário de calor (semanas × dias) do período, uma cor só (turquesa) | `horas_do_cliente_por_dia_no_periodo` |
| Check-list por etapa (hoje: etapas) | barra empilhada por etapa: feitas, não se aplica, em andamento, pausadas, a fazer, atrasadas; "N de M" | **ampliar** `hoje_do_cliente` |
| Onde foi o tempo | ranking das 5 tarefas com mais tempo (Iniciar/Pausar) | **ampliar** `hoje_do_cliente` |
| Quadro do cliente | faixa única com os cartões por coluna, na cor da coluna | `quadro_do_cliente` |

`hoje_do_cliente` ganha, em cada item de `checklist.etapas`, `andamento` e `pausadas` (pendentes no prazo nesse estado)
e, em `checklist`, `mais_tempo: [{ titulo, segundos }]` (as 5 com mais tempo, > 0). "Mesmo corpo de …"; as chaves de hoje
não mudam.

## 4. Movimento

- Os números dos cartões **correm até o valor** (900 ms, easeOutCubic; vizinhos com 120 ms de diferença); a variação
  ("▲ 12%") aparece quando a contagem termina. O leitor de tela recebe só o valor final.
- Colunas e barras **crescem em onda** da esquerda para a direita; a linha **se desenha**; a rosca **gira até o valor**;
  as células do calor e os quadradinhos entram em cascata. Referências (grade, meta) primeiro, o destaque por último.
- Com "reduzir movimento", tudo aparece pronto. Nada se mexe de novo numa releitura do mesmo período.

## 5. O resto do Névoa (junto, depois dos gráficos)

- **Sombra longa e fraca no lugar da borda** nos cartões (`.card`), e o que fica dentro de um cartão em fundo afundado
  com raio menor (raios concêntricos).
- **Brilho do que mudou**: a linha da tabela que acabou de ser salva, o cartão movido no quadro e a tarefa marcada
  recebem uma faixa diagonal e um tom que some (≈ 1,4 s). Uma vez por mudança; nunca ao carregar.
- **Botão que termina no resultado**: as ações em linha que gravam (marcar tarefa, Testar, Conectar) mostram o carregando
  e terminam em "✓ Salvo" / "✓ Conectado" sobre o suave do sucesso, sem mudar de largura. As janelas continuam com
  "Salvando…" e fecham ao dar certo.
- **Faixa "está tudo bem?"** no topo do Início (central e gestão), abaixo da barra: atenção quando há clientes sem
  check-in há 30 dias ou acima da previsão ("3 clientes precisam de você" + "Ver os 3" para a lista filtrada); sem nada,
  não aparece.

## Fora desta entrega

O "Desfazer" já existe (lote C2); o esqueleto no lugar de "Carregando…" e a cascata de entrada das listas ficam para
quando o Diego pedir. Cor escolhida por coluna do quadro já existe; cor por etapa do check-list segue a ordem da paleta.
