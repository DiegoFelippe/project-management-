-- Indicadores da agenda recortados por cliente (a aba Agenda do cliente): os 4 números contam só as reuniões daquele
-- cliente, sempre dentro do que cada papel vê (consultor: os próprios e os convidados; gestão: a consultoria; central:
-- todas). Outra consultoria nunca conta. Uma versão só da função, com as mesmas proteções. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
  insert into public.consultorias (nome) values ('Consultoria indicadores ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'indcli_' || p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, 'indcli_' || p_nome || '@teste.test', p_papel);
  return v;
end $$;

create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente indicadores ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
      || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- Evento gravado pelo sistema. Início em dias a partir de 2026-11-10 10:00 (terça, São Paulo): a semana medida vai de
-- domingo 08/11 a sábado 14/11 e o mês é novembro.
create function testes.evento(p_nome text, p_consultoria text, p_consultor text, p_dia int,
  p_cliente text default null, p_reuniao text default 'agendada', p_meet boolean default null) returns uuid
language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet, reuniao, criado_por)
  values (testes.id(p_consultoria), testes.id(p_consultor), testes.id(p_cliente), 'Evento ' || p_nome,
    timestamptz '2026-11-10 10:00:00-03' + p_dia * interval '1 day',
    timestamptz '2026-11-10 11:00:00-03' + p_dia * interval '1 day',
    coalesce(p_meet, p_cliente is not null), p_reuniao, testes.id(p_consultor))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.numeros(p_cliente text) returns jsonb language sql as $$
  select public.indicadores_da_agenda(date '2026-11-10', testes.id(p_cliente))
$$;
grant execute on function testes.numeros(text) to authenticated;

-- ── Cenário ──────────────────────────────────────────────────────────────────
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('a1', 'pessoa', 'A');
select testes.perfil('a2', 'pessoa', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('b1', 'pessoa', 'B');

select set_config('request.jwt.claims', '', true);
select testes.cliente('cliA', 'A', 'a1');     -- o cliente da aba (consultor: a1)
select testes.cliente('cliA2', 'A', 'a2');    -- outro cliente da mesma consultoria
select testes.cliente('cliB', 'B', 'b1');     -- cliente de outra consultoria

select testes.evento('x1', 'A', 'a1', 0, 'cliA');                     -- semana e mês
select testes.evento('x2', 'A', 'a1', 4, 'cliA', 'aguardando');       -- semana, mês e aguardando
select testes.evento('x3', 'A', 'a2', 1, 'cliA');                     -- de a2, a1 convidado
select testes.evento('x4', 'A', 'a2', 2, 'cliA');                     -- de a2, sem a1, com pasta
select testes.evento('x5', 'A', 'a1', 0, 'cliA2');                    -- outro cliente
select testes.evento('x6', 'A', 'a1', 1, null, 'agendada', true);     -- sem cliente, com Meet
select testes.evento('x7', 'B', 'b1', 0, 'cliB', 'aguardando');       -- outra consultoria
select testes.evento('x8', 'A', 'a1', 20, 'cliA');                    -- 30/11: no mês, fora da semana
select testes.evento('x9', 'A', 'a1', -20, 'cliA');                   -- 21/10: fora dos dois

insert into public.agenda_participantes (evento_id, perfil_id) values (testes.id('x3'), testes.id('a1'));
insert into public.cliente_pastas (cliente_id, nome, evento_id) values (testes.id('cliA'), 'Reunião x4', testes.id('x4'));
update public.agenda_eventos set pasta_id = (select id from public.cliente_pastas where evento_id = testes.id('x4'))
where id = testes.id('x4');

-- ── Uma versão só, com as mesmas proteções ───────────────────────────────────
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'indicadores_da_agenda'), 1,
  'indicadores_da_agenda tem uma versão só (sem sobrecarga)');
select is((select pg_get_function_identity_arguments('public.indicadores_da_agenda(date, uuid)'::regprocedure)),
  'p_dia date, p_cliente uuid', 'a versão é (p_dia, p_cliente)');
select ok((select prosecdef from pg_proc where oid = 'public.indicadores_da_agenda(date, uuid)'::regprocedure),
  'security definer');
select ok((select proconfig @> array['search_path=""', 'plan_cache_mode=force_custom_plan']
           from pg_proc where oid = 'public.indicadores_da_agenda(date, uuid)'::regprocedure),
  'search_path vazio e plano por chamada (force_custom_plan)');
select ok(has_function_privilege('authenticated', 'public.indicadores_da_agenda(date, uuid)', 'execute'),
  'quem entrou executa');
select ok(has_function_privilege('service_role', 'public.indicadores_da_agenda(date, uuid)', 'execute'),
  'o service_role executa');
