# Central IXCSoft, clientes e distribuição — design

Datas: conversa de 2026-11-13 a 2026-11-16. Projeto: `~/Documents/consultoria` (IXC Consult). Branch:
`feat/clientes`. Continua `2026-11-12-login-usuarios-times-design.md`, `2026-11-12-crud-completo-design.md` e
`2026-11-12-integracoes-design.md`; o que está lá continua valendo, menos o que este muda.

Material de apoio da conversa: protótipo clicável `docs/prototipo/clientes-poc.html` (descartável; algumas
coisas dele mudaram depois, valem as deste documento).

## Por que

Pedido inicial do Diego: "Agora eu quero fazer um menu para cadastro de cliente. O Gestor cria os clientes
e associa a um consultor. Os consultores serão os usuarios."

Na conversa, o desenho real apareceu: a **IXCSoft** funciona como uma **central** que cadastra os clientes
(provedores de internet) e os distribui para as **consultorias parceiras** (STI, VOUX e a própria IXCSoft
como consultoria). Em cada consultoria, o **gestor** escolhe o **consultor** que vai atender. O consultor
trabalha no cliente por horas, e a distribuição deve ser **equilibrada pela carga de trabalho** de cada um:
o sistema sugere quem está menos ocupado, mas quem decide é a pessoa.

O cliente é o centro do produto: depois, dentro dele, vão ficar agendas, videochamadas, transcrições,
auditoria inicial, plano de ação e arquivos; e a central vai ter painéis estratégicos. Nada disso entra
agora, mas tudo o que entra agora precisa estar pronto para receber essas partes.

## Decisões do Diego

1. **Hierarquia** (desenho dele): Administrador geral (Diego) → **IXCSoft central** (Jaine) → consultorias
   (STI, VOUX, IXCSoft...). **Só existe uma central.**
2. **A central vê todas as consultorias e todos os clientes de todo mundo.**
3. **Quem está na central cadastra clientes e cria consultorias.**
4. **A central escolhe só a consultoria; o consultor é escolhido sempre pelo gestor da consultoria.** A
   central nunca pula essa etapa.
5. **Cada consultoria vê só os clientes dela** (ex.: a Simone, na STI). Uma consultoria não vê outra.
6. **Consultores são os usuários** das consultorias. A IXCSoft também é uma consultoria comum, com equipe
   própria, embaixo da central; os consultores dela entram na sugestão como os de qualquer parceira.
7. **Capacidade e ocupação** (modelo proposto e aprovado, "pode fazer como sugerido"):
   - cada consultor tem a **carga semanal** (ex.: 44 h); a **capacidade do mês** sai dos dias úteis menos
     feriados e ausências;
   - cada cliente tem uma **previsão de horas por mês**; ao escolher o consultor, ela é **reservada** na hora;
   - os **check-ins** do consultor no cliente mostram o **realizado**; se passar do previsto, aparece aviso;
   - a sugestão é quem tem a **menor ocupação** (reservado ÷ capacidade). O sistema sugere, a pessoa decide.
8. **Ordem de entrega:** etapa 1 (central) e etapa 2 (clientes, distribuição, capacidade e check-ins) agora;
   etapa 3 (dentro do cliente: agenda, videochamada, transcrição, auditoria inicial, plano de ação, arquivos)
   e os painéis estratégicos da central depois, cada uma com conversa própria.
9. Regras de sempre (no `CLAUDE.md`): CRUD completo, listas em tabela com Editar abrindo o formulário
   preenchido, paginação no banco acima de 15, pensado para milhares de registros, menu e botões animados.

## Quem vê e faz o quê

| Quem | Vê | Faz |
| --- | --- | --- |
| **Administrador geral** (papel `dono`, o Diego) | tudo | tudo o que a central faz, e mais: coloca e tira pessoas da central |
| **Central** (papel novo `central`, a Jaine) | todas as consultorias, usuários, times e clientes | cria, renomeia, arquiva e reativa consultorias e seus administradores; cadastra, edita, manda para uma consultoria, move, arquiva e apaga clientes; ajusta a previsão de horas |
| **Administrador e gestor da consultoria** | todos os clientes da consultoria e a capacidade de todos os usuários dela | escolhe e troca o consultor de cada cliente (qualquer usuário ativo da consultoria); ajusta a previsão de horas; define a carga semanal e as ausências dos usuários da consultoria; vê e corrige os check-ins feitos pela consultoria |
| **Consultor** (qualquer usuário ativo da consultoria: pessoa, gestor ou admin) | só os clientes em que é o consultor | faz check-in e check-out, lança horas depois, corrige e apaga os próprios check-ins |

