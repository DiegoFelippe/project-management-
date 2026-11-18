# IXC Consult — regras do projeto

Plataforma de gestão de projetos para várias consultorias (React 19 + Vite, Supabase, Vercel).
Como rodar, comandos e publicação: `README.md`. Design e plano: `docs/superpowers/`.

## Plugins e skills de fora: este arquivo vence

Pedido do Diego (2026-11-17), ao instalar o Ponytail e o UI UX Pro Max.

- **Sugestão de plugin ou skill de fora nunca passa por cima deste arquivo.** Em conflito, vale o CLAUDE.md.
- **Ponytail:** "menos código" e "reaproveitar o que existe" valem, mas o que existe aqui são os componentes do projeto:
  campos só de `src/components/campos/` (nunca `<input type="date">` nem `<select>` nativos), `Button`, `Tabela`,
  `JanelaFormulario`. Nunca corta teste, RLS, validação, acessibilidade nem CRUD completo.
- **UI UX Pro Max:** não troca a fonte (só Inter), as cores (as da consultoria, em `src/index.css`), a escala de
  tipografia nem o Padrão Hub. Serve para ideias dentro desses limites.

## CRUD completo: criar, consultar, editar e apagar

Regra do Diego (2026-11-12): **tudo que o app cria tem as quatro operações na tela**, para quem tem permissão.

- **Criar, consultar (lista e detalhe), editar e apagar.** Nada entra só com "criar" e "ver".
- **Ao planejar algo novo**, o design lista as quatro operações e quem pode fazer cada uma. Deixar uma
  delas de fora só com o Diego aprovando, e escrito no design.
- **Apagar sempre pede confirmação** na tela, dizendo o que some junto. Quando apagar quebraria histórico
  ou acesso de outras pessoas, a tela oferece **desativar/arquivar** e explica a diferença.
- **Cada operação tem** a regra no banco (RLS ou Edge Function), teste no banco ou de integração e teste
  de tela, como as que já existem.

## Menu lateral (trilho): sempre animar no hover

- **Todo ícone do trilho tem uma animação ao passar o mouse** (e ao focar pelo teclado). Sem exceção:
  itens do menu, a bolinha da pessoa e o Sair. Pedido do Diego (2026-11-12). O menu não tem itens "em breve"
  (o Projetos saiu em 2026-11-16): só entra no trilho o que já funciona.
- **Item novo no menu:** em `src/components/shell/menu.js`, preencha `animacao` com uma de
  `ANIMACOES_DO_MENU` (`subir`, `balancar`, `pulsar`, `abrir`, `erguer`, `conectar`, `transmitir`, `folhear`, `arrastar`,
  `sair`). Prefira uma que combine com o ícone e que ainda não esteja em uso no trilho (desde o Quadros, com `arrastar`,
  todas estão em uso: item novo pede animação nova).
- **Animação nova:** keyframes `icone-<nome>` + a regra `.group:hover .anim-<nome>` (e `:focus-visible`)
  em `src/index.css`, e o nome em `ANIMACOES_DO_MENU`. O elemento clicável precisa da classe `group`
  e de `data-item-trilho`.
- **No celular (abaixo de md), barra embaixo no lugar do trilho** — pedido do Diego, 17/11 (auditoria, G7):
  `BarraDeBaixo` com até 5 itens do papel (`NA_BARRA_DE_BAIXO` em `menu.js`, na ordem do trilho; consultor: Início,
  Clientes, Calendário, Check-lists, Quadros; gestor e administrador: Início, Clientes, Calendário, Quadros, Usuários;
  central e dono: Início, Clientes, Calendário, Usuários, Consultorias), com o mesmo quadrado e as mesmas animações do
  trilho e a área segura do iPhone (`viewport-fit=cover`). O ☰ da barra de cima (`MenuDoCelular`) tem as outras seções
  do papel, o Meu perfil, o tema e o Sair, também com `group`, `data-item-trilho` e animação. O trilho do computador
  não muda. Item novo no menu: decida se ele entra nos 5 do papel.
- `menu.test.js` e `Trilho.test.jsx` falham se algum item ficar sem animação (no trilho, na barra de baixo e no ☰).
- Com "reduzir movimento" ligado no sistema, as animações param (regra global em `src/index.css`).

## Botões: sempre animados

- **Todo botão anima** ao passar o mouse e ao apertar: sobe 1px com sombra no hover, o ícone dá um
  pulinho, e ao apertar afunda (`active:scale-[0.97]`). Pedido do Diego (2026-11-12).
- **Use sempre o componente `Button`** (`src/components/ui/button.jsx`), que já anima.
- **Botão escrito à mão** (`<button>` fora do `Button`) precisa da classe `botao-animado` e das mesmas
  transições (`hover:-translate-y-px active:scale-[0.97]`).
- Os itens do trilho têm animação própria (seção acima) e são marcados com `data-item-trilho`.
- `src/components/ui/button.test.jsx` varre o código e falha se algum `<button>` ficar sem animação.

## Tela nova: o molde (pedido do Diego, 2026-11-17)

Toda tela nova segue esta ordem e estes componentes (detalhes nas seções abaixo):

1. **Menu** (se for item do trilho): `src/components/shell/menu.js` com uma `animacao` (seção Menu lateral).
2. **Cabeçalho** (`Cabecalho`): título na escala (`text-titulo`), subtítulo e os botões do contexto (principal cheio,
   os outros `outline`).
3. **Barra de filtros** (`BarraDeFiltros`): começa sempre com o ícone e "Filtros"; depois abas
   (`AbasSegmentadas`), busca, filtros e o botão principal no fim. Filtros rodam no banco e voltam para a página 1. No
   celular, os campos vão para a gaveta (`NaGaveta`, com `ativos` e `aoLimpar`; seção Padrão Hub).
