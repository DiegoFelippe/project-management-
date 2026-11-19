-- Gráficos da aba Geral do cliente, a faixa "Hoje" e as horas por dia (design 2026-11-17-graficos-do-inicio-e-do-
-- cliente, "Cliente → Geral"; plano, Task 3):
-- - Nova hoje_do_cliente (definer): a previsão do mês, o último check-in, a próxima reunião, o quadro e o check-list de
--   hoje, no recorte de quem vê o cliente (vejo_cliente, vejo_quadro, eventos_do_cliente e checklist_do_cliente).
-- - Nova horas_do_cliente_por_dia (invoker, como as outras do cliente: o RLS de checkins decide) e
--   horas_do_cliente_por_mes com p_ate (sai e volta: drop + create).
-- - Ajudantes: private.projecao_do_mes (pura, liberada para a função invoker) e private.ritmo_do_mes.
-- - Acréscimos da revisão da T2: ranking_resumo do painel_do_inicio ganha sem_capacidade; a conta de
--   checkins_por_semana vai para private.semanas_de_checkins, que recebe o dia de hoje (o teste fixa o dia da semana).
-- Só acrescenta funções. Nenhuma linha de tabela nenhuma muda.

begin;

-- ── Projeção e ritmo do mês ──────────────────────────────────────────────────
-- No ritmo de até hoje, quanto o mês fecha: nula antes do dia 7 (no dia 2, diria "vai fechar com 0 h").
create function private.projecao_do_mes(p_realizado numeric, p_dia int, p_dias_no_mes int) returns numeric
language sql immutable set search_path = '' as $$
  select case when p_dia >= 7 then round(p_realizado / p_dia * p_dias_no_mes, 1) end
$$;

-- A projeção contra a previsão: acima de 105% vai passar, abaixo de 70% está abaixo do ritmo; sem projeção, nulo.
create function private.ritmo_do_mes(p_projecao numeric, p_previsao numeric) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_projecao is null or coalesce(p_previsao, 0) <= 0 then null
    when p_projecao > p_previsao * 1.05 then 'acima'
    when p_projecao < p_previsao * 0.7 then 'abaixo'
    else 'no_ritmo' end
$$;