- **Em clientes e capacidade, o gestor alcança a consultoria inteira, não só os times dele** (decisão do
  Diego em 13/11, "Seguir sugestões": o administrador e todos os gestores cuidam de todos os clientes, e
  consultor é qualquer usuário ativo da consultoria). Ele passa a ver nome, e-mail, foto, carga e ocupação
  de todos os usuários da consultoria **só nas telas Clientes e Capacidade**, por funções do banco; a tela
  Usuários dele continua mostrando só quem ele criou e as pessoas dos times dele.
- O que já existe para administrador, gestor e pessoa (usuários, times) continua igual dentro de cada
  consultoria.
- O papel de administrador e gestor de uma consultoria não muda por causa da central: eles continuam sem ver
  outras consultorias.

## Etapa 1 — A central

### Papel `central`

- Papel novo em `perfis.papel`: `central`. Como o `dono`, não pertence a nenhuma consultoria
  (`consultoria_id` nulo). A regra `(papel = 'dono') = (consultoria_id is null)` passa a ser
  `(papel in ('dono', 'central')) = (consultoria_id is null)`.
- Nome na tela: **Central** (e, no lugar de "Dono da plataforma", **Administrador geral**, o nome que o
  Diego usa).
- **Quem coloca alguém na central:** só o administrador geral, de dois jeitos:
  - **Novo acesso** com papel Central (convite ou senha provisória, como os outros);
  - **mover para a central** uma pessoa que já existe (ex.: a Jaine, hoje administradora da consultoria
    "IXC Consult" no banco local). Mover tira a pessoa da consultoria (`consultoria_id` nulo, papel
    `central`). O banco recusa se ela ainda for gestora de algum time (mesma regra de hoje).
- Editar nome, desativar e reativar quem está na central: só o administrador geral.
- **Nada no banco do Diego muda sozinho.** A migração só cria o papel; quem vai para a central é escolhido
  por ele na tela.

### O que a central vê e faz (etapa 1)

- **Ver:** onde hoje o banco diz "o dono vê tudo" (`private.sou_dono()` nas regras de `select`), passa a
  valer "dono ou central" (`private.vejo_tudo()`): consultorias, perfis, times, membros, clientes.
- **Consultorias:** menu Consultorias para dono e central; criar (com o primeiro administrador), renomear,
  arquivar e reativar. As Edge Functions `criar-consultoria` e `gerenciar-consultoria` aceitam `central`.
- **Administradores das consultorias:** criar (`criar-acesso`), editar nome, desativar e reativar
  (`gerenciar-acesso`) como o dono faz hoje.
- Integrações: continua de dono e administrador (a central não mexe nas conexões de cada consultoria).

## Etapa 2 — Clientes, distribuição, capacidade e check-ins

### O cliente

| Campo | Regra |
| --- | --- |
| Nome do cliente | obrigatório, 2 a 120 (nome fantasia) |
| Razão social | opcional, até 200 |
| CNPJ | opcional; máscara; dígitos verificadores conferidos (numérico e o **alfanumérico** novo da Receita); não se repete entre clientes |
| Cidade e UF | opcionais; UF entre as 27 |
| Contato principal: nome, telefone, e-mail | opcionais |
| **Previsão de horas por mês** | obrigatória, maior que 0, até 744 (aceita meia hora) |
| Observações | opcional, até 2.000 |
| Consultoria | definida ao **mandar para uma consultoria** (nula = na central, a distribuir) |
| Consultor | definido pelo **gestor da consultoria** (nulo = aguardando consultor) |

- O cliente é **da plataforma** (cadastrado pela central), não de uma consultoria. Por isso o CNPJ é único no
  sistema todo (contando os arquivados).

### Caminho do cliente

```
cadastrado (na central) → na consultoria, aguardando consultor → em atendimento
                                   ↑ mover para outra consultoria        ↻ trocar consultor
qualquer momento: arquivar ↔ reativar (central)
```

- **Mandar para uma consultoria** (central): escolhe a consultoria numa janela com a sugestão (abaixo). O
  cliente aparece para o gestor da consultoria com a marca "Novo".
- **Escolher o consultor** (administrador ou gestor da consultoria): janela com os consultores da equipe e a
  sugestão. A previsão do cliente passa a contar como reservada para o consultor.
