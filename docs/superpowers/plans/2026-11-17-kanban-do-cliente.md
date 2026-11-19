# Quadro Kanban do cliente — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** aba **Quadro** na página do cliente com o Kanban do Mochi (colunas, cartões com descrição formatada,
prioridade, prazo, responsáveis, checklist, anexos, comentários, arrastar, arquivar, filtros, 4 números, tempo
real), um quadro por cliente e consultoria.

**Arquitetura:** banco (`quadros`, `quadro_colunas`, `cartoes`, `cartao_responsaveis`, `cartao_checklist`,
`cartao_comentarios`, `cartao_anexos`) com RLS por papel e gatilhos de consistência; leitura e operações compostas
por RPCs (`security definer`, `search_path = ''`, por `liberado()`); escrita simples direto pela RLS (não há Google
envolvido); anexos e imagens da descrição num balde privado `quadros`; tempo real por canal privado do Supabase
Realtime alimentado por gatilhos; tela em `src/components/quadro/` no Padrão Hub e na escala de tipografia.

**Tecnologias:** Postgres 17 + RLS, Storage, Supabase Realtime (broadcast privado), React 19, Tailwind 4,
`@hello-pangea/dnd` (ou `@dnd-kit` se o primeiro não funcionar com React 19), TipTap (`@tiptap/react`,
`@tiptap/starter-kit`, extensões de link e imagem), date-fns 3.6.0.

**Spec:** `docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md` (aprovado pelo Diego em 17/11: um quadro
por cliente; central e dono só olham; transferências e "acompanhar" depois). Referência do Mochi (só leitura):
`.superpowers/sdd/avulsos/kanban-hub-inventario.md` e `~/Documents/Karina/src/pages/Kanban.jsx`.

## Restrições globais

- Dados do Diego: nunca `supabase db reset`, nunca apagar o que os testes não criaram, nunca limpar o Storage;
  migração com `npx supabase migration new <nome> < /dev/null` + `npx supabase migration up`; nunca editar migração
  aplicada; antes de cada migração, `docker exec supabase_db_consultoria pg_dump -U postgres --data-only
  --schema=public --schema=auth > supabase/.copias/2026-11-17-antes-<nome>.sql` (conferir o tamanho). API local
  `http://127.0.0.1:54521`; nunca as portas 54321/54721 (outros projetos).
- Quem faz o quê: a tabela "Quem faz o quê" do design (consultor do cliente e admin/gestor da consultoria mexem;
  central/dono só leem; apagar cartão: quem criou ou a gestão; apagar coluna: só a gestão; comentário: editar e
  apagar os próprios, a gestão apaga qualquer um; anexo: apagar os que enviou, a gestão todos). Cliente arquivado:
  quadro só para ler. Uma consultoria nunca vê o quadro de outra (o quadro é da consultoria que atende; ver o
  design, "Cliente muda de consultoria").
- Toda tabela nova: RLS ligado, `GRANT` explícito só para `authenticated`, funções em `private`, pgTAP; funções
  novas passam por `private.liberado()`.
- Escala: contagens, filtros e busca no banco; cartões lidos por coluna em páginas (50 por coluna, "ver mais");
  nada de chamada ao banco por cartão; índice em toda coluna de filtro, ordem e junção; teste de volume (milhares de
  cartões num quadro, dezenas de milhares no total).
- Ordem por posição fracionária (`numeric`), renumerando a coluna só quando o espaço entre vizinhos acaba.
- Descrição: JSON do TipTap (`jsonb`) + `descricao_texto` para a busca; nunca HTML cru; imagem só por upload no
  balde `quadros` (caminho no nó, URL assinada ao mostrar).
- Anexos: até 25 MB, qualquer tipo, balde privado `quadros`, pasta `<cliente_id>/<cartao_id>/`; anexo não se edita;
  apagar cartão apaga anexos e imagens (linha, depois objeto, como em Arquivos).
- Padrão Hub, botões animados, CRUD com confirmação dizendo o que some junto, tipografia da escala, campos de
  `src/components/campos/`, textos em português. Versões exatas de toda biblioteca nova (`--save-exact`).
