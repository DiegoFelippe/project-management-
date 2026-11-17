# Calendário integrado ao Google — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** menu Calendário com o layout do Hub (Mês/Semana/Agenda), visão por papel, eventos gravados no Google de
cada consultor com Meet, convidados de fora, gravação e transcrição, e a pasta da reunião (transcrição e
documentação) nos Arquivos do cliente.

**Arquitetura:** banco (`cliente_pastas`, `google_pessoas`, `agenda_eventos`, `agenda_participantes`) com RLS por papel;
núcleo da agenda em `supabase/functions/_shared/agenda/` sem imports do Deno (recebe `db`, `google` e `ia` por
parâmetro; testado no Vitest com um Google falso); Edge Functions `google-pessoa` (conectar/desconectar o Google da
pessoa), `agenda` (criar/editar/apagar/responder/buscar agora) e `reunioes-depois` (chamada pelo `pg_cron` a cada
10 minutos); tela `/calendario` no padrão Hub e na escala de tipografia.

**Tecnologias:** Postgres 17 + RLS, Vault, pg_cron + pg_net, Deno Edge Functions, Google Calendar API v3, Google Meet
REST API v2, React 19, Tailwind 4, date-fns 3.6.0.

**Spec:** `docs/superpowers/specs/2026-11-16-calendario-design.md` (revisto em 16/11 à noite: layout do Hub, Google de
cada consultor, convidados de fora). Referência do Hub: `.superpowers/sdd/avulsos/calendario-hub-inventario.md`.

## Restrições globais

- Dados do Diego: nunca `supabase db reset`, nunca apagar o que os testes não criaram; migração com
  `npx supabase migration new <nome> < /dev/null` e `npx supabase migration up`; nunca editar migração aplicada; cópia
  em `supabase/.copias/` antes de cada migração (`pg_dump --data-only --schema=public --schema=auth`, conferir o
  tamanho). A API local desta consultoria é `http://127.0.0.1:54521` (nunca 54321/54721).
- Edge Function nova ou alterada: registrada em `supabase/config.toml` e `npm run functions:reiniciar`.
- Chave secreta nunca em `src/` nem no git. Token do Google da pessoa só no Vault; o navegador lê só "conectado ou
  não" e o e-mail da conta.
- Toda tabela nova: RLS ligado, `GRANT` explícito só para `authenticated`, recorte por consultoria com funções em
  `private`, teste pgTAP. Funções novas passam por `private.liberado()` (2FA e sessão encerrada).
- Quem vê: consultor os próprios eventos e os em que foi convidado; gestor/admin os da consultoria; central/dono
  todos. Uma consultoria nunca vê eventos, participantes ou pastas de outra.
- Escala: a tela lê só o intervalo visível; filtros, contagens e busca no banco; listas paginadas (15); índice em
  toda coluna de filtro/ordem/junção; nada de chamada ao banco ou ao Google por item.
- Fuso `America/Sao_Paulo` em tudo (`timeZone: 'America/Sao_Paulo'` no Google).
- Escopos do Google da pessoa (`ESCOPOS_DA_PESSOA`): `openid`, `email`,
  `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/meetings.space.settings`,
  `https://www.googleapis.com/auth/meetings.space.readonly`.
- Convidados de fora: até 20 e-mails por evento, validados, sem repetir; nunca ganham acesso ao app.
- Padrão Hub (janela de formulário, campos de `src/components/campos/`, `BarraDeFiltros`, `AbasSegmentadas`),
  tipografia da escala (`CLAUDE.md`, seção Tipografia), botões animados, CRUD com confirmação dizendo o que some junto,
  textos em português.
- Node 26; vitest só com `--project`; nunca dois `test:db` juntos; nunca `git stash`, trocar de branch, push.

## Review Focus

- Consultor A pedindo eventos de B (mesma consultoria) pela API: não vem nada; a Edge Function recusa editar/apagar
  evento de B; participante convidado só responde.
- Google recusa no meio (token vencido, `invalid_grant`, 403 do Meet): nada muda no banco, a tela diz o motivo, e a
  conexão da pessoa fica "Reconecte o Google".
- Gestora cria evento na agenda de um consultor que não conectou o Google: o evento fica só no app, sem Meet, com
  aviso — sem erro.
