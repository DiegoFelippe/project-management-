-- Ocupação de uma página de pessoas numa chamada só (a lista de Usuários mostra capacidade, reservado,
-- realizado, ocupação e clientes de cada consultor). O cálculo sai de consultores_por_ocupacao para uma função
-- private (ocupacao_dos_consultores), que as duas usam, e ganha o filtro por ids: o banco calcula só as
-- pessoas pedidas, não a consultoria inteira. Os números de consultores_por_ocupacao não mudam.

-- capacidades_do_mes com filtro por ids (p_ids nulo = todos). A versão de dois argumentos continua existindo.
create function private.capacidades_do_mes(p_consultoria uuid, p_inicio date, p_ids uuid[])
returns table (id uuid, consultoria_id uuid, capacidade numeric)
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
begin
  return query
  with dias as (
    select g::date as dia
    from generate_series(p_inicio::timestamp, p_inicio + interval '1 month - 1 day', interval '1 day') g
    where extract(isodow from g) < 6
      and g::date not in (select private.feriados_nacionais(extract(year from p_inicio)::int))
  ),
  consultores as (
    select p.id, p.consultoria_id, p.carga_semanal
    from public.perfis p
    join public.consultorias c on c.id = p.consultoria_id
    where p.ativo
      and p.papel in ('admin', 'gestor', 'pessoa')
      and c.arquivada_em is null
      and (p_consultoria is null or p.consultoria_id = p_consultoria)
      and (p_ids is null or p.id = any(p_ids))
  ),
  -- Ausências podem se sobrepor: cada dia útil conta uma vez.
  ausentes as (
    select a.perfil_id, count(distinct d.dia) as dias
    from public.ausencias a
    join dias d on d.dia between a.de and a.ate
    where a.perfil_id in (select x.id from consultores x)
      and a.de < (p_inicio + interval '1 month')::date
      and a.ate >= p_inicio
    group by a.perfil_id
  )
  select x.id, x.consultoria_id,
    round(((select count(*) from dias) - coalesce(f.dias, 0)) * x.carga_semanal / 5, 1)
  from consultores x
  left join ausentes f on f.perfil_id = x.id;
end $$;

create or replace function private.capacidades_do_mes(p_consultoria uuid, p_inicio date)
returns table (id uuid, consultoria_id uuid, capacidade numeric)
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
begin
  return query select x.id, x.consultoria_id, x.capacidade from private.capacidades_do_mes(p_consultoria, p_inicio, null) x;
end $$;

-- (plpgsql com plan_cache_mode = force_custom_plan, como consultores_por_ocupacao: cada chamada planeja com os
-- valores de verdade, e "p_consultoria is null or ..." e "p_ids is null or ..." viram filtros simples.)
-- O resumo do mês de cada consultor (de uma consultoria, ou de todas com p_consultoria nula; p_ids limita às
-- pessoas pedidas), sem a regra de acesso: quem usa confere quem pergunta. taxa = ocupação (reservado /
-- capacidade; nos meses passados, realizado / capacidade), nula com capacidade 0.
create function private.ocupacao_dos_consultores(p_consultoria uuid, p_inicio date, p_ids uuid[])
returns table (id uuid, consultoria_id uuid, capacidade numeric, reservado numeric, realizado numeric,
  quantos bigint, taxa numeric)
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
begin
  return query
  with consultores as (
    select x.id, x.consultoria_id, x.capacidade from private.capacidades_do_mes(p_consultoria, p_inicio, p_ids) x
  ),
  reservas as (
    select c.consultor_id, sum(c.horas_mes) as horas, count(*) as quantos
    from public.clientes c
    where not c.arquivado
      and c.consultor_id is not null
      and (p_consultoria is null or c.consultoria_id = p_consultoria)
      and (p_ids is null or c.consultor_id = any(p_ids))
    group by c.consultor_id
  ),
  feitos as (
    select k.consultor_id, k.consultoria_id, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from public.checkins k
    where k.fim is not null
      and k.inicio >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (p_inicio + interval '1 month') at time zone 'America/Sao_Paulo'
      and (p_consultoria is null or k.consultoria_id = p_consultoria)
      and (p_ids is null or k.consultor_id = any(p_ids))
    group by k.consultor_id, k.consultoria_id
  )
  select x.id, x.consultoria_id, x.capacidade,
    coalesce(r.horas, 0),
    coalesce(round(f.segundos / 3600, 1), 0),
    coalesce(r.quantos, 0),
    case when x.capacidade > 0 then
      (case when p_inicio < date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
         then coalesce(round(f.segundos / 3600, 1), 0) else coalesce(r.horas, 0) end)
        / x.capacidade
    end
  from consultores x
  left join reservas r on r.consultor_id = x.id
  left join feitos f on f.consultor_id = x.id and f.consultoria_id = x.consultoria_id;
