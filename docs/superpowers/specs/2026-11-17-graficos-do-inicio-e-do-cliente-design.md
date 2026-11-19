# Gráficos no Início e na aba Geral do cliente — design

Data: 2026-11-17. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes`.
Protótipo aprovado: `docs/prototipo/graficos-poc.html` (Início como Central, Gestor e Consultor; Cliente → Geral).
Auditoria: `docs/auditoria-ux/relatorio.html` (itens M4, M6, R6, R7 e a parte do Início do G2).
Base: `docs/superpowers/specs/2026-11-16-painel-do-inicio-design.md` (painel e filtro por período).
Plano de construção: `docs/superpowers/plans/2026-11-17-graficos-do-inicio-e-do-cliente.md`.

## Pedido do Diego (e o que ele aprovou)

- 17/11: "Na dashboard inicial e no menu geral do cliente eu quero gráficos e menos textos; traga algo que traga muito
  insight para um gestor."
- 17/11, depois de abrir o protótipo clicável: **"Pode construir"**. Vale como aprovação do protótipo como ele está,
  inclusive das respostas padrão às 5 perguntas da caixa "O que este protótipo quer validar":
  1. Os 4 números do topo são **Realizado, Ocupação, Clientes em atendimento e Aguardando**, adaptados ao papel como no
     protótipo (o consultor vê Realizado, Minha ocupação, Meus clientes e Check-ins).
  2. A variação de cada número compara com o **período anterior, com os mesmos dias**.
  3. Cliente **em risco** = sem check-in há **30 dias ou mais**, **ou** ritmo dos últimos 30 dias **acima de 120%** da
     previsão.
  4. Ocupação: **folga abaixo de 70%**, **alerta acima de 100%**.
  5. No cliente, a faixa **"Hoje"** (previsão, último check-in, próxima reunião, quadro, check-list) entra no lugar dos
     cartões Empresa e Contato, que viram **uma linha só, que abre**.
- Entram junto os itens que a auditoria deixou para este redesenho: **M4** (o mês do cliente vai para o título da seção
  dos gráficos), **M6** (a lista "Clientes esperando" legível no celular), **R6** (cartões de números alinhados),
  **R7** (estado vazio no gráfico de horas) e a parte do Início do **G2** ("Fazer check-in" em cada cliente do
  consultor no Início). O selo de check-in aberto na barra de cima é de outro lote (Lote C da auditoria).

## Objetivo, e o que seria falhar

- O gestor abre o Início e entende em segundos: quanto a equipe fez contra o que podia fazer, quem está acima ou com
  folga, quem espera há mais tempo, quais clientes estão parados ou estourando a previsão, e para onde vão as horas. O
  consultor vê o mesmo da carteira dele e faz check-in dali. No cliente, a aba Geral mostra a saúde de hoje e o mês em
  gráficos, com pouco texto.
- Falhar seria: uma consultoria ver número, nome ou hora de outra em qualquer gráfico novo; a comparação com o período
  anterior errar na virada de mês ou de ano, ou no Personalizado; o critério de risco marcar quase todo mundo no meio do
  mês; um gráfico ilegível a 360 px ou no tema escuro (texto abaixo de 11 px, rótulos encavalados, cor que some); o
  Início ficar lento com 2 anos de dados; o número do Início não bater com o de Usuários, Consultorias ou Clientes.

## Metas e o que não é meta

**Metas**
- Início com 4 cartões com variação e 4 a 6 gráficos por papel; aba Geral do cliente com ficha compacta, faixa "Hoje"
  e 4 a 5 gráficos do mês.
- Todo número e toda frase de leitura ("insight") vêm do banco ou de números que o banco mandou; nada é recontado na
  tela a partir de listas parciais.
- Um conjunto pequeno de componentes de gráfico reaproveitáveis, com dica (tooltip) no mouse e no teclado e visão em
  tabela.
- Os mesmos recortes de hoje: central vê tudo; administrador e gestor, a consultoria; consultor, a carteira dele.

**Não é meta**
- Biblioteca de gráficos, exportar gráfico, filtro por gráfico, comparação com o mesmo mês do ano passado,
  gráficos em outras telas (Usuários, Consultorias, Calendário), tempo real nos gráficos.

## Regras comuns

### Período e período anterior

O período continua na barra de filtros do Início (Mês, Últimos 30 dias, Últimos 90 dias, Este ano, Personalizado;
`src/lib/periodo.js` e `painel_do_inicio`). Duas regras novas, ambas calculadas **no banco**
(`private.periodo_anterior`):

- **Período efetivo:** vai do início do período até **hoje no máximo** (dias que ainda não aconteceram não têm horas).
  O Mês atual é de 1º até hoje; o Personalizado que acaba no fim do mês atual também para em hoje.
- **Período anterior, com os mesmos dias do efetivo:**

| Período efetivo | Anterior | Rótulo ("vs …") |
|---|---|---|
| Mês (inteiro ou até hoje) | do dia 1º do mês anterior até o mesmo dia, sem passar do fim dele (31/03 → 1º a 28/02) | "vs set/26" (mês inteiro) ou "vs 1–17 de out." |
| Começa em 1º de janeiro e acaba no mesmo ano (Este ano, ou um Personalizado assim) | as mesmas datas do ano anterior (29/02 → 28/02) | "vs mesmo período de 2025" |
| Qualquer outro (Últimos 30 e 90 dias, Personalizado) | os N dias logo antes (N = dias do efetivo) | "vs 18/09 a 17/10" |

Janeiro compara com dezembro do ano anterior. O banco devolve `{ de, ate, forma }` (`mes`, `mes_parcial`,
`ano_anterior`, `dias_antes`) e a tela só formata o rótulo (`rotuloDaComparacao` em `src/lib/periodo.js`).

### Quem vê o quê (todas as funções novas)

O recorte é o do `painel_do_inicio` de hoje, num ajudante só (`private.recorte_do_inicio()`), que todas as funções do
Início usam — assim nenhuma corta diferente:

| Quem | Recorte | Vê |
|---|---|---|
| Central (e dono) | `tudo` | todas as consultorias não arquivadas; nomes de consultorias |
| Administrador e gestor | `consultoria` | só a consultoria atual dele; nomes dos consultores pela regra de `vejo_perfil` |
| Consultor (papel pessoa, liberado) | `pessoa` | só os clientes dele e os check-ins dele (a carteira) |
| Sessão não liberada ou sem papel | — | erro `sem_recorte` (42501), como hoje |

A fila de clientes não existe para o consultor (a função recusa com `sem_recorte`). No cliente, `hoje_do_cliente`
segue `vejo_cliente`, o quadro segue `vejo_quadro`, a reunião segue a regra de `eventos_do_cliente` e o check-list a de
`checklist_do_cliente`; quem não vê o cliente recebe nulo, sem saber se ele existe.

### Números e frases

- **Números do banco.** Contagens, somas, médias, participações ("os 10 maiores somam 34%"), projeções e situações
  (em risco, no ritmo) vêm prontos. A tela só formata.
- **Frase de leitura.** Cada gráfico tem uma linha curta embaixo do título (a "leitura"), com o número que importa em
  negrito. As regras que escolhem a frase ficam em `src/lib/frasesDosGraficos.js` (funções puras, com teste), e usam só
  números que o banco mandou. Quando a frase resume mais do que o gráfico mostra (ex.: todos os consultores, não só os
  12 da lista), o número dela vem pronto do banco.
- **Variação dos cartões** (`src/lib/variacao.js`): Realizado e Check-ins em % (sem base no anterior, a diferença em
  horas ou check-ins); Ocupação em pontos percentuais; Clientes e Aguardando em quantidade (+ % quando o anterior tem
  5 ou mais). A seta vem com o sentido em texto para o leitor de tela ("subiu 12%"). Cor: verde quando o movimento é
  bom, vermelho quando é ruim, cinza quando igual — Realizado, Clientes e Check-ins: subir é bom; Aguardando: subir é
  ruim; Ocupação: subir é bom abaixo de 100% e ruim acima.

## Início

Molde de tela do menu: título "Olá, Ana." → barra de filtros (ícone + "Filtros" + Período) → 4 cartões de números →
gráficos. Grade de 12 colunas: a partir de 1280 px, blocos de 8+4 e 6+6; de 1024 a 1279, o bloco de 8 e o de 4 ocupam a
linha toda e os de 6 ficam lado a lado; abaixo de 1024, tudo em uma coluna. Ao trocar o período, os gráficos já
desenhados ficam a 60% de opacidade até os novos chegarem (sem esqueleto, sem pulo).

### Cartões de números (com variação)

| Papel | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Central | Realizado | Ocupação | Clientes em atendimento | Aguardando (consultoria ou consultor) |
| Administrador e gestor | Realizado | Ocupação | Clientes em atendimento | Aguardando consultor |
| Consultor | Realizado | Minha ocupação | Meus clientes | Check-ins |

- **Realizado:** horas dos check-ins fechados no período efetivo (como hoje).
- **Ocupação:** o mesmo número de Usuários e Consultorias (ver "Decisões", 1). No Mês atual, **reservado ÷
  capacidade do mês**; no mês passado e em qualquer período, o cartão se chama **Utilização** e é **realizado ÷
  capacidade** (até hoje), como já é. Vermelho acima de 100%.
- **Clientes em atendimento:** clientes não arquivados **com consultor**, no fim do período efetivo (hoje, no período
  atual; no fim do mês, num mês passado). Consultor: os dele.
- **Aguardando:** central = sem consultoria + sem consultor; gestão = sem consultor na consultoria. No fim do período
  efetivo. Âmbar quando passa de zero.
- **Check-ins** (consultor): quantos check-ins fechados ele fez no período efetivo.
- Embaixo de cada número: "▲ 12% vs out." (a variação). Enquanto a comparação carrega, a linha mostra "—"; se ela
  falhar, a linha some (o número continua). Os detalhes de hoje (capacidade, reservado, a distribuir) saem do cartão:
  a capacidade vai para a leitura do gráfico de meses e a fila mostra a distribuir e sem consultor.
- **R6:** o conteúdo do cartão alinha pelo topo e todos os cartões do Início têm a linha de variação, então os números
  ficam na mesma altura.

### 1. Realizado × capacidade por mês (todos; largura 8)

- **Mostra:** colunas do realizado de cada mês (de 6 a 24 meses: os que o período toca, no mínimo 6, terminando no mês
  do fim) e a **linha da capacidade** de cada mês, com pontos. Meses fora do período ficam esmaecidos. O mês em
  andamento tem a capacidade **até hoje**, com o último trecho da linha tracejado e o ponto vazado.
- **Dados:** `painel_do_inicio.horas_por_mes` ganha `capacidade` (a soma das capacidades de cada consultor no mês,
  pela mesma conta de `capacidades_do_periodo`, até hoje no mês em andamento) e `parcial`.
- **Leitura:** "No mês: **1.020 h** de 1.480 h (69%) · **460 h** livres" (ou "· **80 h** acima da capacidade");
  "No período"/"No ano" conforme o período; a capacidade é a do período efetivo (`capacidade_ate_hoje`).
- **Dica:** mês (e "até 17/11" no parcial), realizado, capacidade, % de utilização.
- **Vazio (R7):** com 0 h em todos os meses, no lugar do gráfico: "Sem horas nos últimos 6 meses." e, embaixo,
  "Capacidade de novembro: 1.480 h". Consultoria ou consultor novo vê isso primeiro.
- **Celular:** o gráfico ocupa a largura do cartão; o rótulo do mês aparece a cada N meses (no mínimo 44 px entre
  rótulos, sempre o último); os valores ficam na dica e na tabela.

### 2. Fila de clientes (central e gestão; largura 4)

- **Mostra:** em cima, as etapas como blocos lado a lado, numa rampa de azul do claro ao escuro: (central)
  **Aguardando consultoria** → **Aguardando consultor** → **Em atendimento**, cada uma com a quantidade de hoje e uma
  linha ("média **4 dias**", "ninguém esperando", "+12 novos no período"). Embaixo, "Há quantos dias esperam": uma
  faixa por etapa de espera com um ponto por cliente na posição dos dias (0 = hoje, 5 d, 10 d…), pontos no mesmo dia
  empilhados.
- **Dados:** `fila_de_clientes(período)` → a situação de hoje (contagens, média e maior espera de cada etapa), os 40
  que esperam há mais tempo para os pontos e, do período, quantos receberam consultor e a média de espera até ter
  consultor. "Situação de hoje" vale mesmo num mês passado (a frase do período diz "no período").
- **Leitura:** "Até ter consultor: **3,5 dias** em média no período" ou "Ninguém recebeu consultor no período".
- **Tabela (M6):** "Cliente · Situação · Esperando", os 15 que esperam há mais tempo, com um link por etapa para
  Clientes já filtrado ("Ver os 7 aguardando consultoria" → `/clientes?situacao=distribuir`; "Ver os 5 aguardando
  consultor" → `/clientes?situacao=aguardando`). **No celular** a tabela tem uma
  coluna: o nome e, embaixo, "Sem consultor · há 1 dia" (o dado que importa não some para o lado).
- **Celular:** as etapas viram linhas (nome à esquerda, número à direita).

### 3. Ocupação por consultoria (central) / por consultor (gestão) (largura 6)

- **Mostra:** barras horizontais, do mais ocupado ao menos, com a marca de 100%. Até 100%, azul; o que passa de 100%
  continua em **vermelho** depois da marca, com ícone de alerta; abaixo de 70%, **âmbar** com ícone de seta para baixo
  (folga). Na central, embaixo do nome, "6 consultores".
- **Escala:** com até 12 itens, todos; com mais, os **6 mais ocupados e os 6 com mais folga**, separados por uma linha
  "… 18 no meio" (os dois extremos é o que o gestor precisa ver; o "Ver todos" leva a Usuários ou Consultorias).
- **Dados:** `painel_do_inicio.ranking` (até 12, com a regra acima) e `ranking_resumo { total, acima, folga }` contado
  sobre todos. O número é o do cartão Ocupação (Mês atual: reservado ÷ capacidade; senão, utilização).
- **Leitura:** "**2 consultores** acima de 100% · **3** com folga"; "Ninguém acima de 100% · 3 com folga"; "Todos
  entre 70% e 100%".
- **Dica:** nome, %, "reservado 150 h de 160 h" (Mês atual) ou "realizado 150 h de 160 h".
- **Links:** como hoje (consultoria → Consultorias na aba Ocupação; consultor visível → Usuários com a ficha).
- **Vazio:** "Nenhum consultor com capacidade neste mês." (como hoje).

### 4. Clientes em risco (todos; largura 6 na gestão e central, 4 no consultor)

- **Mostra:** até 6 linhas, os de maior risco primeiro: nome (link para o cliente) e, embaixo, o consultor (gestão)
  ou a consultoria (central); duas mini barras: **Último check-in** (dias, com a marca de 30) e **Ritmo × previsão
  (30 dias)** (%, com a marca de 120%). O que passou do limite fica vermelho com ícone. "Ver todos os N" vira a visão
  em tabela, paginada no banco (15 por página).
- **Critério (situação de hoje, não do período):** só clientes com consultor e não arquivados.
  - *Sem check-in há 30+ dias:* **a mesma regra** do cartão "Sem check-in há 30 dias" de Clientes
    (`indicadores_de_clientes`): consultor há mais de 30 dias (`consultor_desde`, ou o cadastro) e nenhum check-in
    começado nos últimos 30 dias. Cliente recém-atribuído não entra.
  - *Ritmo acima de 120%:* horas fechadas nos **últimos 30 dias corridos**, na consultoria atual do cliente (de todos
    os consultores dela), ÷ (previsão mensal × 30 / 30,4). Só conta com consultor há 30+ dias (senão "—"). Por ser uma
    janela que anda, o critério **não depende do dia do mês**: no dia 15 ninguém é marcado só porque o mês está pela
    metade.
  - Ordem: o maior entre (dias sem check-in ÷ 30) e (ritmo ÷ 1,2), depois o nome.
- **Dados:** `clientes_em_risco(p_pagina)` → `{ itens, total, sem_checkin, acima_do_ritmo }`. Não depende do período:
  carrega uma vez e não recarrega ao trocar o período.
- **Leitura:** "**4** sem check-in há 30+ dias · **2** acima de 120% da previsão" ou "Nenhum cliente em risco hoje".
- **Vazio:** "Todos com check-in recente e dentro da previsão."
- **Celular:** some o cabeçalho das colunas; cada linha tem o nome na largura toda e as duas mini barras lado a lado,
  cada uma com o rótulo pequeno em cima.

### 5. Horas por cliente (central e gestão) / Horas nos meus clientes (consultor) (largura 6)

- **Mostra:** barras horizontais dos **10 clientes com mais horas** no período, com um traço na **previsão atual
  proporcional ao período** (Mês: a previsão do mês; outro período: previsão × dias ÷ 30,4); o que passa da previsão
  continua em vermelho. Embaixo do nome: o consultor (gestão) ou a consultoria (central). Rodapé: "+ 238 outros clientes
  · 1.204 h".
- **Consultor (G2):** todos os clientes dele entram na conta, inclusive os com 0 h; cada linha tem o botão de ícone
  **"Fazer check-in"** (ou "Fazer check-out · 1 h 05" no cliente aberto; desabilitado com check-in aberto em outro
  cliente, com o aviso da tela), o mesmo `BotaoCheckin`, em versão compacta. Na visão em tabela, a ação completa na
  última coluna.
- **Dados:** `horas_por_cliente(período, p_pagina)`: sem página, os 10 + `resto { clientes, horas }`, `total_horas`,
  `total_clientes` e as participações dos 3 e dos 10 maiores; com página, 15 por página na mesma ordem, com `total`
  (a tabela).
- **Leitura:** mais de 30 clientes → "Os 10 maiores somam **34%** das horas no período"; de 4 a 30 → "Os 3 maiores
  somam **51%**…"; até 3 → "**42 h** no período".
- **Vazio:** "Nenhuma hora no período." (consultor sem clientes: "Nenhum cliente seu ainda.").

### 6. Check-ins por semana (todos; largura 6)

- **Mostra:** linha com área clara, uma semana (segunda a domingo) por ponto, nas semanas que o período toca (no
  mínimo 8: se forem menos, a linha começa antes, e as semanas do período ficam numa faixa de fundo). A semana em
  andamento tem o último trecho tracejado e o valor "12 até hoje" na ponta; o pico leva o rótulo "pico 48".
- **Dados:** `checkins_por_semana(período)` → semanas `{ semana, checkins, horas, no_periodo, parcial }`, `media` (só
  semanas inteiras do período) e `pico`.
- **Leitura:** "Média de **38** por semana no período · pico na semana de 06/10" ou "Nenhum check-in no período".
- **Dica (cruz que acha a semana mais perto):** "Semana de 06/10", check-ins, horas.

### O que cada papel vê

| Bloco | Central | Gestão | Consultor |
|---|---|---|---|
| Realizado × capacidade | toda a plataforma | a consultoria | ele |
| Fila de clientes | 3 etapas | 2 etapas | — |
| Ocupação por… | consultoria | consultor | — |
| Clientes em risco | todos (com a consultoria) | da consultoria (com o consultor) | os dele (largura 4, ao lado dos meses) |
| Horas por cliente | todos (10 maiores) | da consultoria (10 maiores) | todos os dele, com check-in |
| Check-ins por semana | toda a plataforma | a consultoria | os dele |

Saem do Início: os blocos "Horas por mês", "Ocupação/Utilização por…" (vira o bloco 3), "Clientes esperando há mais
tempo" (vira a fila), "Consultores nos extremos" (os extremos estão no bloco 3) e "Meus clientes no mês" (vira o
bloco 5).

## Cliente → Geral

Ordem: "← Clientes" → título e razão social → barra de abas e ações (já existe) → ficha compacta → **Hoje** →
**No mês** com os gráficos.

### Ficha compacta (no lugar de Resumo, Empresa, Contato e Previsão no mês)

Um cartão de uma linha: selo da situação (Em atendimento, Aguardando consultor, Aguardando distribuição, Arquivado),
consultoria, consultor (bolinha e nome; "(desativado)" como hoje), "**30 h/mês** previstas", cidade/UF, e no fim o
botão "Empresa e contato ⌄" que abre, no mesmo cartão, CNPJ, razão social, observações, contato, telefone e e-mail
(o que estiver vazio mostra "—"). No celular os itens quebram linha sem os separadores e o detalhe fica em uma coluna.
Nada vem do banco além do que `buscarCliente` já traz.

### Faixa "Hoje" (5 cartões; situação de hoje, não muda com o mês dos gráficos)

| Cartão | Mostra | Rodapé |
|---|---|---|
| Previsão do mês | % da previsão já feita (grande), "18 h de 30 h", medidor com a marca "hoje" (quanto do mês já passou) | selo "vai passar: ≈ 34 h" (projeção > 105%), "abaixo do ritmo: ≈ 19 h" (< 70%) ou "no ritmo"; até o dia 6 do mês, sem selo ("começo do mês") |
| Último check-in | "há 3 d" e a data; faixa dos últimos 30 dias, um traço por dia (cheio com check-in, mais fino no fim de semana) | selo "em dia" (< 14 dias), "atenção" (14 a 29) ou "em risco" (a regra do risco) |
| Próxima reunião | "qui, 19/11" e a hora, o título, selo "Meet" se tiver | "em 2 dias"; sem reunião: "Nenhuma marcada" e o link "Marcar reunião" (aba Agenda) |
| Quadro | atrasados de N cartões (vermelho se > 0), barra fina atrasados × no prazo | "2 cartões sem responsável" ou "Todos com responsável"; sem quadro: "Nenhum cartão" e "Abrir quadro" |
| Check-list | % das tarefas feitas, "12 de 28 tarefas", barra fina feitas × atrasadas × a fazer | selo "3 atrasadas" ou "nada atrasado" e "próxima 20/11"; sem modelo: "Nenhum modelo aplicado" e "Aplicar modelo" (aba Check-ins, para quem pode) |

- **Dados:** uma chamada, `hoje_do_cliente(p_cliente)`: previsão do mês atual (realizado pela mesma base da lista de
  Clientes: os check-ins que quem olha enxerga), projeção e situação do ritmo; último check-in **do cliente na
  consultoria atual** (só a data) e os dias com check-in nos últimos 30; a situação (em dia, atenção, em risco); a
  próxima reunião que a pessoa vê; os números do quadro da consultoria atual (sem criar quadro); o resumo do check-list
  e as etapas (feitas, atrasadas, a fazer).
- Cada cartão tem dica no mouse e no foco com os números ("18 h de 30 h realizado · 57% do mês já passou · ≈ 34 h
  no fim do mês").
- **Cliente arquivado:** no lugar da faixa, a linha "Arquivado em 12/10/2026."; os gráficos do mês continuam
  (histórico). **Sem consultor:** a faixa aparece (previsão 0 h, último check-in "—").
- **Celular:** 2 colunas; o último cartão ocupa as duas.

### "No mês" (M4)

O título da seção leva o mês: "**No mês** ‹ Novembro de 2026 ›" (`NavegacaoDoMes`, que ganha `minimo`: não volta antes
do mês em que o cliente foi cadastrado; `maximo` é o mês atual). Só os gráficos abaixo seguem esse mês; a faixa "Hoje"
não. A primeira linha da seção é o rótulo pequeno "No mês" com a navegação ao lado (no celular, só as setas).

| Gráfico | Mostra | Dados | Leitura |
|---|---|---|---|
| Horas no mês × previsão (largura 8) | linha do realizado **acumulado** dia a dia com área clara; no mês atual, a **projeção** tracejada até o fim do mês; linha da previsão com o rótulo "Previsão 30 h"; ponto e valor no último dia com horas | nova `horas_do_cliente_por_dia(p_cliente, p_mes)` (base RLS, como os gráficos de hoje) | atual: "No ritmo atual, fecha o mês com **≈ 34 h** (113% da previsão)" (até o dia 6: "**4 h** até agora"); passado: "Fechou o mês com **28 h** (93% da previsão atual)" |
| Horas por consultor (largura 4, em cima) | barras horizontais, mais horas primeiro | `horas_do_cliente_por_consultor` (já existe) | "**Ana Lima** fez 82% das horas" / "Só **Ana Lima** neste mês" |
| Últimos 6 meses (largura 4, embaixo) | colunas dos 6 meses até o mês escolhido, o escolhido em destaque, linha da previsão atual | `horas_do_cliente_por_mes(p_cliente, 6, p_ate)` (ganha `p_ate`) | "Média de **26 h**/mês · 2 meses acima da previsão" (só meses fechados; a média vem dos 6 pontos do gráfico) |
| Check-ins por semana (largura 6) | colunas por semana do mês, com o número em cima de cada uma (no máximo 6 colunas, então cabe) | `checkins_do_cliente_por_semana` (já existe) | "**9 check-ins** no mês · 2,1 h em média" |
| Andamento do check-list por etapa (largura 6; só com modelo aplicado) | uma barra empilhada por etapa: feitas, atrasadas, a fazer; "8/12" no fim, ícone de alerta se há atrasada | as etapas de `hoje_do_cliente` (situação de hoje) | "**Financeiro** tem 3 tarefas atrasadas · situação de hoje" / "Nenhuma tarefa atrasada · situação de hoje" |

Vazios: "Sem horas neste mês." (burn-up e consultores), "Sem check-ins neste mês." (semanas), "Sem horas nos últimos 6
meses." (meses), como hoje. Carregando: o cartão com a altura do gráfico e "Carregando…". Erro: a frase de hoje ("Não
foi possível carregar o gráfico de …") com o botão "Tentar de novo". `versao` (check-in feito na página) recarrega a
faixa e os gráficos, como hoje. Celular: uma coluna; o par da largura 4 fica lado a lado entre 721 e 1279 px.

## Banco

### História da situação dos clientes (nova, interna)

Para comparar "Clientes em atendimento", "Aguardando" e a Ocupação do Mês atual com o período anterior, o banco
precisa saber como cada cliente estava numa data passada. Hoje ele só sabe o estado atual.

- Tabela `private.situacoes_dos_clientes`: uma linha por trecho de tempo em que o cliente ficou com a mesma
  consultoria, o mesmo consultor e a mesma previsão, sem estar arquivado: `cliente_id`, `consultoria_id`,
  `consultor_id`, `horas_mes`, `de`, `ate` (nulo = é a situação de agora), `espera_desde` (quando começou a esperar
  consultor naquela consultoria) e `entrou` (esta linha é o começo de um atendimento: o cliente ganhou consultor).
- Mantida por gatilho em `clientes` (só quando muda consultoria, consultor, previsão ou arquivamento). No esquema
  `private` (o PostgREST não publica), sem acesso direto: só as funções do banco leem — como
  `private.checkins_horas_consultor_mes`.
- **Preenchida na migração refazendo o histórico** a partir de `cliente_eventos` (cada mudança já está lá, com o "de"
  e o "para"), com `clientes` travada para escrita durante o preenchimento e a criação do gatilho (como
  `20261117014923_painel_resumo_sem_buraco.sql`). Nada existente muda ou é apagado.
- Com ela: clientes em atendimento, aguardando e reservado (soma das previsões) **num instante qualquer**, no recorte
  (`private.situacao_no_instante`); "+N novos em atendimento no período" e "até ter consultor" (média de `de −
  espera_desde` nas linhas `entrou`).

### Resumos novos de check-ins

Iguais aos que já existem (`checkins_horas_mes`, `checkins_horas_consultor_mes`): só check-ins fechados, pelo dia ou
mês de São Paulo em que começaram, mantidos pelo mesmo gatilho de `checkins` (estendido), preenchidos na migração com
`checkins` travada.
- `private.checkins_horas_cliente_mes (cliente_id, consultoria_id, mes, segundos)`: horas por cliente sem ler milhões
  de check-ins (central em 2 anos).
- `private.checkins_por_dia (consultoria_id, dia, quantidade, segundos)`: check-ins por semana da central e da
  consultoria em 2 anos. O consultor lê os próprios check-ins direto (pelo índice do consultor; são poucos).

### Funções

| Função | Para quê | Recarrega com o período? |
|---|---|---|
| `painel_do_inicio` (refeita) | cartões, meses com capacidade, ocupação por unidade (até 12) e contagens | sim |
| `comparacao_do_inicio` (nova) | os números do período anterior e a forma do rótulo | sim (em paralelo) |
| `fila_de_clientes` (nova) | fila de hoje + o que aconteceu no período | sim |
| `clientes_em_risco` (nova) | risco de hoje, paginado | não |
| `horas_por_cliente` (nova) | 10 maiores + resto, ou a página da tabela | sim |
| `checkins_por_semana` (nova) | semanas do período, média e pico | sim |
| `hoje_do_cliente` (nova) | a faixa "Hoje" e as etapas do check-list | não (só com `versao`) |
| `horas_do_cliente_por_dia` (nova) | o acumulado do mês e a projeção | com o mês do cliente |
| `horas_do_cliente_por_mes` (ganha `p_ate`) | os 6 meses até o mês escolhido | com o mês do cliente |

`painel_do_inicio` perde `esperando`, `extremos`, `meus_clientes` e `previsao_atual` (foram para as funções novas ou
para o cartão) e ganha `capacidade` e `parcial` em `horas_por_mes`, `capacidade_ate_hoje`, `clientes_em_atendimento`,
`checkins` (consultor) e `ranking_resumo`. **Por que funções separadas, e não um painel maior:** a comparação dobra o
custo da parte mais cara (o realizado de outro período inteiro); separada, ela roda em paralelo e a tela mostra os
números antes das setas. O risco não depende do período e não precisa recarregar. Cada bloco carrega e falha sozinho.
Todas passam por `private.recorte_do_inicio()` e `private.periodo_do_inicio()` (as mesmas regras de período inválido
de hoje, com as mesmas frases).

### Desempenho (limites dos testes de volume)

Volume do `painel_volume.test.sql` (200 consultorias, 3.000 consultores, 50.000 clientes, 2,5 milhões de check-ins
em 24 meses), média de 5 execuções com 50% de folga, como hoje:

| Função | Central | Consultoria | Consultor |
|---|---|---|---|
| `painel_do_inicio` Mês / Este ano e 2 anos | 500 / 600 ms (os de hoje) | 150 ms | 100 ms |
| `comparacao_do_inicio` Mês / 2 anos | 500 / 600 ms | 150 ms | 100 ms |
| `fila_de_clientes` (período de 2 anos) | 200 ms | 50 ms | — |
| `clientes_em_risco` | 400 ms | 100 ms | 50 ms |
| `horas_por_cliente` Mês / 2 anos | 300 / 800 ms | 150 ms | 100 ms |
| `checkins_por_semana` 2 anos | 300 ms | 100 ms | 100 ms |

Cliente com 5.000 check-ins, 1.000 cartões, 500 tarefas e 1.000 eventos: `hoje_do_cliente` 50 ms,
`horas_do_cliente_por_dia` 30 ms, `horas_do_cliente_por_mes(24)` 50 ms. Gatilhos: gravar e fechar um check-in e mudar
o consultor de um cliente seguem abaixo de 20 ms no volume. Sem Seq Scan em `checkins` nos planos (EXPLAIN no teste).

## Componentes de gráfico

### SVG à mão, sem biblioteca

O projeto já desenha gráficos em SVG próprio (`HorasPorMes`, `GraficosDoCliente`, o `Fluxograma`), e o protótipo
aprovado já tem a lógica de desenho completa. Uma biblioteca foi medida: **recharts@3.11.0**, só um gráfico de colunas +
linha + área com dica, sai com **485 KB minificado / 138 KB gzip** (sem contar o React), e traria as próprias regras de
texto, cor e foco, que teríamos de dobrar para seguir a escala (11 px no mínimo, `TAMANHO`), os tokens de cor, o
contraste e o teclado. Decisão: **componentes próprios em `src/components/graficos/`**, nenhuma dependência nova.

A diferença para os gráficos de hoje: o SVG passa a ser desenhado **na largura real do cartão** (medida com
`ResizeObserver`), sem `viewBox` que estica. Assim o texto do SVG fica sempre em `TAMANHO.legenda` (11 px) em qualquer
tela, e os rótulos podem ficar dentro do gráfico (no fim da linha, no pico).

### As peças

| Componente | Uso |
|---|---|
| `useLargura` | largura do contêiner (sem `ResizeObserver`, como no jsdom, 640 px) |
| `CartaoDeGrafico` | título, leitura, legenda, botão "Ver em tabela"/"Ver gráfico", estados carregando/erro/vazio |
| `TabelaDoGrafico` | a visão em tabela (`Tabela` do projeto, só leitura, sem paginação: são os mesmos ≤ 31 pontos do gráfico) |
| `GraficoDeColunas` | colunas + linha de referência por categoria (capacidade) ou horizontal (previsão), destaque, ponto parcial |
| `GraficoDeLinha` | linha/área com cruz que acha o X mais perto (mouse e setas), série tracejada (projeção), faixa de fundo, rótulos no fim e no pico |
| `BarrasHorizontais` | nome (link opcional) + sub, trilha, barra, marca (100% ou previsão), trecho acima do limite, valor, ação opcional; variante empilhada (check-list) e separador "… N no meio" |
| `MiniBarra` | trilha curta com a marca de limite e o valor (risco) |
| `Medidor` e `BarraSegmentada` | o medidor da previsão com a marca "hoje"; a barra fina de partes (quadro, check-list) |
| `DiasComCheckin` | os 30 traços do último mês |
| `Dica` | a caixa da dica, uma por gráfico, posicionada dentro da tela |
| `Legenda` | quadrado para barras, traço para linhas, traço tracejado para parcial/projeção |

### Marcas e cores (dataviz)

- Colunas e barras com no máximo 24 px de espessura, ponta de 4 px arredondada e base reta; linhas de 2 px; pontos de
  8 px com anel de 2 px da cor do cartão; área a 10% (14% no escuro); grade de 1 px, contínua, discreta; 2 px de vão
  entre o azul e o trecho vermelho acima do limite. Rótulo só no que importa (fim, pico, valor da coluna quando cabe),
  nunca em todo ponto.
- Texto nunca na cor da série: valores e rótulos em `foreground`/`muted-foreground`; a cor fica na marca ao lado.
- Cores como tokens em `src/index.css` (`:root` e `.dark`), a partir das cores da consultoria:
  `--grafico-serie` (azul `--primary`), `--grafico-acima` (vermelho `--destructive`), `--grafico-folga` (âmbar: `#b45309`
  no claro, `#d97706` no escuro), `--grafico-ref` (cinza da capacidade/previsão: `#64748b` / `#94a0b8`), `--grafico-grade`,
  `--grafico-trilha`, `--grafico-neutro` (a fazer) e a rampa da fila `--grafico-fila-1..3`.
