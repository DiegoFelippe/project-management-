# Modelos de check-in e o novo check-in — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** modelos de check-in (etapas, tarefas com prazo em dias, obrigatória/opcional, "depende de") criados pela
Central ou pela gestão da consultoria; aplicados no cliente como cópia; seguidos pelo consultor como check-list (lista e
fluxograma) na aba Check-ins do cliente, com o que ele marca entrando no check-in aberto; e o andamento dos clientes numa
tabela. Item novo no trilho, "Check-ins", com as abas Andamento e Modelos.

**Arquitetura:** banco (`modelos`, `modelo_etapas`, `modelo_tarefas`, `modelo_dependencias`; `cliente_checklists`,
`checklist_etapas`, `checklist_tarefas`, `checklist_dependencias`; `checkin_tarefas`; tipos novos em `cliente_eventos`)
com RLS por papel; leitura e escrita por funções do banco (`security definer`, `search_path = ''`, pelo `liberado()`),
menos arquivar/reativar/apagar modelo (direto, pela regra); "sem ciclo" pela ordem (dependência só para tarefa anterior);
contadores no modelo e no check-list para a escala; tela em `src/components/modelos/` e `src/components/checkins/` no
Padrão Hub; fluxograma em SVG próprio (o desenho do protótipo), sem biblioteca nova.

**Tecnologias:** Postgres 17 + RLS, pgTAP, React 19, Tailwind 4, lucide-react (`ListChecks`), date-fns 3.6.0 (já no
projeto). Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md` (as 8 respostas do protótipo foram decididas
pelo controlador a partir da POC; o Diego pode mudar; as decisões próprias estão no fim do design). Protótipo (só
referência visual e de comportamento): `docs/prototipo/checkins-modelo-poc.html`.

## Restrições globais

- Dados do Diego: nunca `supabase db reset`, nunca apagar o que os testes não criaram, nunca limpar o Storage;
  migração com `npx supabase migration new <nome> < /dev/null` + `npx supabase migration up`; nunca editar migração
  aplicada; antes de cada migração, `docker exec supabase_db_consultoria pg_dump -U postgres --data-only
  --schema=public --schema=auth > supabase/.copias/2026-11-17-antes-<nome>.sql` (conferir o tamanho). API local
  `http://127.0.0.1:54521`; nunca as portas 54321/54721 (outros projetos). Nenhuma Edge Function nova.
- Quem faz o quê: a tabela do design. Modelos: a Central cria/edita/arquiva/apaga todos; o administrador e o gestor, só
  os da própria consultoria (duplicam os da Central); o consultor só lê. Check-list: a Central e a gestão aplicam,
  trocam, tiram e mudam o início; **só o consultor do cliente marca**; a Central só lê. Cliente arquivado: só leitura.
  Uma consultoria nunca vê modelos, check-lists, clientes ou nomes de outra.
- Toda tabela nova: RLS ligado, `GRANT` explícito só para `authenticated`, funções em `private`, pgTAP; funções novas
  passam por `private.liberado()`. Escrita nas tabelas novas só pelas funções do banco (sem `insert`/`update`/`delete`
  direto), menos `modelos.arquivado_em` e apagar modelo.
- **Sem ciclo:** dependência só para tarefa de posição menor no mesmo modelo, conferido no banco (`salvar_modelo`) e na
  tela (a mesma regra em `modelo.js`). A cópia mantém a ordem.
- **Aplicar copia:** o check-list não aponta para as tarefas do modelo; editar, arquivar ou apagar o modelo nunca muda um
  check-list.
- Escala: contagens, filtros e busca no banco; Modelos e Andamento em páginas de 15 vindas do banco (`{ itens, total }`);
  o check-list do cliente numa leitura só (até 500 tarefas, limite no banco); nada de chamada ao banco por tarefa ou por
  linha; índice em toda coluna de filtro, ordem e junção; teste de volume.
- "Hoje" é o dia em São Paulo (`(now() at time zone 'America/Sao_Paulo')::date`); prazo em dias corridos.
- Padrão Hub, botões animados, CRUD com confirmação dizendo o que some junto, tipografia da escala (texto de SVG por
  `TAMANHO` de `src/lib/tipografia.js`, nunca abaixo de 11 px), campos só de `src/components/campos/`, largura toda,
  claro e escuro, 360 px sem rolar para o lado, textos em português.
- Node 26; vitest só com `--project` (`npm test` = unidade, `npm run test:integracao`); nunca dois `test:db` juntos;
  nunca `git stash`, trocar de branch ou push. Outro agente pode estar commitando no mesmo checkout: `git add` só com os
  arquivos da tarefa (nunca `-A`); com `index.lock`, esperar alguns segundos e tentar de novo.

## Review Focus

- Dependência em ciclo ou para tarefa de depois: o banco recusa em criar, editar e duplicar; mover tarefa no editor para
  antes da sua dependência aparece como erro antes de salvar; nenhum check-list sai com seta "para a frente".
- Trocar o modelo com o check-in aberto (e o consultor marcando ao mesmo tempo): o que já foi marcado fica no check-in
  aberto (com o título), o check-list novo começa do zero, nada do novo entra no check-in por engano, marcar no
  encerrado é recusado e o check-out mostra as tarefas certas.
