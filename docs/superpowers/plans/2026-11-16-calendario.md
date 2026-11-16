# Calendário integrado ao Google — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** menu Calendário (Dia/Semana/Mês/Ano) com visão privada do consultor e visão da gestora, eventos com Meet
gravado e transcrito no Google da consultoria, calendários compartilhados como no Mac, e pasta da reunião com
transcrição e documentação nos Arquivos do cliente.

**Arquitetura:** banco (`agenda_calendarios`, `agenda_eventos`, `cliente_pastas`) com RLS por papel; núcleo da agenda
em `supabase/functions/_shared/agenda/` sem imports do Deno (recebe `db` e `google` por parâmetro, testável no
Vitest); Edge Functions `agenda` (criar/editar/apagar) e `agenda-sincronizar` (Google → app, compartilhamentos e
pastas das reuniões), chamada pelo `pg_cron` a cada 5 minutos; tela `/calendario` no padrão Hub.

**Tecnologias:** Postgres 17 + RLS, pg_cron/pg_net, Vault, Deno Edge Functions, Google Calendar API v3, Meet REST API
v2, React 19, Tailwind 4, date-fns (do padrão Hub).

**Spec:** `docs/superpowers/specs/2026-11-16-calendario-design.md`. Depende do padrão Hub
(`docs/superpowers/plans/2026-11-16-padrao-hub.md`: `JanelaFormulario`, `CampoData`, `CampoHora`, `Seletor`,
`Caixa`, `AbasSegmentadas`, `BarraDeFiltros`).

## Restrições globais

- Dados do Diego: nunca `supabase db reset`, nunca apagar registros que os testes não criaram; migração nova com
  `npx supabase migration new <nome> < /dev/null` e aplicar com `npx supabase migration up`. Cópia do banco em
  `supabase/.copias/` antes de migração que mexe em tabela existente (`cliente_arquivos`).
- Edge Function nova registrada em `supabase/config.toml` e runtime reiniciado (`npm run functions:reiniciar`).
- Chave secreta nunca em `src/` nem no git. Token do Google só no Vault (integração `google` que já existe).
- Toda tabela nova: RLS ligado, `GRANT` explícito só para `authenticated`, recorte por consultoria com funções em
  `private`, teste pgTAP em `supabase/tests/database/`.
- Quem vê: consultor só os próprios eventos; gestor/admin os da consultoria; central/dono todos. Uma consultoria
  nunca vê eventos, calendários ou pastas de outra.
- Escala (`CLAUDE.md`): calendário lê só o intervalo visível e os calendários marcados; listas paginadas no banco
  (15); índice em toda coluna de filtro/ordem/junção; nada de chamada por item (no Google: uma chamada por
  calendário por rodada).
- Fuso `America/Sao_Paulo` em tudo; datas no Google com `timeZone: 'America/Sao_Paulo'`.
- Padrão Hub nas telas (janela de formulário, campos próprios, abas segmentadas), botões animados, CRUD completo com
  confirmação dizendo o que some junto, textos em português.
- Escopos do Google (em `ESCOPOS_DO_GOOGLE`): `openid`, `email`, `calendar`, `drive.file`,
  `meetings.space.settings`, `meetings.space.readonly`.
- Node 26 (`source ~/.nvm/nvm.sh && nvm use`); nunca `git stash`, trocar de branch, push; nunca dois `test:db` juntos.
- Pronto: `npm test`, `npm run test:db`, `npm run test:integracao`, `npm run lint`, `npm run build` verdes;
  conferência no navegador (consultor, gestora, central) sem Google real.

## Review Focus

- Consultor A pedindo eventos com `consultor_id` de B (mesma consultoria) pela API: não vem nada, e a Edge Function
  recusa editar/apagar evento de B.
- Google recusa no meio (token vencido, `invalid_grant`, 403 do Meet): nada muda no banco, a tela mostra o motivo, e a
  integração fica "com erro" com "Conecte de novo".
- `syncToken` inválido (410 do Google): a rodada refaz a leitura completa daquele calendário sem duplicar eventos.
- Reunião sem transcrição (ninguém gravou): depois de 48 horas vira "Sem gravação/transcrição" e a rotina para de
  perguntar ao Google.
