# IXC Consult

Plataforma de gestão de projetos para várias empresas de consultoria, em React.
Hoje roda em dois Dockers locais: um para o app e outro para o Supabase.
Depois o código vai para a Vercel e o banco para o Supabase na nuvem.

## Quem é quem

| Papel | O que faz |
| --- | --- |
| Administrador geral (`dono`) | Vê tudo e tem todos os poderes da central. Cadastra as consultorias e o administrador de cada uma (menu Consultorias). |
| Central | Fica fora das consultorias e vê todas. Cadastra clientes, manda cada um para uma consultoria (com a sugestão de menor ocupação), cria e arquiva consultorias. |
| Administrador da consultoria | Cria gestores e consultores, vê a consultoria inteira, escolhe o consultor de cada cliente e cuida da capacidade. |
| Gestor | Cria os times dele e os acessos dos consultores, só mexe nos times dele. Também escolhe consultores e vê a capacidade da consultoria (no painel do Início). |
| Consultor | Entra para trabalhar nos times em que está. Faz check-in e check-out nos clientes dele e lança horas. No banco o papel se chama `pessoa`. |

Uma consultoria nunca vê nada de outra: as regras ficam no banco (RLS) e são testadas em `supabase/tests`.
Ninguém se cadastra sozinho; o acesso é criado por convite (e-mail) ou com senha provisória
(trocada no primeiro acesso). Google entra se o e-mail já tiver acesso. SSO: só o botão, por enquanto.
O design e o plano estão em `docs/superpowers/`.

## Clientes e capacidade

1. A **central** cadastra o cliente (CNPJ, contato, previsão de horas por mês) e o manda para uma consultoria;
   a janela já sugere a de menor ocupação.
2. O **administrador ou gestor** da consultoria escolhe o consultor, também pela menor ocupação.
3. O **consultor** faz check-in e check-out no cliente (ou lança as horas depois). O check-in é de quem trabalhou.
4. Em **Usuários**, a ação **Capacidade** da linha abre a carga semanal e as ausências (férias, feriados
   municipais) de quem é de consultoria e está ativo; os nacionais o sistema calcula. Quem pode: a central e o dono
   (em qualquer consultoria) e o administrador ou gestor da própria consultoria, inclusive em si mesmo. A ficha
   (Editar) traz o mesmo bloco Capacidade para quem já podia editar a pessoa. O resumo do mês (com ‹ Anterior · Próximo ›) são as colunas Capacidade, Reservado,
   Realizado e Ocupação da própria lista (em mês passado, sem Reservado e como Utilização). O resumo por
   consultoria (só central) fica em **Consultorias**, na aba "Ocupação do mês".
5. Os números: **capacidade do mês** = dias úteis (sem sábado) x carga, menos ausências; **reservado** = previsão
   dos clientes que a pessoa atende; **realizado** = horas dos check-ins; **ocupação** = reservado / capacidade.
   Saem das funções do banco `consultores_por_ocupacao`, `consultorias_por_ocupacao` e, em Usuários,
   `ocupacao_das_pessoas` (uma chamada por página e mês).

Uma consultoria nunca vê clientes, horas ou nomes de outra. Desenho: `docs/superpowers/specs/2026-11-13-clientes-design.md`.

## Versões

| Peça | Versão | Onde está fixada |
| --- | --- | --- |
| Node | 26.13.1 (LTS "Lithium", também a padrão da Vercel) | `.nvmrc`, `engines` do `package.json`, `Dockerfile` |
| Supabase CLI | 3.1.0 | `devDependencies` (`npx supabase ...`) |
| supabase-js | 2.119.0 | `dependencies` |
| Postgres (Supabase local) | 17.11 | vem com o Supabase CLI |
| React / Vite | 19 / 8 | `package.json` |

O Supabase CLI fica dentro do projeto, não no Mac todo. O Supabase instalado pelo Homebrew
(2.98, usado por outros projetos) continua igual.

## Primeira vez

Precisa do Docker Desktop aberto e do nvm.

```bash
nvm use            # Node 26 (nvm install, se faltar)
npm install
npm run db:start   # sobe o Supabase local no Docker
npm run env:local  # cria o .env.local com a URL e a chave publicável do Supabase local
npm run app:up     # sobe o app no Docker
npm run dono:criar -- seu@email.com "Seu Nome"   # convite do dono (chega no Mailpit)
npm run exemplo:local                            # consultoria de exemplo, só local
```

