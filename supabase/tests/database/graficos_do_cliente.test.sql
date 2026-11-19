-- Faixa "Hoje" e horas por dia do cliente (design 2026-11-17-graficos-do-inicio-e-do-cliente, "Cliente → Geral"; plano,
-- Task 3): hoje_do_cliente (previsão do mês, último check-in, próxima reunião, quadro e check-list de hoje, no recorte de
-- quem vê o cliente), horas_do_cliente_por_dia (o acumulado do mês e a projeção, pelo RLS de checkins) e
-- horas_do_cliente_por_mes com p_ate. Duas consultorias (A e B), central, administrador de A e de B, dois consultores de
-- A e um de B. Datas relativas a hoje: o mês anterior (M) e os últimos dias. Os tempos (um cliente com 5.000 check-ins,
-- 1.000 cartões, 500 tarefas e 1.000 eventos) ficam no fim. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;
-- O que cada função devolveu a quem chamou.
create table testes.r (nome text primary key, j jsonb);

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Gráficos cliente ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text, p_exige_2fa boolean default false)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@graficos-cliente.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, exige_2fa)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@graficos-cliente.test', p_papel, p_exige_2fa);
  return v;
end $$;

-- Cliente gravado como o sistema; p_desde = há quantos dias tem o consultor (consultor_desde no passado).
create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text,
  p_desde int default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, p_horas, testes.id(p_consultoria), testes.id(p_consultor))
  returning id into v;
  if p_desde is not null then
    update public.clientes set consultor_desde = now() - p_desde * interval '1 day' where id = v;
  end if;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Mudança no cliente feita como o sistema.
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
  values (testes.id(p_cliente), p_inicio, p_inicio + p_minutos * interval '1 minute', 'Gráficos do cliente');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Evento do cliente gravado pelo sistema, de 1 h, na consultoria de hoje do cliente.
create function testes.evento(p_nome text, p_consultor text, p_cliente text, p_inicio timestamptz,
  p_meet boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet, criado_por)
  values ((select c.consultoria_id from public.clientes c where c.id = testes.id(p_cliente)), testes.id(p_consultor),
    testes.id(p_cliente), 'Reunião ' || p_nome, p_inicio, p_inicio + interval '1 hour', p_meet, testes.id(p_consultor))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
    || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- Chama com o JWT de quem (hoje_do_cliente é security definer: o recorte vem só do JWT).
create function testes.chamar(p_quem text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_quem), 'role', 'authenticated')::text, true);
  execute 'select to_jsonb((' || p_sql || '))' into v;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