- Consultor trocado no meio do projeto: o antigo deixa de marcar na hora (mesmo com a aba aberta), o check-in aberto dele
  fecha com as tarefas, o novo continua de onde parou, "feita por" segue a regra de nome visível.
- Cliente movido para outra consultoria (ou devolvido à Central, ou consultoria arquivada): o check-list ativo é
  encerrado na mesma transação; a antiga perde tudo; a nova começa sem modelo e só vê os modelos dela e os da Central
  para ela; o Histórico não mostra nome de modelo de outra consultoria.
- Modelo de 500 tarefas: o editor digita sem travar e salva numa chamada; o check-list abre numa leitura; o fluxograma
  desenha rápido, rola dentro do cartão e a página não rola para o lado a 360 px; o Andamento com 5.000 clientes vai por
  índice.

---

### Task 1: Banco dos modelos

**Arquivos:** migração `modelos_de_checkin` (tabelas, RLS, gatilhos, índices, funções),
`supabase/tests/database/modelos.test.sql` (+ `modelos_volume.test.sql`), `src/data/modelos.js` (+ `modelos.test.js`),
`src/data/indicadores.js` (+ teste), `src/lib/erros.js` (códigos novos, `sobre: 'modelo'`), `tests/integracao/modelos.test.js`.

**Interfaces — produz:**
- `modelos(id, nome 2..80, descricao ≤400 null, tipo text null check (um dos 4 de private.tipos_de_consultoria_validos),
  da_central bool, consultoria_id uuid null references consultorias on delete restrict, criado_por references perfis on
  delete set null, criado_em, atualizado_em, arquivado_em null, etapas smallint, tarefas smallint, obrigatorias smallint,
  maior_prazo smallint, busca text generated (private.sem_acento(nome || ' ' || coalesce(descricao, ''))))`,
  `check (da_central or consultoria_id is not null)`.
- `modelo_etapas(id, modelo_id cascade, nome 1..60, posicao smallint, unique (modelo_id, posicao))`;
  `modelo_tarefas(id, modelo_id, etapa_id cascade, titulo 1..80, descricao ≤160 null, obrigatoria bool, prazo_dias
  smallint 0..365, posicao smallint, unique (modelo_id, posicao))`; `modelo_dependencias(tarefa_id, depende_de)` (pk dupla,
  ambas cascade, `check (tarefa_id <> depende_de)`).
- Índices: `modelos (consultoria_id, arquivado_em)`, `modelos (arquivado_em) where consultoria_id is null`,
  `modelos (tipo)`, `modelos using gin (busca gin_trgm_ops)`, `modelo_etapas (modelo_id, posicao)`,
  `modelo_tarefas (etapa_id, posicao)`, `modelo_dependencias (depende_de)`.
- `private.vejo_modelo(p_modelo uuid) returns boolean` (Central: todos; os outros: os da Central com consultoria nula ou
  igual à sua, e os da sua consultoria); `private.edito_modelo(p_modelo uuid) returns boolean` (Central: todos;
  `gerencio_consultoria`: os não-da-Central da própria consultoria).
- `public.salvar_modelo(p_id uuid, p_dados jsonb) returns uuid` — `p_id` nulo cria. `p_dados = { nome, descricao, tipo,
  para: 'todas' | <consultoria_id>, etapas: [{ nome, tarefas: [{ chave, titulo, descricao, obrigatoria, prazo_dias,
  depende_de: [chave] }] }] }`. `para` só vale para a Central (a gestão grava sempre a própria consultoria, sem
  `da_central`). Regrava etapas, tarefas e dependências numa transação, com posições 1..n e os contadores. Erros
  (P0001): `sem_permissao`, `modelo_arquivado`, `modelo_nome_curto`, `modelo_sem_tarefas`, `etapa_sem_nome`,
  `etapa_sem_tarefas`, `tarefa_sem_titulo`, `prazo_invalido`, `dependencia_invalida` (chave desconhecida, ela mesma ou
  tarefa que não vem antes), `modelo_grande_demais` (>50 etapas, >500 tarefas, >30 dependências numa tarefa),
  `consultoria_invalida`.
- `public.modelo_completo(p_modelo uuid) returns jsonb` → `{ id, nome, descricao, tipo, da_central, consultoria: { id,
  nome } | null, criado_por: { nome }, criado_em, atualizado_em, arquivado_em, pode_editar, pode_duplicar, etapas: [{ id,
  nome, posicao, tarefas: [{ id, titulo, descricao, obrigatoria, prazo_dias, posicao, depende_de: [id] }] }] }`; quem
  não vê: nulo.
- `public.modelos_da_lista(p_aba text default 'ativos', p_busca text default null, p_tipo text default null,
  p_consultoria uuid default null, p_pagina int default 1) returns jsonb` → `{ itens: [{ id, nome, descricao, tipo,
  da_central, consultoria: { id, nome } | null, criado_por: { nome }, criado_em, etapas, tarefas, obrigatorias,
  maior_prazo, clientes_usando, arquivado_em, pode_editar, pode_duplicar }], total }`, 15 por página, ordem por nome.
  `p_consultoria` só para a Central (os modelos que aquela consultoria vê). `clientes_usando` = 0 aqui (a Task 2 redefine).