4. **Cartões de números** logo abaixo da barra: até 4, com o componente comum dos cartões (`CartoesDeNumeros`, o mesmo
   do Início e do Calendário), contados no banco no recorte de quem vê e seguindo os filtros de consultoria/consultor da
   barra. Animam ao passar o mouse (sobem 1px com sombra e o ícone dá o pulinho, como os botões). O cartão cujo número a
   lista sabe filtrar ganha `destino` e leva ao filtro (seção Padrão Hub). Exceção: as abas
   Quadro, Agenda e Check-ins da página do cliente não têm cartões (pedido do Diego, 17/11 e 18/11), nem a tela Quadros
   do menu (o mesmo quadro; seção Quadro).
5. **Conteúdo:** lista sempre em `Tabela` (paginação de 15 vinda do banco, `ListaVazia`, ações na última coluna);
   Editar abre o formulário preenchido.
6. **Formulário:** `JanelaFormulario` + `SecaoFormulario` (abas `AbasSegmentadas` e 2 colunas quando é grande, como
   o Hub), rodapé Cancelar + botão principal com a ação em andamento ("Salvando…"), campos só de
   `src/components/campos/`, apagar com confirmação dizendo o que some junto.
7. **Layout:** largura toda (nada de `max-w-*` + `mx-auto` no conteúdo), claro e escuro, e a 360 px nada rola para o
   lado (tabelas rolam dentro do cartão).
8. **Sempre:** tipografia da escala (números em colunas com `tabular-nums`), botões animados, CRUD completo, banco com
   RLS e testes (banco, integração e tela) como as telas que já existem.

## Quadro (Kanban)

Design: `docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md` (inclui a "Resposta do Diego"). Quadros
pessoais e de time (menu Quadros): `docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md` (com as
aprovações do Diego e a tabela do CRUD).

- **Quem faz o quê (quadro do cliente):** o consultor do cliente e a gestão (admin e gestor da consultoria) mexem no
  quadro: colunas, cartões, checklist, comentários e anexos. Central e dono só leem. **Apagar cartão:** quem criou ou a
  gestão (os demais arquivam). **Apagar coluna:** só a gestão (`apagar_coluna`, com destino ou apagando os cartões). A
  regra é do banco (RLS e funções `quadro_do_cliente`, `cartoes_do_quadro`, `mover_cartao`...), nunca só da tela.
- **Um quadro por cliente e consultoria:** cliente que volta a uma consultoria reencontra o quadro antigo; a central
  vê os quadros das consultorias anteriores só para ler, pelo seletor "Consultoria".
- **Posição fracionária** (`numeric`, passos de 1024): mover grava só a linha movida entre os vizinhos
  (`mover_cartao`, `mover_coluna`); o banco renumera quando o espaço acaba.
- **Descrição é JSON do TipTap, validada no banco** (nunca HTML): links só `http`, `https` e `mailto`; imagem só do
  balde `quadros`, com o caminho no nó (`<pasta do quadro>/<cartão>/...`) e URL assinada na hora de mostrar (com
  download). Anexos e imagens ficam no balde privado `quadros`, na pasta do quadro (abaixo).
- **Tempo real por canal privado:** o aviso leva só ids, nunca dados; a tela relê pelo banco ao receber o aviso e ao
  `conectou`, `reconectou`, `plano_b` e `sem_acesso` (e quando o acesso muda). O plano B (releitura) roda a cada 30 s
  enquanto o canal não está de pé.
- **As abas Quadro, Agenda e Check-ins do cliente não têm cartões de números** (pedido do Diego, 17/11 e 18/11), nem a
  tela Quadros do menu (o mesmo quadro, que ocupa o resto da tela; decisão 7 do desenho dos quadros pessoais e de time).
- **Cartões lidos por coluna** (50 por vez, "ver mais"): nunca o quadro inteiro de uma vez.
- **Apagar cartão só por `apagar_cartao`** (sem delete direto na tabela): a função devolve os caminhos no Storage e o
  app os tira do balde em seguida. **Cartões seguram o cliente:** apagar cliente com cartões dá 23503 e a tela manda
  arquivar. **Cliente arquivado:** o quadro fica só para ler (o banco recusa a escrita).
- **Comentários:** cada um edita e apaga os seus; a gestão apaga qualquer um. **Anexos:** apaga quem enviou ou a
  gestão; anexo não se edita.
- **Quem vê é uma regra só, `private.vejo_quadro`:** RLS, funções, Storage (balde `quadros`) e o canal do Realtime
  (tópico `quadro:<id>`) passam por ela. Mudou quem vê, muda lá. Ao lado dela, com um ramo por tipo de quadro:
  `mexo_no_quadro`, `gerencio_quadro` (apaga coluna e o que é dos outros) e `administro_quadro` (renomear, arquivar,
  restaurar e apagar o quadro; no do cliente, ninguém).
- **Travas em ordem de id:** quem trava duas colunas (`mover_cartao`, `apagar_coluna`) trava as duas numa consulta só,
  ordenadas por id, antes dos cartões (senão duas pessoas trocando cartões entre as mesmas colunas travam, 40P01).
- **O quadro ocupa o resto da tela e cada coluna rola sozinha** (decisão do Diego, 17/11, como no Trello): a lista de
  cartões da coluna é a área de rolagem do arrasto, então arrastar perto da borda rola a coluna e o cartão cai onde
  aparece. Durante o arrasto a página e a faixa das colunas não rolam (`src/components/quadro/travaDaRolagem.js`); a
  altura vem de `alturaDoQuadro.js` (tela baixa ou celular: a faixa fica com a altura da tela e a página rola até ela).

**Quadros pessoais e de time (menu Quadros).** Pedido do Diego (17/11, "como o Mochi"). A mesma tabela `quadros`, com
`tipo` (`cliente`, `pessoa`, `time`): colunas, cartões, checklist, comentários, anexos e tempo real são os mesmos, e a
tela também (`QuadroKanban`, usado pela aba do cliente e pela tela Quadros).