-- Chama como a pessoa logada (role authenticated: o RLS vale; as funções invoker e realizado_no_mes) e volta a ser o
-- dono do banco.
create function testes.logado(p_quem text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform testes.como(p_quem);
  execute 'select to_jsonb((' || p_sql || '))' into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
create function testes.hoje_de(p_quem text, p_cliente text) returns jsonb language sql as $$
  select testes.chamar(p_quem, format('public.hoje_do_cliente(%L::uuid)', testes.id(p_cliente)))
$$;
create function testes.guardar(p_nome text, p_quem text, p_cliente text) returns void language sql as $$
  insert into testes.r values (p_nome, testes.hoje_de(p_quem, p_cliente))
$$;
create function testes.j(p_nome text) returns jsonb language sql stable as $$
  select j from testes.r where nome = p_nome
$$;
-- O realizado_no_mes do cliente para quem (a regra da lista de Clientes: os check-ins que a pessoa enxerga).
create function testes.realizado_no_mes(p_quem text, p_cliente text) returns numeric language sql as $$
  select (testes.logado(p_quem, format('(select public.realizado_no_mes(c) from public.clientes c where c.id = %L)',
    testes.id(p_cliente))) #>> '{}')::numeric
$$;
create function testes.por_dia(p_quem text, p_cliente text, p_mes date) returns jsonb language sql as $$
  select testes.logado(p_quem, format('public.horas_do_cliente_por_dia(%L::uuid, %L::date)', testes.id(p_cliente), p_mes))
$$;
-- Os meses de horas_do_cliente_por_mes, como a pessoa logada (p_args: o que vem depois do cliente).
create function testes.por_mes(p_quem text, p_cliente text, p_args text) returns jsonb language sql as $$
  select testes.logado(p_quem, format('(select jsonb_agg(jsonb_build_object(''mes'', x.mes, ''realizado'', x.realizado)
    order by x.mes) from public.horas_do_cliente_por_mes(%L::uuid%s) x)', testes.id(p_cliente), p_args))
$$;

create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.mes_atual() returns date language sql stable as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.mes_anterior() returns date language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date
$$;
create function testes.fim_do_mes(p date) returns date language sql immutable as $$
  select (date_trunc('month', p::timestamp) + interval '1 month - 1 day')::date
$$;
-- Um instante do mês anterior (M): dia (0 = dia 1) e hora de São Paulo.
create function testes.em(p_dia int, p_hora numeric) returns timestamptz language sql stable as $$
  select ((testes.mes_anterior() + p_dia)::timestamp + p_hora * interval '1 hour') at time zone 'America/Sao_Paulo'
$$;
-- Um instante num dia contado de hoje (negativo = passado), na hora de São Paulo.
create function testes.dia(p_dias int, p_hora numeric) returns timestamptz language sql stable as $$
  select ((testes.hoje() + p_dias)::timestamp + p_hora * interval '1 hour') at time zone 'America/Sao_Paulo'
$$;
-- O dia (São Paulo) do último check-in do cliente, de uma consultoria (nula = de qualquer uma), direto da tabela.
create function testes.ultimo(p_cliente text, p_consultoria text) returns date language sql stable as $$
  select max((k.inicio at time zone 'America/Sao_Paulo')::date) from public.checkins k
  where k.cliente_id = testes.id(p_cliente) and (p_consultoria is null or k.consultoria_id = testes.id(p_consultoria))
$$;
-- Os dias com check-in do cliente nos últimos 30 (hoje e os 29 antes), de uma consultoria, direto da tabela.
create function testes.dias_com_checkin(p_cliente text, p_consultoria text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.d order by x.d), '[]'::jsonb)
  from (select distinct (k.inicio at time zone 'America/Sao_Paulo')::date as d from public.checkins k
    where k.cliente_id = testes.id(p_cliente) and k.consultoria_id = testes.id(p_consultoria)
      and (k.inicio at time zone 'America/Sao_Paulo')::date >= testes.hoje() - 29) x
$$;
-- Os dias de um mês (até hoje no mês atual) com as horas e o acumulado, direto dos check-ins fechados do cliente numa
-- consultoria (e, se pedido, de um consultor).
create function testes.dias_diretos(p_cliente text, p_mes date, p_consultoria text, p_consultor text default null)
returns jsonb language sql stable as $$
  with s as (
    select (k.inicio at time zone 'America/Sao_Paulo')::date as dia, sum(extract(epoch from k.fim - k.inicio)) as seg
    from public.checkins k
    where k.cliente_id = testes.id(p_cliente) and k.fim is not null and k.consultoria_id = testes.id(p_consultoria)
      and (p_consultor is null or k.consultor_id = testes.id(p_consultor))
      and k.inicio >= p_mes::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (p_mes + interval '1 month') at time zone 'America/Sao_Paulo'
    group by 1
  ), d as (
    select g::date as dia, coalesce(s.seg, 0) as seg, sum(coalesce(s.seg, 0)) over (order by g) as acumulado
    from generate_series(p_mes::timestamp, least(testes.fim_do_mes(p_mes), testes.hoje())::timestamp, interval '1 day') g
    left join s on s.dia = g::date
  )
  select jsonb_agg(jsonb_build_object('dia', d.dia, 'horas', round(d.seg / 3600, 1),
    'acumulado', round(d.acumulado / 3600, 1)) order by d.dia)
  from d
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
select testes.perfil('travado_a', 'pessoa', 'A', true);
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');

-- c1: da pessoa_a há 60 dias, 30 h/mês. Check-ins da pessoa_a no mês anterior (dias 3 e 10, de manhã) e nos dias -1,
-- -5, -29, -30 e -45 (16 h; o -30 e o -45 ficam fora dos 30 dias); a pessoa_a2 atende o c1 por um tempo (1 h 30 no mês
-- anterior, 1 h no dia -7 e 1 h hoje, 6 h antes de agora); de volta à pessoa_a, mais 1 h hoje, 3 h antes de agora.
select testes.cliente('c1', 30, 'A', 'pessoa_a', 60);
select testes.checkin('pessoa_a', 'c1', testes.em(2, 7), 120);
select testes.checkin('pessoa_a', 'c1', testes.em(2, 14), 30);
select testes.checkin('pessoa_a', 'c1', testes.em(9, 7), 60);
select testes.checkin('pessoa_a', 'c1', testes.dia(d, 16), 60) from unnest(array[-1, -5, -29, -30, -45]) d;
select testes.mudar('c1', format('consultor_id = %L', testes.id('pessoa_a2')));
select testes.checkin('pessoa_a2', 'c1', testes.em(4, 7), 90);
select testes.checkin('pessoa_a2', 'c1', testes.dia(-7, 9), 60);
select testes.checkin('pessoa_a2', 'c1', now() - interval '6 hours', 60);
select testes.mudar('c1', format('consultor_id = %L', testes.id('pessoa_a')));
select testes.mudar('c1', $$consultor_desde = now() - interval '60 days'$$);
select testes.checkin('pessoa_a', 'c1', now() - interval '3 hours', 60);

-- Quadro do c1 na A: um atrasado com responsável, um no prazo sem responsável, um vencido na coluna de concluídos (não
-- conta como atrasado) e um arquivado (não conta).
insert into testes.fx values ('q1', gen_random_uuid()), ('q1_fazer', gen_random_uuid()), ('q1_feito', gen_random_uuid());
insert into public.quadros (id, cliente_id, consultoria_id) values (testes.id('q1'), testes.id('c1'), testes.id('A'));
insert into public.quadro_colunas (id, quadro_id, nome, concluidos, posicao) values
  (testes.id('q1_fazer'), testes.id('q1'), 'A fazer', false, 1024),
  (testes.id('q1_feito'), testes.id('q1'), 'Concluído', true, 2048);
insert into public.cartoes (coluna_id, titulo, prazo, posicao, arquivado_em) values
  (testes.id('q1_fazer'), 'Atrasado com responsável', testes.hoje() - 2, 1024, null),
  (testes.id('q1_fazer'), 'No prazo sem responsável', testes.hoje() + 3, 2048, null),
  (testes.id('q1_feito'), 'Concluído vencido', testes.hoje() - 5, 1024, null),
  (testes.id('q1_fazer'), 'Arquivado vencido', testes.hoje() - 1, 3072, now());
insert into public.cartao_responsaveis (cartao_id, perfil_id)
select k.id, testes.id('pessoa_a') from public.cartoes k where k.quadro_id = testes.id('q1') and k.titulo = 'Atrasado com responsável';

-- Check-list do c1 (aplicado há 30 dias): Diagnóstico (1 feita; 2 atrasada, depende da 1; 3 não se aplica, vencida) e
-- Plano (4 em andamento atrasada, depende da 2; 5 e 6 a fazer, a 6 vence hoje; 7 não se aplica e presa, depende da 4;
-- 8 atrasada, depende da 7: não está livre). Próxima: a 2.
insert into testes.fx values ('cl1', gen_random_uuid()), ('cl1_e1', gen_random_uuid()), ('cl1_e2', gen_random_uuid());
insert into testes.fx select 'cl1_t' || i, gen_random_uuid() from generate_series(1, 8) i;
insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_nome, inicio)
values (testes.id('cl1'), testes.id('c1'), testes.id('A'), 'Modelo do c1', testes.hoje() - 30);
insert into public.checklist_etapas (id, checklist_id, nome, posicao) values
  (testes.id('cl1_e1'), testes.id('cl1'), 'Diagnóstico', 1), (testes.id('cl1_e2'), testes.id('cl1'), 'Plano', 2);
insert into public.checklist_tarefas (id, checklist_id, etapa_id, titulo, prazo_dias, vence_em, posicao, estado, feita_em, motivo)
select testes.id('cl1_t' || v.t), testes.id('cl1'), testes.id('cl1_e' || v.e), 'Tarefa ' || v.t, 30 + v.d,
  testes.hoje() + v.d, v.t, v.estado, case when v.estado in ('feita', 'nao_se_aplica') then now() end,
  case when v.estado = 'nao_se_aplica' then 'Não se aplica neste cliente' end
from (values (1, 1, -20, 'feita'), (2, 1, -3, 'a_fazer'), (3, 1, -10, 'nao_se_aplica'), (4, 2, -1, 'andamento'),
  (5, 2, 5, 'a_fazer'), (6, 2, 0, 'a_fazer'), (7, 2, 1, 'nao_se_aplica'), (8, 2, -4, 'a_fazer')) v(t, e, d, estado);
