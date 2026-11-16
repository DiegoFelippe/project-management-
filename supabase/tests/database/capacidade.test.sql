-- Capacidade: carga semanal, ausências e feriados nacionais; capacidade do mês por pessoa.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

create function testes.perfil(p_nome text, p_papel text, p_consultoria text,
  p_trocar boolean default false, p_convite boolean default false, p_ativo boolean default true) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome, not p_convite);
  insert into public.perfis (id, consultoria_id, nome, email, papel, precisa_trocar_senha, convite_pendente, ativo)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel, p_trocar, p_convite, p_ativo);
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

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Cenário
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('dono', 'dono', null);
select testes.perfil('central', 'central', null);
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('gestor_a2', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');

-- Feriados nacionais
select ok(exists (select 1 from private.feriados_nacionais(2026) d where d = date '2026-04-03'), 'Sexta-feira Santa de 2026');
select ok(exists (select 1 from private.feriados_nacionais(2026) d where d = date '2026-11-20'), 'Consciência Negra de 2026');
select ok(exists (select 1 from private.feriados_nacionais(2027) d where d = date '2027-03-26'), 'Sexta-feira Santa de 2027');
select is((select count(*) from private.feriados_nacionais(2026)), 10::bigint, 'dez feriados nacionais por ano');

-- Carga padrão e capacidade (como a central, que lê qualquer pessoa)
select is((select carga_semanal from public.perfis where id = testes.id('pessoa_a2')), 44.0::numeric, 'carga padrão de 44 h');
select testes.como('central');
select is(public.capacidade_do_mes(testes.id('pessoa_a2'), date '2026-11-10'), 167.2::numeric,
  'novembro/2026 com 44 h: 19 dias úteis');
select is(public.capacidade_do_mes(testes.id('pessoa_a2'), date '2026-12-01'), 193.6::numeric, 'dezembro/2026 com 44 h');
reset role;

-- Ausências
select testes.como('gestor_a2');
select lives_ok($$insert into public.ausencias (perfil_id, de, ate, motivo)
  values (testes.id('pessoa_a2'), '2026-11-23', '2026-11-27', 'Férias')$$, 'gestor cria ausência da pessoa');
select throws_ok($$insert into public.ausencias (perfil_id, de, ate, motivo)
  values (testes.id('pessoa_a2'), '2026-11-27', '2026-11-23', 'Invertida')$$, '23514', null, 'ausência com fim antes do início');
select is(public.capacidade_do_mes(testes.id('pessoa_a2'), date '2026-11-01'), 123.2::numeric, 'ausência de 23 a 27 tira 5 dias');
reset role;

select testes.como('central');
select lives_ok($$insert into public.ausencias (perfil_id, de, ate, motivo)
  values (testes.id('pessoa_a'), '2026-11-18', '2026-11-22', 'Licença')$$, 'central cria ausência');
select is(public.capacidade_do_mes(testes.id('pessoa_a'), date '2026-11-01'), 149.6::numeric,
  'ausência sobre o feriado de 20/11 e o fim de semana não desconta duas vezes');
reset role;

select testes.como('pessoa_a2');
select is((select count(*) from public.ausencias where perfil_id in (select id from testes.fx)), 1::bigint, 'pessoa vê a ausência dela');
select throws_ok($$insert into public.ausencias (perfil_id, de, ate, motivo)
  values (testes.id('pessoa_a2'), '2026-12-01', '2026-12-02', 'Por conta')$$, '42501', null, 'pessoa não cria ausência');
select is(public.capacidade_do_mes(testes.id('pessoa_a2'), date '2026-11-01'), 123.2::numeric, 'pessoa vê a própria capacidade');
select is(public.capacidade_do_mes(testes.id('pessoa_a'), date '2026-11-01'), null::numeric, 'pessoa não vê a capacidade de outra');
reset role;

select testes.como('admin_b');
select is((select count(*) from public.ausencias where perfil_id in (select id from testes.fx)), 0::bigint, 'outra consultoria não vê ausências');
select is(public.capacidade_do_mes(testes.id('pessoa_a2'), date '2026-11-01'), null::numeric, 'outra consultoria não vê a capacidade');
reset role;

-- Carga semanal
select testes.como('gestor_a2');
select lives_ok($$select public.definir_carga(testes.id('pessoa_a2'), 40)$$, 'gestor define a carga da pessoa');
select throws_ok($$select public.definir_carga(testes.id('pessoa_a2'), 61)$$, '23514', null, 'carga acima de 60 h');
reset role;
select testes.como('pessoa_a');
select throws_ok($$select public.definir_carga(testes.id('pessoa_a2'), 30)$$, 'P0001', 'sem_permissao', 'pessoa não define carga');
reset role;
select testes.como('admin_b');
select throws_ok($$select public.definir_carga(testes.id('pessoa_a2'), 30)$$, 'P0001', 'sem_permissao', 'outra consultoria não define carga');
reset role;
select testes.como('central');
select lives_ok($$select public.definir_carga(testes.id('pessoa_a'), 0)$$, 'central define a carga');
select is(public.capacidade_do_mes(testes.id('pessoa_a'), date '2026-11-01'), 0::numeric, 'carga 0 dá capacidade 0');
reset role;

select * from finish();
rollback;
