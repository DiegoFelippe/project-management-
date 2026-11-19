-- Eventos do cliente (a tabela "Eventos do cliente" embaixo da agenda do cliente, pedido do Diego, 17/11): todos os
-- eventos daquele cliente, de todas as datas, 15 por página, do mais novo para o mais antigo (início desc), com o total
-- e o próximo (o primeiro que ainda não começou). Quem vê o quê é o mesmo da agenda do cliente (eventos_do_periodo com
-- p_cliente): consultor = os próprios + os convidados; gestão = a consultoria; central = todas. Outra consultoria e o
-- colega sem acesso não veem nada. Cada item sai de private.evento_em_json, igual ao da agenda (nenhum campo a mais).
-- No fim, um cliente com milhares de eventos: a página e o total vão pelo índice (cliente_id, inicio desc).
-- Roda com: npx supabase test db supabase/tests/database/agenda_eventos_do_cliente.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

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
  insert into public.consultorias (nome) values ('Consultoria eventos do cliente ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'evcli_' || p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, 'evcli_' || p_nome || '@teste.test', p_papel);
  return v;
end $$;

create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente eventos ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor))
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

-- Evento gravado pelo sistema, a p_dias dias de agora (negativo = passado), de 1 h, às 10:00 de São Paulo.
create function testes.evento(p_nome text, p_consultoria text, p_consultor text, p_dias int, p_cliente text default null)
returns uuid language plpgsql as $$
declare
  v uuid;
  v_inicio timestamptz := ((now() at time zone 'America/Sao_Paulo')::date + p_dias + time '10:00')
    at time zone 'America/Sao_Paulo';
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet, criado_por)
  values (testes.id(p_consultoria), testes.id(p_consultor), testes.id(p_cliente), 'Evento ' || p_nome,
    v_inicio, v_inicio + interval '1 hour', p_cliente is not null, testes.id(p_consultor))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Os títulos da página, na ordem que vieram (sem o "Evento " da frente).
create function testes.titulos(p_cliente text, p_pagina int default 1) returns text[] language sql as $$
  select coalesce(array_agg(substr(i ->> 'titulo', 8) order by n), '{}')
  from jsonb_array_elements(public.eventos_do_cliente(testes.id(p_cliente), p_pagina) -> 'itens') with ordinality as t(i, n)
$$;
create function testes.total(p_cliente text) returns int language sql as $$
  select (public.eventos_do_cliente(testes.id(p_cliente)) ->> 'total')::int
$$;
create function testes.proximo(p_cliente text) returns uuid language sql as $$
  select (public.eventos_do_cliente(testes.id(p_cliente)) ->> 'proximo')::uuid
$$;
-- O mesmo evento lido pela agenda (eventos_do_periodo com o cliente, 90 dias para cada lado) e pela lista nova.
create function testes.na_agenda(p_cliente text, p_evento text) returns jsonb language sql as $$
  select i from jsonb_array_elements(public.eventos_do_periodo(now() - interval '90 days', now() + interval '90 days',
    p_cliente => testes.id(p_cliente)) -> 'itens') i
  where i ->> 'id' = testes.id(p_evento)::text
$$;
create function testes.na_lista(p_cliente text, p_evento text) returns jsonb language sql as $$
  select i from jsonb_array_elements(public.eventos_do_cliente(testes.id(p_cliente)) -> 'itens') i
  where i ->> 'id' = testes.id(p_evento)::text
$$;
grant execute on all functions in schema testes to authenticated;

-- ── Cenário ──────────────────────────────────────────────────────────────────
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('a1', 'pessoa', 'A');   -- consultor do cliente
select testes.perfil('a2', 'pessoa', 'A');   -- colega com reuniões do cliente
select testes.perfil('a3', 'pessoa', 'A');   -- colega sem acesso (nem organiza nem foi convidado)
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('b1', 'pessoa', 'B');

select set_config('request.jwt.claims', '', true);
select testes.cliente('cliA', 'A', 'a1');     -- o cliente da aba
select testes.cliente('cliA2', 'A', 'a2');    -- outro cliente da mesma consultoria
select testes.cliente('cliB', 'B', 'b1');     -- cliente de outra consultoria
select testes.cliente('cliP', 'A', 'a1');     -- o da paginação