Logins de exemplo (só no Docker local): `admin@exemplo.test`, `gestor@exemplo.test`, `ana@exemplo.test`,
`bruno@exemplo.test` e `central@exemplo.test` (a central, fora das consultorias), com a senha `exemplo-123` nas contas criadas antes de 16/11/2026; contas novas criadas pelo script usam `Exemplo-123!` (o Auth passou a exigir senha forte, e o script nunca muda a senha de uma conta que já existe).

Abra http://localhost:5173. Embaixo do contador aparece "Banco: conectado…" quando o app fala com o Supabase.

## Endereços locais

| O quê | Endereço |
| --- | --- |
| App (Vite, recarrega ao salvar) | http://localhost:5173 |
| Supabase Studio (telas do banco) | http://127.0.0.1:54523 |
| API do Supabase | http://127.0.0.1:54521 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54522/postgres` |
| E-mails de teste (Mailpit) | http://127.0.0.1:54524 |

As portas são 545xx porque o Mac já roda outros Supabase em 54321–54327, 54422/54423 e 54721–54723.
Elas estão em `supabase/config.toml`.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run app:up` | Cria a imagem e sobe o app (rode de novo depois de mudar pacotes) |
| `npm run app:down` | Para o app |
| `npm run app:logs` | Mostra o log do app |
| `npm run db:start` / `db:stop` | Sobe e para o Supabase local |
| `npm run db:status` | Mostra endereços e chaves do Supabase local |
| `npm run db:reset` | Recria o banco local do zero com as migrações de `supabase/migrations` (apaga todos os dados locais) |
| `npm run env:local` | Refaz o `.env.local` |
| `npm run functions:reiniciar` | Recarrega as Edge Functions depois de mudar o código delas |
| `npm test` | Testes das telas (Vitest) |
| `npm run test:integracao` | Testes das Edge Functions e dos comandos, no Supabase local de verdade |
| `npm run test:db` | Testes das regras de acesso do banco (pgTAP) |
| `npm run lint` / `npm run build` | Revisão do código e build de produção |

## Ligar o login com Google no local

1. No Google Cloud, crie um "ID do cliente OAuth" (aplicativo da Web) com o endereço de retorno
   `http://127.0.0.1:54521/auth/v1/callback`.
2. Em `supabase/.env` (fora do git), coloque `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...` e
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...`.
3. Em `supabase/config.toml`, em `[auth.external.google]`: `enabled = true`,
   `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"` e `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"`.
4. `npm run db:stop && npm run db:start`.

Enquanto isso não for feito, o botão "Entrar com Google" avisa que o Google ainda não foi configurado.

## Verificação em duas etapas (app autenticador)

Cada pessoa pode ativar em **Meu perfil** (QR code ou chave no Google Authenticator, Microsoft Authenticator,
1Password…, e o primeiro código de 6 dígitos). Na ficha da pessoa (aba **Acesso**), quem edita o acesso dela liga
**Exigir verificação em duas etapas**: no próximo acesso ela configura o app antes de entrar. Quem tem o app ativo
digita o código depois da senha ou do Google. Sem o código, o banco só entrega o que é da própria pessoa: o próprio
perfil (é assim que a tela sabe que falta o código), as próprias ausências e as próprias preferências (tema), que ela
também grava. Todo o resto some (`private.liberado()` exige a sessão `aal2`) e as Edge Functions respondem
`verificacao_pendente`. O banco também confere a sessão do token: encerrada no Auth (Zerar, Sair), o token antigo
para de valer na hora para todo o resto, sem esperar vencer (até vencer, em no máximo 1 h, ainda lê o próprio
perfil, as próprias ausências e as próprias preferências).

- **Local:** já vem ligado em `supabase/config.toml` (`[auth.mfa.totp] enroll_enabled = true` e `verify_enabled = true`).
- **Nuvem:** no painel do Supabase, **Authentication → Multi-Factor (MFA)**: ligue **TOTP (App Authenticator)**
  para cadastrar e para verificar. SMS e chave física ficam desligados. Junto, a política de senha (veja
  [Publicar](#publicar-depois), passo 5).
- **Perdeu o celular:** não há códigos de recuperação. Quem edita o acesso da pessoa abre a ficha → **Acesso** →
  **Zerar verificação em duas etapas**. O app cadastrado deixa de valer e a pessoa **sai de todos os aparelhos** (as
  sessões dela são encerradas, inclusive a do celular perdido); se a verificação for exigida, ela configura de novo no
  próximo acesso, senão passa a entrar só com a senha.
- **O dono perdeu o celular:** ninguém tem poder sobre o dono no app, então é pelo Supabase. Na nuvem: painel →
  **Authentication → Users** → a conta do dono → remova o fator do app (MFA) e encerre as sessões dele. Se o painel
  não mostrar uma das duas opções, o **SQL Editor** faz as duas (troque o e-mail):

  ```sql
  delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'dono@exemplo.com');
  select public.encerrar_sessoes_de((select id from auth.users where email = 'dono@exemplo.com'));
  ```

  No local, o mesmo pelo Studio (`http://127.0.0.1:54523`, SQL Editor). Depois o dono entra só com a senha e ativa
  de novo em **Meu perfil**.
