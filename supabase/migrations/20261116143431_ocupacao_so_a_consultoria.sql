-- consultores_por_ocupacao com uma consultoria: a junção com perfis passa a filtrar a consultoria também, e o
-- banco lê só os perfis dela (antes montava a tabela de todos os perfis para achar os 15 da consultoria). O
-- resto é igual à versão de 20261116141944_ocupacao.sql; as permissões da função continuam as mesmas.

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
