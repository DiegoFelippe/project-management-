# Calendário integrado ao Google — design

Data: 2026-11-16. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).
Constrói-se depois do padrão Hub (usa `JanelaFormulario`, campos de data/hora, `AbasSegmentadas`).

## Pedido do Diego

- "Crie um menu de calendário, ele vai ser integrado com Google e vai gerar a possibilidade de gerar Meet, a gravação
  e a transcrição. Quero que seja criada uma nova pasta dentro do cliente com a documentação tanto da call quanto do
  arquivo de transcrição."
- "Quero um calendário que será compartilhado de forma idêntica ao calendário do Mac."
- "A agenda vai ter uma visão privada para cada consultor e uma visão para a gestora ver a agenda de todos os
  consultores." (16/11)
- Delegou as decisões ("pode fazer tudo o que depende de mim"). As escolhas abaixo marcadas **(minha)** são minhas.

## Objetivo, e o que seria falhar

- Objetivo: marcar reunião com o cliente pelo app, com Meet gravado e transcrito, e no fim ter, dentro do cliente,
  uma pasta da reunião com a transcrição e a documentação da call. Cada pessoa vê a agenda que lhe cabe, no app e
  no Calendário do Mac/iPhone/Google, igual nos dois lugares.
- Falhar seria: consultor vendo a agenda de colega; uma consultoria vendo eventos de outra; evento mudado no Mac e o
  app mostrando outro horário; reunião acabar e a transcrição não chegar sem ninguém saber por quê.

## Quem vê o quê (a hierarquia de sempre)

| Papel | No app (menu Calendário) | No Google / Calendário do Mac |
|---|---|---|
| Consultor (`pessoa`) | só a própria agenda (visão privada) | só o calendário dele, com permissão de editar |
| Gestor e administrador da consultoria | a agenda de todos os consultores da consultoria, um calendário por pessoa, liga/desliga | todos os calendários da consultoria, com permissão de editar |
| Central e dono | todas as consultorias (escolhe a consultoria, depois as pessoas) | — (vê pelo app) |

Recorte no banco (RLS), como clientes e check-ins. Uma consultoria nunca vê eventos de outra.

## Conta Google: a da consultoria **(minha)**

Muda o que estava no rascunho ("cada consultor conecta a própria conta"). Motivo: o app já tem **Integrações →
Google** por consultoria (um token guardado no Vault, escopos `calendar` e `drive.file`), e com uma conta só:

- a consultoria é organizadora das reuniões, então gravação e transcrição ficam num lugar só (o Drive da conta da
  consultoria) e o app lê tudo com um token;
- só a conta da consultoria precisa de Google Workspace com gravação do Meet;
- consultor não precisa conectar nada; recebe o convite e vê os calendários compartilhados.

**Compartilhar "igual ao Mac"**: na conta da consultoria o app cria **um calendário por consultor** ("IXC · Simone") e
compartilha (ACL do Google Calendar) com o e-mail do consultor (editar) e com os gestores e administradores da
consultoria (editar). Quem adiciona a conta Google no Calendário do Mac vê exatamente esses calendários, com as
cores, liga/desliga, como qualquer calendário compartilhado. Quando o papel muda, a pessoa sai ou muda de
consultoria, o app ajusta o compartilhamento na próxima sincronização (regra "quando alguém sai").

Escopos a mais no "Conectar com Google": `meetings.space.settings` (liga gravação e transcrição automáticas numa
reunião criada pelo Calendar; não sensível) e `meetings.space.readonly` (lê gravação e transcrição da reunião). Quem
já conectou precisa reconectar uma vez (a tela de Integrações avisa "faltam permissões").

Avisos para o Diego (README): conta da consultoria com Workspace que grave Meet; o app do Google como "Interno" no
Workspace da IXCSoft dispensa a verificação do Google; consultorias com outro domínio (ex.: STI) precisam do app
"Externo" verificado pelo Google por causa dos escopos do Meet. Consultor sem conta Google no e-mail do login recebe
o convite por e-mail, mas não vê o calendário compartilhado.

## O menu Calendário (como o Calendário do Mac)

- Item novo no trilho: **Calendário** (ícone `CalendarDays`), para todos os papéis; animação nova `folhear`
  (a regra do trilho pede uma que ainda não esteja em uso).