- O segredo do app fica no Auth do Supabase; o app nunca guarda.

## Banco

- Toda mudança de tabela vira uma migração: `npx supabase migration new <nome> < /dev/null` e depois
  `npx supabase migration up` (aplica só o que falta, sem apagar nada). Nunca `npm run db:reset` com dados que importam:
  ele recria o banco do zero.
- Toda tabela em `public` precisa de RLS ligado e de políticas.
- Tabelas novas não aparecem sozinhas na API do Supabase: é preciso dar `GRANT` para `anon`/`authenticated`.
- No navegador só vai a chave publicável (`sb_publishable_…`). A chave secreta nunca entra no app.

## Integrações (IA, e-mail e Google)

Menu **Integrações** (administrador da consultoria; o dono só olha): cada consultoria conecta a sua IA
(Claude ou OpenAI), o seu e-mail (SMTP) e a sua conta Google, e todo o sistema usa a mesma conexão
(`conexaoDa` em `supabase/functions/_shared/integracoes.ts`). Chaves, senhas e tokens ficam cifrados no
Vault do Supabase e nunca voltam para o navegador. Salvar já testa a conexão. Desenho:
`docs/superpowers/specs/2026-11-12-integracoes-design.md`.

- **E-mail no local:** dá para testar com o Mailpit do Supabase local: servidor
  `supabase_inbucket_consultoria`, porta `1025`, segurança "Sem cifra", sem usuário. Fora do local, o
  teste só aceita servidores públicos nas portas 25, 465, 587 e 2525.
- **Google:** precisa de um app OAuth da plataforma (uma vez, pelo dono):
  1. No Google Cloud, crie um "ID do cliente OAuth" (aplicativo da Web) e ative as APIs do Calendar e
     do Drive. Endereço de retorno: `https://<projeto>.supabase.co/functions/v1/integracoes-google`
     (no local: `http://127.0.0.1:54521/functions/v1/integracoes-google`).
  2. Passe para as Edge Functions `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` e
     `GOOGLE_OAUTH_REDIRECT_URI` (o endereço acima). Na nuvem:
     `npx supabase secrets set GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... GOOGLE_OAUTH_REDIRECT_URI=...`.
     No local: em `[edge_runtime.secrets]` do `supabase/config.toml` (com `env(...)`), e reinicie com
     `npx supabase stop && npx supabase start` (os dados ficam).
  Sem isso, "Conectar" no Google avisa que falta configurar o app do Google.

## Google de cada pessoa (Calendário)

No Calendário, cada pessoa conecta **o próprio** Google ("Conectar Google"): a agenda cria os eventos, o Meet e a
gravação na conta de quem é dono da agenda. É o mesmo app OAuth das Integrações (`GOOGLE_OAUTH_CLIENT_ID` e
`GOOGLE_OAUTH_CLIENT_SECRET`), com outro endereço de retorno. O token de cada pessoa fica só no Vault; o navegador
vê apenas "conectado ou não" e o e-mail da conta. Edge Functions: `google-pessoa` (conectar e desconectar) e
`agenda` (criar, editar, apagar e responder aos eventos: grava no Google do organizador primeiro e depois no banco;
quem não conectou o Google fica com o evento só no app, sem Meet), com o núcleo em `supabase/functions/_shared/agenda/`.

