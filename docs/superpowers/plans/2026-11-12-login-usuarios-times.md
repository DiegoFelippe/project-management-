# Login, usuários e times — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Login (e-mail/senha, Google, botão de SSO), várias consultorias isoladas entre si, e as telas Consultorias, Usuários e Times com criação de acesso por convite ou com senha.

**Architecture:** O banco (Supabase local, Postgres 17) guarda consultorias, perfis, times e membros, com RLS recortando tudo por consultoria e por papel. Tudo que cria login roda em Edge Functions com a chave secreta; o navegador só usa a chave publicável. A tela é React 19 + Vite 8 com a moldura do app de música (trilho + barra + painel rebaixado) nas cores da opção C.

**Tech Stack:** React 19, Vite 8, react-router 8, Tailwind CSS 4, Radix (dialog, label, slot), lucide-react, sonner, supabase-js 2.119.0, Supabase CLI 3.1.0, Edge Functions (Deno/TypeScript), pgTAP (`supabase test db`), Vitest 5 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-12-login-usuarios-times-design.md`

**Branch:** trabalhe em `feat/login-usuarios-times` (crie a partir de `main`). Commits locais a cada tarefa; nada de push sem o Diego pedir.

## Global Constraints

- Node 26 (`nvm use`); todo comando npm/npx roda com ele. Supabase local já está no ar em `http://127.0.0.1:54521` (`npm run db:start`).
- Versões **exatas** no `package.json` (sem `^`). Novas: `react-router@8.5.1`, `@radix-ui/react-dialog@1.3.1`, `@radix-ui/react-label@2.1.17`, `@radix-ui/react-slot@1.5.0`, `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.7.0`, `lucide-react@1.72.0`, `sonner@2.0.8`; dev: `tailwindcss@4.3.5`, `@tailwindcss/vite@4.3.5`, `tw-animate-css@1.4.0`, `vitest@5.1.0`, `@testing-library/react@16.3.3`, `@testing-library/jest-dom@7.0.1`, `@testing-library/user-event@14.6.10`, `jsdom@31.0.0`. Fixe também as que hoje têm `^` na versão instalada do `package-lock.json`.
- Edge Functions importam `npm:@supabase/supabase-js@2.119.0`.
- A chave secreta (`sb_secret_…` / service role) **nunca** aparece em `src/`, em `.env.local` nem no git. Só em Edge Functions (variável do ambiente) e nos scripts locais (lida de `supabase status`).
- Toda tabela com RLS ligado e `GRANT` explícito só para `authenticated`; `anon` não recebe nada.
- Papel e consultoria vêm só de `public.perfis`, nunca de `user_metadata`.
- Papéis: `'dono' | 'admin' | 'gestor' | 'pessoa'`. Dono tem `consultoria_id` nulo; os outros, obrigatório.
- Cores (opção C): moldura `#ffffff`, painel `#eef1f5`, destaque `#2563eb` com texto `#ffffff`, texto `#0f172a`, texto secundário `#64748b`, bordas `#e2e8f0`. Trilho 72 px, barra de cima 52 px, painel com só o canto superior esquerdo arredondado.
- Português do Brasil em toda tela, mensagem e e-mail. Senha com no mínimo 8 caracteres.
- Mensagens fixas (use exatamente estas):

| Código | Mensagem |
| --- | --- |
| `invalid_credentials` | E-mail ou senha incorretos. |
| `signup_disabled` | Esse e-mail não tem acesso. Peça o acesso ao gestor ou ao administrador da sua consultoria. |
| `email_not_confirmed` | Esse acesso ainda não foi ativado. Abra o convite que chegou no seu e-mail. |
| provedor desligado | O login com Google ainda não foi configurado. |
| SSO (qualquer erro) | O SSO da sua empresa ainda não foi configurado. Entre com e-mail e senha ou com o Google. |
| `over_request_rate_limit`, `over_email_send_rate_limit` | Muitas tentativas seguidas. Espere um pouco e tente de novo. |
| `weak_password` | A senha precisa ter pelo menos 8 caracteres. |
| `same_password` | A senha nova precisa ser diferente da atual. |
| `nao_autenticado` | Sua sessão terminou. Entre de novo. |
| `sem_permissao` | Você não tem permissão para isso. |
| `dados_invalidos` | Confira os campos destacados. |
| `ja_na_consultoria` | Essa pessoa já tem acesso na sua consultoria. |
| `email_indisponivel` | Não foi possível criar esse acesso com esse e-mail. Fale com o suporte. |
| `convite_ja_aceito` | Essa pessoa já aceitou o convite. |
| `23505` (nome de time repetido) | Já existe um time com esse nome. |
| qualquer outro | Algo deu errado. Tente de novo. |

## Review Focus

1. **E-mail digitado com maiúsculas ou espaços** (`" Joao@Empresa.com "`): tem que bater com o acesso que já existe (`joao@empresa.com`), nunca criar um segundo. Teste em `criar-acesso` (Tarefa 2).
2. **Clique duplo em "Criar acesso"** (dois pedidos iguais ao mesmo tempo): um acesso só; o segundo pedido volta 409. Teste em `criar-acesso` (Tarefa 2) e botão desabilitado enquanto envia (Tarefa 8).
3. **Link de convite ou de senha aberto de novo ou vencido:** `/definir-senha` sem sessão mostra "Esse link expirou ou já foi usado." e o link "Esqueci minha senha", nunca um formulário que falha. Teste na Tarefa 5.
4. **Time com nome repetido na mesma consultoria:** o banco recusa (23505) e a tela diz "Já existe um time com esse nome."; em consultorias diferentes o mesmo nome é permitido. Testes nas Tarefas 1 e 7.
5. **"Esqueci minha senha" com e-mail que não existe:** a tela mostra a mesma resposta de sempre ("Se esse e-mail tiver acesso, enviamos um link para criar uma senha nova."), sem revelar se o e-mail existe. Teste na Tarefa 5.

---

### Task 1: Banco — consultorias, perfis, times, membros e RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_acesso_base.sql` (gere com `npx supabase migration new acesso_base`)
- Create: `supabase/tests/database/acesso.test.sql`
- Modify: `package.json` (script `"test:db": "supabase test db"`)

**Interfaces:**
- Produces (tabelas em `public`):
  - `consultorias(id uuid pk default gen_random_uuid(), nome text not null check (char_length(btrim(nome)) between 2 and 120), criado_em timestamptz not null default now())`
  - `perfis(id uuid pk references auth.users on delete cascade, consultoria_id uuid references consultorias on delete restrict, nome text not null check (char_length(btrim(nome)) between 2 and 120), email text not null unique, papel text not null check (papel in ('dono','admin','gestor','pessoa')), precisa_trocar_senha boolean not null default false, convite_pendente boolean not null default false, criado_por uuid references perfis on delete set null, criado_em timestamptz not null default now(), check ((papel = 'dono') = (consultoria_id is null)))`
  - `times(id uuid pk default gen_random_uuid(), consultoria_id uuid not null references consultorias on delete cascade, nome text not null check (char_length(btrim(nome)) between 2 and 80), descricao text check (descricao is null or char_length(descricao) <= 500), gestor_id uuid not null references perfis on delete restrict, criado_por uuid default auth.uid() references perfis on delete set null, criado_em timestamptz not null default now(), unique (consultoria_id, nome))`
  - `time_membros(time_id uuid references times on delete cascade, pessoa_id uuid references perfis on delete cascade, adicionado_por uuid default auth.uid() references perfis on delete set null, adicionado_em timestamptz not null default now(), primary key (time_id, pessoa_id))`
