# Gráficos no Início e na aba Geral do cliente — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** o Início vira um painel de gráficos com pouco texto (4 cartões com variação contra o período anterior;
realizado × capacidade por mês; fila de clientes; ocupação por consultoria ou consultor; clientes em risco; horas por
cliente; check-ins por semana), e a aba Geral do cliente ganha a ficha compacta, a faixa "Hoje" e os gráficos do mês,
como no protótipo aprovado (`docs/prototipo/graficos-poc.html`, "Pode construir", 17/11). Entram junto M4, M6, R6, R7 e
a parte do Início do G2 da auditoria.

**Arquitetura:** no banco, uma história interna da situação de cada cliente (`private.situacoes_dos_clientes`, mantida
por gatilho e refeita na migração a partir de `cliente_eventos`) permite contar clientes, aguardando e reservado numa
data passada; dois resumos novos de check-ins (por cliente e mês; por consultoria e dia) mantêm as contas de 2 anos
rápidas. O Início chama 6 funções em paralelo (`painel_do_inicio` refeita + `comparacao_do_inicio`,
`fila_de_clientes`, `clientes_em_risco`, `horas_por_cliente`, `checkins_por_semana`), todas com o mesmo recorte
(`private.recorte_do_inicio`) e as mesmas regras de período (`private.periodo_do_inicio`, `private.periodo_anterior`).
O cliente ganha `hoje_do_cliente` e `horas_do_cliente_por_dia`, e `horas_do_cliente_por_mes` ganha `p_ate`. Na tela,
componentes de gráfico próprios em SVG (`src/components/graficos/`), desenhados na largura real do cartão, com dica no
mouse, no toque e no teclado e visão em tabela.

**Tecnologias:** Postgres 17 + RLS, pgTAP, React 19, Tailwind 4, lucide-react. **Nenhuma dependência nova**
(recharts@3.11.0 foi medido: 138 KB gzip só para um gráfico; ver o design).

**Spec:** `docs/superpowers/specs/2026-11-17-graficos-do-inicio-e-do-cliente-design.md` (aprovado pelo Diego em 17/11
como protótipo; as decisões próprias estão no fim do design e o Diego confere). Base: `docs/superpowers/specs/
2026-11-16-painel-do-inicio-design.md`, auditoria `docs/auditoria-ux/relatorio.html`.

**Ordem:** T1 → T2 → T3 (banco, uma de cada vez: `test:db` não roda em paralelo). A T4 (componentes, sem banco) pode ir
junto da T1–T3. T5 depende de T2 + T4; T6 depende de T3 + T4.

## Restrições globais

- Dados do Diego: nunca `supabase db reset`, nunca apagar o que os testes não criaram, nunca limpar o Storage; migração
  com `npx supabase migration new <nome> < /dev/null` + `npx supabase migration up` (se ela recusar por causa de
  migração mais antiga ainda não aplicada, de outra frente, conferir que é independente e usar
  `npx supabase migration up --include-all`); nunca editar migração aplicada; antes de cada migração, `docker exec
  supabase_db_consultoria pg_dump -U postgres --data-only --schema=public --schema=auth --schema=private >
  supabase/.copias/$(date +%F)-antes-<nome>.sql` (conferir que o arquivo não está vazio). API local
  `http://127.0.0.1:54521`; nunca as portas 54321/54721 (outros projetos). Nenhuma Edge Function nova.
- As migrações **só acrescentam**: tabelas novas, preenchimento das tabelas novas, funções. Nenhuma linha de
  `clientes`, `checkins`, `cliente_eventos` ou de outra tabela existente muda. Preenchimento de tabela nova e criação do
  gatilho na mesma transação (`begin; … commit;` explícitos), com a tabela de origem travada para escrita
  (`lock table … in share row exclusive mode`), como `20261117014923_painel_resumo_sem_buraco.sql`.
- Funções redefinidas: `create or replace` a partir do **corpo mais novo**, com o comentário "Mesmo corpo de
  <migração>; muda só …" e os grants repetidos no fim: `painel_do_inicio` e `private.ocupacao_do_periodo` em
  `20261117184913_painel_periodo_bordas_separadas.sql`; `private.checkins_resumir_horas` em
  `20261117173317_painel_periodo_resumo_por_consultor.sql` (com `private.somar_horas_consultor_mes` de
  `20261117181830_painel_resumo_por_consultor_sem_orfao.sql`); `horas_do_cliente_por_mes` em
  `20261116184025_graficos_do_cliente.sql` (sai e volta com `p_ate`: `drop` + `create`, os grants de novo).
- Recortes: os de hoje (`painel_do_inicio`, `eventos_do_cliente`, `checklist_do_cliente`, `vejo_quadro`,
  `vejo_cliente`). Uma consultoria nunca vê número, nome ou hora de outra em função nenhuma; quem não alcança recebe
  `sem_recorte`/`sem_permissao`/nulo sem saber se a coisa existe. Funções novas: `security definer` com
  `search_path = ''` e `plan_cache_mode = force_custom_plan` (as do Início e `hoje_do_cliente`) ou `security invoker`
  (as de gráfico do cliente, como as que já existem); `revoke all … from public, anon` e `grant execute … to
  authenticated`; as `private.*` sem grant (menos `private.projecao_do_mes`, pura, que a função invoker usa).
- Tabelas novas ficam em `private` (o PostgREST não publica), RLS ligado, `revoke all` de `public, anon, authenticated,
  service_role`, teste no pgTAP — como `private.checkins_horas_consultor_mes`.
- Escala: volume do `painel_volume.test.sql` e os limites da tabela "Desempenho" do design; sem Seq Scan em `checkins`;
  toda coluna de filtro, ordem e junção com índice; listas de clientes paginadas no banco (15) ou com limite fixo.
- Tela: molde de tela do menu (barra → cartões → conteúdo), Padrão Hub, botões animados (`Button`), tipografia da
  escala (`tabular-nums` nos números em coluna; texto de SVG só `fontSize={TAMANHO.legenda}` ou maior), contraste
  mínimo 4,5:1 nos textos (`src/lib/contraste.test.js`), cores só por token (`--grafico-*`, nada de hex nos `.jsx`),
  campos só de `src/components/campos/`, largura toda, claro e escuro (classe `.dark`), 360 px sem rolar para o lado,
  44 px de toque (`pointer-coarse:`). Os testes de guarda continuam verdes (`camposNativos`, `button.test`,
  `formulariosEnvio`, `tipografiaVarredura`, `tamanhoNoCelular`, `contraste`, `alvosDeToque`,
  `navegacaoDoMesVarredura`, `menu.test`, `Trilho.test`).
