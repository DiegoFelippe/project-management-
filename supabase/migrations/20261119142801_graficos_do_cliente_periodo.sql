-- Gráficos da aba Geral do cliente num período (pedido do Diego, 19/11: o filtro de período fica em cima da aba Geral,
-- com as mesmas opções do Início: Mês, Últimos 30 e 90 dias, Este ano e Personalizado). O Mês continua com as funções
-- de hoje (horas_do_cliente_por_dia, horas_do_cliente_por_consultor, checkins_do_cliente_por_semana e
-- horas_do_cliente_por_mes, sem mudar nada); para um intervalo de dias (de e até, dias de São Paulo, inclusive), três
-- funções novas, irmãs das do mês:
-- - horas_do_cliente_por_dia_no_periodo: o acumulado dia a dia, do de até hoje no máximo, e a previsão proporcional ao
--   período (a previsão de hoje do cliente, dia a dia: horas_mes / dias daquele mês);
-- - horas_do_cliente_por_consultor_no_periodo e checkins_do_cliente_por_semana_no_periodo: as do mês, no intervalo.
-- O intervalo passa pelas regras do Início (private.periodo_do_inicio: periodo_invalido, 22023, com as mesmas frases),
-- por um ajudante definer só de datas (private.periodo_do_cliente), porque as funções são security invoker, como as do
-- mês: o RLS de checkins decide o que cada um soma, e o de clientes, se a previsão aparece. Os limites saem prontos de um
-- CTE materialized e entram na leitura de checkins como subconsultas escalares: com o RLS, o Postgres só leva ao índice
-- uma comparação sem função que não seja leakproof (como em horas_do_cliente_por_mes, 20261119115852); juntando o CTE,
-- ele lia o cliente inteiro e, em 2 anos, varria a tabela. Só acrescenta funções; nenhuma linha de tabela muda.

begin;

-- ── Período ──────────────────────────────────────────────────────────────────
-- O intervalo (de e até) validado pelas regras do Início; sem os dois, o mês atual. Só conta datas (não lê tabela):
-- definer para chamar private.periodo_do_inicio, que fica sem grant.
create function private.periodo_do_cliente(p_de date, p_ate date)
returns table (de date, ate date, ate_efetivo date)
language sql stable security definer set search_path = '' as $$
  select p.de, p.ate, p.ate_efetivo from private.periodo_do_inicio(null, p_de, p_ate) p
$$;

-- ── Horas por dia no período ─────────────────────────────────────────────────
-- Os dias do de até o fim efetivo (até hoje no máximo; período que começa depois de hoje: nenhum dia), com as horas
-- fechadas que começam em cada dia (São Paulo) e o acumulado. previsao: a previsão de hoje do cliente proporcional aos
-- dias mostrados (cada dia vale horas_mes / dias do mês dele), arredondada a 0,1; previsao_mes: horas_mes. As duas vêm
-- nulas para quem não vê o cliente (RLS de clientes).
create function public.horas_do_cliente_por_dia_no_periodo(p_cliente uuid, p_de date, p_ate date)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with ref as materialized (
    select p.de, p.ate, p.ate_efetivo,
      p.de::timestamp at time zone 'America/Sao_Paulo' as inicio,
      (p.ate_efetivo + 1)::timestamp at time zone 'America/Sao_Paulo' as fim
    from private.periodo_do_cliente(p_de, p_ate) p
  ), somas as (
    select (k.inicio at time zone 'America/Sao_Paulo')::date as dia, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from public.checkins k
    where k.cliente_id = p_cliente and k.fim is not null
      and k.inicio >= (select ref.inicio from ref) and k.inicio < (select ref.fim from ref)
    group by 1
  ), dias as (
    select g::date as dia, coalesce(s.segundos, 0) as segundos,
      sum(coalesce(s.segundos, 0)) over (order by g) as acumulado,
      1.0 / extract(day from date_trunc('month', g) + interval '1 month - 1 day') as parte_do_mes
    from ref
    cross join lateral generate_series(ref.de::timestamp, ref.ate_efetivo::timestamp, interval '1 day') g
    left join somas s on s.dia = g::date
  ), cliente as (
    select c.horas_mes from public.clientes c where c.id = p_cliente
  )
  select jsonb_build_object(
    'de', ref.de,
    'ate', ref.ate,
    'ate_efetivo', ref.ate_efetivo,
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'horas', round(d.segundos / 3600, 1),
        'acumulado', round(d.acumulado / 3600, 1)) order by d.dia)
      from dias d), '[]'::jsonb),
    'realizado', coalesce((select round(sum(s.segundos) / 3600, 1) from somas s), 0),
    'previsao', (select round(cliente.horas_mes * coalesce((select sum(d.parte_do_mes) from dias d), 0), 1) from cliente),
    'previsao_mes', (select cliente.horas_mes from cliente))
  from ref
