-- Gráficos variados do Início e a faixa Hoje ampliada (design 2026-11-19-graficos-variados-e-paleta, seções 2 e 3;
-- plano, Task 2):
-- - Novas do Início: horas_do_painel_por_dia (o burn-up), horas_por_unidade_por_semana (colunas empilhadas),
--   checkins_por_dia_e_hora (o calor), tarefas_por_situacao (a rosca) e clientes_por_cidade (os quadradinhos). Todas pelo
--   recorte de private.recorte_do_inicio (central: tudo; gestão: a consultoria; consultor: o dele; não liberado:
--   sem_recorte) e as de período por private.periodo_do_inicio (p_mes ou p_de/p_ate, as mesmas recusas do painel).
-- - hoje_do_cliente: cada etapa ganha andamento e pausadas (pendentes no prazo nesse estado) e o check-list ganha
--   mais_tempo (as 5 tarefas com mais tempo marcado). As chaves de antes não mudam.
-- - Índice parcial das tarefas em andamento e pausadas (tarefas_por_situacao conta as no prazo sem ler as pendentes).
-- Só acrescenta: um índice e funções. Nenhuma linha de tabela nenhuma muda.

begin;

-- ── Índice ───────────────────────────────────────────────────────────────────
-- As tarefas em andamento e pausadas de cada check-list (poucas), com o estado e o vencimento no próprio índice.
create index checklist_tarefas_em_curso_idx on public.checklist_tarefas (checklist_id, estado, vence_em)
  where estado in ('andamento', 'pausada');