- **Trocar o consultor** (mesma janela): a reserva passa para o novo; os check-ins já feitos continuam do
  consultor que trabalhou.
- **Mover para outra consultoria** (central): o cliente volta a "aguardando consultor" na consultoria nova;
  o consultor antigo sai. O histórico fica.
- **Arquivar/Reativar** (central): arquivado sai das listas e não reserva horas de ninguém; os dados ficam.
- **Apagar** (central): só com confirmação, e só enquanto não houver nada ligado ao cliente. Na etapa 2, um
  cliente com check-ins já tem algo ligado: o banco recusa e a tela oferece arquivar.

### Capacidade, reserva, realizado e ocupação

- **Carga semanal** do consultor: horas por semana (0 a 60, padrão 44), definida pelo administrador ou gestor
  da consultoria (e pela central). Quem não atende clientes pode ficar com 0 e não entra na sugestão.
- **Capacidade do mês** = dias úteis do mês (segunda a sexta) − feriados nacionais − dias de ausência, × carga
  semanal ÷ 5. Para o mês corrente, a sugestão usa o mês inteiro (não só o que falta).
- **Feriados nacionais** calculados pelo sistema (datas fixas e os móveis da Páscoa que são feriado
  nacional). Feriado municipal ou estadual entra como ausência.
- **Ausências** (férias, folga, licença, feriado local): período de/até e motivo, por consultor. Criadas,
  editadas e apagadas pelo administrador ou gestor da consultoria (e pela central).
- **Reservado** do consultor = soma da previsão mensal dos clientes ativos em que ele é o consultor.
- **Realizado** = soma das horas dos check-ins no mês (por consultor e por cliente).
- **Ocupação** = reservado ÷ capacidade do mês (em %). Capacidade 0 = não entra na sugestão.
- **Ocupação da consultoria** = (reservado dos consultores + previsão dos clientes aguardando consultor) ÷
  soma das capacidades dos consultores ativos.
- **Aviso** quando o realizado de um cliente no mês passa da previsão (na lista e na página do cliente).

### Sugestão

- **Mandar para uma consultoria:** consultorias ativas em ordem de **menor ocupação**; a primeira é a
  sugestão. A janela mostra as **8 primeiras** com busca por nome e "Mostrar mais" (busca e ordem no banco).
  Cada linha mostra ocupação, capacidade, reservado, número de consultores e de clientes.
- **Escolher o consultor:** consultores ativos da consultoria com capacidade > 0, em ordem de **menor
  ocupação**, mesmas regras (8 primeiros, busca, mais). Cada linha mostra ocupação, reservado/capacidade,
  realizado no mês e número de clientes, e a prévia "passa de 40% para 63%".
- Quem decide sempre é a pessoa; a sugestão é só a marca "Sugestão: menor ocupação".

### Check-ins

- **Check-in / check-out:** o consultor aperta "Fazer check-in" no cliente (guarda a hora de início) e
  "Fazer check-out" ao terminar (guarda o fim e pede o que foi feito). Só um check-in aberto por consultor.
- **Lançar depois:** o consultor registra um período passado (data, início, fim, o que foi feito).
- Horas = fim − início. Um check-in não pode passar de 24 h nem ficar no futuro.
- **Quem mexe:** o consultor cria, edita e apaga os dele; o administrador ou gestor da consultoria corrige e
  apaga os da equipe; a central vê todos. Check-in só em cliente ativo em que a pessoa é (ou foi, no caso de
  correção) o consultor.

### De quem é cada check-in

- Cada check-in guarda **quem trabalhou** (consultor) e **por qual consultoria** (a do cliente naquele
  momento). Ele não muda de dono quando o cliente troca de consultor ou de consultoria.
- **Quem vê:** o consultor vê e corrige os dele, mesmo depois que o cliente saiu dele (vê o nome do cliente no
  check-in, não a página do cliente); a consultoria vê só os check-ins feitos pela equipe dela; a central e o
  administrador geral veem todos. Uma consultoria nunca vê horas nem nomes de outra.
- O **realizado** de um consultor e de uma consultoria soma só os check-ins deles. Na página do cliente, cada
  consultoria vê as horas da própria equipe; a central vê o total e a divisão por consultoria.

### Quando alguém sai

- **Trocar o consultor, mover o cliente ou arquivar o cliente com check-in aberto:** o check-in é fechado na
  hora da mudança, com a nota "Encerrado ao trocar o consultor" (ou "ao mover", "ao arquivar").
