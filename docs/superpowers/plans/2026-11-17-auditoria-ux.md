# Ajustes da auditoria de UI e UX — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Objetivo:** aplicar os achados da auditoria de 17/11 (relatório: https://claude.ai/artifact/9oPKMJEQt9QXohTMtXKR1K; cópia local `docs/auditoria-ux/relatorio.html`, capturas em `docs/auditoria-ux/`).

**Pedido do Diego (17/11 22:26):** "Os ajustes que foram identificados pela auditoria pode aplicar." Isso inclui os itens que mudam regra do CLAUDE.md (G3, G4, G6, G7): cada lote atualiza o CLAUDE.md onde a regra mudou, dizendo "pedido do Diego, 17/11 (auditoria)".

**Decisões do controlador (o Diego pode mudar):**
- **G3:** saída **A** — o item do menu passa a se chamar **"Check-lists"** (modelos e, depois, o andamento); "Check-in" fica só para as horas (aba do cliente). A rota pode continuar `/checkins` com `/checklists` como novo endereço (o antigo redireciona).
- **M2:** primeira saída — o tipo manda no visual do chip (reunião com cliente, compromisso, ausência listrada, feriado) e a cor escolhida vira uma bolinha no começo do chip.
- **M3:** a partir de 1280 px, mês em dois terços à esquerda e, à direita, o painel do dia em cima e "Próximos 7 dias" embaixo; menor que isso, clicar no dia rola até o painel.
- **R3:** rótulo do trilho em duas linhas quando não cabe (sem mudar o tamanho da letra).
- **Fica para o redesenho com gráficos do Início e da aba Geral** (protótipo em andamento): M4, M6, R6 (parte do Início), R7. R4 da tela Check-ins já foi feito (84eecc8); falta só a ficha do gestor com uma aba.

## Restrições globais

- Sem banco, salvo quando o item exigir (nenhum dos lotes deve exigir). Nunca `supabase db reset`; nunca apagar dados.
- `CLAUDE.md` vence sugestões de skills de fora, mas **este plano muda as regras que o Diego aprovou** (G4 cores, G6 barra de filtros no celular, G7 menu no celular, G3 nome do menu) — cada lote atualiza só as linhas dessas regras.
- Padrão Hub, botões animados, campos só de `src/components/campos/`, tipografia da escala, claro e escuro, 360 px sem rolar para o lado; os testes de guarda continuam verdes (`camposNativos`, `button.test`, `formulariosEnvio`, `tipografiaVarredura`, `tamanhoNoCelular`, `menu.test`, `Trilho.test`, `navegacaoDoMesVarredura`).
- Node 26; vitest só com `--project`; sem `test:db`/`test:integracao` (só tela); nunca `git stash`, trocar de branch ou push; `git add` só dos arquivos do lote. Outros agentes trabalham no mesmo checkout (check-list do cliente em `src/components/checkins/*`, `src/components/clientes/{CheckinsDoCliente,JanelaCheckin}*`, `src/pages/Cliente*`, `src/data/checkins*`; quadros pessoais no banco): cada lote diz o que não tocar.
- Conferência no navegador em cada lote (Playwright em contexto próprio, `http://[::1]:5173`, contas de exemplo, senha antiga `exemplo-123`), 1440 e 390 px, claro e escuro, sem gravar dados.

## Lotes

### Lote A — tokens e componentes comuns
G4 (contraste: `--muted-foreground` no claro ≈ `#566174`; botão cheio no escuro com `#2563eb`; texto escuro sobre mostarda no avatar e no evento; tom mais escuro para sábado/domingo), G5 (alvos de 44 px só em toque, `pointer-coarse:` em `Button`, campos, `AbasSegmentadas`, `AcaoDaLinha`, chips, 8 px entre alvos), R1 (`Caixa` quadrada), R3 (rótulo do trilho em duas linhas), R13 (listas dos gráficos do cliente com `role="list"` certo; "Limpar data" fora do campo, 24 px; contêiner que rola com `tabIndex` e rótulo), C8 (`ui/textarea.jsx`). Teste: guarda de contraste (axe nos componentes comuns, se couber) e de 44 px em toque.

### Lote B — tabelas e listas
G1 (todas as tabelas com `AcaoDaLinha`: ícone, nome no `title`/`aria-label`, posições fixas; no celular a primeira coluna com largura mínima e ações não fixas; exceção: ação única principal com texto), R2 (ocupação sem corte), M1 (vazio da central em Clientes com o próximo passo e atalho), R8 (gestor na primeira linha da página do time), C1 (`useListaPaginada`), C4/C5 (`FormularioDeTime`, `useAcoesDoTime`), C9 (`Cabecalho` com `voltarPara`), C10 (`comoOpcaoDeConsultoria`, `BarraDeOcupacao`). **Depois** do check-list do cliente (mexe em listas de check-ins).

### Lote C — moldura, celular e check-in
G7 (barra de menu embaixo no celular, até 5 itens do papel; perfil, tema e Sair no ☰; ícones com as animações do trilho), G6 (no celular, `BarraDeFiltros` com ícone + "Filtros (N ativos)" + busca e os outros campos numa gaveta; cartões mais baixos), R12 (no celular, "Lançar horas" com texto; esmaecido na borda das abas que rolam; aba ativa à vista), R4 (ficha do gestor sem barra de uma aba só), G2 (selo "Check-in aberto · cliente · tempo" na barra de cima, com "Fazer check-out"; "Fazer check-in" na tabela "Meus clientes no mês" do Início), G3 (menu "Check-lists"). **Depois** do check-list do cliente (mexe em `Cliente.jsx`).

### Lote D — Calendário e Quadro
M2 (chips pelo tipo + bolinha da cor), M3 (painel do dia à direita a partir de 1280 px), R5 (visão Agenda sem os blocos repetidos), M5 (um "⋯" por coluna do quadro com Renomear, Cor e Apagar), C6 (`SeletorDeCor` único).

### Lote E — textos e janelas
R9 (texto de Integrações), R10 (ilustração do login com o que o app faz), R11 ("Criar cliente"/"Criando…" e "(opcional)" certo), C2 (`useEnvio`), C3 (rodapé montado pela `JanelaFormulario`), C7 (`CartoesDeOpcao`).