-- ── Faixa "Hoje" do cliente ──────────────────────────────────────────────────
-- A situação de hoje do cliente (não muda com o mês dos gráficos). Sessão não liberada: sem_permissao; quem não vê o
-- cliente (vejo_cliente) recebe nulo, sem saber se ele existe.
-- - previsao: o realizado do mês atual com os check-ins fechados que a pessoa enxerga (a regra do RLS de checkins, a
--   mesma de realizado_no_mes e da lista de Clientes), a projeção (private.projecao_do_mes) e o ritmo dela.
-- - checkin: o último check-in do cliente na consultoria atual dele, de qualquer consultor (a central: de qualquer
--   consultoria), só a data, e os dias com check-in nos últimos 30 (hoje e os 29 antes), com o mesmo recorte.
--   situacao pela regra do risco (private.risco_dos_clientes): em_risco quando ele diz sem_checkin; senão atencao a
--   partir de 14 dias e em_dia abaixo disso, contados como lá (desde o último check-in na consultoria ou, sem nenhum,
--   desde que ganhou o consultor); nula sem consultor e no arquivado.
-- - reuniao: a próxima de eventos_do_cliente (a mesma regra de quem vê cada evento).
-- - quadro: o do cliente na consultoria atual, se a pessoa o vê, com as contas de indicadores_do_quadro sem filtros.
--   Nunca cria quadro.
-- - checklist: o aberto, de checklist_do_cliente (as mesmas contas e a mesma próxima), e as atrasadas por etapa
--   (pendentes vencidas antes de hoje: "não se aplica" nunca atrasa). Sem modelo, nulo.
create function public.hoje_do_cliente(p_cliente uuid)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_hoje date := private.hoje();
  v_mes date := date_trunc('month', private.hoje()::timestamp)::date;
  v_dias_no_mes int := extract(day from date_trunc('month', private.hoje()::timestamp) + interval '1 month - 1 day')::int;
  v_cliente public.clientes;
  v_central boolean;
  v_gestao uuid;
  v_realizado numeric;
  v_projecao numeric;
  v_ultimo date;
  v_sem_checkin boolean;
  v_dias int;
  v_reuniao uuid;
  v_quadro uuid;
  v_lista jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select * into v_cliente from public.clientes c where c.id = p_cliente;
  if not found or not private.vejo_cliente(v_cliente.consultoria_id, v_cliente.consultor_id) then
    return null;
  end if;
  v_central := private.sou_central();
  v_gestao := case when private.gerencio_consultoria(private.consultoria_atual()) then private.consultoria_atual() end;

  -- O RLS de checkins (central: todos; gestão: os da consultoria dela; o consultor: os dele), aqui à mão (definer).
  select coalesce(round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1), 0) into v_realizado
  from public.checkins k
  where k.cliente_id = p_cliente
    and k.fim is not null
    and k.inicio >= v_mes::timestamp at time zone 'America/Sao_Paulo'
    and k.inicio < (v_mes + interval '1 month') at time zone 'America/Sao_Paulo'
    and (v_central or k.consultoria_id = v_gestao or k.consultor_id = v_eu);
  v_projecao := private.projecao_do_mes(v_realizado, extract(day from v_hoje)::int, v_dias_no_mes);

  select (k.inicio at time zone 'America/Sao_Paulo')::date into v_ultimo
  from public.checkins k
  where k.cliente_id = p_cliente and (v_central or k.consultoria_id = v_cliente.consultoria_id)
  order by k.inicio desc limit 1;

  select r.sem_checkin, r.sem_checkin_dias into v_sem_checkin, v_dias
  from private.risco_dos_clientes(null, null, p_cliente) r;

  v_reuniao := (public.eventos_do_cliente(p_cliente) ->> 'proximo')::uuid;

  select q.id into v_quadro from public.quadros q
  where q.cliente_id = p_cliente and q.consultoria_id = v_cliente.consultoria_id;
  if v_quadro is not null and not private.vejo_quadro(v_quadro) then
    v_quadro := null;
  end if;

  v_lista := public.checklist_do_cliente(p_cliente);

  return jsonb_build_object(
    'arquivado_em', v_cliente.arquivado_em,
    'previsao', jsonb_build_object('horas_mes', v_cliente.horas_mes, 'realizado', v_realizado,
      'dia', extract(day from v_hoje)::int, 'dias_no_mes', v_dias_no_mes, 'projecao', v_projecao,
      'ritmo', private.ritmo_do_mes(v_projecao, v_cliente.horas_mes)),
    'checkin', jsonb_build_object('ultimo', v_ultimo, 'dias_sem', v_hoje - v_ultimo,
      'situacao', case when v_sem_checkin then 'em_risco' when v_dias >= 14 then 'atencao'
        when v_dias is not null then 'em_dia' end,
      'dias_com_checkin', (
        select coalesce(jsonb_agg(x.dia order by x.dia), '[]'::jsonb)
        from (
          select distinct (k.inicio at time zone 'America/Sao_Paulo')::date as dia
          from public.checkins k
          where k.cliente_id = p_cliente
            and k.inicio >= (v_hoje - 29)::timestamp at time zone 'America/Sao_Paulo'
            and (v_central or k.consultoria_id = v_cliente.consultoria_id)
        ) x)),
    'reuniao', (
      select jsonb_build_object('id', e.id, 'inicio', e.inicio, 'titulo', e.titulo, 'com_meet', e.com_meet)
      from public.agenda_eventos e where e.id = v_reuniao),
    'quadro', case when v_quadro is not null then
      jsonb_build_object('id', v_quadro) || (public.indicadores_do_quadro(v_quadro) - 'vencem_em_7_dias') end,
    'checklist', case when jsonb_typeof(v_lista -> 'checklist') = 'object' then jsonb_build_object(
      'modelo_nome', v_lista #> '{checklist,modelo_nome}',
      'tarefas', v_lista #> '{resumo,tarefas}',
      'feitas', v_lista #> '{resumo,feitas}',
      'nao_se_aplica', v_lista #> '{resumo,nao_se_aplica}',
      'atrasadas', v_lista #> '{resumo,atrasadas}',
      'proxima', nullif(v_lista #> '{resumo,proxima}', 'null'::jsonb) - 'id',
      'etapas', (
        select coalesce(jsonb_agg((x.e - 'posicao') || jsonb_build_object('atrasadas', coalesce(a.n, 0)) order by x.o),
          '[]'::jsonb)
        from jsonb_array_elements(v_lista -> 'etapas') with ordinality x(e, o)
        left join (
          select t.etapa_id, count(*) as n
          from public.checklist_tarefas t
          where t.checklist_id = (v_lista #>> '{checklist,id}')::uuid
            and t.estado in ('a_fazer', 'andamento') and t.vence_em < v_hoje
          group by t.etapa_id
        ) a on a.etapa_id = (x.e ->> 'id')::uuid)) end);
end $$;

-- ── Horas por dia do cliente ─────────────────────────────────────────────────
-- O mês (p_mes: qualquer dia dele; nulo = o atual) dia a dia, com as horas fechadas que começam em cada dia (São Paulo)
-- e o acumulado; no mês atual, os dias até hoje e a projeção (private.projecao_do_mes); num mês passado, todos os dias
-- e projeção nula; no futuro, nenhum dia. security invoker: o RLS de checkins decide o que cada um soma, e o de
-- clientes, se a previsão aparece. O começo e o fim do mês saem prontos de ref: com o RLS, o Postgres só leva ao
-- índice uma comparação sem função que não seja leakproof (como em horas_do_cliente_por_mes).
create function public.horas_do_cliente_por_dia(p_cliente uuid, p_mes date default null)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ref as (
    select x.mes, x.hoje, (x.mes + interval '1 month - 1 day')::date as fim,
      x.mes::timestamp at time zone 'America/Sao_Paulo' as de,
      (x.mes + interval '1 month') at time zone 'America/Sao_Paulo' as ate
    from (select date_trunc('month', coalesce(p_mes::timestamp, now() at time zone 'America/Sao_Paulo'))::date as mes,
      (now() at time zone 'America/Sao_Paulo')::date as hoje) x
  ), somas as (
    select (k.inicio at time zone 'America/Sao_Paulo')::date as dia, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from ref
    join public.checkins k on k.cliente_id = p_cliente and k.fim is not null and k.inicio >= ref.de and k.inicio < ref.ate
    group by 1
  ), dias as (
    select g::date as dia, coalesce(s.segundos, 0) as segundos,
      sum(coalesce(s.segundos, 0)) over (order by g) as acumulado
    from ref
    cross join lateral generate_series(ref.mes::timestamp, least(ref.fim, ref.hoje)::timestamp, interval '1 day') g
    left join somas s on s.dia = g::date
  ), total as (
    select coalesce(round(sum(s.segundos) / 3600, 1), 0) as realizado from somas s
  )
  select jsonb_build_object(
    'mes', ref.mes,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'horas', round(d.segundos / 3600, 1),
        'acumulado', round(d.acumulado / 3600, 1)) order by d.dia)
      from dias d), '[]'::jsonb),
    'realizado', total.realizado,
    'previsao', (select c.horas_mes from public.clientes c where c.id = p_cliente),
    'projecao', case when ref.mes = date_trunc('month', ref.hoje::timestamp)::date then
      private.projecao_do_mes(total.realizado, extract(day from ref.hoje)::int, extract(day from ref.fim)::int) end,
    'dias_no_mes', extract(day from ref.fim)::int)
  from ref, total