insert into public.checklist_dependencias (checklist_id, tarefa_id, depende_de)
select testes.id('cl1'), testes.id('cl1_t' || v.t), testes.id('cl1_t' || v.d) from (values (2, 1), (4, 2), (7, 4), (8, 7)) v(t, d);

-- Reuniões do c1: uma passada (pessoa_a), uma amanhã de um colega sem convite, uma em 2 dias do colega com a pessoa_a
-- convidada (com Meet) e uma em 3 dias da pessoa_a. c2 (da pessoa_a): uma passada e uma em 5 dias dela; sem quadro e sem
-- check-list.
select testes.evento('ev_passado', 'pessoa_a', 'c1', now() - interval '2 days');
select testes.evento('ev_colega', 'pessoa_a2', 'c1', now() + interval '1 day');
select testes.evento('ev_convite', 'pessoa_a2', 'c1', now() + interval '2 days', true);
insert into public.agenda_participantes (evento_id, perfil_id) values (testes.id('ev_convite'), testes.id('pessoa_a'));
select testes.evento('ev_proprio', 'pessoa_a', 'c1', now() + interval '3 days');
select testes.cliente('c2', 20, 'A', 'pessoa_a', 60);
select testes.evento('ev_c2_passado', 'pessoa_a', 'c2', now() - interval '1 day');
select testes.evento('ev_c2', 'pessoa_a', 'c2', now() + interval '5 days');

-- Situação do último check-in: r_sem (consultor há 40 dias, nenhum check-in: em risco), r_13 e r_14 (último check-in
-- há 13 e há 14 dias; o r_13 com uma reunião só no passado), s1 (sem consultor) e arq (arquivado).
select testes.cliente('r_sem', 10, 'A', 'pessoa_a', 40);
select testes.cliente('r_13', 10, 'A', 'pessoa_a', 60);
select testes.checkin('pessoa_a', 'r_13', testes.dia(-13, 18), 30);
select testes.evento('ev_r13_passado', 'pessoa_a', 'r_13', now() - interval '3 days');
select testes.cliente('r_14', 10, 'A', 'pessoa_a', 60);
select testes.checkin('pessoa_a', 'r_14', testes.dia(-14, 18), 30);
select testes.cliente('s1', 10, 'A', null);
select testes.cliente('arq', 10, 'A', 'pessoa_a', 60);
select testes.mudar('arq', 'arquivado_em = now()');

-- m_ab: era da A (check-in da pessoa_a 90 min antes de agora, quadro e check-list "Modelo da A") e foi para a B
-- (pessoa_b): para a gestão da B, nada disso existe.
select testes.cliente('m_ab', 10, 'A', 'pessoa_a', 60);
select testes.checkin('pessoa_a', 'm_ab', now() - interval '90 minutes', 20);
insert into testes.fx values ('q_ab', gen_random_uuid()), ('q_ab_col', gen_random_uuid()), ('cl_ab', gen_random_uuid()),
  ('cl_ab_e', gen_random_uuid());
insert into public.quadros (id, cliente_id, consultoria_id) values (testes.id('q_ab'), testes.id('m_ab'), testes.id('A'));
insert into public.quadro_colunas (id, quadro_id, nome, posicao) values (testes.id('q_ab_col'), testes.id('q_ab'), 'A fazer', 1024);
insert into public.cartoes (coluna_id, titulo, prazo, posicao) values (testes.id('q_ab_col'), 'Cartão da A', testes.hoje() - 1, 1024);
insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_nome, inicio)
values (testes.id('cl_ab'), testes.id('m_ab'), testes.id('A'), 'Modelo da A', testes.hoje() - 10);
insert into public.checklist_etapas (id, checklist_id, nome, posicao) values (testes.id('cl_ab_e'), testes.id('cl_ab'), 'Etapa da A', 1);
insert into public.checklist_tarefas (checklist_id, etapa_id, titulo, prazo_dias, vence_em, posicao)
values (testes.id('cl_ab'), testes.id('cl_ab_e'), 'Tarefa da A', 5, testes.hoje() - 5, 1);
select testes.mudar('m_ab', format('consultoria_id = %L', testes.id('B')));
select testes.mudar('m_ab', format('consultor_id = %L', testes.id('pessoa_b')));
select set_config('request.jwt.claims', '', true);

-- ── O que cada um recebe ─────────────────────────────────────────────────────
select testes.guardar('c1_admin', 'admin_a', 'c1');
select testes.guardar('c1_pessoa', 'pessoa_a', 'c1');
select testes.guardar('c1_central', 'central', 'c1');
select testes.guardar('c2_admin', 'admin_a', 'c2');
select testes.guardar('c2_pessoa', 'pessoa_a', 'c2');
select testes.guardar('ab_admin_b', 'admin_b', 'm_ab');
select testes.guardar('ab_central', 'central', 'm_ab');

-- ── Quem vê ──────────────────────────────────────────────────────────────────
select is(testes.hoje_de('admin_b', 'c1'), null, 'hoje: a gestão da B não vê o cliente da A (nulo)');
select is(testes.hoje_de('pessoa_a2', 'c1'), null, 'hoje: o consultor de outro cliente não vê (nulo)');
select is(testes.chamar('admin_a', format('public.hoje_do_cliente(%L::uuid)', gen_random_uuid())), null,
  'hoje: cliente que não existe recebe nulo (nada diz se ele existe)');
select testes.como('travado_a', 'aal1');
select throws_ok(format('select public.hoje_do_cliente(%L)', testes.id('c2')), 'P0001', 'sem_permissao',
  'hoje: sessão não liberada recebe sem_permissao');
reset role;
set local role anon;
select throws_ok(format('select public.hoje_do_cliente(%L)', testes.id('c2')), '42501', null, 'anônimo não executa hoje_do_cliente');
reset role;
select ok(bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute')),
  'hoje_do_cliente, horas por dia, horas por mês com p_ate e a projeção (pura): authenticated executa, anon não')
from unnest(array['public.hoje_do_cliente(uuid)', 'public.horas_do_cliente_por_dia(uuid, date)',
  'public.horas_do_cliente_por_mes(uuid, integer, date)', 'private.projecao_do_mes(numeric, integer, integer)']) f;
select ok(not has_function_privilege('authenticated', 'private.ritmo_do_mes(numeric, numeric)', 'execute'),
  'private.ritmo_do_mes: nenhum logado executa (só a função do banco)');
