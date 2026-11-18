# Modelos de check-in e o novo check-in — design

Data: 2026-11-17. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).
Protótipo mostrado ao Diego (descartável, dados de exemplo): `docs/prototipo/checkins-modelo-poc.html`.
Plano de construção: `docs/superpowers/plans/2026-11-17-modelos-de-checkin.md`.

## Pedido do Diego

- "Sobre os check-ins. Vamos ter que criar um novo modelo. Normalmente a central ou o gestor cria um modelo para a
  consultoria ou a própria consultoria cria. E o Consultor faz como se fosse um check list das tarefas. Exemplo: Analise
  do DRE marca como feito. Acho que daria pra fazer uma visualização de lista e um fluxograma vamos criar um poc disso."
  (17/11)
- Depois de ver o protótipo: "Pode implementar também os modelos e o novo checking" e "pode fazer tudo que depende de
  mim" (17/11, 13:27).

## Objetivo, e o que seria falhar

- A Central, ou a gestão da consultoria, monta **modelos de check-in**: etapas e tarefas, cada tarefa com prazo (dias a
  partir do início), obrigatória ou opcional, e "depende de". A gestão **aplica** o modelo no cliente; o **consultor do
  cliente** segue como check-list (em lista por etapa ou em fluxograma) e marca o que fez. O que ele marca com o check-in
  aberto entra no resumo daquele check-in.
- A gestão e a Central acompanham o **andamento** de cada cliente (progresso, atrasos, próxima tarefa) numa tabela, sem
  abrir cliente por cliente.
- Falhar seria: uma consultoria ver modelos, clientes ou nomes de outra; salvar um modelo com dependência em ciclo
  (tarefa que nunca libera, fluxograma sem fim); editar um modelo e bagunçar o check-list de quem já usa; trocar o
  modelo e perder o registro do que já foi feito; o andamento lento com milhares de clientes; telas fora do Padrão Hub;
  faltar uma das quatro operações em algo que a tela cria.

## O que não é (anti-objetivos)

- Não é um segundo Quadro: tarefa do check-list não tem responsável, anexo, comentário nem subtarefa. Quem marca é o
  consultor do cliente.
- Não troca as horas: o check-in continua sendo abrir, fechar e contar o que foi feito. O check-list só acrescenta "o
  que foi marcado nesta sessão".
- Não mexe em "a central cadastra e manda; a consultoria escolhe o consultor".

## As 8 perguntas do protótipo

Decidido pelo controlador a partir da POC (o Diego pode mudar). São as respostas que o protótipo já mostrava:

1. **O check-list é do cliente e dura o projeto todo.** Cada check-in só registra o que foi marcado durante ele
   ("Nesta sessão").
2. **"Depende de" existe.** A tarefa fica bloqueada até as anteriores ficarem feitas. As dependências desenham as setas
   do fluxograma; sem dependências, o fluxograma vira colunas por etapa.
3. **Quem aplica:** a Central e o administrador/gestor da consultoria aplicam o modelo no cliente. O consultor segue.
4. **Aplicar copia o modelo para o cliente.** Editar o modelo depois vale só para as próximas aplicações.
5. **O gestor não edita modelo da Central:** duplica e adapta para a consultoria dele.
6. **Só o consultor do cliente marca as tarefas.** A Central e a gestão acompanham (só leem).
7. **Não precisa de check-in aberto para marcar.** Com o check-in aberto, o que for marcado entra no resumo dele.
8. **Prazo em dias corridos** a partir de uma data de início que quem aplica escolhe. **Trocar o modelo zera o
   check-list** do cliente; o que foi feito continua no histórico dos check-ins.

## Onde fica