-- ── Horas no período × capacidade ────────────────────────────────────────────
-- Todos os dias do período (de p_de a p_ate, dias de São Paulo; os que ainda não chegaram com 0), cada um com as horas
-- fechadas dos check-ins que começam nele (2 casas: o burn-up soma os dias sem perder frações), a capacidade do período
-- inteiro (private.capacidades_do_periodo: a linha da meta do fim do período) e o dia de hoje (onde o realizado para e a
-- projeção começa). Central e gestão pelo resumo por dia (só consultorias não arquivadas); o consultor, pelos check-ins
-- dele e só a capacidade dele.
create function public.horas_do_painel_por_dia(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_de date;
  v_ate date;
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.de, p.ate into v_de, v_ate from private.periodo_do_inicio(p_mes, p_de, p_ate) p;

  with feitos as (
    select d.dia, sum(d.segundos) as segundos
    from private.checkins_por_dia d
    where v_recorte <> 'pessoa'
      and d.dia >= v_de and d.dia <= v_ate
      and (v_consultoria is null or d.consultoria_id = v_consultoria)
      and d.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by d.dia
    union all
    select (k.inicio at time zone 'America/Sao_Paulo')::date, sum(extract(epoch from k.fim - k.inicio))
    from public.checkins k
    where v_recorte = 'pessoa' and k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_de::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (v_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  )
  select jsonb_build_object(
    'dias', (
      select jsonb_agg(jsonb_build_object('dia', g::date, 'horas', round(coalesce(f.segundos, 0) / 3600, 2)) order by g)
      from generate_series(v_de::timestamp, v_ate::timestamp, interval '1 day') g
      left join feitos f on f.dia = g::date),
    'capacidade', (
      select coalesce(sum(x.capacidade), 0)
      from private.capacidades_do_periodo(v_consultoria, v_de, v_ate, case when v_recorte = 'pessoa' then array[v_eu] end) x),
    'hoje', private.hoje())
  into v_resultado;

  return v_resultado;
end $$;

-- ── Horas por unidade por semana ─────────────────────────────────────────────
-- Central e gestão (o consultor recebe sem_recorte). As semanas (segunda a domingo, como checkins_por_semana) que tocam o
-- período efetivo, inteiras; uma série por unidade com horas: consultorias não arquivadas (central, pelo resumo por dia)
-- ou consultores (gestão, pelos check-ins fechados da consultoria; o nome pela regra de nome_do_perfil_visivel). As 8
-- com mais horas, da maior para a menor, e o resto numa série só (id nulo, 'Outros'). Período efetivo vazio: nenhuma
-- semana e nenhuma série.
create function public.horas_por_unidade_por_semana(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_de date;
  v_ate_efetivo date;
  v_ini date;
  v_fim date;
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  if v_recorte = 'pessoa' then
    raise exception 'sem_recorte' using errcode = '42501';
  end if;
  select p.de, p.ate_efetivo into v_de, v_ate_efetivo from private.periodo_do_inicio(p_mes, p_de, p_ate) p;
  if v_ate_efetivo < v_de then
    return jsonb_build_object('recorte', v_recorte, 'semanas', '[]'::jsonb, 'series', '[]'::jsonb);
  end if;
  v_ini := date_trunc('week', v_de::timestamp)::date;
  v_fim := date_trunc('week', v_ate_efetivo::timestamp)::date;

  with semanas as (
    select g::date as semana from generate_series(v_ini::timestamp, v_fim::timestamp, interval '1 week') g
  ),
  feitos as (
    select d.consultoria_id as id, date_trunc('week', d.dia::timestamp)::date as semana, sum(d.segundos) as segundos
    from private.checkins_por_dia d
    where v_recorte = 'tudo'
      and d.dia >= v_ini and d.dia < v_fim + 7
      and d.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by 1, 2
    union all
    select k.consultor_id, date_trunc('week', k.inicio at time zone 'America/Sao_Paulo')::date,
      sum(extract(epoch from k.fim - k.inicio))
    from public.checkins k
    where v_recorte = 'consultoria' and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_ini::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (v_fim + 7)::timestamp at time zone 'America/Sao_Paulo'
    group by 1, 2
  ),
  unidades as (
    select f.id, row_number() over (order by sum(f.segundos) desc, f.id) as o
    from feitos f
    group by f.id
    having sum(f.segundos) > 0
  ),
  -- Grupo 1 a 8: a própria unidade; 9: Outros (o resto somado).
  linhas as (
    select least(u.o, 9) as g, case when u.o <= 8 then u.id end as id, s.semana, coalesce(sum(f.segundos), 0) as segundos
    from unidades u
    cross join semanas s
    left join feitos f on f.id = u.id and f.semana = s.semana
    group by 1, 2, 3
  ),
  series as (
    select l.g, l.id, jsonb_agg(round(l.segundos / 3600, 1) order by l.semana) as horas
    from linhas l
    group by l.g, l.id
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'semanas', (select jsonb_agg(s.semana order by s.semana) from semanas s),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id,
          'nome', case when s.g = 9 then 'Outros'
            when v_recorte = 'tudo' then co.nome
            else private.nome_do_perfil_visivel(s.id) end,
          'horas', s.horas) order by s.g)
      from series s
      left join public.consultorias co on v_recorte = 'tudo' and co.id = s.id), '[]'::jsonb))
  into v_resultado;

  return v_resultado;
end $$;