select testes.evento('x8', 'A', 'a1', 20, 'cliA');    -- futuro, o mais longe
select testes.evento('x2', 'A', 'a1', 3, 'cliA');
select testes.evento('x3', 'A', 'a2', 1, 'cliA');     -- de a2, a1 convidado: o próximo
select testes.evento('x4', 'A', 'a2', -2, 'cliA');    -- de a2, sem a1
select testes.evento('x1', 'A', 'a1', -10, 'cliA');
select testes.evento('x9', 'A', 'a1', -20, 'cliA');   -- passado, o mais antigo
select testes.evento('x5', 'A', 'a1', 5, 'cliA2');    -- outro cliente
select testes.evento('x6', 'A', 'a1', 1, null);       -- sem cliente
select testes.evento('x7', 'B', 'b1', 2, 'cliB');     -- outra consultoria
insert into public.agenda_participantes (evento_id, perfil_id) values (testes.id('x3'), testes.id('a1'));
insert into public.agenda_participantes (evento_id, email) values (testes.id('x3'), 'fora@exemplo.com');

-- 20 eventos do cliente da paginação, um por dia, de ontem para trás (p01 = ontem ... p20 = 20 dias atrás).
select testes.evento('p' || lpad(n::text, 2, '0'), 'A', 'a1', -n, 'cliP') from generate_series(1, 20) n;

-- ── Uma versão só, com as proteções de sempre ───────────────────────────────
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'eventos_do_cliente'), 1,
  'eventos_do_cliente tem uma versão só (sem sobrecarga)');
select is((select pg_get_function_identity_arguments('public.eventos_do_cliente(uuid, int)'::regprocedure)),
  'p_cliente uuid, p_pagina integer', 'a versão é (p_cliente, p_pagina)');
select ok((select prosecdef from pg_proc where oid = 'public.eventos_do_cliente(uuid, int)'::regprocedure),
  'security definer');
select ok((select proconfig @> array['search_path=""', 'plan_cache_mode=force_custom_plan']
           from pg_proc where oid = 'public.eventos_do_cliente(uuid, int)'::regprocedure),
  'search_path vazio e plano por chamada (force_custom_plan)');
select ok(has_function_privilege('authenticated', 'public.eventos_do_cliente(uuid, int)', 'execute'),
  'quem entrou executa');
select ok(not has_function_privilege('anon', 'public.eventos_do_cliente(uuid, int)', 'execute'),
  'anônimo não executa');
select ok(not has_function_privilege('service_role', 'public.eventos_do_cliente(uuid, int)', 'execute'),
  'só authenticated: o service_role também não');
select has_index('public', 'agenda_eventos', 'agenda_eventos_cliente_inicio_idx', array['cliente_id', 'inicio', 'id'],
  'índice (cliente_id, inicio desc, id desc) para a lista do cliente');

-- ── Ordem: do mais novo para o mais antigo (o futuro em cima) ────────────────
select testes.como('gestor_a');
select is(testes.titulos('cliA'), array['x8', 'x2', 'x3', 'x4', 'x1', 'x9'],
  'gestor: todos os eventos do cliente, de todas as datas, do mais novo para o mais antigo');
select is(testes.total('cliA'), 6, 'gestor: o total é o do cliente (nem outro cliente nem evento sem cliente)');
select is(testes.proximo('cliA'), testes.id('x3'), 'o próximo é o primeiro que ainda não começou (x3, amanhã)');
reset role;

-- ── Paginação: 15 por página, com o total ───────────────────────────────────
select testes.como('a1');
select is(cardinality(testes.titulos('cliP')), 15, 'página 1: 15 eventos');
select is(testes.titulos('cliP'), (select array_agg('p' || lpad(n::text, 2, '0') order by n) from generate_series(1, 15) n),
  'página 1: de ontem (p01) a 15 dias atrás (p15)');