- `public.indicadores_de_modelos(p_consultoria uuid default null) returns jsonb` → `{ recorte, ativos, da_central,
  da_consultoria, clientes_usando }` (`clientes_usando` = 0 até a Task 2), no molde de `indicadores_de_times`.
- Escrita direta: `update modelos set arquivado_em` (`grant update (arquivado_em)`, regra por `edito_modelo`) e `delete`
  (regra por `edito_modelo`). Nada mais tem grant de escrita.
- `src/data/modelos.js`: `listarModelos({ aba, busca, tipo, consultoriaId, pagina })` → `{ itens, total }`,
  `lerModelo(id)`, `salvarModelo(id, dados)` → `{ id, erro }`, `arquivarModelo(id)`, `reativarModelo(id)`,
  `apagarModelo(id)` → `{ erro }`; `src/data/indicadores.js`: `indicadoresDeModelos({ consultoriaId })`.

- [ ] **Passo 1:** pgTAP por papel: Central cria para todas e para uma consultoria; gestor e administrador criam e o
  banco grava a consultoria deles mesmo pedindo `'todas'`; consultor recebe `sem_permissao`; gestor não edita nem arquiva
  modelo da Central nem de outra consultoria, edita os dele; Central edita qualquer um; consultoria A não vê modelo de B
  nem o da Central só para B, vê os da Central para todas e para A; sessão não liberada não vê nada. Validação: cada
  código de erro acima, e depois de um erro o modelo continua exatamente como antes (transação); dependência para
  tarefa de depois e para ela mesma → `dependencia_invalida`; regravar acerta posições e contadores (maior prazo
  incluso). Lista: 15 por página com total, busca sem acento ("analise" acha "Análise"), tipo, aba Arquivados, filtro de
  consultoria da Central. Indicadores por recorte. `authenticated` não insere nem atualiza (fora `arquivado_em`) as
  tabelas; `anon` nada. Volume: 2.000 modelos e um de 500 tarefas — lista, indicadores e `modelo_completo` sem Seq Scan.
  Integração: salvar, ler, listar com paginação, arquivar, reativar, apagar e o erro traduzido.
  **Passo 2:** rodar e ver FALHAR. **Passo 3:** cópia, migração, implementar. **Passo 4:** `npm run test:db`,
  `npm test`, `npm run test:integracao`. **Passo 5:** commit `Banco dos modelos de check-in`.

### Task 2: Banco do check-list do cliente, da marcação e do check-in

**Arquivos:** migração `checklists_dos_clientes`, `supabase/tests/database/checklists.test.sql`
(+ `checklists_volume.test.sql`), `src/data/checklists.js` (+ teste), `src/data/checkins.js` (+ teste),
`src/data/clientes.js` (histórico com o modelo), `src/lib/erros.js` (`sobre: 'checklist'`; o texto do 23503 de cliente
passa a citar o modelo de check-in), `tests/integracao/checklists.test.js`.

**Interfaces — produz:**
- `cliente_checklists(id, cliente_id references clientes on delete restrict, consultoria_id references consultorias on
  delete restrict, modelo_id references modelos on delete set null, modelo_nome, inicio date, aplicado_por, aplicado_em,
  encerrado_em null, encerrado_por null, motivo text null check in ('trocado','tirado','cliente_movido'), tarefas,
  feitas, obrigatorias, obrigatorias_feitas, proximo_vencimento date null, modelo_busca text generated)`; único
  `(cliente_id) where encerrado_em is null`.
- `checklist_etapas(id, checklist_id cascade, nome, posicao)`; `checklist_tarefas(id, checklist_id cascade, etapa_id
  cascade, titulo, descricao, obrigatoria, prazo_dias, vence_em date, posicao, estado text default 'a_fazer' check in
  ('a_fazer','andamento','feita'), nota ≤500 null, feita_em null, feita_por references perfis on delete set null, origem
  uuid null)`; `checklist_dependencias(tarefa_id, depende_de)`.
- `checkin_tarefas(checkin_id references checkins on delete cascade, tarefa_id references checklist_tarefas on delete
  cascade, titulo, marcada_em, primary key (checkin_id, tarefa_id))`; leitura direta pela regra "quem vê o check-in"
  (os mesmos três ramos da regra de `checkins`); só `select`.
- `cliente_eventos`: tipos `'modelo_aplicado'`, `'modelo_trocado'`, `'modelo_tirado'` e a coluna `checklist_id uuid null
  references cliente_checklists on delete set null`.
- Índices: `cliente_checklists (consultoria_id, proximo_vencimento) where encerrado_em is null`,
  `(modelo_id) where encerrado_em is null`, `(cliente_id, aplicado_em desc)`, `using gin (modelo_busca gin_trgm_ops)`;
  `checklist_tarefas (checklist_id, posicao)`, `(checklist_id, vence_em) where estado <> 'feita'`, `(feita_por)`;
  `checklist_dependencias (depende_de)`; `checkin_tarefas (tarefa_id)`.
- `private.vejo_checklist(p_checklist uuid)`, `private.gerencio_checklist_do_cliente(p_cliente uuid)` (Central ou
  `gerencio_consultoria` da consultoria do cliente; cliente ativo com consultoria), `private.marco_no_checklist(p_checklist
  uuid)` (sou o consultor do cliente, cliente ativo, check-list ativo e da consultoria atual do cliente),
  `private.recontar_checklist(p_checklist uuid) returns void` (contadores e `proximo_vencimento`).
