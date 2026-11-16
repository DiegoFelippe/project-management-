# Central IXCSoft e clientes — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** criar o papel Central (que vê tudo e cria consultorias) e o ciclo do cliente: a central cadastra
e manda para uma consultoria, o gestor escolhe o consultor pela menor ocupação, e o consultor faz check-in.

**Arquitetura:** regras no Postgres (RLS + gatilhos + funções `security definer` em `private`/`public`),
Edge Functions só para o que mexe em login (papel central, consultorias e administradores). O navegador lê e
grava pelo supabase-js com a chave publicável; listas paginam no banco com `buscarPagina`. Duas entregas:
**Entrega 1** = Tarefas 1–3 (central); **Entrega 2** = Tarefas 4–15 (clientes, capacidade, check-ins).

**Tecnologias:** React 19 + Vite 8, Tailwind 4, lucide-react, supabase-js 2.119, Supabase CLI 3.1 (Postgres
17, PostgREST 16), Edge Functions em Deno, Vitest (projetos `unidade` e `integracao`), pgTAP, oxlint.

**Design:** `docs/superpowers/specs/2026-11-13-clientes-design.md` (ler inteiro antes de qualquer tarefa).

## Restrições globais

- Responder e escrever tudo (telas, mensagens, comentários, commits) em **português do Brasil**.
- **Nunca** `supabase db reset`, apagar registros do Diego, limpar Storage ou recriar volume. Migração nova:
  `npx supabase migration new <nome> < /dev/null` e depois `npx supabase migration up`.
- Antes de aplicar a primeira migração de cada entrega: cópia do banco em `supabase/.copias/`
  (`npx supabase db dump --local --data-only -f supabase/.copias/<data>-antes-<nome>.sql`).
- Toda tabela nova: RLS ligado, `revoke all ... from anon, authenticated`, `GRANT` explícito só para
  `authenticated`, `grant all ... to service_role`, teste pgTAP em `supabase/tests/database/`.
- Funções de regra em `private` com `security definer set search_path = ''`; chamadas de função dentro das
  políticas novas vão em `(select ...)`.
- Edge Function mudada: `npm run functions:reiniciar` antes dos testes de integração. Chave secreta nunca em
  `src/` nem no git.
- Telas: `Button` (`src/components/ui/button.jsx`) ou `<button>` com `botao-animado`; listas com `Tabela`,
  `Linha`, `Celula`, `CelulaAcoes`, `ListaVazia` e `paginacao` (15 por página, no banco); Editar abre a
  janela já preenchida; apagar/arquivar com `ConfirmarAcao`; conteúdo em largura total.
- Item novo no trilho: animação nova em `src/index.css` (keyframes `icone-<nome>` + `.group:hover` e
  `:focus-visible`) e o nome em `ANIMACOES_DO_MENU`.
- Sem dependências novas no `package.json`. Extensões do Postgres (`pg_trgm`, `unaccent`, `btree_gist`) no
  schema `extensions`.
- Mês e "hoje" sempre no fuso `America/Sao_Paulo`.
- Pronto = `npm test`, `npm run test:db`, `npm run test:integracao`, `npm run lint` e `npm run build` verdes,
  e conferido no navegador (fim de cada entrega). Commit ao fim de cada tarefa, na branch `feat/clientes`.
  **Não dar push nem abrir PR** sem o Diego pedir.

## Pontos de atenção na revisão

1. **Gestor que não é admin escolhendo consultor fora dos times dele** deve funcionar (ele vê a pessoa só
   pelas funções `consultores_por_ocupacao` e `consultor(clientes)`) → teste na Tarefa 4 (pgTAP) e na 9
   (integração).
2. **Check-in aberto quando o cliente troca de consultor, muda de consultoria, é arquivado, ou o consultor é
   desativado** → o check-in fecha na hora com a nota → testes na Tarefa 6.
3. **Consultoria ou consultor com capacidade 0** (todos com carga 0, ou mês todo de férias) → vai para o fim
   da sugestão, sem divisão por zero (ocupação nula) → teste na Tarefa 7.
4. **CNPJ colado com pontuação, espaços ou minúsculas, inclusive alfanumérico** → normaliza e valida igual
   na tela e no banco → testes nas Tarefas 4 e 8.
5. **Busca com `%`, `_`, `,`, `(` ou `)`** (quebram o `ilike`/`or` do PostgREST) → escapada, sem erro, sem
   ampliar o resultado → teste na Tarefa 9.

---

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
| --- | --- | --- |
| `supabase/migrations/*_central.sql` | papel `central`, `private.sou_central()`, regras de leitura para a central | 1 |
| `supabase/tests/database/central.test.sql` | o que a central vê e não vê | 1 |
| `supabase/functions/_shared/clientes.ts`, `_shared/validar.ts`, `criar-acesso`, `criar-consultoria`, `gerenciar-consultoria`, `gerenciar-acesso`, `reenviar-convite` | central nas Edge Functions; ação `mover_para_central` | 2 |
| `tests/integracao/central.test.js` | Edge Functions com a central | 2 |
| `src/lib/papeis.js` | `veTudo(perfil)`, `ehCentral(perfil)` | 3 |
| `src/components/shell/menu.js`, `src/rotas.jsx`, telas de Usuários/Consultorias/Times/Integrações/Início | central nas telas | 3 |
| `supabase/migrations/*_clientes.sql` | `clientes`, `cliente_eventos`, CNPJ, busca, regras, `consultor(clientes)` | 4 |
| `supabase/tests/database/clientes.test.sql` | regras dos clientes e histórico | 4 |
| `supabase/migrations/*_capacidade.sql` | `carga_semanal`, `ausencias`, feriados, `capacidade_do_mes`, `definir_carga` | 5 |
| `supabase/tests/database/capacidade.test.sql` | contas de capacidade e regras de ausência | 5 |
| `supabase/migrations/*_checkins.sql` | `checkins`, `realizado_no_mes`, regras de saída | 6 |
| `supabase/tests/database/checkins.test.sql` | check-ins e "quando alguém sai" | 6 |
| `supabase/migrations/*_ocupacao.sql` | `consultores_por_ocupacao`, `consultorias_por_ocupacao` | 7 |
| `supabase/tests/database/ocupacao.test.sql`, `ocupacao_volume.test.sql`, `escala.test.sql` | ordem, números e tempo com volume; índices | 7 |
| `src/lib/cnpj.js`, `src/lib/horas.js`, `src/lib/erros.js` | CNPJ, horas e mensagens | 8 |
| `src/data/clientes.js`, `src/data/capacidade.js`, `src/data/checkins.js`, `tests/integracao/ambiente.js`, `tests/integracao/clientes.test.js` | funções de dados e o caminho completo de verdade | 9 |
| `src/pages/Clientes.jsx`, `src/components/clientes/FormularioCliente.jsx` | lista e cadastro (central) | 10 |
| `src/components/clientes/JanelaMandar.jsx`, `JanelaConsultor.jsx`, `ListaDeOcupacao.jsx` | sugestão para central e gestor | 11 |
| `src/components/clientes/BotaoCheckin.jsx`, `JanelaCheckin.jsx` | check-in, check-out e lançar horas | 12 |
| `src/pages/Cliente.jsx` | página do cliente: dados, check-ins, histórico | 13 |
| `src/pages/Capacidade.jsx`, `src/components/capacidade/*`, `src/components/perfil/MeuPerfil.jsx` | carga, ausências e ocupação | 14 |
| `README.md`, `CLAUDE.md`, `docs/superpowers/specs/...` | documentação e verificação final | 15 |

