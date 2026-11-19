# Calendário — pendências e teste com o Google real

Data: 2026-11-17. Complementa `2026-11-16-calendario-design.md` (as decisões tomadas estão lá, em "Decisões tomadas
na construção"). Tudo abaixo é próximo passo: nada aqui impede o uso.

## Para o Diego decidir

- **Autor da pasta da reunião:** hoje a pasta nasce sem autor (só gestão e central renomeiam/apagam). Proposta: o
  organizador aparece como autor.
- **O que conta como "reunião":** o indicador do topo conta "com cliente ou com Meet"; o filtro "Mostrar → Reuniões
  com cliente" conta só "com cliente". Escolher uma definição.
- **Os 4 números do topo** ignoram os filtros da barra (a central filtrando uma consultoria vê o total de todas).
- **Cores do avatar nos eventos de várias pessoas:** turquesa, laranja, verde e mostarda ficam com contraste baixo
  com o texto branco. Dá para corrigir só na tela (o chip usa um tom mais escuro da mesma cor), sem mudar a cor que
  a pessoa escolheu; mudar também a bolinha do avatar seria outra decisão.

## Teste de ponta a ponta com o Google real (depois de criar o app do Google)

- Gravação no Meet: ligar a gravação e a transcrição automáticas num espaço criado pelo Calendar (escopo
  `meetings.space.settings`) e desligar (`OFF`).
- O código do Meet do Calendar aceito como `spaces/{código}` e no filtro de `conferenceRecords`.
- Restaurar um evento cancelado (`status: confirmed`) volta com convidados e Meet.
- Transcrição: nomes de quem falou, entradas paginadas, reunião que cai e volta (dois registros).
- Gravação: quem tem acesso ao link do Drive.
- Convites por e-mail (`sendUpdates=all`), indo para o e-mail do Google conectado.
- Conexão: `prompt=consent` + `offline` devolve sempre o token de renovação; escopos devolvidos.
- Desconectar revoga o app inteiro naquela conta (a integração da consultoria cai junto se for a mesma conta).
- App "Interno" na IXCSoft × "Externo" para outros domínios (verificação; em modo de teste o token vence em 7 dias).
- Na nuvem: `reunioes_depois_url` no Vault, 200 em `net._http_response`, tempo máximo da Edge Function.
- O 403 de limite de pedidos vira "tentar de novo".

## Próximos passos técnicos (raros ou de melhoria)

- Ler no Google a resposta de quem responde por lá (de fora e da casa); hoje fica "Convite enviado".
- Remarcar uma reunião no meio de uma busca da rotina pode deixar "Sem gravação" ou "Erro" até "Tentar de novo"
  (corrigir conferindo o `fim` na gravação da situação).
- Remarcar não limpa o link da gravação anterior.
- Reunião que cai e volta com uma parte presa em "processando": às 48 h, criar a pasta com as partes prontas.
- Vazão com ~1.000 consultores: trocar os lotes da rotina por uma fila contínua e separar a IA.
- O link "Pasta da reunião" leva a "Cliente não encontrado" para o organizador que não é o consultor do cliente.
- Apagar a pasta da reunião deixa a reunião em "Pasta criada" sem pasta.
- Reunião com organizador reativado continua em erro até "Tentar de novo".
- `JanelaEvento.jsx` grande (dividir), pisca ao recarregar, selo do Google enquanto carrega, "hoje" fixo na
  montagem, nome do feriado deduzido na tela.
- Testes: retomada da pasta pela metade, StrictMode na volta do Google, setas do mês, fluxo da central na janela.