select is((select array_agg(row(p.proname, p.pronargs, p.prosecdef, p.provolatile)::text order by p.proname, p.pronargs)
    from pg_proc p where p.oid in ('public.hoje_do_cliente(uuid)'::regprocedure,
      'public.horas_do_cliente_por_dia(uuid, date)'::regprocedure,
      'public.horas_do_cliente_por_mes(uuid, integer, date)'::regprocedure,
      'private.projecao_do_mes(numeric, integer, integer)'::regprocedure)),
  array['(hoje_do_cliente,1,t,s)', '(horas_do_cliente_por_dia,2,f,s)', '(horas_do_cliente_por_mes,3,f,s)',
    '(projecao_do_mes,3,f,i)'],
  'hoje_do_cliente é definer; as de gráfico, invoker e stable (o RLS de checkins decide); a projeção, immutable');

-- ── Previsão do mês ──────────────────────────────────────────────────────────
select is(array[(testes.j('c1_admin') -> 'previsao' ->> 'realizado')::numeric,
    (testes.j('c1_pessoa') -> 'previsao' ->> 'realizado')::numeric,
    (testes.j('c1_central') -> 'previsao' ->> 'realizado')::numeric],
  array[testes.realizado_no_mes('admin_a', 'c1'), testes.realizado_no_mes('pessoa_a', 'c1'),
    testes.realizado_no_mes('central', 'c1')],
  'previsão: realizado = realizado_no_mes do cliente para a gestão, o consultor e a central');
select ok((testes.j('c1_pessoa') -> 'previsao' ->> 'realizado')::numeric
    < (testes.j('c1_admin') -> 'previsao' ->> 'realizado')::numeric
  or now() - testes.mes_atual()::timestamp at time zone 'America/Sao_Paulo' < interval '7 hours',
  'previsão: o consultor soma só os check-ins dele (a gestão também vê o da pessoa_a2; no comecinho do mês não há)');
select is(array[(testes.j('ab_admin_b') -> 'previsao' ->> 'realizado')::numeric,
    (testes.j('ab_central') -> 'previsao' ->> 'realizado')::numeric],
  array[testes.realizado_no_mes('admin_b', 'm_ab'), testes.realizado_no_mes('central', 'm_ab')],
  'previsão: o cliente que veio da A, para a gestão da B (sem o check-in da A) e para a central (com ele)');
select is(private.projecao_do_mes(10, 6, 30), null, 'projeção: nula antes do dia 7');
select is(private.projecao_do_mes(10, 7, 30), 42.9, 'projeção: 10 h no dia 7 de um mês de 30 dias = 42,9 h');
select is(array[private.ritmo_do_mes(31.6, 30), private.ritmo_do_mes(31.5, 30), private.ritmo_do_mes(21.0, 30),
    private.ritmo_do_mes(20.9, 30), private.ritmo_do_mes(null, 30)],
  array['acima', 'no_ritmo', 'no_ritmo', 'abaixo', null],
  'ritmo: acima de 105% vai passar, 105% e 70% estão no ritmo, abaixo de 70% está abaixo; sem projeção, nulo');
select is((select row(p ->> 'horas_mes', p ->> 'dia', p ->> 'dias_no_mes', coalesce(p ->> 'projecao', 'nula'),
      coalesce(p ->> 'ritmo', 'nulo'))::text from (select testes.j('c1_admin') -> 'previsao' as p) x),
  (select row('30.0', extract(day from testes.hoje())::int, extract(day from testes.fim_do_mes(testes.hoje()))::int,
      coalesce(x.projecao::text, 'nula'), coalesce(private.ritmo_do_mes(x.projecao, 30), 'nulo'))::text
   from (select private.projecao_do_mes((testes.j('c1_admin') -> 'previsao' ->> 'realizado')::numeric,
     extract(day from testes.hoje())::int, extract(day from testes.fim_do_mes(testes.hoje()))::int) as projecao) x),
  'previsão: horas do mês, dia de hoje, dias do mês, projeção (projecao_do_mes) e ritmo dela');

-- ── Último check-in ──────────────────────────────────────────────────────────
select is((select row(c ->> 'ultimo', c ->> 'dias_sem')::text from (select testes.j('c1_admin') -> 'checkin' as c) x),
  row(testes.ultimo('c1', 'A')::text, (testes.hoje() - testes.ultimo('c1', 'A'))::text)::text,
  'último check-in: o dia do último na consultoria e há quantos dias');
select is(testes.j('c1_admin') -> 'checkin' -> 'dias_com_checkin', testes.dias_com_checkin('c1', 'A'),
  'dias com check-in: os dias dos últimos 30 (hoje e os 29 antes), sem repetir, em ordem');
select ok(testes.j('c1_admin') -> 'checkin' -> 'dias_com_checkin' @> to_jsonb(array[testes.hoje() - 29])
    and not testes.j('c1_admin') -> 'checkin' -> 'dias_com_checkin' @> to_jsonb(array[testes.hoje() - 30]),
  'dias com check-in: o de 29 dias atrás entra; o de 30 dias, não');
select ok(testes.j('c1_pessoa') -> 'checkin' = testes.j('c1_admin') -> 'checkin'
    and testes.j('c1_pessoa') -> 'checkin' -> 'dias_com_checkin' @> to_jsonb(array[testes.hoje() - 7]),
  'último check-in do consultor: o da consultoria, de qualquer consultor (o dia da pessoa_a2 aparece, só a data)');
select is((select row(coalesce(c ->> 'ultimo', 'nulo'), coalesce(c ->> 'dias_sem', 'nulo'), c -> 'dias_com_checkin')::text
    from (select testes.j('ab_admin_b') -> 'checkin' as c) x), '(nulo,nulo,[])',
  'último check-in: um check-in da A não aparece para a gestão da B depois que o cliente mudou');
select is(testes.j('ab_central') -> 'checkin' ->> 'ultimo', testes.ultimo('m_ab', null)::text,
  'último check-in da central: o de qualquer consultoria (o da A, no cliente que foi para a B)');
select ok(testes.hoje_de('admin_a', 'r_sem') -> 'checkin' ->> 'situacao' = 'em_risco'
    and (select x.sem_checkin from private.risco_dos_clientes(null, null, testes.id('r_sem')) x),
  'situação: em risco quando risco_dos_clientes diz sem_checkin');
select is(array[testes.j('c1_admin') -> 'checkin' ->> 'situacao', testes.hoje_de('admin_a', 'r_13') -> 'checkin' ->> 'situacao',
    testes.hoje_de('admin_a', 'r_14') -> 'checkin' ->> 'situacao'],
  array['em_dia', 'em_dia', 'atencao'], 'situação: em dia abaixo de 14 dias (c1, 13 dias) e atenção a partir de 14');
select ok((select c ? 'situacao' and c -> 'situacao' = 'null'::jsonb and c -> 'ultimo' = 'null'::jsonb
    from (select testes.hoje_de('admin_a', 's1') -> 'checkin' as c) x),
  'situação: nula sem consultor (o cliente sem consultor também não tem check-in)');