---

## Entrega 1 — Central

### Task 1: Papel `central` no banco

**Arquivos:**
- Criar: `supabase/migrations/<data>_central.sql` (`npx supabase migration new central < /dev/null`)
- Criar: `supabase/tests/database/central.test.sql`

**Interfaces:**
- Produz: papel `'central'` em `perfis.papel`; `private.sou_central() returns boolean` (liberado e papel em
  `('dono','central')` — o administrador geral tem os poderes da central); `private.sou_dono()` continua só
  o dono.

- [ ] **Passo 1: Escrever o teste** `central.test.sql`, com os ajudantes de `crud.test.sql` (copiar
  `testes.usuario/consultoria/perfil/time/como`; `testes.perfil` aceita `p_consultoria => null`). Cenário:
  consultorias A e B, `dono`, `central` (sem consultoria), `admin_a`, `gestor_a` com `time_a`, `pessoa_a`,
  `admin_b`. Asserções (`plan(12)`):
  - `throws_ok` ao inserir perfil `central` com `consultoria_id` de A (check `perfis_check`);
  - `lives_ok` ao inserir perfil `central` sem consultoria;
  - como `central`: `count(*)` de `consultorias` = 2, de `perfis` = todos (7), de `times` = 1, de
    `time_membros` = os do cenário;
  - como `central`: `private.sou_central()` = true; `private.sou_dono()` = false;
  - como `dono`: `private.sou_central()` = true;
  - como `admin_a`: `private.sou_central()` = false e continua vendo só a consultoria A (`count` = 1);
  - central desativada (`ativo = false`): `count(*)` de `consultorias` = 0;
  - `private.posso_mudar_logo(<id de A>)` como central = true;
  - `private.posso_mudar_foto(<admin_a>)` como central = true; `posso_mudar_foto(<pessoa_a>)` como central = false.
- [ ] **Passo 2:** `npm run test:db` → FALHA (papel `central` não existe).
- [ ] **Passo 3: Migração.**
  - `perfis_papel_check` passa a aceitar `'central'`; `perfis_check` vira
    `(papel in ('dono','central')) = (consultoria_id is null)`.
  - `private.sou_central()` como descrito; `grant execute` para `authenticated`.
  - Trocar `private.sou_dono()` por `private.sou_central()` nas regras **de leitura**: `private.vejo_time`,
    `private.vejo_perfil` (`create or replace`), política `"ver a própria consultoria (dono vê todas)"` de
    `consultorias` e `"ver times conforme o papel"` de `times` (`drop policy` + `create policy`, mesmos nomes).
  - `private.posso_mudar_logo`: `sou_central()` no lugar de `sou_dono()`. `private.posso_mudar_foto`: o trecho
    `(private.sou_dono() and p.papel = 'admin')` vira `(private.sou_central() and p.papel = 'admin') or
    (private.sou_dono() and p.papel = 'central')`.
  - Integrações (`"admin vê as da consultoria; dono vê todas"`) **não muda**.
- [ ] **Passo 4:** `npx supabase migration up` e `npm run test:db` → PASSA (todos os arquivos).
- [ ] **Passo 5:** commit `Papel central no banco: vê todas as consultorias`.

### Task 2: Central nas Edge Functions

**Arquivos:**
- Modificar: `supabase/functions/_shared/clientes.ts` (`Papel` ganha `'central'`),
  `_shared/validar.ts` (`PAPEIS_CRIAVEIS` ganha `'central'`), `criar-acesso/index.ts`,
  `criar-consultoria/index.ts`, `gerenciar-consultoria/index.ts`, `gerenciar-acesso/index.ts`,
  `reenviar-convite/index.ts`
- Criar: `tests/integracao/central.test.js`

**Interfaces:**
- Consome: papel `central` (Tarefa 1).
- Produz:
  - `criar-acesso`: `dono` cria `admin` (com `consultoria_id`) ou `central` (sem consultoria, sem times);
    `central` cria `admin` (com `consultoria_id`). Demais casos iguais.
  - `criar-consultoria` e `gerenciar-consultoria`: aceitam `dono` e `central`.
  - `gerenciar-acesso`: `poderSobre` — `dono` → `admin` e `central` = `'tudo'`; `central` → `admin` = `'tudo'`.
    Ação nova `{ acao: 'mover_para_central', pessoa_id }`: só `dono`; alvo ativo com papel `admin`, `gestor` ou
    `pessoa`; grava `papel = 'central'`, `consultoria_id = null`; erro do gatilho `gestor_com_times` → 409
    `gestor_com_times`. Respostas `200 { ok: true }`.
  - `reenviar-convite`: `dono` → `admin` e `central`; `central` → `admin`.

- [ ] **Passo 1: Testes de integração** em `central.test.js` (padrão de `gerenciar.test.js`; criar a central
  com `criarPerfilDeTeste({ papel: 'central' })`):
  - `central cria consultoria com administrador` → 201 e a consultoria existe;
  - `central renomeia e arquiva consultoria` → 200;
  - `central cria administrador numa consultoria` → 201; `central não cria gestor` → 403;
  - `dono cria acesso de central` → 201, perfil com `papel = 'central'` e `consultoria_id = null`;
  - `admin não cria central` → 400 `dados_invalidos` (campo `papel`) ou 403;
  - `dono move admin para a central` → 200 e perfil `central` sem consultoria;
  - `dono não move gestor que gerencia time` → 409 `gestor_com_times`;
  - `central não move ninguém para a central` → 403;
  - `central desativa administrador` → 200; `central desativa outra central` → 403.
- [ ] **Passo 2:** `npm run test:integracao -- central` → FALHA.
- [ ] **Passo 3:** implementar como em **Interfaces**; `npm run functions:reiniciar`.
- [ ] **Passo 4:** `npm run test:integracao` → PASSA (todos).
- [ ] **Passo 5:** commit `Central nas Edge Functions: cria consultorias e administradores`.

### Task 3: Central nas telas

**Arquivos:**
- Criar: `src/lib/papeis.js`, `src/lib/papeis.test.js`
- Modificar: `src/components/shell/menu.js` (+ `menu.test.js`), `src/rotas.jsx`, `src/pages/Usuarios.jsx`
  (+ teste), `src/components/usuarios/NovoAcesso.jsx` (+ teste), `src/pages/Consultorias.jsx`,
  `src/pages/Times.jsx`, `src/pages/Integracoes.jsx`, `src/components/comum/FiltroConsultoria.jsx`,
  `src/data/usuarios.js`, `src/pages/Inicio.jsx`

**Interfaces:**
- Consome: Edge Functions da Tarefa 2.
- Produz: `veTudo(perfil): boolean` (papel `dono` ou `central`); `ehCentral(perfil): boolean` (só `central`);
  `NOME_DO_PAPEL.dono = 'Administrador geral'`, `NOME_DO_PAPEL.central = 'Central'`; `gerenciarAcesso('mover_para_central', id)`.