select is(testes.titulos('cliP', 2), array['p16', 'p17', 'p18', 'p19', 'p20'], 'página 2: os 5 que sobram, na mesma ordem');
select is(testes.total('cliP'), 20, 'o total vem com a página: 20');
select is(public.eventos_do_cliente(testes.id('cliP'), 3), jsonb_build_object('itens', '[]'::jsonb, 'total', 20, 'proximo', null),
  'página que não existe: lista vazia, com o total (a tela volta à página 1)');
select is(testes.titulos('cliP', 0), testes.titulos('cliP', 1), 'página 0 ou nula vira a 1');
select is(testes.titulos('cliP', null), testes.titulos('cliP', 1), 'página nula vira a 1');
select is(testes.proximo('cliP'), null, 'cliente só com eventos passados: sem próximo');
reset role;

-- ── Quem vê: consultor do cliente, colegas, gestão, outra consultoria, central ──
select testes.como('a1');
select is(testes.titulos('cliA'), array['x8', 'x2', 'x3', 'x1', 'x9'],
  'consultor do cliente: os próprios e o convidado (x3); o x4 do colega, sem convite, não');
select is(testes.total('cliA'), 5, 'consultor do cliente: total 5');
select is(testes.titulos('cliB'), '{}'::text[], 'consultor: cliente de outra consultoria, nada');
reset role;

select testes.como('a2');
select is(testes.titulos('cliA'), array['x3', 'x4'], 'colega que organiza reuniões do cliente: só as dele');
reset role;

select testes.como('a3');
select is(public.eventos_do_cliente(testes.id('cliA')), jsonb_build_object('itens', '[]'::jsonb, 'total', 0, 'proximo', null),
  'colega sem acesso (não organiza nem foi convidado): nada, nem o total');
reset role;

select testes.como('admin_a');
select is(testes.titulos('cliA'), array['x8', 'x2', 'x3', 'x4', 'x1', 'x9'], 'administrador: o mesmo da gestão');
reset role;

select testes.como('gestor_b');
select is(public.eventos_do_cliente(testes.id('cliA')), jsonb_build_object('itens', '[]'::jsonb, 'total', 0, 'proximo', null),
  'gestão de outra consultoria: o cliente da A não mostra nada');
select is(testes.titulos('cliB'), array['x7'], 'gestão de B: o cliente dela');
reset role;

select testes.como('b1');
select is(testes.total('cliA'), 0, 'consultor de outra consultoria: nada do cliente da A');
reset role;

select testes.como('central1');
select is(testes.titulos('cliA'), array['x8', 'x2', 'x3', 'x4', 'x1', 'x9'], 'central: todos os eventos do cliente');
select is(testes.titulos('cliB'), array['x7'], 'central: o cliente de B, só o dele');
select is(public.eventos_do_cliente(gen_random_uuid()), jsonb_build_object('itens', '[]'::jsonb, 'total', 0, 'proximo', null),
  'cliente que não existe: lista vazia');
select is(public.eventos_do_cliente(null), jsonb_build_object('itens', '[]'::jsonb, 'total', 0, 'proximo', null),
  'sem cliente: lista vazia');
reset role;

-- ── Os campos: os mesmos da agenda (private.evento_em_json), nenhum a mais ────
select testes.como('a1');
select is(testes.na_lista('cliA', 'x3'), testes.na_agenda('cliA', 'x3'),
  'consultor: o evento convidado sai igual ao da agenda (mesmos campos e nomes)');
select is(testes.na_lista('cliA', 'x3') -> 'consultor' ->> 'nome', 'Pessoa a2', 'o organizador vem com o nome');
select is(jsonb_array_length(testes.na_lista('cliA', 'x3') -> 'participantes'), 2, 'os participantes vêm junto');
reset role;
select testes.como('gestor_a');
select is(testes.na_lista('cliA', 'x4'), testes.na_agenda('cliA', 'x4'), 'gestor: o evento sai igual ao da agenda');
reset role;

-- ── Sem permissão ────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
update public.perfis set exige_2fa = true where id = testes.id('a1');
select testes.como('a1', 'aal1');
select throws_ok(format($$ select public.eventos_do_cliente(%L) $$, testes.id('cliA')),
  'P0001', 'sem_permissao', 'sessão aal1 de quem precisa do código: sem a lista');