1. No Google Cloud, no mesmo app: ative também a **Google Meet REST API** (além da Calendar API) e, na tela de
   consentimento, os escopos `calendar.events`, `meetings.space.settings` e `meetings.space.readonly`.
2. Cadastre um **segundo endereço de retorno** no "ID do cliente OAuth": a tela do Calendário do app,
   `https://<endereço-da-vercel>/calendario` (no local: `http://localhost:5173/calendario`). O Google volta para a
   tela, e a tela termina a conexão com o login da pessoa (assim ninguém pendura o Google de outra pessoa na própria
   conta).
3. Passe para as Edge Functions `GOOGLE_PESSOA_REDIRECT_URI` com esse endereço (na nuvem:
   `npx supabase secrets set GOOGLE_PESSOA_REDIRECT_URI=https://<endereço-da-vercel>/calendario`; no local, como as
   outras, em `[edge_runtime.secrets]`).
4. **Interno ou externo:** com o app "Interno" no Workspace da IXCSoft, quem é do mesmo domínio conecta sem
   verificação do Google. Consultores de outro domínio (ex.: STI) exigem o app "Externo", verificado pelo Google (os
   escopos do Meet pedem verificação). **Gravação e transcrição** só funcionam em contas Google Workspace com esses
   recursos ligados.
5. Desconectar apaga o token aqui e revoga a permissão no Google. A revogação vale para o app inteiro naquela conta:
   se a mesma conta do Google também estiver conectada nas Integrações da consultoria, aquela conexão pode cair junto.

No Supabase local, uma Edge Function **nova** só passa a ser servida depois de recriar o runtime
(`npx supabase stop && npx supabase start`; os dados ficam). `npm run functions:reiniciar` recarrega o código das
funções que o runtime já conhece.

## Publicar (depois)

**Supabase na nuvem**

1. Crie o projeto em https://supabase.com/dashboard.
2. `npx supabase login` e `npx supabase link --project-ref <ref-do-projeto>`.
3. `npx supabase db push --remote` envia as migrações. No CLI 3, sem `--remote` ele mexe no banco local.
4. `npx supabase functions deploy` publica as Edge Functions (`criar-acesso`, `criar-consultoria`, `reenviar-convite`,
   `gerenciar-acesso`, `gerenciar-consultoria`, `integracoes`, `integracoes-google`, `google-pessoa`, `agenda`).
5. Em Authentication: Site URL e redirecionamentos com o endereço da Vercel (`https://.../**`),
   cadastro aberto desligado, a política de senha (**Authentication → Policies → Passwords**, ou no provedor
   **Email**, conforme a versão do painel: tamanho mínimo **10** e requisitos **"Lowercase, uppercase letters, digits
   and symbols"**, a mesma regra do app), os modelos de e-mail de `supabase/templates`, o Google e a verificação em
   duas etapas (Multi-Factor → TOTP, veja acima). A política de senha e o TOTP também podem ir com
   `npx supabase config push` (projeto ligado), mas ele manda todo o Auth do `supabase/config.toml`, inclusive o
   Site URL local: rode antes `npx supabase config diff` e só envie se a diferença for a esperada.
6. Configure um provedor de e-mail (Resend, SendGrid etc.): o e-mail que vem com o Supabase só entrega para o time do projeto.
7. Crie o dono: `SUPABASE_URL=... SUPABASE_SECRET_KEY=... APP_URL=https://... npm run dono:criar -- seu@email.com "Seu Nome"`.

**Vercel**

1. Importe o repositório `DiegoFelippe/project-management-`. A Vercel reconhece o Vite sozinha.
2. O Node 26 vem do `engines` do `package.json`.
3. Crie as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto na nuvem.
4. A Vercel não usa os Dockers: eles são só para rodar no Mac.

O `vercel.json` manda as rotas do app (`/times`, `/usuarios`...) para o `index.html` e evita cache velho do `sw.js`.

## App instalável (PWA)

O IXC Consult pode ser instalado como aplicativo (computador e celular), com a logo como ícone (`public/icons`).
Quando o navegador permite, aparece o botão **Instalar app** na barra de cima. O app guarda só a "casca"
(HTML, JS, CSS e ícones); os dados vêm sempre do Supabase. No Docker de desenvolvimento o service worker
fica desligado; para testar a instalação no Mac: `npm run build && npm run preview` e abra http://localhost:4173.