- [ ] **Passo 1: Testes.**
  - `papeis.test.js`: `veTudo({ papel: 'central' })` true, `veTudo({ papel: 'dono' })` true, `veTudo({ papel: 'admin' })` false.
  - `menu.test.js`: `ids('central')` = `['inicio', 'projetos', 'times', 'usuarios', 'consultorias']`;
    `NOME_DO_PAPEL.dono` = `'Administrador geral'`.
  - `Usuarios.test.jsx`: como `dono`, a linha de um admin tem o botão **Mover para a central**, que confirma
    e chama `gerenciarAcesso('mover_para_central', '<id>')`; como `dono`, a linha de uma pessoa da central tem
    **Editar** e **Desativar**; como `central`, não tem **Mover** e só edita/desativa administradores; a tela
    da central mostra o filtro de consultoria.
  - `NovoAcesso.test.jsx`: `papelDeQuemCria="dono"` oferece Administrador e Central (Central esconde a
    escolha de consultoria); `papelDeQuemCria="central"` oferece só Administrador.
- [ ] **Passo 2:** `npm test` → FALHA.
- [ ] **Passo 3: Implementar.** Trocar os `perfil.papel === 'dono'` que significam "vê tudo/só olha" por
  `veTudo(perfil)` (Times, Usuários, Integrações, Consultorias, FiltroConsultoria); menu e rotas: Times,
  Usuários e Consultorias também para `central`; `listarUsuarios` continua escondendo só o `dono`; a pessoa
  da central aparece na lista do dono com a consultoria "—" e papel "Central"; Início mostra "Central".
- [ ] **Passo 4:** `npm test` e `npm run lint` → PASSA.
- [ ] **Passo 5:** commit `Central nas telas: menu, Usuários e Consultorias`.
- [ ] **Passo 6: Fim da Entrega 1.** `npm test`, `npm run test:db`, `npm run test:integracao`, `npm run lint`,
  `npm run build` verdes. No navegador (app em `http://localhost:5173`): como admin@exemplo.test, nada muda;
  pedir ao Diego para entrar como administrador geral ou criar, com um e-mail `@exemplo.test`, uma central de
  teste pelo `criar-acesso` do dono em teste de integração — **não mover a Jaine nem mexer em cadastros dele
  sem ele pedir**.

---

## Entrega 2 — Clientes, capacidade e check-ins

### Task 4: Tabela de clientes, histórico e regras

**Arquivos:**
- Criar: `supabase/migrations/<data>_clientes.sql`, `supabase/tests/database/clientes.test.sql`

**Interfaces:**
- Consome: `private.sou_central()` (Tarefa 1).
- Produz:
  - `private.gerencio_consultoria(p_consultoria uuid) returns boolean`: liberado, `consultoria_atual() =
    p_consultoria` e papel `admin` ou `gestor`.
  - `private.vejo_cliente(p_consultoria uuid, p_consultor uuid) returns boolean`: `sou_central()` ou
    `gerencio_consultoria(p_consultoria)` ou (liberado e `p_consultor = auth.uid()` e `p_consultoria =
    consultoria_atual()`).
  - `private.cnpj_valido(text) returns boolean` (`immutable`): 14 caracteres `^[0-9A-Z]{12}[0-9]{2}$`; valor
    de cada caractere = código ASCII − 48; pesos `5,4,3,2,9,8,7,6,5,4,3,2` e `6,5,4,3,2,9,8,7,6,5,4,3,2`;
    resto < 2 → 0, senão 11 − resto.
  - `private.sem_acento(text) returns text` (`immutable`, `extensions.unaccent('extensions.unaccent', $1)`, minúsculas).
  - Tabela `public.clientes`: `id uuid pk`, `nome text` (2–120), `razao_social` (nulo ou 2–200), `cnpj`
    (nulo ou válido), `cidade` (≤120), `uf` (nulo ou uma das 27), `contato_nome` (≤120), `contato_telefone`
    (≤30), `contato_email` (nulo ou `^[^\s@]+@[^\s@]+\.[^\s@]+$`, ≤254), `observacoes` (≤2000),
    `horas_mes numeric(5,1) not null check (horas_mes > 0 and horas_mes <= 744)`,
    `consultoria_id uuid null references consultorias on delete restrict`,
    `consultor_id uuid null references perfis on delete set null`, `enviado_em timestamptz`,
    `consultor_desde timestamptz`, `arquivado_em timestamptz`,
    `arquivado boolean generated always as (arquivado_em is not null) stored`,
    `busca text generated always as (private.sem_acento(nome || ' ' || coalesce(razao_social,'') || ' ' ||
    coalesce(cidade,'') || ' ' || coalesce(cnpj,''))) stored`, `criado_por uuid default auth.uid()
    references perfis on delete set null`, `criado_em`, `atualizado_em`;
    `check (consultor_id is null or consultoria_id is not null)`.
  - Tabela `public.cliente_eventos`: `id uuid pk`, `cliente_id references clientes on delete cascade`,
    `tipo text check (tipo in ('cadastrado','editado','enviado','movido','devolvido','consultor_escolhido',
    'consultor_trocado','consultor_removido','previsao_ajustada','arquivado','reativado'))`,
    `de_consultoria`, `para_consultoria`, `de_consultor`, `para_consultor` (uuid), `de_horas`, `para_horas`
    (numeric), `autor uuid default auth.uid() references perfis on delete set null`, `em timestamptz default now()`.
  - Gatilho `before insert or update` em `clientes`:
    - quem não é `sou_central()` (com `auth.uid()` não nulo) só pode mudar `consultor_id` e `horas_mes`,
      senão `raise 'so_central_muda'`;
    - consultor (novo ou trocado) precisa ser perfil **ativo**, da **mesma consultoria** do cliente, papel
      `admin`, `gestor` ou `pessoa`, senão `raise 'consultor_invalido'`;
    - mandar/mover para consultoria arquivada: `raise 'consultoria_arquivada'`;
    - consultoria mudou → `consultor_id = null`, `enviado_em = now()`, `consultor_desde = null`;
    - consultor mudou → `consultor_desde = now()` (ou null); `atualizado_em = now()` em todo update.
  - Gatilho `after insert or update` grava `cliente_eventos` (um evento por mudança; editar dados = `editado`;
    consultoria nula→X `enviado`; X→Y `movido`; X→nula `devolvido`; consultor nulo→P `consultor_escolhido`;
    P→Q `consultor_trocado`; P→nulo `consultor_removido`; `horas_mes` `previsao_ajustada`; `arquivado`/`reativado`).
  - RLS `clientes`: `select` `vejo_cliente(consultoria_id, consultor_id)`; `insert` e `delete` `sou_central()`;
    `update` `using/with check (sou_central() or gerencio_consultoria(consultoria_id))`. `grant select, insert,
    delete` e `update (nome, razao_social, cnpj, cidade, uf, contato_nome, contato_telefone, contato_email,
    observacoes, horas_mes, consultoria_id, consultor_id, arquivado_em)`.
  - RLS `cliente_eventos`: `select` para `sou_central()`, ou para quem vê o cliente **e** `em >= cliente.enviado_em`
    (a consultoria não vê o que aconteceu antes de o cliente chegar a ela). Só `select` pela API.
  - `public.consultor(public.clientes) returns setof public.perfis rows 1 stable security definer
    set search_path = ''`: devolve o perfil do consultor **guardado no banco** para aquele `id`, só se
    `private.vejo_cliente(...)` da linha guardada for verdadeiro.
  - Índices: `clientes_cnpj_unico (cnpj) where cnpj is not null` (único); `clientes_central_idx (arquivado,
    (consultoria_id is null), nome, id)`; `clientes_consultoria_idx (consultoria_id, arquivado, nome, id)`;
    `clientes_consultor_idx (consultor_id, arquivado, nome, id)`; `clientes_busca_idx` gin `(busca
    extensions.gin_trgm_ops)`; `clientes_criado_por_idx`; `cliente_eventos_cliente_idx (cliente_id, em desc)`;
    `cliente_eventos_autor_idx (autor)`.