- Evento atravessando a meia-noite ou o dia inteiro: aparece nos dias certos em Dia/Semana/Mês (fuso de SP).

---

### Task 1: Pastas nos Arquivos do cliente

**Arquivos:** migração `cliente_pastas` (+ `cliente_arquivos.pasta_id uuid null references cliente_pastas on delete
cascade`, índices), `supabase/tests/database/pastas.test.sql`, `src/data/arquivos.js` (+ `listarPastas`, `criarPasta`,
`renomearPasta`, `apagarPasta`; `listarArquivos(clienteId, { pasta, pagina })`; `enviarArquivo(clienteId, arquivo,
{ pastaId })`), `src/components/clientes/ArquivosDoCliente.jsx` (+ teste), teste de integração em
`tests/integracao/arquivos.test.js`.

- `cliente_pastas(id, cliente_id → clientes on delete cascade, consultoria_id, nome 1..120, evento_id null, criada_por,
  criada_em)`, nome único por cliente (sem diferenciar maiúsculas). Ver, criar, renomear e apagar seguem as regras de
  `cliente_arquivos` (ver = vê o cliente; renomear/apagar = quem criou, gestor/admin da consultoria, central).
- Apagar pasta apaga os arquivos dela (linhas e objetos do Storage, pelo mesmo caminho de `apagarArquivo`) — a
  confirmação diz quantos. O `on delete restrict` do cliente continua valendo para arquivos.
- Tela: aba Arquivos mostra pastas (tabela, primeiro) e arquivos soltos; abrir a pasta mostra os arquivos dela com
  "Voltar"; Nova pasta / Renomear (JanelaFormulario preenchida) / Apagar (ConfirmarAcao); enviar dentro da pasta.
- [ ] **Passo 1:** pgTAP (consultor vê pastas dos seus clientes e não as de outra consultoria; quem não criou e não é
  gestor não renomeia; nome repetido falha) e testes de tela (tabela pelo nome, Editar abre preenchido, apagar diz
  quantos arquivos, paginação some com ≤15 e Próxima pede a página 2). **Passo 2:** FALHA. **Passo 3:** cópia do
  banco, migração, `migration up`, implementar. **Passo 4:** `npm run test:db`, `npm test`, `npm run
  test:integracao`, lint, build. **Passo 5:** commit `Pastas nos arquivos do cliente`.

### Task 2: Banco da agenda

**Arquivos:** migração `agenda` (tabelas, RLS, índices, funções `private.vejo_evento(evento)`), `supabase/tests/database/
agenda.test.sql`, `src/data/agenda.js` (leituras).

- `agenda_calendarios(id, consultoria_id, pessoa_id unique, google_id, cor smallint 0..7, sync_token, sincronizado_em,
  erro text)`: select para quem vê a pessoa (consultor a si, gestor/admin da consultoria, central); escrita só
  service_role.
- `agenda_eventos(id, consultoria_id, consultor_id, cliente_id null, titulo 1..200, descricao ≤5000, inicio, fim
  (> inicio), dia_inteiro, local ≤300, convidados text[] ≤20 e-mails, com_meet, gravar, meet_link, meet_codigo,
  google_evento_id, google_calendario_id, recorrente bool, origem 'app'|'google', reuniao text check in
  ('agendada','aguardando','pasta_criada','sem_artefatos','erro'), reuniao_erro, gravacao_url, pasta_id null,
  criado_por, criado_em, atualizado_em)`; unique (google_calendario_id, google_evento_id). Select pela regra de
  papéis; escrita só service_role. Índices: (consultoria_id, inicio), (consultor_id, inicio), cliente_id, (reuniao)
  parcial onde aguardando.
- Leituras em `src/data/agenda.js`: `eventosDoPeriodo({ de, ate, consultores })` (só os marcados, `inicio < ate and
  fim > de`), `calendariosVisiveis({ consultoriaId, busca, pagina })` (pessoas com cor, paginado), `buscarEvento(id)`.
- [ ] **Passo 1:** pgTAP: consultor vê só os seus; gestor vê os da consultoria e não de outra; central vê todos;
  `authenticated` não grava; fim antes do início falha; `performs_within` do período com 50 mil eventos. **Passo 2:**
  FALHA. **Passo 3:** migração + `migration up` + leituras. **Passo 4:** `npm run test:db`, `npm test`. **Passo 5:**
  commit `Banco da agenda com visão por papel`.