- Validado com o validador do dataviz: acima × série × folga passam no claro e no escuro (daltonismo ΔE ≥ 24,8; visão
  normal ≥ 34); a rampa da fila passa como ordinal nos dois temas. Vermelho e âmbar podem cair em linhas vizinhas
  (alguém acima de 100% e outro abaixo de 70%, sem ninguém no meio) e são parecidos para quem não vê verde; por isso
  cada um tem **ícone** (alerta / seta para baixo), o número escrito e a marca de 100%, e são cores de situação, não
  de série. Contraste das marcas sobre o cartão ≥ 4,5:1 (série, acima, folga, referência) nos dois temas; trilha e
  "a fazer" são fundo e têm nome e número ao lado.

## Acessibilidade

- Todo gráfico tem **visão em tabela** (botão no canto do cartão, `aria-pressed`, o foco fica no botão ao trocar). A
  tabela tem nome e os mesmos números da dica.
- Dica igual no mouse, no toque (tocar na marca) e no **foco do teclado**; Esc fecha. O texto da dica é texto do React
  (nunca HTML montado), com o valor em destaque e o rótulo depois.
- Colunas, barras e linhas de risco são focáveis (Tab) com `aria-label` "nov/26: 1.020 h de 1.480 h"; a linha (semanas,
  burn-up) é um alvo só, e as setas ← → andam de ponto em ponto. Os pontos da fila não são focáveis (seriam até 40
  paradas): a faixa tem um nome que resume ("Aguardando consultor: 5 clientes, de 1 a 9 dias") e a tabela lista todos.
