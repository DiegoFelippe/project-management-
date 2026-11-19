-- Ocupação e sugestão (desenho em docs/superpowers/specs/2026-11-13-clientes-design.md: "Capacidade, reserva,
-- realizado e ocupação", "Sugestão", "Meses" e "Banco").
-- Duas funções de leitura, já em ordem de menor ocupação, com busca e paginação no banco, para as janelas de
-- "mandar para uma consultoria" e "escolher o consultor" e para a Capacidade:
-- - consultores_por_ocupacao: os consultores de uma consultoria (ou de todas, para a central);
-- - consultorias_por_ocupacao: as consultorias ativas (só a central).
-- No mês atual e nos seguintes, ocupação = reservado (a previsão de hoje) / capacidade; nos meses passados não
-- há reservado e a ocupação é a utilização = realizado / capacidade. Capacidade 0 = ocupação nula, no fim.

-- ── Apoio ────────────────────────────────────────────────────────────────────

-- Padrão de LIKE para a busca: sem acento, em minúsculas, sem os espaços das pontas, e com %, _ e \ escapados
-- (procuram o próprio caractere, não ampliam a busca). Nulo quando não há o que buscar.
create function private.padrao_de_busca(p_busca text) returns text
language sql immutable set search_path = '' as $$
  select case when btrim(coalesce(p_busca, '')) <> '' then
    '%' || replace(replace(replace(private.sem_acento(btrim(p_busca)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end
$$;

-- Capacidade do mês dos consultores (perfis ativos admin, gestor ou pessoa de consultoria ativa) de uma
-- consultoria, ou de todas com p_consultoria nula, numa consulta só. É a conta de public.capacidade_do_mes
-- (dias úteis sem feriado nacional e sem ausência x carga semanal / 5, com 1 casa), sem a regra de acesso:
-- só as funções de ocupação usam, e elas conferem quem pergunta. p_inicio = primeiro dia do mês.
create function private.capacidades_do_mes(p_consultoria uuid, p_inicio date)
returns table (id uuid, consultoria_id uuid, capacidade numeric)
language sql stable set search_path = '' as $$
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
  left join ausentes f on f.perfil_id = x.id
$$;

revoke all on function private.padrao_de_busca(text), private.capacidades_do_mes(uuid, date)
  from public, anon, authenticated;

-- ── Consultores por ocupação ─────────────────────────────────────────────────

-- Quem pode: a central (e o dono), de qualquer consultoria ou de todas (p_consultoria nula); o administrador
-- ou um gestor da consultoria, só dela (o gestor vê a equipe inteira, não só os times dele). Senão, nenhuma
-- linha. Por consultor:
-- - capacidade: a do mês (capacidades_do_mes);
-- - reservado: soma da previsão dos clientes ativos dele (nulo nos meses passados);
-- - realizado: horas dos check-ins fechados dele que começaram no mês (São Paulo), pela consultoria dele;
-- - clientes: quantos clientes ativos ele atende hoje.
-- Ordem: capacidade 0 por último, ocupação crescente, nome, id. total = linhas da busca antes da página.
-- plan_cache_mode = force_custom_plan: cada chamada planeja com os valores de verdade, então
-- "p_consultoria is null or ... = p_consultoria" vira um filtro simples e usa os índices da consultoria.
create function public.consultores_por_ocupacao(
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
  v_de timestamptz := v_inicio::timestamp at time zone 'America/Sao_Paulo';
  v_ate timestamptz := (v_inicio + interval '1 month') at time zone 'America/Sao_Paulo';
  v_passado boolean := v_inicio < v_mes_atual;
  v_padrao text := private.padrao_de_busca(p_busca);
begin
  if not (private.sou_central() or private.gerencio_consultoria(p_consultoria)) then
    return;
  end if;

  return query
  with consultores as (
    select x.id, x.capacidade from private.capacidades_do_mes(p_consultoria, v_inicio) x
  ),
  reservas as (
    select c.consultor_id, sum(c.horas_mes) as horas, count(*) as quantos
    from public.clientes c
    where not c.arquivado
      and c.consultor_id is not null
      and (p_consultoria is null or c.consultoria_id = p_consultoria)
    group by c.consultor_id
  ),
  feitos as (
    select k.consultor_id, k.consultoria_id, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from public.checkins k
    where k.fim is not null
      and k.inicio >= v_de
      and k.inicio < v_ate
      and (p_consultoria is null or k.consultoria_id = p_consultoria)
    group by k.consultor_id, k.consultoria_id
  ),
  linhas as (
    select p.id, p.nome, p.email, p.foto, p.papel, p.consultoria_id, co.nome as consultoria_nome,
      p.carga_semanal, x.capacidade,
      coalesce(r.horas, 0) as reservado,
      coalesce(round(f.segundos / 3600, 1), 0) as realizado,
      coalesce(r.quantos, 0) as quantos,
      case when x.capacidade > 0 then
        (case when v_passado then coalesce(round(f.segundos / 3600, 1), 0) else coalesce(r.horas, 0) end)
          / x.capacidade
      end as taxa
    from consultores x
    join public.perfis p on p.id = x.id
    join public.consultorias co on co.id = p.consultoria_id
    left join reservas r on r.consultor_id = p.id
    left join feitos f on f.consultor_id = p.id and f.consultoria_id = p.consultoria_id
    where v_padrao is null or private.sem_acento(p.nome || ' ' || p.email) like v_padrao escape '\'
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

-- ── Consultorias por ocupação ────────────────────────────────────────────────

-- Só a central (e o dono). Consultorias ativas, por consultoria:
-- - consultores: os ativos (admin, gestor, pessoa), inclusive com carga 0; capacidade: a soma da deles;
-- - clientes: os ativos; aguardando: os ativos ainda sem consultor;
-- - reservado: a previsão de todos os clientes ativos, inclusive os aguardando consultor (nulo nos meses
--   passados);
-- - realizado: os check-ins fechados feitos pela consultoria no mês, inclusive de quem já saiu dela.
-- Mesma ordem, busca e paginação de consultores_por_ocupacao.
create function public.consultorias_por_ocupacao(
  p_busca text default null,
  p_limite int default 8,
  p_deslocamento int default 0,
  p_mes date default null)
returns table (id uuid, nome text, consultores int, clientes int, aguardando int, capacidade numeric,
  reservado numeric, realizado numeric, ocupacao numeric, total bigint)
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
  v_de timestamptz := v_inicio::timestamp at time zone 'America/Sao_Paulo';
  v_ate timestamptz := (v_inicio + interval '1 month') at time zone 'America/Sao_Paulo';
  v_passado boolean := v_inicio < v_mes_atual;
  v_padrao text := private.padrao_de_busca(p_busca);
begin
  if not private.sou_central() then
    return;
  end if;

  return query
  with equipes as (
    select x.consultoria_id, count(*) as pessoas, sum(x.capacidade) as capacidade
    from private.capacidades_do_mes(null, v_inicio) x
    group by x.consultoria_id
  ),
  carteiras as (
    select c.consultoria_id, count(*) as quantos, count(*) filter (where c.consultor_id is null) as sem_consultor,
      sum(c.horas_mes) as horas
    from public.clientes c
    where not c.arquivado
      and c.consultoria_id is not null
    group by c.consultoria_id
  ),
  feitos as (
    select k.consultoria_id, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from public.checkins k
    where k.fim is not null
      and k.inicio >= v_de
      and k.inicio < v_ate
    group by k.consultoria_id
  ),
  linhas as (
    select co.id, co.nome,
      coalesce(e.pessoas, 0) as pessoas,
      coalesce(w.quantos, 0) as quantos,
      coalesce(w.sem_consultor, 0) as sem_consultor,
      coalesce(e.capacidade, 0) as capacidade,
      coalesce(w.horas, 0) as reservado,
      coalesce(round(f.segundos / 3600, 1), 0) as realizado,
      case when e.capacidade > 0 then
        (case when v_passado then coalesce(round(f.segundos / 3600, 1), 0) else coalesce(w.horas, 0) end)
          / e.capacidade
      end as taxa
    from public.consultorias co
    left join equipes e on e.consultoria_id = co.id
    left join carteiras w on w.consultoria_id = co.id
    left join feitos f on f.consultoria_id = co.id
    where co.arquivada_em is null
      and (v_padrao is null or private.sem_acento(co.nome) like v_padrao escape '\')
  )
  select l.id, l.nome, l.pessoas::int, l.quantos::int, l.sem_consultor::int, l.capacidade,
    case when not v_passado then l.reservado end,
    l.realizado, round(l.taxa, 4), count(*) over ()
  from linhas l
  order by l.capacidade = 0, l.taxa, l.nome, l.id
  limit least(greatest(coalesce(p_limite, 8), 1), 50)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end $$;

-- Só para quem está logado (as funções conferem o papel por dentro).
revoke all on function public.consultores_por_ocupacao(uuid, text, int, int, date),
  public.consultorias_por_ocupacao(text, int, int, date) from public, anon, service_role;
grant execute on function public.consultores_por_ocupacao(uuid, text, int, int, date),
  public.consultorias_por_ocupacao(text, int, int, date) to authenticated;