- **Quadro pessoal:** só a pessoa dele vê e mexe (nem o administrador), em todos os papéis, quantos quiser. Fica **na
  consultoria em que nasceu**: quem muda de consultoria (ou vai para a central) deixa de vê-lo e o reencontra se voltar.
- **Quadro do time:** os membros e o gestor do time (`times.gestor_id`) mexem em colunas e cartões; o administrador da
  consultoria vê e mexe em todos os quadros de time dela. **Qualquer membro cria** quadro do time, mas renomear,
  arquivar, restaurar e apagar são só do gestor do time e do admin (`administro_quadro`; no pessoal, a pessoa). Apagar
  coluna, e cartão, comentário ou anexo dos outros: gestor do time e admin. Responsáveis: membros e gestor do time,
  ativos (o admin só se for membro); no pessoal, só a pessoa. Quem sai do time perde os quadros dele na hora (o canal
  avisa e a tela dela mostra que não tem mais acesso); o que ela fez fica, com o nome dela.
- **Central e dono só têm quadros pessoais** (não estão em times): sem quadro de time e sem o grupo "Dos times". E a
  central **só lê os quadros do cliente**: a leitura direta de `quadros`, `quadro_colunas` e `cartoes` que ela tinha
  vale só para os do cliente; o resto passa pela lista `private.meus_quadros()` (que traz os pessoais dela).
- **Escrita:** o quadro nasce só por `criar_quadro` (com "A fazer", "Em andamento" e "Concluído") e sai só por
  `apagar_quadro` (devolve os caminhos da pasta, que o app tira do balde); renomear, arquivar e restaurar são update
  direto em `nome` e `arquivado_em`, pela regra `administro_quadro`. Tipo e dono não mudam e favorito
  (`quadro_favoritos`) não se edita (aprovado pelo Diego, 17/11). **Arquivado é só para ler** para todo mundo (nem o
  nome muda): quem administra restaura ou apaga. Nome único entre os abertos de cada dono (sem acento e sem
  maiúscula); restaurar com nome repetido diz "Já existe um quadro aberto com esse nome. Renomeie um deles e tente de
  novo." Apagar oferece arquivar ao lado e diz quantas colunas e cartões somem.
- **Quadro segura o time:** apagar time com quadro (aberto ou arquivado) dá 23503 (`quadros_time_id_fkey`) e a tela
  manda apagar os quadros dele antes, em Quadros.
- **Pasta no balde `quadros`:** a do quadro do cliente continua `<cliente>/`; a dos pessoais e de time é
  `quadro/<id do quadro>/` (anexo em `quadro/<quadro>/<cartão>/<uuid>-<nome>`, imagem em `.../<cartão>/imagens/`).
  `private.pasta_do_quadro` (na tela, `pastaDoQuadro` de `src/lib/arquivos.js`) dá a pasta; o banco recusa caminho de
  outro quadro, de outro cartão ou na forma errada para o tipo. A central nunca vê nem tira nada de `quadro/...`.
- **O navegador guarda só ids** (`localStorage` `ixc.quadros.<perfil>`: o último e os 8 recentes, em
  `src/lib/quadrosRecentes.js`), sempre conferidos no banco (`quadro_por_id`, `quadros_por_ids`); o que não volta sai
  da memória. Nome e contagem vêm sempre do banco.
- **Tela `/quadros`** (todos os papéis; no trilho depois de Check-lists, com a animação `arrastar`): sem id abre o último
  quadro (senão o primeiro favorito, de Meus ou Dos times; sem nenhum, "Você ainda não tem quadros." com Novo quadro);
  `/quadros/<id>` abre aquele (o do cliente manda para a página do cliente). Cabeçalho com quem vê, o
  `SeletorDeQuadro` (busca no banco; Favoritos, Recentes, Meus e Dos times), a estrela e o "⋯"; depois a
  `BarraDoQuadro` (sem o seletor Consultoria) e o quadro, sem cartões de números. O quadro aberto é um filho montado
  com `key={quadroId}`: trocar de quadro começa do zero (filtros, janela do cartão, arrasto).

## Padrão Hub: botões, formulários, campos e abas

Pedido do Diego (2026-11-16). Visual de referência: `docs/superpowers/specs/2026-11-16-padrao-hub.md`.

- **Cores continuam as da consultoria** (`--primary` etc. em `src/index.css`); do Hub vem só o layout. **Contraste mínimo
  4,5:1** em todo texto (auditoria, pedido do Diego 17/11): fundo azul com texto branco é `bg-primary-cheio` (no escuro o
  `--primary` é o azul claro, só para texto, foco e barras); texto azul sobre o azul-claro de realce (`bg-primary/10`,
  `bg-accent`: "Hoje", opção escolhida, selos) é `text-primary-texto`; texto sobre a cor da pessoa ou do evento usa
  `corDoTextoSobre` (`src/lib/cores.js`). `src/lib/contraste.test.js` confere os tokens e varre o código.
- **Todo formulário é uma `JanelaFormulario`** (`src/components/comum/JanelaFormulario.jsx`), com o corpo em
  `SecaoFormulario`. Rodapé: **Cancelar** (outline) + botão principal, que mostra a ação em andamento enquanto
  grava ("Salvando…", "Criando…", "Testando…"). O botão de enviar fica no rodapé e liga ao formulário por
  `form="<id>"`. **A janela monta esse rodapé** (auditoria, 17/11): `rotuloEnviar` (+ `rotuloEnviando`, que por padrão é
  "Salvando…") com `form="<id>"`, ou `aoEnviar` quando não há `<form>`; `rodape` só para rodapé diferente (Fechar,
  Testar, mensagem no rodapé). O envio comum (erro, "…ando", fechar ao dar certo) é o `useEnvio(aoConcluir)`
  (`src/components/comum/useEnvio.js`); cartões de opção em rádio são o `CartoesDeOpcao`. **Exceções:**
  `FichaDoConsultor` não é um `<form>` (o botão chama `enviar` e o Enter nos campos de texto salva, porque as
  ausências têm o formulário delas) e o formulário em linha de `GerirAusencias` tem o próprio botão dentro dele.
  `VerificacaoDoPerfil` e `CadastroDoAutenticador` (`src/components/verificacao/`, na
  aba Acesso da `FichaDoConsultor` no modo próprio) têm formulário em linha com o próprio botão, como `GerirAusencias`.
