# Padrão Hub no layout — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** botões, formulários, campos, abas e barra de filtros no padrão do Hub, com as cores da consultoria.

**Arquitetura:** componentes de base em `src/components/ui/` e `src/components/comum/` restilizados ou novos (portados
do Hub em `~/Documents/Karina/src/components/{DatePicker,TimePicker,PickerField,FilterCombobox,NumberField,Checkbox}.jsx`
e `~/Documents/Karina/src/index.css` — só leitura lá), e depois aplicados tela a tela sem mudar comportamento.

**Tecnologias:** React 19, Tailwind 4, lucide-react, Radix Dialog (já existe), `date-fns` (nova, versão fixa 3.6.0).

**Design:** `docs/superpowers/specs/2026-11-16-padrao-hub-design.md`; referência: `docs/superpowers/specs/2026-11-16-padrao-hub.md`.

## Restrições globais

- Cores: as da consultoria (`--primary` etc. em `src/index.css`, claro e escuro). Onde o Hub usa índigo, use `--primary`.
- Comportamento não muda: todos os testes de comportamento continuam passando (ajustar só seletores que dependiam de
  elemento nativo, ex.: `selectOptions` num `<select>` vira escolher no `Seletor`).
- `CLAUDE.md`: botões sempre animados (o `button.test.jsx` varre o código), listas em tabela, Editar abre preenchido,
  largura total, textos em português.
- Acessibilidade: campos com rótulo associado; listas que abrem em portal com `role="listbox"`/`option`, teclado
  (setas, Enter, Esc); abas com `aria-selected` (página do cliente mantém `role="tab"` e `?aba=`).
- Node 26 (`source ~/.nvm/nvm.sh && nvm use`). Nunca `git stash`, trocar de branch, push ou mexer no banco.
- Pronto: `npm test`, `npm run lint`, `npm run build` verdes; conferência no navegador pelo controlador (claro e escuro,
  1440 px e 390 px).
- Escala (`CLAUDE.md`): `Seletor` com muitas opções busca no banco (`buscar`), nunca carrega a lista inteira.

## Review Focus

- Lista do `Seletor`/`CampoData` aberta dentro de uma janela (Radix Dialog): precisa abrir por cima, receber clique e
  teclado (portal dentro do conteúdo da janela ou `pointer-events` liberado), e Esc fecha só a lista, não a janela.
- Campo de data vazio e opcional (ex.: "até" das ausências, data de entrada da ficha): limpar volta a `''`, e o
  formulário continua mandando o mesmo valor de antes para as funções de dados.
- Vírgula decimal no `CampoNumero` (ex.: `7,5` horas) vira `7.5` e respeita `min`/`max`.
- Celular (390 px): janela encosta embaixo e rola; a lista do campo não sai da tela (vira para cima quando falta espaço).
- Escuro: campos, listas e abas legíveis com as cores da consultoria.

---

### Task 1: Base visual — botões, campos de texto, rótulos, cartões e janela de formulário

**Arquivos:** `src/index.css` (camada de componentes: `.input`, `.form-label`, `.section-label`, `.card`, sombras do Hub
como variáveis, foco), `src/components/ui/{button,input,label,dialog}.jsx`, novo
`src/components/comum/JanelaFormulario.jsx` (+ teste), `src/components/comum/ConfirmarAcao.jsx` (+ teste).

**Interfaces — produz:**
- `Button` no formato do Hub, mantendo todos os nomes que já existem (variantes `default|destructive|outline|secondary|
  ghost|link`, tamanhos `default|sm|lg|icon|icon-sm`), para nenhuma tela quebrar.
- `<JanelaFormulario aberto aoFechar titulo descricao icone largura="md|lg|xl" rodape={<>…</>} enviando? children />`:
  cabeçalho (quadrado de ícone com `--primary` claro, título, descrição, fechar), corpo rolável, rodapé à direita;
  `<SecaoFormulario titulo>` para as seções; no celular encosta embaixo; clique fora não fecha.
- `ConfirmarAcao` no padrão (ícone de alerta, vermelho só no botão final).

- [ ] **Passo 1:** testes (JanelaFormulario: título/descrição/ícone, Esc e X fecham, clique fora não fecha, seções;
  ConfirmarAcao continua igual por fora; button.test continua passando). **Passo 2:** FALHA. **Passo 3:** implementar.
  **Passo 4:** `npm test`, `npm run lint`. **Passo 5:** commit `Padrão Hub: botões, campos, cartões e janela de formulário`.

### Task 2: Campos próprios do Hub

**Arquivos:** novos em `src/components/campos/`: `CampoData.jsx`, `CampoHora.jsx`, `Seletor.jsx`, `CampoNumero.jsx`,
`Caixa.jsx`, `Chave.jsx` (+ testes); `package.json` (+ `date-fns` 3.6.0 exata).

**Interfaces — produz** (valor em texto, `onChange(valor)`):
- `<CampoData id rotulo? valor="yyyy-MM-dd" aoMudar min? max? comHora? atalhos? />` (com hora: `yyyy-MM-ddTHH:mm`).
- `<CampoHora id valor="HH:mm" aoMudar passo={5} compacto? />`.
- `<Seletor id valor aoMudar opcoes=[{valor, rotulo, detalhe?, avatar?}] buscar?={async termo => ({ itens, total })}
  rotuloTodos? tamanho="sm|md" placeholder? />` — busca no banco quando `buscar` vier.
