-- Gráficos do cliente: horas por mês, por consultor e check-ins por semana (mês em São Paulo, só check-ins
-- fechados, cada um soma só o que o RLS deixa ver). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.usuario(p_nome text, p_confirmado boolean) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', case when p_confirmado then now() end,
    '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome, true);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
  return v;
end $$;

create function testes.time(p_nome text, p_consultoria text, p_gestor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.times (consultoria_id, nome, gestor_id)
  values (testes.id(p_consultoria), p_nome, testes.id(p_gestor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Cliente gravado direto (sem usuário logado), já na consultoria e com o consultor, se vierem.
-- testes.como deixa o usuário nas configurações até o fim da transação (reset role não limpa): limpa aqui.
create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;


-- Primeiro dia do mês, n meses a partir do atual, na meia-noite de São Paulo.
create function testes.mes(n int) returns timestamptz language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') + n * interval '1 month') at time zone 'America/Sao_Paulo'
$$;

select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_sem', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('pessoa_a3', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.cliente('c1', 'A', 'pessoa_a2');

-- Março de 2026 (domingo, dia 1; segundas: 23/02, 02/03, 09/03, 16/03, 23/03, 30/03), consultora a2:
-- 28/02 22h SP (já é março em UTC) não conta em março; 01/03 00h30 SP conta, na semana de 23/02;
-- 31/03 23h SP (já é abril em UTC) conta em março, na semana de 30/03.
select testes.como('pessoa_a2');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('c1'), '2026-02-28 22:00-03', '2026-02-28 23:00-03', 'Fevereiro'),
  (testes.id('c1'), '2026-03-01 00:30-03', '2026-03-01 01:30-03', 'Domingo'),
  (testes.id('c1'), '2026-03-03 10:00-03', '2026-03-03 12:00-03', 'Terça'),
  (testes.id('c1'), '2026-03-04 10:00-03', '2026-03-04 11:30-03', 'Quarta'),
  (testes.id('c1'), '2026-03-31 23:00-03', '2026-03-31 23:30-03', 'Virada');
reset role;
-- O cliente passa para a3 (gravado direto), que também trabalha em março e nos meses recentes.
select set_config('request.jwt.claims', '', true);
update public.clientes set consultor_id = testes.id('pessoa_a3') where id = testes.id('c1');
select testes.como('pessoa_a3');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('c1'), '2026-03-04 15:00-03', '2026-03-04 16:00-03', 'Quarta à tarde'),
  (testes.id('c1'), testes.mes(-1) + interval '4 days 10 hours', testes.mes(-1) + interval '4 days 12 hours', 'Mês passado'),
  (testes.id('c1'), testes.mes(-3) + interval '4 days 10 hours', testes.mes(-3) + interval '4 days 11 hours', 'Três meses atrás');
reset role;

-- ── Horas por mês ────────────────────────────────────────────────────────────

select testes.como('admin_a');
select is((select count(*) from public.horas_do_cliente_por_mes(testes.id('c1'))), 6::bigint,
  'por padrão, os últimos 6 meses');
select is((select min(mes) from public.horas_do_cliente_por_mes(testes.id('c1'))), testes.mes(-5)::date,
  'começa 5 meses atrás (o mais antigo primeiro)');
select is((select max(mes) from public.horas_do_cliente_por_mes(testes.id('c1'))),
  (testes.mes(0) at time zone 'America/Sao_Paulo')::date, 'e termina no mês atual');
select is((select array_agg(realizado order by mes) from public.horas_do_cliente_por_mes(testes.id('c1'))),
  array[0, 0, 1, 0, 2, 0]::numeric[], 'horas por mês, com 0 nos meses sem check-in');
select is((select count(*) from public.horas_do_cliente_por_mes(testes.id('c1'), 0)), 1::bigint, 'p_meses 0 vira 1');
select is((select count(*) from public.horas_do_cliente_por_mes(testes.id('c1'), 99)), 24::bigint, 'p_meses 99 vira 24');

-- ── Horas por consultor ──────────────────────────────────────────────────────

select is((select array_agg(nome || ':' || horas order by ordem) from
    (select *, row_number() over () as ordem from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-01')) r),
  array['Pessoa pessoa_a2:5.0', 'Pessoa pessoa_a3:1.0'], 'março: por consultor, mais horas primeiro, sem os check-ins de fevereiro');
select is((select count(*) from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-17')), 2::bigint,
  'um dia qualquer do mês vale o mês inteiro');
select is((select count(*) from public.horas_do_cliente_por_consultor(testes.id('c1'))), 0::bigint,
  'sem mês, usa o atual (sem check-ins aqui)');

-- ── Check-ins por semana ─────────────────────────────────────────────────────

select is((select array_agg(semana || ':' || quantidade || ':' || horas order by semana)
    from public.checkins_do_cliente_por_semana(testes.id('c1'), '2026-03-01')),
  array['2026-02-23:1:1.0', '2026-03-02:3:4.5', '2026-03-09:0:0', '2026-03-16:0:0', '2026-03-23:0:0', '2026-03-30:1:0.5'],
  'março: semanas que tocam o mês (segunda a segunda), com 0 nas vazias');
reset role;

-- ── Quem enxerga o quê ───────────────────────────────────────────────────────

select testes.como('central');
select is((select sum(horas) from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-01')), 6.0,
  'a central soma tudo');
reset role;

select testes.como('gestor_sem');
select is((select sum(horas) from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-01')), 6.0,
  'o gestor da consultoria soma os check-ins da consultoria');
reset role;

select testes.como('pessoa_a');
select is((select count(*) from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-01')), 0::bigint,
  'pessoa da consultoria que não fez check-in não soma nada');
select is((select sum(realizado) from public.horas_do_cliente_por_mes(testes.id('c1'))), 0::numeric,
  'nem por mês');
reset role;

select testes.como('admin_b');
select is((select count(*) from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-01')), 0::bigint,
  'outra consultoria não soma as horas (por consultor)');
select is((select sum(realizado) from public.horas_do_cliente_por_mes(testes.id('c1'))), 0::numeric,
  'outra consultoria não soma as horas (por mês)');
select is((select sum(quantidade) from public.checkins_do_cliente_por_semana(testes.id('c1'), '2026-03-01')), 0::bigint,
  'outra consultoria não conta check-ins (por semana)');
reset role;

-- Consultora que saiu da consultoria: o admin da A ainda soma as horas dela, mas não vê o nome.
select set_config('request.jwt.claims', '', true);
update public.perfis set consultoria_id = testes.id('B') where id = testes.id('pessoa_a2');
select testes.como('admin_a');
select is((select nome from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-01') where horas = 5), null::text,
  'o nome de quem não é visível vem nulo');
select is((select sum(horas) from public.horas_do_cliente_por_consultor(testes.id('c1'), '2026-03-01')), 6.0,
  'mas as horas continuam somadas');
reset role;

-- ── Permissões ───────────────────────────────────────────────────────────────

select ok(has_function_privilege('authenticated', 'public.horas_do_cliente_por_mes(uuid,int)', 'execute')
  and not has_function_privilege('anon', 'public.horas_do_cliente_por_mes(uuid,int)', 'execute')
  and not has_function_privilege('anon', 'public.horas_do_cliente_por_consultor(uuid,date)', 'execute')
  and not has_function_privilege('anon', 'public.checkins_do_cliente_por_semana(uuid,date)', 'execute'),
  'só quem está logado executa as funções');
select is((select count(*) from pg_proc where proname in ('horas_do_cliente_por_mes', 'horas_do_cliente_por_consultor',
    'checkins_do_cliente_por_semana') and (prosecdef or provolatile <> 's')), 0::bigint,
  'as três são security invoker e stable');

select * from finish();
rollback;