- Produces (schema `private`, não exposto; todas `security definer`, `stable`, `set search_path = ''`, `execute` só para `authenticated`):
  - `private.liberado() returns boolean` — existe perfil de `auth.uid()` com `precisa_trocar_senha = false`
  - `private.papel_atual() returns text`, `private.consultoria_atual() returns uuid`
  - `private.sou_dono() returns boolean`, `private.sou_admin() returns boolean` (ambas exigem `liberado()`)
  - `private.gerencio_time(p_time uuid) returns boolean` — liberado e (admin da consultoria do time, ou `times.gestor_id = auth.uid()`). Dono **não** gerencia.
  - `private.vejo_time(p_time uuid) returns boolean` — liberado e (dono, ou time da minha consultoria e (admin, ou gestor do time, ou membro do time))
  - `private.vejo_perfil(p_id uuid) returns boolean` — `p_id = auth.uid()` (sempre, mesmo sem estar liberado) ou liberado e (dono, ou mesma consultoria e (admin, ou `criado_por = auth.uid()`, ou membro de um time em que eu sou o gestor))
- Produces (gatilhos):
  - `times` antes de insert/update: `gestor_id` precisa ser perfil da mesma consultoria com papel `gestor` ou `admin` (senão `raise exception` com errcode `P0001`).
  - `time_membros` antes de insert: `pessoa_id` precisa ser da mesma consultoria do time e não ser `dono` (`P0001`).
  - `auth.users` depois de update de `encrypted_password` (quando muda) → `perfis.precisa_trocar_senha = false`.
  - `auth.users` depois de update de `email_confirmed_at` (quando fica não nulo) → `perfis.convite_pendente = false`.
- Produces (políticas e permissões):
  - `consultorias`: select `sou_dono() or (id = consultoria_atual() and liberado())`. Sem insert/update/delete para `authenticated` (só Edge Function).
  - `perfis`: select `vejo_perfil(id)`. Sem escrita para `authenticated`.
  - `times`: select `vejo_time(id)`; insert com check `liberado() and consultoria_id = consultoria_atual() and ((papel_atual() = 'gestor' and gestor_id = auth.uid()) or sou_admin())`. Sem update/delete.
  - `time_membros`: select `vejo_time(time_id)`; insert com check `gerencio_time(time_id)` e `adicionado_por = auth.uid()`; delete `gerencio_time(time_id)`.
  - `grant select on consultorias, perfis to authenticated; grant select, insert on times to authenticated; grant select, insert, delete on time_membros to authenticated;` e `revoke all ... from anon`.

- [ ] **Step 1: Crie a branch e a migração vazia**

Run: `git switch -c feat/login-usuarios-times && npx supabase migration new acesso_base`
Expected: arquivo `supabase/migrations/<timestamp>_acesso_base.sql` criado.

- [ ] **Step 2: Escreva o teste de banco que falha**

`supabase/tests/database/acesso.test.sql`, tudo dentro de `begin; … select * from finish(); rollback;`. Comece com estes ajudantes (não são óbvios, por isso vão inteiros):

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(25); -- ajuste para o total de asserções

create temp table fx (nome text primary key, id uuid not null);
grant select on fx to authenticated, anon;

create function pg_temp.usuario(p_nome text, p_email text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into fx values (p_nome, v);
  return v;
end $$;

create function pg_temp.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from fx where nome = p_nome), 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.id(p_nome text) returns uuid language sql as $$ select id from fx where nome = p_nome $$;
```

Fixtures (como `postgres`): consultorias `A` e `B`; usuários e perfis `dono` (dono), `admin_a`, `gestor_a1`, `gestor_a2`, `pessoa_a`, `pessoa_a_prov` (pessoa, `precisa_trocar_senha = true`), `pessoa_a_conv` (pessoa, `convite_pendente = true`) em A; `admin_b`, `pessoa_b` em B. Times: `time_a1` (gestor `gestor_a1`, membro `pessoa_a`), `time_a2` (gestor `gestor_a2`), `time_b1` (gestor `admin_b`, membro `pessoa_b`). Volte para `postgres` entre blocos com `reset role;`.

Asserções (uma por linha, nesta ordem):
- como `admin_b`: `is((select count(*) from consultorias where id = pg_temp.id('A')), 0::bigint, 'admin de B não vê a consultoria A')`
- como `admin_b`: 0 times de A; 0 perfis de A.
- como `admin_a`: vê 2 times; vê os 6 perfis de A.
- como `gestor_a1`: vê só `time_a1` (1 time); vê 2 perfis (ele e `pessoa_a`).
- como `pessoa_a`: vê 1 time (`time_a1`); não vê `time_a2`.
- como `pessoa_a_prov`: vê 1 perfil (o próprio), 0 times, 0 consultorias.
- como `dono`: vê 2 consultorias e 3 times.
- como `dono`: `throws_ok` ao inserir time em A (`42501`).
- como `gestor_a1`: `lives_ok` ao criar time `'Novo do g1'` com `gestor_id` = ele mesmo.
- como `gestor_a1`: `throws_ok` ao criar time com `gestor_id = gestor_a2` (`42501`).
- como `gestor_a1`: `throws_ok` ao inserir `pessoa_a` em `time_a2` (`42501`).
- como `admin_a`: `lives_ok` ao criar time `'Do g2'` com `gestor_id = gestor_a2`.
- como `admin_a`: `throws_ok` ao criar time com `gestor_id = pessoa_a` (`P0001`).
- como `admin_a`: `throws_ok` ao inserir `pessoa_b` em `time_a1` (`P0001`).
- como `admin_a`: `throws_ok` ao criar outro time com nome `'Do g2'` em A (`23505`).
- como `admin_b`: `lives_ok` ao criar time `'Do g2'` em B (mesmo nome, outra consultoria) com `gestor_id = admin_b`.
- como `gestor_a1`: `lives_ok` ao tirar `pessoa_a` de `time_a1`.
- como `anon` (`set local role anon`): `throws_ok('select * from perfis', '42501')`.
- como `postgres`: `update auth.users set encrypted_password = 'outro' where id = pg_temp.id('pessoa_a_prov')`, depois `is(precisa_trocar_senha, false, 'trocar a senha libera o acesso')`.
- como `postgres`: `update auth.users set email_confirmed_at = now()` para `pessoa_a_conv` com `email_confirmed_at` antes nulo (crie esse usuário com `email_confirmed_at` nulo), depois `is(convite_pendente, false, 'aceitar o convite tira o pendente')`.

- [ ] **Step 3: Rode e veja falhar**

Run: `npm run test:db`
Expected: FAIL (`relation "consultorias" does not exist`).

- [ ] **Step 4: Escreva a migração**

Tabelas, funções, gatilhos, políticas e grants exatamente como em **Interfaces**. As funções de `private` são `security definer` com dono `postgres`; `revoke all on schema private from public; grant usage on schema private to authenticated;`.

- [ ] **Step 5: Aplique e rode os testes**

Run: `npx supabase db reset && npm run test:db`
Expected: PASS, todas as asserções `ok`.

- [ ] **Step 6: Rode os avisos de segurança do Supabase**

Run: `npx supabase db advisors`
Expected: nenhum aviso de nível `ERROR` sobre as tabelas novas (RLS, `security definer` em schema exposto, `search_path`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations supabase/tests package.json
git commit -m "Banco de consultorias, perfis e times com regras de acesso"
```