- Node 26; vitest só com `--project` (`npm test` = unidade; `npm run test:integracao`; um arquivo:
  `npx vitest run --project unidade <arquivo>`); nunca dois `test:db` juntos e nunca `test:integracao` durante um
  `test:db`; nunca `git stash`, trocar de branch ou push. Outros agentes trabalham no mesmo checkout (lotes B e C da
  auditoria mexem em `src/pages/Cliente*.jsx`, `src/pages/Clientes*.jsx`, `src/components/comum/*`,
  `BotaoCheckin`): antes de editar um arquivo compartilhado, `git status --short <arquivo>`; se ele tem mudança de
  outro agente sem commit, parar e relatar (NEEDS_CONTEXT). `git add` só com os arquivos da tarefa (nunca `-A`); com
  `index.lock`, esperar alguns segundos e tentar de novo.

## Review Focus

- **Uma consultoria vendo números de outra numa função nova:** a fila com nomes e consultorias, o risco com o nome do
  consultor, `horas_por_cliente` com o `sub`, a comparação somando check-ins de outra consultoria, a história contando
  um cliente que já foi da A para a gestão da B, e no cliente: o último check-in, os dias com check-in, o quadro e o
  check-list de uma consultoria anterior, a reunião de um colega sem convite. Conferir que todas usam
  `private.recorte_do_inicio()` e que o texto do JSON da gestão da A não contém nenhum id ou nome da B (o teste faz
  isso).
- **Comparação com o período anterior errada nas viradas:** 31/03 contra fevereiro, janeiro contra dezembro do ano
  anterior, 29/02, Este ano no dia 1º de janeiro, Personalizado que termina no futuro (o efetivo para em hoje) e mês
  passado inteiro. E a história: troca de consultor não pode contar como cliente novo; mudança de consultoria tira o
  cliente da A e põe na fila da B; arquivar e reativar no mesmo dia; duas mudanças na mesma transação (trechos de
  duração zero não contam); o preenchimento pelos eventos tem de dar exatamente o estado de agora.
- **Critério de risco marcando quase todo mundo:** a janela é de 30 dias corridos (não o mês), recém-atribuído (menos de
  30 dias com consultor) não entra, cliente sem consultor e arquivado não entram, o ritmo só soma horas da consultoria
  atual, e "sem check-in" tem de dar o mesmo número que o cartão "Sem check-in há 30 dias" de Clientes.
- **Gráfico ilegível a 360 px ou no escuro:** SVG com `viewBox` que encolhe o texto abaixo de 11 px, rótulos de 24 meses
  ou 105 semanas encavalados, nome longo empurrando a barra para fora, dica saindo da tela, tabela rolando a página
  para o lado, cor fixa em vez de token, âmbar e vermelho vizinhos sem ícone.
- **Funções lentas em 24 meses / 2 anos:** `horas_por_cliente` da central (tem de ler o resumo por cliente, não
  `checkins`), `checkins_por_semana` (resumo por dia), a comparação (a mesma conta do painel, outro período), a
  capacidade por mês de 3.000 consultores, e o custo dos gatilhos ao gravar check-in e mudar cliente.

---

### Task 1: Banco — história da situação dos clientes, resumos novos e ajudantes do Início

**Arquivos:** migração `historia_e_resumos_dos_graficos`; `supabase/tests/database/graficos_base.test.sql`.

**Interfaces — produz:**
- `private.situacoes_dos_clientes (id bigint generated always as identity primary key, cliente_id uuid not null
  references public.clientes on delete cascade, consultoria_id uuid, consultor_id uuid, horas_mes numeric(5,1) not
  null, de timestamptz not null, ate timestamptz, espera_desde timestamptz, entrou boolean not null default false,
  check (ate is null or ate >= de))`; único parcial `(cliente_id) where ate is null`; índices `(consultoria_id, de)`,
  `(consultor_id, de)`, `(de)`. Sem chave para consultorias e perfis (é um registro, como `cliente_eventos`).
- `private.situacoes_pelos_eventos(p_cliente uuid) returns table (consultoria_id uuid, consultor_id uuid, horas_mes
  numeric, de timestamptz, ate timestamptz, espera_desde timestamptz, entrou boolean)`: refaz os trechos de um cliente
  lendo `cliente_eventos` em ordem (`cadastrado` → previsão; `enviado`/`movido`/`devolvido` → consultoria e consultor
  do "para"; `consultor_*` → consultor; `previsao_ajustada` → horas; `arquivado`/`reativado`). Usada no preenchimento e
  no teste.
- `private.registrar_situacao_do_cliente()` + gatilho `clientes_situacao` (`after insert or update of consultoria_id,
  consultor_id, horas_mes, arquivado_em on public.clientes`, só quando algum deles mudou de fato): fecha o trecho
  aberto (`ate = now()`); se não arquivado, abre outro. `espera_desde`: no trecho sem consultor, o começo da espera
  naquela consultoria (passa adiante numa mudança de previsão); no trecho que ganha consultor, copia o da espera.
  `entrou = true` só quando o trecho anterior não tinha consultor (ou não existia) — troca de consultor e mudança de
  previsão abrem trecho com `entrou = false`.
- `private.checkins_horas_cliente_mes (cliente_id uuid references public.clientes on delete cascade, consultoria_id
  uuid references public.consultorias on delete cascade, mes date, segundos numeric not null default 0, primary key
  (cliente_id, consultoria_id, mes))`, índices `(consultoria_id, mes)` e `(mes)`.
- `private.checkins_por_dia (consultoria_id uuid references public.consultorias on delete cascade, dia date,
  quantidade int not null default 0, segundos numeric not null default 0, primary key (consultoria_id, dia))`, índice
  `(dia)`.
- `private.somar_horas_cliente_mes(p_cliente uuid, p_consultoria uuid, p_inicio timestamptz, p_segundos numeric)` e
  `private.somar_checkin_do_dia(p_consultoria uuid, p_inicio timestamptz, p_quantidade int, p_segundos numeric)`;
  `private.checkins_resumir_horas()` refeita chamando também as duas (mesmo gatilho, mesmas condições).
- `private.recorte_do_inicio() returns table (recorte text, consultoria uuid, eu uuid)`: a regra de hoje de
  `painel_do_inicio` (central → `tudo`; gerencia a consultoria atual → `consultoria`; liberado e papel pessoa →
  `pessoa`; senão `sem_recorte`, 42501).
- `private.periodo_do_inicio(p_mes date, p_de date, p_ate date) returns table (mes date, de date, ate date, ate_efetivo
  date, intervalo boolean, passado boolean)`: as recusas de hoje (`periodo_invalido`, 22023, com as mesmas frases no
  `detail`); `ate_efetivo = least(ate, hoje)`.
- `private.periodo_anterior(p_de date, p_ate_efetivo date, p_mes boolean) returns table (de date, ate date, forma
  text)`: as três regras do design; `forma` em `mes | mes_parcial | ano_anterior | dias_antes` (`mes` quando o anterior
  é o mês inteiro).
- `private.situacao_no_instante(p_recorte text, p_consultoria uuid, p_eu uuid, p_instante timestamptz) returns table
  (em_atendimento int, a_distribuir int, sem_consultor int, reservado numeric)`: trechos com `de <= p_instante and
  (ate is null or ate > p_instante)` no recorte (`tudo`: todos, a distribuir = sem consultoria; `consultoria`: a
  consultoria, reservado inclui os sem consultor, como `carteiras` do painel; `pessoa`: consultor = eu na consultoria).