end $$;

revoke all on function private.capacidades_do_mes(uuid, date, uuid[]), private.ocupacao_dos_consultores(uuid, date, uuid[])
  from public, anon, authenticated;

-- consultores_por_ocupacao passa a usar o cálculo comum; resultado igual ao da versão anterior.
create or replace function public.consultores_por_ocupacao(
  p_consultoria uuid default null,
  p_busca text default null,
  p_limite int default 8,
  p_deslocamento int default 0,
  p_mes date default null)
returns table (id uuid, nome text, email text, foto text, papel text, consultoria_id uuid,
  consultoria_nome text, carga_semanal numeric, capacidade numeric, reservado numeric, realizado numeric,
  ocupacao numeric, clientes int, total bigint)
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
  v_passado boolean := v_inicio < v_mes_atual;
  v_padrao text := private.padrao_de_busca(p_busca);
begin
  if not (private.sou_central() or private.gerencio_consultoria(p_consultoria)) then
    return;
  end if;

  return query
  with linhas as (
    select p.id, p.nome, p.email, p.foto, p.papel, p.consultoria_id, co.nome as consultoria_nome,
      p.carga_semanal, x.capacidade, x.reservado, x.realizado, x.quantos, x.taxa
    from private.ocupacao_dos_consultores(p_consultoria, v_inicio, null) x
    join public.perfis p on p.id = x.id
    join public.consultorias co on co.id = p.consultoria_id
    where (p_consultoria is null or p.consultoria_id = p_consultoria)
      and (v_padrao is null or private.sem_acento(p.nome || ' ' || p.email) like v_padrao escape '\')
  )
  select l.id, l.nome, l.email, l.foto, l.papel, l.consultoria_id, l.consultoria_nome,
    l.carga_semanal::numeric, l.capacidade,
    case when not v_passado then l.reservado end,
    l.realizado, round(l.taxa, 4), l.quantos::int, count(*) over ()
  from linhas l
  order by l.capacidade = 0, l.taxa, l.nome, l.id
  limit least(greatest(coalesce(p_limite, 8), 1), 50)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end $$;

-- ── Ocupação de uma página de pessoas ────────────────────────────────────────

-- Mesma regra de consultores_por_ocupacao: a central (e o dono) vê qualquer pessoa; o administrador ou um
-- gestor, só as da consultoria dele; os demais, nada. Só voltam consultores ativos (quem não conta na
-- capacidade, como a central, não volta). No máximo 100 ids por chamada. ocupacao nula com capacidade 0;
-- reservado nulo nos meses passados.
create function public.ocupacao_das_pessoas(p_ids uuid[], p_mes date default null)
returns table (id uuid, capacidade numeric, reservado numeric, realizado numeric, ocupacao numeric, clientes int)
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
  v_consultoria uuid;
begin
  if coalesce(cardinality(p_ids), 0) > 100 then
    raise exception 'ids_demais' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    return;
  end if;
  if private.sou_central() then
    v_consultoria := null;
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_consultoria := private.consultoria_atual();
  else
    return;
  end if;

  return query
  select x.id, x.capacidade,
    case when v_inicio >= v_mes_atual then x.reservado end,
    x.realizado, round(x.taxa, 4), x.quantos::int
  from private.ocupacao_dos_consultores(v_consultoria, v_inicio, p_ids) x;
end $$;

revoke all on function public.ocupacao_das_pessoas(uuid[], date) from public, anon;
grant execute on function public.ocupacao_das_pessoas(uuid[], date) to authenticated;