- `public.modelos_para_aplicar(p_cliente uuid, p_busca text default null, p_limite int default 20) returns jsonb` →
  `{ itens: [{ id, nome, tipo, da_central, etapas, tarefas, obrigatorias, maior_prazo, do_tipo_do_consultor }], total }`
  (não arquivados que a consultoria do cliente vê; os do tipo do consultor do cliente primeiro, depois por nome).
- `public.aplicar_modelo(p_cliente uuid, p_modelo uuid, p_inicio date) returns uuid` — trava o cliente, encerra o ativo
  (`'trocado'`), copia etapas/tarefas/dependências (`vence_em = p_inicio + prazo_dias`), reconta, registra
  `modelo_aplicado` ou `modelo_trocado`. Erros: `sem_permissao`, `cliente_arquivado`, `cliente_sem_consultoria`,
  `modelo_indisponivel`, `inicio_invalido` (nulo ou fora de [hoje − 2 anos, hoje + 1 ano]).
- `public.mudar_inicio_do_checklist(p_checklist uuid, p_inicio date) returns void` (recalcula `vence_em`, reconta);
  `public.tirar_modelo(p_checklist uuid) returns void` (encerra `'tirado'`, evento `modelo_tirado`).
- `public.checklist_do_cliente(p_cliente uuid) returns jsonb` → `{ pode_aplicar, pode_marcar, consultor: { id, nome } |
  null, checklist: null | { id, modelo_id, modelo_nome, inicio, aplicado_em, aplicado_por: { nome } }, etapas: [{ id,
  nome, posicao, tarefas, feitas }], tarefas: [{ id, etapa_id, posicao, titulo, descricao, obrigatoria, prazo_dias,
  vence_em, estado, nota, feita_em, feita_por: { nome } | null, depende_de: [id], na_sessao }], resumo: { tarefas, feitas,
  obrigatorias, obrigatorias_feitas, vencem_7_dias, atrasadas, proxima: { id, titulo, vence_em } | null }, sessao: null |
  { checkin_id, inicio, consultor: { nome }, tarefas: [{ tarefa_id, titulo }] }, ultimo_checkin: null | { inicio, fim,
  consultor: { nome } } }`. Quem não vê o cliente: nulo. Nomes pela regra de `private.nome_do_perfil_visivel`.
- `public.marcar_tarefa(p_tarefa uuid, p_estado text) returns jsonb` → `{ estado, feita_em, liberadas: [{ id, titulo }],
  na_sessao }`. Trava o check-list; `'feita'` e `'andamento'` pedem as dependências feitas; liga ou desliga em
  `checkin_tarefas` com o check-in aberto do consultor **neste** cliente; reconta. Erros: `sem_permissao`,
  `so_o_consultor_marca`, `checklist_encerrado`, `cliente_arquivado`, `tarefa_bloqueada`, `estado_invalido`.
- `public.anotar_tarefa(p_tarefa uuid, p_nota text) returns void` (mesmas regras de quem marca; nota vazia = nula).
- `public.uso_do_modelo(p_modelo uuid) returns jsonb` → `{ clientes, nomes }` (`clientes` conta todos os check-lists
  ativos; `nomes` até 5 clientes que eu vejo).
- Gatilhos: `clientes_encerrar_checklist` (after update of `consultoria_id` → encerra o ativo com `'cliente_movido'`);
  `modelos_em_uso` (before delete em `modelos` → `modelo_em_uso` se houver check-list ativo).
- Redefinidas (`create or replace`, mesma assinatura): `modelos_da_lista` e `indicadores_de_modelos` passam a contar
  `clientes_usando` no recorte de quem vê. `historico_do_cliente(uuid, int, int, timestamptz, timestamptz)` (drop +
  create, mesmas permissões) ganha a coluna `modelo text` (o `modelo_nome` só para a Central e para a consultoria do
  check-list).
- `src/data/checklists.js`: `lerChecklist(clienteId)`, `modelosParaAplicar({ clienteId, busca })`,
  `aplicarModelo({ clienteId, modeloId, inicio })` → `{ id, erro }`, `mudarInicio(checklistId, inicio)`,
  `tirarModelo(checklistId)`, `marcarTarefa(tarefaId, estado)` → `{ ...resultado, erro }`, `anotarTarefa(tarefaId,
  nota)`, `usoDoModelo(modeloId)`.
- `src/data/checkins.js`: `CAMPOS_DA_LISTA` ganha `tarefas:checkin_tarefas(titulo)` (até 3, por `marcada_em`) e
  `total_tarefas:checkin_tarefas(count)`; `tarefasDoCheckin(checkinId)` → `[{ tarefa_id, titulo }]`.

