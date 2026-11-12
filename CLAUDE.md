# IXC Consult — regras do projeto

Plataforma de gestão de projetos para várias consultorias (React 19 + Vite, Supabase, Vercel).
Como rodar, comandos e publicação: `README.md`. Design e plano: `docs/superpowers/`.

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
  itens do menu, itens "em breve", a bolinha da pessoa e o Sair. Pedido do Diego (2026-11-12).
- **Item novo no menu:** em `src/components/shell/menu.js`, preencha `animacao` com uma de
  `ANIMACOES_DO_MENU` (`subir`, `balancar`, `pulsar`, `abrir`, `erguer`, `conectar`, `sair`). Prefira uma que
  combine com o ícone e que ainda não esteja em uso no trilho.
- **Animação nova:** keyframes `icone-<nome>` + a regra `.group:hover .anim-<nome>` (e `:focus-visible`)
  em `src/index.css`, e o nome em `ANIMACOES_DO_MENU`. O elemento clicável precisa da classe `group`
  e de `data-item-trilho`.
- `menu.test.js` e `Trilho.test.jsx` falham se algum item ficar sem animação.
- Com "reduzir movimento" ligado no sistema, as animações param (regra global em `src/index.css`).

## Botões: sempre animados

- **Todo botão anima** ao passar o mouse e ao apertar: sobe 1px com sombra no hover, o ícone dá um
  pulinho, e ao apertar afunda (`active:scale-[0.97]`). Pedido do Diego (2026-11-12).
- **Use sempre o componente `Button`** (`src/components/ui/button.jsx`), que já anima.
- **Botão escrito à mão** (`<button>` fora do `Button`) precisa da classe `botao-animado` e das mesmas
  transições (`hover:-translate-y-px active:scale-[0.97]`).
- Os itens do trilho têm animação própria (seção acima) e são marcados com `data-item-trilho`.
- `src/components/ui/button.test.jsx` varre o código e falha se algum `<button>` ficar sem animação.

## Listas: sempre em tabela, e Editar abre o formulário preenchido

- **Toda lista de itens é uma tabela no padrão da tela Usuários** (pessoas, times, consultorias, pessoas
  do time e o que vier). Pedido do Diego (2026-11-12). Grade de cartões não serve para lista.
- **Use o componente** `Tabela` (`src/components/comum/Tabela.jsx`) com `Linha`, `Celula` e
  `CelulaAcoes`, e `ListaVazia` quando não houver nada. A tabela tem nome (`rotulo`), uma linha por item
  e as ações da linha na última coluna (Editar, Desativar, Apagar...).
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
  `src/data/paginar.js`), devolvendo `{ itens, total }`. Nunca carregar tudo e fatiar no navegador.
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

## Layout

- Telas internas ocupam a largura toda: nada de `max-w-*` + `mx-auto` no conteúdo da página.
  Limite só campos pequenos (um select, uma janela). Em telas largas, grades ganham colunas.
- Visual "claro e azul" (cores em `:root` de `src/index.css`); a logo da IXC Consult é quadrada, sem
  cantos arredondados.

## Dados do Diego: nunca apagar sem perguntar

- **Nada que apague dados roda sem o Diego confirmar antes**, nem no Supabase local: `supabase db reset`,
  apagar registros, limpar o Storage, recriar banco ou volume do Docker. Pedido dele (2026-11-12), depois
  de um `db reset` ter apagado cadastros feitos à mão.
- **Migração nova:** `npx supabase migration up` (aplica só o que falta, sem apagar nada).
- Os testes de integração só apagam o que eles mesmos criaram (`limparTudo`); o pgTAP roda em transação.

## Segurança

- A chave secreta do Supabase nunca vai para `src/` nem para o git; o navegador usa só a publicável.
- Toda tabela nova: RLS ligado, `GRANT` explícito só para `authenticated`, recorte por consultoria
  (funções em `private`) e teste em `supabase/tests/database/`.
- Criar login, papel ou consultoria só pelas Edge Functions (`supabase/functions/`).
- Fotos e logos ficam no Storage (buckets `fotos` e `logos`), na pasta do dono do arquivo
  (`<id>/<uuid>.webp`). Quem pode mudar: `private.posso_mudar_foto` e `private.posso_mudar_logo`.
