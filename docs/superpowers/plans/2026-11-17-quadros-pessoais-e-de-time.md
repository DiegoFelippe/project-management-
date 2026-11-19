# Quadros pessoais e de time no menu — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** item **Quadros** no trilho, para todos os papéis, com quadros pessoais (vários por pessoa, só ela vê) e de
time (vários por time; membros e gestor do time mexem; renomear, arquivar e apagar só o gestor do time e o admin):
seletor com busca no banco e grupos Favoritos/Recentes/Meus/Dos times, estrela, menu "⋯" (Novo quadro, Quadros
arquivados, Renomear, Arquivar, Apagar), e dentro o mesmo Kanban do quadro do cliente. O quadro do cliente não muda.

**Arquitetura:** a tabela `quadros` ganha um tipo de dono (`cliente | pessoa | time`) com `pessoa_id`, `time_id`,
`nome`, `arquivado_em` e uma regra que exige exatamente um dono; as quatro regras (`vejo_quadro`, `mexo_no_quadro`,
`gerencio_quadro`, nova `administro_quadro`) e `meus_quadros()` ganham um ramo por tipo, com o do cliente sem mudar;
colunas, cartões, checklist, comentários, anexos e tempo real continuam os mesmos (penduram em `quadro_id`). Storage no
mesmo balde `quadros`, pasta `quadro/<id>/` para os novos (a do cliente continua `<cliente_id>/`). Favoritos numa tabela
própria; recentes e último quadro no `localStorage` (só ids, conferidos no banco). Na tela, o corpo de `QuadroDoCliente`
vira `QuadroKanban`, usado pela aba do cliente e pela página nova `Quadros`.

**Tecnologias:** Postgres 17 + RLS, pgTAP, Storage, Supabase Realtime (canal privado que já existe), React 19, Tailwind 4,
`@hello-pangea/dnd` 18.0.1 e TipTap 3.32.2 (já no projeto), lucide-react (`SquareKanban`). Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md` (proposta aprovada pelo Diego em
17/11, "Pode seguir"; as decisões próprias estão no fim do design e o Diego confere). Base do quadro do cliente:
`docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md`, `docs/superpowers/plans/2026-11-17-kanban-do-cliente.md`,
registro `.superpowers/sdd/2026-11-17-kanban-do-cliente/progress.md`. Mochi: `.superpowers/sdd/avulsos/kanban-hub-inventario.md`.

**Ordem:** T1 → T2 → T3 → T4 → T5. A T3 é só da tela (sem banco) e pode ir antes ou junto da T1 (arquivos diferentes;
ela não roda `test:db`).

## Restrições globais

- Dados do Diego: nunca `supabase db reset`, nunca apagar o que os testes não criaram, nunca limpar o Storage;
  migração com `npx supabase migration new <nome> < /dev/null` + `npx supabase migration up` (se ela recusar por causa de
  migração mais antiga ainda não aplicada, de outra frente, conferir que é independente e usar
  `npx supabase migration up --include-all`); nunca editar migração aplicada; antes de cada migração, `docker exec
  supabase_db_consultoria pg_dump -U postgres --data-only --schema=public --schema=auth >
  supabase/.copias/$(date +%F)-antes-<nome>.sql` (conferir o tamanho). API local `http://127.0.0.1:54521`; nunca as
  portas 54321/54721 (outros projetos). Nenhuma Edge Function nova.
- Quem faz o quê: as duas tabelas do design ("Quadro pessoal" e "Quadro do time"). Quadro pessoal: só a pessoa, na
  consultoria em que o quadro nasceu. Quadro do time: membros, gestor do time e admin da consultoria veem e mexem;
  apagar coluna e apagar o que é dos outros: gestor do time e admin; renomear/arquivar/restaurar/apagar o quadro: gestor
  do time e admin. Central e dono: só os quadros pessoais deles. Quadro arquivado: só leitura para todos. Uma consultoria
  nunca vê quadro de outra.
- **O quadro do cliente não muda:** o ramo do cliente nas regras fica com o mesmo texto; `quadro_do_cliente` e
  `quadros_do_cliente` não são redefinidos; os caminhos `<cliente>/<cartão>/…` ficam iguais. As suítes
  `quadro.test.sql`, `quadro_anexos.test.sql`, `quadro_ao_vivo.test.sql`, `quadros_da_central.test.sql`,
  `quadro_volume.test.sql`, `tests/integracao/quadro.test.js`, `quadroAoVivo.test.js` e `QuadroDoCliente.test.jsx` passam
  **sem mudar nenhuma asserção**. Se uma precisar mudar, parar e relatar (NEEDS_CONTEXT) com qual e por quê.