**Menu: item novo "Check-ins"** (rota `/checkins`, ícone `ListChecks`, animação `abrir`, que ainda não está no trilho;
todos os papéis; logo depois de Calendário). Duas abas de página (`AbasSegmentadas` com `comoAbas`, guardadas em
`?aba=`, como as do cliente): **Andamento** (a primeira) e **Modelos**. Cada aba segue o molde de tela nova: barra de
filtros (ícone + "Filtros") → cartões de números → tabela paginada no banco. O cabeçalho da página é "Check-ins", sem
botões (a ação principal fica no fim da barra, como "Novo time" em Times).

**Aba Andamento** (a "Visão da gestão" do protótipo)
- Barra: Filtros · abas Todos / Com atraso / Sem modelo · busca "Buscar cliente ou modelo" · Consultoria (Central) ·
  Consultor (gestão e Central; busca no banco).
- Cartões: Clientes com modelo ("de N clientes" embaixo) · Progresso médio · Tarefas atrasadas · Vencem em 7 dias.
  Contados no banco, no recorte de quem vê, seguindo consultoria e consultor; a aba e a busca não mudam os cartões.
- Tabela "Andamento dos clientes": Cliente (nome e cidade) · Consultor (rosto e nome; a Central vê também a consultoria)
  · Modelo · Progresso ("64% · 9 de 14" e barra) · Atrasadas · Próxima tarefa (título e "vence 20/11") · ações: **Abrir**
  (vai para a aba Check-ins do cliente) e, para quem aplica, **Aplicar modelo** nos clientes sem modelo.
- Ordem: o mais atrasado primeiro (próximo vencimento mais antigo), depois o nome; sem modelo no fim.
- O consultor também vê esta aba, só com os clientes dele: vira a lista "o que eu tenho para fazer".

**Aba Modelos**
- Barra: Filtros · abas Ativos / Arquivados · busca "Buscar por nome ou descrição" · Tipo (Gestão, Sucesso do Cliente,
  Assessoria Jurídica, Gestão de Pessoas) · Consultoria (Central: os modelos que aquela consultoria vê) · **Novo modelo**
  (Central, administrador e gestor).
- Cartões: Modelos ativos · Da Central · Da consultoria (para a Central, "Das consultorias") · Clientes usando (clientes
  com check-list ativo, no recorte de quem vê).
- Tabela "Modelos de check-in": Modelo (nome e descrição) · Tipo · Para (Todas as consultorias / nome da consultoria) ·
  Criado por (nome, "Central" ou "Gestão · consultoria", data) · Etapas · Tarefas ("14 (11 obrig.)") · Clientes usando
  · ações conforme "Quem faz o quê": Ver, Editar, Duplicar, Arquivar ou Reativar, Apagar.

**Janela do modelo** (`JanelaFormulario` larga, como no protótipo)
- Abas "Etapas e tarefas" e "Fluxograma (prévia)"; duas colunas. À esquerda: Nome, Descrição, Tipo, Para quem (a
  Central escolhe "Todas as consultorias" ou "Uma consultoria" + qual; a gestão vê só a própria, fixa), Resumo (etapas,
  tarefas, obrigatórias/opcionais, "última tarefa no dia N") e, se o modelo está em uso, o aviso "N clientes usam; o que
  você mudar vale para quem receber o modelo daqui em diante".
