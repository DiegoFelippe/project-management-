# Consultoria

App em React. Hoje roda em dois Dockers locais: um para o app e outro para o Supabase.
Depois o código vai para a Vercel e o banco para o Supabase na nuvem.

## Versões

| Peça | Versão | Onde está fixada |
| --- | --- | --- |
| Node | 26.13.1 (LTS "Lithium", também a padrão da Vercel) | `.nvmrc`, `engines` do `package.json`, `Dockerfile` |
| Supabase CLI | 3.1.0 | `devDependencies` (`npx supabase ...`) |
| supabase-js | 2.119.0 | `dependencies` |
| Postgres (Supabase local) | 17.11 | vem com o Supabase CLI |
| React / Vite | 19 / 8 | `package.json` |

O Supabase CLI fica dentro do projeto, não no Mac todo. O Supabase instalado pelo Homebrew
(2.98, usado pelos projetos Karina) continua igual.

## Primeira vez

Precisa do Docker Desktop aberto e do nvm.

```bash
nvm use            # Node 26 (nvm install, se faltar)
npm install
npm run db:start   # sobe o Supabase local no Docker
npm run env:local  # cria o .env.local com a URL e a chave publicável do Supabase local
npm run app:up     # sobe o app no Docker
```

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
| `npm run lint` / `npm run build` | Revisão do código e build de produção |

## Banco

- Toda mudança de tabela vira uma migração: `npx supabase migration new <nome>` e depois `npm run db:reset`.
- Toda tabela em `public` precisa de RLS ligado e de políticas.
- Tabelas novas não aparecem sozinhas na API do Supabase: é preciso dar `GRANT` para `anon`/`authenticated`.
- No navegador só vai a chave publicável (`sb_publishable_…`). A chave secreta nunca entra no app.

## Publicar (depois)

**Supabase na nuvem**

1. Crie o projeto em https://supabase.com/dashboard.
2. `npx supabase login` e `npx supabase link --project-ref <ref-do-projeto>`.
3. `npx supabase db push --remote` envia as migrações. No CLI 3, sem `--remote` ele mexe no banco local.
4. Em Authentication > URL Configuration, coloque o endereço da Vercel como Site URL.

**Vercel**

1. Importe o repositório `DiegoFelippe/project-management-`. A Vercel reconhece o Vite sozinha.
2. O Node 26 vem do `engines` do `package.json`.
3. Crie as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto na nuvem.
4. A Vercel não usa os Dockers: eles são só para rodar no Mac.

Se o app ganhar rotas (react-router), vai precisar de um `vercel.json` mandando as rotas para o `index.html`.