- Reunião sem transcrição (ninguém gravou): 48 horas depois do fim vira "Sem gravação/transcrição" e a rotina para de
  perguntar ao Google.
- Evento que atravessa a meia-noite ou de dia inteiro aparece nos dias certos em Mês/Semana/Agenda (fuso de SP).

---

### Task 1: Pastas nos Arquivos do cliente

**Arquivos:** migração `cliente_pastas` (+ `cliente_arquivos.pasta_id uuid null references cliente_pastas on delete
cascade`, índices), `supabase/tests/database/pastas.test.sql`, `src/data/arquivos.js` (+ `listarPastas(clienteId,
{ pagina })`, `criarPasta(clienteId, nome)`, `renomearPasta(id, nome)`, `apagarPasta(id)`; `listarArquivos(clienteId,
{ pastaId, pagina })`; `enviarArquivo(clienteId, arquivo, { pastaId })`), `src/components/clientes/ArquivosDoCliente.jsx`
(+ teste), `tests/integracao/arquivos.test.js`.

- `cliente_pastas(id, cliente_id → clientes on delete cascade, consultoria_id, nome 1..120, evento_id null, criada_por,
  criada_em)`; nome único por cliente sem diferenciar maiúsculas. Ver/criar/renomear/apagar com as regras de
  `cliente_arquivos` (ver = vê o arquivo pela consultoria; renomear/apagar = quem criou, gestor/admin da consultoria,
  central).
- Apagar pasta apaga os arquivos dela (linhas e objetos, pelo caminho de `apagarArquivo`); a confirmação diz quantos.
- Tela: aba Arquivos lista pastas (tabela, primeiro) e arquivos soltos; abrir a pasta mostra os dela com "Voltar";
  Nova pasta / Renomear (`JanelaFormulario` preenchida) / Apagar (`ConfirmarAcao`); enviar dentro da pasta.
- [ ] **Passo 1:** pgTAP (vê as pastas dos seus clientes e não as de outra consultoria; quem não criou e não é gestor
  não renomeia; nome repetido falha) e telas (tabela pelo nome, Editar abre preenchido, apagar diz quantos arquivos,
  paginação some com ≤15 e Próxima pede a página 2). **Passo 2:** FALHA. **Passo 3:** cópia, migração, implementar.
  **Passo 4:** `npm run test:db`, `npm test`, `npm run test:integracao`, lint, build. **Passo 5:** commit
  `Pastas nos arquivos do cliente`.

### Task 2: Banco da agenda

**Arquivos:** migração `agenda` (tabelas, RLS, índices, `private.vejo_evento(evento_id)`, RPCs), `supabase/tests/
database/agenda.test.sql` (+ `agenda_volume.test.sql`), `src/data/agenda.js` (leituras).

**Interfaces — produz:**
- `google_pessoas(perfil_id pk → perfis on delete cascade, email, escopos text[], conectado_em, erro text null,
  segredo_id uuid)`: select só do próprio `perfil_id` e só das colunas `email, conectado_em, erro` (o `segredo_id`
  nunca); escrita só `service_role`. `private.google_conectado(perfil_id) returns boolean` para a gestão saber se o
  consultor conectou (sem expor o e-mail de quem não vê).
- `agenda_eventos(id, consultoria_id, consultor_id → perfis, cliente_id null → clientes, titulo 1..200,
  descricao ≤5000, inicio, fim (> inicio), dia_inteiro, cor smallint 0..7, com_meet, gravar, meet_link, meet_codigo,
  google_evento_id, reuniao text check in ('agendada','aguardando','pasta_criada','sem_artefatos','erro'),
  reuniao_erro, gravacao_url, pasta_id null → cliente_pastas, criado_por, criado_em, atualizado_em)`.
  Índices: (consultoria_id, inicio), (consultor_id, inicio), cliente_id, parcial (fim) where reuniao = 'aguardando'.
- `agenda_participantes(id, evento_id → agenda_eventos on delete cascade, perfil_id null → perfis, email null,
  resposta text check in ('pendente','confirmou','recusou') default 'pendente')`; exatamente um de perfil_id/email;
  unique (evento_id, perfil_id) e (evento_id, lower(email)); no máximo 20 de fora por evento (gatilho).