- [ ] **Passo 1: Teste** `clientes.test.sql` (ajudantes como na Tarefa 1, mais `testes.cliente(p_nome,
  p_consultoria, p_consultor)`). Cenário: consultorias A e B; `dono`, `central`, `admin_a`, `gestor_a1` (com
  `time_a1` e `pessoa_a` nele), `gestor_a2` (sem times), `pessoa_a`, `pessoa_a2` (fora de times), `admin_b`,
  `pessoa_b`, `pessoa_inativa` (A). Asserções:
  - `private.cnpj_valido('11222333000181')` true; `('11222333000182')` false; `('12ABC34501DE35')` true
    (alfanumérico); `('1122233300018')` false;
  - central insere cliente sem consultoria; `admin_a` não insere (`42501`);
  - central manda para A → evento `enviado`; `gestor_a2` (sem times) vê o cliente e escolhe `pessoa_a2` como
    consultor (fora dos times dele) → ok, evento `consultor_escolhido`, `consultor_desde` preenchido;
  - `gestor_a2` tenta mudar `nome` → `so_central_muda`; muda `horas_mes` → ok, evento `previsao_ajustada`;
  - consultor de B ou `pessoa_inativa` → `consultor_invalido`;
  - `pessoa_a2` vê só esse cliente (`count` = 1); `pessoa_a` vê 0; `admin_b` vê 0; central e dono veem todos;
  - central move para B → `consultor_id` nulo, evento `movido`; `admin_a` passa a ver 0;
  - `admin_b` vê os eventos do cliente só a partir de `movido` (`count` = 1), central vê todos;
  - CNPJ repetido (mesmo arquivado) → `23505`; CNPJ inválido → `23514`;
  - `select (public.consultor(c)).nome from clientes c` como `gestor_a2` devolve o nome de `pessoa_a2`;
    chamando com uma linha forjada (`row(<id de cliente de B>, ...)::public.clientes`) como `gestor_a2`
    devolve zero linhas;
  - `has_index` para os índices acima.
- [ ] **Passo 2:** `npm run test:db` → FALHA.
- [ ] **Passo 3:** cópia do banco (Restrições globais) e migração (`create extension if not exists pg_trgm
  with schema extensions; ... unaccent ...`), como em **Interfaces**.
- [ ] **Passo 4:** `npx supabase migration up`; `npm run test:db` → PASSA.
- [ ] **Passo 5:** commit `Clientes no banco: central cadastra, consultoria escolhe o consultor`.

### Task 5: Capacidade (carga, ausências e feriados)

**Arquivos:**
- Criar: `supabase/migrations/<data>_capacidade.sql`, `supabase/tests/database/capacidade.test.sql`

**Interfaces:**
- Consome: `private.gerencio_consultoria`, `private.sou_central` (Tarefas 1 e 4).
- Produz:
  - `perfis.carga_semanal numeric(4,1) not null default 44 check (carga_semanal between 0 and 60)`.
  - `public.definir_carga(p_perfil uuid, p_horas numeric) returns void` (`security definer`): permitido a
    `sou_central()` ou `gerencio_consultoria(<consultoria do perfil>)`, alvo `admin`/`gestor`/`pessoa`;
    senão `raise 'sem_permissao'`. (Não há `grant update` de `carga_semanal`.)
  - `private.consultoria_de(p_perfil uuid) returns uuid`.
  - Tabela `public.ausencias`: `id`, `perfil_id references perfis on delete cascade`, `de date`, `ate date`
    `check (ate >= de and ate - de <= 366)`, `motivo text` (2–120), `criado_por default auth.uid()`,
    `criado_em`. RLS: `select` para `sou_central()`, `gerencio_consultoria(consultoria_de(perfil_id))` ou o
    próprio; `insert/update/delete` para `sou_central()` ou `gerencio_consultoria(...)`. Índice
    `ausencias_perfil_idx (perfil_id, de)`.
  - `private.feriados_nacionais(p_ano int) returns setof date` (`immutable`): 01/01, 21/04, 01/05, 07/09,
    12/10, 02/11, 15/11, 20/11, 25/12 e a Sexta-feira Santa (Páscoa − 2, algoritmo gregoriano).
  - `public.capacidade_do_mes(p_perfil uuid, p_mes date) returns numeric` (`security definer`, mesma
    permissão de leitura das ausências): dias de segunda a sexta do mês, menos feriados nacionais nesses
    dias, menos dias de ausência nesses dias (sem contar duas vezes), × `carga_semanal / 5`, arredondado a 1 casa.

- [ ] **Passo 1: Teste** `capacidade.test.sql`:
  - `private.feriados_nacionais(2026)` contém `2026-04-03` (Sexta-feira Santa) e `2026-11-20`;
    `(2027)` contém `2027-03-26`;
  - pessoa com 44 h em novembro/2026 → `capacidade_do_mes` = `167.2` (19 dias úteis: 21 de segunda a sexta,
    menos 02/11 e 20/11);
  - com ausência de 23 a 27/11/2026 → `123.2`; ausência cobrindo 20/11 (feriado) não desconta duas vezes;
  - carga 0 → `0`; dezembro/2026 com 44 h → `193.6`;
  - `definir_carga` por `gestor_a2` em `pessoa_a2` → ok; por `pessoa_a` → `sem_permissao`; por `admin_b` em
    pessoa de A → `sem_permissao`; por central → ok; valor 61 → erro de check;
  - ausências: `gestor_a2` cria para `pessoa_a2`; `pessoa_a2` vê a dela e não cria; `admin_b` não vê.
- [ ] **Passo 2:** `npm run test:db` → FALHA.
- [ ] **Passo 3:** migração como em **Interfaces**.
- [ ] **Passo 4:** `npx supabase migration up`; `npm run test:db` → PASSA.
- [ ] **Passo 5:** commit `Capacidade no banco: carga semanal, ausências e feriados`.

### Task 6: Check-ins e "quando alguém sai"

**Arquivos:**
- Criar: `supabase/migrations/<data>_checkins.sql`, `supabase/tests/database/checkins.test.sql`