- [ ] **Passo 1 — testes** (`graficos_base.test.sql`, com `set local role authenticated` + `request.jwt.claims` onde
  há papel):
  - "as tabelas novas são internas": RLS ligado e `table_privs_are` vazio para `anon`, `authenticated` e
    `service_role` nas três.
  - "gatilho, passo a passo": cadastrar sem consultoria (1 trecho aberto, a distribuir) → enviar (fecha; abre sem
    consultor com `espera_desde` = agora) → escolher consultor (`entrou`, `espera_desde` = o do envio) → trocar consultor
    (`entrou = false`) → mudar previsão (novo trecho, `entrou = false`, mesma consultoria e consultor) → mover de
    consultoria (trecho sem consultor na nova) → arquivar (fecha, nenhum aberto) → reativar (abre de novo). Mudar só o
    nome não abre trecho.
  - "duas mudanças na mesma transação": o trecho de duração zero existe e `situacao_no_instante` não o conta.
  - "os eventos refazem o que o gatilho gravou": para cada cliente criado no teste, `situacoes_pelos_eventos(id)` =
    linhas da tabela (sem o `id`).
  - "o preenchimento deixou exatamente o estado de agora": nenhum cliente não arquivado sem um trecho aberto igual a
    `(consultoria_id, consultor_id, horas_mes)` dele; nenhum arquivado com trecho aberto.
  - "situacao_no_instante(agora) bate com as telas": `tudo` = `indicadores_de_clientes()` (em atendimento, aguardando
    consultoria e consultor); `consultoria` = `aguardando_consultor`/`em_atendimento` da consultoria e reservado =
    soma das previsões não arquivadas da consultoria; `pessoa` = `meus_clientes`.
  - "situacao_no_instante num instante passado": com trechos de datas fixas (escritos como superusuário só no teste),
    conta quem estava aberto naquele instante e ignora o que abriu depois.
  - "resumos acompanham os check-ins": inserir aberto (nada), fechar (soma), mudar o início para outro mês e outro dia
    (sai de um, entra no outro), apagar (subtrai): `checkins_horas_cliente_mes` e `checkins_por_dia` = soma direta de
    `checkins`; o preenchimento bate com a soma direta de todos os check-ins fechados.
  - "periodo_anterior", um `is` por caso: (2026-11-01, 2026-11-17, mês) → 2026-10-01..2026-10-17 `mes_parcial`;
    (2026-10-01, 2026-10-31, mês) → 2026-09-01..2026-09-30 `mes`; (2026-03-01, 2026-03-31, mês) → 2026-02-01..2026-02-28
    `mes`; (2028-03-01, 2028-03-30, mês) → 2028-02-01..2028-02-29 `mes`; (2027-01-01, 2027-01-17, mês) →
    2026-12-01..2026-12-17 `mes_parcial`; (2026-01-01, 2026-11-17) → 2025-01-01..2025-11-17 `ano_anterior`;
    (2028-01-01, 2028-02-29) → 2027-01-01..2027-02-28 `ano_anterior`; (2026-01-01, 2026-01-01) → 2025-01-01..2025-01-01
    `ano_anterior`; (2026-10-19, 2026-11-17) → 2026-09-19..2026-10-18 `dias_antes`; (2025-06-15, 2026-11-17) → os 521
    dias antes; (2026-11-17, 2026-11-17) → 2026-11-16..2026-11-16 `dias_antes`.
  - "periodo_do_inicio": as quatro recusas com as frases de hoje; `ate_efetivo` = hoje num Personalizado até o fim do
    mês atual; Mês passado: `passado` e `ate_efetivo` = fim do mês.
  - "recorte_do_inicio": central `tudo`; admin e gestor `consultoria` com a consultoria atual; consultor liberado
    `pessoa`; consultor não liberado (aal1 de quem precisa do código) → 42501.
- [ ] **Passo 2:** `npm run test:db` e ver FALHAR.
- [ ] **Passo 3:** cópia, `npx supabase migration new historia_e_resumos_dos_graficos < /dev/null`, escrever, `npx
  supabase migration up`.
- [ ] **Passo 4:** `npm run test:db` (tudo verde, inclusive `painel_do_inicio`, `painel_volume`, `graficos`,
  `checkins`, `clientes`, `historico` sem mudar asserção); `npm test`.
- [ ] **Passo 5:** commit `Banco: história da situação dos clientes, resumos por cliente e por dia e ajudantes do
  Início`.

### Task 2: Banco — funções dos gráficos do Início

**Arquivos:** migração `graficos_do_inicio`; `supabase/tests/database/graficos_do_inicio.test.sql`;
`supabase/tests/database/painel_do_inicio.test.sql` (só as asserções das chaves que saem); `supabase/tests/database/
painel_volume.test.sql` (preencher as tabelas novas, ranking 12, tempos novos); `src/data/painel.js` (+
`src/data/painel.test.js`); `tests/integracao/graficosDoInicio.test.js`.

**Interfaces — produz** (todas com `(p_mes date default null, p_de date default null, p_ate date default null)`, menos
o risco; recorte por `private.recorte_do_inicio()`, período por `private.periodo_do_inicio()`):
- `private.capacidades_por_mes(p_consultoria uuid, p_ids uuid[], p_de_mes date, p_ate_mes date) returns table (mes date,
  capacidade numeric)`: por mês, a soma das capacidades de cada consultor arredondadas como em
  `capacidades_do_periodo`; o mês em andamento só até hoje.
- `private.risco_dos_clientes(p_consultoria uuid, p_consultor uuid, p_cliente uuid) returns table (cliente_id uuid,
  ultimo_checkin date, sem_checkin_dias int, horas_30 numeric, ritmo numeric, sem_checkin boolean, acima_do_ritmo
  boolean, nota numeric)`: só clientes com consultor e não arquivados; "sem check-in" com a regra de
  `indicadores_de_clientes` (consultor há mais de 30 dias e nenhum check-in começado nos últimos 30); ritmo = horas
  fechadas começadas nos últimos 30 dias na consultoria atual do cliente ÷ (`horas_mes` × 30 / 30,4), nulo com menos
  de 30 dias de consultor; acima = ritmo > 1,2; nota = maior entre dias ÷ 30 e ritmo ÷ 1,2. Lê os check-ins dos últimos
  30 dias uma vez (índice por consultoria e início; ou por consultor) e o último check-in só dos itens devolvidos.
- `public.painel_do_inicio(...)` refeita → `{ recorte, mes, intervalo, de, ate, ate_efetivo, passado, capacidade_ate,
  indicadores: { realizado, capacidade, capacidade_ate_hoje, reservado (só Mês atual), ocupacao,
  clientes_em_atendimento, aguardando, a_distribuir, sem_consultor, checkins (só pessoa) }, horas_por_mes: [{ mes,
  realizado, capacidade, no_periodo, parcial }], ranking: [{ id, nome, ocupacao, capacidade, realizado, reservado,
  pessoas (tudo), visivel (consultoria) }], ranking_resumo: { total, acima, folga, no_meio } }`. Clientes e aguardando
  no fim do período efetivo (agora no período atual; pela história num mês ou período passado). Ranking: todos com até
  12; com mais, os 6 de maior taxa e os 6 de menor (`no_meio` = os de fora). Saem `esperando`, `extremos`,
  `meus_clientes`, `previsao_atual` e `clientes_ativos`/`clientes_novos`.
