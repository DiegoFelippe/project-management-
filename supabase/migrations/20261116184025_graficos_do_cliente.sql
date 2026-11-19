-- Gráficos da aba Geral do cliente. Todas as funções são security invoker: o RLS de checkins decide o que
-- cada um soma (a consultoria soma só os check-ins dela; a central, todos), e é isso que isola as consultorias.
-- Só entram check-ins fechados, pelo mês (e a semana) em que o início cai, no horário de São Paulo.

-- Horas dos últimos p_meses meses (1 a 24), contando o atual, do mais antigo ao mais novo; 0 nos meses sem check-in.
create function public.horas_do_cliente_por_mes(p_cliente uuid, p_meses int default 6)
returns table (mes date, realizado numeric)
language sql stable security invoker set search_path = '' as $$
  with ref as (
    select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as atual,
      greatest(1, least(coalesce(p_meses, 6), 24)) as n
  ), meses as (
    select (ref.atual - make_interval(months => g))::date as mes
    from ref, generate_series(ref.n - 1, 0, -1) g
  )
  select m.mes,
    coalesce((
      select round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1)
      from public.checkins k
      where k.cliente_id = p_cliente
        and k.fim is not null
        and k.inicio >= m.mes::timestamp at time zone 'America/Sao_Paulo'
        and k.inicio < (m.mes + interval '1 month') at time zone 'America/Sao_Paulo'
    ), 0)
  from meses m
  order by m.mes
$$;

-- Horas do mês por consultor (p_mes: qualquer dia do mês; nulo = o atual), mais horas primeiro. O nome vem nulo
-- quando quem olha não enxerga aquela pessoa.
create function public.horas_do_cliente_por_consultor(p_cliente uuid, p_mes date default null)
returns table (consultor_id uuid, nome text, horas numeric)
language sql stable security invoker set search_path = '' as $$
  with mes as (
    select date_trunc('month', coalesce(p_mes::timestamp, now() at time zone 'America/Sao_Paulo'))::date as dia
  ), somas as (
    select k.consultor_id, round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) as horas
    from public.checkins k, mes
    where k.cliente_id = p_cliente
      and k.fim is not null
      and k.inicio >= mes.dia::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (mes.dia + interval '1 month') at time zone 'America/Sao_Paulo'
    group by k.consultor_id
  )
  select s.consultor_id, private.nome_do_perfil_visivel(s.consultor_id), s.horas
  from somas s
  order by s.horas desc, private.nome_do_perfil_visivel(s.consultor_id) nulls last, s.consultor_id
$$;

-- Check-ins e horas por semana do mês (segunda a domingo; entram as semanas que tocam o mês, e cada check-in
-- conta na semana do seu início, só se o início for no mês). Semana sem check-in vem com 0.
create function public.checkins_do_cliente_por_semana(p_cliente uuid, p_mes date default null)
returns table (semana date, quantidade int, horas numeric)
language sql stable security invoker set search_path = '' as $$
  with mes as (
    select date_trunc('month', coalesce(p_mes::timestamp, now() at time zone 'America/Sao_Paulo'))::date as dia
  ), semanas as (
    select s::date as semana
    from mes, generate_series(date_trunc('week', mes.dia::timestamp),
      (mes.dia + interval '1 month' - interval '1 day')::date, interval '7 days') s
  ), dentro as (
    select date_trunc('week', k.inicio at time zone 'America/Sao_Paulo')::date as semana,
      extract(epoch from k.fim - k.inicio) as segundos
    from public.checkins k, mes
    where k.cliente_id = p_cliente
      and k.fim is not null
      and k.inicio >= mes.dia::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (mes.dia + interval '1 month') at time zone 'America/Sao_Paulo'
  )
  select s.semana, count(d.semana)::int, coalesce(round(sum(d.segundos) / 3600, 1), 0)
  from semanas s
  left join dentro d on d.semana = s.semana
  group by s.semana
  order by s.semana
$$;

revoke all on function public.horas_do_cliente_por_mes(uuid, int), public.horas_do_cliente_por_consultor(uuid, date),
  public.checkins_do_cliente_por_semana(uuid, date) from public, anon;
grant execute on function public.horas_do_cliente_por_mes(uuid, int), public.horas_do_cliente_por_consultor(uuid, date),
  public.checkins_do_cliente_por_semana(uuid, date) to authenticated;