- **Exceção registrada: `JanelaDoCartao`** (Quadro) grava campo a campo, com o estado "Salvando… / Salvo / Erro ao
  salvar" e sem botão Salvar; ao fechar com algo não salvo, pergunta. O rodapé tem Fechar, e Arquivar/Apagar ficam só
  com o ícone no celular (`max-sm:sr-only`).
- **Meu perfil é a própria `FichaDoConsultor`** (pedido do Diego, 17/11): a bolinha do trilho e a própria linha em
  Usuários abrem `MinhaFicha` (a ficha no modo próprio, `pessoa.id === perfilDeQuem.id`). A pessoa muda só o que o
  banco aceita dela (nome, foto, cor, contato, senha e o app autenticador); o resto aparece só para ler.
- **Campos só de `src/components/campos/`**: `Seletor`, `CampoData`, `CampoHora`, `CampoNumero`, `Caixa`, `Chave`.
  **Nunca** `<select>` nem `type="date|time|number|datetime-local"` nativos.
- **`Seletor` com muitas opções** usa `buscar` (busca no banco), nunca a lista inteira. Para escolher **várias de uma
  vez**, `multiplo` (a lista fica aberta e cada clique marca ou desmarca; as escolhidas aparecem fora do campo, com
  "Tirar", como `EscolhaDePessoas` no Novo time e em "Colocar pessoas") — pedido do Diego, 18/11 (usabilidade).
- **Todo menu do trilho abre com `BarraDeFiltros`** (Início, Clientes, Calendário, Check-lists, Quadros — a
  `BarraDoQuadro` do cliente, sem o seletor Consultoria —, Times, Usuários, Consultorias, Integrações), e a barra **sempre começa com o ícone e a palavra "Filtros"** (como no Calendário; o componente já
  traz, não repita na tela). Pedido do Diego (2026-11-17). Nada de prop para esconder o rótulo. Depois vêm abas,
  busca, filtros e o botão principal no fim. Tela sem filtro natural ainda ganha a barra com o recorte que faz
  sentido (Início: o período — Mês com a `NavegacaoDoMes`, Últimos 30/90 dias, Este ano ou Personalizado com De e
  Até, no endereço; Times: busca pelo nome; Integrações: Todas/Conectadas/Não conectadas). As abas são
  `AbasSegmentadas`; `comoAbas` só nas abas de página, como as do cliente. Times: "Novo time" é o botão principal
  da barra (administrador e gestor), e o dono vê a consultoria no lugar dele. **Toda tela do menu: barra de filtros
  (ícone + "Filtros") → cartões de números → conteúdo** (exceção: as abas Quadro, Agenda e Check-ins da página do cliente
  não têm cartões, pedido do Diego, 17/11 e 18/11, nem a tela Quadros, que é o mesmo quadro). Os cartões (pedido do
  Diego, 17/11) são o
  `CartoesDeNumeros` (`src/components/comum/`): até 4, logo depois da barra, com "—" enquanto carregam, **contados no
  banco** por uma função por tela (`indicadores_de_clientes`, `_de_times`, `_de_usuarios`, `_de_consultorias`,
  `_de_integracoes`; Check-lists: `indicadores_de_checkins` no Andamento e `indicadores_de_modelos` em Modelos; Início e
  Calendário: `painel_do_inicio` e `indicadores_da_agenda`), no recorte de quem vê e
  seguindo os filtros de consultoria/consultor (e o período) da barra; situação/abas e busca não mudam os cartões. Leitura
  em `src/data/indicadores.js`, uma por tela, pelo `useLeitura`. **Os cartões animam ao passar o mouse**: sobem 1px
  com sombra e o ícone dá o pulinho dos botões (`.cartao-animado` em `src/index.css`; "reduzir movimento" para). No
  celular o cartão fica mais baixo: o ícone, menor, ao lado do rótulo (linha da altura de dois rótulos) e o número
  embaixo, na largura toda — pedido do Diego, 17/11 (auditoria, G6). Teste de tela com `cartoesAbaixoDaBarra`
  (`src/test/cartoes.js`).
- **Barra de filtros no celular** — pedido do Diego, 17/11 (auditoria, G6): abaixo de 640 px a `BarraDeFiltros` mostra
  o botão "Filtros" ("Filtros (2 ativos)" com filtro fora do padrão), a busca e a ação principal; os campos marcados com
  `NaGaveta` (filho direto da barra) abrem numa gaveta de baixo com Limpar (desligado sem filtro ativo) e Ver resultados
  (os filtros valem na hora). A tela passa `ativos` (quantos da gaveta estão fora do padrão) e `aoLimpar`. Abas que
  trocam a tela (Consultorias: Ocupação do mês) ficam na barra; abas que filtram a lista vão para a gaveta. "Limpar
  filtros" escrito na barra fica só no computador (`max-sm:hidden`). Sem campos na gaveta, fica o rótulo "Filtros".