- `public.comparacao_do_inicio(...)` → `{ de, ate, forma, indicadores: { realizado, ocupacao, clientes_em_atendimento,
  aguardando, checkins } }` do período anterior ao efetivo. Ocupação: Mês atual = reservado no fim do anterior
  (história) ÷ capacidade do mês anterior; senão utilização do anterior (realizado ÷ capacidade, como no período).
- `public.fila_de_clientes(...)` → `{ a_distribuir: { total, media_dias, maior_dias } | null, sem_consultor: { total,
  media_dias, maior_dias }, em_atendimento: { total, novos_no_periodo }, receberam_consultor, espera_media_dias,
  pontos: [{ id, nome, situacao ('a_distribuir' | 'sem_consultor'), dias, consultoria_nome }] (até 40, quem espera há
  mais tempo primeiro), total_esperando }`. Dias em dias de calendário de São Paulo; `pessoa` → `sem_recorte`.
- `public.clientes_em_risco(p_pagina int default 1)` → `{ itens: [{ id, nome, consultor_nome (consultoria, pela regra
  de vejo_perfil) | consultoria_nome (tudo) | nada (pessoa), ultimo_checkin, sem_checkin_dias, ritmo, horas_30,
  horas_mes, sem_checkin, acima_do_ritmo }], total, sem_checkin, acima_do_ritmo }`, 15 por página, por nota, nome, id.
- `public.horas_por_cliente(p_mes date default null, p_de date default null, p_ate date default null, p_pagina int
  default null)` → sem página: `{ itens: [{ id, nome, sub, horas, previsto }] (10), resto: { clientes, horas },
  total_horas, total_clientes, participacao_3, participacao_10 }`; com página: `{ itens (15), total }`. Central e
  gestão: clientes com horas no período (resumo por cliente nos meses inteiros + bordas), `sub` = consultoria (tudo) ou
  consultor visível (consultoria); consultor: todos os clientes não arquivados dele, com 0 h inclusive, só as horas
  dele, `sub` nulo. `previsto` = `horas_mes` no Mês; no período, `round(horas_mes × dias do efetivo / 30,4, 1)`.
- `public.checkins_por_semana(...)` → `{ semanas: [{ semana, checkins, horas, no_periodo, parcial }], media, pico: {
  semana, checkins } | null }`: semanas de segunda a domingo que tocam o período efetivo, no mínimo 8 (começa antes se
  faltar); `media` só das semanas inteiras e do período; central e gestão pelo resumo por dia; consultor pelos
  check-ins dele.
- `src/data/painel.js`: `argumentosDoPeriodo(periodo)` (o mês ou `{ de, ate }`, como hoje), `painelDoInicio(periodo)`,
  `comparacaoDoInicio(periodo)`, `filaDeClientes(periodo)`, `clientesEmRisco(pagina = 1)`, `horasPorCliente(periodo,
  pagina = null)`, `checkinsPorSemana(periodo)`; todas devolvem o JSON do banco como está (números do PostgREST
  viram `Number` onde vierem como texto).

- [ ] **Passo 1 — testes:**
  - pgTAP `graficos_do_inicio.test.sql` (duas consultorias A e B, central, admin e gestor de A, dois consultores de A,
    um de B, clientes e check-ins com datas fixas relativas a hoje):
    - "recorte igual em todas": para cada uma das 6 funções, o texto do JSON da gestão da A não contém nenhum id ou nome
      de cliente, consultor ou consultoria da B; o consultor só vê os dele; consultor não liberado → 42501;
      `fila_de_clientes` do consultor → 42501.
    - "painel: capacidade de cada mês = soma de `capacidades_do_periodo` daquele mês (até hoje no mês em andamento) e
      `parcial` só no mês em andamento".
    - "painel: com 14 consultores, ranking traz 12 (6 + 6) e `ranking_resumo` conta os 14 (acima, folga, no_meio = 2)".
    - "painel: clientes em atendimento de um mês passado = os que tinham consultor no fim daquele mês; no mês atual =
      `indicadores_de_clientes`".
    - "comparação: Mês atual compara 1º até hoje com os mesmos dias do mês anterior (realizado direto dos check-ins;
      clientes, aguardando e reservado pela história); Este ano contra as mesmas datas do ano anterior; Personalizado
      até o fim do mês = efetivo até hoje; período inválido com as mesmas frases do painel".
    - "fila: contagens de hoje iguais às de `indicadores_de_clientes`; média e maior espera; pontos em ordem e no máximo
      40; `receberam_consultor` e `espera_media_dias` do período pela história; troca de consultor não conta".
    - "risco: `sem_checkin` = `sem_checkin_30_dias` de `indicadores_de_clientes` (gestão e consultor); 29 dias com
      consultor não entra; ritmo 121% entra e 119% não; check-in antigo de outra consultoria não entra no ritmo nem no
      último check-in; arquivado e sem consultor não entram; página 2 traz os seguintes".
    - "horas por cliente: os 10 + o resto = total direto dos check-ins; participações; consultor vê os clientes com
      0 h e só as horas dele; previsto no Mês e proporcional no período; página 2 com os 15 seguintes".
    - "semanas: no mínimo 8; a semana de hoje é `parcial`; soma das semanas = contagem direta; média só das semanas
      inteiras do período; consultor só os dele".
  - `painel_do_inicio.test.sql` (770 linhas; hoje ~50 asserções tocam as chaves que mudam): cada asserção de
    `esperando`, `extremos` e `meus_clientes` vai para o teste da função que herdou o conteúdo (fila, ocupação por
    unidade, horas por cliente) com o mesmo cenário; as de `clientes_ativos` viram `clientes_em_atendimento` (agora só
    com consultor) e as de `clientes_novos` e `previsao_atual` saem (o reservado continua em `indicadores.reservado`);
    as de `ranking` mudam só no limite (12, com 6 + 6). Entra "as chaves que saíram não vêm mais". Nenhuma outra
    asserção muda; a lista do que mudou vai na mensagem do commit.
  - `painel_volume.test.sql`: preenche `private.checkins_horas_cliente_mes`, `private.checkins_por_dia` e
    `private.situacoes_dos_clientes` do volume (como já faz com o resumo por consultor); "a central conta os 50.000
    clientes" passa a conferir `clientes_em_atendimento` = os clientes com consultor do volume; "ranking limitado a 12";
    `performs_within` de cada função e papel com os limites do design; "horas por cliente e semanas da central em 2
    anos sem Seq Scan em checkins" (EXPLAIN).
  - `src/data/painel.test.js`: "cada função manda `p_mes` ou `p_de`/`p_ate` e `p_pagina` com esses nomes" (mock de
    `supabase.rpc`).
  - Integração `graficosDoInicio.test.js` (pelo `src/data/painel.js`, como `eventosDoCliente.test.js`): "o admin da A
    não recebe nada da B em nenhuma função"; "o consultor recebe `sem_recorte` na fila"; "a central recebe as duas".