- **Consultor desativado ou movido para a central:** os clientes dele voltam para "aguardando consultor" na
  mesma consultoria (fica no histórico) e o check-in aberto dele é fechado. A previsão desses clientes passa
  a contar como "aguardando consultor" na ocupação da consultoria.
- **Consultoria arquivada:** os clientes ativos dela voltam para "A distribuir" na central (a confirmação diz
  quantos) e os check-ins abertos são fechados. Os check-ins feitos continuam guardados.

### Meses

- O mês é contado no horário de São Paulo.
- Ausências são de dias inteiros e só descontam dias úteis. Check-ins do mesmo consultor não podem se
  sobrepor.
- Na Capacidade, **meses passados** mostram capacidade, realizado e utilização (realizado ÷ capacidade);
  **o mês atual e os seguintes** mostram também o reservado (pela previsão de hoje). A carga semanal não tem
  histórico por enquanto (vale a de hoje para todos os meses); se os painéis precisarem, ganha data de
  vigência depois.

### Histórico (para os painéis do futuro)

Cada passo do cliente fica registrado com data e autor (`cliente_eventos`): cadastrado, editado, mandado para
consultoria, movido, consultor escolhido, consultor trocado, previsão ajustada, arquivado, reativado. A página
do cliente mostra esse histórico. Os painéis estratégicos da central vão ler daí e dos check-ins.

## Telas

### Menu

- **Clientes** (`/clientes`), depois de Início, para todos os papéis. Ícone `RadioTower` e a animação nova
  `transmitir` (as 7 animações do trilho já estão em uso).
- **Capacidade** (`/capacidade`), para central, dono, administrador e gestor. Ícone e animação próprios
  (animação nova, seguindo a regra do `CLAUDE.md`).
- **Consultorias** passa a aparecer também para a central.

### Clientes (`/clientes`)

- **Central e administrador geral:** botão **Novo cliente**; abas **A distribuir**, **Nas consultorias**,
  **Arquivados**; busca (nome, razão social, cidade, CNPJ, sem acento) e filtro por consultoria e por
  consultor. Ações na linha: **Mandar para consultoria** (a distribuir), **Mover**, **Editar**, **Arquivar**
  / **Reativar**, **Apagar**.
- **Administrador e gestor da consultoria:** abas **Aguardando consultor** e **Em atendimento**; busca e
  filtro por consultor. Ações: **Escolher consultor** / **Trocar consultor**, **Ajustar previsão**.
- **Consultor:** "Meus clientes"; ações **Fazer check-in** / **Fazer check-out** e **Lançar horas**.
- Colunas conforme a aba: cliente (nome e razão social), cidade/UF, previsão e realizado no mês (com barra e
  aviso), consultoria, consultor (com "desativado" quando for o caso), desde quando.
- Paginação no banco acima de 15, total contado no banco.

### Página do cliente (`/clientes/:id`)

- Dados do cliente, consultoria, consultor, previsão × realizado no mês, check-ins (tabela paginada, com
  editar e apagar para quem pode) e histórico. As mesmas ações da lista, conforme o papel.
- É a página que ganha as abas da etapa 3.

### Capacidade (`/capacidade`)

- Tabela de consultores (de todas as consultorias para central e dono, com filtro de consultoria; só da
  equipe para administrador e gestor): carga semanal, capacidade do mês, reservado, realizado, ocupação,
  número de clientes. Em ordem de ocupação. Escolha do mês (anterior/próximo).
- Ações: **Editar carga** (janela com a carga semanal) e **Ausências** (janela com a lista de ausências do
  consultor e criar, editar e apagar).
- Para central e dono, uma segunda aba **Consultorias** com a ocupação de cada consultoria.

## CRUD por entidade

| Entidade | Criar | Consultar | Editar | Apagar |
| --- | --- | --- | --- | --- |
| Pessoa da central | dono | dono e central | dono (nome) | desativar/reativar: dono |
| Consultoria | dono, central | dono, central (todas); admin (a dele) | renomear: dono, central | arquivar/reativar: dono, central |
| Cliente | dono, central | conforme o papel (tabela de cima) | dados: dono, central; consultor: admin e gestor da consultoria; previsão: dono, central, admin e gestor da consultoria | arquivar/reativar e apagar (sem nada ligado): dono, central |
| Carga semanal | (vem com o usuário, padrão 44) | quem vê a Capacidade | admin e gestor da consultoria, central, dono | — (é um campo; zerar tira da sugestão) |
| Ausência | admin e gestor da consultoria, central, dono | os mesmos e o próprio consultor | os mesmos | os mesmos |
| Check-in | o consultor do cliente | o consultor, admin e gestor da consultoria, central, dono | o consultor (os dele), admin e gestor da consultoria | os mesmos de editar |
| Evento do histórico | o sistema | quem vê o cliente | — | — (histórico não se edita) |