- Funções redefinidas: `create or replace` a partir do **corpo mais novo** (`mover_cartao` e `apagar_coluna` em
  `20261117180156_quadro_travas_em_ordem.sql`; `preparar_coluna`, `preparar_cartao`, `validar_responsavel`,
  `preparar_item_do_checklist`, `preparar_anexo`, `cartao_do_objeto`, `apagar_cartao`, `cartoes_do_quadro`,
  `cartao_do_quadro` em `20261117125011_quadro_anexos.sql`; `quadro_por_id`, `cartoes_arquivados` em
  `20261117153048_quadros_da_central.sql`), com o comentário "Mesmo corpo de <migração>; muda só …" e os grants
  repetidos no fim. Regras de leitura recriadas **com os mesmos nomes** (o pgTAP confere `policies_are`).
- Toda tabela nova: RLS ligado, `GRANT` explícito só para `authenticated`, funções em `private`, pgTAP; funções novas
  passam por `private.liberado()` e são `security definer` com `search_path = ''`; sem oráculo de existência (quem não vê
  recebe `sem_permissao`/nulo sem saber se o quadro existe).
- Escala: milhares de quadros por consultoria; seletor e arquivados com limite e busca no banco (`{ itens, total }`), 15
  por página nos arquivados; contagem de cartões só dos itens devolvidos; índice em toda coluna de filtro, ordem e
  junção; teste de volume com EXPLAIN sem Seq Scan em `quadros`.
- Padrão Hub e o molde de "Tela nova" (menu → cabeçalho → barra → conteúdo; **sem cartões de números**, decisão 7 do
  design), botões animados, CRUD com confirmação dizendo o que some junto (apagar quadro oferece arquivar), tipografia da
  escala (`tabular-nums` nas contagens), campos só de `src/components/campos/`, largura toda, claro e escuro, 360 px sem
  rolar para o lado, textos em português.
- Node 26; vitest só com `--project` (`npm test` = unidade; `npm run test:integracao`; um arquivo:
  `npx vitest run --project unidade <arquivo>`); nunca dois `test:db` juntos e nunca `test:integracao` durante um
  `test:db`; nunca `git stash`, trocar de branch ou push. Outro agente pode estar commitando no mesmo checkout: `git add`
  só com os arquivos da tarefa (nunca `-A`); com `index.lock`, esperar alguns segundos e tentar de novo. Versões exatas
  (`--save-exact`) se alguma biblioteca entrar (não deve).

## Review Focus

- **Quadro pessoal vazando para o admin (ou a central, o dono, um colega):** por leitura direta das tabelas (a regra de
  hoje "a central lê tudo" precisa virar "a central lê os do cliente"), por qualquer função (`quadro_por_id`,
  `cartoes_do_quadro`, `cartao_do_quadro`, `comentarios_do_cartao`, `anexos_do_cartao`, `pessoas_do_quadro`,
  `quadros_por_ids` com id adivinhado, contagem no seletor), pelo Storage (link assinado, lista e as "sobras" que a
  central pode tirar) e pelo canal `quadro:<id>`.
- **Quem saiu do time continua mexendo:** com o quadro aberto e o canal ligado, ser tirado do time (ou mudar de
  consultoria, ou o gestor ser trocado) faz o canal avisar; a releitura dá "sem acesso"; qualquer gravação pendente é
  recusada (42501) sem perder o que a tela mostrava de forma enganosa; o favorito e os recentes não mostram mais o quadro.
- **Quadros do cliente quebrados pela generalização:** regras novas com ramo por tipo (junção com `clientes` virou
  `left join`?), `on conflict (cliente_id, consultoria_id)` de `quadro_do_cliente`, a central lendo quadros de
  consultorias anteriores, caminhos do Storage do cliente e as "sobras" depois de apagar o cliente, tempos do
  `quadro_volume`. As suítes antigas passam sem mudar.
- **Colisão de caminhos no Storage:** `<cliente>/…` e `quadro/<quadro>/…` nunca se confundem; caminho com a pasta de
  outro quadro, de outro cartão, ou na forma do cliente para um cartão pessoal (e o contrário) é recusado ao subir, na
  linha do anexo e na imagem da descrição; apagar o quadro tira todos os objetos dele (lotes de 1.000) e nada de outro.
- **A memória do último quadro abrindo o que a pessoa perdeu:** o `localStorage` guarda só ids por pessoa; a tela nunca
  mostra nada antes de o banco devolver o quadro; quadro sumido, arquivado, de cliente ou de outra pessoa (mesmo
  navegador, outro login) cai no próximo da ordem sem erro e sai da memória.