reset role;
select testes.como('a1', 'aal2');
select is(testes.total('cliA'), 5, 'sessão aal2 volta a ler');
reset role;

set local role anon;
select throws_ok(format($$ select public.eventos_do_cliente(%L) $$, testes.id('cliA')),
  '42501', null, 'anônimo não chama');
reset role;

-- ── Volume: um cliente com 2.000 eventos (oito anos de história) numa tabela com 40.000 ──
-- Plano: a primeira página vem pelo índice do cliente, já na ordem (nada de Seq Scan em agenda_eventos nem de ordenar);
-- o total também vai pelo índice. Tempo: a página (mesmo funda) e o total em até 50 ms.
select set_config('request.jwt.claims', '', true);
select testes.cliente('cliV', 'A', 'a1');
create temp table v_clientes (k int primary key, id uuid not null default gen_random_uuid());
insert into v_clientes (k) select generate_series(0, 39);
insert into public.clientes (id, nome, horas_mes, consultoria_id)
select id, 'Cliente volume ' || k, 10, testes.id('A') from v_clientes;
insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim)
select testes.id('A'), testes.id('a1'), case when n % 20 = 0 then testes.id('cliV') when n % 3 <> 0 then k.id end,
  'Volume ' || n, timestamptz '2019-01-01 10:00-03' + (n * 37 % 3000) * interval '1 day' + (n % 9) * interval '1 hour',
  timestamptz '2019-01-01 11:00-03' + (n * 37 % 3000) * interval '1 day' + (n % 9) * interval '1 hour'
from generate_series(1, 40000) n
join v_clientes k on k.k = n % 40;
analyze public.agenda_eventos;

-- O plano da consulta (sem rodar): o tipo de cada nó e o índice que usa.
create function testes.plano(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute 'explain (format json) ' || p_sql into v;
  return v;
end $$;

-- A página da gestão como a função monta (o recorte da consultoria; o do consultor só soma condições na linha).
select ok(not jsonb_path_exists(testes.plano(format($$
  select e.id from public.agenda_eventos e
  where e.cliente_id = %L and e.consultoria_id = %L
  order by e.inicio desc, e.id desc limit 15 $$, testes.id('cliV'), testes.id('A'))),
  '$.** ? ((@."Node Type" == "Seq Scan" && @."Relation Name" == "agenda_eventos") || @."Node Type" == "Sort")'),
  'a primeira página vem pelo índice, já na ordem: sem Seq Scan em agenda_eventos e sem ordenar');
select ok(jsonb_path_exists(testes.plano(format($$
  select e.id from public.agenda_eventos e
  where e.cliente_id = %L and e.consultoria_id = %L
  order by e.inicio desc, e.id desc limit 15 $$, testes.id('cliV'), testes.id('A'))),
  '$.** ? (@."Index Name" == "agenda_eventos_cliente_inicio_idx")'),
  'o índice usado é o (cliente_id, inicio desc, id desc)');
select ok(not jsonb_path_exists(testes.plano(format($$
  select count(*) from public.agenda_eventos e where e.cliente_id = %L and e.consultoria_id = %L $$,
  testes.id('cliV'), testes.id('A'))), '$.** ? (@."Node Type" == "Seq Scan" && @."Relation Name" == "agenda_eventos")'),
  'o total também vai pelo índice do cliente (sem Seq Scan em agenda_eventos)');

select testes.como('gestor_a');
select is(testes.total('cliV'), 2000, 'gestor: o total do cliente com milhares de eventos');
select performs_within(format('select public.eventos_do_cliente(%L, 100)', testes.id('cliV')), 25, 25, 5,
  'gestor, cliente com 2.000 eventos: uma página funda (a 100ª) e o total em até 50 ms na média');
reset role;
select testes.como('a1', 'aal2');
select performs_within(format('select public.eventos_do_cliente(%L, 1)', testes.id('cliV')), 25, 25, 5,
  'consultor do cliente com 2.000 eventos: a página e o total em até 50 ms na média');
reset role;

select * from finish();
rollback;
