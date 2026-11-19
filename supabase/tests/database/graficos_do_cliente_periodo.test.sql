-- Gráficos da aba Geral do cliente num período (pedido do Diego, 19/11; design 2026-11-17-graficos-do-inicio-e-do-cliente,
-- "Decisões da construção"): horas_do_cliente_por_dia_no_periodo (o acumulado e a previsão proporcional),
-- horas_do_cliente_por_consultor_no_periodo e checkins_do_cliente_por_semana_no_periodo, pelo RLS de checkins, com as
-- recusas do Início (periodo_invalido). Duas consultorias (A e B), central, administrador de A e de B e dois consultores
-- de A. Datas relativas a hoje. Os tempos (um cliente com 5.000 check-ins em 2 anos) ficam no fim. Roda com:
-- npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Período do cliente ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@periodo-cliente.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@periodo-cliente.test', p_papel);
  return v;
end $$;

-- Cliente gravado como o sistema, com o consultor há p_desde dias.
create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text, p_desde int)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, p_horas, testes.id(p_consultoria), testes.id(p_consultor))
  returning id into v;
  update public.clientes set consultor_desde = now() - p_desde * interval '1 day' where id = v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.mudar(p_nome text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute format('update public.clientes set %s where id = %L', p_sql, testes.id(p_nome));
end $$;

-- Check-in fechado gravado pelo consultor do cliente (o gatilho confere quem grava pelo JWT).
create function testes.checkin(p_consultor text, p_cliente text, p_inicio timestamptz, p_minutos int) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_consultor), 'role', 'authenticated')::text, true);
  insert into public.checkins (cliente_id, inicio, fim, descricao)
  values (testes.id(p_cliente), p_inicio, p_inicio + p_minutos * interval '1 minute', 'Período do cliente');
  perform set_config('request.jwt.claims', '', true);
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Chama como a pessoa logada (role authenticated: o RLS vale) e volta a ser o dono do banco.
create function testes.logado(p_quem text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform testes.como(p_quem);
  execute 'select to_jsonb((' || p_sql || '))' into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
create function testes.por_dia(p_quem text, p_cliente text, p_de date, p_ate date) returns jsonb language sql as $$
  select testes.logado(p_quem, format('public.horas_do_cliente_por_dia_no_periodo(%L::uuid, %L::date, %L::date)',
    testes.id(p_cliente), p_de, p_ate))
$$;
create function testes.consultores(p_quem text, p_cliente text, p_de date, p_ate date) returns jsonb language sql as $$
  select testes.logado(p_quem, format('(select coalesce(jsonb_agg(jsonb_build_object(''id'', x.consultor_id, ''nome'', x.nome,
    ''horas'', x.horas)), ''[]'') from public.horas_do_cliente_por_consultor_no_periodo(%L::uuid, %L::date, %L::date) x)',
    testes.id(p_cliente), p_de, p_ate))
$$;
create function testes.semanas(p_quem text, p_cliente text, p_de date, p_ate date) returns jsonb language sql as $$
  select testes.logado(p_quem, format('(select coalesce(jsonb_agg(jsonb_build_object(''semana'', x.semana,
    ''quantidade'', x.quantidade, ''horas'', x.horas) order by x.semana), ''[]'')
    from public.checkins_do_cliente_por_semana_no_periodo(%L::uuid, %L::date, %L::date) x)', testes.id(p_cliente), p_de, p_ate))
$$;
-- Estado, mensagem e detalhe da recusa (ou 'aceitou'), como a pessoa logada.
create function testes.recusa(p_quem text, p_sql text) returns text language plpgsql as $$
declare v_estado text; v_msg text; v_detalhe text;
begin
  perform testes.como(p_quem);
  execute p_sql;
  reset role;
  return 'aceitou';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_detalhe = pg_exception_detail;
  reset role;
  return v_estado || ' ' || v_msg || ': ' || coalesce(v_detalhe, '');