---

### Task 1: Banco — quadros pessoais e de time

**Arquivos:** migração `quadros_pessoais_e_de_time`; `supabase/tests/database/quadros_pessoais_e_de_time.test.sql`;
`tests/integracao/quadrosDoMenu.test.js` (Storage e canal; os quadros são criados com a chave de serviço, `criar_quadro`
chega na Task 2).

**Interfaces — produz:**
- `quadros`: `tipo text not null default 'cliente'` (check `cliente | pessoa | time`), `cliente_id` e `consultoria_id`
  passam a aceitar nulo, `pessoa_id uuid references perfis on delete restrict`, `time_id uuid references times on delete
  restrict`, `nome text`, `nome_busca text generated always as (private.sem_acento(btrim(nome))) stored`, `arquivado_em
  timestamptz`, `criado_por uuid references perfis on delete set null`; check `quadros_um_dono` (texto no design);
  únicos parciais do nome aberto (pessoal com `nulls not distinct` em `(pessoa_id, consultoria_id, nome_busca)`; do time
  em `(time_id, nome_busca)`); índices do design.
- `private.preparar_quadro()` + gatilho `quadros_preparar` (before insert or update): nome sem espaços nas pontas;
  `criado_por`; consultoria do time; hora do banco ao arquivar.
- `private.pasta_do_quadro(p_quadro uuid) returns text` (`<cliente_id>` | `quadro/<id>`); `private.estou_no_time(p_time
  uuid) returns boolean` (membro ou gestor, na consultoria de quem pergunta, liberado).
- `private.vejo_quadro(uuid)`, `private.mexo_no_quadro(uuid)`, `private.gerencio_quadro(uuid)`, `private.meus_quadros()`
  (mesmas assinaturas, ramo por tipo; o do cliente com o mesmo texto) e a nova `private.administro_quadro(p_quadro uuid)
  returns boolean` (pessoal: a pessoa; do time: admin ou gestor do time; cliente: falso; vale com o quadro arquivado).
- Regras: "ver quadros" (`((select private.sou_central()) and tipo = 'cliente') or id in (select private.meus_quadros())`),
  "ver colunas" e "ver cartões" (a central só com `exists` no quadro de cliente) recriadas com os mesmos nomes; nova
  "renomear e arquivar quadro" (update, `administro_quadro(id)` no using e no with check) + `grant update (nome,
  arquivado_em) on quadros to authenticated`. Insert e delete em `quadros` continuam sem permissão.
- `private.validar_responsavel()` e `public.pessoas_do_quadro(uuid, text, int)` por tipo (pessoal: só a pessoa, ativa;
  do time: membros e gestor do time, ativos).
- Storage: `private.caminho_do_quadro(text)` reconhece também `quadro/<uuid>/<uuid>/<uuid>-<nome>` e
  `quadro/<uuid>/<uuid>/imagens/<uuid>.<ext>`; `private.cartao_do_objeto(text)` confere o cartão e a pasta do quadro
  dele (forma do cliente só para quadro de cliente; `quadro/<id>` só para os outros); `private.objetos_no_balde(p_prefixo
  text) returns setof text` (prefixo terminado em `/`, pelo índice `name collate "C"`); `preparar_cartao`,
  `preparar_anexo`, `lembrar_objetos_dos_cartoes_apagados`, `apagar_cartao`, `apagar_coluna` usando
  `pasta_do_quadro`; `private.posso_tirar_objeto_do_quadro(text, text)`: a central só na forma do cliente, e quem
  administra o quadro tira sobra da pasta `quadro/<id>/` enquanto ele existe; a regra de forma de
  `cartao_anexos.caminho` trocada (nome lido de `pg_constraint`) por uma que aceita as duas formas com o `cartao_id` no
  lugar certo. As regras "quadros: enviar / ver / tirar" do Storage não mudam de texto.
- Tempo real: `private.avisar_acesso_aos_quadros_do_time()` (gatilhos em `time_membros` insert/delete e `times` update of
  `gestor_id`: `{ tabela, operacao, acesso: true }` em cada quadro do time) e `private.avisar_quadro_mudou()` (gatilhos
  em `quadros` update of `nome, arquivado_em` e delete: o mesmo aviso no canal do quadro). Canal, tópico e regra de
  `realtime.messages` iguais.
- `public.quadro_por_id(uuid)`: as chaves de hoje + `tipo`, `nome`, `time: { id, nome } | null`, `arquivado_em`,
  `pode_administrar`.

