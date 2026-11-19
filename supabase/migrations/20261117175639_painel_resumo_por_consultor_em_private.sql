-- O resumo por consultor (checkins_horas_consultor_mes) vai para o esquema private, que o PostgREST não publica.
-- Em public, com chaves para perfis e consultorias dentro da chave primária, o PostgREST o tomava por tabela de junção
-- e a leitura do perfil no login (perfis com a consultoria embutida) ficava ambígua (HTTP 300): ninguém entrava.
-- É um resumo interno (só as funções do banco leem), então o lugar dele é private, como quadro_objetos_apagados.
-- As funções que o usam são refeitas com o nome novo; nada muda nos números. Nenhum dado é apagado (só muda o esquema).

begin;

alter table public.checkins_horas_consultor_mes set schema private;

create or replace function private.somar_horas_consultor_mes(p_consultor uuid, p_consultoria uuid, p_inicio timestamptz, p_segundos numeric)
returns void language sql security definer set search_path = '' as $$
  insert into private.checkins_horas_consultor_mes (consultor_id, consultoria_id, mes, segundos)
  values (p_consultor, p_consultoria, date_trunc('month', p_inicio at time zone 'America/Sao_Paulo')::date, p_segundos)
  on conflict (consultor_id, consultoria_id, mes)
    do update set segundos = private.checkins_horas_consultor_mes.segundos + excluded.segundos
$$;

create or replace function private.ocupacao_do_periodo(p_consultoria uuid, p_de date, p_ate date, p_ids uuid[])
returns table (id uuid, consultoria_id uuid, capacidade numeric, realizado numeric, taxa numeric)
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_de timestamptz := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_ate timestamptz := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
  -- Meses inteiros dentro do período, [v_cheio_de, v_cheio_ate); bordas: [v_de, v_borda1_ate) e [v_borda2_de, v_ate).
  v_cheio_de date := date_trunc('month', (p_de - 1) + interval '1 month')::date;
  v_cheio_ate date := date_trunc('month', (p_ate + 1)::timestamp)::date;
  v_borda1_ate timestamptz;
  v_borda2_de timestamptz;
begin
  if v_cheio_de >= v_cheio_ate then
    -- Sem mês inteiro (ou intervalo vazio, até antes de de): o período todo é borda e o resumo não entra.
    v_cheio_de := p_ate + 1;
    v_cheio_ate := p_ate + 1;
    v_borda1_ate := v_ate;
    v_borda2_de := v_ate;
  else
    v_borda1_ate := v_cheio_de::timestamp at time zone 'America/Sao_Paulo';
    v_borda2_de := v_cheio_ate::timestamp at time zone 'America/Sao_Paulo';
  end if;

  return query
  with consultores as (
    select x.id, x.consultoria_id, x.capacidade
    from private.capacidades_do_periodo(p_consultoria, p_de, p_ate, p_ids) x
  ),
  feitos as (
    select t.consultor_id, t.consultoria_id, sum(t.segundos) as segundos
    from (
      -- Meses inteiros: resumo por consultor.
      select r.consultor_id, r.consultoria_id, r.segundos
      from private.checkins_horas_consultor_mes r
      where r.mes >= v_cheio_de and r.mes < v_cheio_ate
        and (p_consultoria is null or r.consultoria_id = p_consultoria)
        and (p_ids is null or r.consultor_id = any(p_ids))
      union all
      -- Bordas de todos (central e consultoria): pela data.
      select k.consultor_id, k.consultoria_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where p_ids is null and k.fim is not null
        and ((k.inicio >= v_de and k.inicio < v_borda1_ate) or (k.inicio >= v_borda2_de and k.inicio < v_ate))
        and (p_consultoria is null or k.consultoria_id = p_consultoria)
      union all
      -- Bordas de quem foi pedido (o consultor): pelo consultor, um de cada vez.
      select k.consultor_id, k.consultoria_id, extract(epoch from k.fim - k.inicio)
      from unnest(p_ids) as i(id)
      cross join lateral (
        select c.consultor_id, c.consultoria_id, c.inicio, c.fim
        from public.checkins c
        where c.consultor_id = i.id and c.fim is not null
          and ((c.inicio >= v_de and c.inicio < v_borda1_ate) or (c.inicio >= v_borda2_de and c.inicio < v_ate))
          and (p_consultoria is null or c.consultoria_id = p_consultoria)
      ) k
      where p_ids is not null
    ) t
    group by t.consultor_id, t.consultoria_id
  )
  select x.id, x.consultoria_id, x.capacidade,
    coalesce(round(f.segundos / 3600, 1), 0),
    case when x.capacidade > 0 then coalesce(round(f.segundos / 3600, 1), 0) / x.capacidade end
  from consultores x
  left join feitos f on f.consultor_id = x.id and f.consultoria_id = x.consultoria_id;