-- ── Próxima reunião ──────────────────────────────────────────────────────────
select is(testes.j('c1_pessoa') -> 'reuniao',
  (select jsonb_build_object('id', e.id, 'inicio', e.inicio, 'titulo', e.titulo, 'com_meet', e.com_meet)
   from public.agenda_eventos e where e.id = testes.id('ev_convite')),
  'reunião do consultor: a que ele é convidado aparece (a do colega sem convite, antes dela, não)');
select is(testes.j('c1_admin') -> 'reuniao' ->> 'id', testes.id('ev_colega')::text,
  'reunião da gestão: a primeira futura da consultoria (a do colega)');
select is(testes.j('c2_pessoa') -> 'reuniao' ->> 'id', testes.id('ev_c2')::text,
  'reunião do consultor: a dele aparece (a passada não)');
select is(array[testes.j('c1_pessoa') -> 'reuniao' ->> 'id', testes.j('c1_admin') -> 'reuniao' ->> 'id',
    testes.j('c1_central') -> 'reuniao' ->> 'id', testes.j('c2_admin') -> 'reuniao' ->> 'id'],
  array[testes.chamar('pessoa_a', format('public.eventos_do_cliente(%L::uuid)', testes.id('c1'))) ->> 'proximo',
    testes.chamar('admin_a', format('public.eventos_do_cliente(%L::uuid)', testes.id('c1'))) ->> 'proximo',
    testes.chamar('central', format('public.eventos_do_cliente(%L::uuid)', testes.id('c1'))) ->> 'proximo',
    testes.chamar('admin_a', format('public.eventos_do_cliente(%L::uuid)', testes.id('c2'))) ->> 'proximo'],
  'reunião: a mesma "próxima" de eventos_do_cliente para cada papel');
select is(testes.hoje_de('admin_a', 'r_13') -> 'reuniao', 'null'::jsonb, 'reunião: só uma passada = nenhuma');

-- ── Quadro ───────────────────────────────────────────────────────────────────
select is(testes.j('c1_admin') -> 'quadro',
  jsonb_build_object('id', testes.id('q1')) || (testes.chamar('admin_a', format('public.indicadores_do_quadro(%L::uuid)',
    testes.id('q1'))) - 'vencem_em_7_dias'),
  'quadro: o id e as contas de indicadores_do_quadro sem filtros');
select is((select row(q ->> 'cartoes', q ->> 'atrasados', q ->> 'sem_responsavel')::text
    from (select testes.j('c1_admin') -> 'quadro' as q) x), '(3,1,2)',
  'quadro: 3 cartões (o arquivado não), 1 atrasado (o da coluna de concluídos não), 2 sem responsável');
select is(testes.j('c1_pessoa') -> 'quadro', testes.j('c1_admin') -> 'quadro', 'quadro: o consultor do cliente vê o mesmo');
create temp table quadros_antes as select count(*) as n from public.quadros;
select ok(testes.hoje_de('admin_a', 'c2') -> 'quadro' = 'null'::jsonb
    and (select count(*) from public.quadros) = (select n from quadros_antes),
  'quadro: sem quadro, nulo, e nenhum quadro é criado (nem para a gestão, que mexe)');
select is(testes.j('ab_admin_b') -> 'quadro', 'null'::jsonb,
  'quadro: o da A não aparece para a gestão da B depois que o cliente mudou');

-- ── Check-list ───────────────────────────────────────────────────────────────
create temp table lista_c1 as select testes.chamar('admin_a', format('public.checklist_do_cliente(%L::uuid)', testes.id('c1'))) as j;
select is((select row(c ->> 'tarefas', c ->> 'feitas', c ->> 'atrasadas', c -> 'proxima')::text
    from (select testes.j('c1_admin') -> 'checklist' as c) x),
  (select row(l.j -> 'resumo' ->> 'tarefas', l.j -> 'resumo' ->> 'feitas', l.j -> 'resumo' ->> 'atrasadas',
      (l.j -> 'resumo' -> 'proxima') - 'id')::text from lista_c1 l),
  'check-list: tarefas, feitas, atrasadas e próxima = as de checklist_do_cliente');
select is((select row(c ->> 'modelo_nome', c ->> 'tarefas', c ->> 'feitas', c ->> 'nao_se_aplica', c ->> 'atrasadas',
      c -> 'proxima' ->> 'titulo', c -> 'proxima' ->> 'vence_em')::text
    from (select testes.j('c1_admin') -> 'checklist' as c) x),
  row('Modelo do c1', 8, 1, 2, 3, 'Tarefa 2', testes.hoje() - 3)::text,
  'check-list: 8 tarefas, 1 feita, 2 não se aplicam, 3 atrasadas; a próxima é a 2 (a 8 vence antes, mas a 7 está presa)');
select is((select jsonb_agg(e - 'id' order by o) from jsonb_array_elements(testes.j('c1_admin') -> 'checklist' -> 'etapas')
    with ordinality t(e, o)),
  '[{"nome": "Diagnóstico", "tarefas": 3, "feitas": 1, "nao_se_aplica": 1, "atrasadas": 1, "andamento": 0, "pausadas": 0},
    {"nome": "Plano", "tarefas": 5, "feitas": 0, "nao_se_aplica": 1, "atrasadas": 2, "andamento": 0, "pausadas": 0}]'::jsonb,
  'check-list: atrasadas por etapa (não feitas e vencidas antes de hoje; a de hoje não); a 4, em andamento e vencida, '
  'conta só em atrasadas');
select is(testes.j('c1_admin') -> 'checklist' -> 'mais_tempo', '[]'::jsonb, 'check-list: sem tempo marcado, mais_tempo vazio');
select is((select array_agg(row(e ->> 'id', e ->> 'tarefas', e ->> 'feitas')::text order by o)
    from jsonb_array_elements(testes.j('c1_admin') -> 'checklist' -> 'etapas') with ordinality t(e, o)),
  (select array_agg(row(e ->> 'id', e ->> 'tarefas', e ->> 'feitas')::text order by o)
    from lista_c1 l, jsonb_array_elements(l.j -> 'etapas') with ordinality t(e, o)),
  'check-list: etapas (id, tarefas, feitas) = as de checklist_do_cliente');