- [ ] **Passo 1 — testes:** pgTAP `quadros_pessoais_e_de_time.test.sql`, por papel e com `set local role authenticated`
  + `request.jwt.claims`:
  - "quadro pessoal: a pessoa vê, mexe, gere e administra" (`vejo/mexo/gerencio/administro` = true; cria coluna, cartão,
    comentário; renomeia e arquiva pelo update).
  - "quadro pessoal: admin, gestor, colega, central e dono não veem" (as quatro regras = false; `select` em `quadros`,
    `quadro_colunas`, `cartoes`, `cartao_comentarios`, `cartao_anexos` = 0 linhas; `quadro_por_id` nulo;
    `cartoes_do_quadro`/`cartoes_arquivados`/`pessoas_do_quadro` = `sem_permissao`; `cartao_do_quadro` e
    `comentarios_do_cartao` nulos; update de nome = 0 linhas).
  - "quadro pessoal fica na consultoria onde nasceu" (muda `perfis.consultoria_id` → some; volta → aparece; central/dono
    com quadro de consultoria nula).
  - "quadro do time: membro e gestor mexem; admin vê, mexe e administra; membro não administra nem apaga coluna; gestor
    de outro time, consultor fora do time, central, dono e outra consultoria não veem".
  - "tirar do time tira o acesso na hora" (delete em `time_membros` → `vejo_quadro` false; `mexo` false; troca de gestor
    passa a administração).
  - "quadro arquivado: só leitura para todos; administro continua; restaurar volta a mexer".
  - "responsável: no pessoal só a pessoa; no do time membros e gestor ativos; admin fora do time recusado; quem saiu fica
    nos cartões" (`responsavel_invalido`).
  - "um dono só": insert com dois donos, sem dono, tipo trocado, nome no do cliente, arquivado no do cliente → 23514.
  - "nome: 1..80, único entre os abertos por pessoa+consultoria e por time, sem acento e sem maiúscula; arquivar libera;
    restaurar com nome repetido → 23505".
  - "o quadro segura o time": delete em `times` com quadro (aberto ou arquivado) → 23503.
  - "Storage: caminho `quadro/<q>/<c>/…` aceito para quem mexe; forma do cliente para cartão pessoal, pasta de outro
    quadro e `quadro/<q>/` para cartão de cliente recusados (`posso_subir_no_quadro` false, linha do anexo
    `caminho_invalido`, imagem `imagem_invalida`); a central não vê nem tira objeto sem uso em `quadro/…`; quem
    administra tira sobra da pasta do quadro".
  - "canal: `vejo_canal_do_quadro('quadro:<pessoal>')` false para o admin; aviso de acesso ao tirar do time, ao trocar
    o gestor, ao renomear, arquivar e apagar" (conferido em `realtime.messages`, como em `quadro_ao_vivo.test.sql`).
  - "a central lê os quadros do cliente como antes" (select direto e `quadro_por_id` de consultoria anterior) e "o
    quadro do cliente nasce com tipo cliente" (`quadro_do_cliente`).
  Integração `tests/integracao/quadrosDoMenu.test.js`: "a pessoa sobe anexo e imagem no quadro pessoal e baixa pela URL
  assinada; o admin e a central não baixam nem listam"; "upload com a pasta do cliente para cartão pessoal é recusado";
  "o admin não entra no canal do quadro pessoal"; "membro tirado do time recebe o aviso de acesso e é recusado ao entrar
  de novo".
- [ ] **Passo 2:** rodar e ver FALHAR (`npm run test:db`; `npx vitest run --project integracao
  tests/integracao/quadrosDoMenu.test.js`).
- [ ] **Passo 3:** cópia, `npx supabase migration new quadros_pessoais_e_de_time < /dev/null`, escrever, `npx supabase
  migration up`.
- [ ] **Passo 4:** `npm run test:db` (tudo; as cinco suítes antigas do quadro sem mudar), depois `npm run
  test:integracao` (as do quadro e a nova; nunca durante o `test:db`), `npm test`.
- [ ] **Passo 5:** commit `Banco: quadros pessoais e de time`.

### Task 2: Banco — lista, favoritos e o que se faz com o quadro

**Arquivos:** migração `quadros_do_menu`; `supabase/tests/database/quadros_do_menu.test.sql` (+
`quadros_do_menu_volume.test.sql`); `src/data/quadros.js` (+ `quadros.test.js`); `src/lib/quadrosRecentes.js` (+ teste);
`src/lib/erros.js` (+ teste); `tests/integracao/quadrosDoMenu.test.js` (continua).