end $$;

create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.mes_atual() returns date language sql stable as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.fim_do_mes(p date) returns date language sql immutable as $$
  select (date_trunc('month', p::timestamp) + interval '1 month - 1 day')::date
$$;
-- Um instante num dia contado de hoje (negativo = passado), na hora de São Paulo.
create function testes.dia(p_dias int, p_hora numeric) returns timestamptz language sql stable as $$
  select ((testes.hoje() + p_dias)::timestamp + p_hora * interval '1 hour') at time zone 'America/Sao_Paulo'
$$;
-- Os dias de [de, ate] com as horas e o acumulado, direto dos check-ins fechados do cliente numa consultoria.
create function testes.dias_diretos(p_cliente text, p_de date, p_ate date, p_consultoria text) returns jsonb
language sql stable as $$
  with s as (
    select (k.inicio at time zone 'America/Sao_Paulo')::date as dia, sum(extract(epoch from k.fim - k.inicio)) as seg
    from public.checkins k
    where k.cliente_id = testes.id(p_cliente) and k.fim is not null and k.consultoria_id = testes.id(p_consultoria)
      and k.inicio >= p_de::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  ), d as (
    select g::date as dia, coalesce(s.seg, 0) as seg, sum(coalesce(s.seg, 0)) over (order by g) as acumulado
    from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') g
    left join s on s.dia = g::date
  )
  select jsonb_agg(jsonb_build_object('dia', d.dia, 'horas', round(d.seg / 3600, 1),
    'acumulado', round(d.acumulado / 3600, 1)) order by d.dia)
  from d
$$;
-- A previsão proporcional de [de, ate], direto: cada dia vale horas / dias do mês dele.
create function testes.previsao_direta(p_horas numeric, p_de date, p_ate date) returns numeric language sql immutable as $$
  select round(p_horas * sum(1.0 / extract(day from testes.fim_do_mes(g::date))), 1)
  from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') g
