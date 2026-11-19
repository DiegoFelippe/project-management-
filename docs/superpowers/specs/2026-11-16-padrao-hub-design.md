# Padrão Hub no layout — design

Data: 2026-11-16. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).
Referência extraída do Hub: `docs/superpowers/specs/2026-11-16-padrao-hub.md`.

## Pedido do Diego

- "Use o layout do hub para botões e o padrão de formulário e de abas — tá ficando meio estranho o layout."
- "Não quero trocar as cores, quero trazer o padrão do layout."
- "No hub nós criamos um modelo de tipo de campo para data e hora e dia em um padrão mais elegante, e também todos
  eles têm um tipo de layout de botão e filtro."
- Delegou as decisões ("pode fazer tudo o que depende de mim").

## O que muda (cores da consultoria; formato do Hub)

1. **Botões** (`src/components/ui/button.jsx`): variantes `default` (principal), `outline` (secundário), `ghost`,
   `destructive` (só no botão final de confirmar) e ícone sozinho (`size="icon"`, 32 px, `rounded-lg`), todos no
   formato do Hub: `rounded-xl`, 13 px semibold, altura única ~36 px, sombra e subida de 1 px no principal, `Plus`
   girando no hover. Cor do principal = `--primary` (azul da consultoria). A regra "botões sempre animados" do
   `CLAUDE.md` continua valendo.
2. **Campos de texto** (`Input`, `textarea`, `Label`): `.input` do Hub (13,5 px, `rounded-xl`, anel de foco suave na
   cor `--primary`) e `.form-label` (12,5 px, acima do campo).
3. **Formulários = janela no padrão do Hub**: componente `JanelaFormulario` (sobre o `Dialog` atual) com cabeçalho
   (quadrado de ícone, título 15 px, subtítulo "o que acontece ao salvar", fechar), corpo com seções
   (`.section-label`), rodapé à direita (Cancelar secundário + principal com estado "Salvando…"); no celular sobe de
   baixo; Esc e X fecham; clique fora não fecha formulário. `ConfirmarAcao` no mesmo padrão (vermelho só no
   botão final).
4. **Campos próprios do Hub** no lugar dos nativos (portados do Hub, com as cores da consultoria):
   - `CampoData` (calendário do Hub: dias, meses, anos; `min`/`max`; opção com hora) — substitui `type="date"`;
   - `CampoHora` (lista de horas e minutos de 5 em 5 + digitar) — substitui `type="time"`;
   - `Seletor` (lista com busca, "Todos…", tamanho `sm` para filtros e `md` para formulário; busca no banco quando
     houver milhares) — substitui `<select>`;
   - `CampoNumero` (menos/mais, unidade, atalhos) — horas por mês, carga semanal;
   - `Caixa` (caixa de marcar do Hub) e `Chave` (switch) onde houver.
   Valores continuam texto (`yyyy-MM-dd`, `HH:mm`), como hoje, para não mudar as funções de dados. Dependência nova:
   `date-fns` (versão fixa), a mesma que o Hub usa.
5. **Abas = controle segmentado** (`AbasSegmentadas`): trilho cinza com a aba ativa branca, contador em pílula
   (âmbar quando é pendência). Usado nas abas das listas (Clientes, Usuários, Consultorias, Capacidade) e nas abas
   da página do cliente (mantendo a acessibilidade de abas e o `?aba=`).
6. **Barra de filtros** (`BarraDeFiltros`): cartão com as abas, a busca (campo com lupa), os filtros (`Seletor`
   `sm`) e o botão principal no fim (`ml-auto`), em todas as listas.
7. **Cartões** das listas e blocos: `rounded-2xl` com borda fina e sombra do Hub.

## Fora do escopo

- Trocar cores, fonte ou o trilho lateral (a moldura continua).
- Mudar comportamento: só layout e campos; testes de comportamento continuam valendo.

## Escolhas minhas

- Portar os componentes do Hub (adaptados a React 19 e Tailwind 4, cores em `--primary`) em vez de reescrever do
  zero; nomes em português no padrão do projeto.
- Data e hora continuam como texto nas funções de dados (`yyyy-MM-dd`, `HH:mm`), só o campo muda.
- `date-fns` como única dependência nova.
- Regra nova no `CLAUDE.md`: "Formulários, campos, abas e botões no padrão do Hub (ver
  `docs/superpowers/specs/2026-11-16-padrao-hub.md`); nada de `<select>`, `type=date|time|number` nativos."