**Interfaces — produz:**
- `quadro_favoritos(perfil_id default auth.uid() references perfis on delete cascade, quadro_id references quadros on
  delete cascade, criado_em, primary key (perfil_id, quadro_id))`, índice `(quadro_id)`; RLS: lê e apaga os seus; insere
  só para si e só quadro pessoal ou de time que vê (`vejo_quadro`); `grant select, insert (quadro_id), delete`.
- `public.criar_quadro(p_nome text, p_time uuid default null) returns jsonb` → `{ id }`. Sem time: pessoal (todos os
  papéis, consultoria = a de quem cria). Com time: `estou_no_time(p_time)` ou admin da consultoria do time. Nasce com "A
  fazer", "Em andamento" e "Concluído" (`concluidos`). Erros: `sem_permissao`, `time_invalido`, 23514 (nome), 23505
  (nome repetido).
- `public.apagar_quadro(p_quadro uuid) returns jsonb` → `{ caminhos }` (todos os objetos de `quadro/<id>/`). Só
  `administro_quadro`; trava o quadro, apaga os cartões (os gatilhos lembram quem apagou cada objeto e avisam o canal),
  depois o quadro (colunas e favoritos saem junto). Senão `sem_permissao`.
- `public.quadros_para_escolher(p_busca text default null, p_limite int default 20) returns jsonb` → `{ favoritos,
  meus, dos_times }`, cada um `{ itens, total }`; item `{ id, nome, tipo, time: { id, nome } | null, cartoes, favorito }`;
  só abertos e que a pessoa vê; busca sem acento em `nome_busca`; ordem por nome (Dos times: nome do time, depois do
  quadro); central e dono: `dos_times` vazio; `p_limite` de 1 a 50.
- `public.quadros_por_ids(p_ids uuid[]) returns jsonb` → `[item]` na ordem dos ids (até 20), só pessoais e de time
  abertos que a pessoa vê (o resto some sem erro).
- `public.quadros_arquivados(p_busca text default null, p_tipo text default null, p_pagina int default 1) returns jsonb`
  → `{ itens: [item + arquivado_em, pode_administrar], total }`, mais recentes primeiro, 15 por página; `p_tipo` `pessoa |
  time | null` (outro: `filtro_invalido`).
- `public.times_para_novo_quadro(p_busca text default null, p_limite int default 50) returns jsonb` → `{ itens: [{ id,
  nome }], total }` (times em que a pessoa está ou é gestora; o admin, todos os da consultoria).
- `public.quadro_por_id(uuid)` + `favorito`.
- `src/data/quadros.js`: `QUADROS_ARQUIVADOS_POR_PAGINA = 15`; `quadrosParaEscolher({ termo, limite })`,
  `quadrosPorIds(ids)`, `quadrosArquivados({ busca, tipo, pagina })`, `timesParaNovoQuadro({ termo })` (leituras: lançam o
  erro, como `ler` de `quadro.js`); `criarQuadro({ nome, timeId })` → `{ id, erro }`, `renomearQuadro(id, nome)`,
  `arquivarQuadro(id)`, `restaurarQuadro(id)`, `marcarFavorito(quadroId, favorito)` → `{ erro }` (update/insert/delete
  direto; 0 linhas = sem permissão); `apagarQuadro(id)` → `{ erro, aviso }` (tira os objetos em lotes de 1.000; o que não
  sair vira `aviso`, como `apagarCartao`).
- `src/lib/quadrosRecentes.js`: `lerMemoria(perfilId) → { ultimo, recentes }`, `lembrarQuadro(perfilId, quadroId)`,
  `esquecerQuadro(perfilId, quadroId)`; chave `ixc.quadros.<perfilId>`, só uuids válidos, até 8 recentes, tudo em
  `try/catch` (sem armazenamento: memória vazia).
- `src/lib/erros.js`: `traduzirErroBanco(erro, { sobre: 'quadro' })` — 23505 "Já existe um quadro aberto com esse
  nome."; 23503 com `sobre: 'time'` "Este time tem quadros (abertos ou arquivados). Apague os quadros dele em Quadros
  antes de apagar o time."; `time_invalido`.