$$;

-- ── Horas por mês do cliente ─────────────────────────────────────────────────
-- Mesmo corpo de 20261116184025_graficos_do_cliente.sql; muda só:
-- - p_ate escolhe o último mês (qualquer dia dele; nulo ou depois do atual = o atual). Sai e volta (um parâmetro novo
--   não entra com create or replace); a chamada com 1 ou 2 argumentos continua valendo, pelos padrões;
-- - o começo e o fim de cada mês saem prontos de meses (materialized). Calculados dentro da subconsulta, eles passavam
--   por funções que não são leakproof, e com o RLS de checkins o Postgres não os usava no índice: cada mês lia todos os
--   check-ins do cliente (24 meses de um cliente com 5.000 check-ins: ~100 ms; assim, ~7 ms).
drop function public.horas_do_cliente_por_mes(uuid, int);
create function public.horas_do_cliente_por_mes(p_cliente uuid, p_meses int default 6, p_ate date default null)
returns table (mes date, realizado numeric)
language sql stable security invoker set search_path = '' as $$
  with ref as (
    select least(date_trunc('month', coalesce(p_ate::timestamp, now() at time zone 'America/Sao_Paulo')),
        date_trunc('month', now() at time zone 'America/Sao_Paulo'))::date as atual,
      greatest(1, least(coalesce(p_meses, 6), 24)) as n
  ), meses as materialized (
    select x.mes, x.mes::timestamp at time zone 'America/Sao_Paulo' as de,
      (x.mes + interval '1 month') at time zone 'America/Sao_Paulo' as ate
    from (select (ref.atual - make_interval(months => g))::date as mes
      from ref, generate_series(ref.n - 1, 0, -1) g) x
  )
  select m.mes,
    coalesce((
      select round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1)
      from public.checkins k
      where k.cliente_id = p_cliente
        and k.fim is not null
        and k.inicio >= m.de
        and k.inicio < m.ate
    ), 0)
  from meses m
  order by m.mes