- **Cartão que leva ao filtro** — pedido do Diego, 18/11 (usabilidade, U5): `CartoesDeNumeros` aceita `destino` por
  cartão (a função que aplica o filtro; a lista volta à página 1) e `ativo` (o do filtro que vale, `aria-current`). O
  cartão vira botão ("Aguardando consultor: 16. Mostrar na lista"), com foco à vista e o afundar dos botões. Só ganha
  destino o número que a lista filtra no banco, com o mesmo recorte (Clientes: as situações; Usuários: Pessoas ativas e
  Sem tipo de consultoria; Consultorias ativas; Modelos ativos); os outros continuam só número.
- **Botões do cabeçalho da página** (`Cabecalho`): a ação principal do contexto é `default` (cheia, `--primary`) e as
  demais são `outline`, tamanho padrão, com ícone. Apagar no cabeçalho é `outline` com o realce de perigo no hover.
  Nas linhas de tabela as ações são a `AcaoDaLinha` (seção Listas); `ghost sm` com texto só para a ação principal única
  da linha. Ações que servem aos dois lugares (`AcoesDaLinha`, `BotaoCheckin`) recebem `noCabecalho` e usam
  `estiloDaAcao` (`src/components/clientes/estiloDaAcao.js`). Página de detalhe: `Cabecalho` com `voltarPara`
  (`{ caminho, rotulo }`) põe o "← Lista" em cima; nada de link de voltar à mão — pedido do Diego, 17/11 (auditoria).
- **Página do cliente:** o título fica sozinho no topo; abas e ações ficam numa barra no estilo da `BarraDeFiltros`
  (abas à esquerda, botões à direita) — pedido do Diego, 17/11.
- **Mês sempre pela `NavegacaoDoMes`** (`maximo` trava o Próximo); nunca montar Anterior/Próximo de mês à mão.
  `src/components/comum/navegacaoDoMesVarredura.test.js` falha se `deslocarMes` aparecer fora dela.
  **Exceção: o Calendário.** O "Hoje ‹ ›" dele anda por semana ou por mês, como o Hub, conforme a visão, e por isso
  não usa a `NavegacaoDoMes`.
- **Testes que guardam isto:** `src/components/campos/camposNativos.test.js` (varre `src/` atrás de campo nativo),
  `src/components/ui/button.test.jsx` e `src/components/comum/formulariosEnvio.test.jsx`.

## Listas: sempre em tabela, e Editar abre o formulário preenchido

- **Toda lista de itens é uma tabela no padrão da tela Usuários** (pessoas, times, consultorias, pessoas
  do time e o que vier). Pedido do Diego (2026-11-12). Grade de cartões não serve para lista.
- **Use o componente** `Tabela` (`src/components/comum/Tabela.jsx`) com `Linha`, `Celula` e
  `CelulaAcoes`, e `ListaVazia` quando não houver nada. A tabela tem nome (`rotulo`), uma linha por item
  e as ações da linha na última coluna (Editar, Desativar, Apagar...).
- **Ações da linha: `AcaoDaLinha`** (`Tabela.jsx`) — pedido do Diego, 17/11 (auditoria). Só o ícone, com o nome no
  `aria-label` e no `title`, **sempre na mesma ordem**: a que não vale para a linha fica com `visivel={false}` e guarda o
  lugar (o lápis nunca muda de lugar). Exceção: a ação principal única da linha (Conectar, Mandar para consultoria,
  Escolher consultor, Fazer check-in) tem texto (`ghost sm`), à esquerda dos ícones. Quem só olha (nenhuma ação em linha
  nenhuma) fica sem a coluna (`semAcoes`). No celular a primeira coluna tem 160 px no mínimo e as ações não ficam fixas.
  **No máximo 3 ícones;** as ações raras (reenviar convite, mover, desativar...) vão para um "⋯" no fim da linha (o
  `MenuDeAcoes` comum), que só aparece quando a linha tem alguma, mas guarda o lugar (como em Usuários). A tabela cabe
  na área de conteúdo de uma tela de 1440 px (cerca de 1.317 px), medido no navegador com o pior caso de ações: mais
  larga, a coluna de ações fixa cobre a última coluna de dados.
- **Editar abre um formulário (janela) com o item daquela linha já preenchido.** Salvar atualiza a
  lista. O mesmo formulário serve para a tela de detalhe, quando houver.
- **Teste de tela para cada lista:** a tabela pelo nome e o Editar abrindo com os dados da linha
  escolhida (exemplos em `src/pages/Times.test.jsx` e `src/pages/Consultorias.test.jsx`).

## Escala: pensar sempre em milhares de registros

Regra do Diego (2026-11-12): **o sistema é pensado como um software grande, com milhares de pessoas,
times e consultorias.** Nada pode depender de "são poucos registros".

- **Toda lista em tabela tem paginação quando passa de 15 registros**: 15 por página, com
  "1–15 de 230" e Anterior/Próxima (`Paginacao`, dentro da `Tabela`, prop `paginacao`).
- **A paginação vem do banco**: `range()` com `count: 'exact'` (ajudante `faixa()` em
  `src/data/paginar.js`), devolvendo `{ itens, total }`. Nunca carregar tudo e fatiar no navegador. Na tela, a lista
  usa `useListaPaginada(ler, parametros)` (`src/lib/useListaPaginada.js`): filtro novo volta à página 1, página que
  sumiu volta à 1, resposta velha é descartada; nada de efeito de leitura escrito à mão — pedido do Diego, 17/11
  (auditoria).
- **Filtro, busca e ordenação rodam no banco** (`eq`, `ilike`, `order`), e mudar o filtro volta para
  a página 1. Totais e resumos saem de `count` no banco, não de somar a lista na tela.
- **Nada de buscar a lista inteira de outra tabela só para contar ou mostrar uma amostra**: use
  `relacao(count)` e `limit` no embutido (ex.: rostos do time = 4 primeiros + total).
- **Sem chamada ao banco por item da lista** (N+1): embutir na mesma consulta ou mandar em lote.
- **Toda coluna usada em filtro, ordenação ou junção tem índice** (migração junto com a tela).
- **Seletor com muitas opções** (ex.: escolher pessoa) carrega só o necessário (id e nome); quando
  passar de centenas, vira busca no banco.
