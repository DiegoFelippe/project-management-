# IXC Consult

Plataforma de gestão de projetos para várias empresas de consultoria, em React.
Hoje roda em dois Dockers locais: um para o app e outro para o Supabase.
Depois o código vai para a Vercel e o banco para o Supabase na nuvem.

## Quem é quem

| Papel | O que faz |
| --- | --- |
| Dono da plataforma | Vê tudo. Cadastra as consultorias e o administrador de cada uma (menu Consultorias). |
| Administrador da consultoria | Cria gestores e pessoas e vê a consultoria inteira. |
| Gestor | Cria os times dele e os acessos das pessoas, só mexe nos times dele. |
| Pessoa | Entra para trabalhar nos times em que está. |

Uma consultoria nunca vê nada de outra: as regras ficam no banco (RLS) e são testadas em `supabase/tests`.
Ninguém se cadastra sozinho; o acesso é criado por convite (e-mail) ou com senha provisória
(trocada no primeiro acesso). Google entra se o e-mail já tiver acesso. SSO: só o botão, por enquanto.
O design e o plano estão em `docs/superpowers/`.

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

Logins de exemplo (só no Docker local): `admin@exemplo.test`, `gestor@exemplo.test`, `ana@exemplo.test`
e `bruno@exemplo.test`, todos com a senha `exemplo-123`.

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
| `npm run db:reset` | Recria o banco local do zero com as migrações de `supabase/migrations` |
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

## Banco

- Toda mudança de tabela vira uma migração: `npx supabase migration new <nome>` e depois `npm run db:reset`.
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

## Publicar (depois)

**Supabase na nuvem**

1. Crie o projeto em https://supabase.com/dashboard.
2. `npx supabase login` e `npx supabase link --project-ref <ref-do-projeto>`.
3. `npx supabase db push --remote` envia as migrações. No CLI 3, sem `--remote` ele mexe no banco local.
4. `npx supabase functions deploy` publica as Edge Functions (`criar-acesso`, `criar-consultoria`, `reenviar-convite`,
   `gerenciar-acesso`, `gerenciar-consultoria`, `integracoes`, `integracoes-google`).
5. Em Authentication: Site URL e redirecionamentos com o endereço da Vercel (`https://.../**`),
   cadastro aberto desligado, senha mínima 8, os modelos de e-mail de `supabase/templates` e o Google.
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
