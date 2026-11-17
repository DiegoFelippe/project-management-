# Calendário integrado ao Google — design

Data: 2026-11-16 (revisto à noite). Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).
Constrói-se com o padrão Hub e a tipografia nova (janela de formulário, campos de data/hora, abas segmentadas).

## Pedido do Diego

- "Crie um menu de calendário, ele vai ser integrado com Google e vai gerar a possibilidade de gerar Meet, a gravação
  e a transcrição. Quero que seja criada uma nova pasta dentro do cliente com a documentação tanto da call quanto do
  arquivo de transcrição."
- "A agenda vai ter uma visão privada para cada consultor e uma visão para a gestora ver a agenda de todos os
  consultores."
- "O Calendário também pode levar o do Hub" e "o layout igual" (16/11, noite). Levantamento do Hub em
  `.superpowers/sdd/avulsos/calendario-hub-inventario.md` (cópia local, fora do git).
- Escolheu **"Conta de cada consultor"** para o Google (16/11, noite), como no Hub.
- O pedido anterior de "compartilhado de forma idêntica ao calendário do Mac" sai com essa escolha: cada consultor vê
  os eventos na própria agenda do Google (é organizador ou convidado); a gestora vê todos no app.
- Decisões delegadas marcadas **(minha)**.

## Objetivo, e o que seria falhar

- Objetivo: marcar reunião com o cliente pelo app, com Meet gravado e transcrito, e no fim ter, dentro do cliente,
  uma pasta da reunião com a transcrição e a documentação da call. Cada pessoa vê a agenda que lhe cabe.
- Falhar seria: consultor vendo a agenda de colega; uma consultoria vendo eventos de outra; reunião acabar e a
  transcrição não chegar sem ninguém saber por quê; token do Google de alguém legível por outra pessoa.

## Quem vê o quê (a hierarquia de sempre)

| Papel | No menu Calendário |
|---|---|
| Consultor (`pessoa`) | os próprios eventos e os eventos em que foi convidado (visão privada) |
| Gestor e administrador da consultoria | os eventos de todos os consultores da consultoria (filtro por consultor) |
| Central e dono | de todas as consultorias (filtro por consultoria e por consultor) |

Recorte no banco (RLS). Uma consultoria nunca vê eventos de outra. Na visão de mais de uma pessoa, a cor do chip é a do
consultor **(minha)**; na visão privada, a cor escolhida no evento.

## Tela — igual à do Hub

- Item no trilho: **Calendário** (ícone `CalendarDays`, animação nova `folhear`), para todos os papéis.
- Barra de filtros (padrão `BarraDeFiltros`): "Mostrar" (Reuniões com cliente, Compromissos, Ausências, Feriados —
  caixas com bolinha de cor), consultor (`Seletor` com busca no banco; só para gestor/admin/central), consultoria (só
  central/dono), cliente (busca), "Limpar filtros"; à direita **"Conectar Google"** (ou selo "Google conectado ✕") e o
  principal **"Novo evento"**.
- 4 indicadores: Reuniões na semana, Reuniões no mês, Aguardando transcrição, Pastas criadas no mês **(minha;
  equivalentes aos do Hub para este app)**.
- Alternador `AbasSegmentadas` Mês / Semana / Agenda; "Hoje", ‹ › e o rótulo do período.
  - Mês: grade de 7 colunas começando no domingo (como o Hub), até 3 chips por dia e "+N", hoje em destaque, clique
    seleciona o dia e duplo clique cria evento.
  - Semana: 7 cartões, um por dia, com os chips e o horário ao lado e "+ adicionar" (lista por dia, como no Hub).
  - Agenda: próximos 60 dias com eventos, bloco por dia.
  - No celular a visão inicial é a Agenda (o mês do Hub não cabe) **(minha)**.
- Abaixo: "Detalhe do dia" (dia clicado) e "Próximos 7 dias", lado a lado no computador.
- Chip: cor do evento, texto branco, ícone de vídeo quando tem Meet, ícone de pasta quando a pasta já existe.

## Janela de evento — igual à do Hub, com o que é deste app