- **Teste de tela da paginação** em cada lista: some com 15 ou menos, aparece com mais, e Próxima
  pede a página 2 ao banco.

## Tipografia: uma fonte, uma escala

Pedido do Diego (2026-11-16). Design: `docs/superpowers/specs/2026-11-16-tipografia-design.md`.

- **Fonte única: Inter**, servida pelo próprio app (`@fontsource-variable/inter`), com a do sistema de reserva. Sem
  fonte condensada.
- **Tamanho só pela escala nomeada** (definida em `src/index.css`): `text-titulo` (título da página), `text-destaque`
  (número grande dos indicadores), `text-janela` (título de janela ou bloco grande), `text-subtitulo` (título de
  cartão, subtítulo da página), `text-corpo` (texto, tabelas, botões, campos), `text-rotulo` (rótulo de campo, texto de
  apoio, abas), `text-legenda` (dicas, datas pequenas, texto de gráfico), `text-mini` (rótulo de seção, contadores,
  nomes do trilho). Escolha pelo **papel** do texto, não pelo tamanho mais próximo. Peso e `tabular-nums`
  (números comparados em coluna) vão na classe, ao lado.
- **Proibido fora de `src/index.css`:** `text-[Npx]`, `text-xs/sm/base/lg/xl/2xl/3xl`, `font-stretch` e
  `font-family` (nem `font-mono`). Texto de SVG (gráficos) usa `fontSize={TAMANHO.legenda}` etc. de `src/lib/tipografia.js` e nunca
  fica abaixo de 11 px na tela. Escala nova: token em `src/index.css`, `src/lib/tipografia.js` e `src/lib/utils.js`.
- **Peso de cada papel** (tabela do design): `titulo` 700, `destaque` 700, `janela` 700, `subtitulo` 600 (400 no
  subtítulo da página), `corpo` 400 (600 nos botões), `rotulo` 500, `legenda` 400–500, `mini` 600.
- **Campos de digitar** (`<textarea>`, campos internos) usam a classe `.texto-de-campo` (o `.input` tem a mesma regra):
  16 px no celular (o iPhone não dá zoom) e `text-corpo` a partir de `sm`. Em campo de digitar, tamanho da escala só com
  `sm:`; sem o prefixo, a classe vence a `.texto-de-campo` e o iPhone volta a dar zoom.
- `src/components/comum/tipografiaVarredura.test.js` varre `src/` e falha com arquivo:linha; `tamanhoNoCelular.test.jsx`
  guarda os campos.

## Gráficos

Design: `docs/superpowers/specs/2026-11-17-graficos-do-inicio-e-do-cliente-design.md` (protótipo aprovado:
`docs/prototipo/graficos-poc.html`).

- **Sem biblioteca de gráfico** (recharts mediu 138 KB gzip): todo gráfico usa os componentes de
  `src/components/graficos/` — `CartaoDeGrafico` (título, leitura, legenda, estados), `GraficoDeColunas`,
  `GraficoDeLinha`, `BarrasHorizontais`, `MiniBarra`, `Medidor`, `BarraSegmentada`, `DiasComCheckin`, com a `Dica` e a
  `Legenda` deles. Gráfico novo reaproveita essas peças; peça nova entra lá, com teste.
- **Cores só por `--grafico-*`** (`src/index.css`, claro e escuro; nomes curtos em `graficos/cores.js`): nada de hex
  nem `--primary` direto no gráfico. Série, acima, folga e referência seguram 4,5:1 sobre o cartão
  (`src/lib/contraste.test.js`); vermelho e âmbar sempre com ícone e o número escrito; texto nunca na cor da série.
- **SVG na largura real** (`useLargura`, sem `viewBox` que estica) e texto do SVG só com `fontSize={TAMANHO.legenda}`
  (11 px) ou maior; rótulos do eixo X com 44 px entre eles (sempre o último); a 360 px nada rola para o lado.
- **Todo gráfico tem visão em tabela** ("Ver em tabela", com os mesmos números) e **dica no mouse, no toque e no
  teclado** (o SVG é `role="group"` com o nome do gráfico; marca focável com `aria-label`; na linha, um alvo só e as
  setas ← →; Esc fecha). Texto da dica é texto do React, nunca HTML montado.
- **A leitura (frase do gráfico) usa só números do banco** ou a lista inteira que o gráfico mostra, nunca uma amostra:
  as regras ficam em `src/lib/frasesDosGraficos.js`, com teste. A variação dos cartões ("▲ 12% vs out.") é
  `src/lib/variacao.js` + `rotuloDaComparacao` (`src/lib/periodo.js`), com o período anterior vindo do banco.

## Agenda (Calendário)

Design: `docs/superpowers/specs/2026-11-16-calendario-design.md` (decisões da construção no fim).

- **Quem vê o quê:** o consultor vê a própria agenda e os eventos para os quais foi convidado; gestão (admin e gestor)
  vê a da consultoria; central e dono veem todas. Uma consultoria nunca vê eventos de outra. A visão é do banco
  (RLS e `eventos_do_periodo`), nunca recortada na tela.
- **Google da pessoa só no Vault.** O token de cada pessoa fica no Vault; o navegador nunca o vê (só "conectado" e o
  e-mail da conta).
- **Escrita só por Edge Function:** `agenda` (criar, editar, apagar, responder), `google-pessoa` (conectar e
  desconectar) e `reunioes-depois` (pasta com gravação e transcrição, chamada pelo `pg_cron`). O navegador só lê.
- **O núcleo fica em `supabase/functions/_shared/agenda/`, sem imports do Deno**, e é testado com o Google falso
  (`npm test`), sem rede.