---

### Task 2: Função criar-acesso e testes de integração

**Files:**
- Create: `scripts/supabase-local.mjs`
- Modify: `scripts/env-local.mjs` (passa a usar `lerStatusLocal()`)
- Create: `supabase/functions/_shared/http.ts`, `supabase/functions/_shared/clientes.ts`, `supabase/functions/_shared/validar.ts`, `supabase/functions/_shared/usuarios.ts`
- Create: `supabase/functions/criar-acesso/index.ts`
- Modify: `supabase/config.toml`
- Create: `vitest.config.js`
- Create: `tests/integracao/ambiente.js`, `tests/integracao/criar-acesso.test.js`
- Modify: `package.json` (scripts `"test": "vitest run --project unidade"`, `"test:integracao": "vitest run --project integracao"`)

**Interfaces:**
- Consumes: tabelas e gatilhos da Tarefa 1.
- Produces:
  - `scripts/supabase-local.mjs`: `export function lerStatusLocal(): { API_URL: string, PUBLISHABLE_KEY: string, SECRET_KEY: string, MAILPIT_URL: string }` (roda `supabase status -o env`; erro claro se o Supabase não estiver no ar).
  - `_shared/http.ts`: `corsHeaders`, `responder(status: number, corpo: object): Response`, `falha(status: number, codigo: string, extra?: object): Response`. OPTIONS responde 204 com CORS.
  - `_shared/clientes.ts`: `clienteAdmin(): SupabaseClient` (chave de `SUPABASE_SECRET_KEYS` → `['default']`, senão `SUPABASE_SERVICE_ROLE_KEY`); `quemChama(req: Request, admin): Promise<Perfil>` — lê o `Authorization: Bearer`, valida com `admin.auth.getUser(token)`, carrega o perfil; lança `Falha(401,'nao_autenticado')` sem token/usuário e `Falha(403,'sem_permissao')` se `precisa_trocar_senha`.
  - `_shared/validar.ts`: `validarAcesso(corpo): { forma: 'convite'|'senha', nome: string, email: string, papel: string, times: string[], senha?: string, redirectTo: string, consultoria_id?: string }` — nome com `trim` (2–120), e-mail com `trim().toLowerCase()` e formato `^[^\s@]+@[^\s@]+\.[^\s@]+$`, `forma` válida, `senha` ≥ 8 quando `forma = 'senha'`, `times` = lista de UUIDs sem repetição (máx. 50), `redirectTo` obrigatório. Inválido → `Falha(400, 'dados_invalidos', { campo })`.
  - `_shared/usuarios.ts`: `criarLogin(admin, { forma, email, senha, nome, redirectTo }): Promise<string>` (id do usuário; convite → `admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { nome } })`; senha → `admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } })`); `situacaoDoEmail(admin, email, consultoriaId): Promise<'livre' | { codigo: 'ja_na_consultoria', pessoa: { id, nome } } | { codigo: 'email_indisponivel' }>` (olha só `perfis` pelo e-mail).
  - `POST /functions/v1/criar-acesso` — corpo: `{ forma, nome, email, papel, times, senha?, redirectTo, consultoria_id? }`. Regras:
    - dono: só `papel = 'admin'`, `consultoria_id` obrigatório e existente, `times` vazio;
    - admin: `papel` em `pessoa|gestor`, `times` ⊆ times da consultoria dele;
    - gestor: `papel = 'pessoa'`, `times` ⊆ times com `gestor_id` = ele;
    - pessoa: 403.
    - Respostas: `201 { pessoa_id }`; `401 nao_autenticado`; `403 sem_permissao`; `400 dados_invalidos {campo}`; `409 ja_na_consultoria { pessoa: { id, nome } }`; `409 email_indisponivel` (sem nenhum outro dado); `500 erro_interno`.
    - Antes de tudo, `situacaoDoEmail`: se não for `'livre'`, responde 409 com ela. Depois cria o login, o perfil (`precisa_trocar_senha = forma === 'senha'`, `convite_pendente = forma === 'convite'`, `criado_por` = quem chama) e os `time_membros` (`adicionado_por` = quem chama).
    - Clique duplo: se `criarLogin` falhar com `email_exists`, ou se o insert do perfil falhar com `23505` (o outro pedido chegou primeiro; o convite do Supabase pode devolver o mesmo usuário em vez de erro), **não apague o login** e responda 409 com `situacaoDoEmail` (`'livre'` aqui vira `email_indisponivel`). Só apague o login criado (`admin.auth.admin.deleteUser`) quando o perfil ou os membros falharem por outro motivo.
  - `tests/integracao/ambiente.js`: `clienteAdmin()`, `criarConsultoriaDeTeste(nome?): Promise<string>`, `criarPerfilDeTeste({ papel, consultoriaId, precisaTrocar = false }): Promise<{ id, email, senha }>` (e-mail `teste-<uuid>@exemplo.test`, senha `teste-1234`), `criarTimeDeTeste({ consultoriaId, gestorId, nome? }): Promise<string>`, `entrarComo({ email, senha }): Promise<SupabaseClient>`, `chamarFuncao(cliente | null, nome, corpo): Promise<{ status: number, corpo: object }>` (fetch com `apikey` publicável e `Authorization` do cliente), `emailsPara(email): Promise<object[]>` (API do Mailpit `GET {MAILPIT_URL}/api/v1/search?query=to:<email>`), `limparTudo(): Promise<void>` (apaga tudo que o arquivo criou).
- `supabase/config.toml`: em `[auth]`, `enable_signup = false`, `minimum_password_length = 8`, `additional_redirect_urls = ["http://localhost:5173/**", "http://127.0.0.1:5173/**"]`; `[functions.criar-acesso] verify_jwt = false` (a função valida o token sozinha).
- `vitest.config.js`: projetos `unidade` (jsdom, `src/**/*.test.{js,jsx}`, setup `src/test/setup.js`) e `integracao` (node, `tests/integracao/**/*.test.js`, `testTimeout: 30000`, `fileParallelism: false`).

