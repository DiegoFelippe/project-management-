-- Agenda, rodada da tela (Task 6): quem a janela do evento oferece para convidar (pessoas_para_convidar) e o filtro
-- "Mostrar" no banco (eventos_do_periodo com p_tipo). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
  insert into public.consultorias (nome) values ('Consultoria convidar ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Pessoa com o nome dado (para a busca sem acento e a ordem); ativo = false para quem foi desativado.
create function testes.perfil(p_chave text, p_nome text, p_papel text, p_consultoria text, p_ativo boolean default true)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_chave || '@convidar.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_chave, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, ativo)
  values (v, testes.id(p_consultoria), p_nome, p_chave || '@convidar.test', p_papel, p_ativo);
  return v;
end $$;

create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
      || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- Nomes devolvidos, na ordem em que vieram.
create function testes.nomes(p_json jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(i ->> 'nome', ',' order by n), '') from jsonb_array_elements(p_json) with ordinality as x(i, n)
$$;
grant execute on function testes.nomes(jsonb) to authenticated;

select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'Central Um', 'central', null);
select testes.perfil('dono1', 'Dono Um', 'dono', null);
select testes.perfil('admin_a', 'Bia Admin', 'admin', 'A');
select testes.perfil('gestor_a', 'Caio Gestor', 'gestor', 'A');
select testes.perfil('a1', 'Ana Souza', 'pessoa', 'A');
select testes.perfil('a2', 'João Silva', 'pessoa', 'A');
select testes.perfil('a3', 'Dora Desativada', 'pessoa', 'A', false);
select testes.perfil('b1', 'Beto de B', 'pessoa', 'B');

-- ── pessoas_para_convidar ────────────────────────────────────────────────────

select testes.como('a1');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'))), 'Ana Souza,Bia Admin,Caio Gestor,João Silva',
  'consultor da A: as pessoas ativas da A (admin, gestor e consultor), por nome');
select is((select array_agg(k order by k) from jsonb_array_elements(public.pessoas_para_convidar(testes.id('A'))) i, jsonb_object_keys(i) k
  where i ->> 'nome' = 'Ana Souza'), array['cor', 'id', 'nome'], 'só id, nome e cor');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'), 'joao')), 'João Silva', 'busca sem acento e sem maiúscula');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'), 'SILVA')), 'João Silva', 'busca por parte do nome');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'), null, 2)), 'Ana Souza,Bia Admin', 'o limite corta');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'), 'dora')), '', 'quem foi desativado não aparece');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('B'))), '', 'consultor da A nunca recebe as pessoas da B');
select is(testes.nomes(public.pessoas_para_convidar(null)), '', 'sem consultoria, nada');
reset role;

select testes.como('gestor_a');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'), 'ana')), 'Ana Souza', 'gestor da A busca na A');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('B'))), '', 'gestor da A não recebe a B');
reset role;

select testes.como('b1');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('B'))), 'Beto de B', 'consultor da B: as pessoas da B');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'))), '', 'e nunca as da A');
reset role;

select testes.como('central1');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('B'))), 'Beto de B', 'central: qualquer consultoria');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'), 'bia')), 'Bia Admin', 'central busca na A');
reset role;

select testes.como('dono1');
select is(testes.nomes(public.pessoas_para_convidar(testes.id('A'), 'caio')), 'Caio Gestor', 'dono: qualquer consultoria');
reset role;

select set_config('request.jwt.claims', '', true);
update public.perfis set exige_2fa = true where id = testes.id('a1');
select testes.como('a1', 'aal1');
select throws_ok($$ select public.pessoas_para_convidar(testes.id('A')) $$, 'P0001', 'sem_permissao',
  'sessão aal1 de quem precisa do código não busca');
reset role;
select set_config('request.jwt.claims', '', true);
update public.perfis set exige_2fa = false where id = testes.id('a1');

select is((select has_function_privilege('anon', 'public.pessoas_para_convidar(uuid, text, integer)', 'execute')), false,
  'anon não chama');

-- ── eventos_do_periodo com p_tipo ────────────────────────────────────────────

select set_config('request.jwt.claims', '', true);
insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente convidar A', 10, testes.id('A'), testes.id('a1'));
insert into testes.fx select 'clienteA', id from public.clientes where nome = 'Cliente convidar A';
insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente convidar B', 10, testes.id('B'), testes.id('b1'));
insert into testes.fx select 'clienteB', id from public.clientes where nome = 'Cliente convidar B';

-- Eventos: r = reunião (com cliente), c = compromisso (sem cliente).
create function testes.evento(p_nome text, p_consultoria text, p_consultor text, p_cliente text, p_dia int)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, criado_por)
  values (testes.id(p_consultoria), testes.id(p_consultor), testes.id(p_cliente), 'Evento ' || p_nome,
    timestamptz '2026-11-10 10:00:00-03' + p_dia * interval '1 day',
    timestamptz '2026-11-10 11:00:00-03' + p_dia * interval '1 day', testes.id(p_consultor))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

select testes.evento('r_a1', 'A', 'a1', 'clienteA', 0);
select testes.evento('c_a1', 'A', 'a1', null, 1);
select testes.evento('c_a2', 'A', 'a2', null, 2);   -- a1 é convidada
select testes.evento('c_a2_so', 'A', 'a2', null, 3); -- a1 não é convidada
select testes.evento('r_b1', 'B', 'b1', 'clienteB', 4);
select testes.evento('c_b1', 'B', 'b1', null, 5);
insert into public.agenda_participantes (evento_id, perfil_id) values (testes.id('c_a2'), testes.id('a1'));

create function testes.ids(p_json jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(f.nome, ',' order by f.nome), '')
  from jsonb_array_elements(p_json -> 'itens') i join testes.fx f on f.id = (i ->> 'id')::uuid
$$;
grant execute on function testes.ids(jsonb) to authenticated;

select testes.como('a1');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03')),
  'c_a1,c_a2,r_a1', 'consultor sem tipo: os próprios e o convidado');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03',
  p_tipo => 'reunioes')), 'r_a1', 'consultor, reuniões: só com cliente');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03',
  p_tipo => 'compromissos')), 'c_a1,c_a2', 'consultor, compromissos: só sem cliente (inclusive o convidado)');
reset role;

select testes.como('gestor_a');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03',
  p_tipo => 'reunioes')), 'r_a1', 'gestão, reuniões');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03',
  p_tipo => 'compromissos')), 'c_a1,c_a2,c_a2_so', 'gestão, compromissos');
reset role;

select testes.como('central1');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03',
  null, null, null, 1000, 'reunioes')), 'r_a1,r_b1', 'central, reuniões (posicional, depois do limite)');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03',
  null, testes.id('B'), null, 1000, 'compromissos')), 'c_b1', 'central, compromissos da B');
select is(testes.ids(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03',
  null, testes.id('A'))), 'c_a1,c_a2,c_a2_so,r_a1', 'sem tipo continua tudo (chamada antiga, sem p_tipo)');
select throws_ok($$ select public.eventos_do_periodo(now(), now() + interval '1 day', p_tipo => 'outro') $$, '22023', 'tipo_invalido',
  'tipo desconhecido é recusado');
reset role;

select * from finish();
rollback;