- [ ] **Passo 1:** pgTAP. Aplicar: Central e gestão aplicam; consultor e outra consultoria → `sem_permissao`; cada erro
  acima; dois `aplicar_modelo` seguidos deixam um ativo só (o segundo encerra o primeiro como `'trocado'`). Cópia: mesmas
  etapas, tarefas e dependências, `vence_em` certo; editar e apagar o modelo depois não mudam o check-list. Marcar: só o
  consultor do cliente (gestor que não é o consultor e Central → `so_o_consultor_marca`); bloqueada até as dependências;
  reabrir pode mesmo com dependente feita; contadores, `proximo_vencimento` e `liberadas` certos; check-list encerrado e
  cliente arquivado recusam. Check-in: com o check-in aberto neste cliente a tarefa entra em `checkin_tarefas` com o
  título; aberto em outro cliente ou sem check-in, não entra; desmarcar com ele aberto tira; depois do check-out não tira;
  apagar o check-in não desmarca; trocar o consultor fecha o check-in e as tarefas ficam nele; trocar o modelo com o
  check-in aberto mantém as já marcadas e marcar no encerrado é recusado. Quem vê: consultor do cliente, gestão e Central
  veem; colega que não é o consultor e outra consultoria não; o consultor que mudou de consultoria ainda lê
  `checkin_tarefas` dos check-ins dele. Cliente movido: encerrado `'cliente_movido'`, a nova consultoria lê `checklist`
  nulo e `pode_aplicar`; voltar não reativa. Modelo em uso não apaga; `uso_do_modelo` só dá nomes que vejo. Histórico:
  nome do modelo só para a Central e a consultoria do check-list. Cliente com check-list não se apaga (23503).
  Volume: 5.000 clientes com check-list de 40 tarefas e um de 500 — `checklist_do_cliente` e `marcar_tarefa` rápidos,
  EXPLAIN sem Seq Scan em `checklist_tarefas`. Integração: aplicar, ler, marcar com e sem check-in aberto, check-out e a
  lista de check-ins com as tarefas. **Passo 2:** FALHA. **Passo 3:** cópia, migração, implementar. **Passo 4:**
  `npm run test:db`, `npm test`, `npm run test:integracao`. **Passo 5:** commit `Check-list do cliente: aplicar modelo,
  marcar tarefas e ligar ao check-in`.

### Task 3: Fluxograma

**Arquivos:** `src/components/checkins/fluxo.js` (+ `fluxo.test.js`), `src/components/checkins/situacao.js`
(+ `situacao.test.js`), `src/components/checkins/Fluxograma.jsx` (+ `Fluxograma.test.jsx`).

**Interfaces — produz:**
- `layoutDoFluxo(etapas, tarefas, { vertical }) → { nos: { [id]: { x, y } }, raias: [{ etapaId, inicio, fim }], largura,
  altura }` — `etapas: [{ id, nome }]` e `tarefas: [{ id, etapa_id, depende_de: [id] }]`, ambos em ordem. Algoritmo do
  protótipo (`layoutFluxo`): uma raia por etapa; dentro dela, níveis pelas dependências da mesma etapa; cada tarefa
  procura a altura média das que ela espera; nenhuma caixa sobre outra. Dependência desconhecida é ignorada.
- `caminhoDaSeta(de, para, { vertical }) → string` (o `d` da curva) e `quebrarTitulo(texto, max) → [linha, linha?]`.
- `situacaoDaTarefa(tarefa, porId, hoje) → { cor: 'feita' | 'atrasada' | 'hoje' | 'andamento' | 'bloqueada' | 'livre',
  bloqueada, atrasada, venceHoje, faltam, espera: [tarefa] }` e `rotuloDaSituacao(tarefa, situacao)`; `hoje` é um
  `'aaaa-mm-dd'` (o de São Paulo, vindo de quem chama).
- `<Fluxograma etapas tarefas vertical infoDaTarefa selecionada aoEscolher rotulo contagemDaEtapa />` — `infoDaTarefa(t)
  → { cor, sub, icone, rotulo, apagado }`; sem `aoEscolher`, os nós são só desenho (prévia do modelo). E
  `<LegendaDoFluxo dica />`.

- [ ] **Passo 1:** testes. `fluxo`: sem dependências, uma coluna por etapa e as tarefas empilhadas; dependência dentro da
  etapa empurra para o nível seguinte; nenhuma caixa se sobrepõe (todas as tarefas, deitado e em pé); "Em pé" troca os
  eixos; 500 tarefas em 12 etapas cabem numa caixa finita em menos de 100 ms. `situacao`: cada cor, quem a bloqueada
  espera, "vence hoje" e "atrasada" pelo dia passado. `Fluxograma`: nós `role="button"` com o nome "título: situação",
  Enter e espaço chamam `aoEscolher`; sem `aoEscolher`, nada focável; setas com a classe do estado (feita, realce da
  selecionada); todo texto do SVG com `fontSize` de `TAMANHO` e ≥ 11 px; cores só por tokens (claro e escuro); arrastar
  com o mouse rola a caixa. Guardas: `tipografiaVarredura`, `button.test`. **Passo 2:** FALHA. **Passo 3:**
  implementar. **Passo 4:** `npm test`, lint, build. **Passo 5:** commit `Fluxograma das tarefas por etapa`.

### Task 4: Tela de Modelos (item Check-ins no trilho)