$$;

-- ── Painel do Início ─────────────────────────────────────────────────────────
-- Mesmo corpo de 20261118130156_graficos_do_inicio.sql; muda só: ranking_resumo ganha sem_capacidade (as unidades sem
-- capacidade, de ocupação nula, que ficaram fora da lista: vão para o fim da ordem) e no_meio deixa de contá-las. Assim
-- a tela escreve "… N no meio" só com quem tem capacidade.
create or replace function public.painel_do_inicio(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_intervalo boolean;
  v_inicio date;       -- mês do painel: o pedido (Mês) ou o do fim do período (links para Usuários e Consultorias)
  v_de_dia date;       -- primeiro dia do período (inclusive)
  v_ate_dia date;      -- último dia do período (inclusive)
  v_ate_efetivo date;  -- o fim, nunca depois de hoje (antes de v_de_dia: período efetivo vazio, um Mês futuro)
  v_de timestamptz;    -- [v_de, v_ate): o período em instantes de São Paulo
  v_ate timestamptz;
  v_cheio_de date;     -- meses inteiros dentro do período, [v_cheio_de, v_cheio_ate): saem do resumo por mês
  v_cheio_ate date;
  v_borda1_de timestamptz; -- bordas (pedaços de mês) lidas direto dos check-ins: [v_de, v_cheio_de) e [v_cheio_ate, v_ate)
  v_borda1_ate timestamptz;
  v_borda2_de timestamptz;
  v_borda2_ate timestamptz;
  v_graf_de date;      -- primeiro mês do gráfico (o último é v_inicio)
  v_passado boolean;   -- sem previsão: mês passado ou qualquer período
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_em_atendimento int; -- clientes no fim do período efetivo
  v_a_distribuir int;
  v_sem_consultor int;
  v_checkins int;       -- check-ins fechados do consultor no período efetivo (só no recorte pessoa)
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.mes, p.de, p.ate, p.ate_efetivo, p.intervalo, p.passado
  into v_inicio, v_de_dia, v_ate_dia, v_ate_efetivo, v_intervalo, v_passado
  from private.periodo_do_inicio(p_mes, p_de, p_ate) p;

  v_de := v_de_dia::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (v_ate_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
  -- Primeiro mês inteiro: o do início, se começa no dia 1, senão o seguinte; fim (exclusivo): o mês do fim, se acaba
  -- no último dia, senão o próprio mês do fim. Sem mês inteiro, o período todo é borda.
  v_cheio_de := date_trunc('month', (v_de_dia - 1) + interval '1 month')::date;
  v_cheio_ate := date_trunc('month', (v_ate_dia + 1)::timestamp)::date;
  if v_cheio_de >= v_cheio_ate then
    v_cheio_de := v_ate_dia + 1;
    v_cheio_ate := v_ate_dia + 1;
    v_borda1_de := v_de;
    v_borda1_ate := v_ate;
    v_borda2_de := v_ate;
    v_borda2_ate := v_ate;
  else
    v_borda1_de := v_de;
    v_borda1_ate := v_cheio_de::timestamp at time zone 'America/Sao_Paulo';
    v_borda2_de := v_cheio_ate::timestamp at time zone 'America/Sao_Paulo';
    v_borda2_ate := v_ate;
  end if;
  -- Gráfico: os meses tocados pelo período, no mínimo 6 e no máximo 24, terminando no mês do fim.
  v_graf_de := least((v_inicio - interval '5 months')::date,
    greatest(date_trunc('month', v_de_dia::timestamp)::date, (v_inicio - interval '23 months')::date));

  -- Clientes no fim do período efetivo: agora (a regra de indicadores_de_clientes), se ele vai até hoje; num período
  -- passado, pela história, no último instante do último dia.
  if v_ate_efetivo >= v_hoje then
    select count(*) filter (where c.consultor_id is not null),
      count(*) filter (where c.consultoria_id is null),
      count(*) filter (where c.consultoria_id is not null and c.consultor_id is null)
    into v_em_atendimento, v_a_distribuir, v_sem_consultor
    from public.clientes c
    where not c.arquivado
      and (v_recorte = 'tudo'
        or (v_recorte = 'consultoria' and c.consultoria_id = v_consultoria)
        or (v_recorte = 'pessoa' and c.consultoria_id = v_consultoria and c.consultor_id = v_eu));
  else
    select s.em_atendimento, s.a_distribuir, s.sem_consultor
    into v_em_atendimento, v_a_distribuir, v_sem_consultor
    from private.situacao_no_instante(v_recorte, v_consultoria, v_eu,
      (v_ate_efetivo + 1)::timestamp at time zone 'America/Sao_Paulo' - interval '1 microsecond') s;
  end if;

  if v_recorte = 'pessoa' then
    select count(*)::int into v_checkins
    from public.checkins k
    where k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_de and k.inicio < (v_ate_efetivo + 1)::timestamp at time zone 'America/Sao_Paulo';
  end if;

  with
  -- Consultores no recorte (todos da consultoria; só quem chama, no recorte pessoa), com os números do mês (Mês) ou
  -- do período (utilização, sem reservado; meses inteiros pelo resumo por consultor, capacidade até hoje). Só um dos
  -- dois lados roda: o outro tem o filtro sempre falso.
  quem as (
    select p.id, p.nome, p.consultoria_id, co.nome as consultoria_nome,
      x.capacidade, x.reservado, x.realizado, x.taxa
    from (
      -- Mês da central e da consultoria: como antes (a mesma conta de Usuários e Consultorias).
      select o.id, o.capacidade, o.reservado, o.realizado, o.taxa
      from private.ocupacao_dos_consultores(v_consultoria, v_inicio, null) o
      where not v_intervalo and v_recorte <> 'pessoa'
      union all
      -- Mês do consultor: a mesma conta, com o mês inteiro pelo resumo por consultor (sem ler check-ins) e o reservado
      -- da carteira dele na consultoria (taxa = reservado / capacidade; no mês passado, realizado / capacidade).
      select o.id, o.capacidade, coalesce(w.horas, 0), o.realizado,
        case when o.capacidade > 0 then (case when v_passado then o.realizado else coalesce(w.horas, 0) end) / o.capacidade end
      from private.ocupacao_do_periodo(v_consultoria, v_de_dia, v_ate_dia, array[v_eu]) o
      left join (
        select sum(c.horas_mes) as horas from public.clientes c
        where not c.arquivado and c.consultor_id = v_eu and c.consultoria_id = v_consultoria
      ) w on true
      where not v_intervalo and v_recorte = 'pessoa'
      union all
      -- Período: utilização, com a capacidade só até hoje (nada no futuro: o realizado também só vai até agora).
      select o.id, o.capacidade, 0::numeric, o.realizado, o.taxa
      from private.ocupacao_do_periodo(v_consultoria, v_de_dia, least(v_ate_dia, v_hoje),
        case when v_recorte = 'pessoa' then array[v_eu] end) o
      where v_intervalo
    ) x
    join public.perfis p on p.id = x.id
    left join public.consultorias co on co.id = p.consultoria_id
  ),
  -- Por consultoria (tudo e consultoria), como consultorias_por_ocupacao: reservado inclui quem espera consultor.
  -- Só no Mês (no período não há reservado).
  carteiras as (
    select c.consultoria_id, sum(c.horas_mes) as horas
    from public.clientes c
    where v_recorte <> 'pessoa'
      and not v_intervalo
      and not c.arquivado
      and c.consultoria_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
    group by c.consultoria_id
  ),
  -- Horas fechadas por consultoria e mês (tabela resumo, mantida por gatilho), lidas uma vez só nos meses do
  -- gráfico: delas saem as barras e os meses inteiros do realizado (que estão sempre entre os meses do gráfico,
  -- porque o período tem no máximo 2 anos).
  historico as (
    select r.consultoria_id, r.mes, r.segundos
    from public.checkins_horas_mes r
    where v_recorte <> 'pessoa'
      and r.mes >= v_graf_de and r.mes <= v_inicio
      and (v_consultoria is null or r.consultoria_id = v_consultoria)
  ),
  -- Realizado do período por consultoria: os meses inteiros vêm do resumo; as bordas (pedaços de mês), direto dos
  -- check-ins fechados. No Mês não há borda: é o resumo do mês, como antes.
  feitos as (
    select t.consultoria_id, sum(t.segundos) as segundos
    from (
      select h.consultoria_id, h.segundos
      from historico h
      where h.mes >= v_cheio_de and h.mes < v_cheio_ate
      union all
      -- Uma borda por vez: cada uma é uma faixa só do índice por data (juntas num "ou", o planejador lia a tabela toda).
      select k.consultoria_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where v_recorte <> 'pessoa'
        and k.fim is not null
        and k.inicio >= v_borda1_de and k.inicio < v_borda1_ate
        and (v_consultoria is null or k.consultoria_id = v_consultoria)
      union all
      select k.consultoria_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where v_recorte <> 'pessoa'
        and k.fim is not null
        and k.inicio >= v_borda2_de and k.inicio < v_borda2_ate
        and (v_consultoria is null or k.consultoria_id = v_consultoria)
    ) t
    group by t.consultoria_id
  ),
  equipes as (
    select q.consultoria_id, sum(q.capacidade) as capacidade, count(*) as pessoas from quem q group by q.consultoria_id
  ),
  cons as (
    select co.id, co.nome,
      coalesce(e.capacidade, 0) as capacidade,
      coalesce(e.pessoas, 0) as pessoas,
      coalesce(w.horas, 0) as reservado,
      coalesce(round(f.segundos / 3600, 1), 0) as realizado,
      coalesce(f.segundos, 0) as realizado_segundos
    from public.consultorias co
    left join equipes e on e.consultoria_id = co.id
    left join carteiras w on w.consultoria_id = co.id
    left join feitos f on f.consultoria_id = co.id
    where v_recorte <> 'pessoa'
      and co.arquivada_em is null
      and (v_consultoria is null or co.id = v_consultoria)
  ),
  cons_taxa as (
    select c.*, case when c.capacidade > 0 then
      (case when v_passado then c.realizado else c.reservado end) / c.capacidade end as taxa
    from cons c
  ),
  -- Realizado total: soma os SEGUNDOS e divide e arredonda uma vez só, no fim (a barra do mês no gráfico faz igual).
  -- Somar horas já divididas (ou arredondadas) por consultoria perde frações: 3 s + 3 s + 174 s dão 0,1 h, não 0,0.
  totais as (
    select coalesce(sum(t.capacidade), 0) as capacidade, coalesce(sum(t.reservado), 0) as reservado,
      round(coalesce(sum(t.segundos), 0) / 3600, 1) as realizado
    from (
      select capacidade, reservado, realizado_segundos as segundos from cons
      union all
      select capacidade, reservado, realizado * 3600 from quem where v_recorte = 'pessoa'
    ) t
  ),
  totais_taxa as (
    select t.*, case when t.capacidade > 0 then
      (case when v_passado then t.realizado else t.reservado end) / t.capacidade end as taxa
    from totais t
  ),
  -- Realizado de cada mês do gráfico (mês inteiro; tem histórico nos check-ins).
  meses as (
    select g::date as mes
    from generate_series(v_graf_de::timestamp, v_inicio::timestamp, interval '1 month') g
  ),
  horas as (
    select h.mes, round(sum(h.segundos) / 3600, 1) as horas
    from historico h
    where h.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by h.mes
    union all
    -- Consultor: os meses do gráfico pelo resumo por consultor (mês inteiro, como antes, sem ler check-ins).
    select r.mes, round(sum(r.segundos) / 3600, 1) as horas
    from private.checkins_horas_consultor_mes r
    where v_recorte = 'pessoa' and r.consultor_id = v_eu
      and r.mes >= v_graf_de and r.mes <= v_inicio
      and (v_consultoria is null or r.consultoria_id = v_consultoria)
      and r.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by r.mes
  ),
  -- Capacidade de cada mês do gráfico (a mesma conta de capacidades_do_periodo; o mês em andamento até hoje).
  capacidades as (
    select x.mes, x.capacidade
    from private.capacidades_por_mes(v_consultoria, case when v_recorte = 'pessoa' then array[v_eu] end, v_graf_de, v_inicio) x
  ),
  -- Ocupação por unidade: consultorias (central) ou consultores (gestão), do mais ao menos ocupado.
  unidades as (
    select c.id, c.nome, c.taxa, c.capacidade, c.realizado, c.reservado, c.pessoas
    from cons_taxa c where v_recorte = 'tudo'
    union all
    select q.id, q.nome, q.taxa, q.capacidade, q.realizado, q.reservado, null::bigint
    from quem q where v_recorte = 'consultoria'
  ),
  ordem as (
    select u.*, row_number() over (order by u.taxa desc nulls last, u.nome, u.id) as o, count(*) over () as total
    from unidades u
  ),
  -- Até 12, todos; com mais, os 6 mais ocupados e, dos outros, os 6 com mais folga (sem capacidade fica por último).
  mostradas as (
    select o.id from ordem o where o.total <= 12 or o.o <= 6
    union all
    select b.id
    from (
      select o.id, row_number() over (order by o.taxa asc nulls last, o.nome, o.id) as baixo
      from ordem o where o.total > 12 and o.o > 6
    ) b
    where b.baixo <= 6
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'mes', v_inicio,
    'intervalo', v_intervalo,
    'de', v_de_dia,
    'ate', v_ate_dia,
    'ate_efetivo', v_ate_efetivo,
    'passado', v_passado,
    -- No período, a capacidade conta só até hoje (dias que ainda não aconteceram não entram); no Mês, nulo.
    'capacidade_ate', case when v_intervalo then least(v_ate_dia, v_hoje) end,
    'indicadores', jsonb_build_object(
      'realizado', (select realizado from totais),
      'capacidade', (select capacidade from totais),
      -- A capacidade do período efetivo: no Mês atual, de 1º até hoje; no mês passado e no período, a capacidade; no
      -- Mês futuro (período efetivo vazio), 0.
      'capacidade_ate_hoje', case
        when v_ate_efetivo < v_de_dia then 0
        when not v_intervalo and v_inicio = v_mes_atual then
          (select coalesce(sum(c.capacidade), 0) from capacidades c where c.mes = v_mes_atual)
        else (select capacidade from totais) end,
      'reservado', (select case when not v_passado then reservado end from totais),
      'ocupacao', (select round(taxa, 4) from totais_taxa),
      'clientes_em_atendimento', v_em_atendimento,
      'aguardando', v_a_distribuir + v_sem_consultor,
      'a_distribuir', v_a_distribuir,
      'sem_consultor', v_sem_consultor,
      'checkins', v_checkins),
    'horas_por_mes', (
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'realizado', coalesce(h.horas, 0),
        'capacidade', coalesce(c.capacidade, 0),
        'no_periodo', m.mes >= date_trunc('month', v_de_dia::timestamp)::date,
        'parcial', m.mes = v_mes_atual) order by m.mes)
      from meses m
      left join horas h on h.mes = m.mes
      left join capacidades c on c.mes = m.mes),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'ocupacao', round(o.taxa, 4),
        'capacidade', o.capacidade, 'realizado', o.realizado,
        'reservado', case when not v_passado then o.reservado end)
        || case when v_recorte = 'tudo' then jsonb_build_object('pessoas', o.pessoas)
             else jsonb_build_object('visivel', private.vejo_perfil(o.id)) end
        order by o.o)
      from ordem o
      where o.id in (select m.id from mostradas m)), '[]'::jsonb),
    'ranking_resumo', (
      select jsonb_build_object('total', count(*),
        'acima', count(*) filter (where round(o.taxa, 4) > 1),
        'folga', count(*) filter (where round(o.taxa, 4) < 0.7),
        'no_meio', count(*) filter (where o.taxa is not null and o.id not in (select m.id from mostradas m)),
        'sem_capacidade', count(*) filter (where o.taxa is null and o.id not in (select m.id from mostradas m)))
      from ordem o)
  ) into v_resultado;

  return v_resultado;