- Tela em largura total:
  - **Topo:** "Hoje", ‹ ›, título do período ("Novembro de 2026"), `AbasSegmentadas` Dia · Semana · Mês · Ano,
    botão principal "Novo evento" no fim.
  - **Lateral esquerda:** mini mês (clicar num dia vai até ele); "Minha agenda"; para gestor/admin, "Consultores"
    com um calendário por pessoa (bolinha na cor da pessoa + caixa de marcar, busca quando passar de 15 pessoas,
    "Mostrar todos/nenhum"); para a central, um `Seletor` de consultoria acima. Escolhas guardadas no navegador
    (conveniência).
  - **Dia/Semana:** grade de horas (fuso de São Paulo), linha da hora atual, eventos posicionados pela hora, eventos
    do dia inteiro no alto, sobrepostos lado a lado. **Mês:** grade com até 3 eventos por dia e "+N".
    **Ano:** 12 mini meses com marca nos dias com evento.
  - Cor de cada evento = cor do consultor (paleta fixa de 8 cores, a próxima livre na consultoria). No Google a cor
    é de quem vê: no Mac cada pessoa escolhe a cor de cada calendário compartilhado.
  - Clicar num horário vazio abre "Novo evento" já com dia e hora; clicar num evento abre o detalhe (popover no
    computador, janela no celular) com Editar, Apagar, "Entrar no Meet", "Abrir gravação" e "Pasta da reunião".
  - Celular (390 px): lateral vira gaveta; visão padrão Dia.
- Sem Google conectado na consultoria: o calendário funciona só no app (sem Meet e sem compartilhar), com aviso
  "Conecte o Google em Integrações para criar Meet e ver no Calendário do Mac".
- Arrastar evento para mudar de horário: fora desta entrega.

## Evento — o que guarda e quem faz o quê (CRUD)

Campos: consultor (dono da agenda), cliente (opcional; só clientes que a pessoa vê), título, descrição, início e fim
ou dia inteiro, local, "Criar Meet" (padrão ligado quando há cliente), "Gravar e transcrever" (padrão ligado com Meet),
convidados (e-mail do contato do cliente sugerido; outros e-mails livres, até 20).

| Operação | Consultor | Gestor/admin | Central/dono |
|---|---|---|---|
| Criar | na própria agenda | na de qualquer consultor da consultoria | na de qualquer consultor |
| Consultar (lista no calendário e detalhe) | os seus | os da consultoria | todos |
| Editar | os seus | os da consultoria | todos |
| Apagar | os seus | os da consultoria | todos |

- Apagar pede confirmação e diz o que acontece: o evento sai do app e do Google, os convidados recebem o
  cancelamento; a pasta da reunião (se já existir) **fica** no cliente. Não há "desativar" para evento.
- Mudar o consultor de um evento move o evento para o calendário do novo consultor no Google.
- Cliente arquivado: eventos futuros dele continuam (aviso no detalhe); não aceita evento novo.
- Gravação depende da organizadora (conta da consultoria) ou de alguém da organização entrar; o app avisa isso no
  formulário.

## Sincronização com o Google

- **App → Google, na hora:** criar, editar, apagar e mudar de consultor passam pela Edge Function `agenda`, que grava
  no Google primeiro e depois no banco (se o Google recusar, nada muda e a tela mostra o motivo). Com Meet: o evento
  é criado com Meet pelo Calendar; em seguida o app liga gravação e transcrição automáticas no espaço do Meet
  (`spaces.patch`, `artifactConfig`).
- **Google → app, a cada 5 minutos** (pg_cron chamando a Edge Function `agenda-sincronizar`; botão "Sincronizar agora"
  na tela): por calendário de consultor, leitura incremental (`syncToken`) — evento movido, renomeado, apagado ou
  criado direto no Google/Mac aparece igual no app. Conflito: vale a última mudança do Google; o vínculo com o
  cliente é do app.
- **Compartilhamentos:** a mesma rotina cria o calendário de consultor novo e ajusta as permissões quando alguém
  entra, muda de papel, sai ou muda de consultoria.
- Uma chamada por calendário por rodada (nada de uma por evento); falhas ficam registradas por calendário e
  aparecem para gestor/admin ("Não foi possível sincronizar a agenda da Simone: ...").

## Depois da reunião: a pasta no cliente

- A mesma rotina procura reuniões com Meet já terminadas e ainda sem pasta. Para cada uma: lê a gravação e a
  transcrição do Meet. Quando a transcrição fica pronta (pode levar alguns minutos ou horas), cria a pasta.