- Select: pela tabela "Quem vê o quê" do design + participante vê o evento em que foi convidado (e os participantes
  dele). Escrita de eventos e participantes só `service_role` (as Edge Functions mexem no Google).
- RPCs (todas `security definer`, `search_path = ''`, passando por `liberado()`):
  `indicadores_da_agenda(p_dia date) returns jsonb` → `{ semana, mes, aguardando, pastas_no_mes }` no recorte de quem
  chama; `feriados_do_periodo(p_de date, p_ate date) returns setof date` (de `private.feriados_nacionais`).
- `src/data/agenda.js`: `eventosDoPeriodo({ de, ate, consultorId, consultoriaId, clienteId })` (`inicio < ate and
  fim > de`, com participantes e cliente embutidos numa consulta só), `buscarEvento(id)`, `indicadoresDaAgenda(dia)`,
  `ausenciasDoPeriodo({ de, ate, consultorId, consultoriaId })` (tabela `ausencias` que já existe),
  `feriadosDoPeriodo(de, ate)`, `meuGoogle()` → `{ conectado, email, erro }`.
- [ ] **Passo 1:** pgTAP: consultor vê só os seus e os em que foi convidado; colega não vê; gestor vê os da
  consultoria e não de outra; central vê todos; `authenticated` não grava; fim antes do início falha; 21º convidado
  de fora falha; `segredo_id` não é legível; sessão aal1 de quem precisa de 2FA não lê; `performs_within` do período
  com 50 mil eventos. **Passo 2:** FALHA. **Passo 3:** cópia, migração, leituras. **Passo 4:** `npm run test:db`,
  `npm test`. **Passo 5:** commit `Banco da agenda com visão por papel`.

### Task 3: Google de cada pessoa (`google-pessoa`) e cliente do Google

**Arquivos:** `supabase/functions/_shared/agenda/google.ts` (sem imports do Deno; recebe `fetch` e um
`obterToken()`), `supabase/functions/_shared/agenda/google-falso.ts` (Google em memória para os testes),
`supabase/functions/_shared/agenda/tokens.ts` (ler/renovar/gravar o token da pessoa no Vault),
`supabase/functions/google-pessoa/index.ts` (ações `conectar` → URL do Google com `state` assinado; volta do Google
→ troca o código, grava no Vault, redireciona para `/calendario?google=ok|erro`; `desconectar` → revoga no Google e
apaga o segredo), migração com `private.gravar_token_da_pessoa`/`private.ler_token_da_pessoa` (só `service_role`),
`supabase/config.toml`, `tests/integracao/google-pessoa.test.js`, `tests/integracao/google.test.js`,
`src/data/agenda.js` (+ `conectarGoogle()`, `desconectarGoogle()`).

**Interfaces — produz** (`criarGoogle({ fetch, obterToken })` → objeto com):
`criarEvento(evento, { meet, convidados })` → `{ googleEventoId, meetLink, meetCodigo }`, `editarEvento(id, evento,
{ convidados })`, `apagarEvento(id)`, `ligarGravacao(meetCodigo)` (spaces do Meet com gravação e transcrição
automáticas), `artefatosDaReuniao(meetCodigo)` → `{ terminou, fim, gravacaoUrl, transcricao: 'pronta'|'processando'|
'nenhuma', falas: [{ hora, nome, texto }] }`. Erros viram `ErroDoGoogle(codigo: 'reconectar'|'sem_permissao'|
'recusado', mensagem em português)`. Reaproveita `appDoGoogle`, `tokenDoGoogle` e `emailDoGoogle` de
`_shared/integracoes.ts`; escopos em `ESCOPOS_DA_PESSOA`.
- [ ] **Passo 1:** testes com o Google falso: cada função manda o pedido certo (fuso, `sendUpdates=all`,
  `conferenceData`), 401/`invalid_grant` vira `reconectar` e marca `google_pessoas.erro`, falas em ordem; conectar com
  `state` de outra pessoa falha; desconectar apaga o segredo do Vault. **Passo 2:** FALHA. **Passo 3:** implementar,
  registrar, reiniciar o runtime. **Passo 4:** `npm run test:integracao`, `npm run test:db`, `npm test`, lint.
  **Passo 5:** commit `Google de cada pessoa para a agenda`.