- Node 26; vitest só com `--project`; nunca dois `test:db` juntos; nunca `git stash`, trocar de branch, push.

## Review Focus

- Arrastar um cartão com outra pessoa mexendo no mesmo quadro: a posição final é a do banco, ninguém perde cartão e
  a tela de quem não arrastou se atualiza sozinha.
- Consultor que deixou de ser o consultor do cliente (ou cliente que mudou de consultoria) perde o quadro na hora,
  inclusive o canal de tempo real.
- Apagar coluna com cartões: a tela pergunta para qual coluna eles vão; nada some sem a escolha explícita.
- Colar texto formatado de fora na descrição (Word, página da web) não traz HTML cru nem imagem externa.
- Quadro com 2.000 cartões abre rápido e rola sem travar (páginas por coluna).

---

### Task 1: Banco do quadro

**Arquivos:** migração `quadro` (tabelas, RLS, gatilhos, índices, RPCs), `supabase/tests/database/quadro.test.sql`
(+ `quadro_volume.test.sql`), `src/data/quadro.js` (+ testes).

**Interfaces — produz:**
- `quadros(id, cliente_id, consultoria_id, criado_em)`, único (cliente_id, consultoria_id).
- `quadro_colunas(id, quadro_id, nome 1..60, cor smallint 0..9 null, concluidos bool, posicao numeric)`.
- `cartoes(id, quadro_id, coluna_id, titulo 1..200, descricao jsonb null, descricao_texto text, prioridade text
  check in ('baixa','media','alta') null, prazo date null, posicao numeric, arquivado_em timestamptz null,
  criado_por, criado_em, atualizado_em)`.
- `cartao_responsaveis(cartao_id, perfil_id)` (pk dupla), `cartao_checklist(id, cartao_id, texto 1..300, feito,
  posicao)`, `cartao_comentarios(id, cartao_id, autor_id, texto 1..2000, criado_em, editado_em)`.
- Gatilhos: coluna do mesmo quadro; responsável enxerga o cliente (consultor do cliente ou admin/gestor da
  consultoria, ativo); `descricao_texto` derivado do JSON; `atualizado_em`.
- RPCs: `quadro_do_cliente(p_cliente uuid) returns jsonb` (devolve o quadro da consultoria que atende; cria com "A
  fazer", "Em andamento", "Concluído" (concluidos) na primeira vez, só para quem mexe; central/dono recebem o quadro
  existente ou nulo); `cartoes_do_quadro(p_quadro, p_coluna, p_pagina, p_busca, p_prioridade, p_responsavel,
  p_prazo) returns jsonb` (`{ itens, total }` com responsáveis (nome, cor), total e feitos do checklist, quantidade
  de comentários e anexos — numa consulta); `indicadores_do_quadro(p_quadro, filtros)` (cartões, atrasados, vencem
  em 7 dias, sem responsável — sem arquivados e sem os de colunas de concluídos para os prazos);
  `mover_cartao(p_cartao, p_coluna, p_antes uuid null, p_depois uuid null)`; `mover_coluna(p_coluna, p_antes,
  p_depois)`; `apagar_coluna(p_coluna, p_destino uuid null)` (com cartões e sem destino → recusa; a última coluna não
  se apaga); `pessoas_do_quadro(p_quadro)` (quem pode ser responsável: id, nome, cor); `cartoes_arquivados(p_quadro,
  p_busca, p_pagina)`.
- `src/data/quadro.js`: uma função por RPC + criar/editar/arquivar/restaurar/apagar cartão, coluna, item do
  checklist, comentário (escrita direta pela RLS), com `{ itens, total }`/`{ erro }` e `traduzirErroBanco`.