select is(testes.j('c2_admin') -> 'checklist', 'null'::jsonb, 'check-list: sem modelo, nulo');
select ok(testes.j('ab_admin_b') -> 'checklist' = 'null'::jsonb
    and testes.j('ab_admin_b')::text not like '%' || testes.id('q_ab')::text || '%'
    and testes.j('ab_admin_b')::text not like '%Modelo da A%'
    and testes.j('ab_admin_b')::text not like '%' || testes.id('cl_ab_e')::text || '%',
  'check-list: o da A não aparece para a gestão da B (nem o quadro nem o modelo da A no JSON)');
select ok(testes.j('c1_pessoa') -> 'checklist' = testes.j('c1_admin') -> 'checklist', 'check-list: o consultor vê o mesmo');

-- ── Arquivado ────────────────────────────────────────────────────────────────
select ok((select (h ->> 'arquivado_em') is not null and h -> 'checkin' -> 'situacao' = 'null'::jsonb
    from (select testes.hoje_de('admin_a', 'arq') as h) x)
    and testes.j('c1_admin') -> 'arquivado_em' = 'null'::jsonb,
  'arquivado: arquivado_em preenchido e checkin.situacao nula (o ativo, sem arquivado_em)');

-- ── Horas por dia ────────────────────────────────────────────────────────────
create temp table dia_m as select testes.por_dia('admin_a', 'c1', testes.mes_anterior()) as j;
select is((select row(j ->> 'mes', jsonb_array_length(j -> 'dias'), j -> 'dias' -> 0 ->> 'dia', j -> 'dias' -> -1 ->> 'dia',
      j ->> 'dias_no_mes', coalesce(j ->> 'projecao', 'nula'), j ->> 'previsao')::text from dia_m),
  row(testes.mes_anterior(), extract(day from testes.fim_do_mes(testes.mes_anterior()))::int, testes.mes_anterior(),
    testes.fim_do_mes(testes.mes_anterior()), extract(day from testes.fim_do_mes(testes.mes_anterior()))::int, 'nula',
    '30.0')::text,
  'por dia, mês passado: todos os dias do mês, sem projeção, com a previsão do cliente');
select is((select j -> 'dias' from dia_m), testes.dias_diretos('c1', testes.mes_anterior(), 'A'),
  'por dia: horas de cada dia e o acumulado = soma direta dos check-ins');
select ok((select (j ->> 'realizado')::numeric = (j -> 'dias' -> -1 ->> 'acumulado')::numeric
    and (j ->> 'realizado')::numeric >= 5.0 from dia_m),
  'por dia: realizado = o acumulado do último dia (pelo menos as 5 h dos dias 3, 5 e 10 do mês anterior)');
select is((testes.por_dia('pessoa_a', 'c1', testes.mes_anterior()) -> 'dias'),
  testes.dias_diretos('c1', testes.mes_anterior(), 'A', 'pessoa_a'),
  'por dia do consultor: só os check-ins dele (RLS)');
create temp table dia_atual as select testes.por_dia('admin_a', 'c1', testes.mes_atual()) as j;
select is((select row(jsonb_array_length(j -> 'dias'), j -> 'dias' -> -1 ->> 'dia', coalesce(j ->> 'projecao', 'nula'))::text
    from dia_atual),
  (select row(extract(day from testes.hoje())::int, testes.hoje(),
      coalesce(private.projecao_do_mes((j ->> 'realizado')::numeric, extract(day from testes.hoje())::int,
        extract(day from testes.fim_do_mes(testes.hoje()))::int)::text, 'nula'))::text from dia_atual),
  'por dia, mês atual: os dias até hoje e a projeção por projecao_do_mes');
select is((select j -> 'dias' from dia_atual), testes.dias_diretos('c1', testes.mes_atual(), 'A'),
  'por dia, mês atual: horas e acumulado = soma direta');
select is((select (j ->> 'realizado')::numeric from dia_atual), (testes.j('c1_admin') -> 'previsao' ->> 'realizado')::numeric,
  'por dia, mês atual: o realizado é o mesmo da faixa Hoje (a gestão vê os mesmos check-ins)');
select is((select row(j ->> 'realizado', coalesce(j ->> 'previsao', 'nula'))::text
    from (select testes.por_dia('admin_b', 'c1', testes.mes_anterior()) as j) x), '(0,nula)',
  'por dia: a gestão da B não soma nada do cliente da A nem vê a previsão');
select is(testes.por_dia('admin_a', 'c1', '2037-11-01') - 'previsao',
  '{"mes": "2037-11-01", "dias": [], "realizado": 0, "projecao": null, "dias_no_mes": 30}'::jsonb,
  'por dia, mês futuro: nenhum dia e sem projeção');

-- ── Horas por mês ────────────────────────────────────────────────────────────
select is((select array_agg((e ->> 'mes')::date order by o)
    from jsonb_array_elements(testes.por_mes('admin_a', 'c1', format(', 6, %L::date', testes.mes_anterior() + 14)))
    with ordinality t(e, o)),
  (select array_agg((testes.mes_anterior() - make_interval(months => g))::date order by g desc) from generate_series(0, 5) g),
  'por mês: p_ate escolhe o último mês (o de qualquer dia dele) e vêm os 6 até ele');
select is(array[(select max((e ->> 'mes')::date) from jsonb_array_elements(testes.por_mes('admin_a', 'c1', ', 6, null::date')) e),
    (select max((e ->> 'mes')::date) from jsonb_array_elements(testes.por_mes('admin_a', 'c1', ', 6, ''2037-11-01''::date')) e)],
  array[testes.mes_atual(), testes.mes_atual()], 'por mês: p_ate nulo ou no futuro = o mês atual');
select ok(testes.por_mes('admin_a', 'c1', ', 6') = testes.por_mes('admin_a', 'c1', ', 6, null::date')
    and testes.por_mes('admin_a', 'c1', '') = testes.por_mes('admin_a', 'c1', ', 6, null::date'),
  'por mês: a chamada com 2 argumentos (e com 1) continua valendo, igual a p_ate nulo');
select is((select (e ->> 'realizado')::numeric from jsonb_array_elements(testes.por_mes('admin_a', 'c1',
    format(', 6, %L::date', testes.mes_anterior()))) e where (e ->> 'mes')::date = testes.mes_anterior()),
  (select (j ->> 'realizado')::numeric from dia_m),
  'por mês: o mês passado tem o mesmo realizado de horas por dia');
select is((select (e ->> 'realizado')::numeric from jsonb_array_elements(testes.por_mes('pessoa_a', 'c1',
    format(', 24, %L::date', testes.mes_anterior()))) e where (e ->> 'mes')::date = testes.mes_anterior()),
  (select round(sum((d ->> 'horas')::numeric), 1) from jsonb_array_elements(testes.dias_diretos('c1', testes.mes_anterior(), 'A', 'pessoa_a')) d),
  'por mês do consultor: só as horas dele (RLS)');