**Interfaces:**
- Consome: `clientes`, `private.gerencio_consultoria`, `private.sou_central` (Tarefas 1, 4).
- Produz:
  - Tabela `public.checkins`: `id`, `cliente_id references clientes on delete restrict`, `consultor_id
    references perfis on delete cascade`, `consultoria_id references consultorias on delete restrict` (a do
    cliente no momento do check-in, preenchida pelo gatilho), `inicio timestamptz not null`, `fim
    timestamptz`, `descricao text` (≤2000), `criado_em`, `atualizado_em`;
    `check (fim is null or (fim > inicio and fim - inicio <= interval '24 hours'))`;
    `check (fim is null or char_length(btrim(coalesce(descricao,''))) >= 2)`;
    `exclude using gist (consultor_id with =, tstzrange(inicio, coalesce(fim, 'infinity'), '[)') with &&)`
    (sem sobreposição e um aberto por vez; extensão `btree_gist`).
  - Gatilho `before insert`: o cliente está ativo, `consultor_id = auth.uid() = cliente.consultor_id`, senão
    `raise 'checkin_sem_cliente'`; `consultoria_id` = a do cliente; `inicio` e `fim` não podem passar de
    `now() + interval '1 minute'` (`raise 'checkin_no_futuro'`, também no update).
  - RLS: `select` para `sou_central()`, `gerencio_consultoria(consultoria_id)` ou `consultor_id = auth.uid()`;
    `insert` pelo gatilho acima (`with check (consultor_id = (select auth.uid()))`); `update` e `delete` para
    o próprio consultor ou `gerencio_consultoria(consultoria_id)`. `grant select, insert, delete` e `update
    (inicio, fim, descricao)`.
  - `public.realizado_no_mes(public.clientes) returns numeric` (`stable`, **invoker**: cada um soma só os
    check-ins que enxerga): horas dos check-ins fechados do cliente no mês atual (São Paulo), 1 casa.
  - `public.cliente_do_checkin(public.checkins) returns table (id uuid, nome text)` (`security definer`,
    `rows 1`): id e nome do cliente **guardado** para aquele check-in, só se quem pergunta enxerga o check-in
    (o próprio consultor, `gerencio_consultoria(consultoria_id)` ou `sou_central()`). Serve para o consultor
    ver os check-ins dele depois que o cliente saiu dele.
  - Fechar check-in aberto (`fim = now()`, `descricao` = a existente ou a nota): gatilho `after update` em
    `clientes` quando muda `consultor_id`, `consultoria_id` ou `arquivado_em` → notas `Encerrado ao trocar o
    consultor`, `Encerrado ao mover o cliente`, `Encerrado ao arquivar o cliente`.
  - Gatilho `after update of ativo, papel, consultoria_id` em `perfis`: desativado, virou `central`/`dono` ou
    mudou de consultoria → `update clientes set consultor_id = null where consultor_id = <pessoa> and not
    arquivado` (gera `consultor_removido`) e fecha o check-in aberto dela.
  - Gatilho `after update of arquivada_em` em `consultorias` (arquivada): `update clientes set consultoria_id
    = null where consultoria_id = <id> and not arquivado` (gera `devolvido`).
  - Índices: `checkins_cliente_idx (cliente_id, inicio desc)`, `checkins_consultor_idx (consultor_id, inicio
    desc)`, `checkins_consultoria_idx (consultoria_id, inicio)`.

- [ ] **Passo 1: Teste** `checkins.test.sql` (cenário da Tarefa 4 reduzido; `pessoa_a2` consultora do
  cliente `c1` em A):
  - `pessoa_a2` faz check-in (inicio = now() − 2 h) → ok; segundo aberto → `23P01`;
  - check-out sem descrição → `23514`; com descrição → ok; check-in no futuro → `checkin_no_futuro`;
    sobreposto a um fechado → `23P01`; 25 h → `23514`;
  - `pessoa_a` (não é a consultora) não cria (`checkin_sem_cliente`);
  - `gestor_a2` edita e apaga check-in da `pessoa_a2`; `admin_b` vê 0;
  - `realizado_no_mes(c1)` = soma conferida à mão;
  - depois de trocar o consultor, `pessoa_a2` ainda vê o check-in dela e `cliente_do_checkin` devolve o nome
    de `c1`, embora ela não veja mais `c1` em `clientes`;
  - aberto + `gestor_a2` troca o consultor → o check-in fica com `fim` preenchido e a nota; idem ao mover
    (central) e ao arquivar;
  - desativar `pessoa_a2` (update direto como `postgres`) → `c1.consultor_id` nulo e evento `consultor_removido`;
  - arquivar A → clientes ativos de A com `consultoria_id` nulo e evento `devolvido`;
  - central tenta apagar cliente com check-in → `23503`; cliente sem check-in → apagado.
- [ ] **Passo 2:** `npm run test:db` → FALHA.
- [ ] **Passo 3:** migração como em **Interfaces**.
- [ ] **Passo 4:** `npx supabase migration up`; `npm run test:db` → PASSA (inclusive `crud.test.sql` e
  `acesso.test.sql`, que desativam pessoas e arquivam consultorias).
- [ ] **Passo 5:** commit `Check-ins no banco e o que acontece quando alguém sai`.

### Task 7: Ocupação e sugestão

**Arquivos:**
- Criar: `supabase/migrations/<data>_ocupacao.sql`, `supabase/tests/database/ocupacao.test.sql`,
  `supabase/tests/database/ocupacao_volume.test.sql`
- Modificar: `supabase/tests/database/escala.test.sql` (índices das Tarefas 4–6)

**Interfaces:**
- Consome: `capacidade_do_mes` (5), `checkins` (6), `clientes` (4).
- Produz (ambas `security definer`, `stable`, `set search_path = ''`, `p_mes` nulo = mês atual em São Paulo,
  `p_limite` entre 1 e 50):
  - `public.consultores_por_ocupacao(p_consultoria uuid default null, p_busca text default null,
    p_limite int default 8, p_deslocamento int default 0, p_mes date default null)` → `table (id uuid, nome
    text, email text, foto text, papel text, consultoria_id uuid, consultoria_nome text, carga_semanal
    numeric, capacidade numeric, reservado numeric, realizado numeric, ocupacao numeric, clientes int, total
    bigint)`. Quem pode: `sou_central()` (qualquer consultoria; `p_consultoria` nulo = todas) ou
    `gerencio_consultoria(p_consultoria)`; senão nenhuma linha. Só perfis ativos `admin/gestor/pessoa` de
    consultoria ativa. `reservado` = soma de `horas_mes` dos clientes ativos dele (nulo se `p_mes` for
    anterior ao mês atual); `realizado` = horas dos check-ins dele no mês naquela consultoria; `ocupacao` =
    `reservado / capacidade` (nula se capacidade = 0 ou mês passado: aí `realizado / capacidade`);
    `clientes` = clientes ativos dele. Ordem: capacidade 0 por último, `ocupacao` crescente, `nome`, `id`.
    Busca por `private.sem_acento(nome || ' ' || email)` com `like '%' || termo || '%'` (termo já sem acento).
  - `public.consultorias_por_ocupacao(p_busca text default null, p_limite int default 8, p_deslocamento int
    default 0, p_mes date default null)` → `table (id uuid, nome text, consultores int, clientes int,
    aguardando int, capacidade numeric, reservado numeric, realizado numeric, ocupacao numeric, total bigint)`.
    Só `sou_central()`. `reservado` inclui a previsão dos clientes aguardando consultor. Mesma ordem.
  - `grant execute ... to authenticated`.