- [ ] **Passo 1:** pgTAP por papel (consultor do cliente e gestão mexem; colega que não é consultor do cliente não
  vê; central lê e não grava; outra consultoria não vê; cliente arquivado só leitura; cliente que muda de consultoria
  → a antiga perde o quadro; responsável de fora recusado; apagar coluna sem destino com cartões recusado; mover
  mantém a ordem e renumera quando falta espaço) + volume (2.000 cartões num quadro, 50 mil no total: abrir colunas
  e indicadores rápido, EXPLAIN sem Seq Scan). **Passo 2:** FALHA. **Passo 3:** cópia, migração, leituras.
  **Passo 4:** `npm run test:db`, `npm test`, `npm run test:integracao` (a camada de dados contra a API real).
  **Passo 5:** commit `Banco do quadro Kanban do cliente`.

### Task 2: Anexos e imagens da descrição

**Arquivos:** migração `quadro_anexos` (`cartao_anexos(id, cartao_id, caminho único, nome, tamanho ≤ 25 MB, tipo,
enviado_por, enviado_em)`, balde privado `quadros`, políticas do Storage pelo cartão, limpeza ao apagar cartão),
`supabase/tests/database/quadro_anexos.test.sql`, `src/data/quadro.js` (+ `enviarAnexo`, `apagarAnexo`,
`enviarImagemDaDescricao`, `urlAssinada`), `tests/integracao/quadro.test.js`.
- Molde: `cliente_arquivos` (migração `20261116181430_arquivos_do_cliente.sql`, `src/data/arquivos.js`): linha e
  objeto consistentes, "quem apagou" para tirar o objeto depois da linha; imagem da descrição no mesmo balde, em
  `<cliente_id>/<cartao_id>/imagens/`; apagar cartão remove os objetos dele.
- [ ] **Passo 1:** pgTAP (quem vê o cartão baixa; quem não vê, não; apagar anexo: quem enviou ou a gestão) e
  integração (enviar, baixar por URL assinada, apagar cartão limpa o Storage). **Passo 2:** FALHA. **Passo 3:** cópia,
  migração, implementar. **Passo 4:** `npm run test:db`, `npm run test:integracao`, `npm test`. **Passo 5:** commit
  `Anexos e imagens dos cartões`.

### Task 3: Tempo real

**Arquivos:** migração `quadro_ao_vivo` (gatilhos em `quadro_colunas`, `cartoes`, `cartao_responsaveis`,
`cartao_checklist`, `cartao_comentarios`, `cartao_anexos` mandando `realtime.broadcast_changes` (ou
`realtime.send`) no tópico `quadro:<quadro_id>`; política em `realtime.messages` que só deixa entrar no canal quem
vê o quadro), `src/data/quadroAoVivo.js` (`ouvirQuadro(quadroId, aoMudar) → parar()`), testes (pgTAP da política;
integração com dois clientes: o que um muda o outro recebe; quem não vê o quadro não entra no canal).
- Se o canal privado não funcionar no ambiente local, plano B no mesmo arquivo: recarregar ao voltar para a aba e a
  cada 30 s (o design aceita e o relatório avisa).
- [ ] **Passo 1:** testes. **Passo 2:** FALHA. **Passo 3:** cópia, migração, implementar. **Passo 4:** `npm run test:db`,
  `npm run test:integracao`, `npm test`. **Passo 5:** commit `Quadro em tempo real`.

### Task 4: Tela do quadro

**Arquivos:** `src/components/quadro/{QuadroDoCliente,BarraDoQuadro,IndicadoresDoQuadro,Coluna,CartaoNoQuadro,
NovaColuna,JanelaNovoCartao,JanelaArquivados,ApagarColuna,cores}.jsx|js` (+ testes),
`src/components/clientes/AbasDoCliente.jsx`/`src/pages/Cliente.jsx` (aba **Quadro** depois de Geral),
`package.json` (`@hello-pangea/dnd` exato).
- Layout do Mochi (inventário "Colunas", "Cartões", "Filtros e topo", "UI"): colunas de 300 px com rolagem
  horizontal; cabeçalho com contador e cor; "+ Nova coluna" no fim; renomear no lugar; cor (10) e "Coluna de
  concluídos"; reordenar colunas arrastando; apagar coluna (só gestão) com `ApagarColuna` perguntando o destino dos
  cartões (padrão: a coluna anterior) ou "apagar junto" com confirmação dizendo quantos; cartão com prioridade,
  selo de prazo ("atrasado há N dias", "Hoje", "Amanhã"), até 3 rostos + "+N", progresso do checklist, ícones de
  comentários/anexos; arrastar cartões (otimista; se o banco recusar, volta e avisa); com filtro ligado, arrastar
  desligado com aviso. `BarraDeFiltros`: busca, Prioridade, Responsável (com "Sem responsável"), Prazo (Atrasados,
  Próximos 7 dias, Sem prazo), Limpar; à direita Arquivados e **Novo cartão**. 4 números. Janela de arquivados em
  `Tabela` paginada (Restaurar, Apagar com confirmação). Central/dono e cliente arquivado: só leitura (sem arrastar,
  sem botões de mexer). Atualiza com `ouvirQuadro`.