## Banco (resumo)

- `perfis`: papel `central`; coluna `carga_semanal numeric(4,1) not null default 44` (0 a 60).
- Funções em `private`: `sou_central()`, `vejo_tudo()` (dono ou central), `opero_central()` (dono ou
  central), e as das regras de cliente, capacidade e check-in.
- `clientes`: campos acima + `consultoria_id` e `consultor_id` nulos, `horas_mes`, `arquivado_em`,
  `arquivado` (gerado), `busca` (gerado, sem acento), `criado_por`, `criado_em`, `atualizado_em`. Gatilhos:
  consultor precisa ser perfil ativo da consultoria do cliente; consultor exige consultoria; quem não é da
  central só muda `consultor_id` e `horas_mes`; histórico em `cliente_eventos`.
- `cliente_eventos`: cliente, tipo, de/para (consultoria, consultor, previsão), autor, quando. Só `select`
  pela API; quem grava são os gatilhos.
- `ausencias`: consultor, de, até, motivo.
- `checkins`: cliente, consultor, início, fim (nulo = aberto), descrição. Índice único de "um aberto por
  consultor". `cliente_id ... on delete restrict` (é o que impede apagar cliente com trabalho registrado).
- Funções de leitura (`security definer`, com a regra de quem pode dentro):
  `consultorias_por_ocupacao(busca, limite, deslocamento, mes)` e
  `consultores_por_ocupacao(consultoria, busca, limite, deslocamento, mes)`, que devolvem as linhas e o
  total, já em ordem de ocupação; e a relação calculada `consultor(clientes)` para mostrar o consultor na
  lista para quem não enxerga aquele perfil (o gestor só enxerga as pessoas dos times dele).
- Índices para cada lista e filtro (consultoria + arquivado + nome; consultor + arquivado; busca com
  trigramas; check-ins por cliente/consultor + início; ausências por consultor + período; eventos por
  cliente + data).
- **Escala:** reservado e realizado saem de somas com índice. Teste com volume (ex.: 200 consultorias, 3.000
  consultores, 50.000 clientes, 500.000 check-ins) dentro de uma transação desfeita no fim; se a janela de
  sugestão passar de ~200 ms, os totais passam a ser guardados por gatilho.

## Ligações futuras (não entram agora)

Etapa 3: agendas, videochamadas e transcrições (pelas integrações Google e IA que já existem), auditoria
inicial, plano de ação e arquivos. Cada uma terá `cliente_id references clientes on delete restrict`, aparece
como aba na página do cliente e, quando fizer sentido, gera check-in sozinha (ex.: videochamada de 1 h 30).
Painéis estratégicos da central: leem `cliente_eventos`, `checkins` e a capacidade.

## Fora do escopo agora

- Tudo da etapa 3 e os painéis.
- Filtro por região/estado na sugestão (aparece no fluxograma como ideia; o Diego não confirmou).
- Consultoria cadastrar cliente próprio (pela decisão 3, só a central cadastra).
- Vários consultores no mesmo cliente.
- Importar clientes de planilha ou do IXC; consulta do CNPJ na Receita.

## Testes

- **pgTAP:** o que cada papel vê e faz (tabelas acima), incluindo central × consultoria × consultor, outra
  consultoria não vê nada, desativado/senha provisória não veem nada; papel `central` sem consultoria; mover
  para a central; consultor válido; só central muda os dados do cliente; histórico gravado; CNPJ; capacidade
  (dias úteis, feriados, ausências) e ocupação com números conferidos à mão; check-in aberto único, sem
  futuro, até 24 h; apagar cliente com check-in recusado; índices; volume.
- **Integração** (Supabase local de verdade): Edge Functions com o papel `central` (criar consultoria e
  admin, mover para a central); o caminho completo central → consultoria → consultor → check-in, com o nome
  do consultor vindo da relação calculada e as funções de ocupação.
- **Tela:** cada lista (tabela pelo nome, Editar preenchido, paginação), janelas de mandar e escolher com a
  sugestão em primeiro, quem vê quais botões, check-in/check-out, Capacidade e Ausências, menu com os itens
  novos.

## Escolhas minhas (para conferir)