end $$;

create or replace function public.painel_do_inicio(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_intervalo boolean := p_de is not null or p_ate is not null;
  v_inicio date;       -- mês do painel: o pedido (Mês) ou o do fim do período (links para Usuários e Consultorias)
  v_de_dia date;       -- primeiro dia do período (inclusive)
  v_ate_dia date;      -- último dia do período (inclusive)
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

  if v_intervalo then
    if p_mes is not null or p_de is null or p_ate is null then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'Mande o mês ou o período (de e até), não os dois.';
    end if;
    if p_de > p_ate then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'A data inicial vem depois da final.';
    end if;
    if p_ate > (v_mes_atual + interval '1 month - 1 day')::date then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'O período vai no máximo até o fim do mês atual.';
    end if;
    if p_ate >= (p_de + interval '2 years')::date then
      raise exception 'periodo_invalido' using errcode = '22023', detail = 'O período pode ter no máximo 2 anos.';
    end if;
    v_de_dia := p_de;
    v_ate_dia := p_ate;
    v_inicio := date_trunc('month', p_ate::timestamp)::date;
    v_passado := true;
  else
    v_inicio := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
    v_de_dia := v_inicio;
    v_ate_dia := (v_inicio + interval '1 month - 1 day')::date;
    v_passado := v_inicio < v_mes_atual;
  end if;

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
      select k.consultoria_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where v_recorte <> 'pessoa'
        and k.fim is not null
        and ((k.inicio >= v_borda1_de and k.inicio < v_borda1_ate) or (k.inicio >= v_borda2_de and k.inicio < v_borda2_ate))
        and (v_consultoria is null or k.consultoria_id = v_consultoria)
    ) t
    group by t.consultoria_id
  ),
  equipes as (
    select q.consultoria_id, sum(q.capacidade) as capacidade from quem q group by q.consultoria_id
  ),
  cons as (
    select co.id, co.nome,
      coalesce(e.capacidade, 0) as capacidade,
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
  -- Clientes (ativos e a fila são de hoje; novos, do período).
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
  -- Cada cliente do consultor lê só os check-ins dele (índice por cliente), nunca o período inteiro de todos.
  meus as (
    select c.id, c.nome, c.horas_mes, coalesce(round(f.segundos / 3600, 1), 0) as realizado, f.segundos
    from public.clientes c
    left join lateral (
      select sum(extract(epoch from k.fim - k.inicio)) as segundos
      from public.checkins k
      where k.cliente_id = c.id and k.consultor_id = v_eu and k.fim is not null
        and k.inicio >= v_de and k.inicio < v_ate
    ) f on true
    where v_recorte = 'pessoa' and c.consultor_id = v_eu and not c.arquivado
    order by (case when v_passado then coalesce(f.segundos, 0) else c.horas_mes end) desc, c.nome, c.id
    limit 5
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
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'mes', v_inicio,
    'intervalo', v_intervalo,
    'de', v_de_dia,
    'ate', v_ate_dia,
    'passado', v_passado,
    -- No período, a capacidade conta só até hoje (dias que ainda não aconteceram não entram); no Mês, nulo.
    'capacidade_ate', case when v_intervalo then least(v_ate_dia, v_hoje) end,
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
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'realizado', coalesce(h.horas, 0),
        'no_periodo', m.mes >= date_trunc('month', v_de_dia::timestamp)::date) order by m.mes)
      from meses m left join horas h on h.mes = m.mes),
    'previsao_atual', (select case when not v_intervalo then reservado end from totais),
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

commit;