- [ ] **Step 1: Instale o Vitest e escreva `ambiente.js` e `vitest.config.js`**

Run: `npm i -D -E vitest@5.1.0`
Expected: `vitest` em `devDependencies` sem `^`.

- [ ] **Step 2: Escreva os testes que falham** (`tests/integracao/criar-acesso.test.js`)

Num `beforeAll`: consultorias A e B; em A `admin_a`, `gestor_a1`, `gestor_a2`, `pessoa_a`, times `t1` (gestor_a1) e `t2` (gestor_a2); em B `admin_b`. `afterAll(limparTudo)`. Todos os corpos levam `redirectTo: 'http://localhost:5173/definir-senha'`.

```js
it('gestor cria pessoa por convite nos times dele', async () => {
  const r = await chamarFuncao(gestor, 'criar-acesso', { forma: 'convite', nome: 'Joana Lima', email, papel: 'pessoa', times: [t1] })
  expect(r.status).toBe(201)
  const { data: p } = await admin.from('perfis').select('*').eq('id', r.corpo.pessoa_id).single()
  expect(p).toMatchObject({ papel: 'pessoa', consultoria_id: A, convite_pendente: true, precisa_trocar_senha: false })
  const { count } = await admin.from('time_membros').select('*', { count: 'exact', head: true }).eq('time_id', t1).eq('pessoa_id', p.id)
  expect(count).toBe(1)
  await expect.poll(() => emailsPara(email).then((m) => m.length), { timeout: 5000 }).toBe(1)
})
```

Os outros testes, cada um com sua asserção:
- `'gestor cria pessoa com senha e ela entra e precisa trocar'` → 201; perfil `precisa_trocar_senha: true`; `entrarComo({ email, senha: 'provisoria-1' })` funciona.
- `'gestor não cria gestor'` → 403 `sem_permissao`.
- `'gestor não usa time de outro gestor'` (`times: [t2]`) → 403.
- `'admin cria gestor'` → 201 e `papel: 'gestor'`.
- `'admin não cria admin'` → 403.
- `'pessoa não cria ninguém'` → 403.
- `'sem login'` (`chamarFuncao(null, …)`) → 401 `nao_autenticado`.
- `'e-mail com maiúsculas e espaços bate com o que já existe'` → cria `ana@exemplo.test`, depois pede `' Ana@Exemplo.TEST '` → 409 `ja_na_consultoria` com `corpo.pessoa.id` igual ao primeiro.
- `'e-mail de outra consultoria não diz onde está'` → `admin_b` pede o e-mail de `pessoa_a` → 409 e `expect(Object.keys(r.corpo).sort()).toEqual(['codigo'])`, `codigo: 'email_indisponivel'`.
- `'senha curta'` → 400 `dados_invalidos` com `campo: 'senha'`.
- `'dois pedidos iguais ao mesmo tempo criam um acesso só'` → `Promise.all` de dois pedidos idênticos; status ordenados `[201, 409]`; um único perfil com aquele e-mail.

- [ ] **Step 3: Rode e veja falhar**

Run: `npm run test:integracao`
Expected: FAIL (função responde 404).

- [ ] **Step 4: Implemente `scripts/supabase-local.mjs`, os módulos `_shared` e `criar-acesso/index.ts`; ajuste `config.toml` e `env-local.mjs`**

Depois de mudar `config.toml`: `npm run db:stop && npm run db:start`. Se a função nova der 404, reinicie do mesmo jeito.

- [ ] **Step 5: Rode os testes**

Run: `npm run test:integracao && npm run env:local`
Expected: PASS em todos; `env:local` continua gerando o `.env.local`.

- [ ] **Step 6: Commit**

```bash
git add scripts supabase/functions supabase/config.toml vitest.config.js tests package.json package-lock.json
git commit -m "Função criar-acesso com convite ou senha provisória"
```

---

### Task 3: Funções criar-consultoria e reenviar-convite

**Files:**
- Create: `supabase/functions/criar-consultoria/index.ts`, `supabase/functions/reenviar-convite/index.ts`
- Modify: `supabase/config.toml` (`[functions.criar-consultoria]` e `[functions.reenviar-convite]` com `verify_jwt = false`)
- Create: `tests/integracao/criar-consultoria.test.js`, `tests/integracao/reenviar-convite.test.js`

**Interfaces:**
- Consumes: `_shared/*` e `ambiente.js` da Tarefa 2.
- Produces:
  - `POST /functions/v1/criar-consultoria` — corpo `{ nome, admin: { forma, nome, email, senha? }, redirectTo }`. Só dono (senão 403). `nome` com `trim` (2–120). Cria a consultoria, o login e o perfil `admin`; se o login ou o perfil falharem, apaga o que criou. Respostas: `201 { consultoria_id, admin_id }`, `400 dados_invalidos {campo}`, `409 email_indisponivel`.
  - `POST /functions/v1/reenviar-convite` — corpo `{ pessoa_id, redirectTo }`. Pode quem enxerga a pessoa por `vejo_perfil` e a gerencia: admin da mesma consultoria, gestor que a criou ou que é gestor de um time dela, dono só para `papel = 'admin'`. Pessoa com `convite_pendente = false` → `409 convite_ja_aceito`. Sucesso: chama `inviteUserByEmail` de novo e responde `200 { ok: true }`. Se o Supabase recusar convidar de novo um usuário já convidado, use `resetPasswordForEmail(email, { redirectTo })`, que também leva a `/definir-senha`.

- [ ] **Step 1: Escreva os testes que falham**

`criar-consultoria.test.js`:
- `'dono cria consultoria com admin por convite'` → 201; a consultoria existe; o perfil `admin_id` tem `papel: 'admin'`, `consultoria_id` igual e `convite_pendente: true`; chega 1 e-mail.
- `'admin não cria consultoria'` → 403.
- `'nome da consultoria vazio'` (`nome: '  '`) → 400 com `campo: 'nome'`.
- `'dono cria outro admin numa consultoria existente pelo criar-acesso'` → `criar-acesso` com `papel: 'admin'` e `consultoria_id` → 201.
- `'dono não cria pessoa'` → `criar-acesso` com `papel: 'pessoa'` → 403.

`reenviar-convite.test.js`:
- `'admin reenvia convite pendente'` → 200; `emailsPara` chega a 2.
- `'não reenvia para quem já aceitou'` → 409 `convite_ja_aceito`.
- `'gestor não reenvia para pessoa que não vê'` → 403.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm run test:integracao`
Expected: FAIL nos testes novos (404).

- [ ] **Step 3: Implemente as duas funções e ajuste `config.toml`; reinicie o Supabase**

Run: `npm run db:stop && npm run db:start`

- [ ] **Step 4: Rode os testes**

Run: `npm run test:integracao`
Expected: PASS em todos (os da Tarefa 2 também).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions supabase/config.toml tests
git commit -m "Funções criar-consultoria e reenviar-convite"
```

---

### Task 4: E-mails em português, dono e dados de exemplo