- `<CampoNumero id valor aoMudar min max passo unidade? atalhos? decimal? />` (aceita vírgula).
- `<Caixa marcado aoMudar rotulo? indeterminado? />`, `<Chave ligada aoMudar rotulo />`.
- Portados do Hub (`~/Documents/Karina/src/components/*`), com `--primary` no lugar do índigo, portal com posição fixa
  que vira para cima quando falta espaço, `pop-in` na abertura.

- [ ] **Passo 1:** testes de cada campo (teclado, valor em texto, min/max, vírgula, busca chamando `buscar`, rótulo
  associado; `Seletor` e `CampoData` abertos dentro de um `Dialog` recebem clique e Esc fecha só a lista; data
  opcional limpa volta a `''`). **Passo 2:** FALHA. **Passo 3:** portar/implementar. **Passo 4:** `npm test`, `npm run lint`, `npm run
  build`. **Passo 5:** commit `Campos de data, hora, seleção e número no padrão do Hub`.

### Task 3: Formulários no padrão (todas as janelas)

**Arquivos:** as janelas que hoje usam `Dialog` direto: `src/components/clientes/{FormularioCliente,JanelaPrevisao,
JanelaCheckin,EscolhaDeOcupacao,AgendaDoCliente}.jsx` (e `JanelaMandar`/`JanelaConsultor`, que usam
`EscolhaDeOcupacao`), `src/components/usuarios/FichaDoConsultor.jsx`, `src/components/capacidade/{EditarCarga,
JanelaAusencias}.jsx`, `src/components/times/{NovoTime,EditarTime}.jsx`, `src/components/consultorias/{NovaConsultoria,
EditarConsultoria}.jsx`, `src/components/integracoes/{JanelaIntegracao,FormularioIa,FormularioSmtp}.jsx`,
`src/components/perfil/MeuPerfil.jsx`, `src/pages/Time.jsx` (+ testes ajustados). Campos nativos hoje:
`<select>` via `SelectNativo` (`src/components/ui/select-nativo.jsx`) e `type=date|time|number` em
`JanelaAusencias`, `FormularioCliente`, `JanelaCheckin`, `FormularioSmtp`, `FichaDoConsultor`.

- Cada janela usa `JanelaFormulario` + `SecaoFormulario`; datas/horas com `CampoData`/`CampoHora`; selects com
  `Seletor`; horas/carga com `CampoNumero`; caixas com `Caixa`. Mesmo comportamento e mesmas mensagens.
- [ ] **Passo 1:** ajustar testes que usavam elementos nativos (sem perder asserções). **Passo 2:** aplicar. **Passo 3:**
  `npm test`, `npm run lint`, `npm run build`. **Passo 4:** commit `Formulários no padrão do Hub`.

### Task 4: Abas segmentadas e barra de filtros

**Arquivos:** novos `src/components/comum/AbasSegmentadas.jsx`, `src/components/comum/BarraDeFiltros.jsx` (+ testes);
aplicar em `src/pages/{Clientes,Usuarios,Consultorias,Capacidade,Times}.jsx` (hoje: botões com `aria-pressed` em
Clientes, Usuarios, Consultorias e Capacidade), `src/components/clientes/AbasDoCliente.jsx` (hoje `role="tablist"` com
sublinhado), `src/components/clientes/FiltroConsultor.jsx` e `src/components/comum/FiltroConsultoria.jsx` (trocar
`SelectNativo` por `Seletor tamanho="sm"`; consultor com busca no banco) (+ testes ajustados).

**Interfaces — produz:** `<AbasSegmentadas rotulo abas=[{valor, rotulo, contador?, pendente?}] valor aoMudar
comoAbas? />` (com `comoAbas`, usa `role="tablist"/"tab"` e `aria-controls`, para a página do cliente);
`<BarraDeFiltros>{abas}{busca}{filtros}<acaoPrincipal/></BarraDeFiltros>` (principal no fim).
- [ ] **Passo 1:** testes (abas: ativa, contador, teclado; barra: ordem). **Passo 2:** FALHA. **Passo 3:** implementar e
  aplicar. **Passo 4:** `npm test`, `npm run lint`, `npm run build`. **Passo 5:** commit `Abas segmentadas e barra de
  filtros no padrão do Hub`.

### Task 5: Regra no CLAUDE.md e conferência

**Arquivos:** `CLAUDE.md` (seção "Padrão Hub": botões, janela de formulário, campos próprios — nada de `<select>` e
`type=date|time|number` nativos —, abas segmentadas, barra de filtros), teste que varre `src/` e falha se aparecer
`<select`, `type="date"`, `type="time"`, `type="number"` ou `type="datetime-local"` fora de `src/components/campos/`;
apagar `src/components/ui/select-nativo.jsx` (sem uso depois das Tasks 3 e 4).
- [ ] **Passo 1:** teste de varredura (FALHA se algo escapou). **Passo 2:** ajustar o que faltar. **Passo 3:** `npm test`,
  `npm run lint`, `npm run build`. **Passo 4:** commit `Regra do padrão Hub no CLAUDE.md`. Conferência no navegador
  pelo controlador.