$$;
-- Média (ms) de 5 execuções, só para o relatório (diag): o limite de verdade é o performs_within.
create function testes.media_ms_de(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop execute p_sql; end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms_de(text) to authenticated;
-- Quantas vezes a tabela checkins foi varrida inteira (Seq Scan) ao rodar o comando (o contador desta transação).
create function testes.varreduras(p_sql text) returns bigint language plpgsql as $$
declare v_antes bigint := pg_stat_get_xact_numscans('public.checkins'::regclass);
begin
  execute p_sql;
  return pg_stat_get_xact_numscans('public.checkins'::regclass) - v_antes;
end $$;
grant execute on function testes.varreduras(text) to authenticated;

-- ── Dados ────────────────────────────────────────────────────────────────────
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');

-- c1: da pessoa_a há 60 dias, 30 h/mês. Check-ins da pessoa_a nos dias -40 (2 h, fora do período P), -20 (1 h), -3
-- (1 h 30) e -1 (30 min, fora de P); a pessoa_a2 atende o c1 por um tempo e faz 1 h no dia -10. P = [-35, -2]: 3,5 h
-- em 3 check-ins (2,5 h da pessoa_a e 1 h da pessoa_a2).
select testes.cliente('c1', 30, 'A', 'pessoa_a', 60);
select testes.checkin('pessoa_a', 'c1', testes.dia(-40, 9), 120);
select testes.checkin('pessoa_a', 'c1', testes.dia(-20, 9), 60);
select testes.checkin('pessoa_a', 'c1', testes.dia(-3, 9), 90);
select testes.checkin('pessoa_a', 'c1', testes.dia(-1, 14), 30);
select testes.mudar('c1', format('consultor_id = %L', testes.id('pessoa_a2')));
select testes.checkin('pessoa_a2', 'c1', testes.dia(-10, 9), 60);
select testes.mudar('c1', format('consultor_id = %L', testes.id('pessoa_a')));
select testes.mudar('c1', $$consultor_desde = now() - interval '60 days'$$);

create temp table p as select testes.hoje() - 35 as de, testes.hoje() - 2 as ate;
grant select on p to authenticated;

-- ── Horas por dia no período ─────────────────────────────────────────────────
create temp table dia_p as select testes.por_dia('admin_a', 'c1', p.de, p.ate) as j from p;
select is((select array[j ->> 'de', j ->> 'ate', j ->> 'ate_efetivo'] from dia_p),
  (select array[p.de::text, p.ate::text, p.ate::text] from p), 'por dia: de, até e o fim efetivo (período passado)');
select is((select j -> 'dias' from dia_p), (select testes.dias_diretos('c1', p.de, p.ate, 'A') from p),
  'por dia: um dia por dia do período, com horas e acumulado = soma direta');
select is((select (j ->> 'realizado')::numeric from dia_p), 3.5, 'por dia: o realizado do período (3 check-ins)');
select is((select row((j ->> 'previsao')::numeric, (j ->> 'previsao_mes')::numeric)::text from dia_p),
  (select row(testes.previsao_direta(30, p.de, p.ate), 30.0)::text from p),
  'por dia: a previsão proporcional (cada dia vale horas_mes / dias do mês dele) e a previsão do mês');
select is((select row(j ->> 'ate', j ->> 'ate_efetivo', j -> 'dias' -> -1 ->> 'dia')::text
    from (select testes.por_dia('admin_a', 'c1', testes.hoje() - 5, testes.fim_do_mes(testes.hoje())) as j) x),
  row(testes.fim_do_mes(testes.hoje())::text, testes.hoje()::text, testes.hoje()::text)::text,
  'por dia: período que acaba depois de hoje para em hoje (o fim efetivo), com o até de verdade');
select ok(case when testes.fim_do_mes(testes.hoje()) > testes.hoje() then
    (select j -> 'dias' = '[]'::jsonb and (j ->> 'realizado')::numeric = 0 and (j ->> 'previsao')::numeric = 0
      from (select testes.por_dia('admin_a', 'c1', testes.fim_do_mes(testes.hoje()), testes.fim_do_mes(testes.hoje())) as j) x)
    else true end,
  'por dia: período que começa depois de hoje não tem dias, horas nem previsão');
select is((select row(j ->> 'de', j ->> 'ate')::text from (select testes.por_dia('admin_a', 'c1', null, null) as j) x),
  row(testes.mes_atual()::text, testes.fim_do_mes(testes.hoje())::text)::text, 'por dia: sem de e até, o mês atual');
select is((select (j ->> 'realizado')::numeric from (select testes.por_dia('admin_a', 'c1',
    date_trunc('month', testes.hoje() - 40)::date, testes.fim_do_mes(testes.hoje() - 40)) as j) x),
  (testes.logado('admin_a', format('public.horas_do_cliente_por_dia(%L::uuid, %L::date)', testes.id('c1'), testes.hoje() - 40))
    ->> 'realizado')::numeric,
  'por dia: um mês inteiro passado no período dá o mesmo realizado da função do mês (que continua igual)');
select is((select (j ->> 'realizado')::numeric from (select testes.por_dia('central', 'c1', p.de, p.ate) as j from p) x), 3.5,
  'por dia: a central soma o mesmo');
select is((select (j ->> 'realizado')::numeric from (select testes.por_dia('pessoa_a', 'c1', p.de, p.ate) as j from p) x), 2.5,
  'por dia do consultor: só as horas dele (RLS)');

-- ── Horas por consultor no período ───────────────────────────────────────────
select is((select testes.consultores('admin_a', 'c1', p.de, p.ate) from p),
  jsonb_build_array(jsonb_build_object('id', testes.id('pessoa_a'), 'nome', 'Pessoa pessoa_a', 'horas', 2.5),
    jsonb_build_object('id', testes.id('pessoa_a2'), 'nome', 'Pessoa pessoa_a2', 'horas', 1.0)),
  'por consultor: os do período, mais horas primeiro, com o nome');
select is((select testes.consultores('pessoa_a', 'c1', p.de, p.ate) -> 0 ->> 'id' from p), testes.id('pessoa_a')::text,
  'por consultor, o consultor: só ele (RLS)');
select is((select jsonb_array_length(testes.consultores('pessoa_a', 'c1', p.de, p.ate)) from p), 1,
  'por consultor, o consultor: uma linha só');

-- ── Check-ins por semana no período ──────────────────────────────────────────
create temp table semanas_p as select testes.semanas('admin_a', 'c1', p.de, p.ate) as j from p;
select is((select array[j -> 0 ->> 'semana', j -> -1 ->> 'semana'] from semanas_p),
  (select array[date_trunc('week', p.de::timestamp)::date::text, date_trunc('week', p.ate::timestamp)::date::text] from p),
  'por semana: da semana do de até a semana do até');
select is((select jsonb_array_length(j) from semanas_p),
  (select ((date_trunc('week', p.ate::timestamp)::date - date_trunc('week', p.de::timestamp)::date) / 7 + 1)::int from p),
  'por semana: todas as semanas que tocam o período, inclusive as sem check-in');
select is((select row(sum((e ->> 'quantidade')::int), sum((e ->> 'horas')::numeric))::text
    from semanas_p, jsonb_array_elements(j) e), row(3, 3.5)::text,
  'por semana: 3 check-ins e 3,5 h, só os que começam no período');

-- ── Outra consultoria ────────────────────────────────────────────────────────
select is((select row((j ->> 'realizado')::numeric, coalesce(j ->> 'previsao', 'nula'), coalesce(j ->> 'previsao_mes', 'nula'),
      (select bool_and((d ->> 'acumulado')::numeric = 0) from jsonb_array_elements(j -> 'dias') d))::text
    from (select testes.por_dia('admin_b', 'c1', p.de, p.ate) as j from p) x), '(0,nula,nula,t)',
  'por dia: a gestão da B não soma nada do cliente da A nem vê a previsão');
select is((select testes.consultores('admin_b', 'c1', p.de, p.ate) from p), '[]'::jsonb,
  'por consultor: a gestão da B não vê ninguém do cliente da A');
select is((select sum((e ->> 'quantidade')::int) from p, jsonb_array_elements(testes.semanas('admin_b', 'c1', p.de, p.ate)) e),
  0::bigint, 'por semana: a gestão da B não conta nenhum check-in do cliente da A');

-- ── Período inválido (as recusas e as frases do Início) ──────────────────────
select is(testes.recusa('admin_a', format('select public.horas_do_cliente_por_dia_no_periodo(%L, %L, %L)', testes.id('c1'),
    testes.hoje() - 1, testes.hoje() - 2)), '22023 periodo_invalido: A data inicial vem depois da final.',
  'recusa: de depois do até');
select is(testes.recusa('admin_a', format('select public.horas_do_cliente_por_dia_no_periodo(%L, %L, %L)', testes.id('c1'),
    testes.hoje(), testes.fim_do_mes(testes.hoje()) + 1)), '22023 periodo_invalido: O período vai no máximo até o fim do mês atual.',
  'recusa: até depois do fim do mês atual');
select is(testes.recusa('admin_a', format('select public.horas_do_cliente_por_dia_no_periodo(%L, %L, %L)', testes.id('c1'),
    (testes.hoje() - interval '2 years')::date, testes.hoje())), '22023 periodo_invalido: O período pode ter no máximo 2 anos.',
  'recusa: 2 anos ou mais');
select is(testes.recusa('admin_a', format('select public.horas_do_cliente_por_dia_no_periodo(%L, %L, null)', testes.id('c1'),
    testes.hoje())), '22023 periodo_invalido: Mande o mês ou o período (de e até), não os dois.',
  'recusa: só uma das datas');
select is(array[
    testes.recusa('admin_a', format('select * from public.horas_do_cliente_por_consultor_no_periodo(%L, %L, %L)', testes.id('c1'),
      testes.hoje() - 1, testes.hoje() - 2)),
    testes.recusa('admin_a', format('select * from public.checkins_do_cliente_por_semana_no_periodo(%L, %L, %L)', testes.id('c1'),
      testes.hoje() - 1, testes.hoje() - 2))],
  array['22023 periodo_invalido: A data inicial vem depois da final.', '22023 periodo_invalido: A data inicial vem depois da final.'],
  'recusa: as três funções recusam igual');

-- ── Acesso ───────────────────────────────────────────────────────────────────
select ok((select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute'))
    from unnest(array['public.horas_do_cliente_por_dia_no_periodo(uuid, date, date)',
      'public.horas_do_cliente_por_consultor_no_periodo(uuid, date, date)',
      'public.checkins_do_cliente_por_semana_no_periodo(uuid, date, date)', 'private.periodo_do_cliente(date, date)']) f),
  'acesso: só quem está logado executa as três e o ajudante de datas');
select is((select array_agg(row(p.proname, p.prosecdef, p.provolatile)::text order by p.proname) from pg_proc p
    where p.proname in ('horas_do_cliente_por_dia_no_periodo', 'horas_do_cliente_por_consultor_no_periodo',
      'checkins_do_cliente_por_semana_no_periodo', 'periodo_do_cliente')),
  array['(checkins_do_cliente_por_semana_no_periodo,f,s)', '(horas_do_cliente_por_consultor_no_periodo,f,s)',
    '(horas_do_cliente_por_dia_no_periodo,f,s)', '(periodo_do_cliente,t,s)'],
  'acesso: as três são security invoker (o RLS decide), o ajudante de datas é definer; todas stable');

-- ── Tempos ───────────────────────────────────────────────────────────────────
-- Cliente grande da pessoa_v (A, 40 h/mês): 5.000 check-ins fechados de 1 h (um a cada 3 h 30, de ontem para trás: ~2
-- anos), e um fundo de 45.000 check-ins de 15 clientes da B nos mesmos 2 anos (sem ele, o cliente grande seria quase a
-- tabela inteira e a conferência de Seq Scan não diria nada), gravado como em graficos_do_cliente.test.sql.
select testes.perfil('pessoa_v', 'pessoa', 'A');
select testes.cliente('grande', 40, 'A', 'pessoa_v', 800);
select set_config('request.jwt.claims', json_build_object('sub', testes.id('pessoa_v'), 'role', 'authenticated')::text, true);
insert into public.checkins (cliente_id, inicio, fim, descricao)
select testes.id('grande'), now() - interval '1 day' - k * interval '210 minutes',
  now() - interval '1 day' - k * interval '210 minutes' + interval '1 hour', 'Volume do cliente'
from generate_series(4999, 0, -1) k;
select set_config('request.jwt.claims', '', true);
select testes.perfil('fundo_' || i, 'pessoa', 'B') from generate_series(1, 15) i;
select testes.cliente('fundo_c' || i, 40, 'B', 'fundo_' || i, 800) from generate_series(1, 15) i;
alter table public.checkins disable trigger checkins_validar;
alter table public.checkins disable trigger checkins_resumir_horas;
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select c.id, f.id, testes.id('B'), now() - k * interval '350 minutes', now() - k * interval '350 minutes' + interval '1 hour',
  'Fundo'
from generate_series(3000, 1, -1) k
cross join generate_series(1, 15) i
join testes.fx f on f.nome = 'fundo_' || i
join testes.fx c on c.nome = 'fundo_c' || i
order by 4;
alter table public.checkins enable trigger checkins_validar;
alter table public.checkins enable trigger checkins_resumir_horas;
-- Estatísticas de agora (dentro desta transação, desfeitas no fim), como nos outros testes de volume.
analyze public.clientes, public.checkins;

-- Os 2 anos inteiros (o maior período que o Início aceita): de um dia depois de hoje - 2 anos até hoje.
create temp table p2 as select (testes.hoje() - interval '2 years')::date + 1 as de, testes.hoje() as ate;
grant select on p2 to authenticated;
create temp table sql2 (nome text primary key, sql text);
insert into sql2 select 'dia', format('select public.horas_do_cliente_por_dia_no_periodo(%L, %L, %L)', testes.id('grande'), de, ate) from p2;
insert into sql2 select 'consultor', format('select * from public.horas_do_cliente_por_consultor_no_periodo(%L, %L, %L)', testes.id('grande'), de, ate) from p2;
insert into sql2 select 'semana', format('select * from public.checkins_do_cliente_por_semana_no_periodo(%L, %L, %L)', testes.id('grande'), de, ate) from p2;
grant select on sql2 to authenticated;

select ok((select jsonb_array_length(j -> 'dias') = (p2.ate - p2.de + 1) and (j ->> 'realizado')::numeric > 4000
    from p2, (select testes.por_dia('admin_a', 'grande', p2.de, p2.ate) as j from p2) x),
  'volume: os 2 anos do cliente grande vêm inteiros (um ponto por dia e as horas dos 5.000 check-ins)');

-- Média de 5 execuções (o pgTAP descarta a mais rápida); janela "média +- folga" centrada em 0,75 x limite com folga de
-- 0,75 x limite: o limite como média, com 50% de tolerância (como painel_volume).
select testes.como('admin_a');
select diag('2 anos, gestão: por dia ' || testes.media_ms_de((select sql from sql2 where nome = 'dia'))
  || ' ms; por consultor ' || testes.media_ms_de((select sql from sql2 where nome = 'consultor'))
  || ' ms; por semana ' || testes.media_ms_de((select sql from sql2 where nome = 'semana')) || ' ms');
select performs_within((select sql from sql2 where nome = 'dia'), 37.5, 37.5, 5,
  'gestão: horas por dia em 2 anos do cliente grande em até 50 ms na média (+50%)');
select performs_within((select sql from sql2 where nome = 'consultor'), 37.5, 37.5, 5,
  'gestão: horas por consultor em 2 anos do cliente grande em até 50 ms na média (+50%)');
select performs_within((select sql from sql2 where nome = 'semana'), 37.5, 37.5, 5,
  'gestão: check-ins por semana em 2 anos do cliente grande em até 50 ms na média (+50%)');
select is((select sum(testes.varreduras(sql)) from sql2), 0::numeric,
  'gestão: nenhuma das três varre a tabela de check-ins (sem Seq Scan)');
reset role;
select testes.como('pessoa_v');
select diag('2 anos, consultor: por dia ' || testes.media_ms_de((select sql from sql2 where nome = 'dia'))
  || ' ms; por consultor ' || testes.media_ms_de((select sql from sql2 where nome = 'consultor'))
  || ' ms; por semana ' || testes.media_ms_de((select sql from sql2 where nome = 'semana')) || ' ms');
select performs_within((select sql from sql2 where nome = 'dia'), 37.5, 37.5, 5,
  'consultor: horas por dia em 2 anos do cliente grande em até 50 ms na média (+50%)');
select performs_within((select sql from sql2 where nome = 'consultor'), 37.5, 37.5, 5,
  'consultor: horas por consultor em 2 anos do cliente grande em até 50 ms na média (+50%)');
select performs_within((select sql from sql2 where nome = 'semana'), 37.5, 37.5, 5,
  'consultor: check-ins por semana em 2 anos do cliente grande em até 50 ms na média (+50%)');
reset role;

select * from finish();
rollback;