-- ── Tempos ───────────────────────────────────────────────────────────────────
-- Cliente grande da pessoa_v (A, 40 h/mês): 5.000 check-ins fechados de 1 h (um a cada 3 h 30, de ontem para trás: ~2
-- anos), um quadro com 1.000 cartões (um em cada 20 arquivado, dois terços com prazo, um terço com responsável), um
-- check-list de 500 tarefas (5 etapas; cada uma depende da anterior; 150 feitas, uma em cada 25 das outras não se
-- aplica) e 1.000 eventos (metade passados; um em cada 4 de um colega, com a pessoa_v convidada em metade desses).
select testes.perfil('pessoa_v', 'pessoa', 'A');
select testes.cliente('grande', 40, 'A', 'pessoa_v', 800);
select set_config('request.jwt.claims', json_build_object('sub', testes.id('pessoa_v'), 'role', 'authenticated')::text, true);
insert into public.checkins (cliente_id, inicio, fim, descricao)
select testes.id('grande'), now() - interval '1 day' - k * interval '210 minutes',
  now() - interval '1 day' - k * interval '210 minutes' + interval '1 hour', 'Volume do cliente'
from generate_series(4999, 0, -1) k;
select set_config('request.jwt.claims', '', true);

-- Fundo: 45.000 check-ins de 15 clientes da B nos mesmos 2 anos (3.000 por consultor, um a cada 5 h 50). Sem ele, o
-- cliente grande seria quase a tabela inteira, e ler tudo seria mesmo o mais barato: a conferência de Seq Scan não
-- diria nada. Gravados como em painel_volume: pelo sistema, em lote e em ordem de início, com checkins_validar e
-- checkins_resumir_horas desligados só nesta transação (as três funções medidas leem checkins direto, sem resumo).
select testes.perfil('fundo_' || i, 'pessoa', 'B') from generate_series(1, 15) i;
select testes.cliente('fundo_c' || i, 40, 'B', 'fundo_' || i) from generate_series(1, 15) i;
alter table public.checkins disable trigger checkins_validar;
alter table public.checkins disable trigger checkins_resumir_horas;
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select c.id, p.id, testes.id('B'), now() - k * interval '350 minutes', now() - k * interval '350 minutes' + interval '1 hour',
  'Fundo'
from generate_series(3000, 1, -1) k
cross join generate_series(1, 15) i
join testes.fx p on p.nome = 'fundo_' || i
join testes.fx c on c.nome = 'fundo_c' || i
order by 4;
alter table public.checkins enable trigger checkins_validar;
alter table public.checkins enable trigger checkins_resumir_horas;

insert into testes.fx values ('q_v', gen_random_uuid());
insert into public.quadros (id, cliente_id, consultoria_id) values (testes.id('q_v'), testes.id('grande'), testes.id('A'));
create temp table v_col (i int primary key, id uuid not null default gen_random_uuid());
insert into v_col (i) select generate_series(0, 2);
insert into public.quadro_colunas (id, quadro_id, nome, concluidos, posicao)
select c.id, testes.id('q_v'), (array['A fazer', 'Em andamento', 'Concluído'])[c.i + 1], c.i = 2, (c.i + 1) * 1024 from v_col c;
create temp table v_cartoes (k int primary key, id uuid not null default gen_random_uuid());
insert into v_cartoes (k) select generate_series(1, 1000);
insert into public.cartoes (id, coluna_id, titulo, prazo, posicao, arquivado_em)
select v.id, c.id, 'Cartão volume ' || v.k, case when v.k % 3 <> 0 then testes.hoje() + (v.k % 61 - 30) end, v.k * 1024,
  case when v.k % 20 = 0 then now() end
from v_cartoes v join v_col c on c.i = v.k % 3;
insert into public.cartao_responsaveis (cartao_id, perfil_id) select v.id, testes.id('pessoa_v') from v_cartoes v where v.k % 3 = 1;

insert into testes.fx values ('cl_v', gen_random_uuid());
insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_nome, inicio)
values (testes.id('cl_v'), testes.id('grande'), testes.id('A'), 'Modelo volume', testes.hoje() - 200);
create temp table v_etapas (e int primary key, id uuid not null default gen_random_uuid());
insert into v_etapas (e) select generate_series(1, 5);
insert into public.checklist_etapas (id, checklist_id, nome, posicao) select e.id, testes.id('cl_v'), 'Etapa ' || e.e, e.e from v_etapas e;
create temp table v_tarefas (t int primary key, id uuid not null default gen_random_uuid());
insert into v_tarefas (t) select generate_series(1, 500);
insert into public.checklist_tarefas (id, checklist_id, etapa_id, titulo, prazo_dias, vence_em, posicao, estado, feita_em, motivo)
select t.id, testes.id('cl_v'), e.id, 'Tarefa volume ' || t.t, least(t.t, 365), testes.hoje() - 200 + least(t.t, 365), t.t,
  case when t.t <= 150 then 'feita' when t.t % 25 = 0 then 'nao_se_aplica' else 'a_fazer' end,
  case when t.t <= 150 or t.t % 25 = 0 then now() end,
  case when t.t > 150 and t.t % 25 = 0 then 'Não se aplica no volume' end
from v_tarefas t join v_etapas e on e.e = (t.t - 1) / 100 + 1;
insert into public.checklist_dependencias (checklist_id, tarefa_id, depende_de)
select testes.id('cl_v'), t.id, a.id from v_tarefas t join v_tarefas a on a.t = t.t - 1;

create temp table v_eventos (k int primary key, id uuid not null default gen_random_uuid());
insert into v_eventos (k) select generate_series(1, 1000);
insert into public.agenda_eventos (id, consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, criado_por)
select v.id, testes.id('A'), case when v.k % 4 = 0 then testes.id('pessoa_a2') else testes.id('pessoa_v') end,
  testes.id('grande'), 'Evento volume ' || v.k, now() + (v.k - 500) * interval '7 hours' + interval '30 minutes',
  now() + (v.k - 500) * interval '7 hours' + interval '90 minutes', testes.id('pessoa_v')
from v_eventos v;
insert into public.agenda_participantes (evento_id, perfil_id) select v.id, testes.id('pessoa_v') from v_eventos v where v.k % 8 = 0;

-- Estatísticas de agora (dentro desta transação, desfeitas no fim), como nos outros testes de volume.
analyze public.clientes, public.checkins, public.quadros, public.quadro_colunas, public.cartoes,
  public.cartao_responsaveis, public.cliente_checklists, public.checklist_etapas, public.checklist_tarefas,
  public.checklist_dependencias, public.agenda_eventos, public.agenda_participantes;