end $$;

-- ── Check-ins por semana ─────────────────────────────────────────────────────
-- Mesmo corpo de 20261118130156_graficos_do_inicio.sql; muda só: a conta vai para private.semanas_de_checkins, que
-- recebe o recorte, o período efetivo e o dia de hoje (o teste fixa o dia da semana: a semana de hoje nunca entra na
-- média, nem num domingo). A função pública só resolve o recorte e o período, com as mesmas recusas.
create function private.semanas_de_checkins(p_recorte text, p_consultoria uuid, p_eu uuid, p_de date,
  p_ate_efetivo date, p_hoje date)
returns jsonb
language plpgsql stable
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_ini date;
  v_fim date;
  v_resultado jsonb;
begin
  if p_ate_efetivo < p_de then
    return jsonb_build_object('semanas', '[]'::jsonb, 'media', null, 'pico', null);
  end if;

  v_ini := date_trunc('week', p_de::timestamp)::date;
  v_fim := date_trunc('week', p_ate_efetivo::timestamp)::date;
  if v_fim - v_ini < 7 * 7 then
    v_ini := v_fim - 7 * 7;
  end if;

  with semanas as (
    select g::date as semana
    from generate_series(v_ini::timestamp, v_fim::timestamp, interval '1 week') g
  ),
  feitos as (
    select date_trunc('week', d.dia::timestamp)::date as semana, sum(d.quantidade) as quantidade, sum(d.segundos) as segundos
    from private.checkins_por_dia d
    where p_recorte <> 'pessoa'
      and d.dia >= v_ini and d.dia < v_fim + 7
      and (p_consultoria is null or d.consultoria_id = p_consultoria)
      and d.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by 1
    union all
    select date_trunc('week', k.inicio at time zone 'America/Sao_Paulo')::date, count(*), sum(extract(epoch from k.fim - k.inicio))
    from public.checkins k
    where p_recorte = 'pessoa' and k.consultor_id = p_eu and k.consultoria_id = p_consultoria and k.fim is not null
      and k.inicio >= v_ini::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (v_fim + 7)::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  ),
  linhas as (
    select s.semana, coalesce(f.quantidade, 0)::int as checkins, round(coalesce(f.segundos, 0) / 3600, 1) as horas,
      s.semana + 6 >= p_de and s.semana <= p_ate_efetivo as no_periodo,
      p_hoje between s.semana and s.semana + 6 as parcial,
      s.semana >= p_de and s.semana + 6 <= p_ate_efetivo and s.semana + 6 < p_hoje as inteira
    from semanas s
    left join feitos f on f.semana = s.semana
  )
  select jsonb_build_object(
    'semanas', (select jsonb_agg(jsonb_build_object('semana', l.semana, 'checkins', l.checkins, 'horas', l.horas,
      'no_periodo', l.no_periodo, 'parcial', l.parcial) order by l.semana) from linhas l),
    'media', (select round(avg(l.checkins), 1) from linhas l where l.inteira),
    'pico', (select jsonb_build_object('semana', l.semana, 'checkins', l.checkins) from linhas l
      where l.no_periodo and l.checkins > 0 order by l.checkins desc, l.semana limit 1))
  into v_resultado;

  return v_resultado;
