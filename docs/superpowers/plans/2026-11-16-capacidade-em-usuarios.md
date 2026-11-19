# Capacidade dentro de Usuários — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** tirar o menu Capacidade e levar o resumo do mês de cada consultor para a lista de Usuários.

**Pedido do Diego (16/11):** "Como eu cadastrei a capacidade dentro do usuário, podemos remover o menu de
capacidade." Perguntado sobre o resumo do mês (capacidade, reservado, realizado, ocupação), escolheu "Levar para
Usuários".

**Arquitetura:** a carga semanal e as ausências já estão na ficha do consultor (`FichaDoConsultor`, bloco
Capacidade, com `GerirAusencias`). A lista de Usuários (paginada no banco, 15 por página) ganha o mês na barra de
filtros e quatro colunas; os números vêm de **uma** chamada ao banco por página, para os ids daquela página, com o
mesmo cálculo de `consultores_por_ocupacao` (`private.capacidades_do_mes` e as mesmas regras de reservado/realizado).
O menu, a rota e a página Capacidade saem; `/capacidade` redireciona para `/usuarios`.

**Spec:** este arquivo (mudança pequena; o design de capacidade continua em
`docs/superpowers/specs/2026-11-13-clientes-design.md`, seção de capacidade).

## Restrições globais

- Dados do Diego: cópia do banco em `supabase/.copias/` antes da migração; `npx supabase migration new <nome> <
  /dev/null` e `npx supabase migration up`; nunca `db reset`, nunca apagar registros.
- `CLAUDE.md`: Escala (uma chamada por página, sem N+1, nada calculado na tela — "Ocupação, capacidade e sugestões vêm
  do banco"), Segurança (função `security definer` com o mesmo recorte de quem vê cada pessoa: consultoria nunca vê
  outra; quem não é da central só alcança colegas pelas funções do banco), Padrão Hub, Listas em tabela, menu com
  animação (o item sai junto com a animação `medir` se ninguém mais a usar — `menu.test`/`Trilho.test`).
- Quem vê as colunas: quem já vê a lista de Usuários (dono, central, admin, gestor). Linhas sem consultoria (dono,
  central) mostram "—".
- Node 26; nunca `git stash`, trocar de branch, push; nunca dois `test:db` juntos; vitest sempre com `--project`.

## Review Focus

- Gestor/admin de uma consultoria chamando a função com ids de outra consultoria: não recebe números delas.
- Mudar de mês pede ao banco só o mês novo para a página atual (uma chamada), sem voltar a página.
- Pessoa com carga 0 ou ausente o mês inteiro: capacidade 0 e ocupação "—" (sem divisão por zero).
- Link salvo para `/capacidade` cai em `/usuarios`.

---

### Task 1: Função do banco para a ocupação de uma página de pessoas

**Arquivos:** migração `ocupacao_das_pessoas`, `supabase/tests/database/ocupacao_das_pessoas.test.sql`,
`src/data/capacidade.js` (+ `ocupacaoDasPessoas({ ids, mes })` → `Map` por id ou objeto `{ [id]: { capacidade,
reservado, realizado, ocupacao, clientes } }`, + teste).

- `public.ocupacao_das_pessoas(p_ids uuid[], p_mes date default null)` → `(id, capacidade, reservado, realizado,
  ocupacao, clientes)`; `stable security definer`, `search_path = ''`; devolve só quem a pessoa que chama pode ver
  (mesma regra de `consultores_por_ocupacao`); no máximo 100 ids; reaproveita o cálculo existente (sem copiar a
  fórmula — extrair para função `private` se preciso). `GRANT EXECUTE` só para `authenticated`.
- [ ] **Passo 1:** pgTAP (números iguais aos de `consultores_por_ocupacao` para as mesmas pessoas/mês; ids de outra
  consultoria não voltam; central vê todas; carga 0 → ocupação nula) e teste de dados. **Passo 2:** FALHA. **Passo 3:**
  cópia do banco, migração, `migration up`, implementar. **Passo 4:** `npm run test:db`, `npm test`. **Passo 5:**
  commit `Ocupação de uma página de pessoas numa chamada só`.

### Task 2: Resumo do mês em Usuários e saída do menu Capacidade

**Arquivos:** `src/pages/Usuarios.jsx` (+ teste), `src/components/shell/menu.js` (+ `menu.test.js`,
`Trilho.test.jsx`), `src/rotas.jsx` (redirecionar `/capacidade`), apagar `src/pages/Capacidade.jsx` (+ teste) e
`src/components/capacidade/EditarCarga.jsx` (+ teste) se ninguém mais usar, `src/index.css` (tirar `icone-medir` se
sem uso), `README.md` (seção "Clientes e capacidade": onde ficam carga, ausências e o resumo), `CLAUDE.md` se citar a
tela.

- Usuários: na barra de filtros, o mês (‹ Novembro de 2026 ›, como era na Capacidade); colunas Capacidade, Reservado,
  Realizado e Ocupação (formatos de `src/lib/horas.js`: `formatarHoras`, `formatarOcupacao`), com "—" onde não se
  aplica; uma chamada `ocupacaoDasPessoas` por página/mês; erro dessa chamada mostra a lista com "—" e um aviso, sem
  quebrar a tabela. Editar a carga e as ausências continua pelo Editar da linha (ficha).
- [ ] **Passo 1:** testes de tela (colunas com os números do mock; mudar o mês chama `ocupacaoDasPessoas` com os ids da
  página e o mês novo, uma vez; linha da central com "—"; menu sem Capacidade; `/capacidade` vai para `/usuarios`).
  **Passo 2:** FALHA. **Passo 3:** implementar e apagar o que ficou sem uso. **Passo 4:** `npm test`, lint, build.
  **Passo 5:** commit `Capacidade do mês na lista de Usuários; sai o menu Capacidade`. Conferência no navegador pelo
  controlador (admin e central; claro/escuro; 1440 e 390 px).

### Task 3: Restos do padrão Hub (da revisão final)

**Arquivos:** `src/components/comum/JanelaFormulario.jsx` (+ teste), `src/components/clientes/FormularioCliente.jsx`
(+ teste), os `<textarea>` escritos à mão (`src/components/times/{NovoTime,EditarTime}.jsx`,
`src/components/clientes/{FormularioCliente,JanelaCheckin}.jsx` — procure outros), `src/components/campos/
tamanhoNoCelular.test.jsx`.

- Foco inicial da `JanelaFormulario`: hoje vai para o 1º focável do corpo, que no `CampoNumero` é o botão "Diminuir"
  (Enter ali diminui o valor). Preferir o 1º campo de digitar/escolher (`input`, `textarea`, `[role=combobox]`,
  gatilho de campo com `aria-haspopup`) e só então o 1º focável. Teste com uma janela cujo 1º campo é `CampoNumero`.
- `FormularioCliente`: horas por mês acima do máximo (744, `MAXIMO_DE_HORAS_NO_MES`, como a `JanelaPrevisao`) avisam na
  tela em vez de chegar ao banco e voltar como erro. Teste com 5000.
- `<textarea>` com 16px no celular e 14px a partir de `sm` (zoom do iPhone), incluídos no guarda
  `tamanhoNoCelular.test.jsx`.
- [ ] **Passo 1:** testes (FALHA). **Passo 2:** implementar. **Passo 3:** `npm test`, lint, build. **Passo 4:** commit
  `Restos do padrão Hub: foco no 1º campo, limite da previsão e textarea sem zoom`.