**Arquivos:** `src/components/shell/menu.js` (+ `menu.test.js`, `Trilho.test.jsx`), `src/rotas.jsx`,
`src/pages/Checkins.jsx` (+ teste), `src/components/clientes/AbasDoCliente.jsx` (prop `rotulo`, padrão "Seções do
cliente"), `src/components/modelos/{ModelosDeCheckin,JanelaModelo,EditorDeEtapas,EscolherDependencias,JanelaVerModelo,
ApagarModelo}.jsx` (+ testes), `src/components/modelos/modelo.js` (+ teste).

**Interfaces — consome:** Task 1 (`listarModelos`, `lerModelo`, `salvarModelo`, `arquivarModelo`, `reativarModelo`,
`apagarModelo`, `indicadoresDeModelos`), Task 2 (`usoDoModelo`), Task 3 (`Fluxograma` estático).
**Produz:**
- Trilho: `{ id: 'checkins', rotulo: 'Check-ins', rota: '/checkins', icone: ListChecks, animacao: 'abrir', papeis: TODOS }`
  depois de Calendário; rota `/checkins` → `Checkins`, com `AbasDoCliente rotulo="Seções de Check-ins"` e, por ora, a aba
  Modelos (`?aba=modelos`); a Task 6 põe Andamento na frente.
- `modelo.js`: `ordemGlobal(rascunho)`, `validarModelo(rascunho) → { msg, nome, etapas: Set, tarefas: Set }` (as mesmas
  regras e limites de `salvar_modelo`), `paraSalvar(rascunho) → p_dados`, `rascunhoDe(modeloCompleto, { duplicar })`,
  `moverTarefa(rascunho, id, direcao)` (atravessa etapas), `tirarTarefas(rascunho, ids)` (tira também as dependências).
- `<ModelosDeCheckin perfil />` (barra, cartões, tabela e janelas); `<JanelaModelo modelo? origem? aoFechar aoSalvar />`;
  `<JanelaVerModelo modeloId aoFechar aoEditar aoDuplicar />`.

- [ ] **Passo 1:** testes. Trilho: "Check-ins" com `abrir`, para todos os papéis (`menu.test` e `Trilho.test` falham
  sem animação). Página: barra ("Filtros") → cartões (`cartoesAbaixoDaBarra('Indicadores dos modelos')`) → tabela
  "Modelos de check-in"; paginação (some com 15, aparece com 16, Próxima pede a página 2 ao banco); aba, busca, tipo e
  consultoria voltam à página 1 e vão ao banco. Ações por papel: consultor só Ver; gestor Ver + Duplicar nos da Central e
  Editar/Duplicar/Arquivar/Apagar nos dele; Central tudo; Arquivados: Reativar e Apagar. Editar abre a janela preenchida
  com as etapas e tarefas da linha; Novo modelo chama `salvarModelo(null, …)` com o `p_dados` certo e mostra
  "Salvando…"; Duplicar abre "Cópia de X" e salva sem id; "Depende de" só oferece tarefas anteriores; subir uma tarefa
  para antes da sua dependência marca o erro na tarefa e Salvar não chama o banco; apagar etapa com tarefas e tarefa com
  dependentes pedem confirmação dizendo o que sai; a prévia mostra o fluxograma; erro do banco aparece no rodapé.
  Apagar: sem uso → confirmação com "N etapas e M tarefas" e Arquivar como alternativa; em uso → só Arquivar, com os
  nomes que eu vejo. Gestor: "Para quem" fixo na consultoria dele. 360 px sem rolar para o lado. Guardas:
  `camposNativos`, `button.test`, `formulariosEnvio`, `tipografiaVarredura`. **Passo 2:** FALHA. **Passo 3:**
  implementar. **Passo 4:** `npm test`, lint, build. **Passo 5:** commit `Tela de modelos de check-in`.

### Task 5: Check-list na aba Check-ins do cliente

**Arquivos:** `src/components/checkins/{ChecklistDoCliente,CartaoDoModelo,PainelDaSessao,ListaDoChecklist,
JanelaDaTarefa,JanelaAplicarModelo,JanelaInicioDosPrazos}.jsx` (+ testes), `src/pages/Cliente.jsx` (+ teste),
`src/components/clientes/{CheckinsDoCliente,JanelaCheckin}.jsx` (+ testes), `src/components/clientes/rotulos.js`
(textos dos 3 eventos).

**Interfaces — consome:** Task 2 (`lerChecklist`, `modelosParaAplicar`, `aplicarModelo`, `mudarInicio`, `tirarModelo`,
`marcarTarefa`, `anotarTarefa`, `tarefasDoCheckin`, a lista de check-ins com as tarefas), Task 3 (`Fluxograma`,
`situacaoDaTarefa`).
**Produz:** `<ChecklistDoCliente cliente perfil versao aoMudar />` (na aba `checkins`, acima de `CheckinsDoCliente`;
`aoMudar` é o `recarregar` da página, para o botão de check-in do topo e a caixa da sessão andarem juntos);
`<JanelaAplicarModelo cliente checklist? aoFechar aoAplicar />` (a Task 6 usa a mesma).

- Com modelo: barra (Lista/Fluxograma, Todas/Pendentes/Feitas com os números, Deitado/Em pé, "Próxima: …") → cartões
  "Andamento do check-list" (do `resumo` do banco) → caixas Modelo aplicado e Check-in → aviso para quem só acompanha →
  lista por etapa ou fluxograma. Sem modelo: caixa com **Aplicar modelo** (quem aplica) ou o texto do consultor, e a
  caixa Check-in. Filtros e orientação na tela (o check-list já veio inteiro); no celular, "Em pé" por padrão.
- Marcar pela `Caixa` (otimista; se o banco recusar, volta e avisa) ou pela janela da tarefa (Começar, Marcar como
  feita, Voltar para a fazer, Reabrir, Salvar nota); depois, relê o check-list e chama `aoMudar`; o aviso diz o que
  liberou e se entrou no check-in.
- `JanelaCheckin`: em `checkout` e `editar` lê `tarefasDoCheckin` e mostra "Tarefas marcadas nesta sessão" (só ler); no
  check-out com "O que foi feito" vazio, preenche "Tarefas concluídas: A; B." (sem apagar o que a pessoa já digitou).
  `CheckinsDoCliente`: coluna "Tarefas marcadas" (até 3 chips + "+N"); a confirmação de apagar diz que as tarefas
  continuam feitas.

- [ ] **Passo 1:** testes de tela por papel: consultor do cliente marca e desmarca, a bloqueada fica desligada com o
  motivo, a janela da tarefa troca os botões conforme o estado e salva a nota; gestão vê "Você acompanha…" sem caixas
  ligadas, aplica, troca (aviso "começa do zero…"), muda o início e tira (confirmação dizendo o que fica no histórico);
  Central só lê e aplica. Barra → cartões (`cartoesAbaixoDaBarra('Andamento do check-list')`) com os números do banco;
  Lista ↔ Fluxograma; Todas/Pendentes/Feitas; clicar num nó abre a tarefa. Caixa Check-in: com check-in aberto neste
  cliente mostra o relógio e "Nesta sessão" com as tarefas; sem, "Sem check-in aberto". Check-out mostra as tarefas e
  preenche "O que foi feito"; editar mostra as tarefas; tabela com a coluna nova; apagar check-in com o texto novo.
  Histórico com os 3 eventos e o nome do modelo. 360 px sem rolar para o lado (o fluxograma rola dentro do cartão).
  Guardas. **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** `npm test`, lint, build. **Passo 5:** commit
  `Check-list do cliente na aba Check-ins: lista, fluxograma e sessão`.

### Task 6: Andamento dos clientes

**Arquivos:** migração `andamento_dos_checklists` (funções e índices que faltarem), `supabase/tests/database/
andamento.test.sql` (+ `andamento_volume.test.sql`), `src/data/checklists.js` (+ `listarAndamento`),
`src/data/indicadores.js` (+ `indicadoresDeCheckins`), `src/components/checkins/AndamentoDosClientes.jsx` (+ teste),
`src/pages/Checkins.jsx` (+ teste: Andamento é a primeira aba).

**Interfaces — produz:**
- `public.andamento_dos_clientes(p_consultoria uuid default null, p_consultor uuid default null, p_situacao text default
  'todos', p_busca text default null, p_pagina int default 1) returns jsonb` → `{ itens: [{ cliente: { id, nome, cidade,
  uf }, consultor: { id, nome, foto, cor } | null, consultoria: { id, nome } | null (só a Central), pode_aplicar,
  checklist: null | { id, modelo_nome, tarefas, feitas, pct, atrasadas, proxima: { titulo, vence_em } | null } }], total }`.
  Clientes ativos com consultoria, no recorte (consultor: os dele; gestão: a consultoria; Central: todas ou a do filtro).
  `p_situacao`: `'todos'`, `'com_atraso'` (`proximo_vencimento` antes de hoje), `'sem_modelo'`. Busca sem acento no
  nome do cliente e no nome do modelo. Ordem: `proximo_vencimento` (nulos no fim), depois o nome. 15 por página;
  atrasadas e próxima só para as linhas da página.
- `public.indicadores_de_checkins(p_consultoria uuid default null, p_consultor uuid default null) returns jsonb` →
  `{ recorte, clientes, com_modelo, progresso_medio, atrasadas, vencem_7_dias }` (seguem consultoria e consultor; não a
  situação nem a busca).
- `listarAndamento({ consultoriaId, consultorId, situacao, busca, pagina })` → `{ itens, total }`;
  `indicadoresDeCheckins({ consultoriaId, consultorId })`.

- [ ] **Passo 1:** pgTAP: recorte de cada papel (outra consultoria nunca aparece; o consultor não passa filtro de outra
  pessoa), cada situação, busca sem acento por cliente e por modelo, ordem, página de 15 com total, próxima tarefa = a de
  data mais cedo entre as pendentes não bloqueadas, atrasadas por linha; indicadores no recorte e com os filtros. Volume
  (5.000 clientes, 200 mil tarefas): página e indicadores sem Seq Scan nas tabelas grandes. Tela: barra → cartões
  (`cartoesAbaixoDaBarra('Indicadores do andamento')`) → tabela "Andamento dos clientes"; paginação (some com 15,
  aparece com 16, Próxima pede a página 2); filtros voltam à página 1; consultor sem os filtros de consultoria e
  consultor; Central com consultoria; Abrir leva a `/clientes/:id?aba=checkins`; Aplicar modelo abre
  `JanelaAplicarModelo` nos sem modelo (só para quem aplica); 360 px. **Passo 2:** FALHA. **Passo 3:** cópia, migração,
  implementar. **Passo 4:** `npm run test:db`, `npm test`, `npm run test:integracao`, lint, build. **Passo 5:** commit
  `Andamento dos clientes no check-list`.

### Task 7: Documentação, exemplo e conferência

**Arquivos:** `CLAUDE.md` (seção "Check-list e modelos de check-in": quem faz o quê, aplicar copia, sem ciclo pela
ordem, um check-list ativo por cliente e encerrado quando o cliente muda de consultoria, só o consultor marca, o que
entra no check-in; o item Check-ins na lista de menus com `BarraDeFiltros` e nas funções de cartões
(`indicadores_de_modelos`, `indicadores_de_checkins`); as exceções aprovadas: o check-list não é `Tabela`, seus filtros
rodam na tela, tarefas do cliente não se criam nem apagam uma a uma), `scripts/exemplo-local.mjs` (dois modelos da
Central — Gestão financeira e Sucesso do Cliente — e um da Consultoria Exemplo, com dependências, como no protótipo;
um aplicado num cliente da Consultoria Exemplo com algumas tarefas feitas; idempotente; entra como a central e o gestor
de exemplo e usa as mesmas funções da tela; não toca nos dados reais).

- [ ] **Passo 1:** documentar e o script (o controlador roda). **Passo 2:** `npm test`, lint, build. **Passo 3:** commit
  `Documentação dos modelos de check-in e exemplo`. Conferência no navegador pelo controlador: consultor, gestor e
  central; claro e escuro; 1440 e 390 px; criar, editar, duplicar, arquivar e apagar modelo; aplicar e trocar com
  check-in aberto; marcar com e sem check-in e conferir o check-out; fluxograma de um modelo de 500 tarefas rolando sem
  travar.

### Task 8: Tarefa "Não se aplica" (acréscimo de 18/11)

Desenho: seção "Acréscimo de 18/11" do design. Depois da T7 no `CLAUDE.md` (a seção do check-list que a T7 escreve
ganha as regras novas).

**Arquivos:** migração nova `tarefa_nao_se_aplica` (estado novo no check de `checklist_tarefas.estado`; coluna
`motivo text check (char_length(btrim(motivo)) between 1 and 500)` com a regra "motivo só e sempre com
`nao_se_aplica`"; `marcar_tarefa` recebe `p_motivo` (assinatura nova: `drop` + `create` com os grants de volta ou
parâmetro com default, sem quebrar quem chama); liberação das dependentes, `private.recontar_checklist`, resumo de
`checklist_do_cliente`, `andamento_dos_clientes`, `indicadores_de_checkins`, `indicadores_de_modelos`/`uso_do_modelo`
se contarem feitas; `checkin_tarefas` guarda o estado e o motivo; tipo novo em `cliente_eventos` para o Histórico —
`create or replace` a partir do corpo mais novo de cada função, com o comentário "Mesmo corpo de <migração>; muda só
…"), `supabase/tests/database/checklists.test.sql` (+ volume se o plano mudar), `src/data/checklists.js` (+ teste),
`src/components/checkins/{situacao,ListaDoChecklist,Fluxograma,JanelaDaTarefa,ChecklistDoCliente,PainelDaSessao,
TarefasMarcadas,AndamentoDosClientes}*`, `src/components/modelos/*` (só a legenda), o texto do check-out
(`src/components/clientes/JanelaCheckin*` ou onde ele é montado), `src/lib/erros.js` (`motivo_obrigatorio`),
`tests/integracao/checklists.test.js`, `CLAUDE.md`.

**Testes que provam (pgTAP, depois tela e integração):**
- consultor marca `nao_se_aplica` com motivo → estado, motivo, quem e quando gravados; sem motivo ou só espaços →
  `motivo_obrigatorio` (22023); gestão, central e outro consultor → `sem_permissao`; cliente arquivado → recusa.
- dependente de uma tarefa `nao_se_aplica` fica liberada; voltar para `a_fazer` limpa o motivo e bloqueia de novo.
- resumo: `resolvidas = feitas + nao_se_aplica`, `nao_se_aplica` à parte; atrasadas, vencem em 7 dias e próxima
  ignoram as `nao_se_aplica`; Andamento e indicadores iguais.
- com check-in aberto, entra em `checkin_tarefas` com o motivo; o texto do check-out traz "Não se aplica: <tarefa>
  (<motivo>)"; o Histórico ganha a linha.
- tela: a janela da tarefa oferece "Não se aplica" com o campo Motivo (obrigatório, contador até 500, erro no campo);
  lista e fluxograma mostram o selo cinza com ícone próprio; legendas (cliente e prévia do modelo) com a cor nova;
  progresso "4 de 5 resolvidas: 3 feitas, 1 não se aplica"; Andamento conta como resolvida.
- volume: os tempos de `checklists_volume`/`andamento_volume` continuam dentro dos limites.

- [ ] Passo 1: testes (ver FALHAR). Passo 2: migração (cópia antes) e código. Passo 3: `npm run test:db`,
  `npm test`, `npm run test:integracao`, lint, build. Passo 4: conferência no navegador (consultor marca e desmarca numa
  tarefa de um cliente da Consultoria Exemplo, com e sem check-in; gestor e central só veem). Passo 5: commit
  `Check-list: tarefa "Não se aplica" com motivo`.

