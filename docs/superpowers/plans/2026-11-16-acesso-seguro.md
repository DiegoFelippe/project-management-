# Acesso seguro — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** verificação em duas etapas (TOTP) exigível por pessoa e campo de senha forte com validar e gerador.

**Spec:** `docs/superpowers/specs/2026-11-16-acesso-seguro-design.md`. Diego autorizou (16/11, 22:10: "pode fazer o
que for necessário"), inclusive reiniciar o Supabase local para ligar o TOTP.

## Restrições globais

- Dados do Diego: antes de reiniciar o Supabase e antes de cada migração, cópia em `supabase/.copias/` (completa antes
  do reinício: `docker exec supabase_db_consultoria pg_dumpall -U postgres > supabase/.copias/2026-11-16-antes-mfa.sql`,
  conferir tamanho). Reiniciar só com `npx supabase stop` (SEM `--no-backup`) e `npx supabase start`; nunca `db reset`,
  nunca apagar volume. Migração nova com `npx supabase migration new <nome> < /dev/null` + `npx supabase migration up`.
- Edge Function nova ou alterada: registrada em `supabase/config.toml` e runtime reiniciado (`npm run functions:reiniciar`).
- Segurança: o segredo do TOTP nunca é guardado pelo app (fica no Auth do Supabase); "Zerar" só para quem pode editar o
  acesso; o banco é quem barra sessão `aal1` de quem precisa de `aal2`.
- Padrão Hub, botões animados, textos em português; Node 26; vitest com `--project`; nunca `git stash`/branch/push.

## Review Focus

- Quem não tem 2FA nem exigência não percebe nada diferente (nenhuma tela nova, nenhuma leitura bloqueada).
- Entrar pelo Google com 2FA ativo também pede o código.
- Pessoa com `exige_2fa` e sessão antiga (`aal1`) aberta: na próxima ação, vai para a tela do código, sem erro solto.
- Senha gerada sempre passa como Forte; colar senha com espaços não quebra o medidor.

---

### Task 1: Campo de senha forte, validar e gerador

**Arquivos:** `src/components/campos/CampoSenha.jsx` (+ teste), `src/lib/senha.js` (+ teste: força, regras, gerar),
usos em `src/components/usuarios/FichaDoConsultor.jsx` (senha provisória), `src/components/perfil/MeuPerfil.jsx`
(trocar senha), `src/components/auth/FormularioNovaSenha.jsx` (primeiro acesso); `supabase/config.toml` (política de
senha: mínimo 10 e tipos), Edge Function que define senha confere a força de novo (`criar-acesso`, e a que define
senha nova, se houver) (+ integração).
- [ ] Testes (RED) → implementar → `npm test`, lint, build, `npm run test:integracao` → commit `Senha forte: medidor,
  validar e gerador`.

### Task 2: Verificação em duas etapas

**Arquivos:** `supabase/config.toml` (`[auth.mfa.totp] enroll_enabled = true`, `verify_enabled = true`) + reinício
(com cópia antes); migração `exige_2fa` (`perfis.exige_2fa boolean not null default false`; `private.liberado()` passa a
exigir `aal2` quando a pessoa tem fator verificado ou `exige_2fa`; funções auxiliares em `private`), pgTAP;
`supabase/functions/_shared/clientes.ts` (`quemChama` confere `aal`), `gerenciar-acesso` (`exige_2fa` e ação `zerar_2fa`
com a API de admin), integração; telas: aba Acesso da ficha (chave, situação, Zerar), Meu perfil (ativar com QR/código
e desativar), fluxo de entrar (tela do código; tela de configurar quando exigido), `src/auth/*` para o estado `aal`;
README (como ligar na nuvem).
- [ ] Testes (RED) → cópia + config + reinício + migração → implementar → todas as suítes → commit `Verificação em
  duas etapas`. Conferência no navegador pelo controlador (configurar com um app autenticador de teste não é possível
  aqui: conferir as telas e o bloqueio do banco).