- [ ] **Passo 1 — testes:** pgTAP `quadros_do_menu.test.sql`: "criar pessoal (todos os papéis) e do time (membro,
  gestor, admin; fora do time e central recusados), com as três colunas"; "nome repetido entre abertos → 23505";
  "renomear/arquivar/restaurar só quem administra (membro: 0 linhas)"; "apagar_quadro: só quem administra; leva colunas,
  cartões, comentários, anexos e favoritos; devolve os caminhos da pasta do quadro e nada de outra"; "quadros_para_escolher:
  grupos certos por papel (admin vê todos os do time da consultoria; membro só os dos times dele; central sem Dos times),
  nunca pessoal de outro, nunca arquivado, contagem só de cartões não arquivados, busca sem acento, limite e total";
  "quadros_por_ids não devolve quadro pessoal de outro, de cliente, arquivado nem de outra consultoria"; "arquivados: 15
  por página, filtro por tipo, `pode_administrar`"; "favoritos: só os seus; não favorita quadro que não vê nem de
  cliente; somem da lista ao perder o acesso e voltam ao recuperar"; "times_para_novo_quadro por papel". Volume
  `quadros_do_menu_volume.test.sql`: 5.000 quadros numa consultoria (2.000 pessoais de 400 pessoas, 3.000 de 300 times),
  um quadro com 2.000 cartões, 500 favoritos; `quadros_para_escolher` (admin e membro, com e sem busca),
  `quadros_arquivados` e `quadro_por_id` com média < 50 ms e EXPLAIN sem Seq Scan em `quadros`. Unidade:
  `quadros.test.js` (parâmetros de cada chamada, `{ itens, total }`, `apagarQuadro` em lotes e aviso), `quadrosRecentes`
  (por pessoa, só uuid, até 8, sem armazenamento não quebra), `erros` (mensagens novas). Integração: "criar, renomear,
  arquivar, restaurar e apagar pela API real; apagar tira os objetos do balde".
- [ ] **Passo 2:** ver FALHAR.
- [ ] **Passo 3:** cópia, `npx supabase migration new quadros_do_menu < /dev/null`, escrever, `npx supabase migration up`;
  `src/data/quadros.js`, `src/lib/quadrosRecentes.js`, `src/lib/erros.js`.
- [ ] **Passo 4:** `npm run test:db`, depois `npm run test:integracao`, `npm test`.
- [ ] **Passo 5:** commit `Banco: lista, favoritos e o que se faz com os quadros`.

### Task 3: Quadro comum — o cliente sai de dentro do quadro

**Arquivos:** `src/components/quadro/QuadroKanban.jsx` (novo, + `QuadroKanban.test.jsx`), `QuadroDoCliente.jsx`,
`useQuadro.js`, `JanelaDoCartao.jsx`, `AbrirCartao.jsx`, `AnexosDoCartao.jsx` (+ os testes deles, só na forma de montar),
`src/data/quadro.js` (+ teste), `src/lib/arquivos.js` (+ teste). Sem banco.

**Interfaces — produz:**
- `pastaDoQuadro(quadro)` em `src/lib/arquivos.js` → `quadro.cliente_id ?? 'quadro/' + quadro.id` (a mesma regra de
  `private.pasta_do_quadro`); `caminhoDoAnexo(pasta, cartaoId, nome, id?)` e `caminhoDaImagem(pasta, cartaoId, tipo, id?)`
  só mudam o nome do primeiro parâmetro.
- `src/data/quadro.js`: `enviarAnexo({ pasta, cartaoId }, arquivo)` e `enviarImagemDaDescricao({ pasta, cartaoId },
  arquivo)` (antes `clienteId`).
- `useQuadro({ ler, chave, filtros })`: `ler(escolhido) → Promise<{ quadro: object | null, quadros?: array }>`; mudar
  `chave` recomeça do zero (o que `escolher` faz hoje); devolve o mesmo de hoje (`quadros, quadro, erro, semAcesso,
  colunas, escolher, lerTudo, relerQuadro, lerColuna, verMais, mudarQuadro, comecarArrasto, soltar`).
- `QuadroKanban({ estado, filtros, aoFiltrar, perfil, motivoSomenteLeitura = null, vazio, seletorDeConsultoria = false })`
  — o corpo de hoje do `QuadroDoCliente` (barra, avisos, arrastar, colunas, janelas), sem nada do cliente.
- `QuadroDoCliente({ cliente, perfil })` igual por fora: monta `useQuadro` com o `ler` do cliente (central:
  `quadrosDoCliente` + `quadroPorId`; os outros: `quadroDoCliente`) e passa `motivoSomenteLeitura` "Cliente arquivado: o
  quadro é só para ler." e os textos de vazio de hoje.
- `JanelaDoCartao({ cartaoId, quadro, perfil, motivoSomenteLeitura = null, aoFechar, aoQuadroMudou })` (sem `cliente`;
  pasta = `pastaDoQuadro(quadro)`; o motivo troca o "Cliente arquivado: o cartão é só para ler."); `AbrirCartao` repassa;
  `AnexosDoCartao({ pasta, cartaoId, podeMexer, aoMexer, aoRecusar })`.