**Files:**
- Create: `supabase/templates/convite.html`, `supabase/templates/recuperar-senha.html`
- Modify: `supabase/config.toml`
- Create: `scripts/criar-dono.mjs`, `scripts/exemplo-local.mjs`
- Modify: `package.json` (scripts `"dono:criar": "node scripts/criar-dono.mjs"`, `"exemplo:local": "node scripts/exemplo-local.mjs"`)
- Create: `tests/integracao/comandos.test.js`

**Interfaces:**
- Consumes: `lerStatusLocal()` (Tarefa 2), tabelas (Tarefa 1).
- Produces:
  - `config.toml`: `[auth.email.template.invite]` `subject = "Seu acesso à Consultoria"`, `content_path = "./supabase/templates/convite.html"`; `[auth.email.template.recovery]` `subject = "Crie uma senha nova"`, `content_path = "./supabase/templates/recuperar-senha.html"`. Os modelos usam `{{ .ConfirmationURL }}`; textos: convite "Você recebeu acesso à Consultoria. Clique no botão para criar sua senha. Se preferir, entre com o Google usando este mesmo e-mail." e botão "Criar minha senha"; recuperação "Recebemos um pedido para criar uma senha nova. Se não foi você, ignore este e-mail." e botão "Criar senha nova".
  - `npm run dono:criar -- <email> "<nome>"`: usa `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `APP_URL` do ambiente, ou o Supabase local (`lerStatusLocal()`) e `http://localhost:5173` quando faltarem. Convida o e-mail com `redirectTo = APP_URL + '/definir-senha'` e cria o perfil `papel = 'dono'`, `consultoria_id = null`, `convite_pendente = true`. Se já existir perfil para o e-mail, avisa e sai com código 0.
  - `npm run exemplo:local`: recusa (código 1) se a URL não for `127.0.0.1` ou `localhost`. Cria, se ainda não existir, a consultoria `Consultoria Exemplo` com `admin@exemplo.test` (admin), `gestor@exemplo.test` (gestor), `ana@exemplo.test` e `bruno@exemplo.test` (pessoas), todas com a senha `exemplo-123` e `precisa_trocar_senha = false`, e o time `Implantação` (gestor `gestor@exemplo.test`, membros Ana e Bruno). A senha fica escrita no próprio script como `SENHA_EXEMPLO`.

- [ ] **Step 1: Escreva os testes que falham** (`tests/integracao/comandos.test.js`)

Rode os comandos com `execFileSync('node', [...])`:
- `'criar-dono cria o perfil dono e manda o convite'` → com um e-mail `dono-<uuid>@exemplo.test`: perfil com `papel: 'dono'` e `consultoria_id: null`; 1 e-mail no Mailpit com o assunto `Seu acesso à Consultoria`.
- `'criar-dono de novo não duplica'` → segunda execução sai com código 0 e continua 1 perfil.
- `'exemplo-local cria a consultoria e dá para entrar'` → `entrarComo({ email: 'gestor@exemplo.test', senha: 'exemplo-123' })` funciona e o gestor vê 1 time `Implantação`.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm run test:integracao -- comandos`
Expected: FAIL (scripts não existem).

- [ ] **Step 3: Implemente os modelos de e-mail, o `config.toml` e os dois scripts; reinicie o Supabase**

- [ ] **Step 4: Rode os testes**

Run: `npm run test:integracao`
Expected: PASS.

- [ ] **Step 5: Crie o dono local de verdade**

Run: `npm run dono:criar -- diego@ixcsoft.com.br "Diego Felippe" && npm run exemplo:local`
Expected: mensagem de convite enviado; o e-mail aparece no Mailpit (`http://127.0.0.1:54524`).

- [ ] **Step 6: Commit**

```bash
git add supabase/templates supabase/config.toml scripts tests package.json
git commit -m "E-mails em português, comando do dono e dados de exemplo locais"
```

---

### Task 5: Base da tela, sessão e telas de entrar e de senha

