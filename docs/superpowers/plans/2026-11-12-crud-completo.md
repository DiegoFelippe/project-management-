# CRUD completo — plano de implementação

> Execução inline (superpowers:executing-plans), na branch `feat/login-usuarios-times`.

**Goal:** editar/desativar/reativar usuários, editar/apagar times, renomear/arquivar/reativar consultorias.
**Spec:** `docs/superpowers/specs/2026-11-12-crud-completo-design.md`
**Constraints:** as do plano anterior (`2026-11-12-login-usuarios-times.md`) + `CLAUDE.md` (CRUD, hover, largura total).

Mensagens novas (exatas):

| Código | Mensagem |
| --- | --- |
| `gestor_com_times` | Essa pessoa ainda é gestora de times. Troque o gestor desses times antes. |
| `consultoria_arquivada` | A consultoria dessa pessoa está arquivada. Reative a consultoria antes. |
| `nome_em_uso` | Já existe uma consultoria com esse nome. |
| `user_banned` (login) | Seu acesso está desativado. Fale com o administrador da sua consultoria. |

### Task 1: Banco
- Migração `crud_completo`: `perfis.ativo boolean not null default true`, `perfis.desativado_em`; `consultorias.arquivada_em`;
  índice único `consultorias (lower(btrim(nome)))`; `liberado()` exige perfil ativo e consultoria não arquivada;
  `grant update (nome, descricao, gestor_id), delete on times`; políticas `update`/`delete` em `times` por `gerencio_time(id)`;
  gatilho: trocar `gestor_id` só admin (P0001); gatilho: perfil com times como gestor não fica `ativo=false` nem deixa de ser gestor/admin (P0001).
- pgTAP (novo arquivo `crud.test.sql`): inativo não vê nada; consultoria arquivada bloqueia os dela; dono vê arquivada;
  gestor renomeia o time dele; gestor não troca gestor (P0001); admin troca; gestor apaga o time dele; gestor não apaga time alheio (0 linhas);
  pessoa não edita time; desativar gestor com times (P0001); nome de consultoria repetido com maiúsculas/espaços (23505).

### Task 2: Edge Functions
- `gerenciar-acesso` `{ acao: 'editar'|'desativar'|'reativar', pessoa_id, nome?, papel? }`:
  dono → só admins; admin → gestor/pessoa da consultoria dele (papel pessoa↔gestor); gestor → só `editar` nome de quem vê;
  ninguém em si mesmo (403); desativar = `ativo=false` + `ban_duration: '876000h'`; reativar = `ativo=true` + `ban_duration: 'none'`
  (409 `consultoria_arquivada` se arquivada); 409 `gestor_com_times` vindo do gatilho.
- `gerenciar-consultoria` `{ acao: 'renomear'|'arquivar'|'reativar', consultoria_id, nome? }` (só dono):
  arquivar = `arquivada_em=now()` + ban de quem está ativo; reativar = `null` + unban de quem está ativo; 409 `nome_em_uso`;
  resposta `{ ok, sem_bloqueio: n }`.
- Integração: regras de quem pode o quê, ban real (login falha com `user_banned`), reativar devolve o login,
  arquivar/reativar não reativa quem foi desativado individualmente, renomear repetido.

### Task 3: Telas
- `ConfirmarAcao` (janela de confirmação reutilizável).
- Usuários: Editar (nome, papel para admin, times), Desativar/Reativar com confirmação, filtro Ativos/Desativados; `situacao` "Desativado".
- Time: Editar (nome, descrição, gestor só para admin) e Apagar time com confirmação.
- Consultorias: Renomear, Arquivar/Reativar com confirmação, filtro Ativas/Arquivadas.
- Login: `user_banned` traduzido.
- Testes de unidade de cada janela e da `situacao`; conferir no navegador.
