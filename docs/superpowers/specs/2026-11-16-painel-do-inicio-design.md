# Painel estratégico no Início — design

Data: 2026-11-16. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).

## Pedido do Diego

- "Crie uma dashboard na tela inicial de dados estratégicos." (16/11)
- Viu o esboço (central, números de exemplo) e escolheu: **"Todos, cada um no seu"** — todo papel vê o painel, no
  recorte que já enxerga no resto do app.
- Antes ele tinha dito: "A central vai precisar de dashboards estratégicas depois."
- Decisão do Diego (16/11), depois que a tela Capacidade saiu: **o gestor vê a capacidade da consultoria inteira no
  painel do Início** (ranking por consultor e extremos), não em Usuários — lá ele continua vendo só as pessoas dele.
  Por isso o ranking e os extremos do gestor cobrem todos os consultores da consultoria, como os do administrador.

## Objetivo, e o que seria falhar

- Abrir o app e saber, em segundos, como está o mês: quantos clientes, quem espera atendimento, quanto da capacidade
  está tomada, quantas horas já foram feitas, e onde agir (cliente parado, consultor estourado ou com folga).
- Falhar seria: número que não bate com as outras telas (Clientes, Usuários, Consultorias); uma consultoria vendo
  dados de outra; painel lento com milhares de clientes; número de mês passado com rótulo de "previsto/reservado"
  (a previsão não tem histórico).

## O que cada papel vê (mesmo layout, recorte diferente)

| Bloco | Central e dono | Administrador e gestor | Consultor (`pessoa`) |
|---|---|---|---|
| Indicadores do mês | clientes ativos (+ novos no mês), aguardando (a distribuir + sem consultor), ocupação, realizado | os mesmos, só da consultoria (aguardando = sem consultor) | meus clientes, minha ocupação, meu realizado |
| Horas por mês (6 meses até o mês escolhido) | realizado de todas | realizado da consultoria | meu realizado |
| Ranking de ocupação | por consultoria (até 8) → "Ver todas" leva à aba Ocupação do mês em Consultorias | por consultor (até 8) → "Ver todos" leva a Usuários | — |
| Clientes esperando há mais tempo (até 5) | a distribuir (desde o cadastro) e sem consultor (desde o envio) | sem consultor da consultoria (desde o envio) | — |
| Consultores nos extremos (até 3 + 3) | acima de 100% e com mais folga, de todas | da consultoria | — |
| Meus clientes no mês (até 5) | — | — | previsto e realizado de cada um |

- Mês escolhido com `NavegacaoDoMes` (o mesmo de Usuários). Mês passado segue a regra de `colunasDoMes`: mostra
  "Utilização" (realizado ÷ capacidade) e não mostra reservado/previsto.
- Horas por mês: barras do realizado (tem histórico, vem dos check-ins); a previsão aparece só como linha de
  referência "previsão atual", como já faz o gráfico do cliente — sem fingir previsão de meses passados.
- Cada item das listas leva à tela onde se age (cliente → página do cliente; consultor → Editar em Usuários;
  consultoria → aba Ocupação do mês).
- Vazio: frase curta no lugar do bloco ("Nenhum cliente esperando. Tudo distribuído."); erro: aviso no bloco, o
  resto do painel continua.

## Decisões minhas

- **Uma chamada ao banco por mês**: função `painel_do_inicio(p_mes)` (`security definer`, `search_path = ''`) que
  devolve um JSON com todos os blocos já no recorte de quem chama — reaproveita `private.ocupacao_dos_consultores`,
  `private.capacidades_do_mes` e as regras de visibilidade de `consultores_por_ocupacao`/`consultorias_por_ocupacao`.
  Nada calculado na tela; nada de buscar listas inteiras (limites no banco).
- Teste de volume (como `ocupacao_volume`): milhares de clientes, check-ins e pessoas; o painel responde dentro do
  limite.
- Gráficos em SVG próprio, como `GraficosDoCliente` (cores do tema, sem biblioteca nova).
- O painel só lê: não cria nada, então a regra de CRUD não se aplica; os links levam às telas que já têm as quatro
  operações.
- Sai o texto "Seus projetos vão aparecer aqui" e a ilustração `GraficoInicio` do Início (o Projetos saiu do menu).
  A saudação ("Olá, Jaine." e papel · onde) fica.
- Celular: indicadores em 2 colunas, blocos empilhados; largura total no computador (nada de `max-w`).

## Fora desta entrega

Exportar, filtros por consultoria/consultor dentro do painel, metas, comparação com o mês anterior em cada bloco,
painéis de auditoria e plano de ação.