- À direita, as etapas na ordem: nome, subir/descer, apagar (com tarefas, confirmação na própria etapa: "Apagar a etapa X
  e N tarefas dela? As dependências para essas tarefas também saem."). Em cada tarefa: título, descrição curta,
  Obrigatória (`Chave`), Prazo "dia N" (`CampoNumero`, 0 a 365), Depende de (chips + "Adicionar", que só oferece tarefas
  que vêm **antes** na lista), subir/descer (atravessa etapas), apagar (se alguma tarefa depende dela, confirmação dizendo
  quais perdem a dependência). "Tarefa nesta etapa" e "Nova etapa".
- Erros aparecem na tarefa ou etapa e no rodapé ("'Plano de ação' depende de 'Análise do DRE', que vem depois. Mova uma
  das duas ou tire a dependência."). Rodapé: Cancelar + **Salvar modelo** ("Salvando…").
- Nada vai para o banco antes de Salvar; Cancelar descarta o rascunho inteiro.
- **Duplicar** abre a mesma janela com "Cópia de X" e salva como modelo novo. **Ver** abre uma janela só de leitura com
  as abas Lista e Fluxograma (para o gestor, um botão "Duplicar para a minha consultoria").

**Cliente → aba Check-ins** (a que já existe ganha o check-list em cima da tabela de check-ins)
- Com modelo:
  1. Barra: Filtros · Lista / Fluxograma · Todas / Pendentes / Feitas (com os números) · Deitado / Em pé (só no
     fluxograma) · "Próxima: Análise do DRE · vence 20/11".
  2. Cartões "Andamento do check-list": Tarefas feitas (com "de N" e a %) · Obrigatórias feitas · Vencem em 7 dias ·
     Atrasadas.
  3. Duas caixas lado a lado (uma embaixo da outra em tela estreita): **Modelo aplicado** (nome, "aplicado por … em …,
     prazos contam de …", % e barra; para quem aplica: **Trocar modelo**, **Início dos prazos** e **Tirar modelo**) e
     **Check-in** (em andamento, com o relógio e "Nesta sessão: …"; ou "Sem check-in aberto"; e "Último: data, duração,
     quem").
  4. Para quem só acompanha: "Você acompanha o andamento. Quem marca as tarefas é <consultor>, o consultor do cliente."
  5. **Lista**: um cartão por etapa (número, nome, "3 de 5" e barra); cada tarefa com a caixa de marcar, o título (abre a
     janela da tarefa), "Opcional", "Nesta sessão", a descrição, os selos (Feita por … em …; Em andamento; Atrasada ·
     venceu 12/11; Vence hoje; Vence 20/11; Bloqueada · espera X) e a nota. Tarefa bloqueada: caixa desligada com o
     motivo. **Fluxograma**: raias por etapa ("3 de 5 feitas"), caixas coloridas pela situação, setas do "depende de",
     legenda; clicar (ou Enter) abre a tarefa; arrastar com o mouse rola para os lados; no celular, o dedo rola.
  6. A tabela Check-ins de hoje, com a coluna nova **Tarefas marcadas** (até 3 + "+N").
- Sem modelo: a caixa "Este cliente ainda não tem um modelo" (quem aplica: **Aplicar modelo**; o consultor: "A gestão
  aplica o modelo. Enquanto isso, o check-in funciona como hoje.") + a caixa Check-in + a tabela.
- **Janela da tarefa**: título; "cliente · etapa N, nome · obrigatória/opcional"; selos; descrição; Prazo ("20/11/2026 ·
  dia 10 a partir de 10/11/2026"); Situação ("Faltam 3 dias", "Atrasada há 2 dias", "por Ana em 12/11"); Depende de e
  Libera (listas clicáveis, com a situação de cada uma); Nota (o consultor escreve; os outros leem). Rodapé do consultor:
  a fazer → Começar + **Marcar como feita**; em andamento → Voltar para a fazer + **Marcar como feita**; feita → Reabrir
  tarefa + **Salvar nota**; bloqueada → **Salvar nota**. Para os outros: Fechar.
- Depois de marcar, o aviso diz o que liberou e onde ficou: "Análise do DRE feita. Agora dá para fazer: Mapa de custos.
  Entrou no resumo deste check-in." (ou "Sem check-in aberto: fica feita, fora de uma sessão.").

**Janela Aplicar modelo / Trocar modelo** (da aba do cliente e do Andamento): Modelo (`Seletor` com busca no banco; os
do tipo de consultoria do consultor do cliente vêm primeiro), Início dos prazos (`CampoData`, hoje por padrão), Prévia
("14 tarefas em 4 etapas · a última vence em 09/01/2027 (dia 60)"). Ao trocar: "O check-list atual (5 de 14 feitas) é
trocado pelo do modelo novo, começando do zero. O que já foi feito continua nos check-ins e no Histórico." Rodapé:
Cancelar + **Aplicar modelo** / **Trocar modelo** ("Aplicando…").

**Janela Início dos prazos** (editar o check-list): `CampoData` e a prévia de como ficam as datas; Salvar recalcula os
prazos das tarefas.

## Quem faz o quê

| Ação | Consultor do cliente | Administrador e gestor da consultoria | Central e dono |
|---|---|---|---|
| Ver modelos (lista, Ver, fluxograma) | os da consultoria dele e os da Central para ela (só ler) | os mesmos | todos |
| Criar modelo | não | sim, para a própria consultoria | sim, para todas ou para uma consultoria |
| Editar modelo | não | os da própria consultoria | todos |
| Duplicar modelo | não | os que vê (a cópia fica da consultoria dele) | todos |
| Arquivar e reativar modelo | não | os da própria consultoria | todos |
| Apagar modelo (sem cliente usando) | não | os da própria consultoria | todos |
| Ver o check-list, a sessão e o andamento | os clientes dele | os clientes da consultoria | todos (só ler) |
| Aplicar, trocar ou tirar o modelo; mudar o início dos prazos | não | clientes ativos da consultoria | clientes ativos com consultoria |
| Marcar, começar, reabrir tarefa; escrever a nota | sim, com o cliente ativo | só se for o consultor do cliente | não |
| Ver as tarefas marcadas num check-in | os check-ins dele | os da consultoria | todos |

- Consultor que não atende o cliente não vê o cliente (regra de hoje), então não vê o check-list dele.
- Cliente arquivado: check-list só para ler, para todos. Reativado, continua de onde parou.
- Cliente sem consultor ("aguardando consultor"): pode ter modelo; ninguém marca até a consultoria escolher o consultor.

**Apagar sempre com confirmação, dizendo o que some junto:**
- Modelo sem uso: "Apagar 'X'? Somem junto 4 etapas e 14 tarefas do modelo. Nenhum cliente usa. Não dá para desfazer.
  Se quiser só tirar da lista, arquive." (botões Arquivar e Apagar).
- Modelo em uso (algum cliente com check-list ativo dele): não apaga. "'X' está em uso: 3 clientes usam. Arquive: ele sai
  da lista para aplicar e os clientes continuam com o check-list." Os nomes listados são só os que a pessoa enxerga.
- Arquivar modelo: "Ele sai da lista de modelos para aplicar. Os N clientes que usam continuam com o check-list. Dá para
  reativar na aba Arquivados."
- Tirar o modelo do cliente (é o "apagar" do check-list, e ele vira histórico): "Tirar 'X' de <cliente>? O check-list
  sai da aba (5 de 14 feitas). O que foi feito continua nos check-ins e no Histórico."
- Apagar um check-in (já existe): o texto ganha "As tarefas marcadas nele continuam feitas no check-list."

## Como funciona

**Modelo**
- "Para quem": da Central para todas as consultorias (inclusive as que entrarem depois), da Central para uma
  consultoria, ou da consultoria (feito pela gestão dela, só para ela).
- Tipo de consultoria opcional (um dos quatro das pessoas): serve ao filtro e para pôr no topo, ao aplicar, os modelos
  do tipo do consultor do cliente.
- Etapas em ordem; tarefas em ordem dentro da etapa; a ordem do modelo inteiro é etapa por etapa. Prazo: "dia N" a partir
  do início (0 a 365).
- **"Depende de" só aponta para tarefa que vem antes na lista** (pode ser da mesma etapa ou de uma anterior). É isso que
  garante que nunca há ciclo: toda seta anda para trás na ordem. O banco confere ao salvar.

**Aplicar = copiar**
- O cliente recebe uma cópia das etapas, tarefas e dependências, com o nome do modelo, o início e quem aplicou. O prazo
  de cada tarefa vira uma data (início + dias). Editar, arquivar ou apagar o modelo depois não muda essa cópia.
- Um check-list ativo por cliente. **Trocar** encerra o ativo (fica guardado, com o que foi feito) e começa outro do zero.
  **Tirar** encerra sem pôr outro. **Início dos prazos** recalcula as datas, sem mexer no que foi feito.

**Situação de cada tarefa** (a mesma conta na lista, no fluxograma, nos números e no andamento)
- Feita · Em andamento · A fazer · **Bloqueada** (alguma de que depende não está feita) · **Atrasada** (não feita e a data
  já passou) · **Vence hoje**. "Hoje" é o dia em São Paulo. "Vencem em 7 dias": de hoje até daqui a 7 dias.
- Progresso = feitas ÷ todas. Próxima tarefa = a de data mais cedo entre as não feitas e não bloqueadas.

**Marcar**
- Só o consultor do cliente, com o cliente ativo e o check-list ativo. Marcar como feita e "Começar" pedem as
  dependências feitas; "Reabrir" pode sempre (as que dependem dela e já estão feitas continuam feitas).
- Grava quem e quando. Se o consultor está com o check-in aberto **neste** cliente, a tarefa entra no resumo dele;
  desmarcar com ele ainda aberto tira de lá. Depois do check-out, o check-in não muda mais.
- Marcar sem check-in aberto (ou com o check-in aberto em outro cliente) vale: a tarefa fica feita, fora de uma sessão.

**Quando alguém sai** (no molde dos check-ins de hoje)
- Consultor trocado: o novo consultor continua o mesmo check-list; o antigo deixa de marcar na hora. O check-in aberto
  dele já é fechado pela regra de hoje, com as tarefas que marcou. "Feita por" continua com o nome dele (com a regra de
  nome visível de hoje).
- Cliente movido para outra consultoria, ou devolvido à Central (inclusive quando a consultoria é arquivada): o
  check-list ativo é encerrado. A consultoria nova começa sem modelo e aplica um dos que ela vê. Se o cliente voltar, o
  antigo não volta. Uma consultoria nunca vê o check-list da outra.
- Cliente arquivado: check-list só para ler. Cliente com check-list (mesmo encerrado) não se apaga; o app pede para
  arquivar, como já faz com horas, arquivos e cartões.

## O que muda no check-in de hoje

- Fazer check-in, check-out, lançar horas, editar, apagar e o fechamento automático continuam iguais.
- **Check-out**: a janela mostra "Tarefas marcadas nesta sessão" e, se "O que foi feito" estiver vazio, já vem com
  "Tarefas concluídas: Análise do DRE; Mapa de custos." para completar.
- **Editar check-in**: mostra as tarefas marcadas nele (só para ler).
- **Tabela Check-ins**: coluna "Tarefas marcadas".
- **Apagar check-in**: as tarefas continuam feitas; some só o registro de que foram feitas naquele check-in (o texto da
  confirmação diz isso).
- **Lançar horas** (atendimento passado): sem tarefas; quem quiser marca no check-list.
- O botão "Fazer check-in / Fazer check-out" continua no topo da página do cliente; a caixa Check-in da aba mostra o
  relógio e "Nesta sessão", sem um segundo botão.
- **Histórico** do cliente ganha "Modelo de check-in aplicado: X", "Modelo de check-in trocado para X" e "Modelo de
  check-in tirado: X".

## Dados

Nomes provisórios; o plano diz as funções.

**Modelos**
- `modelos`: id, nome (2–80), descricao (até 400), tipo (um dos 4 tipos de consultoria, ou nenhum), da_central,
  consultoria_id (nula = todas as consultorias, só em modelo da Central), criado_por, criado_em, atualizado_em,
  arquivado_em; contadores gravados ao salvar (etapas, tarefas, obrigatorias, maior_prazo); busca sem acento (gerada).
- `modelo_etapas`: id, modelo_id, nome (1–60), posicao (1, 2, 3…).
- `modelo_tarefas`: id, modelo_id, etapa_id, titulo (1–80), descricao (até 160), obrigatoria, prazo_dias (0–365),
  posicao (ordem no modelo inteiro, 1…n, seguindo as etapas).
- `modelo_dependencias`: tarefa_id, depende_de (as duas do mesmo modelo; depende_de com posição menor).
- Limites: até 50 etapas, 500 tarefas e 30 dependências por tarefa.

**Check-list do cliente** (a cópia)
- `cliente_checklists`: id, cliente_id, consultoria_id (a do cliente ao aplicar), modelo_id (fica nulo se o modelo for
  apagado), modelo_nome (cópia), inicio, aplicado_por, aplicado_em, encerrado_em, encerrado_por, motivo ('trocado',
  'tirado', 'cliente_movido'); contadores recontados a cada mudança (tarefas, feitas, obrigatorias,
  obrigatorias_feitas, proximo_vencimento). No máximo um ativo (sem encerrado_em) por cliente.
- `checklist_etapas`, `checklist_tarefas` (as colunas do modelo + vence_em, estado 'a_fazer' | 'andamento' | 'feita',
  nota até 500, feita_em, feita_por) e `checklist_dependencias`.
- `checkin_tarefas`: checkin_id, tarefa_id, titulo (cópia), marcada_em — o que foi marcado naquele check-in. O título
  copiado deixa o histórico de pé mesmo para quem não vê mais o check-list (ex.: o consultor que mudou de consultoria
  continua vendo os check-ins dele).
- `cliente_eventos`: tipos novos 'modelo_aplicado', 'modelo_trocado', 'modelo_tirado' e a coluna checklist_id, para o
  Histórico dizer o nome do modelo (só para a Central e a consultoria do check-list).

**Regras no banco**
- RLS em todas as tabelas novas, `GRANT` só para `authenticated`, recorte por consultoria com funções em `private`,
  tudo pelo `liberado()`. Leitura pelas regras e por funções; escrita só por funções do banco (`security definer`,
  `search_path` vazio), menos arquivar, reativar e apagar modelo, que vão direto pela regra.
- **Sem ciclo:** salvar o modelo grava a ordem e recusa dependência para tarefa que não vem antes, para tarefa de outro
  modelo ou para ela mesma. A cópia mantém a ordem, então o check-list também nunca tem ciclo.
- **Salvar regrava o modelo inteiro numa transação** (o editor manda tudo de uma vez). Os check-lists não apontam para
  as tarefas do modelo, então regravar não mexe em ninguém.
- **Aplicar** trava o cliente (duas pessoas aplicando ao mesmo tempo: a segunda espera e troca o da primeira),
  encerra o ativo, copia, calcula as datas e registra o evento. **Marcar** trava o check-list, confere as regras, grava,
  liga ao check-in aberto e reconta. Trocar e marcar ao mesmo tempo: um espera o outro; marcar num check-list encerrado é
  recusado.
- Gatilho: o cliente mudou de consultoria (ou voltou à Central) → o check-list ativo é encerrado ('cliente_movido').
- Gatilho: apagar modelo com check-list ativo → recusado (`modelo_em_uso`).

## Escala

- **Modelos**: lista de 15 por página vinda do banco; busca sem acento com índice; filtros (aba, tipo, consultoria) no
  banco; etapas, tarefas e maior prazo são contadores do próprio modelo; "clientes usando" contado no banco só para as
  15 linhas da página.
- **Check-list do cliente**: até 500 tarefas (limite no banco). Vem inteiro numa leitura, com tudo o que a lista, o
  fluxograma, os números e a sessão precisam; nada é pedido tarefa por tarefa. Os números são contados no banco.
- **Andamento**: 15 por página vindos do banco; contadores no check-list (tarefas, feitas, próximo vencimento) fazem
  "Com atraso", a ordem e o progresso médio sem varrer tarefas; atrasadas e próxima tarefa só para as 15 linhas.
- **Índices** em tudo que filtra, ordena ou junta: modelos por consultoria/aba, tipo e busca; check-list ativo por
  cliente, por consultoria, por modelo e por próximo vencimento; tarefas por check-list e posição, e as não feitas por
  data; dependências pelos dois lados; checkin_tarefas por tarefa.
- **Teste de volume**: 5.000 clientes com check-list de 40 tarefas (200 mil tarefas), 2.000 modelos e um modelo de 500
  tarefas. Andamento, cartões, lista de modelos, abrir o check-list de 500 e marcar respondem rápido; EXPLAIN sem Seq
  Scan nas tabelas grandes.
- **Fluxograma de 500 tarefas**: o desenho é calculado uma vez por mudança, sem biblioteca nova; SVG com os tokens de
  cor (claro e escuro); texto de no mínimo 11 px; rola dentro do cartão (a 360 px a página não rola para o lado).

## Regras do projeto que valem aqui

- CRUD completo em modelos (criar, ver, editar, duplicar, arquivar/reativar, apagar), em etapas, tarefas e dependências
  dentro do modelo, no check-list do cliente (aplicar, ver, mudar o início, trocar, tirar) e na nota da tarefa. Apagar com
  confirmação; arquivar ou tirar quando apagar quebraria o histórico.
- Padrão Hub: `JanelaFormulario` + `SecaoFormulario`, campos só de `src/components/campos/` (`Seletor` com busca no
  banco, `CampoData`, `CampoNumero`, `Chave`, `Caixa`), botões animados, `BarraDeFiltros`, `CartoesDeNumeros`, `Tabela`
  com paginação, `ListaVazia`, tipografia da escala, largura toda, claro e escuro, 360 px sem rolar para o lado.
- Testes no banco (pgTAP), de integração e de tela, como as telas que já existem.

## Fora desta entrega

Acrescentar ou apagar tarefa só num cliente; responsável por tarefa; anexos, comentários e evidências na tarefa; dias
úteis e feriados no prazo; tempo real (quem acompanha vê o que o consultor marcou ao abrir ou recarregar); avisos de
tarefa atrasada (Slack, WhatsApp, e-mail); ligar tarefa a cartão do Quadro ou a evento da Agenda; números do check-list
no Início; versões e histórico de edições do modelo; importar e exportar modelos; a Central ver os check-lists encerrados
de consultorias anteriores.

## Decisões que tomei (o Diego confere)

- **Um item no trilho, "Check-ins", com as abas Andamento e Modelos.** O protótipo tinha dois itens (Modelos e Visão da
  gestão); um só deixa o trilho mais curto e reúne o assunto. A animação é `abrir`, a única livre.
- **O consultor também vê o Andamento** (só os clientes dele) e os modelos (só ler).
- **Dependência só para tarefa que vem antes na lista.** É simples de entender ("só tarefas que vêm antes podem ser
  dependências", como no protótipo) e garante que nunca há ciclo.
- **Reabrir tarefa feita pode sempre**, mesmo que outra que depende dela já esteja feita (a outra continua feita). O
  bloqueio vale para marcar e começar.
- **"Começar" (em andamento) e a nota** do protótipo entram.
- **Cliente movido encerra o check-list**; se voltar, não ressuscita (diferente do Quadro, que reaparece). Assim cada
  cliente tem no máximo um check-list ativo, sempre da consultoria que o atende.
- **Tarefas do check-list do cliente não se criam nem se apagam uma a uma** (vêm do modelo); a edição do check-list é
  mudar o início dos prazos, e para mudar as tarefas edita-se o modelo e troca. É uma exceção ao CRUD completo:
  **aprovada pelo Diego em 17/11** ("Pode ser assim"), junto com o check-list fora de `Tabela` e os filtros
  Todas/Pendentes/Feitas na tela (itens abaixo).
- **Check-list nunca se apaga de vez**: "Tirar o modelo" o encerra e ele fica como histórico; ele segura o cliente
  (apagar cliente com check-list → arquivar).
- **O check-in guarda o título das tarefas marcadas nele** (cópia). Apagar um check-in não desmarca as tarefas.
- **Modelo em uso (com check-list ativo) não se apaga**, só arquiva. Modelo arquivado não aparece para aplicar e não se
  edita (reativa antes).
- **Tipo de consultoria no modelo** (um, opcional): barato (uma coluna) e útil no filtro e ao aplicar.
- **Limites**: 50 etapas, 500 tarefas, 30 dependências por tarefa; tamanhos de texto do protótipo; nota até 500.
- **O botão de check-in continua no topo da página**; a caixa Check-in da aba só mostra o relógio e "Nesta sessão".
- **Filtros Todas/Pendentes/Feitas e Deitado/Em pé rodam na tela**: o check-list inteiro (até 500 tarefas) já vem numa
  leitura porque o fluxograma precisa dele todo; os números vêm do banco. É exceção à regra "filtros no banco".
- **O check-list é uma visão de trabalho, não uma lista em tabela** (como o Quadro): cartões por etapa e fluxograma.
  Modelos e Andamento são tabelas.
- **No celular o fluxograma começa "Em pé".**
- **Sem tempo real nesta entrega.**

## Acréscimo de 18/11: tarefa "Não se aplica"

Pedido do Diego (18/11): o consultor importou o modelo, mas uma tarefa não foi necessária naquele cliente; ele marca
isso para a auditoria saber. Proposta aprovada ("Pode fazer", 18/11 08:50):

- **Terceiro jeito de fechar uma tarefa**, ao lado de "feita": **"Não se aplica"** (`estado = 'nao_se_aplica'`).
- **Quem marca:** o consultor do cliente, como "feita", com ou sem check-in aberto; volta para "a fazer" pelo mesmo
  caminho (o motivo sai junto, e o Histórico ganha a linha "Tarefa reaberta", com quem). **Trocar o motivo = reabrir e
  marcar de novo** (marcar de novo com outro motivo é recusado e a tela diz isso; a nota da tarefa continua editável
  sem mexer no motivo).
- **Motivo obrigatório** (1 a 500 letras, o que o auditor lê), guardado à parte da nota da tarefa; fica quem marcou e
  quando, e o Histórico do cliente ganha uma linha (tarefa, motivo, quem).
- **Vale também para tarefa obrigatória**, desde que tenha motivo (decisão do controlador; o Diego pode travar depois).
- **Libera as que dependem dela**, como "feita" — pela cadeia. **Pedido do Diego, 18/11 ("Pode, com cuidado"):
  bloqueada pode ser não se aplica; as que dependem dela esperam as dependências dela.** A que não se aplica só libera
  quando as dependências dela também estão resolvidas (feitas, ou não se aplicam sem nada pendente atrás). Ex.: C depende
  de B, B de A; B vira "não se aplica" com A pendente: C continua esperando A, e fica livre quando A for resolvida.
- **Progresso:** conta como resolvida, mas aparece separada ("4 de 5 resolvidas: 3 feitas, 1 não se aplica"). Não
  entra em "atrasadas", "vencem em 7 dias" nem vira a "próxima"; a aba Andamento e os números seguem a mesma regra.
- **No check-in:** marcada com o check-in aberto, entra no resumo da sessão e no texto do check-out como
  "Não se aplica: <tarefa> (<motivo>)".
- **Visual:** cinza, com ícone próprio (nunca o check verde), na lista, no fluxograma, na janela da tarefa e na legenda
  do fluxograma do cliente. O modelo em si não muda: quem decide é o consultor, no cliente (a prévia do modelo não tem
  situação de tarefa, então não tem legenda a mudar).
