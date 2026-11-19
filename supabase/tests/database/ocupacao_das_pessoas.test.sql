-- ocupacao_das_pessoas: capacidade, reservado, realizado, ocupação e clientes de uma página de pessoas numa
-- chamada só (a lista de Usuários). Os números têm de ser os de consultores_por_ocupacao. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text, p_carga numeric default 44)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@pessoas.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, carga_semanal)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@pessoas.test', p_papel, p_carga);
  return v;
end $$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Pessoas Teste ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, p_horas, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- novembro/2037: 19 dias úteis x 44 h / 5 = 167,2 (mês futuro, com reservado). outubro/2026: 184,8 (passado).
create function testes.futuro() returns date language sql immutable as $$ select date '2037-11-01' $$;
create function testes.passado() returns date language sql immutable as $$ select date '2026-10-01' $$;

select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('zero_a', 'pessoa', 'A', 0);
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.cliente('a40', 40, 'A', 'pessoa_a');
select testes.cliente('a30', 30, 'A', 'pessoa_a');
select testes.cliente('b10', 10, 'B', 'pessoa_b');

-- Outubro/2026 de pessoa_a: 2 x 23 h 06 = 46,2 h.
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('a40'), '2026-10-05 08:00-03', '2026-10-06 07:06-03', 'Implantação'),
  (testes.id('a40'), '2026-10-07 08:00-03', '2026-10-08 07:06-03', 'Implantação');
reset role;
select set_config('request.jwt.claims', '', true);

-- ── Números iguais aos de consultores_por_ocupacao ──────────────────────────
select testes.como('central');
select is((select count(*) from public.ocupacao_das_pessoas(
    array[testes.id('pessoa_a'), testes.id('zero_a'), testes.id('pessoa_b')], testes.futuro())),
  3::bigint, 'a central vê as pessoas de qualquer consultoria');
select is((select f.capacidade from public.ocupacao_das_pessoas(array[testes.id('pessoa_a')], testes.futuro()) f),
  167.2::numeric, 'capacidade do mês');
select is((select f.reservado from public.ocupacao_das_pessoas(array[testes.id('pessoa_a')], testes.futuro()) f),
  70::numeric, 'reservado: 40 + 30 h');
select is((select f.clientes from public.ocupacao_das_pessoas(array[testes.id('pessoa_a')], testes.futuro()) f),
  2, 'clientes ativos');
select ok((select not exists (
    select 1
    from public.consultores_por_ocupacao(testes.id('A'), null, 50, 0, testes.futuro()) c
    full join public.ocupacao_das_pessoas(
      array[testes.id('admin_a'), testes.id('pessoa_a'), testes.id('zero_a')], testes.futuro()) o on o.id = c.id
    where (c.id in (testes.id('admin_a'), testes.id('pessoa_a'), testes.id('zero_a')) or o.id is not null)
      and (row(c.capacidade, c.reservado, c.realizado, c.ocupacao, c.clientes)
        is distinct from row(o.capacidade, o.reservado, o.realizado, o.ocupacao, o.clientes)))),
  'mês futuro: mesmos números de consultores_por_ocupacao');
select ok((select not exists (
    select 1
    from public.consultores_por_ocupacao(testes.id('A'), null, 50, 0, testes.passado()) c
    full join public.ocupacao_das_pessoas(
      array[testes.id('admin_a'), testes.id('pessoa_a'), testes.id('zero_a')], testes.passado()) o on o.id = c.id
    where (c.id in (testes.id('admin_a'), testes.id('pessoa_a'), testes.id('zero_a')) or o.id is not null)
      and (row(c.capacidade, c.reservado, c.realizado, c.ocupacao, c.clientes)
        is distinct from row(o.capacidade, o.reservado, o.realizado, o.ocupacao, o.clientes)))),
  'mês passado: mesmos números de consultores_por_ocupacao');
select is((select f.realizado from public.ocupacao_das_pessoas(array[testes.id('pessoa_a')], testes.passado()) f),
  46.2::numeric, 'realizado do mês passado');
select is((select round(f.ocupacao, 3) from public.ocupacao_das_pessoas(array[testes.id('pessoa_a')], testes.passado()) f),
  0.25::numeric, 'ocupação do mês passado: realizado / capacidade');
select ok((select f.capacidade = 0 and f.ocupacao is null from public.ocupacao_das_pessoas(array[testes.id('zero_a')], testes.futuro()) f),
  'carga 0: ocupação nula');
select is((select count(*) from public.ocupacao_das_pessoas(array[testes.id('central')], testes.futuro())),
  0::bigint, 'quem não é consultor (a central) não volta');
select is((select count(*) from public.ocupacao_das_pessoas(array[]::uuid[], testes.futuro())),
  0::bigint, 'sem ids, nada volta');
reset role;

-- ── Quem pode ver ────────────────────────────────────────────────────────────
select testes.como('admin_a');
select is((select array_agg(f.id order by f.id) from public.ocupacao_das_pessoas(
    array[testes.id('pessoa_a'), testes.id('pessoa_b')], testes.futuro()) f),
  array[testes.id('pessoa_a')], 'o administrador não vê ids de outra consultoria');
reset role;

select testes.como('pessoa_a');
select is((select count(*) from public.ocupacao_das_pessoas(array[testes.id('pessoa_a')], testes.futuro())),
  0::bigint, 'pessoa comum não alcança nem o próprio resumo por aqui');
reset role;

select throws_ok($$ select * from public.ocupacao_das_pessoas(
    (select array_agg(gen_random_uuid()) from generate_series(1, 101)), null) $$,
  null, null, 'mais de 100 ids é recusado');

set role anon;
select throws_ok($$ select * from public.ocupacao_das_pessoas(array[gen_random_uuid()], null) $$,
  '42501', null, 'anônimo não executa');
reset role;

select * from finish();
rollback;