- **O administrador geral faz tudo o que a central faz** (inclusive cadastrar e distribuir clientes), além
  de cuidar de quem está na central.
- **A central vê também usuários e times** das consultorias (como o dono hoje), só para olhar.
- **CNPJ único no sistema todo**, porque o cliente é da plataforma.
- **Previsão de horas obrigatória** no cadastro (sem ela, a reserva não funciona). O gestor da consultoria
  pode ajustar, e o ajuste fica no histórico.
- **Carga semanal padrão de 44 h** (a do exemplo de 220 h por mês). Capacidade do mês pelos dias úteis, sem
  contar sábado.
- **Feriados municipais/estaduais entram como ausência**; os nacionais o sistema calcula.
- **Apagar cliente só sem check-ins**; com trabalho registrado, só arquivar.
- **Mover para outra consultoria** existe e devolve o cliente a "aguardando consultor".
- **Check-in com início e fim** (botão de check-in/check-out) e lançamento de um período passado.
- **Nome "Administrador geral"** no lugar de "Dono da plataforma" nas telas.
- **Menu Capacidade** separado, para a carga, as ausências e a ocupação de cada um. O consultor vê as próprias
  ausências em "Meu perfil".
- **Depois da revisão do design:**
  - check-in pertence a quem trabalhou e à consultoria daquele momento (seção "De quem é cada check-in");
  - mudança com check-in aberto fecha o check-in na hora;
  - consultor desativado ou movido para a central devolve os clientes a "aguardando consultor";
  - consultoria arquivada devolve os clientes ativos para "A distribuir";
  - meses passados na Capacidade mostram só capacidade e realizado; carga semanal sem histórico por enquanto;
  - consultoria ou consultor sem capacidade vai para o fim da sugestão; a marca "Novo" fica enquanto o
    cliente aguarda consultor.

## O que mudou na construção

- **Função extra `historico_do_cliente`** (migração `20261116170023`): devolve o histórico do cliente com os
  nomes visíveis só para a própria consultoria, para a página do cliente.
- **Administrador e gestor também têm "Meus clientes" e "Meus check-ins"**, porque qualquer usuário ativo da
  consultoria pode ser consultor.
- **Filtro de consultor** na lista de clientes da consultoria (todos, sem consultor ou um específico).

## Página do cliente em abas (pedido do Diego, 16/11)

Decisão do Diego: as informações de **cada cliente** ficam em abas dentro da página do cliente
(`/clientes/:id`), nesta ordem: **Geral · Agenda · Check-ins · Arquivos · Histórico**. A lista de Clientes não
muda. "Pode" (16/11) para o resumo abaixo.

- **Geral:** os dados do cliente e as ações de hoje (Editar, Mandar/Mover, Trocar consultor, Ajustar
  previsão, Check-in, Lançar horas, Arquivar, Apagar, conforme o papel) e três gráficos **deste cliente**:
  1. horas realizadas × previsão nos últimos 6 meses (barras do realizado e linha da previsão de hoje);
  2. horas por consultor no mês escolhido;
  3. check-ins por semana no mês escolhido.
  Os números vêm do banco e respeitam as regras: cada consultoria vê só as horas da própria equipe; a central
  vê todas.
- **Agenda:** calendário do mês (Anterior/Próximo) com, em cada dia, os check-ins (quem, quanto tempo, o que
  foi feito) e os passos do histórico (mandado, consultor escolhido, previsão ajustada…). Clicar no dia mostra
  os detalhes. Reuniões do Google Agenda ficam para a etapa 3.
- **Check-ins** e **Histórico:** as tabelas que já existem, cada uma na sua aba.
- **Arquivos:** os arquivos enviados ao cliente, **guardados no próprio sistema** (Storage do Supabase, bucket
  privado, pasta do cliente). Subir arrastando ou escolhendo o arquivo (até 25 MB), lista paginada com nome,
  tamanho, quem enviou e quando, **Baixar** (link temporário) e **Apagar** com confirmação.
  - Quem sobe: a central/dono e, na consultoria que atende o cliente, admin, gestor e o consultor do cliente.
  - Quem vê: como os check-ins — cada arquivo guarda a consultoria do momento do envio; a consultoria vê os
    arquivos enviados por ela e os enviados pela central; a central vê todos. Uma consultoria nunca vê
    arquivos de outra.
  - Quem apaga: quem enviou, admin/gestor da consultoria do arquivo e a central.
- A aba aberta fica no endereço (`?aba=agenda`), para voltar à mesma aba ao recarregar.