### Task 4: Criar, editar, apagar e responder (Edge Function `agenda`)

**Arquivos:** `supabase/functions/_shared/agenda/eventos.ts` (núcleo: `salvarEvento(db, googleDe, quem, dados)`,
`apagarEvento(db, googleDe, quem, id)`, `responder(db, quem, id, resposta)`; `googleDe(perfilId)` devolve o cliente
do Google do organizador ou `null` quando ele não conectou), `supabase/functions/agenda/index.ts`,
`supabase/config.toml`, `src/data/agenda.js` (+ `salvarEvento`, `apagarEvento`, `responderConvite`),
`tests/integracao/agenda.test.js`.

- Permissão pela tabela CRUD do design (consultor nos próprios; gestor/admin nos da consultoria; central/dono em
  todos; participante só responde). Cliente só se quem cria o vê e não está arquivado. Participantes internos só da
  consultoria do consultor; convidados de fora validados (até 20, sem repetir).
- Organizador conectado: grava no Google dele primeiro (convidados = participantes + de fora; Meet com
  `conferenceData` quando `com_meet`; `ligarGravacao` quando `gravar`), depois no banco; Google recusou → nada muda,
  `{ erro }` em português. Organizador sem Google: só no banco, sem Meet, `{ aviso: 'Fica só no app: <nome> não
  conectou o Google.' }`. Apagar: cancela no Google (avisa os convidados) e mantém a pasta da reunião.
  `reuniao` = `'agendada'` quando há Meet.
- [ ] **Passo 1:** testes de integração (banco local + Google falso): consultor cria na própria agenda e não na de
  colega; gestora cria para consultor conectado (vai ao Google dele) e para não conectado (só no app, com aviso);
  outra consultoria recusada; Google recusando não deixa linha; 21 convidados de fora recusado; participante responde
  e não edita; apagar cancela no Google e mantém a pasta. **Passo 2:** FALHA. **Passo 3:** implementar, registrar,
  reiniciar. **Passo 4:** `npm run test:integracao`, `npm test`, lint. **Passo 5:** commit `Eventos da agenda com Meet,
  convidados e gravação`.

### Task 5: Depois da reunião: pasta com transcrição e documentação (`reunioes-depois`)

**Arquivos:** `supabase/functions/_shared/agenda/reuniao.ts` (`fecharReuniao(db, google, ia|null, evento)`;
`documentacaoDaReuniao(evento, artefatos, resumo|null) → string` e `transcricaoEmTexto(falas) → string`, puras),
`supabase/functions/reunioes-depois/index.ts` (cron: todas as reuniões terminadas em `agendada`/`aguardando`; ação
`buscarAgora(id)` e `tentarDeNovo(id)` pela tela, com as permissões de editar), migração do `pg_cron` + `pg_net`
(a cada 10 minutos, segredo no Vault), `supabase/config.toml`, `tests/integracao/reunioes-depois.test.js`,
`src/data/agenda.js` (+ `buscarAgora(id)`, `tentarDeNovo(id)`).

- Reunião terminada → `aguardando`; com o token do **organizador**, `artefatosDaReuniao`; transcrição pronta → cria
  `cliente_pastas` "Reunião dd/MM/yyyy HH:mm — <título>" (`evento_id` preenchido) com `transcricao.txt` e
  `documentacao.md` (título, data/hora, duração, organizador, participantes, links da gravação e do evento; resumo,
  decisões e próximos passos pela IA da consultoria quando conectada em Integrações) no bucket `arquivos`, marca
  `pasta_criada` e grava `cliente_eventos` ("Reunião realizada", "Pasta da reunião criada"). 48 h depois do fim sem
  transcrição → `sem_artefatos`. Organizador sem Google → `erro` "Conecte o Google para buscar a gravação". Erro do
  Google → `erro` com o motivo, sem parar as outras reuniões. Sem cliente no evento: não cria pasta (só marca a
  situação).
- [ ] **Passo 1:** testes de integração com o Google falso cobrindo cada caminho acima e o Review Focus (48 h; sem
  Google; IA desligada gera documentação sem resumo); testes de unidade das funções puras. **Passo 2:** FALHA.
  **Passo 3:** implementar, migração, registrar, reiniciar. **Passo 4:** `npm run test:integracao`, `npm run test:db`,
  `npm test`, lint. **Passo 5:** commit `Pasta da reunião com transcrição e documentação`.