select ok((select count(*) from public.checkins where cliente_id = testes.id('grande')) = 5000
    and (select count(*) from public.cartoes where quadro_id = testes.id('q_v')) = 1000
    and (select count(*) from public.checklist_tarefas where checklist_id = testes.id('cl_v')) = 500
    and (select count(*) from public.agenda_eventos where cliente_id = testes.id('grande')) = 1000,
  'volume: o cliente grande tem 5.000 check-ins, 1.000 cartões, 500 tarefas e 1.000 eventos');
select ok((select (h -> 'quadro' ->> 'cartoes')::int = 950 and (h -> 'checklist' ->> 'tarefas')::int = 500
    and h -> 'reuniao' <> 'null'::jsonb and jsonb_array_length(h -> 'checkin' -> 'dias_com_checkin') >= 29
    from (select testes.hoje_de('pessoa_v', 'grande') as h) x),
  'volume: a faixa Hoje do cliente grande vem inteira (950 cartões ativos, 500 tarefas, reunião, dias com check-in)');

-- Média de 5 execuções (o pgTAP descarta a mais rápida); janela "média +- folga" centrada em 0,75 x limite com folga de
-- 0,75 x limite: o limite como média, com 50% de tolerância (como painel_volume).
select testes.como('admin_a');
select diag('hoje_do_cliente, gestão: ' || testes.media_ms_de(format('select public.hoje_do_cliente(%L)', testes.id('grande')))
  || ' ms; horas por dia (mês atual): ' || testes.media_ms_de(format('select public.horas_do_cliente_por_dia(%L)', testes.id('grande')))
  || ' ms; horas por mês (24): ' || testes.media_ms_de(format('select * from public.horas_do_cliente_por_mes(%L, 24, null)', testes.id('grande')))
  || ' ms; por consultor (mês): ' || testes.media_ms_de(format('select * from public.horas_do_cliente_por_consultor(%L)', testes.id('grande')))
  || ' ms; por semana (mês): ' || testes.media_ms_de(format('select * from public.checkins_do_cliente_por_semana(%L)', testes.id('grande')))
  || ' ms');
select performs_within(format('select public.hoje_do_cliente(%L)', testes.id('grande')), 37.5, 37.5, 5,
  'gestão: hoje_do_cliente do cliente grande em até 50 ms na média (+50%)');
select performs_within(format('select public.horas_do_cliente_por_dia(%L)', testes.id('grande')), 22.5, 22.5, 5,
  'gestão: horas_do_cliente_por_dia do cliente grande em até 30 ms na média (+50%)');
select performs_within(format('select * from public.horas_do_cliente_por_mes(%L, 24, null)', testes.id('grande')), 37.5, 37.5, 5,
  'gestão: horas_do_cliente_por_mes(24) do cliente grande em até 50 ms na média (+50%)');
select performs_within(format('select * from public.horas_do_cliente_por_consultor(%L)', testes.id('grande')), 22.5, 22.5, 5,
  'gestão: horas_do_cliente_por_consultor (mês atual) do cliente grande em até 30 ms na média (+50%)');
select performs_within(format('select * from public.checkins_do_cliente_por_semana(%L)', testes.id('grande')), 22.5, 22.5, 5,
  'gestão: checkins_do_cliente_por_semana (mês atual) do cliente grande em até 30 ms na média (+50%)');
select is(testes.varreduras(format('select public.hoje_do_cliente(%L)', testes.id('grande')))
    + testes.varreduras(format('select public.horas_do_cliente_por_dia(%L)', testes.id('grande')))
    + testes.varreduras(format('select * from public.horas_do_cliente_por_mes(%L, 24, null)', testes.id('grande')))
    + testes.varreduras(format('select * from public.horas_do_cliente_por_consultor(%L)', testes.id('grande')))
    + testes.varreduras(format('select * from public.checkins_do_cliente_por_semana(%L)', testes.id('grande'))),
  0::bigint, 'gestão: nenhuma das cinco varre a tabela de check-ins (sem Seq Scan)');
reset role;
select testes.como('pessoa_v');
select diag('hoje_do_cliente, consultor: ' || testes.media_ms_de(format('select public.hoje_do_cliente(%L)', testes.id('grande')))
  || ' ms; horas por dia (mês atual): ' || testes.media_ms_de(format('select public.horas_do_cliente_por_dia(%L)', testes.id('grande')))
  || ' ms; horas por mês (24): ' || testes.media_ms_de(format('select * from public.horas_do_cliente_por_mes(%L, 24, null)', testes.id('grande')))
  || ' ms');
select performs_within(format('select public.hoje_do_cliente(%L)', testes.id('grande')), 37.5, 37.5, 5,
  'consultor: hoje_do_cliente do cliente grande em até 50 ms na média (+50%)');
select performs_within(format('select public.horas_do_cliente_por_dia(%L)', testes.id('grande')), 22.5, 22.5, 5,
  'consultor: horas_do_cliente_por_dia do cliente grande em até 30 ms na média (+50%)');
select performs_within(format('select * from public.horas_do_cliente_por_mes(%L, 24, null)', testes.id('grande')), 37.5, 37.5, 5,
  'consultor: horas_do_cliente_por_mes(24) do cliente grande em até 50 ms na média (+50%)');
select performs_within(format('select * from public.horas_do_cliente_por_consultor(%L)', testes.id('grande')), 22.5, 22.5, 5,
  'consultor: horas_do_cliente_por_consultor (mês atual) do cliente grande em até 30 ms na média (+50%)');
select performs_within(format('select * from public.checkins_do_cliente_por_semana(%L)', testes.id('grande')), 22.5, 22.5, 5,
  'consultor: checkins_do_cliente_por_semana (mês atual) do cliente grande em até 30 ms na média (+50%)');
select is(testes.varreduras(format('select * from public.horas_do_cliente_por_consultor(%L)', testes.id('grande')))
    + testes.varreduras(format('select * from public.checkins_do_cliente_por_semana(%L)', testes.id('grande'))),
  0::bigint, 'consultor: horas por consultor e por semana do mês sem varrer a tabela de check-ins');
reset role;
select testes.como('central');
select diag('hoje_do_cliente, central: ' || testes.media_ms_de(format('select public.hoje_do_cliente(%L)', testes.id('grande'))) || ' ms');
select performs_within(format('select public.hoje_do_cliente(%L)', testes.id('grande')), 37.5, 37.5, 5,
  'central: hoje_do_cliente do cliente grande em até 50 ms na média (+50%)');
reset role;

select * from finish();
rollback;
