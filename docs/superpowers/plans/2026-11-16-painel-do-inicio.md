# Painel estratégico no Início — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** painel do mês no Início para todos os papéis, cada um no seu recorte, com os números vindos do banco
numa chamada só.

**Arquitetura:** função `public.painel_do_inicio(p_mes date)` devolve um `jsonb` com os blocos do recorte de quem chama
(reaproveitando `private.ocupacao_dos_consultores`, `private.capacidades_do_mes` e as regras de visibilidade das
funções de ocupação). `src/data/painel.js` lê; `src/pages/Inicio.jsx` desenha com componentes em
`src/components/inicio/`.

**Spec:** `docs/superpowers/specs/2026-11-16-painel-do-inicio-design.md`.

## Restrições globais

- Dados do Diego: cópia do banco em `supabase/.copias/` antes da migração; `npx supabase migration new <nome> <
  /dev/null`; `npx supabase migration up`; nunca `db reset`, nunca apagar registros.
- `CLAUDE.md`: Escala (uma chamada por mês, limites no banco, nada calculado na tela, sem N+1, índices), Segurança
  (`security definer`, `search_path = ''`, `GRANT EXECUTE` só para `authenticated`; consultoria nunca vê outra;
  consultor só os próprios números), Clientes ("Ocupação, capacidade e sugestões vêm do banco"), Padrão Hub, botões
  animados, largura total, textos em português.
- Números iguais aos das outras telas para o mesmo mês e recorte (Clientes, Usuários, Consultorias/Ocupação do mês).
- Mês passado: "Utilização" e sem reservado/previsto (regra de `colunasDoMes` em `src/lib/horas.js`).
- Node 26; vitest sempre com `--project`; nunca dois `test:db` juntos; nunca `git stash`, trocar de branch, push.

## Review Focus

- Gestor de uma consultoria nunca recebe números, nomes ou clientes de outra; consultor não recebe colegas.
- Consultoria sem consultor com capacidade (tudo 0): ocupação "—", sem divisão por zero.
- Mês sem nenhum check-in: realizado 0 h e barras vazias, não erro.
- Mudar o mês rápido: a resposta velha não sobrescreve a nova.
- Milhares de clientes: o painel responde dentro do limite do teste de volume.

---

### Task 1: Função do banco do painel

**Arquivos:** migração `painel_do_inicio`, `supabase/tests/database/painel_do_inicio.test.sql` (recortes e números),
`supabase/tests/database/painel_volume.test.sql` (`performs_within`, como `ocupacao_volume`), `src/data/painel.js`
(+ teste).

**Interfaces — produz:** `painel_do_inicio(p_mes date default null)` → `jsonb`:
`{ recorte: 'tudo'|'consultoria'|'pessoa', mes, passado, indicadores: { clientes_ativos, clientes_novos, aguardando,
a_distribuir, sem_consultor, capacidade, reservado, realizado, ocupacao }, horas_por_mes: [{ mes, realizado }]
(6 meses até p_mes), previsao_atual, ranking: [{ id, nome, ocupacao, capacidade }] (até 8; consultorias no recorte
'tudo', consultores no 'consultoria', vazio no 'pessoa'), esperando: [{ id, nome, desde, situacao:
'a_distribuir'|'sem_consultor', consultoria_nome }] (até 5), extremos: { acima: [...até 3], folga: [...até 3] },
meus_clientes: [{ id, nome, previsto, realizado }] (até 5, só 'pessoa') }`. `painelDoInicio(mes)` em
`src/data/painel.js` devolve esse objeto.
- [ ] **Passo 1:** pgTAP: central vê todas as consultorias e a fila a distribuir; admin/gestor só a consultoria
  (nada de outra nos rankings, extremos e esperando); consultor só os próprios números e clientes; números iguais aos
  de `consultores_por_ocupacao`/`consultorias_por_ocupacao` no mesmo mês; mês passado com `passado = true`; capacidade
  0 → ocupação nula; `anon` sem acesso. Volume: milhares de clientes/check-ins/pessoas dentro do limite. **Passo 2:**
  FALHA. **Passo 3:** cópia do banco, migração, `migration up`, implementar (índices que faltarem junto). **Passo 4:**
  `npm run test:db`, `npm test`. **Passo 5:** commit `Painel do Início: números do mês numa chamada só`.

### Task 2: Tela do painel no Início

**Arquivos:** `src/pages/Inicio.jsx` (+ teste), `src/components/inicio/` (indicadores, horas por mês, ranking, listas
— um arquivo por bloco, com testes), apagar `GraficoInicio.jsx` se ficar sem uso; usar `NavegacaoDoMes`
(`src/components/comum/`) e `colunasDoMes`/`formatarHoras`/`formatarOcupacao` (`src/lib/horas.js`).

- Layout e regras do design (tabela "O que cada papel vê"); links para onde se age; vazio e erro por bloco;
  carregando sem pular o layout; resposta velha descartada ao trocar de mês.
- [ ] **Passo 1:** testes de tela por papel (central: ranking de consultorias e fila a distribuir; admin: ranking de
  consultores e sem "a distribuir"; consultor: meus clientes e sem ranking), mês passado com "Utilização" e sem
  previsto, trocar de mês chama `painelDoInicio` uma vez com o mês novo, erro mostra aviso. **Passo 2:** FALHA.
  **Passo 3:** implementar. **Passo 4:** `npm test`, lint, build. **Passo 5:** commit `Painel do Início por papel`.
  Conferência no navegador pelo controlador (admin; claro/escuro; 1440 e 390 px).