- [ ] **Passo 2:** `npm run test:db` e `npx vitest run --project unidade src/data/painel.test.js`: ver FALHAR.
- [ ] **Passo 3:** cópia, `npx supabase migration new graficos_do_inicio < /dev/null`, escrever, `npx supabase
  migration up`.
- [ ] **Passo 4:** `npm run test:db` (os tempos do volume no relatório; se um limite não fechar depois de ajustar
  índice e consulta, parar e relatar com o tempo medido); depois `npx vitest run --project integracao
  tests/integracao/graficosDoInicio.test.js`; `npm test` (a tela do Início ainda lê as chaves antigas: os testes dela
  usam mock e seguem verdes até a T5).
- [ ] **Passo 5:** commit `Banco: funções dos gráficos do Início`.

### Task 3: Banco — faixa "Hoje" e horas por dia do cliente

**Arquivos:** migração `graficos_do_cliente_hoje`; `supabase/tests/database/graficos_do_cliente.test.sql` (com os
tempos no fim); `src/data/clientes.js` (+ `src/data/clientes.test.js`); `tests/integracao/graficosDoCliente.test.js`.

**Interfaces — produz:**
- `private.projecao_do_mes(p_realizado numeric, p_dia int, p_dias_no_mes int) returns numeric` (`immutable`): nulo antes
  do dia 7; senão `round(p_realizado / p_dia * p_dias_no_mes, 1)`. `grant execute … to authenticated` (é pura).
- `public.hoje_do_cliente(p_cliente uuid) returns jsonb` (definer; não liberado → `sem_permissao`; quem não vê o
  cliente → nulo) → `{ arquivado_em, previsao: { horas_mes, realizado, dia, dias_no_mes, projecao, ritmo ('acima' |
  'abaixo' | 'no_ritmo' | null) }, checkin: { ultimo, dias_sem, situacao ('em_dia' | 'atencao' | 'em_risco' | null),
  dias_com_checkin: [date] }, reuniao: { id, inicio, titulo, com_meet } | null, quadro: { id, cartoes, atrasados,
  sem_responsavel } | null, checklist: { modelo_nome, tarefas, feitas, atrasadas, proxima: { titulo, vence_em } | null,
  etapas: [{ id, nome, tarefas, feitas, atrasadas }] } | null }`.
  - `previsao.realizado`: check-ins fechados do mês atual que quem chama enxerga (a regra de `realizado_no_mes` e da
    lista de Clientes); `ritmo`: projeção > 105% → `acima`, < 70% → `abaixo`, senão `no_ritmo`; nulo sem projeção.
  - `checkin`: último check-in do cliente **na consultoria atual dele** (central: qualquer), só a data; dias com
    check-in nos últimos 30; `situacao`: `em_risco` por `private.risco_dos_clientes(…, p_cliente)`, `atencao` de 14 a 29
    dias, `em_dia` abaixo de 14; nulo sem consultor.
  - `reuniao`: o primeiro evento futuro do cliente que a pessoa vê (o filtro `visiveis` de `eventos_do_cliente`).
  - `quadro`: o quadro do cliente na consultoria atual, se existir e `vejo_quadro`; as contas de `indicadores_do_quadro`
    sem filtros. **Nunca cria quadro.**
  - `checklist`: o aberto da consultoria atual (a regra de `checklist_do_cliente`); atrasada = não feita e vencida antes
    de hoje; próxima = a de `checklist_do_cliente`.
- `public.horas_do_cliente_por_dia(p_cliente uuid, p_mes date default null) returns jsonb` (invoker: o RLS de
  `checkins` decide) → `{ mes, dias: [{ dia, horas, acumulado }], realizado, previsao, projecao, dias_no_mes }`: no mês
  atual, os dias até hoje e `projecao` por `private.projecao_do_mes`; no passado, todos os dias e `projecao` nula.
- `public.horas_do_cliente_por_mes(p_cliente uuid, p_meses int default 6, p_ate date default null) returns table (mes
  date, realizado numeric)`: o mesmo corpo, com o último mês = o de `p_ate` (nulo ou depois do atual = o atual).
- `src/data/clientes.js`: `hojeDoCliente(clienteId)`, `horasPorDia(clienteId, mes)` e `horasPorMes(clienteId, ate =
  null)` (manda `p_ate`).

- [ ] **Passo 1 — testes:**
  - pgTAP `graficos_do_cliente.test.sql`:
    - "hoje: quem não vê o cliente recebe nulo (gestão da B, consultor de outro cliente); não liberado →
      `sem_permissao`".
    - "previsão: `realizado` = `realizado_no_mes` do cliente para a gestão, o consultor e a central;
      `projecao_do_mes(10, 6, 30)` nula, `(10, 7, 30)` = 42,9; ritmo acima/abaixo/no ritmo nos limites 105% e 70%".
    - "último check-in: um check-in da A não aparece para a gestão da B depois que o cliente mudou; `dias_com_checkin`
      só dos últimos 30 dias; `situacao` = `em_risco` quando `risco_dos_clientes` diz `sem_checkin`".
    - "reunião: a do consultor e a em que ele é convidado aparecem; a de um colega sem convite não; a passada não".
    - "quadro: = `indicadores_do_quadro(id)`; sem quadro → nulo, e o número de quadros não muda".
    - "check-list: tarefas e feitas = `checklist_do_cliente`; atrasadas por etapa; sem modelo → nulo".
    - "arquivado: `arquivado_em` preenchido e `checkin.situacao` nula".
    - "por dia: dias até hoje no mês atual e todos num mês passado; acumulado; o consultor soma só os dele (RLS);
      projeção só no mês atual".
    - "por mês: `p_ate` escolhe o último mês; nulo e futuro = o atual; a chamada com 2 argumentos continua valendo".
    - Tempos (no fim, com rollback): cliente com 5.000 check-ins, 1.000 cartões, 500 tarefas e 1.000 eventos →
      `hoje_do_cliente` ≤ 50 ms, `horas_do_cliente_por_dia` ≤ 30 ms, `horas_do_cliente_por_mes(…, 24)` ≤ 50 ms.
  - `graficos.test.sql` passa **sem mudar nada**.
  - `src/data/clientes.test.js`: "`horasPorMes(id, '2026-09-01')` manda `p_ate`; `horasPorDia` e `hojeDoCliente`
    mandam os nomes certos".
  - Integração `graficosDoCliente.test.js`: "cliente que passou da A para a B: a gestão da B não vê check-in, quadro nem
    check-list da A em `hojeDoCliente`"; "o consultor vê a reunião em que foi convidado".
- [ ] **Passo 2:** `npm run test:db` e o teste de `src/data`: ver FALHAR.
- [ ] **Passo 3:** cópia, `npx supabase migration new graficos_do_cliente_hoje < /dev/null`, escrever, `npx supabase
  migration up`.