select ok(not has_function_privilege('anon', 'public.indicadores_da_agenda(date, uuid)', 'execute'),
  'anônimo não executa');

-- ── Consultor do cliente: os próprios e o convidado, só deste cliente ───────
select testes.como('a1');
select is(testes.numeros('cliA'), '{"semana": 3, "mes": 4, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'consultor do cliente: x1, x2 e o convidado x3 na semana; x8 no mês; o x4 do colega não; outro cliente e sem cliente não');
select is(public.indicadores_da_agenda(date '2026-11-10'), '{"semana": 5, "mes": 6, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'sem o cliente, o mesmo consultor conta tudo dele (inclui outro cliente e o com Meet sem cliente)');
select is(public.indicadores_da_agenda(date '2026-11-10', null), public.indicadores_da_agenda(date '2026-11-10'),
  'p_cliente nulo é o mesmo que não mandar');
select is(testes.numeros('cliB'), '{"semana": 0, "mes": 0, "aguardando": 0, "pastas_no_mes": 0}'::jsonb,
  'cliente de outra consultoria: nada conta para o consultor');
reset role;

-- O colega que tem reuniões do cliente sem ser o consultor dele conta só as dele.
select testes.como('a2');
select is(testes.numeros('cliA'), '{"semana": 2, "mes": 2, "aguardando": 0, "pastas_no_mes": 1}'::jsonb,
  'outro consultor da consultoria: só as reuniões dele com o cliente (x3 e x4, com a pasta)');
reset role;

-- ── Gestão: a consultoria toda, só deste cliente ─────────────────────────────
select testes.como('gestor_a');
select is(testes.numeros('cliA'), '{"semana": 4, "mes": 5, "aguardando": 1, "pastas_no_mes": 1}'::jsonb,
  'gestor: todas as reuniões do cliente na consultoria (x1 a x4 e x8), com o aguardando e a pasta');
select is(testes.numeros('cliA2'), '{"semana": 1, "mes": 1, "aguardando": 0, "pastas_no_mes": 0}'::jsonb,
  'gestor: outro cliente da consultoria conta só as dele');
select is(testes.numeros('cliB'), '{"semana": 0, "mes": 0, "aguardando": 0, "pastas_no_mes": 0}'::jsonb,
  'gestor: cliente de outra consultoria nunca conta');
reset role;

select testes.como('admin_a');
select is(testes.numeros('cliA'), '{"semana": 4, "mes": 5, "aguardando": 1, "pastas_no_mes": 1}'::jsonb,
  'administrador: o mesmo da gestão');
reset role;

-- ── Outra consultoria ────────────────────────────────────────────────────────
select testes.como('gestor_b');
select is(testes.numeros('cliA'), '{"semana": 0, "mes": 0, "aguardando": 0, "pastas_no_mes": 0}'::jsonb,
  'gestão de outra consultoria: o cliente da A não conta nada');
select is(testes.numeros('cliB'), '{"semana": 1, "mes": 1, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'gestão de B: o cliente dela');
reset role;

select testes.como('b1');
select is(testes.numeros('cliA'), '{"semana": 0, "mes": 0, "aguardando": 0, "pastas_no_mes": 0}'::jsonb,
  'consultor de outra consultoria: o cliente da A não conta nada');
reset role;

-- ── Central: todas as consultorias, só deste cliente ─────────────────────────
select testes.como('central1');
select is(testes.numeros('cliA'), '{"semana": 4, "mes": 5, "aguardando": 1, "pastas_no_mes": 1}'::jsonb,
  'central: todas as reuniões do cliente');
select is(testes.numeros('cliB'), '{"semana": 1, "mes": 1, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'central: o cliente de B, só o dele');
select is(public.indicadores_da_agenda(date '2026-11-10', gen_random_uuid()),
  '{"semana": 0, "mes": 0, "aguardando": 0, "pastas_no_mes": 0}'::jsonb, 'cliente que não existe: tudo zero');
reset role;

-- ── Sem permissão ────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
update public.perfis set exige_2fa = true where id = testes.id('a1');
select testes.como('a1', 'aal1');
select throws_ok(format($$ select public.indicadores_da_agenda(date '2026-11-10', %L) $$, testes.id('cliA')),
  'P0001', 'sem_permissao', 'sessão aal1 de quem precisa do código: sem os números do cliente');
reset role;
select testes.como('a1', 'aal2');
select is(testes.numeros('cliA'), '{"semana": 3, "mes": 4, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'sessão aal2 volta a ler');
reset role;

set local role anon;
select throws_ok(format($$ select public.indicadores_da_agenda(date '2026-11-10', %L) $$, testes.id('cliA')),
  '42501', null, 'anônimo não chama');
reset role;

select * from finish();
rollback;