### Task 3: Cliente do Google e permissões novas

**Arquivos:** `supabase/functions/_shared/agenda/google.ts` (sem imports do Deno; recebe `fetch` e o token),
`supabase/functions/_shared/agenda/google-falso.ts` (Google em memória para testes), `tests/integracao/google.test.js`,
`supabase/functions/_shared/integracoes.ts` (escopos novos; teste da conexão diz "faltam permissões" quando o token
não tem os escopos), `src/pages/Integracoes.jsx` (aviso "Reconecte para liberar o Calendário").

**Interfaces — produz** (`criarGoogle({ fetch, token })` → objeto com):
`criarCalendario(nome)`, `compartilhar(calendarioId, email, papel: 'writer'|'reader')`, `descompartilhar(calendarioId,
email)`, `listarCompartilhamentos(calendarioId)`, `criarEvento(calendarioId, evento, { meet })`, `editarEvento(...)`,
`moverEvento(de, para, eventoId)`, `apagarEvento(calendarioId, eventoId)`, `lerMudancas(calendarioId, syncToken)` →
`{ eventos, proximoSyncToken, reiniciar: boolean }` (410 → `reiniciar`), `ligarGravacao(meetCodigo)` (spaces.patch
com gravação e transcrição automáticas), `artefatosDaReuniao(meetCodigo)` → `{ terminou, gravacaoUrl,
transcricao: 'pronta'|'processando'|'nenhuma', falas: [{ hora, nome, texto }] }`. Erros viram `ErroDoGoogle(codigo,
mensagem em português)`.
- [ ] **Passo 1:** testes com o Google falso (Vitest, projeto integracao): cada função manda o pedido certo, 410 vira
  `reiniciar`, 401/`invalid_grant` vira `ErroDoGoogle('reconectar')`, falas montadas em ordem. **Passo 2:** FALHA.
  **Passo 3:** implementar. **Passo 4:** `npm run test:integracao`, `npm test`, lint. **Passo 5:** commit `Cliente do
  Google para a agenda`.

### Task 4: Criar, editar e apagar eventos (Edge Function `agenda`)

**Arquivos:** `supabase/functions/_shared/agenda/eventos.ts` (núcleo: `salvarEvento(db, google|null, quem, dados)`,
`apagarEvento(db, google|null, quem, id)`), `supabase/functions/agenda/index.ts`, `supabase/config.toml`,
`src/data/agenda.js` (+ `salvarEvento`, `apagarEvento`), `tests/integracao/agenda.test.js`.

- Permissão pelo papel (tabela CRUD do design); cliente só se a pessoa o vê e não arquivado; convidados validados;
  evento `recorrente` (veio do Google) não se edita nem se apaga no app (`{ erro: 'Este evento se repete; altere
  no Google.' }`). Ação `tentarDeNovo(id)`: reunião em `erro` volta para `aguardando` (mesmas permissões de editar).
- Com Google: grava no Google primeiro (calendário do consultor; consultor e contato do cliente como convidados;
  Meet + `ligarGravacao` quando `gravar`), depois no banco; Google recusou → nada muda, `{ erro }` em português.
  Sem Google: só no banco. Mudar o consultor move o evento de calendário.
- [ ] **Passo 1:** testes de integração (banco local + Google falso): consultor cria na própria agenda e não na de
  colega; gestora cria para qualquer consultor da consultoria; outra consultoria recusada; Google recusando não deixa
  linha; apagar cancela no Google e mantém a pasta. **Passo 2:** FALHA. **Passo 3:** implementar, registrar,
  reiniciar runtime. **Passo 4:** `npm run test:integracao`, `npm test`, lint. **Passo 5:** commit `Eventos da agenda
  com Meet e gravação`.

### Task 5: Sincronização, compartilhamentos e pasta da reunião (`agenda-sincronizar`)

**Arquivos:** `supabase/functions/_shared/agenda/sincronizar.ts` (`sincronizarConsultoria(db, google, consultoriaId)`),
`supabase/functions/_shared/agenda/reuniao.ts` (`fecharReuniao(db, google, ia|null, evento)`),
`supabase/functions/agenda-sincronizar/index.ts`, migração do `pg_cron` (a cada 5 minutos, segredo no Vault),
`supabase/config.toml`, `tests/integracao/agenda-sincronizar.test.js`.