- [ ] **Passo 4:** `npm run test:db`; depois `npx vitest run --project integracao tests/integracao/
  graficosDoCliente.test.js`; `npm test`.
- [ ] **Passo 5:** commit `Banco: faixa Hoje e horas por dia do cliente`.

### Task 4: Componentes de gráfico, cores e variação nos cartões (só tela)

**Arquivos:** `src/components/graficos/` — `useLargura.js`, `escala.js`, `Dica.jsx`, `Legenda.jsx`, `Leitura.jsx`,
`CartaoDeGrafico.jsx`, `TabelaDoGrafico.jsx`, `GraficoDeColunas.jsx`, `GraficoDeLinha.jsx`, `BarrasHorizontais.jsx`,
`MiniBarra.jsx`, `Medidor.jsx`, `BarraSegmentada.jsx`, `DiasComCheckin.jsx` (+ um `.test.jsx`/`.test.js` por arquivo
com lógica); `src/index.css` (tokens); `src/lib/contraste.test.js`; `src/lib/variacao.js` (+ teste);
`src/lib/frasesDosGraficos.js` (+ teste); `src/lib/periodo.js` (+ teste); `src/components/comum/CartoesDeNumeros.jsx`
(+ teste); `CLAUDE.md` (seção nova "Gráficos").

**Interfaces — produz:**
- Tokens em `:root` e `.dark` + `@theme`: `--grafico-serie`, `--grafico-lavado`, `--grafico-acima`, `--grafico-folga`,
  `--grafico-ref`, `--grafico-grade`, `--grafico-trilha`, `--grafico-neutro`, `--grafico-fila-1..3` (valores do design;
  claro `#2563eb / #dc2626 / #b45309 / #64748b`, escuro `#3b82f6 / #f05252 / #d97706 / #94a0b8`).
- `useLargura(ref) → number` (`LARGURA_PADRAO = 640` sem `ResizeObserver`).
- `escala.js`: `escalaBonita(maximo, partes = 4, inteiro = false) → { topo, marcas }`, `passoDosRotulos(n, largura,
  minimo = 44) → number`, `formatarEixo(valor, unidade)` ("10 mil" a partir de 10.000).
- Dica: `type Dica = { titulo: string, linhas: [{ valor: string, rotulo?: string, cor?: string, tracejado?: boolean }] }`;
  `useDica() → { dica, mostrar(dica, x, y), esconder() }`; `<Dica estado={…} />` (fixa, dentro da tela com 8 px de
  margem, Esc fecha, texto só como texto).
- `<Leitura partes={[texto | { forte: texto }]} />` e `<Legenda itens={[{ forma: 'quadrado' | 'linha' | 'tracejado' |
  'faixa' | 'marca', cor, texto }]} />`.
- `<CartaoDeGrafico titulo leitura legenda tabela={{ rotulo, colunas, linhas }} estado ('carregando' | 'erro' | 'vazio'
  | 'pronto') vazio erro aoTentarDeNovo acoes children />`: botão "Ver em tabela"/"Ver gráfico" (`Button` ghost
  ícone, `aria-pressed`, o foco fica nele); altura mínima igual no carregando para não pular.
- `<TabelaDoGrafico rotulo colunas linhas />` (a `Tabela` do projeto, `semAcoes`, sem paginação).
- `<GraficoDeColunas itens={[{ chave, rotulo, valor, referencia?, esmaecido?, parcial?, rotuloNaColuna?, aria, dica }]}
  altura={210} unidade="h" linhaDeReferencia referenciaHorizontal={{ valor, rotulo }} rotuloAria />`.
- `<GraficoDeLinha rotulos series={[{ pontos: (number | null)[], area?, tracejada? }]} dicas altura={200} unidade
  referenciaHorizontal faixa={[inicio, fim]} marcas={[{ serie, i, texto, lado }]} rotuloAria />` (um alvo focável;
  ← → andam de ponto em ponto).
- `<BarrasHorizontais itens={[{ chave, nome, href?, sub?, valor, limite?, marca?, tom? ('serie' | 'folga'), partes?:
  [{ valor, tom: 'feita' | 'atrasada' | 'neutro' }], valorTexto, icone? ('alerta' | 'folga'), aria, dica, acao? }]}
  escalaMax marca100={{ valor, rotulo }} separador={{ depoisDe, texto }} rodape />`.
- `<MiniBarra valor limite maximo texto acima rotulo />`, `<Medidor fracao hoje acima />`, `<BarraSegmentada
  partes={[{ valor, tom }]} />`, `<DiasComCheckin dias={[{ dia, com, fimDeSemana }]} />`.
- `variacao(atual, anterior, { tipo: 'percentual' | 'pontos' | 'quantidade', subirEhBom = true, limiteDoBom = null,
  unidade = '' }) → { texto, tom: 'bom' | 'ruim' | 'neutro', paraLeitor }` (Ocupação usa `limiteDoBom: 1`).
- `rotuloDaComparacao({ de, ate, forma }) → string` ("vs set/26", "vs 1–17 de out.", "vs mesmo período de 2025",
  "vs 18/09 a 17/10").
- `frasesDosGraficos.js`: `fraseDosMeses`, `fraseDaFila`, `fraseDaOcupacao`, `fraseDoRisco`, `fraseDasHorasPorCliente`,
  `fraseDasSemanas`, `fraseDoMesDoCliente`, `fraseDosConsultores`, `fraseDosSeisMeses`, `fraseDasSemanasDoCliente`,
  `fraseDasEtapas`, cada uma recebendo o JSON do banco e devolvendo `partes` para `<Leitura>` (regras no design).
- `CartoesDeNumeros`: o cartão aceita `variacao: { texto, tom, paraLeitor, comparado } | null` (linha "▲ 12% vs out."
  com a seta e o tom; `null` = "—" carregando; ausente = sem linha) e o conteúdo alinha pelo topo (R6).
- `CLAUDE.md`, seção "Gráficos": componentes de `src/components/graficos/`, cores só por `--grafico-*`, SVG na largura
  real com texto `TAMANHO`, visão em tabela e dica no teclado em todo gráfico, leitura com números do banco, sem
  biblioteca de gráfico.

