-- Ocupação da central (consultorias_por_ocupacao e consultores_por_ocupacao sem consultoria): o realizado soma
-- os check-ins do mês de todas as consultorias. Sem este índice a soma lê a tabela inteira, que cresce com cada
-- mês de histórico; com ele, lê só o mês pedido. (Por consultoria, checkins_consultoria_idx já serve.)
-- Volume de teste com 600.000 check-ins (200.000 no mês): de ~95 para ~55 ms; mês passado vazio: de ~65 para ~12 ms.
create index checkins_inicio_idx on public.checkins (inicio);