- Por consultoria com Google: cria calendário de quem não tem (cor = próxima livre), ajusta compartilhamentos
  (consultor: writer no seu; gestor/admin: writer em todos; quem saiu: removido), manda para o Google eventos do app
  ainda sem `google_evento_id`, lê mudanças por `syncToken` (410 → leitura completa sem duplicar), e para reuniões
  terminadas em `aguardando`: `artefatosDaReuniao` → cria `cliente_pastas` ("Reunião dd/MM/yyyy HH:mm — título") com
  `transcricao.txt` e `documentacao.md` (resumo pela IA da consultoria quando conectada), marca `pasta_criada` e grava
  `cliente_eventos`; 48 horas sem transcrição → `sem_artefatos`. Erro por calendário registrado em
  `agenda_calendarios.erro`, sem parar os outros.
- Chamada: pelo cron (cabeçalho com o segredo) para todas; pela tela ("Sincronizar agora") só a consultoria de quem
  pede (gestor/admin/central).
- [ ] **Passo 1:** testes de integração com Google falso cobrindo cada item acima e o Review Focus (410, 48 h,
  quem saiu perde acesso). **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** `npm run test:integracao`,
  `npm run test:db`, lint. **Passo 5:** commit `Sincronização da agenda e pasta da reunião`.

### Task 6: Tela Calendário

**Arquivos:** `src/pages/Calendario.jsx` (+ teste), `src/components/calendario/{LateralDoCalendario,VisaoDia,
VisaoSemana,VisaoMes,VisaoAno,FormularioEvento,DetalheDoEvento,cores}.jsx|js` (+ testes), `src/lib/calendario.js`
(+ teste: semanas, posições na grade, eventos que atravessam dias no fuso de SP), `src/components/shell/menu.js`
(item Calendário, ícone `CalendarDays`, animação nova `folhear`), `src/index.css` (keyframes `icone-folhear`), rotas.

- Layout e comportamento do design ("O menu Calendário"): topo com Hoje ‹ › título, `AbasSegmentadas`
  Dia/Semana/Mês/Ano e "Novo evento"; lateral com mini mês e calendários por papel (consultor: só "Minha agenda";
  gestor/admin: consultores com cor e caixa, busca e paginação acima de 15; central: `Seletor` de consultoria);
  clicar em horário vazio abre o formulário com dia/hora; detalhe com Editar, Apagar, Entrar no Meet, Abrir gravação,
  Pasta da reunião (vai para a aba Arquivos do cliente na pasta), situação da reunião; aviso quando a consultoria não
  tem Google; "Sincronizar agora" para quem pode.
- [ ] **Passo 1:** testes de tela por papel (consultor não vê lateral de consultores; gestora liga/desliga e o pedido
  ao banco leva só os marcados; mudar de visão pede só o novo intervalo), formulário (Editar abre preenchido, cliente
  sugere o contato como convidado), apagar com confirmação, `menu.test`/`Trilho.test` com a animação. **Passo 2:**
  FALHA. **Passo 3:** implementar. **Passo 4:** `npm test`, lint, build. **Passo 5:** commit `Menu Calendário`.

### Task 7: Reuniões no cliente, documentação e conferência

**Arquivos:** `src/components/clientes/AgendaDoCliente.jsx` (+ reuniões do cliente no mês), `src/components/clientes/
rotulos.js` (eventos "Reunião marcada/realizada", "Pasta da reunião criada"), `README.md` (Google: escopos novos,
Workspace com gravação, app Interno x Externo, `pg_cron`), `CLAUDE.md` (regra da agenda: visão por papel, núcleo sem
Deno testado com Google falso), `scripts/exemplo-local.mjs` (eventos de exemplo idempotentes, sem Google).
- [ ] **Passo 1:** testes de tela da Agenda do cliente com reuniões. **Passo 2:** FALHA. **Passo 3:** implementar e
  documentar. **Passo 4:** todas as suítes, lint, build. **Passo 5:** commit `Reuniões na agenda do cliente e
  documentação do Calendário`. Conferência no navegador pelo controlador (consultor, gestora, central; claro/escuro;
  1440 e 390 px).