- O SVG tem `role="group"` (não `img`, que esconderia as marcas focáveis) e um nome que resume o gráfico; cada marca
  focável é `role="img"` com `aria-label`. Alvo do mouse maior que a marca (a coluna inteira, a linha inteira, 24 px
  nos pontos).
- Cor nunca sozinha: ícone, legenda e número. Com "reduzir movimento", nada anima (os gráficos não animam de qualquer
  forma; só o clarear da marca sob o mouse).

## Celular e tema escuro

- A 360 px nada rola para o lado: o SVG tem a largura do cartão, nomes longos cortam com reticências (o nome inteiro
  fica no `title` e para o leitor de tela), tabelas rolam dentro do cartão.
- Rótulos do eixo X com no mínimo 44 px entre eles (sempre o último); no eixo Y, números redondos (0 / 500 / 1.000;
  "10 mil" a partir de 10.000).
- Tema escuro pela classe `.dark` (o botão de tema), com os tokens próprios do escuro, conferidos no navegador.

## Itens da auditoria que entram

- **M4:** o mês sai do meio da página e entra no título da seção "No mês"; a faixa "Hoje" diz que é de hoje.
- **M6:** a lista de quem espera vira a fila e a tabela dela tem uma coluna no celular.
- **R6:** `CartoesDeNumeros` alinha pelo topo (vale para todas as telas) e o Início tem a linha de variação em todos.
- **R7:** estado vazio no gráfico de meses, com a capacidade em texto.
- **G2 (Início):** check-in em cada cliente do consultor, no gráfico e na tabela.