- [ ] **Passo 1 — testes:**
  - `useLargura.test.js`: "sem ResizeObserver devolve 640"; "com ele, devolve a largura medida e atualiza".
  - `escala.test.js`: "marcas redondas (0/500/1.000…)"; "passo dos rótulos deixa 44 px entre eles".
  - `GraficoDeColunas.test.jsx`: "uma coluna por item, no máximo 24 px, ponta arredondada"; "linha de referência com um
    ponto por item e o último trecho tracejado com ponto vazado quando `parcial`"; "todo `<text>` com `font-size` 11 e o
    SVG com `width` = largura medida (sem `viewBox` que estica)"; "coluna focável com `aria-label`, a dica aparece no
    foco e some com Esc"; "24 itens a 320 px: rótulos a cada N, sempre o último".
  - `GraficoDeLinha.test.jsx`: "→ e ← movem a cruz e a dica lista todas as séries do ponto"; "série tracejada começa no
    último ponto real"; "faixa de fundo nas posições dadas"; "rótulos de fim e de pico".
  - `BarrasHorizontais.test.jsx`: "acima do limite: trecho vermelho depois da marca, 2 px de vão e ícone de alerta";
    "folga: âmbar com ícone"; "separador '… 18 no meio'"; "ação no fim da linha"; "nome longo: inteiro no `title` e
    para o leitor de tela"; "variante empilhada: feitas, atrasadas, a fazer na ordem".
  - `CartaoDeGrafico.test.jsx`: "Ver em tabela troca pelo `TabelaDoGrafico` com os mesmos números e o foco fica no botão
    (`aria-pressed`)"; "carregando, vazio e erro com 'Tentar de novo' chamando `aoTentarDeNovo`"; "legenda só com 2 ou
    mais itens".
  - `Dica.test.jsx`: "um nome com `<b>` aparece como texto"; "perto da borda, a caixa fica dentro da tela".
  - `MiniBarra`, `Medidor`, `BarraSegmentada`, `DiasComCheckin`: "marca do limite/hoje na posição certa"; "parte zero
    não desenha"; "30 traços, os de fim de semana mais finos".
  - `variacao.test.js`: "Realizado +12%"; "anterior 0 → diferença em horas"; "pontos: 61% → 65% = ▲ 4 p.p. bom; 105% →
    110% ruim"; "Aguardando subir é ruim"; "quantidade com % só com anterior ≥ 5"; "igual = neutro"; "`paraLeitor`
    'subiu 12%'".
  - `periodo.test.js`: "`rotuloDaComparacao` nas quatro formas, inclusive dezembro do ano anterior".
  - `frasesDosGraficos.test.js`: uma por regra e variante do design (livres/acima; ninguém recebeu consultor; ninguém
    acima / todos entre 70% e 100%; nenhum em risco; 10 maiores / 3 maiores / total; pico; começo do mês; só um
    consultor; nenhuma atrasada).
  - `CartoesDeNumeros.test.jsx`: "linha de variação com a seta, o tom e o texto para o leitor"; "`null` mostra '—'";
    "conteúdo alinhado pelo topo"; os testes de hoje sem mudar.
  - `contraste.test.js`: "marcas dos gráficos (série, acima, folga, referência) ≥ 4,5:1 sobre o cartão nos dois
    temas"; "positivo e destrutivo como texto de variação ≥ 4,5:1".
- [ ] **Passo 2:** `npx vitest run --project unidade src/components/graficos src/lib src/components/comum`: ver FALHAR.
- [ ] **Passo 3:** escrever (desenho a partir das funções do protótipo: `escala`, `coluna`, `svgColunas`, `svgLinha`,
  `barrasHtml`, `cruzEm`, `mostrarDica`, agora como componentes React com tokens).
- [ ] **Passo 4:** `npm test` (todos os de guarda verdes), `npm run lint`, `npm run build`.
- [ ] **Passo 5:** commit `Gráficos: componentes, cores e variação nos cartões`.

### Task 5: Tela — Início com gráficos

**Arquivos:** `src/pages/Inicio.jsx` (+ `Inicio.test.jsx`); `src/components/inicio/` — `Indicadores.jsx` (refeito),
`GraficoDeMeses.jsx`, `FilaDeClientes.jsx`, `OcupacaoPorUnidade.jsx`, `ClientesEmRisco.jsx`, `HorasPorCliente.jsx`,
`CheckinsPorSemana.jsx` (+ testes); saem `HorasPorMes`, `RankingDeOcupacao`, `Extremos`, `ClientesEsperando`,
`MeusClientes` e os testes deles; `src/components/clientes/BotaoCheckin.jsx` (+ teste); `src/pages/Clientes.jsx` (+
teste); `scripts/exemplo-local.mjs`.

**Interfaces — produz:**
- `Inicio`: uma leitura por função (`useLeitura`, chave = período; o risco sem o período) e `meuCheckinAberto` para o
  consultor; ao trocar o período, os blocos ficam a 60% até chegar o novo; cada bloco com o próprio carregando/erro.
  Grade de 12 colunas (8+4, 6+6) como no design; ordem por papel da tabela "O que cada papel vê".
- `<Indicadores painel comparacao papel passado intervalo />`: os 4 cartões do papel com `variacao` (`variacao()` +
  `rotuloDaComparacao()`).
- `<GraficoDeMeses painel />` (R7: tudo zero → "Sem horas nos últimos N meses." e "Capacidade de <mês>: X h").
- `<FilaDeClientes fila recorte periodo />` (tabela com os 15 primeiros pontos e um link por etapa: "Ver os N
  aguardando consultoria" → `/clientes?situacao=distribuir`, "Ver os N aguardando consultor" →
  `/clientes?situacao=aguardando`; M6 no celular).
- `<OcupacaoPorUnidade painel />`, `<ClientesEmRisco recorte />` (lê `clientes_em_risco` sozinho, tabela paginada),
  `<HorasPorCliente periodo recorte aberto aoMudar />` (consultor: `BotaoCheckin compacto` na `acao` de cada barra e o
  completo na tabela), `<CheckinsPorSemana dados periodo />`.
