-- Painel do Início: cada consultor do ranking (administrador e gestor) e dos extremos ganha `visivel`: se quem
-- chama enxerga o perfil dele (private.vejo_perfil, a mesma regra do RLS de perfis). O painel só faz do nome um
-- link para a pessoa quando ela é visível; o gestor vê a consultoria inteira no painel, mas só abre quem é do time
-- dele. Também: o "Realizado" do topo soma sem arredondar e arredonda uma vez no fim, igual à barra do mês.

create or replace function public.painel_do_inicio(p_mes date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
  v_de timestamptz := v_inicio::timestamp at time zone 'America/Sao_Paulo';
  v_ate timestamptz := (v_inicio + interval '1 month') at time zone 'America/Sao_Paulo';
  v_de_6 timestamptz := (v_inicio - interval '5 months') at time zone 'America/Sao_Paulo';
  v_passado boolean := v_inicio < v_mes_atual;
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() and private.papel_atual() = 'pessoa' then
    v_recorte := 'pessoa';
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_recorte' using errcode = '42501';
  end if;

  with
  -- Consultores no recorte (todos da consultoria; só quem chama, no recorte pessoa), com os números do mês.
  quem as (
    select p.id, p.nome, p.consultoria_id, co.nome as consultoria_nome,
      x.capacidade, x.reservado, x.realizado, x.taxa
    from private.ocupacao_dos_consultores(v_consultoria, v_inicio,
      case when v_recorte = 'pessoa' then array[v_eu] end) x
    join public.perfis p on p.id = x.id
    left join public.consultorias co on co.id = p.consultoria_id
  ),
  -- Por consultoria (tudo e consultoria), como consultorias_por_ocupacao: reservado inclui quem espera consultor.
  carteiras as (
    select c.consultoria_id, sum(c.horas_mes) as horas
    from public.clientes c
    where v_recorte <> 'pessoa'
      and not c.arquivado
      and c.consultoria_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
    group by c.consultoria_id
  ),
  feitos as (
    select k.consultoria_id, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from public.checkins k
    where v_recorte <> 'pessoa'
      and k.fim is not null
      and k.inicio >= v_de and k.inicio < v_ate
      and (v_consultoria is null or k.consultoria_id = v_consultoria)
    group by k.consultoria_id
  ),
  equipes as (
    select q.consultoria_id, sum(q.capacidade) as capacidade from quem q group by q.consultoria_id
  ),
  cons as (
    select co.id, co.nome,
      coalesce(e.capacidade, 0) as capacidade,
      coalesce(w.horas, 0) as reservado,
      coalesce(round(f.segundos / 3600, 1), 0) as realizado,
      coalesce(f.segundos, 0) / 3600 as realizado_bruto
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
  -- Realizado total: soma sem arredondar e arredonda uma vez só, no fim (a barra do mês no gráfico faz igual).
  totais as (
    select coalesce(sum(t.capacidade), 0) as capacidade, coalesce(sum(t.reservado), 0) as reservado,
      round(coalesce(sum(t.realizado), 0), 1) as realizado
    from (
      select capacidade, reservado, realizado_bruto as realizado from cons
      union all
      select capacidade, reservado, realizado from quem where v_recorte = 'pessoa'
    ) t
  ),
  totais_taxa as (
    select t.*, case when t.capacidade > 0 then
      (case when v_passado then t.realizado else t.reservado end) / t.capacidade end as taxa
    from totais t
  ),
  -- Clientes.
  ativos as (
    select count(*) as n from public.clientes c
    where not c.arquivado
      and (v_recorte = 'tudo'
        or (v_recorte = 'consultoria' and c.consultoria_id = v_consultoria)
        or (v_recorte = 'pessoa' and c.consultor_id = v_eu))
  ),
  novos as (
    select count(*) as n from public.clientes c
    where c.criado_em >= v_de and c.criado_em < v_ate
      and (v_recorte = 'tudo'
        or (v_recorte = 'consultoria' and c.consultoria_id = v_consultoria)
        or (v_recorte = 'pessoa' and c.consultor_id = v_eu))
  ),
  fila as (
    select
      case when v_recorte = 'tudo' then
        (select count(*) from public.clientes c where not c.arquivado and c.consultoria_id is null) else 0 end as a_distribuir,
      case when v_recorte <> 'pessoa' then
        (select count(*) from public.clientes c
         where not c.arquivado and c.consultoria_id is not null and c.consultor_id is null
           and (v_consultoria is null or c.consultoria_id = v_consultoria)) else 0 end as sem_consultor
  ),
  espera as (
    (select c.id, c.nome, c.criado_em as desde, 'a_distribuir'::text as situacao, null::text as consultoria_nome
     from public.clientes c
     where v_recorte = 'tudo' and not c.arquivado and c.consultoria_id is null
     order by c.criado_em, c.id limit 5)
    union all
    (select c.id, c.nome, c.enviado_em, 'sem_consultor'::text, co.nome
     from public.clientes c
     join public.consultorias co on co.id = c.consultoria_id
     where v_recorte <> 'pessoa' and not c.arquivado and c.consultoria_id is not null and c.consultor_id is null
       and (v_consultoria is null or c.consultoria_id = v_consultoria)
     order by c.enviado_em, c.id limit 5)
  ),
  meus as (
    select c.id, c.nome, c.horas_mes, coalesce(round(f.segundos / 3600, 1), 0) as realizado, f.segundos
    from public.clientes c
    left join (
      select k.cliente_id, sum(extract(epoch from k.fim - k.inicio)) as segundos
      from public.checkins k
      where v_recorte = 'pessoa' and k.consultor_id = v_eu and k.fim is not null
        and k.inicio >= v_de and k.inicio < v_ate
      group by k.cliente_id
    ) f on f.cliente_id = c.id
    where v_recorte = 'pessoa' and c.consultor_id = v_eu and not c.arquivado
    order by (case when v_passado then coalesce(f.segundos, 0) else c.horas_mes end) desc, c.nome, c.id
    limit 5
  ),
  -- Realizado dos 6 meses até o mês pedido (tem histórico nos check-ins).
  meses as (
    select g::date as mes
    from generate_series(v_inicio::timestamp - interval '5 months', v_inicio::timestamp, interval '1 month') g
  ),
  horas as (
    select date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date as mes,
      round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) as horas
    from public.checkins k
    where k.fim is not null
      and k.inicio >= v_de_6 and k.inicio < v_ate
      and (v_recorte = 'tudo'
        or (v_recorte = 'consultoria' and k.consultoria_id = v_consultoria)
        or (v_recorte = 'pessoa' and k.consultor_id = v_eu and (v_consultoria is null or k.consultoria_id = v_consultoria)))
      and k.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by 1
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'mes', v_inicio,
    'passado', v_passado,
    'indicadores', jsonb_build_object(
      'clientes_ativos', (select n from ativos),
      'clientes_novos', (select n from novos),
      'aguardando', (select a_distribuir + sem_consultor from fila),
      'a_distribuir', (select a_distribuir from fila),
      'sem_consultor', (select sem_consultor from fila),
      'capacidade', (select capacidade from totais),
      'reservado', (select case when not v_passado then reservado end from totais),
      'realizado', (select realizado from totais),
      'ocupacao', (select round(taxa, 4) from totais_taxa)),
    'horas_por_mes', (
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'realizado', coalesce(h.horas, 0)) order by m.mes)
      from meses m left join horas h on h.mes = m.mes),
    'previsao_atual', (select reservado from totais),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'ocupacao', round(r.taxa, 4),
        'capacidade', r.capacidade)
        || case when v_recorte = 'consultoria' then jsonb_build_object('visivel', private.vejo_perfil(r.id)) else '{}'::jsonb end
        order by r.o)
      from (
        select x.id, x.nome, x.taxa, x.capacidade, row_number() over (order by x.taxa desc nulls last, x.nome, x.id) as o
        from (
          select id, nome, taxa, capacidade from cons_taxa where v_recorte = 'tudo'
          union all
          select id, nome, taxa, capacidade from quem where v_recorte = 'consultoria'
        ) x
        order by x.taxa desc nulls last, x.nome, x.id
        limit 8
      ) r), '[]'::jsonb),
    'esperando', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'desde', e.desde, 'situacao', e.situacao,
        'consultoria_nome', e.consultoria_nome) order by e.desde, e.id)
      from (select * from espera order by desde, id limit 5) e), '[]'::jsonb),
    'extremos', jsonb_build_object(
      'acima', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'ocupacao', round(a.taxa, 4),
          'capacidade', a.capacidade, 'consultoria_nome', a.consultoria_nome,
          'visivel', private.vejo_perfil(a.id)) order by a.taxa desc, a.nome, a.id)
        from (select * from quem where v_recorte <> 'pessoa' and taxa > 1
          order by taxa desc, nome, id limit 3) a), '[]'::jsonb),
      'folga', coalesce((
        select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'ocupacao', round(f.taxa, 4),
          'capacidade', f.capacidade, 'consultoria_nome', f.consultoria_nome,
          'visivel', private.vejo_perfil(f.id)) order by f.taxa, f.nome, f.id)
        from (select * from quem where v_recorte <> 'pessoa' and taxa < 1
          order by taxa, nome, id limit 3) f), '[]'::jsonb)),
    'meus_clientes', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome,
        'previsto', case when not v_passado then m.horas_mes end, 'realizado', m.realizado)
        order by (case when v_passado then coalesce(m.segundos, 0) else m.horas_mes end) desc, m.nome, m.id)
      from meus m), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end $$;