- [ ] **Passo 1 — testes:** `arquivos.test.js` "pastaDoQuadro: cliente → `<cliente_id>`; pessoal e do time →
  `quadro/<id>`"; `quadro.test.js` "enviarAnexo com pasta `quadro/<q>` grava `quadro/<q>/<c>/<uuid>-nome`";
  `QuadroKanban.test.jsx` "com `motivoSomenteLeitura` mostra o motivo e não deixa arrastar nem criar"; "sem quadro mostra
  `vazio`"; "a janela do cartão recebe a pasta do quadro" (imagem da descrição e anexo vão para `quadro/<id>/…` num quadro
  pessoal). `QuadroDoCliente.test.jsx`, `JanelaDoCartao.test.jsx`, `AnexosDoCartao.test.jsx`, `AbrirCartao.test.jsx`:
  nenhuma asserção muda (só as props de montar onde o `cliente` saiu).
- [ ] **Passo 2:** ver FALHAR (os novos).
- [ ] **Passo 3:** mover o corpo para `QuadroKanban` e generalizar `useQuadro` sem mudar comportamento.
- [ ] **Passo 4:** `npm test`, `npm run lint`, `npm run build`.
- [ ] **Passo 5:** commit `Quadro comum para o cliente e para o menu`.

### Task 4: Tela Quadros no menu

**Arquivos:** `src/components/shell/menu.js` (+ `menu.test.js`), `src/index.css`, `src/rotas.jsx`, `src/pages/Quadros.jsx`
(+ `Quadros.test.jsx`), `src/components/quadros/{SeletorDeQuadro,EstrelaDoQuadro,MenuDoQuadro,JanelaNovoQuadro,
JanelaRenomearQuadro,JanelaApagarQuadro,JanelaQuadrosArquivados}.jsx` (+ testes), `src/components/comum/EscolhaForma.jsx`
(`opcoes` e `rotulo`, com o padrão de hoje), `src/pages/Times.jsx` e `src/pages/Time.jsx` (+ testes: texto da
confirmação "Se o time tiver quadros, apague-os antes, em Quadros." e a mensagem do 23503).

**Interfaces — produz:**
- Trilho: `{ id: 'quadros', rotulo: 'Quadros', rota: '/quadros', icone: SquareKanban, animacao: 'arrastar', papeis: TODOS }`
  logo depois de Calendário; `ANIMACOES_DO_MENU` + `'arrastar'`; `@keyframes icone-arrastar` (levanta, vai ~3 px para o
  lado com uma leve inclinação e assenta) + `.group:hover .anim-arrastar, .group:focus-visible .anim-arrastar`.