`JanelaFormulario` larga (2 colunas):
- **Principal:** Título; Cliente (opcional; `Seletor` com busca entre os clientes que a pessoa vê; cliente arquivado
  não aceita evento novo); Descrição; Quando (atalhos Hoje/Amanhã/Semana que vem, data, "Das" e "Até", "Termina em
  outro dia"; sem horário = dia inteiro); Participantes (consultores da consultoria por busca, com a resposta de cada
  um); **Convidados de fora** — confirmado pelo Diego (16/11): qualquer e-mail (o contato do cliente aparece como
  sugestão; até 20; e-mail validado), que recebe o convite do Google com o link do Meet e entra na reunião como
  convidado do evento; a lista mostra quem é de fora e, quando o Google informa, a resposta; para
  gestor/admin/central, **Consultor** (de quem é a agenda; padrão: quem cria).
- **Lateral:** prévia de como aparece; cor (as 8 do Hub, em tons do tema); **Google Meet** (chave; padrão ligada quando
  há cliente) e **Gravar e transcrever** (chave; padrão ligada com Meet; aviso "a gravação começa quando o organizador
  entra; precisa de Google Workspace com gravação"); aviso do Google ("vai para o seu Google Agenda, com os
  convidados" ou "Conectar Google").
- Rodapé: Apagar (confirmação diz o que acontece no Google e que a pasta da reunião fica), Cancelar, "Criar evento" /
  "Salvar alterações".
- Quem não pode editar abre só leitura ("Só quem organiza e a gestão da consultoria editam"). Detalhe mostra "Entrar
  no Meet", "Abrir gravação", "Pasta da reunião" e a situação da reunião.

CRUD do evento: criar, consultar, editar e apagar — consultor nos próprios; gestor/admin nos da consultoria; central e
dono em todos. Participante convidado só responde (Confirmar/Recusar).

## Google — conta de cada consultor

- **Cada pessoa conecta o próprio Google** no Calendário ("Conectar Google"); a conexão é da pessoa, não da
  consultoria. Escopos: `openid`, `email`, `calendar.events`, `meetings.space.settings` (ligar gravação e transcrição
  automáticas numa reunião criada pelo Calendar), `meetings.space.readonly` (ler gravação e transcrição depois).
  Tokens só no Vault (nunca legíveis pelo navegador — corrige o ponto fraco do Hub); troca e renovação numa Edge
  Function (`google-pessoa`, nos moldes de `integracoes-google`). Desconectar apaga o token e revoga no Google.
- **Do app para o Google (mão única, como no Hub):** criar/editar/apagar evento grava no Google do **organizador**
  (o consultor dono da agenda), com convidados (`sendUpdates=all`), fuso de São Paulo, Meet (`conferenceData`) e, com
  "Gravar e transcrever", a configuração automática no espaço do Meet. Se o Google recusar, nada muda no app e a tela
  diz o motivo. O que é criado direto no Google não entra no app.
- Gestor/admin/central criando evento na agenda de um consultor: o evento é criado com o Google **daquele consultor**
  (se ele conectou); se não conectou, o evento fica só no app, sem Meet, com aviso.
- Convidado que aceitou e tem Google conectado: o app não duplica — ele já recebe o convite do Google.
- Avisos para o Diego (README): app do Google como "Interno" no Workspace da IXCSoft dispensa verificação para quem é
  do mesmo domínio; consultores de outro domínio (ex.: STI) exigem o app "Externo" verificado pelo Google (escopos do
  Meet); gravação e transcrição exigem Google Workspace com esses recursos na conta de cada consultor.

## Depois da reunião: a pasta no cliente

- Uma rotina (pg_cron a cada 10 minutos chamando a Edge Function `reunioes-depois`, com segredo no Vault; e botão
  "Buscar agora" no detalhe) procura reuniões com Meet já terminadas e ainda sem pasta e, **com o token do
  organizador**, lê a gravação e a transcrição da conferência. Quando a transcrição fica pronta (minutos a horas),
  cria a pasta.
- **Pasta da reunião** nos Arquivos do cliente: "Reunião 20/11/2026 14:00 — <título>", com `transcricao.txt` (fala de
  cada pessoa com a hora) e `documentacao.md` (título, data/hora, duração, organizador, participantes, links da
  gravação e do evento e, com a IA da consultoria conectada em Integrações, resumo, decisões e próximos passos).
  A gravação em vídeo fica no Drive do organizador; a pasta guarda o link.
- Situação da reunião: "Aguardando a transcrição", "Pasta criada", "Sem gravação/transcrição" (ninguém gravou ou 48 h
  sem ficar pronta), "Erro" com o motivo e "Tentar de novo"; organizador sem Google conectado → "Conecte o Google para
  buscar a gravação".
- A reunião aparece na aba Agenda do cliente e no Histórico ("Reunião realizada", "Pasta criada").

## Agenda dentro do cliente (pedido do Diego, 17/11)

- "A agenda que aparece dentro do cliente deve ser uma agenda parecida com a agenda do menu. Porém ela vai filtrada
  apenas com os compromissos do cliente." Confirmado: **só compromissos** (os check-ins ficam na aba Check-ins e o
  histórico na aba Histórico).