- [ ] **Passo 1: Teste** `ocupacao.test.sql` com números conferidos à mão (novembro/2026, carga 44 →
  capacidade 167,2): `pessoa_a2` com clientes de 40 e 30 h → reservado 70, ocupação ≈ 0,419; `gestor_a2` com
  120 h → 0,718; `pessoa_zero` com carga 0 → por último e ocupação nula; ordem `pessoa_a2`, `gestor_a2`,
  `pessoa_zero`; `total` = 3; `p_limite 1, p_deslocamento 1` devolve `gestor_a2`; `pessoa_a` (sem permissão)
  → 0 linhas; `admin_b` pedindo A → 0 linhas; central pedindo `null` → as duas consultorias;
  `consultorias_por_ocupacao` como central → A e B com `aguardando` certo; consultoria C em que todos têm
  carga 0 → última, com ocupação nula e sem erro de divisão; como `admin_a` → 0 linhas.
- [ ] **Passo 2: Teste de volume** `ocupacao_volume.test.sql` (em transação, desfeito no fim): 200
  consultorias, 3.000 consultores (`auth.users` + `perfis`), 50.000 clientes, 200.000 check-ins fechados no
  mês, via `generate_series`; `performs_ok` de `consultorias_por_ocupacao()` e de
  `consultores_por_ocupacao(<uma consultoria>)` em até **200 ms** cada; `performs_ok` da lista da central
  (`select ... from clientes where not arquivado and consultoria_id is null order by nome, id limit 15`) em
  até 50 ms. Se não passar: guardar os totais por gatilho (tabela `cargas`) **e registrar no design**.
- [ ] **Passo 3:** `npm run test:db` → FALHA.
- [ ] **Passo 4:** migração; `npx supabase migration up`; `npm run test:db` → PASSA.
- [ ] **Passo 5:** commit `Ocupação de consultores e consultorias para a sugestão`.

### Task 8: CNPJ, horas e mensagens no navegador

**Arquivos:**
- Criar: `src/lib/cnpj.js`, `src/lib/cnpj.test.js`, `src/lib/horas.js`, `src/lib/horas.test.js`
- Modificar: `src/lib/erros.js` (+ `src/lib/erros.test.js` se existir; senão criar)

**Interfaces:**
- Produz:
  - `normalizarCnpj(texto: string): string` (tira tudo que não é `0-9A-Za-z`, maiúsculas);
    `formatarCnpj(normalizado: string): string` (`XX.XXX.XXX/XXXX-XX`); `cnpjValido(texto: string): boolean`
    (mesmo cálculo de `private.cnpj_valido`).
  - `formatarHoras(n: number|null): string` (`12,5 h`, `0 h`, `—` para nulo);
    `formatarOcupacao(n: number|null): string` (`42%`, `—`); `horasEntre(inicio: Date, fim: Date): number`.
  - `traduzirErroBanco(erro, { sobre } = {})`: `sobre` ∈ `'time' | 'cliente' | 'checkin'` (padrão `'time'`,
    mantendo as mensagens atuais). Códigos novos: `23505` + cliente → `Já existe um cliente com esse CNPJ
    (pode estar entre os arquivados).`; `23503` + cliente → `Este cliente tem horas registradas. Arquive em
    vez de apagar.`; `23514` → `Confira os campos destacados.`; `23P01` → `Esse horário se sobrepõe a outro
    check-in seu.`; mensagens do banco `so_central_muda` → `Só a central muda os dados do cliente.`,
    `consultor_invalido` → `Escolha um consultor ativo desta consultoria.`, `consultoria_arquivada` → `Essa
    consultoria está arquivada.`, `checkin_sem_cliente` → `Você não é o consultor deste cliente.`,
    `checkin_no_futuro` → `O horário não pode estar no futuro.`, `sem_permissao` → a mensagem atual de sem permissão.

- [ ] **Passo 1: Testes**: `cnpjValido('11.222.333/0001-81')` true; `cnpjValido(' 11222333000182 ')` false;
  `cnpjValido('12.abc.345/01de-35')` true; `normalizarCnpj('12.abc.345/01de-35')` = `'12ABC34501DE35'`;
  `formatarCnpj('11222333000181')` = `'11.222.333/0001-81'`; `formatarHoras(12.5)` = `'12,5 h'`;
  `formatarOcupacao(0.4187)` = `'42%'`; `traduzirErroBanco({ code: '23505' })` continua `'Já existe um time
  com esse nome.'`; `traduzirErroBanco({ code: 'P0001', message: 'consultor_invalido' }, { sobre: 'cliente' })`
  = a mensagem acima.
- [ ] **Passo 2:** `npm test -- src/lib` → FALHA. **Passo 3:** implementar. **Passo 4:** PASSA.
- [ ] **Passo 5:** commit `CNPJ, horas e mensagens de cliente no navegador`.

### Task 9: Funções de dados e caminho completo de verdade

**Arquivos:**
- Criar: `src/data/clientes.js`, `src/data/capacidade.js`, `src/data/checkins.js`,
  `tests/integracao/clientes.test.js`
- Modificar: `tests/integracao/ambiente.js` (`registrarCliente(id)`; `limparTudo` apaga antes `checkins` e
  `clientes` dos registrados e das consultorias de teste)