- **Edge Function NOVA no Supabase local** exige `npx supabase stop && npx supabase start` (faça antes um backup com
  `pg_dumpall`; os dados ficam). `npm run functions:reiniciar` só recarrega as que o runtime já conhece.
- **Agenda dentro do cliente** (pedido do Diego, 17/11): a aba Agenda usa o mesmo calendário do menu
  (`CalendarioDaAgenda` com o cliente), recortado pelo cliente e **só com os eventos dele** — sem cartões de números (as abas Quadro,
  Agenda e Check-ins do cliente não os têm, pedido do Diego, 17/11 e 18/11), a barra não tem consultor/consultoria/cliente, "Mostrar" tem reuniões e feriados e "Novo
  evento" abre com o cliente travado. Embaixo do calendário não há nada (nem detalhe do dia nem próximos 7 dias): a troca
  de visão ganha uma 4ª, **"Todos"** (só no cliente), com a tabela "Eventos do cliente" — todos os eventos dele, de todas
  as datas (15 por página, do mais novo para o mais antigo, `eventos_do_cliente` no banco), no lugar da grade e sem o
  "Hoje ‹ ›" — pedido do Diego, 17/11. Check-ins ficam na aba Check-ins e o histórico na aba Histórico (que traz
  "Reunião realizada" e "Pasta da reunião criada").

## Check-list e modelos de check-in

Design: `docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md` (com as aprovações do Diego). Pedido do Diego
(17/11): a Central ou a gestão monta o modelo, aplica no cliente, e o consultor segue como check-list.

- **Quem faz o quê** (regra do banco, nunca só da tela): **modelos** — a Central cria, edita, arquiva e apaga todos (para
  todas as consultorias ou para uma); o administrador e o gestor, só os da própria consultoria (os da Central eles
  duplicam e adaptam); o consultor só lê. **Check-list do cliente** — a Central e a gestão aplicam, trocam, tiram e
  mudam o início dos prazos; **só o consultor do cliente marca** as tarefas e escreve a nota (a Central e a gestão
  acompanham, só leem; o gestor só marca se for o consultor do cliente). Cliente arquivado: só leitura.
- **Escrita só por funções do banco** (`salvar_modelo`, `aplicar_modelo`, `mudar_inicio_do_checklist`, `tirar_modelo`,
  `marcar_tarefa`, `anotar_tarefa`); direto na tabela, só arquivar, reativar e apagar modelo (pela RLS). A aba do cliente
  vem numa leitura só (`checklist_do_cliente`, até 500 tarefas). Na tela: `src/data/modelos.js` e
  `src/data/checklists.js`.
- **Sem ciclo pela ordem:** "depende de" só aponta para tarefa que vem antes na lista do modelo (da mesma etapa ou de
  uma anterior). O banco recusa o resto (`dependencia_invalida`) e o editor mostra o erro antes de salvar
  (`src/components/modelos/modelo.js`). Toda seta anda para trás: nem o modelo nem a cópia têm ciclo.
- **Salvar regrava o modelo inteiro numa chamada**, com o `atualizado_em` que o editor leu: se alguém salvou no meio, o
  banco recusa (`modelo_mudou`) em vez de apagar o que a outra pessoa fez. Modelo arquivado não se edita nem se aplica.
  Modelo em uso (com check-list ativo) não se apaga (`modelo_em_uso`): arquiva. Limites: 50 etapas, 500 tarefas e 30
  dependências por tarefa.
- **Aplicar copia:** o cliente recebe etapas, tarefas e dependências; o "dia N" vira data (início + N, dias corridos;
  "hoje" é o dia em São Paulo). Editar, arquivar ou apagar o modelo depois nunca muda um check-list.
- **Um check-list ativo por cliente.** Trocar encerra o ativo e começa outro do zero; tirar encerra sem pôr outro; o
  encerrado fica como histórico (nunca se apaga) e segura o cliente (apagar cliente com check-list dá 23503 e a tela
  manda arquivar). **Cliente que muda de consultoria (ou volta à Central) tem o check-list ativo encerrado na hora**
  (gatilho no banco, `cliente_movido`): a consultoria nova começa sem modelo e o antigo não volta.
- **O que entra no check-in:** tarefa marcada pelo consultor com o check-in aberto **neste** cliente entra no resumo dele
  (`checkin_tarefas`, com o título copiado); desmarcar com ele aberto tira. Sem check-in aberto (ou com ele em outro
  cliente) a tarefa fica feita, fora de uma sessão. O check-out mostra "Tarefas marcadas nesta sessão" e, com "O que foi
  feito" vazio, já vem com "Tarefas concluídas: A; B."; apagar o check-in não desmarca as tarefas.
- **"Não se aplica"** (pedido do Diego, 18/11; design, "Acréscimo de 18/11"): terceiro jeito de fechar uma tarefa, ao
  lado de "feita" (`estado = 'nao_se_aplica'`). Marca quem marca "feita" (só o consultor do cliente, pela janela da
  tarefa, com ou sem check-in) e vale para obrigatória. **Bloqueada pode ser "não se aplica"; as que dependem dela
  esperam as dependências dela** (pedido do Diego, 18/11): a cadeia — a dependência feita libera; a que não se aplica
  só libera quando nenhuma pendente fica atrás dela (`private.nao_se_aplica_espera`; em `checklist_do_cliente`, a CTE
  recursiva `presas`), e a tela mostra o que a tarefa espera de verdade ("espera Tarefa A"). Ex.: C depende de B, B de
  A; B não se aplica com A pendente: C espera A. Voltar para a fazer (Reabrir) tira o motivo e grava
  `tarefa_reaberta` no Histórico. **Trocar o motivo = reabrir e marcar de novo** (o CRUD do motivo: marcar de novo com
  outro motivo dá `ja_nao_se_aplica`). **Motivo obrigatório** (1 a 500 letras, `motivo_obrigatorio` 22023), na coluna
  `motivo`, à parte da nota (a nota se edita sem mexer no motivo); quem e quando ficam em `feita_por`/`feita_em`, e o
  Histórico ganha a linha `tarefa_nao_se_aplica` (tarefa e motivo — e a tarefa da `tarefa_reaberta` — só para a Central
  e a consultoria do check-list). **Resolvida = feita ou não se aplica:** conta no % e no Andamento, mas aparece à parte
  ("4 de 5 resolvidas: 3 feitas, 1 não se aplica"; "2 não se aplicam") e nunca entra em atrasadas, "vencem em 7 dias",
  próximo vencimento nem vira a próxima (no banco, pendente = `estado in ('a_fazer', 'andamento')`, o predicado do
  índice das pendentes). Com o check-in aberto, entra em
  `checkin_tarefas` com estado e motivo, e o check-out traz "Não se aplica: <tarefa> (<motivo>)". Visual: cinza com o
  ícone `Ban` (nunca o check verde) na lista, no fluxograma, nos chips, na janela e na legenda; "Mostrar" ganha a aba
  "Não se aplica" quando há alguma.