- **Pasta da reunião** em Arquivos do cliente: "Reunião 20/11/2026 14:00 — <título>", com:
  - `transcricao.txt` — a fala de cada pessoa com a hora ("14:03 Simone: ...");
  - `documentacao.md` — a documentação da call: título, data e hora, duração, consultor, participantes, link da
    gravação e do evento, e, quando a consultoria tem IA conectada em Integrações, resumo, decisões e próximos passos
    gerados pela IA a partir da transcrição. Sem IA, vai a ficha sem o resumo.
  - A gravação em vídeo fica no Drive da consultoria (arquivo grande); a pasta guarda o link ("Abrir gravação").
- Situação da reunião no detalhe do evento: "Aguardando a transcrição", "Pasta criada", "Sem gravação/transcrição"
  (ninguém gravou, ou passou 48 horas sem ficar pronta), "Erro" com o motivo e "Tentar de novo".
- A reunião também aparece na aba **Agenda** do cliente e no **Histórico** ("Reunião realizada", "Pasta criada").

## Pastas nos Arquivos do cliente

A aba Arquivos ganha pastas (servem para as reuniões e para quem quiser organizar):

| Operação | Quem |
|---|---|
| Criar pasta | quem pode enviar arquivo no cliente |
| Consultar (lista de pastas e arquivos dentro, paginada) | quem vê o cliente |
| Renomear | quem criou, gestor/admin da consultoria, central |
| Apagar | os mesmos; a confirmação diz quantos arquivos vão junto; pasta de reunião avisa que a documentação some |

Enviar arquivo de dentro de uma pasta já o coloca nela; mover arquivo entre pastas: fora desta entrega.

## Banco (resumo)

- `agenda_calendarios`: um por consultor com Google (consultoria, pessoa, id do calendário no Google, cor,
  `sync_token`, última sincronização e erro). Só a Edge Function grava.
- `agenda_eventos`: consultoria, consultor, cliente, título, descrição, início, fim, dia inteiro, local, convidados,
  Meet (link, código), gravar, ids do Google, origem (app/google), situação da reunião, link da gravação, pasta,
  criado por, datas. RLS: consultor vê os seus; gestor/admin, os da consultoria; central, todos. Índices em
  (consultoria, início), (consultor, início), cliente e situação da reunião.
- `cliente_pastas` (cliente, nome, reunião opcional, criada por) e `cliente_arquivos.pasta_id`.
- Eventos e calendários só mudam pelas Edge Functions (`agenda`, `agenda-sincronizar`), porque mexem no Google;
  pastas seguem o caminho dos arquivos de hoje (navegador com RLS; a pasta da reunião é criada pela rotina). Leitura
  pelo navegador com RLS e paginação no banco (só o intervalo visível do calendário e só os calendários marcados).

## Testes

- pgTAP: quem vê e quem grava cada tabela (consultor, gestor, outra consultoria, central).
- Integração: Edge Functions com o Google trocado por um servidor falso local (mesmas respostas do Google), incluindo
  sincronização incremental, compartilhamento e a criação da pasta com transcrição e documentação.
- Tela: visões Dia/Semana/Mês/Ano, lateral por papel, criar/editar/apagar evento, pastas nos Arquivos.
- Conferência no navegador sem Google real; o teste ponta a ponta com Google real fica para quando o Diego
  configurar o app do Google (README explica).

## Detalhes que decidi **(minha)**

- Fuso: tudo em `America/Sao_Paulo` (eventos no Google com esse fuso), como o resto do app.
- O consultor entra como convidado das reuniões (recebe o aviso e entra no Meet sem pedir para entrar); no Mac a
  reunião pode aparecer no calendário dele e no compartilhado — é o preço de entrar direto no Meet.
- Consultoria que conecta o Google depois: a primeira sincronização cria os calendários e manda para o Google os
  eventos futuros que já estavam no app (com Meet se estava marcado). Desconectar o Google: o app para de
  sincronizar, os eventos ficam no app e os calendários ficam na conta Google.
- Evento recorrente criado no Google aparece no app (cada ocorrência), só para ver; editar no Google.
- Evento criado direto no Google/Mac entra no app sem cliente; dá para ligar a um cliente editando no app.
- Testes sem Google de verdade: o núcleo da agenda (`supabase/functions/_shared/agenda/`) não importa nada do Deno e
  recebe o banco e o "Google" por parâmetro; os testes de integração usam o banco local e um Google falso em memória.
- A rotina de 5 minutos: `pg_cron` + `pg_net` chamando `agenda-sincronizar` com um segredo próprio guardado no Vault.

## Fora desta entrega

Arrastar eventos, eventos recorrentes criados pelo app (os que vierem do Google aparecem), salas e recursos,
disponibilidade/"marcar horário" pelo cliente, mover arquivo entre pastas, painéis da central.