**Interfaces:**
- Consome: tabelas e funções das Tarefas 4–7; `buscarPagina` (`src/data/paginar.js`); Tarefa 8.
- Produz (todas as escritas devolvem `{ erro }` traduzido, `{ erro: null }` em sucesso; nenhuma linha afetada
  → erro de sem permissão, como em `times.js`):
  - `clientes.js`:
    - `listarClientes({ aba, consultoriaId, consultorId, busca, pagina })` → `{ itens, total, foraDaFaixa? }`.
      `aba`: `'distribuir'` (sem consultoria, ativo), `'nas_consultorias'` (com consultoria, ativo),
      `'arquivados'`, `'aguardando'` (com consultoria, sem consultor), `'atendimento'` (com consultor, ativo),
      `'meus'` (consultor = eu, ativo). `consultorId = 'sem'` filtra sem consultor. Busca: termo sem acento,
      com `%`, `_` e `\` escapados, em `busca ilike`. Campos: `id, nome, razao_social, cnpj, cidade, uf,
      horas_mes, enviado_em, consultor_desde, arquivado, consultoria_id, consultor_id,
      consultoria:consultorias(id, nome), consultor(id, nome, foto, ativo), realizado_no_mes`. Ordem `nome`, `id`.
    - `buscarCliente(id)`, `criarCliente(dados)` → `{ id } | { erro }`, `editarCliente(id, dados)`,
      `mandarParaConsultoria(id, consultoriaId)`, `escolherConsultor(id, consultorId)`,
      `ajustarPrevisao(id, horasMes)`, `arquivarCliente(id)`, `reativarCliente(id)`, `apagarCliente(id)`,
      `listarEventos(clienteId, { pagina })`.
    - `dados` do formulário em camelCase (`nome, razaoSocial, cnpj, cidade, uf, contatoNome, contatoTelefone,
      contatoEmail, observacoes, horasMes`); CNPJ vai normalizado; texto vazio vira `null`.
  - `capacidade.js`: `consultoresPorOcupacao({ consultoriaId, busca, limite = 8, deslocamento = 0, mes })` e
    `consultoriasPorOcupacao({ busca, limite = 8, deslocamento = 0, mes })` → `{ itens, total }` (`total` da
    primeira linha, 0 sem linhas); `definirCarga(perfilId, horas)`; `listarAusencias(perfilId, { pagina })`;
    `criarAusencia({ perfilId, de, ate, motivo })`; `editarAusencia(id, { de, ate, motivo })`; `apagarAusencia(id)`.
  - `checkins.js`: `meuCheckinAberto()` → `{ id, cliente_id, inicio, cliente: { nome } } | null`;
    `fazerCheckin(clienteId)`; `fazerCheckout(id, descricao)`; `lancarHoras({ clienteId, inicio, fim,
    descricao })`; `editarCheckin(id, { inicio, fim, descricao })`; `apagarCheckin(id)`;
    `listarCheckins({ clienteId, consultorId, pagina })` (campos `id, inicio, fim, descricao, consultor_id,
    consultoria_id, consultor:perfis(nome), cliente:cliente_do_checkin(id, nome)`, ordem `inicio desc`).

- [ ] **Passo 1: Teste de integração** `clientes.test.js` (Supabase local; central, consultorias A e B,
  `gestor` de A **sem times**, `pessoa` de A fora de times):
  - central cria cliente com `criarCliente`-equivalente via supabase-js, manda para A;
  - `gestor` chama `consultores_por_ocupacao` com A → vê a `pessoa` (fora dos times dele), primeiro da lista;
  - `gestor` escolhe a `pessoa`; a lista do `gestor` (aba `atendimento`) traz `consultor.nome` da pessoa
    (relação calculada pelo PostgREST) e `consultoria.nome`;
  - 16 clientes em A → `range(0,14)` com `count: 'exact'` devolve 15 e `total` 16;
  - busca `chapeco` acha `Chapecó`; busca `50%_(x),y` não dá erro e devolve 0;
  - `pessoa` faz check-in e check-out; `realizado_no_mes` aparece para `pessoa`, `gestor` e central, e 0 linhas
    de check-in para o admin de B;
  - central chama `consultorias_por_ocupacao` → A primeiro se estiver menos ocupada.
- [ ] **Passo 2:** `npm run test:integracao -- clientes` → FALHA.
- [ ] **Passo 3:** implementar os três arquivos de `src/data` e o ajuste de `ambiente.js`.
- [ ] **Passo 4:** `npm run test:integracao` → PASSA (todos; a limpeza não pode falhar por chave estrangeira).
- [ ] **Passo 5:** commit `Funções de dados de clientes, capacidade e check-ins`.

### Task 10: Tela Clientes e formulário (central)

**Arquivos:**
- Criar: `src/pages/Clientes.jsx`, `src/pages/Clientes.test.jsx`, `src/components/clientes/FormularioCliente.jsx`,
  `src/components/clientes/FormularioCliente.test.jsx`
- Modificar: `src/components/shell/menu.js` (+ teste), `src/index.css` (animação `transmitir`), `src/rotas.jsx`

**Interfaces:**
- Consome: `src/data/clientes.js` (Tarefa 9), `cnpj.js`/`horas.js` (Tarefa 8), `veTudo` (Tarefa 3).
- Produz: item de menu `{ id: 'clientes', rotulo: 'Clientes', rota: '/clientes', icone: RadioTower,
  animacao: 'transmitir', papeis: ['dono','central','admin','gestor','pessoa'] }` logo depois de Início;
  `<FormularioCliente aberto cliente? aoFechar aoSalvar(dados) => Promise<{ erro }> />` (título "Novo
  cliente" ou "Editar cliente"); rota `/clientes`.

- [ ] **Passo 1: Testes** (`renderizarTela`, `vi.mock('@/data/clientes')`):
  - central: tabela `Clientes` com as abas **A distribuir**, **Nas consultorias**, **Arquivados**; botão
    **Novo cliente**; colunas Cliente, CNPJ (formatado), Cidade, Previsão, Consultoria, Consultor;
  - **Editar** abre "Editar cliente" com nome, CNPJ formatado e previsão da linha; Salvar chama
    `editarCliente('<id>', expect.objectContaining({ nome, horasMes }))`;
  - formulário: nome com 1 letra → "Use pelo menos 2 caracteres no nome."; CNPJ `11.222.333/0001-82` →
    "CNPJ inválido."; previsão vazia → "Informe a previsão de horas por mês.";
  - **Arquivar** e **Apagar** pedem confirmação e chamam `arquivarCliente`/`apagarCliente`; apagar com erro
    `23503` mostra "Este cliente tem horas registradas. Arquive em vez de apagar." e mantém a janela;
  - linha com `realizado_no_mes` 41 e `horas_mes` 40 mostra a marca **Passou da previsão**;
  - busca e troca de aba chamam `listarClientes` com `pagina: 1`; paginação: some com 15, aparece com 16,
    Próxima pede `pagina: 2`; `foraDaFaixa` na página 2 volta para a 1;
  - `menu.test.js`: `ids('pessoa')` = `['inicio', 'clientes', 'projetos']`; `clientes` usa `transmitir`.
- [ ] **Passo 2:** `npm test` → FALHA. **Passo 3:** implementar (padrão de `Times.jsx`/`Usuarios.jsx`;
  `@keyframes icone-transmitir` com dois pulsos de escala). **Passo 4:** `npm test` e `npm run lint` → PASSA.
- [ ] **Passo 5:** commit `Tela Clientes: lista, cadastro, edição, arquivar e apagar`.

### Task 11: Mandar para consultoria e escolher consultor

**Arquivos:**
- Criar: `src/components/clientes/ListaDeOcupacao.jsx`, `JanelaMandar.jsx`, `JanelaConsultor.jsx` e testes
- Modificar: `src/pages/Clientes.jsx` (+ teste)

**Interfaces:**
- Consome: `consultoriasPorOcupacao`, `consultoresPorOcupacao` (Tarefa 9), `mandarParaConsultoria`,
  `escolherConsultor`.
- Produz:
  - `<ListaDeOcupacao itens total escolhido aoEscolher aoMostrarMais rotuloDoValor />`: lista de opções
    (rádio) com a marca **Sugestão: menor ocupação** no primeiro item com ocupação não nula, barra de
    ocupação, "Mostrando 8 de 211" e **Mostrar mais** (+8).
  - `<JanelaMandar aberto cliente aoFechar aoMandar(consultoriaId) />`: título `Mandar <nome> para uma
    consultoria`, busca (espera 300 ms), começa com a sugestão escolhida, prévia "A ocupação da STI passa de
    52% para 58%.", botão `Mandar para <consultoria>`.
  - `<JanelaConsultor aberto cliente aoFechar aoEscolher(consultorId) />`: título `Escolher o consultor de
    <nome>` (ou `Trocar o consultor de <nome>`), consultores da consultoria do cliente, prévia "Ana passa de
    40% para 64%.", consultor atual marcado **Atual** e sem a sugestão.
  - Abas do administrador/gestor da consultoria: **Aguardando consultor** (marca **Novo**) e **Em
    atendimento**; ações **Escolher consultor**/**Trocar consultor** e **Ajustar previsão** (janela com o
    campo de horas).

- [ ] **Passo 1: Testes**: a janela começa com o primeiro item escolhido e a marca de sugestão nele; escolher
  outro e confirmar chama `mandarParaConsultoria('<cliente>', '<outra>')`; digitar na busca chama
  `consultoriasPorOcupacao` com `busca` depois de 300 ms (fake timers); **Mostrar mais** pede `deslocamento: 8`;
  consultor com ocupação nula não recebe a sugestão; como gestor, abas certas e **Escolher consultor** chama
  `escolherConsultor`; como pessoa, nenhuma dessas ações aparece.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** `npm test`, `npm run lint` → PASSA.
- [ ] **Passo 5:** commit `Distribuir com sugestão: central escolhe a consultoria, gestor o consultor`.

### Task 12: Check-in, check-out e lançar horas

**Arquivos:**
- Criar: `src/components/clientes/BotaoCheckin.jsx`, `JanelaCheckin.jsx` e testes
- Modificar: `src/pages/Clientes.jsx` (aba `meus` do consultor, + teste)

**Interfaces:**
- Consome: `meuCheckinAberto`, `fazerCheckin`, `fazerCheckout`, `lancarHoras` (Tarefa 9).
- Produz: `<BotaoCheckin cliente aberto aoMudar />` ("Fazer check-in" ou "Fazer check-out · 1 h 05" quando o
  aberto é deste cliente; desabilitado com dica quando há um aberto em outro cliente);
  `<JanelaCheckin modo="checkout"|"lancar" ... />` (check-out pede "O que foi feito"; lançar pede data,
  início, fim e o que foi feito; mensagens de erro do banco traduzidas).

- [ ] **Passo 1: Testes**: consultor vê "Meus clientes" com previsão × realizado; check-in chama
  `fazerCheckin('<id>')`; com aberto, o botão vira check-out e a janela exige descrição; lançar com fim antes
  do início mostra "O fim precisa ser depois do início."; erro `23P01` mostra a mensagem de sobreposição;
  aba **Meus check-ins** (tabela paginada com o nome do cliente vindo de `cliente_do_checkin`, inclusive de
  cliente que já saiu dele) com **Editar** preenchido e **Apagar** com confirmação (`listarCheckins({
  consultorId: <eu> })` — o campo do cliente em `checkins.js` é `cliente:cliente_do_checkin(id, nome)`).
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** PASSA. **Passo 5:** commit `Check-in e
  lançamento de horas do consultor`.

### Task 13: Página do cliente

**Arquivos:**
- Criar: `src/pages/Cliente.jsx`, `src/pages/Cliente.test.jsx`
- Modificar: `src/rotas.jsx` (`/clientes/:id`), `src/pages/Clientes.jsx` (nome vira link)

**Interfaces:**
- Consome: `buscarCliente`, `listarCheckins`, `editarCheckin`, `apagarCheckin`, `listarEventos`, as janelas
  das Tarefas 10–12.
- Produz: página com cabeçalho (nome, situação, consultoria, consultor), blocos Empresa, Contato, Previsão ×
  realizado no mês (com aviso "Passou da previsão" quando realizado > previsão), tabela **Check-ins** (data,
  consultor, horas, o que foi feito; Editar/Apagar para quem pode) e tabela **Histórico** (quando, o quê,
  quem), ambas paginadas no banco; as mesmas ações da lista conforme o papel.

- [ ] **Passo 1: Testes**: mostra os dados do cliente pedido pela rota; aviso aparece com realizado 41 e
  previsão 40; Editar check-in abre preenchido e salva com `editarCheckin`; Apagar confirma; histórico mostra
  "Mandado para STI Consult"; cliente inexistente → "Cliente não encontrado."
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** PASSA. **Passo 5:** commit `Página do cliente
  com check-ins e histórico`.

### Task 14: Capacidade e ausências

**Arquivos:**
- Criar: `src/pages/Capacidade.jsx` (+ teste), `src/components/capacidade/EditarCarga.jsx`,
  `src/components/capacidade/JanelaAusencias.jsx` (+ testes)
- Modificar: `src/components/shell/menu.js` (+ teste), `src/index.css` (animação `medir`), `src/rotas.jsx`,
  `src/components/perfil/MeuPerfil.jsx` (+ teste: "Minhas ausências", só leitura)

**Interfaces:**
- Consome: `consultoresPorOcupacao`, `consultoriasPorOcupacao`, `definirCarga`, ausências (Tarefa 9).
- Produz: item `{ id: 'capacidade', rotulo: 'Capacidade', rota: '/capacidade', icone: Gauge, animacao:
  'medir', papeis: ['dono','central','admin','gestor'] }` depois de Clientes; página com mês (Anterior/Próximo),
  aba **Consultores** (tabela: consultor, consultoria para central, carga, capacidade, reservado, realizado,
  ocupação, clientes; 15 por página via `limite: 15, deslocamento`) e, para central/dono, aba **Consultorias**;
  em meses passados a coluna Reservado some e Ocupação vira "Utilização".

- [ ] **Passo 1: Testes**: tabela `Capacidade` pelo nome; **Editar carga** abre com a carga da linha e salva
  `definirCarga('<id>', 40)`; valor 61 → "Use de 0 a 60 horas."; **Ausências** lista, cria (de/até/motivo),
  edita preenchido e apaga com confirmação; mês anterior esconde Reservado; paginação pede `deslocamento: 15`;
  `menu.test.js`: `ids('gestor')` inclui `capacidade` com `medir`; pessoa não tem o item.
- [ ] **Passo 2:** FALHA. **Passo 3:** implementar. **Passo 4:** `npm test`, `npm run lint` → PASSA.
- [ ] **Passo 5:** commit `Capacidade: carga semanal, ausências e ocupação`.

### Task 15: Documentação e verificação final

**Arquivos:**
- Modificar: `README.md` (tabela "Quem é quem" com Administrador geral e Central; comandos iguais),
  `CLAUDE.md` (regra curta: "Clientes: a central cadastra e manda; a consultoria escolhe o consultor; check-in
  é de quem trabalhou"), `docs/superpowers/specs/2026-11-13-clientes-design.md` (só se algo mudou na construção)

- [ ] **Passo 1:** `npm test`, `npm run test:db`, `npm run test:integracao`, `npm run lint`, `npm run build`
  → tudo verde (colar as contagens no relatório).
- [ ] **Passo 2: Navegador** (`http://localhost:5173`, contas de exemplo do `README`, senha `exemplo-123`):
  criar pelo teste de integração ou pelo Diego uma central de teste `central@exemplo.test` (nunca mover a
  Jaine sem ele pedir); como central, cadastrar cliente, mandar para a Consultoria Exemplo com a sugestão;
  como `gestor@exemplo.test`, escolher o consultor, editar a previsão e paginar (criar 16 clientes de teste
  `Teste …` e arquivá-los no fim — **perguntar antes de apagar**); como `ana@exemplo.test`, check-in e
  check-out; Capacidade como gestor. Capturas de cada passo.
- [ ] **Passo 3:** commit `Documentação de clientes e central`. **Perguntar ao Diego antes de push e PR.**