-- ── Quando os check-ins acontecem ────────────────────────────────────────────
-- Os check-ins fechados que começam no período, contados pelo dia da semana (domingo = 0) e pela hora de início em São
-- Paulo, das 7h às 20h (antes das 7h contam na 7h; depois das 20h, na 20h). As 98 células, com zero inclusive. Central:
-- consultorias não arquivadas; gestão: a consultoria; consultor: os dele.
create function public.checkins_por_dia_e_hora(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_de timestamptz;
  v_ate timestamptz;
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.de::timestamp at time zone 'America/Sao_Paulo', (p.ate + 1)::timestamp at time zone 'America/Sao_Paulo'
  into v_de, v_ate
  from private.periodo_do_inicio(p_mes, p_de, p_ate) p;

  -- Um ramo por recorte: cada um é uma faixa só do índice (por data, pela consultoria ou pelo consultor).
  with inicios as (
    select k.inicio from public.checkins k
    where v_recorte = 'tudo' and k.fim is not null and k.inicio >= v_de and k.inicio < v_ate
      and k.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    union all
    select k.inicio from public.checkins k
    where v_recorte = 'consultoria' and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_de and k.inicio < v_ate
    union all
    select k.inicio from public.checkins k
    where v_recorte = 'pessoa' and k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_de and k.inicio < v_ate
  ),
  contas as (
    select extract(dow from l.local)::int as dia_semana,
      least(greatest(extract(hour from l.local)::int, 7), 20) as hora, count(*) as n
    from (select i.inicio at time zone 'America/Sao_Paulo' as local from inicios i) l
    group by 1, 2
  )
  select jsonb_build_object('celulas', jsonb_agg(
      jsonb_build_object('dia_semana', d, 'hora', h, 'checkins', coalesce(c.n, 0)) order by d, h))
  from generate_series(0, 6) d
  cross join generate_series(7, 20) h
  left join contas c on c.dia_semana = d and c.hora = h
  into v_resultado;

  return v_resultado;
end $$;

-- ── Tarefas por situação ─────────────────────────────────────────────────────
-- As tarefas dos check-lists abertos dos clientes não arquivados no recorte (como indicadores_de_checkins): feitas, não
-- se aplica, atrasadas (pendentes vencidas antes de hoje) e, das no prazo, em andamento, pausadas e a fazer; as partes
-- somam as tarefas. Feitas, não se aplica e o total vêm dos contadores do check-list; as atrasadas só são procuradas nos
-- check-lists com vencimento passado; em andamento e pausadas pelo índice delas; a fazer é o que sobra.
create function public.tarefas_por_situacao()
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_hoje date := private.hoje();
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;

  with ativos as materialized (
    select cl.id, cl.tarefas, cl.feitas, cl.nao_se_aplica, cl.proximo_vencimento
    from public.clientes c
    join public.cliente_checklists cl
      on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
    where not c.arquivado
      and c.consultoria_id is not null
      and (v_recorte = 'tudo' or c.consultoria_id = v_consultoria)
      and (v_recorte <> 'pessoa' or c.consultor_id = v_eu)
  ),
  atrasadas as (
    select coalesce(sum(x.n), 0) as n
    from ativos a
    cross join lateral (
      select count(*) as n from public.checklist_tarefas t
      where t.checklist_id = a.id and t.estado in ('a_fazer', 'andamento', 'pausada') and t.vence_em < v_hoje
    ) x
    where a.proximo_vencimento < v_hoje
  ),
  em_curso as (
    select count(*) filter (where t.estado = 'andamento') as andamento,
      count(*) filter (where t.estado = 'pausada') as pausadas
    from ativos a
    join public.checklist_tarefas t on t.checklist_id = a.id
    where t.estado in ('andamento', 'pausada') and t.vence_em >= v_hoje
  ),
  somas as (
    select count(*) as checklists, coalesce(sum(a.tarefas), 0) as tarefas, coalesce(sum(a.feitas), 0) as feitas,
      coalesce(sum(a.nao_se_aplica), 0) as nao_se_aplica
    from ativos a
  )
  select jsonb_build_object(
    'feitas', s.feitas,
    'nao_se_aplica', s.nao_se_aplica,
    'andamento', e.andamento,
    'pausadas', e.pausadas,
    'a_fazer', s.tarefas - s.feitas - s.nao_se_aplica - t.n - e.andamento - e.pausadas,
    'atrasadas', t.n,
    'checklists', s.checklists)
  into v_resultado
  from somas s, atrasadas t, em_curso e;

  return v_resultado;
end $$;

-- ── Clientes por cidade ──────────────────────────────────────────────────────
-- Central e gestão (o consultor recebe sem_recorte). Os clientes não arquivados no recorte (central: todos; gestão: os da
-- consultoria) por cidade e UF, juntando grafias sem acento, sem maiúscula e sem espaço nas pontas (mostra a grafia mais
-- comum): as 6 cidades com mais clientes e, no fim, "Sem cidade" (cidade e uf nulas; só se houver); outras = os clientes
-- das demais cidades; total = todos.
create function public.clientes_por_cidade()
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  if v_recorte = 'pessoa' then
    raise exception 'sem_recorte' using errcode = '42501';
  end if;

  -- Primeiro pela grafia como está (poucos grupos); só eles passam pelo sem_acento.
  with grafias as (
    select nullif(btrim(c.cidade), '') as cidade, c.uf, count(*) as n
    from public.clientes c
    where not c.arquivado and (v_recorte = 'tudo' or c.consultoria_id = v_consultoria)
    group by 1, 2
  ),
  cidades as (
    select private.sem_acento(g.cidade) as chave, g.uf, (array_agg(g.cidade order by g.n desc, g.cidade))[1] as cidade,
      sum(g.n) as n
    from grafias g
    where g.cidade is not null
    group by 1, 2
  ),
  ordem as (
    select c.*, row_number() over (order by c.n desc, c.chave, c.uf) as o from cidades c
  )
  select jsonb_build_object(
    'cidades', coalesce((
      select jsonb_agg(jsonb_build_object('cidade', o.cidade, 'uf', o.uf, 'clientes', o.n) order by o.o)
      from ordem o where o.o <= 6), '[]'::jsonb)
      || coalesce((
        select jsonb_build_array(jsonb_build_object('cidade', null, 'uf', null, 'clientes', sum(g.n)))
        from grafias g where g.cidade is null having count(*) > 0), '[]'::jsonb),
    'outras', (select coalesce(sum(o.n), 0) from ordem o where o.o > 6),
    'total', (select coalesce(sum(g.n), 0) from grafias g))
  into v_resultado;

  return v_resultado;
end $$;

-- ── Faixa "Hoje" do cliente ──────────────────────────────────────────────────
-- Mesmo corpo de 20261119134702_tarefa_pausada_tempos_comentarios.sql; muda só:
-- - cada etapa ganha andamento e pausadas: as pendentes no prazo (vencem hoje ou depois) nesse estado; a vencida conta
--   só em atrasadas (a conta das etapas lê as pendentes do check-list uma vez);
-- - o check-list ganha mais_tempo: as 5 tarefas com mais tempo marcado (tempo_segundos de checklist_do_cliente: a soma
--   dos trechos, o aberto até agora), só as com mais de zero, a maior primeiro (empate pela posição).
create or replace function public.hoje_do_cliente(p_cliente uuid)
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
        select coalesce(jsonb_agg((x.e - 'posicao') || jsonb_build_object('atrasadas', coalesce(a.n, 0),
            'andamento', coalesce(a.andamento, 0), 'pausadas', coalesce(a.pausadas, 0)) order by x.o),
          '[]'::jsonb)
        from jsonb_array_elements(v_lista -> 'etapas') with ordinality x(e, o)
        left join (
          select t.etapa_id, count(*) filter (where t.vence_em < v_hoje) as n,
            count(*) filter (where t.estado = 'andamento' and t.vence_em >= v_hoje) as andamento,
            count(*) filter (where t.estado = 'pausada' and t.vence_em >= v_hoje) as pausadas
          from public.checklist_tarefas t
          where t.checklist_id = (v_lista #>> '{checklist,id}')::uuid
            and t.estado in ('a_fazer', 'andamento', 'pausada')
          group by t.etapa_id
        ) a on a.etapa_id = (x.e ->> 'id')::uuid),
      'mais_tempo', (
        select coalesce(jsonb_agg(jsonb_build_object('titulo', m.t ->> 'titulo', 'segundos', m.segundos)
          order by m.segundos desc, m.posicao), '[]'::jsonb)
        from (
          select t, (t ->> 'tempo_segundos')::bigint as segundos, (t ->> 'posicao')::int as posicao
          from jsonb_array_elements(v_lista -> 'tarefas') t
          where (t ->> 'tempo_segundos')::bigint > 0
          order by 2 desc, 3
          limit 5
        ) m)) end);
end $$;

-- ── Acesso ───────────────────────────────────────────────────────────────────
-- As do Início: só quem está logado (e cada uma confere o recorte).
revoke all on function public.horas_do_painel_por_dia(date, date, date), public.horas_por_unidade_por_semana(date, date, date),
  public.checkins_por_dia_e_hora(date, date, date), public.tarefas_por_situacao(), public.clientes_por_cidade()
from public, anon, service_role;
grant execute on function public.horas_do_painel_por_dia(date, date, date), public.horas_por_unidade_por_semana(date, date, date),
  public.checkins_por_dia_e_hora(date, date, date), public.tarefas_por_situacao(), public.clientes_por_cidade()
to authenticated;
-- hoje_do_cliente: os grants de 20261119134702 de novo.
revoke all on function public.hoje_do_cliente(uuid) from public, anon;
grant execute on function public.hoje_do_cliente(uuid) to authenticated;

commit;
