# Quadro Kanban do cliente — design (rascunho para o Diego)

Data: 2026-11-17. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).
Referência: o Kanban do Hub (Mochi, `~/Documents/Karina`, só leitura). Inventário completo em
`.superpowers/sdd/avulsos/kanban-hub-inventario.md`.

## Pedido do Diego

- "Dentro do cliente que mais uma aba com um quadro kanban" (16/11).
- "Com as mesmas possibilidades que o quadro kaban dentro do mochi tem" (16/11).

## Objetivo, e o que seria falhar

- Quem atende o cliente organiza o trabalho dele num quadro: colunas, cartões com prazo, prioridade, responsáveis,
  checklist, descrição, anexos e comentários, arrastando entre colunas — como no Mochi, só que **o quadro é do cliente**.
- Falhar seria: uma consultoria ver cartões, nomes ou anexos de outra; perder cartão ao arrastar; quadro lento com
  centenas de cartões; telas fora do Padrão Hub; faltar uma das quatro operações em algo que o quadro cria.

## Onde fica

- Nova aba **Quadro** na página do cliente, depois de Geral: Geral · Quadro · Agenda · Check-ins · Arquivos · Histórico.
- O quadro ocupa a largura toda; colunas de 300 px com rolagem horizontal; no celular, uma coluna por vez com rolagem
  horizontal e a janela do cartão em coluna única (como no Mochi).

## O que vem do Mochi (igual)

**Colunas**
- Quadro novo nasce com "A fazer", "Em andamento" e "Concluído" (esta marcada como coluna de concluídos).
- Criar ("+ Nova coluna" no fim), renomear no lugar, reordenar arrastando o cabeçalho, cor (10 cores; sem cor =
  automática pela posição), marcar "Coluna de concluídos" (prazo não conta como atrasado), apagar com confirmação que
  diz quantos cartões somem junto.

**Cartões**
- Campos: título, descrição com formatação (negrito, itálico, listas, títulos, citação, código, link, imagem), prioridade
  (baixa/média/alta), prazo (atalhos Hoje/Amanhã/Sexta; selo "atrasado há N dias", "Hoje", "Amanhã"), responsáveis
  (vários; até 3 rostos + "+N"), checklist com barra de progresso, anexos, comentários.
- Criar pelo "Novo cartão" (título, coluna, prioridade, prazo, responsáveis) — a janela continua aberta para completar.
- Janela larga do cartão: à esquerda título, descrição e checklist; à direita Coluna, Prazo, Prioridade, Responsáveis;
  embaixo Comentários e Anexos. Grava campo a campo com "Salvando… / Salvo / Erro ao salvar". Cabeçalho
  "coluna · criado em … por …".
- Mover: arrastar (otimista; se o banco recusar, o cartão volta e aparece o aviso) ou trocar a coluna na janela.
- Arquivar (some do quadro; janela "Arquivados" em tabela com busca e paginação, Restaurar volta ao lugar) e apagar
  (confirmação dizendo que checklist, comentários e anexos somem junto).
- Comentários: texto simples (até 2000), editar e apagar os próprios ("· editado"); 30 mais recentes + "ver anteriores".

**Topo do quadro**
- 4 números: Cartões no quadro, Atrasados, Vencem em 7 dias, Sem responsável (contagem no banco).
- `BarraDeFiltros`: busca (título e descrição, no banco), Prioridade, Responsável (com "Sem responsável"), Prazo
  (Atrasados, Próximos 7 dias, Sem prazo), Limpar; à direita Arquivados e **Novo cartão**. Com filtro ligado, arrastar
  fica desligado e a tela avisa.
- Atualiza sozinho quando outra pessoa mexe no mesmo quadro (tempo real).

## O que muda em relação ao Mochi (minha proposta — confirmar)

- **Um quadro por cliente** (não vários quadros, favoritos, recentes nem "quadros pessoais"): a aba já é o quadro.
- **Fica de fora:** "enviar cartão para outra pessoa" (transferências) e "acompanhar" com avisos (o app ainda não tem
  central de avisos; entram quando ela existir).
- **Responsáveis:** só quem enxerga o cliente — o consultor dele e o administrador/gestor da consultoria.

## Quem faz o quê (proposta)

| Ação | Consultor do cliente | Administrador e gestor da consultoria | Central / dono |
|---|---|---|---|
| Ver o quadro | sim | sim | sim (só ler) |
| Criar, editar, mover, arquivar cartão | sim | sim | não |
| Apagar cartão | os que criou | todos | não |
| Colunas (criar, renomear, cor, ordem) | sim | sim | não |
| Apagar coluna | não | sim | não |
| Comentar; editar/apagar comentário | os próprios | os próprios (apaga qualquer um) | não |
| Anexar; apagar anexo | sim; os que enviou | sim; todos | não |