$$;

-- ── Horas por consultor no período ───────────────────────────────────────────
-- Como horas_do_cliente_por_consultor (20261116184025), no intervalo: mais horas primeiro; o nome vem nulo quando quem
-- olha não enxerga aquela pessoa.
create function public.horas_do_cliente_por_consultor_no_periodo(p_cliente uuid, p_de date, p_ate date)
returns table (consultor_id uuid, nome text, horas numeric)
language sql stable security invoker set search_path = '' as $$
  with ref as materialized (
    select p.de::timestamp at time zone 'America/Sao_Paulo' as inicio,
      (p.ate + 1)::timestamp at time zone 'America/Sao_Paulo' as fim
    from private.periodo_do_cliente(p_de, p_ate) p
  ), somas as (
    select k.consultor_id, round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) as horas
    from public.checkins k
    where k.cliente_id = p_cliente and k.fim is not null
      and k.inicio >= (select ref.inicio from ref) and k.inicio < (select ref.fim from ref)
    group by k.consultor_id
  )
  select s.consultor_id, private.nome_do_perfil_visivel(s.consultor_id), s.horas
  from somas s
  order by s.horas desc, private.nome_do_perfil_visivel(s.consultor_id) nulls last, s.consultor_id
$$;

-- ── Check-ins por semana no período ──────────────────────────────────────────
-- Como checkins_do_cliente_por_semana (20261116184025), no intervalo: as semanas (segunda a domingo) que tocam o
-- período, e cada check-in fechado conta na semana do seu início, só se o início for no período. Semana sem check-in
-- vem com 0.
create function public.checkins_do_cliente_por_semana_no_periodo(p_cliente uuid, p_de date, p_ate date)
returns table (semana date, quantidade int, horas numeric)
language sql stable security invoker set search_path = '' as $$
  with ref as materialized (
    select p.de, p.ate, p.de::timestamp at time zone 'America/Sao_Paulo' as inicio,
      (p.ate + 1)::timestamp at time zone 'America/Sao_Paulo' as fim
    from private.periodo_do_cliente(p_de, p_ate) p
  ), semanas as (
    select s::date as semana
    from ref, generate_series(date_trunc('week', ref.de::timestamp), ref.ate::timestamp, interval '7 days') s
  ), dentro as (
    select date_trunc('week', k.inicio at time zone 'America/Sao_Paulo')::date as semana,
      extract(epoch from k.fim - k.inicio) as segundos
    from public.checkins k
    where k.cliente_id = p_cliente and k.fim is not null
      and k.inicio >= (select ref.inicio from ref) and k.inicio < (select ref.fim from ref)
  )
  select s.semana, count(d.semana)::int, coalesce(round(sum(d.segundos) / 3600, 1), 0)
  from semanas s
  left join dentro d on d.semana = s.semana
  group by s.semana
  order by s.semana
$$;

-- ── Acesso ───────────────────────────────────────────────────────────────────
-- Como as do mês: só quem está logado; o RLS decide o que cada um soma. O ajudante de datas, só para quem está logado
-- (as funções invoker o chamam como a pessoa).
revoke all on function public.horas_do_cliente_por_dia_no_periodo(uuid, date, date),
  public.horas_do_cliente_por_consultor_no_periodo(uuid, date, date),
  public.checkins_do_cliente_por_semana_no_periodo(uuid, date, date)
from public, anon;
grant execute on function public.horas_do_cliente_por_dia_no_periodo(uuid, date, date),
  public.horas_do_cliente_por_consultor_no_periodo(uuid, date, date),
  public.checkins_do_cliente_por_semana_no_periodo(uuid, date, date)
to authenticated;
revoke all on function private.periodo_do_cliente(date, date) from public, anon, service_role;
grant execute on function private.periodo_do_cliente(date, date) to authenticated;

commit;