- A aba Agenda do cliente usa o mesmo calendário do menu (Mês, Semana e Agenda, "Hoje ‹ ›", detalhe do dia, próximos
  7 dias e os 4 números), recortado pelo cliente: os números contam só as reuniões deste cliente; a barra não tem
  consultor, consultoria nem cliente; "Mostrar" fica com reuniões, compromissos e feriados (ausências saem — são das
  pessoas, não do cliente); "Novo evento" abre com o cliente escolhido e travado. Quem vê e quem mexe: as mesmas
  regras do menu.

## Pastas nos Arquivos do cliente

Como no design anterior: criar pasta (quem envia arquivo no cliente), consultar (quem vê o cliente; paginado),
renomear e apagar (quem criou, gestor/admin da consultoria, central; a confirmação diz quantos arquivos vão junto).
Enviar arquivo de dentro da pasta já o coloca nela; mover arquivo entre pastas fica fora.

## Banco (resumo)

- `google_pessoas`: uma por perfil (e-mail da conta, escopos, quando conectou, segredo no Vault). O navegador lê só
  "conectado ou não"; só Edge Function grava e lê o segredo.
- `agenda_eventos`: consultoria, consultor (dono da agenda), cliente, título, descrição, data/hora de início e fim,
  dia inteiro, cor, Meet (link, código), gravar, id do evento no Google, situação da reunião, link da gravação, pasta,
  criado por, datas. Índices em (consultoria, início), (consultor, início), cliente e situação.
- `agenda_participantes`: evento, pessoa (perfil) ou e-mail de fora, resposta (pendente/confirmou/recusou).
- `cliente_pastas` e `cliente_arquivos.pasta_id`.
- RLS pelo papel (tabela "Quem vê o quê") + participantes veem o evento em que foram convidados; escrita de eventos
  pelas Edge Functions (mexem no Google), leitura pelo navegador só do intervalo visível.

## Decisões tomadas na construção (17/11, minhas — para o Diego conferir)

- **Evento dura no máximo 31 dias** (mais longo, dividir em dois). É o que deixa a leitura do período rápida com
  anos de histórico.
- **Ao editar, o consultor dono da agenda não muda** (o evento está no Google dele; para passar a outro, apagar e
  criar de novo). **O Meet, depois de criado, não se desliga.** As duas aparecem só para leitura na janela. **Com a
  pasta da reunião criada, o cliente também fica só para leitura** ("A pasta da reunião já está neste cliente.").
- **Apagar quando o Google do organizador não tem volta** (acesso desativado, conexão quebrada, Google pede para
  reconectar): o evento sai só do app, com o aviso de que pode continuar no Google Agenda dele. Outras recusas do
  Google (instabilidade) não apagam: dá para tentar de novo.