## CRUD

Esta entrega não cria nada que a pessoa crie, edite ou apague: só lê. As tabelas novas são internas (história e
resumos), mantidas pelo banco, sem acesso pela tela. Nenhuma operação de CRUD fica de fora.

## Fica de fora (depois)

- Selo de check-in aberto na barra de cima (Lote C da auditoria).
- "Também no período anterior" na ocupação e o valor anterior de cada consultor na dica (dobraria o custo da parte mais
  cara do painel).
- Filtro de consultoria/consultor na barra do Início, gráficos de outras telas, exportar, tempo real.
- Capacidade de meses passados pela equipe de então (hoje, como em todo o app, é a equipe de hoje).

## Decisões que tomei (o Diego confere)

1. **Ocupação continua sendo a do app.** No protótipo, "Ocupação" era realizado ÷ capacidade até hoje. No app,
   Ocupação do Mês atual é reservado ÷ capacidade (o número de Usuários e Consultorias, e o que escolhe o consultor do
   próximo cliente); mês passado e período são "Utilização" (realizado ÷ capacidade). Mantive o do app, para o Início
   não dizer 120% onde Usuários diz 95%. O gráfico "Realizado × capacidade" mostra a utilização mês a mês.
2. **História da situação dos clientes**, refeita a partir do histórico de eventos, para comparar clientes, aguardando
   e ocupação com o período anterior. Com ela, num mês passado o cartão conta os clientes **no fim daquele mês** (hoje
   diz "hoje").