- Rotas `/quadros` e `/quadros/:id` → `Quadros` (todos os papéis).
- `Quadros()`: sem `:id`, decide o quadro (`lerMemoria` → `quadroPorId` aberto → primeiro favorito, de Meus, Dos times
  por `quadrosParaEscolher({ limite: 1 })` → vazio) e faz `navigate(..., { replace: true })`, tirando da memória o que
  sumiu; com `:id`, `useQuadro({ ler: () => quadroPorId(id).then((quadro) => ({ quadro })), chave: id, filtros })`,
  `lembrarQuadro` ao abrir; quadro de cliente → mensagem com link para o cliente; nulo → "Este quadro não existe ou você
  não tem acesso a ele." + "Ir para os meus quadros". Cabeçalho (`Cabecalho` "Quadros" + subtítulo de quem vê) com
  `SeletorDeQuadro`, `EstrelaDoQuadro`, `MenuDoQuadro`; depois `QuadroKanban` (`motivoSomenteLeitura` "Quadro
  arquivado: só para ler." quando arquivado). Sem `CartoesDeNumeros`.
- `SeletorDeQuadro({ perfil, quadro, aoEscolher })` (botão `outline` com o nome + `Flutuante` com busca e os grupos
  Favoritos, Recentes, Meus, Dos times; `role="listbox"` com grupos; setas, Enter, Esc; "N de TOTAL — busque pelo nome").
- `EstrelaDoQuadro({ quadro, aoMudar })` (`aria-pressed`, `marcarFavorito`).
- `MenuDoQuadro({ quadro, aoNovo, aoArquivados, aoRenomear, aoArquivar, aoRestaurar, aoApagar })` (`Flutuante`
  `role="menu"`; itens de administrar só com `quadro.pode_administrar`; botões com `botao-animado`).
- `JanelaNovoQuadro({ perfil, aoFechar, aoCriado })`, `JanelaRenomearQuadro({ quadro, aoFechar, aoSalvo })`,
  `JanelaApagarQuadro({ quadro, aoFechar, aoApagado, aoArquivar })`, `JanelaQuadrosArquivados({ perfil, aoFechar,
  aoAbrir, aoMudou })` (`JanelaFormulario` + `SecaoFormulario`, rodapé Cancelar + ação em andamento; arquivados em
  `Tabela` "Quadros arquivados" com `Paginacao` do banco e `ListaVazia`).

- [ ] **Passo 1 — testes:** `menu.test.js` (ids por papel com `quadros` depois de `calendario`; "Quadros usa a animação
  arrastar, que existe em `src/index.css`"; `tituloDaRota('/quadros/x')` = "Quadros"); `Trilho.test.jsx` continua
  passando. `Quadros.test.jsx`: "abre no último quadro guardado quando o banco o devolve"; "último sumido: abre o primeiro
  favorito, sem mensagem, e o tira da memória"; "sem quadros: ListaVazia com Novo quadro"; "`/quadros/:id` sem acesso:
  mensagem e link"; "quadro de cliente manda para o cliente"; "cabeçalho com título, quem vê, seletor, estrela e ⋯";
  "barra começa com Filtros, sem seletor Consultoria, e não há cartões de números"; "arquivado: só para ler e ⋯ com
  Restaurar"; "⋯ sem Renomear/Arquivar/Apagar para quem não administra"; "aviso do canal com o quadro apagado → sem
  acesso"; "a 360 px nada rola para o lado". `SeletorDeQuadro.test.jsx`: grupos na ordem; busca chama
  `quadros_para_escolher` com `p_busca` depois de parar de digitar; rodapé "20 de 230"; Recentes de `quadros_por_ids`;
  central sem Dos times; escolher pelo teclado. `JanelaNovoQuadro.test.jsx`: central só "Só eu"; "Um time" pede o time
  (`Seletor` com `buscar`); nome repetido mostra o erro; "Criando…"; abre o novo. `JanelaRenomearQuadro.test.jsx`: abre
  preenchida e salva. `JanelaApagarQuadro.test.jsx`: diz quantas colunas e cartões somem, oferece Arquivar, aviso quando
  sobram arquivos. `JanelaQuadrosArquivados.test.jsx`: a tabela pelo nome; paginação some com 15 ou menos, aparece com
  mais e Próxima pede a página 2 ao banco; Restaurar/Apagar só com `pode_administrar`; Abrir; restaurar com nome repetido
  mostra a mensagem. `Times.test.jsx`/`Time.test.jsx`: 23503 mostra a mensagem dos quadros. Guardas (tipografia, botões,
  campos nativos, formulários) no `npm test`.
- [ ] **Passo 2:** ver FALHAR.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`, `npm run lint`, `npm run build`.
- [ ] **Passo 5:** commit `Tela Quadros no menu`.

### Task 5: Documentação, exemplo e conferência

**Arquivos:** `CLAUDE.md` (seção "Quadro (Kanban)": quadros pessoais e de time — quem faz o quê, a pessoa e a
consultoria onde o pessoal nasceu, quadro segura o time, pasta `quadro/<id>/`, a central só lê os do cliente,
`administro_quadro`, memória só com ids; no molde e no Padrão Hub, a tela Quadros sem cartões de números ao lado da
exceção da aba do cliente; "Menu lateral" com `arrastar`; "Todo menu do trilho abre com `BarraDeFiltros`" com Quadros),
`README.md` (a pasta `quadro/` no balde `quadros`), `scripts/exemplo-local.mjs` (um quadro pessoal da Ana e um do time da
Consultoria Exemplo com alguns cartões; idempotente; com a chave de serviço; não toca nos dados reais).

- [ ] **Passo 1:** documentar e o script; o controlador roda `npm run exemplo:local` duas vezes (a segunda não muda nada).
- [ ] **Passo 2:** `npm test`, `npm run lint`, `npm run build`.
- [ ] **Passo 3:** commit `Documentação dos quadros pessoais e de time e exemplo`.
- [ ] **Conferência no navegador (controlador):** Ana (consultora e membro do time): cria pessoal e do time, arrasta,
  janela do cartão com imagem e anexo (caminho `quadro/…`); gestora do time: renomeia, arquiva, restaura, apaga (oferece
  arquivar); admin: vê os do time e não vê o pessoal da Ana (nem pelo endereço); central: só os pessoais dela, sem Dos
  times; dois navegadores no mesmo quadro do time (tempo real) e tirar a Ana do time com o quadro aberto → "sem acesso";
  abrir `/quadros` volta ao último; 1440, 390 e 360 px, claro e escuro; animação do trilho no hover e no Tab; a aba
  Quadro de um cliente igual a antes.