- **Cliente muda de consultoria:** o quadro é da consultoria que atende. A consultoria nova começa com um quadro novo;
  a antiga deixa de ver o cliente e o quadro dela (regra "uma consultoria nunca vê dados de outra"); a central vê os
  dois, só para ler. Mesmo molde de Arquivos e Check-ins.
- **Cliente arquivado:** quadro só para ler.
- **Consultor trocado:** o novo consultor passa a ver e mexer; os cartões do antigo continuam, com o nome dele.

## Regras do projeto que valem aqui

- CRUD completo em colunas, cartões, itens de checklist, comentários e anexos (anexo não se edita, como em Arquivos).
- Apagar sempre com confirmação dizendo o que some junto; cartão tem **Arquivar** como alternativa a apagar.
- Padrão Hub: janelas `JanelaFormulario`, campos de `src/components/campos/`, botões animados, `BarraDeFiltros`,
  `Tabela` com paginação na janela de Arquivados.
- Escala: contagens e filtros no banco, cartões carregados por coluna em páginas (centenas de cartões sem travar),
  sem chamada ao banco por cartão, índices em toda coluna de filtro/ordem/junção.
- Segurança: RLS em todas as tabelas, recorte por consultoria com funções em `private`, testes pgTAP, de integração e de
  tela; anexos e imagens da descrição num balde privado do Storage, na pasta do cliente.

## Decisões minhas (o construtor pode seguir)

- Tabelas novas (nomes provisórios): `quadros` (um por cliente+consultoria), `quadro_colunas`, `cartoes`,
  `cartao_responsaveis`, `cartao_checklist`, `cartao_comentarios`, `cartao_anexos`; posição fracionária para ordem.
- Arrastar com `@hello-pangea/dnd` (o mesmo do Mochi), conferindo que funciona com React 19; se não funcionar,
  `@dnd-kit`. Descrição com TipTap (o mesmo do Mochi). Versões exatas no `package.json`.
- Tempo real por canal privado do quadro (Supabase Realtime com autorização pelo banco), como no Mochi.
- O quadro é criado na primeira vez que alguém da consultoria abre a aba. Chave única (cliente, consultoria): se o
  cliente volta a uma consultoria que já o atendeu, o quadro antigo dela reaparece (como Arquivos e Check-ins).
- **Descrição:** guardada como JSON do TipTap (`jsonb`) + uma coluna de texto puro para a busca; nada de HTML cru
  (sem risco de XSS). Imagem só por upload (no balde privado, com o caminho no nó e a URL assinada na hora de mostrar);
  links no texto, sim. Apagar o cartão apaga as imagens e anexos do Storage (o app apaga a linha e depois os objetos,
  como em Arquivos).
- **Anexos:** mesmos limites de Arquivos (até 25 MB, qualquer tipo), num balde privado novo `quadros`, na pasta
  `<cliente_id>/<cartao_id>/`. Anexo não se edita.
- **Responsáveis e nomes:** quem sai do cliente (consultor trocado) continua nos cartões em que já estava, com o nome
  mostrado pela mesma regra de `consultor_do_checkin`/`autor_do_arquivo` (o nome de quem não é mais da consultoria
  segue a regra que já existe para check-ins); só pode ser escolhido como responsável novo quem enxerga o cliente hoje.
- **Colunas:** pode haver mais de uma coluna de concluídos; o quadro sempre tem pelo menos uma coluna (a última não
  se apaga). Apagar coluna com cartões pergunta para qual coluna os cartões vão (padrão) ou se somem junto; os
  arquivados da coluna seguem a mesma escolha.
- **Números e filtros:** os 4 números e os filtros contam só cartões não arquivados.
- **Tempo real:** o Supabase local e o da nuvem já trazem o Realtime; o plano começa conferindo os canais privados
  (`realtime.messages` com política). Aceite: o que outra pessoa muda aparece em até 2 s sem recarregar. Se o canal
  privado não funcionar no ambiente, plano B: recarregar o quadro ao voltar para a aba e a cada 30 s, avisando o Diego.

## Fora desta entrega

Vários quadros por cliente, quadro pessoal, transferências, acompanhar/avisos (Slack ou no app), etiquetas, capa de
cartão, menção (@), histórico de atividade do cartão, limite por coluna (o Mochi também não tem os seis últimos).

## Perguntas para o Diego

1. Um quadro por cliente está bom, ou você quer vários quadros dentro do mesmo cliente?
2. A central e o dono só olham o quadro, ou também mexem nos cartões?
3. Transferências e "acompanhar" com avisos podem ficar para depois?