- **Uso no recorte de quem vê:** "N clientes que você vê usam" (a Central conta todos). Uma consultoria nunca vê modelos,
  check-lists, clientes ou nomes de outra; o Histórico só diz o nome do modelo para a Central e para a consultoria dele.
- **Menu Check-lists** (`/checklists`; `/checkins` redireciona com a mesma `?aba=`; "Check-in" fica só para as horas,
  na aba Check-ins do cliente — pedido do Diego, 17/11, auditoria G3), todos os papéis: abas Andamento (o consultor vê
  só os clientes dele) e Modelos, cada
  uma no molde (barra → cartões → `Tabela` de 15 vinda do banco). Com uma seção só, a página não mostra abas (pedido
  do Diego, 17/11).
- **Exceções aprovadas pelo Diego (17/11, "Pode ser assim"):** as tarefas do check-list do cliente não se criam nem se
  apagam uma a uma (vêm do modelo: muda-se o modelo e troca); o check-list é uma visão de trabalho (cartões por etapa e
  fluxograma), não uma `Tabela`; e os filtros Todas/Pendentes/Feitas e Deitado/Em pé rodam na tela (o check-list
  inteiro já vem numa leitura, porque o fluxograma precisa dele todo).
- **Fluxograma sem biblioteca** (`src/components/checkins/Fluxograma.jsx`): desenho calculado uma vez por mudança, SVG
  com os tokens de cor e texto de no mínimo 11 px, rolando dentro do cartão; no celular começa "Em pé".
- **Exemplo local:** `npm run exemplo:local` cria dois modelos da Central (só para a Consultoria Exemplo) e um da
  Consultoria Exemplo, e aplica "Gestão financeira" no "Provedor Teste Navegador" com tarefas feitas; rodar de novo não
  muda nada.

## Layout

- Telas internas ocupam a largura toda: nada de `max-w-*` + `mx-auto` no conteúdo da página.
  Limite só campos pequenos (um select, uma janela). Em telas largas, grades ganham colunas.
- Visual "claro e azul" (cores em `:root` de `src/index.css`, contraste mínimo 4,5:1: auditoria, pedido do Diego
  17/11); a logo da IXC Consult é quadrada, sem cantos arredondados.

## Dados do Diego: nunca apagar sem perguntar

- **Nada que apague dados roda sem o Diego confirmar antes**, nem no Supabase local: `supabase db reset`,
  apagar registros, limpar o Storage, recriar banco ou volume do Docker. Pedido dele (2026-11-12), depois
  de um `db reset` ter apagado cadastros feitos à mão.
- **Migração nova:** `npx supabase migration up` (aplica só o que falta, sem apagar nada).
- Os testes de integração só apagam o que eles mesmos criaram (`limparTudo`); o pgTAP roda em transação.

## Clientes

- **A central cadastra e manda; a consultoria escolhe o consultor** (administrador ou gestor, pela menor
  ocupação). A central nunca escolhe o consultor.
- **Check-in é de quem trabalhou** e fica na consultoria daquele momento; mudança de consultor, consultoria ou
  arquivamento com check-in aberto fecha o check-in na hora.
- **Uma consultoria nunca vê clientes, horas ou nomes de outra.** Quem não é da central só alcança dados de
  colegas pelas funções do banco, não por leitura direta.
- **A busca de Clientes passa por cima da situação** (pedido do Diego, 18/11, usabilidade): com algo na busca, a lista
  procura no banco em todas as situações (a central também nos arquivados, `aba: 'qualquer'`; a gestão nas da
  consultoria; o consultor continua nos dele), paginada, diz "Buscando em todas as situações" e mostra a situação de
  cada linha. Sem busca, vale a situação escolhida, e a lista vazia diz o próximo passo com "Ver" (17/11, auditoria).
- **Ocupação, capacidade, sugestões e o painel do Início vêm do banco**: `consultores_por_ocupacao`, `consultorias_por_ocupacao`,
  `ocupacao_das_pessoas` (a lista de Usuários) e `painel_do_inicio` (os números do Início). Nunca recalcular na tela.

## Segurança

- A chave secreta do Supabase nunca vai para `src/` nem para o git; o navegador usa só a publicável.
- Toda tabela nova: RLS ligado, `GRANT` explícito só para `authenticated`, recorte por consultoria
  (funções em `private`) e teste em `supabase/tests/database/`.
- Criar login, papel ou consultoria só pelas Edge Functions (`supabase/functions/`).
- Fotos e logos ficam no Storage (buckets `fotos` e `logos`), na pasta do dono do arquivo
  (`<id>/<uuid>.webp`). Quem pode mudar: `private.posso_mudar_foto` e `private.posso_mudar_logo`.