3. **Período anterior:** Mês → os mesmos dias do mês anterior; período que começa em 1º de janeiro → as mesmas datas do
   ano anterior; o resto → os N dias logo antes. Tudo até hoje no máximo.
4. **Ocupação por unidade com no máximo 12 barras** (6 mais ocupados + 6 com mais folga, "… N no meio") e sem o
   "também no período anterior" do protótipo.
5. **Saem do Início** "Consultores nos extremos", "Clientes esperando há mais tempo" e "Meus clientes no mês" — o
   conteúdo está nos gráficos novos e nas tabelas deles. A tabela da fila mostra os 15 que esperam há mais tempo e um
   link por etapa abre Clientes filtrado (Clientes passa a aceitar `?situacao=`).
6. **"Até ter consultor"** conta da chegada do cliente à consultoria até ele ganhar consultor, também para a central
   (não do cadastro).
7. **Risco:** "sem check-in" é exatamente o cartão de Clientes; o ritmo usa as horas do cliente **na consultoria atual,
   de todos os consultores dela** — o consultor vê o % do cliente dele mesmo quando um colega lançou horas (só o %,
   nunca nome nem lançamento).
8. **Último check-in do cliente** = o último na consultoria atual, de qualquer consultor (só a data). A barra da
   previsão segue a regra da lista de Clientes (só as horas que quem olha enxerga).