### Task 6: Tela Calendário (layout do Hub)

**Arquivos:** `src/pages/Calendario.jsx` (+ teste), `src/components/calendario/{BarraDoCalendario,
IndicadoresDaAgenda,VisaoMes,VisaoSemana,VisaoAgenda,DetalheDoDia,ProximosDias,ChipDoEvento,JanelaEvento,
DetalheDoEvento,cores}.jsx|js` (+ testes), `src/lib/calendario.js` (+ teste: grade do mês começando no domingo,
semana, próximos 60 dias, eventos que atravessam a meia-noite e de dia inteiro no fuso de SP),
`src/components/shell/menu.js` (item Calendário, ícone `CalendarDays`, animação nova `folhear`), `src/index.css`
(keyframes `icone-folhear` + regras de hover/foco), rota `/calendario`.

- Layout e comportamento do design ("Tela — igual à do Hub" e "Janela de evento"): `BarraDeFiltros` com "Mostrar"
  (Reuniões com cliente, Compromissos, Ausências, Feriados), consultor (`Seletor` com `buscar`, só gestão/central),
  consultoria (só central/dono), cliente (busca), Limpar; "Conectar Google"/selo "Google conectado ✕" e o principal
  "Novo evento". 4 indicadores (`indicadoresDaAgenda`). `AbasSegmentadas` Mês/Semana/Agenda com Hoje ‹ ›; no celular
  a visão inicial é Agenda. "Detalhe do dia" e "Próximos 7 dias" lado a lado no computador. Chip com a cor do evento
  (ou do consultor na visão de mais de uma pessoa), ícone de vídeo com Meet e de pasta quando há pasta.
- `JanelaEvento` (`JanelaFormulario` larga, 2 colunas): campos do design, convidados de fora (sugestão do contato do
  cliente, até 20), chaves Meet e Gravar e transcrever com o aviso do Workspace, aviso do Google; Apagar com
  `ConfirmarAcao` dizendo o que acontece no Google e que a pasta fica; só leitura para quem não edita; participante vê
  Confirmar/Recusar. `DetalheDoEvento`: Entrar no Meet, Abrir gravação, Pasta da reunião (leva à aba Arquivos do
  cliente na pasta), situação da reunião com "Buscar agora"/"Tentar de novo".
- [ ] **Passo 1:** testes de tela por papel (consultor sem filtro de consultor; gestora filtra e o pedido ao banco leva
  o filtro; mudar de visão pede só o novo intervalo; celular abre em Agenda), janela (Editar abre preenchido, cliente
  sugere o contato, 21º convidado recusado na tela, só leitura), apagar com confirmação, `menu.test`/`Trilho.test` com
  a animação, guardas de tipografia e de campos. **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** `npm
  test`, lint, build. **Passo 5:** commit `Menu Calendário no layout do Hub`.

### Task 7: Reuniões no cliente, documentação e conferência

**Arquivos:** `src/components/clientes/AgendaDoCliente.jsx` (+ reuniões do cliente no mês, com link para o evento),
`src/components/clientes/rotulos.js` (eventos "Reunião marcada", "Reunião realizada", "Pasta da reunião criada"),
`README.md` (Google por pessoa: app Interno no Workspace da IXCSoft x Externo verificado para outros domínios, escopos,
Workspace com gravação e transcrição, segredo do `pg_cron` no Vault, URL de volta do `google-pessoa`), `CLAUDE.md`
(seção Agenda: visão por papel, Google da pessoa só no Vault, núcleo sem Deno testado com Google falso),
`scripts/exemplo-local.mjs` (eventos de exemplo idempotentes, sem Google).
- [ ] **Passo 1:** testes de tela da Agenda do cliente com reuniões. **Passo 2:** FALHA. **Passo 3:** implementar e
  documentar. **Passo 4:** todas as suítes, lint, build. **Passo 5:** commit `Reuniões na agenda do cliente e
  documentação do Calendário`. Conferência no navegador pelo controlador (consultor, gestora, central; claro/escuro;
  1440 e 390 px) sem Google real; ponta a ponta com Google real quando o Diego criar o app do Google.