- **Salvar quando o Google do organizador não dá para usar** (acesso desativado, sem conexão, ou a conexão pede para
  reconectar): o evento novo (ou que ainda está só no app) fica só no app, sem Meet, com o aviso do motivo; o evento
  que já está no Google **não muda pelo app** ("Este evento está no Google de <nome>, que …. Para mudar, <nome>
  reconecta ou a gestão apaga e cria de novo."), para o app e o Google não ficarem diferentes sem ninguém saber.
  Evento novo na agenda de quem está desativado é recusado, e a credencial de quem saiu nunca é usada. Com a conexão
  com erro, a barra mostra "Reconectar Google" e o ✕ para desconectar. Central e dono não conectam o Google (nunca
  organizam eventos).
- **A central não é participante interna** de evento de consultoria (ela já vê todos os eventos).
- **O convite de um consultor participante** vai para o e-mail da conta Google que ele conectou; sem conexão, para
  o e-mail de login.
- **A resposta ao convite (Confirmar/Recusar) fica no app**; a resposta de quem responde pelo Google (de fora ou da
  casa) ainda não volta para o app (próximo passo: ler o evento no Google). Por isso a lista dos convidados de fora
  mostra só "Convite enviado" (quando o evento está no Google), sem resposta.
- **Conectar o Google:** o Google devolve a pessoa para `/calendario` e é a tela, com o login dela, que conclui a
  conexão (pedido de uso único, 10 minutos, preso a quem pediu). Recusar uma permissão não revoga nada no Google
  (revogar derrubaria também a integração da consultoria se fosse a mesma conta).
- **Cliente que muda de consultoria:** os eventos da consultoria antiga perdem o vínculo com o cliente e com a
  pasta (a antiga fica com o título da reunião, sem o nome do cliente).
- **Apagar pasta** só quando a pessoa poderia apagar cada arquivo dela (arquivo da central só a central apaga).
- **Rotina depois da reunião:**
  - reunião **sem cliente** fica fora da rotina (sem pasta, sem consulta ao Google, sem "erro"); se um cliente for
    escolhido depois, a rotina pega a reunião;
  - instabilidade do Google (sem resposta, limite de pedidos, erro do lado dele) e falha ao guardar a pasta **não
    viram erro**: a rotina tenta de novo nas rodadas seguintes, até as 48 h;
  - recusas que tentar de novo não resolve (Google pede para reconectar, sem permissão, app do Google sem
    configurar, código do Meet inválido) viram "Erro" com o motivo e "Tentar de novo";
  - consultas espaçadas: a cada rodada (10 min) até 2 h depois do fim, depois de hora em hora até 48 h;
  - a gravação e a transcrição vêm só das conferências do Meet que começaram entre 30 min antes do início e 6 h
    depois do fim do evento (o mesmo Meet pode ter outras reuniões); numa reunião com queda (mais de uma conferência),
    as falas das que têm transcrição são juntadas em ordem, e a gravação é a da parte mais longa;
  - **remarcar** para depois de agora uma reunião que já passou ("aguardando", "sem gravação/transcrição" ou "erro")
    volta a "agendada", e a rotina a pega depois do novo fim; a reunião que **perde o cliente** enquanto aguarda volta
    a "agendada" (o indicador "Aguardando transcrição" conta só reunião com cliente);
  - **conectar ou reconectar o Google** reabre as reuniões do organizador que pararam em "erro" por causa do Google
    ("Conecte/Reconecte o Google") e terminaram há menos de 48 h;
  - a reunião que gravou mas não transcreveu aparece como "Sem transcrição", com "Abrir gravação";
  - **ponto em aberto:** com ~1.000 consultores, nos horários de pico a pasta pode atrasar algumas rodadas (nada se
    perde); o próximo passo, quando houver esse volume, é trocar os lotes por uma fila contínua e separar a IA.
- **Pasta da reunião sem autor:** hoje só a gestão e a central renomeiam ou apagam a pasta e os arquivos dela.
  **Para o Diego decidir:** o organizador aparecer como autor (e poder renomear/apagar).

## Testes

- pgTAP: quem vê e quem grava cada tabela (consultor, colega, gestor, outra consultoria, central); token nunca
  legível pelo navegador.
- Integração: Edge Functions com o Google trocado por um Google falso (núcleo em `supabase/functions/_shared/agenda/`
  sem imports do Deno, recebendo banco e Google por parâmetro), incluindo criar com Meet, apagar, e a pasta com
  transcrição e documentação.
- Tela: as 3 visões, filtros por papel, janela de evento (criar/editar/só leitura/apagar), pastas nos Arquivos.
- Conferência no navegador sem Google real; ponta a ponta com Google real quando o Diego configurar o app do Google.

## Fora desta entrega

Trazer para o app o que é criado direto no Google, arrastar eventos, recorrência, salas, disponibilidade para o
cliente marcar, mover arquivo entre pastas.