- [ ] **Passo 1:** testes de tela por papel (consultor mexe; central só lê; colega sem acesso não vê a aba),
  arrastar chama `mover_cartao` com os vizinhos certos e volta se der erro, filtro desliga o arrastar, apagar coluna
  pede o destino, arquivados com paginação, guardas (tipografia, botões, campos, formulários). **Passo 2:** FALHA.
  **Passo 3:** implementar. **Passo 4:** `npm test`, lint, build. **Passo 5:** commit `Aba Quadro no cliente`.

### Task 5: Janela do cartão

**Arquivos:** `src/components/quadro/{JanelaDoCartao,EditorDaDescricao,ChecklistDoCartao,ComentariosDoCartao,
AnexosDoCartao,LateralDoCartao}.jsx` (+ testes), `package.json` (TipTap exato).
- Janela larga como no Mochi: principal (título, descrição com TipTap — negrito, itálico, sublinhado, tachado,
  títulos, listas, citação, código, link, imagem por upload; colar limpa HTML e recusa imagem externa — checklist com
  barra de progresso); lateral (Coluna, Prazo com atalhos Hoje/Amanhã/Sexta, Prioridade, Responsáveis de
  `pessoas_do_quadro`); rodapé (Comentários: 30 mais recentes + "ver anteriores", editar/apagar os próprios
  ("· editado"); Anexos: enviar/arrastar, baixar, apagar). Grava campo a campo com "Salvando… / Salvo / Erro ao
  salvar" (descrição com espera de 900 ms). Cabeçalho "coluna · criado em … por …". Arquivar e Apagar (confirmação
  dizendo que checklist, comentários e anexos somem). Só leitura para quem não mexe.
- Padrão Hub: a janela do cartão grava campo a campo (sem botão Salvar), como exceção registrada (Task 6).
- Clicar num cartão abre esta janela; depois de criar pelo "Novo cartão" (Task 4), ela abre já no cartão novo
  (como no Mochi: "a janela continua aberta para completar").
- [ ] **Passo 1:** testes (abre preenchida; cada campo grava sozinho e mostra o estado; colar HTML vira texto
  formatado seguro; imagem sobe para o balde e aparece pela URL assinada; checklist e comentários com permissões;
  apagar com confirmação). **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** `npm test`, lint, build.
  **Passo 5:** commit `Janela do cartão com descrição, checklist, comentários e anexos`.

### Task 6: Documentação, exemplo e conferência

**Arquivos:** `CLAUDE.md` (seção "Quadro (Kanban)": quem faz o quê, um quadro por cliente e consultoria, posição
fracionária, tempo real por canal privado; exceção do Padrão Hub para a janela do cartão que grava campo a campo),
`README.md` (balde `quadros`, Realtime na nuvem), `scripts/exemplo-local.mjs` (um quadro de exemplo com cartões
para um cliente da Consultoria Exemplo, idempotente, sem tocar nos dados reais).
- [ ] **Passo 1:** documentar e o script (o controlador roda). **Passo 2:** `npm test`, lint, build. **Passo 3:** commit
  `Documentação do Quadro e exemplo`. Conferência no navegador pelo controlador (consultor, gestora, central;
  claro/escuro; 1440 e 390 px; dois navegadores no mesmo quadro para o tempo real).