- `BotaoCheckin`: prop `compacto` → só o ícone (`LogIn`/`LogOut`), nome no `aria-label` e no `title` ("Fazer check-in
  em Conecta Fibra"; "Fazer check-out de Conecta Fibra · 1 h 05").
- `Clientes`: lê `?situacao=` na abertura (só valores da lista do papel; outro valor = o padrão de hoje).
- `scripts/exemplo-local.mjs --historico`: entra como Ana e Bruno e grava check-ins fechados, em dias úteis dos
  últimos 6 meses, nos clientes deles da Consultoria Exemplo, **só se ela não tiver nenhum check-in**; pelas regras do
  banco (sessão do consultor); nunca apaga nada.

- [ ] **Passo 1 — testes:**
  - `Inicio.test.jsx`: "barra → cartões → gráficos (`cartoesAbaixoDaBarra('Indicadores do mês')`)"; "central: blocos
    na ordem meses, fila, ocupação por consultoria, risco, horas por cliente, semanas"; "gestão: fila sem 'Aguardando
    consultoria' e 'Ocupação por consultor'"; "consultor: meses, 'Meus clientes em risco', 'Horas nos meus clientes'
    com 'Fazer check-in em Cliente Meu', semanas, e nenhuma chamada à fila"; "trocar o período chama de novo painel,
    comparação, fila, horas e semanas, e não o risco"; "a variação aparece quando a comparação chega ('▲ 12%' e 'vs
    1–17 de out.'), '—' antes, e some se ela falhar"; "um bloco com erro mostra 'Tentar de novo' e os outros seguem";
    "período inválido não chama nenhuma função".
  - `GraficoDeMeses.test.jsx`: "capacidade por mês e o mês parcial tracejado com 'Capacidade até 17/11' na legenda";
    "R7: tudo zero mostra a frase e a capacidade em texto"; "leitura com livres e com acima".
  - `FilaDeClientes.test.jsx`: "3 etapas na central e 2 na gestão, com média e 'ninguém esperando'"; "tabela com 15 e
    'Ver os 23 aguardando consultor' para `/clientes?situacao=aguardando` (na central, também o link de
    `situacao=distribuir`)"; "M6: no celular a situação e a espera ficam embaixo do
    nome e as outras colunas somem (classes `sm:` / `max-sm:`)"; "a faixa de pontos tem nome que resume".
  - `OcupacaoPorUnidade.test.jsx`: "12 barras com '… 2 no meio'"; "leitura pelo `ranking_resumo`"; "links de hoje
    (Consultorias e Usuários; consultor não visível sem link)".
  - `ClientesEmRisco.test.jsx`: "6 linhas e 'Ver todos os 9' abre a tabela; Próxima pede a página 2 ao banco"; "vazio";
    "ritmo nulo mostra '—'".
  - `HorasPorCliente.test.jsx`: "10 barras e '+ 238 outros clientes · 1.204 h'"; "consultor: botão de check-in por
    linha; desabilitado com check-in aberto em outro cliente, ligado ao aviso"; "tabela paginada pede a página 2".
  - `CheckinsPorSemana.test.jsx`: "faixa do período, semana parcial tracejada, pico".
  - `BotaoCheckin.test.jsx`: "compacto: só o ícone, com o nome do cliente no `aria-label`"; os testes de hoje sem mudar.
  - `Clientes.test.jsx`: "`?situacao=aguardando` abre nessa situação; valor desconhecido usa o padrão do papel".
- [ ] **Passo 2:** `npx vitest run --project unidade src/pages/Inicio.test.jsx src/components/inicio
  src/components/clientes/BotaoCheckin.test.jsx src/pages/Clientes.test.jsx`: ver FALHAR.
- [ ] **Passo 3:** escrever; apagar os componentes antigos e seus testes.
- [ ] **Passo 4:** `npm test`, `npm run lint`, `npm run build`. **No navegador** (Playwright em contexto próprio,
  `http://[::1]:5173`, contas de exemplo; antes, `npm run exemplo:local -- --historico` se a Consultoria Exemplo não
  tiver check-ins): Central, Gestor e Consultor; Mês atual, mês passado, Últimos 90 dias, Este ano e um Personalizado de
  2 anos; 1440 e 390 px, claro e escuro; a 360 px `document.scrollingElement.scrollWidth <= innerWidth`; Tab até uma
  coluna mostra a dica e Esc fecha; ← → na linha das semanas; "Ver em tabela" e de volta; check-in pelo Início do
  consultor e check-out; nada gravado além do check-in de teste (desfeito com o check-out).
- [ ] **Passo 5:** commit `Início com gráficos: cartões com variação, fila, ocupação, risco, horas por cliente e
  semanas`.

### Task 6: Tela — aba Geral do cliente

**Arquivos:** `src/pages/Cliente.jsx` (+ `Cliente.test.jsx`); `src/components/clientes/FichaDoCliente.jsx`,
`HojeDoCliente.jsx`, `GraficosDoCliente.jsx` (refeito) (+ testes); `src/components/comum/NavegacaoDoMes.jsx` (+ teste);
`docs/superpowers/specs/2026-11-17-graficos-do-inicio-e-do-cliente-design.md` (seção "Decisões da construção" no fim).

**Interfaces — produz:**
- Aba Geral = `<FichaDoCliente cliente />` + `<HojeDoCliente cliente versao />` + `<GraficosDoCliente cliente versao />`
  (saem o "Resumo" e os blocos Empresa, Contato e Previsão no mês de `Cliente.jsx`).
- `<FichaDoCliente cliente />`: a linha do design e "Empresa e contato" (`aria-expanded`, `aria-controls`).
- `<HojeDoCliente cliente versao />`: lê `hojeDoCliente`; 5 cartões focáveis com dica; arquivado → "Arquivado em …";
  links "Marcar reunião" (`?aba=agenda`), "Abrir quadro" (`?aba=quadro`), "Aplicar modelo" (`?aba=checkins`, só com
  `pode_aplicar` de hoje — sem ele, só "Nenhum modelo aplicado").
- `<GraficosDoCliente cliente versao />`: título da seção "No mês" + `NavegacaoDoMes` (M4); burn-up
  (`horasPorDia`), horas por consultor, últimos 6 meses (`horasPorMes(id, mes)`), check-ins por semana e etapas (de
  `hojeDoCliente`, passadas pela página para não ler duas vezes).
- `NavegacaoDoMes`: prop `minimo` ("AAAA-MM-01"): Anterior desabilitado nesse mês (o do cadastro do cliente).

- [ ] **Passo 1 — testes:**
  - `Cliente.test.jsx`: "Geral: ficha compacta, faixa 'Hoje' e seção 'No mês' com a navegação dentro do título (M4)";
    "Empresa e contato só aparecem ao abrir a ficha"; "arquivado: sem a faixa, com 'Arquivado em 12/10/2026'"; "um
    check-out na página (`versao`) recarrega a faixa e os gráficos".
  - `FichaDoCliente.test.jsx`: "abre e fecha com CNPJ formatado e '—' no vazio"; "consultor desativado".
  - `HojeDoCliente.test.jsx`: "5 cartões com os números do banco"; "selos vai passar / abaixo do ritmo / no ritmo /
    sem selo no começo do mês"; "último check-in em dia / atenção / em risco"; "sem reunião → 'Marcar reunião' para
    `?aba=agenda`"; "sem quadro e sem modelo"; "dica no foco de cada cartão".
  - `GraficosDoCliente.test.jsx`: "trocar o mês chama de novo por dia, por consultor, 6 meses (com `p_ate`) e semanas,
    e não a faixa Hoje"; "Anterior desabilitado no mês do cadastro"; "leitura do burn-up no mês atual (projeção) e num
    mês passado (fechou com)"; "etapas só com modelo"; "vazios e erro com 'Tentar de novo'".
  - `NavegacaoDoMes.test.jsx`: "`minimo` desabilita o Anterior"; os testes de hoje sem mudar.
- [ ] **Passo 2:** `npx vitest run --project unidade src/pages/Cliente.test.jsx src/components/clientes
  src/components/comum/NavegacaoDoMes.test.jsx`: ver FALHAR.
- [ ] **Passo 3:** escrever.
- [ ] **Passo 4:** `npm test`, `npm run lint`, `npm run build`. **No navegador**: cliente com check-list, quadro e
  reunião (exemplo) como Gestor, Consultor e Central; mês atual e um mês passado; cliente arquivado; 1440 e 390 px, claro
  e escuro; 360 px sem rolar para o lado; foco nos cartões e nas colunas com dica; "Ver em tabela". Registrar no design,
  em "Decisões da construção", o que mudou do plano.
- [ ] **Passo 5:** commit `Cliente: aba Geral com ficha compacta, faixa Hoje e gráficos do mês`.