9. **Projeção e selos de ritmo só a partir do dia 7** do mês (antes disso, a projeção do dia 2 diria "vai fechar com
   0 h"); "vai passar" acima de 105%, "abaixo do ritmo" abaixo de 70%; "atenção" no último check-in a partir de 14 dias.
10. **Cliente arquivado** não tem a faixa "Hoje" (fica "Arquivado em …"); os gráficos do mês continuam.
11. **Os cartões de números perdem as linhas de detalhe** (capacidade, reservado, a distribuir/sem consultor) para a
    linha de variação, como no protótipo. Capacidade fica na leitura do gráfico de meses; a distribuir e sem consultor,
    na fila; o reservado em horas, em Usuários.
12. **A visão em tabela de um gráfico não pagina** (são os mesmos ≤ 31 pontos); as tabelas de clientes (fila, risco,
    horas por cliente) paginam no banco ou levam a Clientes.
13. **Check-in no Início do consultor** é um botão de ícone em cada barra (nome no `aria-label` e no `title`) e o botão
    completo na tabela.
14. **Dados de exemplo para conferir no navegador:** `scripts/exemplo-local.mjs --historico` grava, pela sessão da Ana
    e do Bruno, 6 meses de check-ins nos clientes da Consultoria Exemplo, só se ela ainda não tiver nenhum check-in.
    Só acrescenta; nunca apaga nem mexe em outra consultoria.
15. **SVG próprio, sem biblioteca** (recharts mediu 138 KB gzip) e o texto do SVG medido na largura real.

## Decisões da construção

- O tom da Ocupação segue o valor atual, como no protótipo: ir de 105% para 95% aparece como "ruim" (Task 5).
- O separador do ranking de ocupação diz só "… N no meio" até a contagem `sem_capacidade` do banco (Task 3) chegar.