**Files:**
- Modify: `vite.config.js` (plugin `@tailwindcss/vite`, alias `@` → `src`), `index.html`
- Create: `jsconfig.json` (`"paths": { "@/*": ["./src/*"] }`)
- Replace: `src/index.css` (Tailwind 4 + `tw-animate-css` + tokens da opção C em `@theme inline`, com `--color-moldura` e `--color-painel`)
- Delete: `src/App.jsx`, `src/App.css`, `src/components/StatusBanco.jsx`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`; tire `verificarConexao` de `src/lib/supabase.js`
- Create: `src/lib/utils.js` (`cn`), `src/components/ui/{button,input,label,dialog,sheet,badge,sonner}.jsx` (copiados de `~/Documents/pdf2musescore/frontend/src/components/ui/`, trocando só o que depender das cores de lá)
- Create: `src/lib/erros.js`, `src/lib/erros.test.js`
- Create: `src/auth/AuthProvider.jsx`, `src/auth/useAuth.js`, `src/auth/RotaProtegida.jsx`, `src/auth/RotaProtegida.test.jsx`
- Create: `src/pages/Entrar.jsx`, `src/pages/EsqueciSenha.jsx`, `src/pages/EsqueciSenha.test.jsx`, `src/pages/DefinirSenha.jsx`, `src/pages/DefinirSenha.test.jsx`, `src/pages/TrocarSenha.jsx`
- Create: `src/components/auth/TelaDeAcesso.jsx` (as duas colunas: arte + conteúdo), `src/components/auth/FormularioNovaSenha.jsx`
- Create: `src/rotas.jsx`; Modify: `src/main.jsx`
- Create: `src/test/setup.js` (`import '@testing-library/jest-dom/vitest'`)

**Interfaces:**
- Produces:
  - `src/lib/erros.js`: `traduzirErroAuth(erro: { code?: string, message?: string } | null): string`, `MENSAGEM_SSO: string`, `traduzirErroFuncao(codigo: string): string`, `traduzirErroBanco(erro: { code?: string }): string` — mensagens da tabela das Global Constraints. "Provedor desligado" = `code === 'validation_failed'` com `message` contendo `provider is not enabled`, ou `code === 'provider_disabled'`.
  - `src/auth/useAuth.js`: `export const AuthContext`; `export function useAuth(): { sessao, perfil, carregando, entrarComSenha(email, senha), entrarComGoogle(), entrarComSso(email), enviarRecuperacao(email), definirSenha(senha), recarregarPerfil(), sair() }`. Cada ação devolve `{ erro: string | null }` já traduzido.
  - `perfil`: `{ id, nome, email, papel, consultoria_id, precisa_trocar_senha, consultoria: { nome } | null }` (select `id, nome, email, papel, consultoria_id, precisa_trocar_senha, consultoria:consultorias(nome)`).
  - `entrarComGoogle()`: `signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } })`. `entrarComSso(email)`: `signInWithSSO({ domain: <parte depois do @>, options: { redirectTo: location.origin + '/' } })`; qualquer erro → `MENSAGEM_SSO`; com `data.url`, vai para lá.
  - `enviarRecuperacao(email)`: `resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: location.origin + '/definir-senha' })`.
  - Erro que volta do Google na URL (`error_code` na query ou no hash) aparece traduzido na tela Entrar.
  - `src/auth/RotaProtegida.jsx`: `<RotaProtegida papeis?: string[]>` com `<Outlet />`. Carregando → aviso "Carregando…"; sem sessão → `<Navigate to="/entrar" replace />`; `perfil.precisa_trocar_senha` e rota ≠ `/trocar-senha` → `<Navigate to="/trocar-senha" replace />`; `papeis` sem o papel do perfil → `<Navigate to="/" replace />`.
  - Rotas (`src/rotas.jsx`): `/entrar`, `/esqueci-senha`, `/definir-senha` fora da proteção; `/trocar-senha` protegida sem moldura; o resto dentro de `<RotaProtegida>` + `<Moldura>` (Tarefa 6).
  - Textos da tela Entrar: título "Entrar", subtítulo "Use o acesso que o seu gestor criou.", campos "E-mail" e "Senha", botão "Entrar", link "Esqueci minha senha", divisor "ou", botões "Entrar com Google" e "Entrar com SSO da empresa"; o SSO abre o campo "E-mail do trabalho" e o botão "Continuar com SSO". Arte: logo "C" e "Projetos, times e pessoas no mesmo lugar."

- [ ] **Step 1: Instale os pacotes de tela e de teste**

Run: `npm i -E react-router@8.5.1 @radix-ui/react-dialog@1.3.1 @radix-ui/react-label@2.1.17 @radix-ui/react-slot@1.5.0 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.7.0 lucide-react@1.72.0 sonner@2.0.8 && npm i -D -E tailwindcss@4.3.5 @tailwindcss/vite@4.3.5 tw-animate-css@1.4.0 @testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.10 jsdom@31.0.0`
Expected: tudo sem `^`.

- [ ] **Step 2: Escreva os testes de unidade que falham**

```js
// src/lib/erros.test.js
expect(traduzirErroAuth({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.')
expect(traduzirErroAuth({ code: 'signup_disabled' })).toBe('Esse e-mail não tem acesso. Peça o acesso ao gestor ou ao administrador da sua consultoria.')
expect(traduzirErroAuth({ code: 'validation_failed', message: 'Unsupported provider: provider is not enabled' })).toBe('O login com Google ainda não foi configurado.')
expect(traduzirErroAuth({ code: 'qualquer' })).toBe('Algo deu errado. Tente de novo.')
expect(traduzirErroFuncao('email_indisponivel')).toBe('Não foi possível criar esse acesso com esse e-mail. Fale com o suporte.')
expect(traduzirErroBanco({ code: '23505' })).toBe('Já existe um time com esse nome.')
```

- `RotaProtegida.test.jsx` (envolva com `AuthContext.Provider` e `MemoryRouter`): sem sessão mostra o conteúdo da rota `/entrar`; perfil com `precisa_trocar_senha: true` em `/times` vai para `/trocar-senha`; papel `pessoa` com `papeis={['dono','admin','gestor']}` vai para `/`; gestor em `/times` vê o conteúdo.
- `DefinirSenha.test.jsx`: sem sessão e sem carregar → `getByText('Esse link expirou ou já foi usado.')` e link "Esqueci minha senha" para `/esqueci-senha`; com sessão → campos "Senha nova" e "Repita a senha"; senhas diferentes → "As senhas não são iguais."
- `EsqueciSenha.test.jsx`: depois de enviar, com `enviarRecuperacao` resolvendo `{ erro: null }`, aparece "Se esse e-mail tiver acesso, enviamos um link para criar uma senha nova."

- [ ] **Step 3: Rode e veja falhar**

Run: `npm test`
Expected: FAIL (módulos não existem).

- [ ] **Step 4: Implemente a base visual, `erros.js`, a sessão, as rotas e as quatro telas**

`DefinirSenha` e `TrocarSenha` usam `FormularioNovaSenha` (mín. 8, "Repita a senha", botão "Salvar senha"); ao concluir, `recarregarPerfil()` e vão para `/`. `TrocarSenha`: título "Troque a senha provisória", texto "Antes de continuar, crie uma senha só sua."

- [ ] **Step 5: Rode testes, lint e build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS, sem erros de lint, build ok.

- [ ] **Step 6: Confira no navegador**

Run: `npm run app:up` e abra `http://localhost:5173/entrar`.
Expected: tela de duas colunas na cor C; "Entrar com Google" mostra "O login com Google ainda não foi configurado."; "Entrar com SSO da empresa" com `ana@exemplo.test` mostra a mensagem de SSO; `gestor@exemplo.test` / `exemplo-123` entra; Esqueci minha senha manda e-mail para o Mailpit e o link abre `/definir-senha` com o formulário.

- [ ] **Step 7: Commit**

```bash
git add -A src index.html vite.config.js jsconfig.json package.json package-lock.json public
git commit -m "Tela de entrar, Google, SSO e senhas"
```

---

### Task 6: Moldura com trilho, barra de cima e Início

**Files:**
- Create: `src/components/shell/menu.js`, `src/components/shell/menu.test.js`
- Create: `src/components/shell/Moldura.jsx`, `src/components/shell/Trilho.jsx`, `src/components/shell/BarraTopo.jsx`
- Create: `src/pages/Inicio.jsx`
- Modify: `src/rotas.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Tarefa 5).
- Produces:
  - `menu.js`: `itensDoMenu(papel: string): Array<{ id, rotulo, rota, icone, emBreve?: boolean }>`; `tituloDaRota(pathname: string): string`. Itens e ícones (`lucide-react`): `inicio` "Início" `/` `House`; `projetos` "Projetos" `emBreve` `FolderKanban`; `times` "Times" `/times` `Users`; `usuarios` "Usuários" `/usuarios` `UserPlus`; `consultorias` "Consultorias" `/consultorias` `Building2`.
  - `Moldura`: trilho (72 px, fundo `moldura`) + coluna com `BarraTopo` (52 px) e `<main>` com fundo `painel`, `rounded-tl-2xl`, sombra interna leve e `<Outlet />`. Abaixo de `md`, o trilho vira `Sheet` aberto pelo botão de menu da barra.
  - `Trilho`: logo "C" em cima; itens de `itensDoMenu(perfil.papel)` (o aberto com o quadrado em `primary`); `emBreve` desabilitado com o selo "em breve"; embaixo a bolinha com as iniciais e o primeiro nome, e "Sair" (chama `sair()` e vai para `/entrar`).
  - `BarraTopo`: `"<perfil.consultoria?.nome ?? 'Plataforma'> › <tituloDaRota(pathname)>"`, e à direita o papel por extenso ("Dono da plataforma", "Administrador", "Gestor", "Pessoa").
  - `Inicio`: "Olá, <primeiro nome>." e uma linha com o papel e a consultoria.

- [ ] **Step 1: Escreva o teste que falha** (`menu.test.js`)

```js
const ids = (papel) => itensDoMenu(papel).map((i) => i.id)
expect(ids('pessoa')).toEqual(['inicio', 'projetos'])
expect(ids('gestor')).toEqual(['inicio', 'projetos', 'times', 'usuarios'])
expect(ids('admin')).toEqual(['inicio', 'projetos', 'times', 'usuarios'])
expect(ids('dono')).toEqual(['inicio', 'projetos', 'times', 'usuarios', 'consultorias'])
expect(tituloDaRota('/times/0b5c')).toBe('Times')
expect(tituloDaRota('/')).toBe('Início')
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -- menu`
Expected: FAIL.

- [ ] **Step 3: Implemente `menu.js`, a moldura e o Início; ligue as rotas**

- [ ] **Step 4: Rode testes, lint e build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Confira no navegador**

Expected: entrando como `ana@exemplo.test` o trilho mostra só Início e Projetos (em breve); como `gestor@exemplo.test` aparecem Times e Usuários; a barra mostra "Consultoria Exemplo › Início"; em 375 px de largura o trilho vira gaveta.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Moldura com trilho, barra de cima e Início"
```

---

### Task 7: Times — lista, novo time e pessoas do time

**Files:**
- Create: `src/data/times.js`, `src/data/pessoas.js`
- Create: `src/pages/Times.jsx`, `src/pages/Time.jsx`
- Create: `src/components/times/CartaoTime.jsx`, `src/components/times/NovoTime.jsx`, `src/components/times/NovoTime.test.jsx`
- Create: `src/components/comum/FiltroConsultoria.jsx` (só para o dono)
- Modify: `src/rotas.jsx` (`/times` e `/times/:id` com `papeis={['dono','admin','gestor']}`)

**Interfaces:**
- Consumes: `useAuth()`, `traduzirErroBanco()`, RLS da Tarefa 1.
- Produces:
  - `src/data/times.js`: `listarTimes({ consultoriaId? }): Promise<Time[]>` (com `gestor:perfis!times_gestor_id_fkey(id, nome)` e `membros:time_membros(pessoa:perfis(id, nome))`, ordem por nome); `buscarTime(id): Promise<Time | null>`; `criarTime({ nome, descricao, gestorId, consultoriaId }): Promise<{ id } | { erro: string }>`; `adicionarMembro(timeId, pessoaId)`, `removerMembro(timeId, pessoaId)`, ambas `Promise<{ erro: string | null }>`.
  - `src/data/pessoas.js`: `listarPessoas({ consultoriaId?, papeis? }): Promise<Perfil[]>` (o que o RLS deixa ver).
  - `NovoTime({ aberto, aoFechar, papelDeQuemCria, gestores, aoCriar })`: campos "Nome do time" e "Descrição (opcional)"; o campo "Gestor do time" só aparece para `admin`; botão "Criar time", desabilitado enquanto envia.
  - Cartão: nome, "Gestor: <nome>", até 4 bolinhas de iniciais (gestor primeiro) e "+N", selo "N pessoas" (gestor + membros).
  - `Time`: nome, gestor, lista de membros com "Tirar do time" e o botão "Colocar pessoa" (lista de `listarPessoas` sem quem já está), só quando `perfil` gerencia o time (admin da consultoria ou gestor do time). Dono só olha.
  - Dono: `FiltroConsultoria` em cima das listas e sem o botão "Novo time".

- [ ] **Step 1: Escreva o teste que falha** (`NovoTime.test.jsx`)

- com `papelDeQuemCria: 'gestor'` não existe o campo "Gestor do time";
- com `papelDeQuemCria: 'admin'` e `gestores = [{ id: 'g2', nome: 'Bruno' }]`, escolher Bruno e "Criar time" chama `aoCriar({ nome: 'Implantação', descricao: '', gestorId: 'g2' })`;
- com `aoCriar` devolvendo `{ erro: 'Já existe um time com esse nome.' }`, a mensagem aparece e a janela continua aberta;
- nome com 1 caractere não envia e mostra "Use pelo menos 2 caracteres."

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -- NovoTime`
Expected: FAIL.

- [ ] **Step 3: Implemente `data/`, as telas e os componentes**

- [ ] **Step 4: Rode testes, lint e build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Confira no navegador**

Expected: `gestor@exemplo.test` vê o time Implantação, cria "Suporte N2", coloca e tira a Ana; criar outro "Suporte N2" mostra "Já existe um time com esse nome."; `admin@exemplo.test` vê todos os times e escolhe o gestor ao criar.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Tela Times com novo time e pessoas do time"
```

---

### Task 8: Usuários — lista, Novo acesso e Reenviar convite

**Files:**
- Create: `src/data/usuarios.js`
- Create: `src/lib/situacao.js`, `src/lib/situacao.test.js`
- Create: `src/pages/Usuarios.jsx`
- Create: `src/components/usuarios/NovoAcesso.jsx`, `src/components/usuarios/NovoAcesso.test.jsx`
- Modify: `src/rotas.jsx` (`/usuarios` com `papeis={['dono','admin','gestor']}`)

**Interfaces:**
- Consumes: `listarTimes`, `adicionarMembro` (Tarefa 7), `criar-acesso` e `reenviar-convite` (Tarefas 2–3), `traduzirErroFuncao`.
- Produces:
  - `src/data/usuarios.js`: `listarUsuarios({ consultoriaId? }): Promise<Perfil[]>` (com `times:time_membros(time:times(id, nome))` e `convite_pendente`, `precisa_trocar_senha`); `criarAcesso(dados): Promise<{ pessoaId } | { codigo, erro: string, pessoa? }>`; `reenviarConvite(pessoaId): Promise<{ erro: string | null }>`. Ambas mandam `redirectTo: location.origin + '/definir-senha'` e leem o `codigo` do corpo da resposta.
  - `src/lib/situacao.js`: `situacao(perfil): 'Convite pendente' | 'Senha provisória' | 'Ativo'` (convite pendente vence senha provisória).
  - `NovoAcesso({ aberto, aoFechar, papelDeQuemCria, times, consultoriaId?, aoCriar, aoColocarNosTimes })`: chave "Enviar convite" / "Criar com senha"; campos "Nome", "E-mail", "Papel" (opções: gestor → só "Pessoa"; admin → "Pessoa" e "Gestor"; dono → só "Administrador", sem times, e manda `consultoria_id: consultoriaId`), times em etiquetas para marcar, "Senha provisória" só em "Criar com senha"; botão "Enviar convite" ou "Criar acesso", desabilitado enquanto envia. Resposta `ja_na_consultoria` → texto "Essa pessoa já tem acesso na sua consultoria." e botão "Colocar nos times marcados" (`aoColocarNosTimes(pessoa.id, times)`).
  - Lista: Nome, E-mail, Papel, Times (só os que quem olha enxerga), Situação (selo) e, para convite pendente, "Reenviar convite". Botão "Novo acesso" para admin e gestor; dono só olha, com `FiltroConsultoria`.

- [ ] **Step 1: Escreva os testes que falham**

```js
// src/lib/situacao.test.js
expect(situacao({ convite_pendente: true, precisa_trocar_senha: false })).toBe('Convite pendente')
expect(situacao({ convite_pendente: false, precisa_trocar_senha: true })).toBe('Senha provisória')
expect(situacao({ convite_pendente: false, precisa_trocar_senha: false })).toBe('Ativo')
```

`NovoAcesso.test.jsx`:
- gestor: o campo Papel só tem "Pessoa";
- admin: tem "Pessoa" e "Gestor";
- dono com `consultoriaId: 'c1'`: Papel só "Administrador", sem a área de times, e enviar chama `aoCriar` com `papel: 'admin'`, `times: []` e `consultoria_id: 'c1'`;
- trocar para "Criar com senha" mostra "Senha provisória" e o botão vira "Criar acesso";
- enviar chama `aoCriar({ forma: 'senha', nome: 'João Pereira', email: 'joao@empresa.com.br', papel: 'pessoa', times: ['t1'], senha: 'provisoria-1' })`;
- enquanto `aoCriar` não resolve, o botão fica desabilitado (clique duplo não chama duas vezes);
- `aoCriar` devolvendo `{ codigo: 'ja_na_consultoria', erro: 'Essa pessoa já tem acesso na sua consultoria.', pessoa: { id: 'p1', nome: 'João' } }` mostra a mensagem e "Colocar nos times marcados", que chama `aoColocarNosTimes('p1', ['t1'])`.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -- situacao NovoAcesso`
Expected: FAIL.

- [ ] **Step 3: Implemente `data/usuarios.js`, `situacao.js`, a tela e a janela**

- [ ] **Step 4: Rode testes, lint e build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Confira no navegador (com o Mailpit aberto)**

Expected: `gestor@exemplo.test` convida `carla@exemplo.test` no time Implantação → aparece "Convite pendente" e o e-mail "Seu acesso à Consultoria" chega; o link abre `/definir-senha`, Carla cria a senha e entra só com Início e Projetos; "Criar com senha" para `davi@exemplo.test` → ao entrar, Davi é levado para "Troque a senha provisória" e depois entra; criar de novo `ANA@exemplo.test` oferece "Colocar nos times marcados".

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Tela Usuários com novo acesso e reenvio de convite"
```

---

### Task 9: Consultorias (dono)

**Files:**
- Create: `src/data/consultorias.js`
- Create: `src/pages/Consultorias.jsx`
- Create: `src/components/consultorias/NovaConsultoria.jsx`, `src/components/consultorias/NovaConsultoria.test.jsx`
- Modify: `src/rotas.jsx` (`/consultorias` com `papeis={['dono']}`)

**Interfaces:**
- Consumes: `criar-consultoria` (Tarefa 3), `criarAcesso` com `papel: 'admin'` e `consultoria_id` (Tarefa 8), `useAuth()`.
- Produces:
  - `src/data/consultorias.js`: `listarConsultorias(): Promise<Array<{ id, nome, admins: Perfil[], pessoas: number, times: number }>>`; `criarConsultoria({ nome, admin: { forma, nome, email, senha? } }): Promise<{ consultoriaId } | { codigo, erro }>`.
  - Tela: cartões (nome, administrador(es), "N pessoas", "N times") e o botão "Nova consultoria"; cada cartão tem "Novo administrador" (abre `NovoAcesso` com o papel fixo "Administrador", sem times).
  - `NovaConsultoria({ aberto, aoFechar, aoCriar })`: "Nome da consultoria" e o bloco "Primeiro administrador" (chave convite/senha, "Nome", "E-mail", "Senha provisória" quando com senha); botão "Criar consultoria", desabilitado enquanto envia.

- [ ] **Step 1: Escreva o teste que falha** (`NovaConsultoria.test.jsx`)

- enviar com convite chama `aoCriar({ nome: 'Acme Consultoria', admin: { forma: 'convite', nome: 'Rita Alves', email: 'rita@acme.com.br' } })`;
- com `aoCriar` devolvendo `{ codigo: 'email_indisponivel', erro: 'Não foi possível criar esse acesso com esse e-mail. Fale com o suporte.' }`, a mensagem aparece e a janela continua aberta.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -- NovaConsultoria`
Expected: FAIL.

- [ ] **Step 3: Implemente a tela, a janela e `data/consultorias.js`**

- [ ] **Step 4: Rode testes, lint e build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Confira no navegador**

Expected: Diego (dono, senha criada pelo convite do Mailpit) vê "Consultorias", cria "Acme Consultoria" com `rita@acme.test` por convite; Rita entra e vê só a Acme (nenhum time ou pessoa da Consultoria Exemplo); o dono vê as duas em Times e Usuários com o filtro e sem botões de criar.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Tela Consultorias para o dono da plataforma"
```

---

### Task 10: Documentação e verificação final

**Files:**
- Modify: `README.md`
- Modify: `.env.example` (sem mudança de variáveis; só confira)

**Interfaces:**
- Consumes: tudo acima.
- Produces: README com:
  - **Papéis:** dono → administrador da consultoria → gestor → pessoa.
  - **Comandos novos:** `npm test`, `npm run test:integracao`, `npm run test:db`, `npm run dono:criar -- <email> "<nome>"`, `npm run exemplo:local` (logins `@exemplo.test` com a senha `exemplo-123`, só local).
  - **Ligar o Google no local:** criar o cliente OAuth no Google Cloud com o endereço de retorno `http://127.0.0.1:54521/auth/v1/callback`; pôr `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` e `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` em `supabase/.env` (fora do git); ligar `[auth.external.google]` com `enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"` e `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"`; rodar `npm run db:stop && npm run db:start`.
  - **Publicar:**
    - `npx supabase db push --remote`;
    - publicar as três funções (descubra o comando com `npx supabase functions deploy --help`);
    - modelos de e-mail e Google no painel;
    - `enable_signup` desligado no painel;
    - provedor de e-mail (Resend, SendGrid etc.);
    - `npm run dono:criar` com `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e `APP_URL` da nuvem.

- [ ] **Step 1: Rode toda a bateria**

Run: `npm run lint && npm test && npm run test:db && npm run test:integracao && npm run build`
Expected: tudo PASS.

- [ ] **Step 2: Confira que a chave secreta não vazou**

Run: `git grep -n -E "sb_secret_|service_role|SECRET_KEY" -- src dist .env.example ; echo "fim"`
Expected: nada encontrado em `src/` nem em `.env.example` (só `fim`).

- [ ] **Step 3: Escreva o README e faça o caminho completo no navegador**

Expected: com o banco do zero (`npx supabase db reset`, depois `npm run dono:criar -- diego@ixcsoft.com.br "Diego Felippe"` e `npm run exemplo:local`), Diego cria a senha pelo e-mail do Mailpit, cria uma consultoria, o admin dela cria um gestor, o gestor cria um time e uma pessoa, e a pessoa entra.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "README: papéis, comandos, Google e publicação"
```
