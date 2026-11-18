# Quadros pessoais e de time no menu — design

Data: 2026-11-17. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes`.
Referências: o Kanban do Hub (Mochi), resumido em `.superpowers/sdd/avulsos/kanban-hub-inventario.md` (seções Quadros,
Colunas, Cartões); o quadro do cliente, já pronto (`docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md`,
plano `docs/superpowers/plans/2026-11-17-kanban-do-cliente.md`, registro `.superpowers/sdd/2026-11-17-kanban-do-cliente/progress.md`).
Plano de construção: `docs/superpowers/plans/2026-11-17-quadros-pessoais-e-de-time.md`.

## Pedido do Diego (e o que ele aprovou)

- 17/11: "Implemente o quadro kanban como menu igual ao do Mochi. Aonde dá a possibilidade de ter um quadro pessoal ou
  vários quadros pessoais e um quadro para o time ou vários quadros para o time. No menu lateral."
- 17/11 (21:52), **"Pode seguir"** para esta proposta (aprovada):
  - **Menu:** item novo "Quadros" no trilho, para todos os papéis, com animação própria no hover. A tela abre no último
    quadro usado. No topo, um seletor de quadros com busca no banco e grupos **Favoritos**, **Recentes**, **Meus**
    (pessoais) e **Dos times**; quantos cartões cada quadro tem; estrela de favorito (tabela própria). Menu "⋯": Novo
    quadro, Arquivados, Renomear, Arquivar, Apagar. "Novo quadro": nome (até 80) + "Só eu" / "Um time" (e qual time).
  - **Quem vê e mexe:** quadro pessoal — só a pessoa dele vê e mexe (nem o administrador); vários por pessoa. Quadro do
    time — os membros e o gestor do time mexem em colunas e cartões; renomear, arquivar e apagar só o gestor do time e o
    administrador da consultoria; vários por time. Uma consultoria nunca vê os quadros de outra. Central e dono só têm
    quadros pessoais (não estão em times).
  - **Dentro do quadro:** o mesmo Kanban do quadro do cliente (colunas, arrastar com colunas que rolam sozinhas, janela
    do cartão com descrição, checklist, comentários e anexos, tempo real). Responsáveis: os membros do time no quadro
    do time; só a própria pessoa no quadro pessoal.
  - **Não muda:** o quadro de cada cliente continua na aba Quadro do cliente.
  - **Depois (fora):** mandar cartão para outra pessoa, "acompanhar" com avisos, etiquetas, capa.

## Objetivo, e o que seria falhar

- Cada pessoa organiza o próprio trabalho em quantos quadros quiser, e cada time tem os seus quadros, no menu
  lateral, com o mesmo Kanban que já existe no cliente.
- Falhar seria: um quadro pessoal aparecer para outra pessoa (admin, gestor, central ou dono, por qualquer caminho:
  tabela, função, arquivo no Storage, canal do tempo real, favorito, contagem); quem saiu do time continuar mexendo; o
  quadro do cliente quebrar com a mudança; anexos de um quadro caírem na pasta de outro; o seletor ficar lento com
  milhares de quadros; a tela abrir num quadro que a pessoa não pode mais ver.

## Metas, o que não é meta e o que não pode acontecer

**Metas**
- Quadros pessoais (vários por pessoa, todos os papéis) e de time (vários por time), com o CRUD completo do quadro:
  criar, ver (seletor e abrir), renomear, arquivar/restaurar e apagar.
- Dentro do quadro, tudo o que o quadro do cliente já faz, reaproveitando os mesmos componentes e as mesmas funções do
  banco (cartões, colunas, checklist, comentários, anexos, tempo real).
- Seletor com busca no banco, favoritos (no banco), recentes e último quadro (no navegador), janela de quadros
  arquivados em `Tabela`.

**Não é meta (fica para depois)**
- Mandar cartão para outra pessoa, "acompanhar" com avisos, etiquetas, capa (aprovado pelo Diego como "depois").
- Mover cartão de um quadro para outro; mudar o dono de um quadro (pessoal ↔ time, ou de um time para outro).
- Seleção em lote na janela de arquivados (o Mochi tem); limite de quadros por pessoa ou por time; lista de quadros na
  página do time.

**Não pode acontecer (antimetas)**
- Mudar o comportamento do quadro do cliente: quem vê, quem mexe, a central lendo os quadros de consultorias anteriores,
  os caminhos no Storage, o tempo real. Os testes que existem do quadro do cliente passam sem mudar.
- A central ou o dono enxergarem quadro pessoal de alguém, ou quadro de time.
- Guardar nome de quadro (ou qualquer dado) no navegador: o navegador guarda só ids, e o banco confere sempre.

## Quem faz o quê

A regra é do banco (RLS e funções), nunca só da tela. Quadro **arquivado** é só para ler para todo mundo: ninguém mexe
em colunas, cartões, checklist, comentários ou anexos; quem administra restaura ou apaga.

### Quadro pessoal

| Ação | A pessoa do quadro | Qualquer outra pessoa (colega, gestor, admin, central, dono, outra consultoria) |
|---|---|---|
| Criar quadro pessoal | sim (todos os papéis) | — (cada um cria os seus) |
| Ver (seletor, abrir, arquivados, contagem) | sim | não (nem saber que existe) |
| Renomear, arquivar, restaurar, apagar o quadro | sim | não |
| Colunas: criar, renomear, cor, ordem, "concluídos" | sim | não |
| Apagar coluna | sim | não |
| Cartões: criar, editar, mover, arquivar, restaurar | sim | não |
| Apagar cartão | sim | não |
| Ser responsável | só ela | — |
| Comentar; editar e apagar comentário | sim | não |
| Anexar; apagar anexo | sim | não |
| Marcar como favorito | sim | não |

### Quadro do time (time T da consultoria C)

| Ação | Membro de T | Gestor de T | Administrador de C | Outra pessoa de C (gestor de outro time, consultor fora de T) | Central e dono | Outra consultoria |
|---|---|---|---|---|---|---|
| Criar quadro de T | sim | sim | sim | não | não | não |
| Ver (seletor, abrir, arquivados, contagem) | sim | sim | sim | não | não | não |
| Renomear, arquivar, restaurar, apagar o quadro | não | sim | sim | não | não | não |
| Colunas: criar, renomear, cor, ordem, "concluídos" | sim | sim | sim | não | não | não |
| Apagar coluna | não | sim | sim | não | não | não |
| Cartões: criar, editar, mover, arquivar, restaurar | sim | sim | sim | não | não | não |
| Apagar cartão | os que criou | todos | todos | não | não | não |
| Ser responsável | sim | sim | só se for membro de T | não | não | não |
| Comentar; editar o próprio; apagar | os próprios | os próprios; apaga qualquer um | os próprios; apaga qualquer um | não | não | não |
| Anexar; apagar anexo | sim; os que enviou | sim; todos | sim; todos | não | não | não |
| Marcar como favorito (só para si) | sim | sim | sim | não | não | não |

"Gestor de T" é o `times.gestor_id` (que pode não estar em `time_membros`). "Membro de T" é quem está em
`time_membros`. "Administrador de C" é quem tem papel `admin` na consultoria do time. É o mesmo molde do quadro do
cliente: quem mexe faz o dia a dia; a gestão (aqui, gestor do time e admin) apaga coluna e apaga o que é dos outros.

### O quadro do cliente

Igual a hoje (CLAUDE.md, "Quadro (Kanban)"). Ele não aparece no menu Quadros: continua só na aba Quadro do cliente.

## Quando as pessoas e os times mudam

Tudo abaixo sai sozinho da regra, porque o banco confere quem vê e quem mexe na hora de cada leitura e de cada gravação
(nada fica "guardado" como permissão).

- **Pessoa tirada do time:** perde os quadros do time na hora — não vê, não mexe, não entra no canal. O canal do quadro
  recebe um aviso de acesso (`acesso: true`) e a tela de quem está com o quadro aberto relê; quem saiu recebe "Você não
  tem mais acesso a este quadro." (Mesma limitação aceita no quadro do cliente: um navegador que ignore o aviso continua
  recebendo só ids de cartões e colunas até renovar o token, no máximo 1 hora; nunca dados.) O que ela fez fica: cartões
  que criou, comentários, anexos e os cartões em que é responsável, com o nome dela. Ela não pode mais ser escolhida como
  responsável. Os favoritos dela ficam guardados, mas não aparecem; voltam se ela voltar ao time.
- **Pessoa desativada:** não entra no app (`private.liberado()`), então não vê nada. Os quadros pessoais ficam guardados
  (ninguém vê); reativada, tudo volta como estava. Nos quadros do time continua como autora e responsável. Gestor de
  time não se desativa (regra que já existe, `gestor_com_times`).
- **Pessoa muda de consultoria ou vai para a central:** sai dos times da consultoria antiga (o gatilho `ao_sair` já faz
  isso), então perde os quadros desses times. Os quadros pessoais **ficam na consultoria onde nasceram**: somem para ela
  enquanto estiver em outra consultoria (ou na central) e voltam se ela voltar. Começa sem quadros na nova. (Decisão 1.)
- **Gestor do time trocado** (só o admin troca): o novo gestor passa a administrar os quadros do time na hora; o antigo,
  se não for membro, deixa de ver. O canal avisa.
- **Time apagado:** só se não tiver quadros (abertos ou arquivados). Com quadro, o banco recusa (23503, como "cartões
  seguram o cliente") e a tela diz: "Este time tem quadros (abertos ou arquivados). Apague os quadros dele em Quadros
  antes de apagar o time." (Decisão 6.)
- **Time arquivado:** o app não arquiva times hoje; não há o que fazer.
- **Consultoria arquivada:** ninguém dela entra (`liberado()`); os quadros ficam guardados.
- **Quadro arquivado:** some do seletor, fica na janela Quadros arquivados e abre só para ler; os favoritos dele ficam
  guardados e voltam ao restaurar. O canal avisa e quem está com ele aberto passa a ver "Quadro arquivado: só para ler."
- **Quadro apagado:** some para todos na hora (o canal avisa); quem estava nele vê "Este quadro foi apagado ou você não
  tem mais acesso a ele." e pode ir para os seus quadros.

## Modelo de dados

### `quadros` generalizada (escolhida)

A tabela `quadros` ganha um "tipo de dono" e os donos novos; o quadro do cliente fica exatamente como está. Colunas,
cartões, checklist, comentários, anexos, Storage e tempo real já penduram tudo em `quadro_id` e nas três regras
(`vejo_quadro`, `mexo_no_quadro`, `gerencio_quadro`): generalizar só o "de quem é o quadro" reaproveita ~25 funções e
gatilhos sem copiar nenhuma.

| Coluna | Antes | Agora |
|---|---|---|
| `tipo` | — | `text not null default 'cliente'`, `'cliente' \| 'pessoa' \| 'time'` (o padrão mantém `quadro_do_cliente` e o script de exemplo funcionando sem mudar) |
| `cliente_id` | not null | nulo fora do quadro do cliente |
| `pessoa_id` | — | `references perfis on delete restrict`; só no pessoal |
| `time_id` | — | `references times on delete restrict`; só no do time (o quadro segura o time) |
| `consultoria_id` | not null | cliente e time: sempre (no do time, a do time, posta pelo gatilho); pessoal: a da pessoa quando criou (nula para central e dono) |
| `nome` | — | 1 a 80 letras (sem espaços nas pontas); nulo só no do cliente |
| `nome_busca` | — | gerada: `private.sem_acento(btrim(nome))`, para a busca e o nome único |
| `arquivado_em` | — | nunca no do cliente; a hora é a do banco (gatilho, como nos cartões) |
| `criado_por` | — | `references perfis on delete set null`; quem criou (gatilho) |

Regra `quadros_um_dono` (check): exatamente um dono e o do tipo — `num_nonnulls(cliente_id, pessoa_id, time_id) = 1`,
`(tipo = 'cliente') = (cliente_id is not null)`, o mesmo para `pessoa` e `time`; `(tipo = 'cliente') = (nome is null)`;
`tipo <> 'cliente' or arquivado_em is null`; `tipo = 'pessoa' or consultoria_id is not null`.

- O único `(cliente_id, consultoria_id)` continua: com `cliente_id` nulo os outros tipos não colidem (nulos são
  distintos), e o `on conflict` de `quadro_do_cliente` não muda.
- **Nome único entre os abertos, por dono** (sem acento e sem maiúscula: "Tarefas" e "tarefas" colidem):
  - pessoal: único `(pessoa_id, consultoria_id, nome_busca) nulls not distinct where tipo = 'pessoa' and arquivado_em is null`;
  - do time: único `(time_id, nome_busca) where tipo = 'time' and arquivado_em is null`.
  Arquivar libera o nome; restaurar com um nome que já está em uso dá 23505 e a tela diz "Já existe um quadro aberto
  com esse nome. Renomeie um deles e tente de novo."
- **Índices** (um por caminho de leitura, conferidos por EXPLAIN no teste de volume): `(pessoa_id, consultoria_id,
  arquivado_em) where tipo = 'pessoa'`; `(time_id, arquivado_em) where tipo = 'time'`; `(consultoria_id, arquivado_em)
  where tipo = 'time'` (o admin); trigrama em `nome_busca where tipo <> 'cliente'`; `(criado_por)`.
- **Gatilho `preparar_quadro`:** no insert, nome sem espaços nas pontas, `criado_por` = quem está logado, no do time a
  consultoria vem do time; no update, arquivar grava a hora do banco e a data de quem já está arquivado não muda. Tipo e
  donos não se mudam (não há permissão de update neles).
- **Escrita:** o quadro só nasce por `criar_quadro` e só sai por `apagar_quadro` (sem insert/delete direto, como hoje);
  renomear, arquivar e restaurar são update direto em `nome` e `arquivado_em`, pela regra `administro_quadro`.

**Por que não uma tabela separada (`quadros_do_menu`)?** As colunas e os cartões apontam para `quadros` (chave
`(quadro_id, coluna_id)`), e a regra do Storage, os avisos do tempo real e todas as leituras (`cartoes_do_quadro`,
`cartao_do_quadro`, `mover_cartao`, `apagar_coluna`, `anexos_do_cartao`...) recebem `p_quadro`. Com outra tabela, ou a
chave ficaria "de uma ou de outra" (sem chave estrangeira de verdade), ou tudo isso seria copiado. Generalizar mexe em
quatro regras e nos lugares que leem `quadros.cliente_id` (listados no plano), com o ramo do cliente sem mudar.

### `quadro_favoritos` (nova)

`(perfil_id default auth.uid() references perfis on delete cascade, quadro_id references quadros on delete cascade,
criado_em, primary key (perfil_id, quadro_id))`, índice em `quadro_id`. RLS: cada um lê e apaga só os seus; marca só
quadro pessoal ou de time que vê (`vejo_quadro`). O favorito não tem campos para editar: criar (estrela acesa), ver (grupo
Favoritos) e apagar (estrela apagada) — é o CRUD dele (decisão 9).

### As regras, por tipo

| | Cliente (igual a hoje) | Pessoal | Do time |
|---|---|---|---|
| **vê** (`vejo_quadro`) | central e dono; na consultoria que atende hoje, admin, gestor e o consultor do cliente | a pessoa, enquanto está na consultoria em que o quadro nasceu | admin da consultoria do time, gestor do time, membros |
| **mexe** (`mexo_no_quadro`) | admin, gestor e consultor, cliente ativo | a pessoa, quadro aberto | os mesmos que veem, quadro aberto |
| **gere** (`gerencio_quadro`: apaga coluna; apaga cartão, comentário e anexo de qualquer um) | admin e gestor da consultoria | a pessoa | admin e gestor do time |
| **administra** (`administro_quadro`, nova: renomear, arquivar, restaurar, apagar) | ninguém | a pessoa | admin e gestor do time (aberto ou arquivado) |

Todas passam por `private.liberado()`. Ajudante novo `private.estou_no_time(p_time)` (membro ou gestor do time, na
consultoria de quem pergunta). `private.meus_quadros()` (a lista usada nas regras de leitura) ganha os ramos do pessoal e
do time, cada um por índice.

**Leitura direta pela API:** hoje as regras de leitura de `quadros`, `quadro_colunas` e `cartoes` dizem "a central lê
tudo" (`sou_central() or ...`). Isso abriria os quadros pessoais e de time para a central. Passam a dizer: a central lê
os quadros **do cliente**; o resto, pela lista `meus_quadros()` (que inclui os pessoais da própria central). Os nomes das
regras ficam os mesmos (o pgTAP do quadro confere os nomes).

### Responsáveis

- `validar_responsavel` e `pessoas_do_quadro` passam a olhar o tipo: cliente igual a hoje; pessoal: só a pessoa do quadro
  (ativa); do time: membros e o gestor do time, ativos (decisão 5).
- Quem deixa de poder (saiu do time) continua nos cartões em que já estava, como no quadro do cliente.

### Storage (balde `quadros`, o mesmo)

- **Pasta do quadro:** do cliente, `<cliente_id>/` (igual a hoje); pessoal e do time, `quadro/<quadro_id>/`. Anexo em
  `quadro/<quadro>/<cartão>/<uuid>-<nome>`, imagem da descrição em `quadro/<quadro>/<cartão>/imagens/<uuid>.<ext>`.
- **Sem colisão por construção:** a pasta do cliente começa com um uuid; a dos outros começa com a palavra `quadro/`. As
  duas formas nunca se confundem, e `cartao_do_objeto` confere o cartão (pelo id dele) **e** que a pasta é a do quadro
  daquele cartão (no do cliente, `cliente_id`; nos outros, `quadro/<id do quadro>` e o tipo não é cliente). Caminho de
  outro quadro, de outro cartão ou na forma errada para o tipo é recusado ao subir, ao gravar a linha do anexo e na
  descrição (imagem).
- **Ajudante `private.pasta_do_quadro(p_quadro)`** (`<cliente_id>` ou `quadro/<id>`) substitui o `q.cliente_id` onde ele
  era a pasta: `preparar_cartao` (imagens da descrição), `preparar_anexo`, `cartao_do_objeto`,
  `lembrar_objetos_dos_cartoes_apagados`, `apagar_cartao`, `apagar_coluna`. A regra de forma de `cartao_anexos.caminho`
  passa a aceitar as duas formas, sempre com o id do cartão no lugar certo. Na tela, o mesmo ajudante (`pastaDoQuadro`).
- **As regras do Storage não mudam de texto** ("quadros: enviar / ver / tirar"): elas chamam funções que ficam gerais.
- **Sobras:** hoje a central pode tirar (e por isso ver) objeto sem uso do balde, para limpar depois de apagar um
  cliente. Isso passa a valer **só na forma do cliente**: a central nunca vê nem tira nada de `quadro/...`. Sobra de
  quadro pessoal ou de time (tirar falhou) fica com quem apagou (1 dia, como hoje) e com quem administra o quadro
  enquanto ele existe.
- **Apagar o quadro** devolve os caminhos de todos os objetos da pasta dele, e a tela tira em lotes de 1.000 (o mesmo
  ajudante de hoje). Se tirar falhar, o aviso diz que alguns arquivos ficaram para trás.

### Tempo real

- Mesmo canal privado `quadro:<id>`, mesma regra (`vejo_canal_do_quadro` → `vejo_quadro`, agora geral), mesmos avisos
  (só ids). Nada muda na tela de quem ouve.
- Avisos de acesso novos (`{ tabela, operacao, acesso: true }`, a tela relê e entra de novo no canal):
  `time_membros` (entrou ou saiu do time) e `times` (troca de gestor) avisam em cada quadro daquele time; `quadros`
  (renomear, arquivar, restaurar, apagar) avisa no canal do próprio quadro.
- Mudança de papel (ex.: admin que vira gestor) não avisa o canal, como no quadro do cliente: a próxima gravação é
  recusada (42501) e a tela relê e mostra "sem acesso".

### Funções novas do banco (detalhe no plano)

`criar_quadro(p_nome, p_time)`, `apagar_quadro(p_quadro)`, `quadros_para_escolher(p_busca, p_limite)` (os grupos do
seletor), `quadros_por_ids(p_ids)` (os Recentes), `quadros_arquivados(p_busca, p_tipo, p_pagina)`,
`times_para_novo_quadro(p_busca, p_limite)`; `quadro_por_id` ganha `tipo`, `nome`, `time { id, nome }`, `arquivado_em`,
`pode_administrar` e `favorito` (as chaves de hoje continuam, a central usa essa função no cliente).

## Recentes e o último quadro

- **No navegador (`localStorage`), como no Mochi**, por pessoa (`ixc.quadros.<perfil_id>`): o último quadro aberto e os
  8 mais recentes, **só ids**. Não segue para outro aparelho (decisão 8); não grava no banco a cada quadro aberto.
- **O banco confere sempre:** os Recentes vêm de `quadros_por_ids`, que devolve só os que a pessoa ainda vê e estão
  abertos, com nome e contagem do banco; o resto é tirado da lista guardada.
- **Abrir em `/quadros`:** o último quadro, se `quadro_por_id` o devolver aberto; senão o primeiro favorito, o primeiro
  de Meus, o primeiro de Dos times; sem nenhum, a tela vazia com "Novo quadro". Sem mensagem quando o último sumiu (ele
  só sai da lista guardada).
- **Endereço:** `/quadros/<id>` abre aquele quadro (dá para mandar o link para alguém do time). Quem não vê recebe "Este
  quadro não existe ou você não tem acesso a ele." com "Ir para os meus quadros". Id de quadro de cliente: "Este quadro
  é de um cliente: abra pela página do cliente." com o link.
- Tudo lido do `localStorage` passa por `try/catch` (aba anônima, armazenamento bloqueado): sem ele, a tela abre no
  primeiro quadro.

## Seletor de quadros

- Botão no cabeçalho com o nome do quadro aberto; abre uma lista flutuante (`Flutuante`, como o `Seletor`) com busca e
  os grupos **Favoritos**, **Recentes**, **Meus** e **Dos times** (este último com o nome do time em cada item; não
  aparece para central e dono). Cada item: nome, "N cartões" (`tabular-nums`) e a estrela.
- **Busca no banco** (sem acento, pelo trigrama de `nome_busca`), 300 ms depois de parar de digitar; cada grupo traz até
  20 e o rodapé do grupo diz "20 de 230 — busque pelo nome" quando há mais (como o `Seletor`). Recentes, com busca,
  filtra os poucos que já tem.
- Só quadros abertos. O `Seletor` comum não tem grupos; o seletor de quadros é um componente próprio em cima do
  `Flutuante`, com teclado (setas, Enter, Esc) e `role="listbox"` com grupos.

## Janela "Quadros arquivados"

`JanelaFormulario` larga com busca e abas `AbasSegmentadas` (Todos · Pessoais · Dos times; central e dono não veem as
abas) e uma `Tabela` "Quadros arquivados": Nome, De quem ("Pessoal" ou o nome do time), Cartões, Arquivado em, ações
(Abrir — só para ler; Restaurar e Apagar — quem administra). 15 por página vindos do banco (`{ itens, total }`), busca no
banco, `ListaVazia` quando não há nenhum. Restaurar com nome repetido mostra a mensagem acima.

## Escala

- Milhares de quadros por consultoria (pessoais de centenas de pessoas e de centenas de times): o seletor lê só o que
  a pessoa vê, por índice, com limite por grupo e contagem de cartões só dos itens devolvidos (pelo índice parcial dos
  cartões ativos); nada de lista inteira na tela.
- O admin vê todos os quadros de time da consultoria: o grupo Dos times dele também tem limite e busca.
- Volume no teste: 5.000 quadros numa consultoria (2.000 pessoais de 400 pessoas, 3.000 de 300 times), um quadro com
  2.000 cartões; seletor, arquivados e abrir o quadro rápidos (média < 50 ms) e sem Seq Scan em `quadros`. Os testes de
  volume do quadro do cliente continuam passando nos tempos de hoje.

## A tela (o molde de "Tela nova")

1. **Menu:** "Quadros" (ícone `SquareKanban`), depois de Calendário, para todos os papéis. Animação nova `arrastar`
   (todas as de `ANIMACOES_DO_MENU` já estão em uso): o ícone levanta, vai um pouco para o lado e assenta, como um
   cartão sendo arrastado — `@keyframes icone-arrastar` + `.group:hover .anim-arrastar, .group:focus-visible
   .anim-arrastar` em `src/index.css` e o nome em `ANIMACOES_DO_MENU`. Para com "reduzir movimento" (regra global).
2. **Cabeçalho** (`Cabecalho`): título "Quadros"; subtítulo diz quem vê o quadro aberto ("Pessoal · só você vê",
   "Time Comercial · o time vê e mexe", "Arquivado · só para ler"). À direita, o seletor de quadros, a estrela (botão
   `outline` só com ícone, `aria-pressed`) e o "⋯" (`outline`, "Mais ações do quadro"): Novo quadro, Quadros arquivados
   e, para quem administra, Renomear, Arquivar (ou Restaurar) e Apagar. Sem botão cheio no cabeçalho: a ação principal
   da tela é o "Novo cartão" da barra.
3. **Barra de filtros:** a mesma `BarraDoQuadro` do cliente (ícone + "Filtros", busca, Prioridade, Responsável, Prazo,
   Limpar; no fim Arquivados — os cartões — e **Novo cartão**), sem o seletor "Consultoria", que é só da central no
   cliente. Tudo filtra no banco.
4. **Cartões de números: não tem.** É o mesmo quadro da aba Quadro do cliente, que ficou sem cartões por pedido do
   Diego (17/11): o quadro ocupa o resto da tela e cada coluna rola sozinha, e os números tiravam esse espaço. A exceção
   entra no CLAUDE.md junto com a da aba do cliente. Se o Diego quiser os números, `indicadores_do_quadro` ainda existe
   no banco e volta em pouco tempo (decisão 7).
5. **Conteúdo:** o quadro (colunas lado a lado, a altura do resto da tela, cada coluna rolando sozinha), como no
   cliente. Sem nenhum quadro: `ListaVazia` "Você ainda não tem quadros." com o botão "Novo quadro".
6. **Formulários** (`JanelaFormulario` + `SecaoFormulario`, rodapé Cancelar + principal com a ação em andamento):
   - **Novo quadro:** Nome (até 80) e "De quem é" — a escolha "Só eu / Um time" (o `EscolhaForma` generalizado) e, em
     "Um time", o time num `Seletor` com `buscar` (`times_para_novo_quadro`). Central e dono não veem a escolha (o texto
     diz "Quadro pessoal: só você vê."); quem não está em time vê "Um time" desligado com a explicação. Rodapé
     "Criar quadro" ("Criando…"); ao criar, abre o quadro novo.
   - **Renomear** (é o "Editar" do quadro): o nome preenchido; "Salvar" ("Salvando…").
   - **Arquivar:** confirmação ("O quadro sai da lista e fica em Quadros arquivados, só para ler. Dá para restaurar.").
   - **Apagar:** janela que diz o que some junto ("N colunas e M cartões, com checklist, comentários e anexos. Não dá
     para desfazer.") e oferece **Arquivar** ao lado de **Apagar**, explicando a diferença (regra do CRUD: no quadro do
     time, apagar tira o trabalho do time inteiro).
7. **Layout:** largura toda, claro e escuro; a 360 px nada rola para o lado (as colunas rolam dentro da faixa delas,
   como no cliente).
8. **Celular:** o cabeçalho quebra em duas linhas (título; seletor na largura toda + estrela + ⋯); a barra quebra
   linha; uma coluna por vez com rolagem lateral dentro da faixa; a janela do cartão em uma coluna (já é assim).

## O que não muda (quadro do cliente)

`quadro_do_cliente`, `quadros_do_cliente`, a aba Quadro, a central com o seletor "Consultoria", os caminhos
`<cliente>/<cartão>/...`, o tempo real e os testes. Por dentro, a tela do cliente passa a usar o mesmo componente de
quadro da tela do menu (`QuadroKanban`); a janela do cartão recebe a pasta e o motivo de "só para ler" em vez do cliente.

## CRUD completo

- **Quadro:** criar (Novo quadro), ver (seletor, endereço, arquivados), editar (Renomear; tipo e dono não mudam —
  decisão 9), apagar (com confirmação e a opção de arquivar). Cada operação tem a regra no banco, pgTAP, teste de
  integração e teste de tela.
- **Dentro do quadro:** colunas, cartões, checklist, comentários e anexos já têm as quatro operações (o mesmo do
  cliente).
- **Favorito:** criar, ver e apagar; não há o que editar (decisão 9).

## Fica de fora (depois)

Mandar cartão para outra pessoa, acompanhar com avisos, etiquetas, capa (aprovado como "depois"); mover cartão entre
quadros; mudar o dono do quadro; seleção em lote nos arquivados; quadro do cliente no menu; limite de quadros; lista de
quadros na página do time.

## Decisões que tomei (o Diego confere)

1. **Quadro pessoal fica na consultoria onde nasceu.** Quem muda de consultoria (ou vai para a central) deixa de vê-lo
   e o reencontra se voltar — como o quadro do cliente e os check-ins, que ficam na consultoria. Alternativa: o quadro
   segue a pessoa (uma condição a menos na regra), mas aí anexos de clientes da consultoria antiga iriam junto.
2. **O administrador da consultoria vê e mexe em todos os quadros de time dela**, não só renomeia, arquiva e apaga
   (ele já pode apagar o quadro inteiro; mexer num cartão é menos que isso).
3. **Central e dono não veem quadros de time**, nem para ler (diferente do quadro do cliente, que eles leem).
4. **Qualquer membro do time cria quadro do time** (como no Mochi), além do gestor e do admin; renomear, arquivar e
   apagar continuam só com o gestor do time e o admin — então quem criou não renomeia.
5. **Responsáveis no quadro do time:** membros **e o gestor do time**; o admin só se for membro.
6. **Time com quadros não se apaga** (como "cartões seguram o cliente"): a tela pede para apagar os quadros antes. A
   outra saída seria apagar os quadros junto com o time.
7. **A tela Quadros não tem cartões de números**, pela mesma razão da aba Quadro do cliente (exceção no CLAUDE.md).
8. **Recentes e último quadro ficam no navegador** (só ids, conferidos no banco): não seguem para outro aparelho.
9. **Quadro não muda de dono nem de tipo** ("Editar" = renomear) e **favorito não se edita** — duas operações fora do
   CRUD que precisam do OK do Diego (regra do CLAUDE.md).
10. **A lista dos quadros abertos é o seletor** (aprovado), não uma `Tabela`; a dos arquivados é `Tabela`.
11. **Quadro arquivado abre só para ler** (pela janela de arquivados), e apagar oferece arquivar ao lado.
12. **Anexos e imagens dos quadros pessoais e de time** no mesmo balde `quadros`, na pasta `quadro/<id do quadro>/`.
13. **Item "Quadros" no trilho logo depois de Calendário**, com a animação nova `arrastar`.