end $$;

create or replace function public.checkins_por_semana(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_de date;
  v_ate_efetivo date;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.de, p.ate_efetivo into v_de, v_ate_efetivo from private.periodo_do_inicio(p_mes, p_de, p_ate) p;
  return private.semanas_de_checkins(v_recorte, v_consultoria, v_eu, v_de, v_ate_efetivo,
    (now() at time zone 'America/Sao_Paulo')::date);
end $$;

-- ── Acesso ───────────────────────────────────────────────────────────────────
-- As do cliente: só quem está logado (hoje_do_cliente confere quem vê; as de gráfico, o RLS).
revoke all on function public.hoje_do_cliente(uuid), public.horas_do_cliente_por_dia(uuid, date),
  public.horas_do_cliente_por_mes(uuid, int, date)
from public, anon;
grant execute on function public.hoje_do_cliente(uuid), public.horas_do_cliente_por_dia(uuid, date),
  public.horas_do_cliente_por_mes(uuid, int, date)
to authenticated;

-- As do Início redefinidas: os grants de 20261118130156 de novo.
revoke all on function public.painel_do_inicio(date, date, date), public.checkins_por_semana(date, date, date)
from public, anon, service_role;
grant execute on function public.painel_do_inicio(date, date, date), public.checkins_por_semana(date, date, date)
to authenticated;

-- A projeção é pura e a função invoker de horas por dia a chama como quem está logado.
revoke all on function private.projecao_do_mes(numeric, int, int) from public, anon, service_role;
grant execute on function private.projecao_do_mes(numeric, int, int) to authenticated;

-- Internas: só as funções do banco (como owner) chamam.
revoke all on function private.ritmo_do_mes(numeric, numeric),
  private.semanas_de_checkins(text, uuid, uuid, date, date, date)
from public, anon, authenticated, service_role;

commit;
