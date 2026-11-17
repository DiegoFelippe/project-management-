-- Agenda: quem vê cada evento e cada participante, quem grava (ninguém pelo navegador), regras das tabelas, o
-- segredo do Google que o navegador nunca lê e os números do painel. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(106);

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
  insert into public.consultorias (nome) values ('Consultoria ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
  return v;
end $$;

-- p_aal null = token sem o campo aal (como nos outros testes).
create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
      || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- Evento gravado pelo sistema (o navegador não grava). Início em dias a partir de 2026-11-10 10:00 (São Paulo).
create function testes.evento(p_nome text, p_consultoria text, p_consultor text, p_dia int,
  p_cliente uuid default null, p_reuniao text default 'agendada') returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet, reuniao, criado_por)
  values (testes.id(p_consultoria), testes.id(p_consultor), p_cliente, 'Evento ' || p_nome,
    timestamptz '2026-11-10 10:00:00-03' + p_dia * interval '1 day',
    timestamptz '2026-11-10 11:00:00-03' + p_dia * interval '1 day',
    p_cliente is not null, p_reuniao, testes.id(p_consultor))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Quantos eventos / participantes do cenário quem está logado enxerga (o banco tem dados reais).
create function testes.eventos_vistos() returns text language sql stable as $$
  select coalesce(string_agg(f.nome, ',' order by f.nome), '')
  from public.agenda_eventos e join testes.fx f on f.id = e.id
$$;
create function testes.participantes_vistos() returns bigint language sql stable as $$
  select count(*) from public.agenda_participantes p where p.evento_id in (select id from testes.fx)
$$;
grant execute on function testes.eventos_vistos(), testes.participantes_vistos() to authenticated;

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
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
values (gen_random_uuid(), 'Cliente agenda A', 10, testes.id('A'), testes.id('a1'));
insert into testes.fx select 'clienteA', id from public.clientes where nome = 'Cliente agenda A';

select testes.evento('e1', 'A', 'a1', 0, testes.id('clienteA'));            -- de a1, com cliente
select testes.evento('e2', 'A', 'a2', 1);                                   -- de a2, a1 convidado
select testes.evento('e3', 'A', 'a2', 2, null, 'aguardando');               -- de a2, sem a1
select testes.evento('e4', 'B', 'b1', 3);                                   -- de outra consultoria
select testes.evento('e5', 'A', 'a1', 4, testes.id('clienteA'), 'aguardando');

insert into public.agenda_participantes (evento_id, perfil_id) values (testes.id('e2'), testes.id('a1'));
insert into public.agenda_participantes (evento_id, email) values (testes.id('e3'), 'de.fora@exemplo.com');
insert into public.agenda_participantes (evento_id, perfil_id) values (testes.id('e4'), testes.id('b1'));

-- ── Quem vê os eventos ───────────────────────────────────────────────────────
select testes.como('a1');
select is(testes.eventos_vistos(), 'e1,e2,e5', 'consultor vê os seus e o em que foi convidado');
select is(testes.participantes_vistos(), 1::bigint, 'consultor vê os participantes do evento em que foi convidado, não os do e3');
reset role;

select testes.como('a2');
select is(testes.eventos_vistos(), 'e2,e3', 'o colega vê só os dele (não os de a1)');
select is(testes.participantes_vistos(), 2::bigint, 'o dono do evento vê os participantes dele');
reset role;

select testes.como('gestor_a');
select is(testes.eventos_vistos(), 'e1,e2,e3,e5', 'gestor vê os da consultoria, não os de outra');
select is(testes.participantes_vistos(), 2::bigint, 'gestor vê os participantes da consultoria');
reset role;

select testes.como('admin_a');
select is(testes.eventos_vistos(), 'e1,e2,e3,e5', 'administrador vê os da consultoria, não os de outra');
reset role;

select testes.como('gestor_b');
select is(testes.eventos_vistos(), 'e4', 'gestor de outra consultoria vê só os dela');
select is(testes.participantes_vistos(), 1::bigint, 'e só os participantes dela');
reset role;

select testes.como('b1');
select is(testes.eventos_vistos(), 'e4', 'consultor de outra consultoria não vê nada da A');
reset role;

select testes.como('central1');
select is(testes.eventos_vistos(), 'e1,e2,e3,e4,e5', 'central vê todos');
select is(testes.participantes_vistos(), 3::bigint, 'central vê todos os participantes');
reset role;

-- anônimo não lê
set local role anon;
select throws_ok($$ select count(*) from public.agenda_eventos $$, '42501', null, 'anônimo não lê eventos');
select throws_ok($$ select count(*) from public.google_pessoas $$, '42501', null, 'anônimo não lê o Google das pessoas');
reset role;

-- ── Ninguém grava pelo navegador ─────────────────────────────────────────────
select testes.como('admin_a');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim)
  values (%L, %L, 'X', now(), now() + interval '1 hour') $$, testes.id('A'), testes.id('a1')),
  '42501', null, 'administrador não cria evento pelo navegador');
select throws_ok(format($$ update public.agenda_eventos set titulo = 'Outro' where id = %L $$, testes.id('e1')),
  '42501', null, 'administrador não edita evento pelo navegador');
select throws_ok(format($$ delete from public.agenda_eventos where id = %L $$, testes.id('e1')),
  '42501', null, 'administrador não apaga evento pelo navegador');
select throws_ok(format($$ insert into public.agenda_participantes (evento_id, email) values (%L, 'x@exemplo.com') $$, testes.id('e1')),
  '42501', null, 'administrador não convida pelo navegador');
select throws_ok(format($$ update public.agenda_participantes set resposta = 'confirmou' where evento_id = %L $$, testes.id('e2')),
  '42501', null, 'nem o convidado responde direto na tabela (a Edge Function responde)');
reset role;

select testes.como('a1');
select throws_ok(format($$ update public.agenda_participantes set resposta = 'confirmou' where evento_id = %L $$, testes.id('e2')),
  '42501', null, 'consultor convidado não grava a resposta pelo navegador');
reset role;

-- ── Regras das tabelas (gravando como o sistema) ─────────────────────────────
select set_config('request.jwt.claims', '', true);
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim)
  values (%L, %L, 'Fim antes', timestamptz '2026-11-12 10:00-03', timestamptz '2026-11-12 09:00-03') $$,
  testes.id('A'), testes.id('a1')), '23514', null, 'fim antes do início falha');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim, cor)
  values (%L, %L, 'Cor', now(), now() + interval '1 hour', 8) $$, testes.id('A'), testes.id('a1')),
  '23514', null, 'cor fora de 0 a 7 falha');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim)
  values (%L, %L, '   ', now(), now() + interval '1 hour') $$, testes.id('A'), testes.id('a1')),
  '23514', null, 'título em branco falha');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim, reuniao)
  values (%L, %L, 'Situação', now(), now() + interval '1 hour', 'qualquer') $$, testes.id('A'), testes.id('a1')),
  '23514', null, 'situação da reunião fora da lista falha');

select throws_ok(format($$ insert into public.agenda_participantes (evento_id, perfil_id, email) values (%L, %L, 'a@exemplo.com') $$,
  testes.id('e1'), testes.id('a2')), '23514', null, 'participante com perfil e e-mail ao mesmo tempo falha');
select throws_ok(format($$ insert into public.agenda_participantes (evento_id) values (%L) $$, testes.id('e1')),
  '23514', null, 'participante sem perfil nem e-mail falha');
select throws_ok(format($$ insert into public.agenda_participantes (evento_id, perfil_id) values (%L, %L) $$,
  testes.id('e2'), testes.id('a1')), '23505', null, 'a mesma pessoa não é convidada duas vezes');
select throws_ok(format($$ insert into public.agenda_participantes (evento_id, email) values (%L, 'DE.FORA@exemplo.com') $$,
  testes.id('e3')), '23505', null, 'o mesmo e-mail (sem diferenciar maiúsculas) não é convidado duas vezes');

-- e3 já tem 1 de fora; chegar a 20 funciona e o 21º falha
select lives_ok(format($$ insert into public.agenda_participantes (evento_id, email)
  select %L, 'fora' || g || '@exemplo.com' from generate_series(1, 19) g $$, testes.id('e3')),
  'chega a 20 convidados de fora');
select throws_ok(format($$ insert into public.agenda_participantes (evento_id, email) values (%L, 'vinte.e.um@exemplo.com') $$,
  testes.id('e3')), '23514', null, 'o 21º convidado de fora falha');
select lives_ok(format($$ insert into public.agenda_participantes (evento_id, perfil_id) values (%L, %L) $$,
  testes.id('e3'), testes.id('a1')), 'convidado da casa (perfil) não conta nos 20 de fora');

-- Apagar o evento leva os participantes; pasta e evento se soltam um do outro
select testes.evento('e6', 'A', 'a2', 6, testes.id('clienteA'));
insert into public.agenda_participantes (evento_id, email) values (testes.id('e6'), 'pasta@exemplo.com');
insert into public.cliente_pastas (id, cliente_id, nome, evento_id)
values (gen_random_uuid(), testes.id('clienteA'), 'Reunião e6', testes.id('e6'));
update public.agenda_eventos set pasta_id = (select id from public.cliente_pastas where evento_id = testes.id('e6'))
where id = testes.id('e6');
delete from public.agenda_eventos where id = testes.id('e6');
select is((select count(*) from public.cliente_pastas where nome = 'Reunião e6' and evento_id is null
  and cliente_id = testes.id('clienteA')), 1::bigint, 'apagar o evento mantém a pasta e solta o evento_id');
select is((select count(*) from public.agenda_participantes where email = 'pasta@exemplo.com'), 0::bigint,
  'apagar o evento apaga os participantes');
select testes.evento('e7', 'A', 'a2', 7, testes.id('clienteA'));
insert into public.cliente_pastas (id, cliente_id, nome, evento_id)
values (gen_random_uuid(), testes.id('clienteA'), 'Reunião e7', testes.id('e7'));
update public.agenda_eventos set pasta_id = (select id from public.cliente_pastas where evento_id = testes.id('e7'))
where id = testes.id('e7');
delete from public.cliente_pastas where evento_id = testes.id('e7');
select is((select pasta_id from public.agenda_eventos where id = testes.id('e7')), null::uuid,
  'apagar a pasta solta o pasta_id do evento (o evento fica)');

-- ── Google: o segredo nunca é lido pelo navegador ────────────────────────────
insert into public.google_pessoas (perfil_id, email, escopos, segredo_id)
values (testes.id('a1'), 'a1@gmail.test', array['openid'], gen_random_uuid()),
       (testes.id('b1'), 'b1@gmail.test', array['openid'], gen_random_uuid());

select testes.como('a1');
select is((select email from public.google_pessoas where perfil_id = testes.id('a1')), 'a1@gmail.test', 'a pessoa lê o próprio e-mail do Google');
select is((select count(*) from public.google_pessoas where perfil_id = testes.id('b1')), 0::bigint, 'não lê o Google de outra pessoa');
select throws_ok($$ select segredo_id from public.google_pessoas $$, '42501', null, 'o segredo_id não é legível');
select throws_ok($$ select * from public.google_pessoas $$, '42501', null, 'select * também falha (colunas protegidas)');
select throws_ok($$ select escopos from public.google_pessoas $$, '42501', null, 'os escopos também não');
select throws_ok(format($$ update public.google_pessoas set erro = 'x' where perfil_id = %L $$, testes.id('a1')),
  '42501', null, 'a pessoa não grava o próprio Google (só a Edge Function)');
reset role;

select testes.como('gestor_a');
select ok(private.google_conectado(testes.id('a1')), 'a gestão sabe que o consultor conectou');
select ok(not private.google_conectado(testes.id('a2')), 'e que o outro não conectou');
select ok(not private.google_conectado(testes.id('b1')), 'e não sabe nada de outra consultoria');
select is((select count(*) from public.google_pessoas where perfil_id = testes.id('a1')), 0::bigint, 'mas o e-mail do consultor a gestão não lê');
reset role;

-- ── Sessão que exige 2FA ─────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
update public.perfis set exige_2fa = true where id = testes.id('a1');
select testes.como('a1', 'aal1');
select is(testes.eventos_vistos(), '', 'sessão aal1 de quem precisa do código não lê a agenda');
select throws_ok($$ select public.indicadores_da_agenda(date '2026-11-10') $$, 'P0001', 'sem_permissao',
  'nem os indicadores');
reset role;
select testes.como('a1', 'aal2');
select ok(testes.eventos_vistos() <> '', 'sessão aal2 volta a ler');
reset role;

-- ── Indicadores e feriados ───────────────────────────────────────────────────
-- Cenário (semana de 08 a 14/11): A tem e1 (10/11, com cliente), e5 (14/11, com cliente, aguardando), e3 (12/11, sem
-- cliente, aguardando; a1 convidado), e2 (11/11, sem cliente) e e7 (17/11, com cliente). B ganha e8 (11/11, com
-- cliente, aguardando, com pasta), que a gestão de A nunca conta.
select set_config('request.jwt.claims', '', true);
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
values (gen_random_uuid(), 'Cliente indicadores B', 10, testes.id('B'), testes.id('b1'));
insert into testes.fx select 'clienteIndB', id from public.clientes where nome = 'Cliente indicadores B';
select testes.evento('e8', 'B', 'b1', 1, testes.id('clienteIndB'), 'aguardando');
insert into public.cliente_pastas (cliente_id, nome, evento_id) values (testes.id('clienteIndB'), 'Reunião e8', testes.id('e8'));
update public.agenda_eventos set pasta_id = (select id from public.cliente_pastas where evento_id = testes.id('e8'))
where id = testes.id('e8');

select testes.como('central1');
select is((public.indicadores_da_agenda(date '2026-11-10') ->> 'aguardando')::int >= 2, true, 'central: aguardando conta as reuniões do cenário');
reset role;
-- "Aguardando" é só reunião com cliente (a rotina ignora a sem cliente): o e3 não conta.
select testes.como('a1', 'aal2');
select is(public.indicadores_da_agenda(date '2026-11-10'), '{"semana": 2, "mes": 2, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'consultor: semana, mês, aguardando (só com cliente) e pastas no recorte dele (próprios e convidado)');
reset role;
select testes.como('gestor_a');
select is(public.indicadores_da_agenda(date '2026-11-10'), '{"semana": 2, "mes": 3, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'gestor: os números só da consultoria dele (a reunião, o aguardando e a pasta de B não contam)');
reset role;
select testes.como('admin_a');
select is(public.indicadores_da_agenda(date '2026-11-10'), '{"semana": 2, "mes": 3, "aguardando": 1, "pastas_no_mes": 0}'::jsonb,
  'administrador: também só a consultoria dele');
reset role;
select testes.como('gestor_b');
select is(public.indicadores_da_agenda(date '2026-11-10'), '{"semana": 1, "mes": 1, "aguardando": 1, "pastas_no_mes": 1}'::jsonb,
  'e a gestão de B conta só a de B');
reset role;
-- O e8 só serve aos indicadores: sai para não mudar as listas de eventos que vêm depois.
delete from public.agenda_eventos where id = testes.id('e8');
delete from public.clientes where id = testes.id('clienteIndB');
delete from testes.fx where nome in ('e8', 'clienteIndB');

select testes.como('gestor_a');
select is((select count(*) from public.feriados_do_periodo(date '2026-11-01', date '2026-11-30')), 3::bigint,
  'feriados de novembro de 2026: 2, 15 e 20');
select is((select count(*) from public.feriados_do_periodo(date '2026-12-20', date '2027-01-02')), 2::bigint,
  'o período cruza o ano: 25/12 e 01/01');
reset role;

-- ── Consistência entre consultorias (grava como service_role, o único que escreve) ──────────────────────────
grant usage on schema testes to service_role;
grant select on testes.fx to service_role;
select set_config('request.jwt.claims', '', true);
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
values (gen_random_uuid(), 'Cliente agenda B', 10, testes.id('B'), testes.id('b1')),
       (gen_random_uuid(), 'Cliente agenda A2', 10, testes.id('A'), testes.id('a2'));
insert into testes.fx select 'clienteB', id from public.clientes where nome = 'Cliente agenda B';
insert into testes.fx select 'clienteA2', id from public.clientes where nome = 'Cliente agenda A2';
insert into public.cliente_pastas (id, cliente_id, nome) values (gen_random_uuid(), testes.id('clienteA2'), 'Pasta do A2');
insert into testes.fx select 'pastaA2', id from public.cliente_pastas where nome = 'Pasta do A2';

set local role service_role;
select throws_ok(format($$ insert into public.agenda_participantes (evento_id, perfil_id) values (%L, %L) $$,
  testes.id('e3'), testes.id('b1')), 'P0001', 'participante_invalido', 'participante de outra consultoria falha');
select throws_ok(format($$ insert into public.agenda_participantes (evento_id, perfil_id) values (%L, %L) $$,
  testes.id('e3'), testes.id('central1')), 'P0001', 'participante_invalido', 'pessoa da central não é participante (só consultor da consultoria)');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim)
  values (%L, %L, 'Consultor de fora', now(), now() + interval '1 hour') $$, testes.id('A'), testes.id('b1')),
  'P0001', 'consultor_invalido', 'consultor de outra consultoria falha');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim)
  values (%L, %L, %L, 'Cliente de fora', now(), now() + interval '1 hour') $$, testes.id('A'), testes.id('a1'), testes.id('clienteB')),
  'P0001', 'cliente_invalido', 'cliente de outra consultoria falha');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, pasta_id)
  values (%L, %L, %L, 'Pasta de outro', now(), now() + interval '1 hour', %L) $$,
  testes.id('A'), testes.id('a1'), testes.id('clienteA'), testes.id('pastaA2')),
  'P0001', 'pasta_invalida', 'pasta de outro cliente falha');
select throws_ok(format($$ update public.agenda_eventos set consultor_id = %L where id = %L $$, testes.id('b1'), testes.id('e5')),
  'P0001', 'consultor_invalido', 'trocar o consultor para alguém de outra consultoria falha');
select throws_ok(format($$ update public.agenda_eventos set consultoria_id = %L, consultor_id = %L where id = %L $$,
  testes.id('B'), testes.id('b1'), testes.id('e2')), 'P0001', 'participante_invalido',
  'mudar o evento de consultoria com participante da antiga falha');
select throws_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim)
  values (%L, %L, 'Longo', timestamptz '2026-01-01 00:00-03', timestamptz '2026-02-01 00:00:01-03') $$,
  testes.id('A'), testes.id('a1')), '23514', null, 'evento com mais de 31 dias falha');
select lives_ok(format($$ insert into public.agenda_eventos (consultoria_id, consultor_id, titulo, inicio, fim)
  values (%L, %L, 'Trinta e um dias', timestamptz '2026-01-01 00:00-03', timestamptz '2026-02-01 00:00-03') $$,
  testes.id('A'), testes.id('a1')), 'evento de exatamente 31 dias vale');
reset role;

-- Defesa em profundidade: mesmo com um dado ruim (gatilho desligado só aqui), o convidado de outra consultoria não vê.
select set_config('request.jwt.claims', '', true);
alter table public.agenda_participantes disable trigger agenda_participantes_validar;
insert into public.agenda_participantes (evento_id, perfil_id) values (testes.id('e3'), testes.id('b1'));
alter table public.agenda_participantes enable trigger agenda_participantes_validar;
select testes.como('b1');
select is(testes.eventos_vistos(), 'e4', 'convidado de outra consultoria (dado ruim) não vê o evento da A');
select is(public.evento_da_agenda(testes.id('e3')), null::jsonb, 'nem pelo detalhe');
reset role;
select set_config('request.jwt.claims', '', true);
delete from public.agenda_participantes where evento_id = testes.id('e3') and perfil_id = testes.id('b1');

-- ── Leitura do período (RPC) ─────────────────────────────────────────────────
create function testes.ids_do_periodo(p_json jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(f.nome, ',' order by f.nome), '')
  from jsonb_array_elements(p_json -> 'itens') i join testes.fx f on f.id = (i ->> 'id')::uuid
$$;
grant execute on function testes.ids_do_periodo(jsonb) to authenticated;

select testes.como('a1', 'aal2');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03')),
  'e1,e2,e3,e5', 'consultor: o período traz os próprios e os em que foi convidado');
select is(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03') -> 'ha_mais',
  'false'::jsonb, 'ha_mais falso quando cabe');
select is(jsonb_array_length(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03', null, null, null, 1) -> 'itens'),
  1, 'o limite corta a lista');
select is(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03', null, null, null, 1) -> 'ha_mais',
  'true'::jsonb, 'e avisa que há mais');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03', null, null, testes.id('clienteA'))),
  'e1,e5', 'filtro de cliente no banco');
select is((select i #>> '{consultor,nome}' from jsonb_array_elements(public.eventos_do_periodo(
  timestamptz '2026-11-12 00:00-03', timestamptz '2026-11-13 00:00-03') -> 'itens') i limit 1),
  'Pessoa a2', 'o convidado recebe o nome do consultor do evento (e3, de a2)');
select is((select count(*) from jsonb_array_elements(public.eventos_do_periodo(
  timestamptz '2026-11-12 00:00-03', timestamptz '2026-11-13 00:00-03') -> 'itens') i,
  jsonb_array_elements(i -> 'participantes') pt where pt ->> 'nome' = 'Pessoa a1'), 1::bigint,
  'os participantes vêm com o nome');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-14 10:30-03', timestamptz '2026-11-14 10:45-03')),
  'e5', 'o período usa início < fim do período e fim > começo (o evento que o atravessa entra)');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03', testes.id('a2'))),
  'e2,e3', 'filtro de consultor: só o que ele vê dos eventos de a2');
select ok(public.evento_da_agenda(testes.id('e3')) is not null, 'detalhe do evento em que foi convidado');
select is(public.evento_da_agenda(testes.id('e7')), null::jsonb, 'detalhe de evento do colega: nulo');
reset role;

select testes.como('gestor_a');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03')),
  'e1,e2,e3,e5,e7', 'gestor: o período traz a consultoria toda');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03', null, testes.id('B'))),
  '', 'gestor pedindo outra consultoria não recebe nada');
reset role;

select testes.como('central1');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03')),
  'e1,e2,e3,e4,e5,e7', 'central: todas as consultorias');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03', null, testes.id('B'))),
  'e4', 'central filtra por consultoria');
reset role;

select testes.como('b1');
select is(testes.ids_do_periodo(public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-01 00:00-03')),
  'e4', 'consultor de outra consultoria só recebe os dele');
reset role;

select testes.como('a1', 'aal1');
select throws_ok($$ select public.eventos_do_periodo(now(), now() + interval '1 day') $$, 'P0001', 'sem_permissao',
  'sessão aal1 de quem precisa do código não lê o período');
select throws_ok($$ select public.evento_da_agenda(gen_random_uuid()) $$, 'P0001', 'sem_permissao', 'nem o detalhe');
reset role;

-- ── Ausências do período (RPC) ───────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
insert into public.ausencias (perfil_id, de, ate, motivo) values
  (testes.id('a1'), date '2026-11-16', date '2026-11-18', 'Férias a1'),
  (testes.id('a2'), date '2026-11-17', date '2026-11-20', 'Férias a2'),
  (testes.id('b1'), date '2026-11-17', date '2026-11-17', 'Férias b1'),
  (testes.id('a2'), date '2026-12-10', date '2026-12-12', 'Dezembro a2');
create function testes.ausencias_vistas(p_json jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(i ->> 'motivo', ',' order by i ->> 'motivo'), '')
  from jsonb_array_elements(p_json -> 'itens') i
  where i ->> 'motivo' like '%a1' or i ->> 'motivo' like '%a2' or i ->> 'motivo' like '%b1'
$$;
grant execute on function testes.ausencias_vistas(jsonb) to authenticated;

select testes.como('gestor_a');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30')),
  'Férias a1,Férias a2', 'gestor sem time vê as ausências da consultoria toda do período, não as de outra');
select is((select i #>> '{pessoa,nome}' from jsonb_array_elements(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30') -> 'itens') i
  where i ->> 'motivo' = 'Férias a1'), 'Pessoa a1', 'e com o nome (mesmo sem ler o perfil)');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30', testes.id('a2'))),
  'Férias a2', 'filtro de consultor');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30', null, testes.id('A'))),
  'Férias a1,Férias a2', 'filtro da própria consultoria');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30', null, testes.id('B'))),
  '', 'filtro de outra consultoria não traz nada');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-12-01', date '2026-12-31')),
  'Dezembro a2', 'o período corta pelas datas');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-18', date '2026-11-18')),
  'Férias a1,Férias a2', 'ausência que atravessa o período entra');
reset role;

select testes.como('a1', 'aal2');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30')),
  'Férias a1', 'consultor só vê as próprias');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30', testes.id('a2'))),
  '', 'e pedir a do colega não traz nada');
reset role;

select testes.como('b1');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30')),
  'Férias b1', 'outra consultoria só vê as dela');
reset role;

select testes.como('central1');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30')),
  'Férias a1,Férias a2,Férias b1', 'central vê todas');
select is(testes.ausencias_vistas(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30', null, testes.id('B'))),
  'Férias b1', 'central filtra por consultoria');
select is(public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30', null, null, 1) -> 'ha_mais', 'true'::jsonb,
  'o limite avisa que há mais');
reset role;

select testes.como('a1', 'aal1');
select throws_ok($$ select public.ausencias_do_periodo(date '2026-11-01', date '2026-11-30') $$, 'P0001', 'sem_permissao',
  'sessão aal1 de quem precisa do código não lê');
reset role;

-- ── Cliente apagado ou movido de consultoria ─────────────────────────────────
select set_config('request.jwt.claims', '', true);
create function testes.cliente_a(p_nome text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, 10, testes.id('A'), testes.id(p_consultor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;
-- Evento do cliente com a pasta da reunião.
create function testes.evento_com_pasta(p_nome text, p_cliente text, p_dia int) returns void language plpgsql as $$
declare v_pasta uuid;
begin
  perform testes.evento(p_nome, 'A', 'a1', p_dia, testes.id(p_cliente));
  insert into public.cliente_pastas (cliente_id, nome, evento_id)
  values (testes.id(p_cliente), 'Pasta ' || p_nome, testes.id(p_nome)) returning id into v_pasta;
  update public.agenda_eventos set pasta_id = v_pasta where id = testes.id(p_nome);
end $$;

-- 1. Apagar o cliente (sem horas): o evento fica, sem cliente e sem pasta
select testes.cliente_a('cli_apagar', 'a1');
select testes.evento_com_pasta('ev_apagar', 'cli_apagar', 20);
select lives_ok(format($$ delete from public.clientes where id = %L $$, testes.id('cli_apagar')),
  'apagar cliente com evento e pasta vazia da reunião funciona');
select ok((select cliente_id is null and pasta_id is null and titulo = 'Evento ev_apagar'
  from public.agenda_eventos where id = testes.id('ev_apagar')), 'o evento fica, sem cliente e sem pasta');

-- 2. Cliente com horas: segue recusado, com o mesmo erro de antes (o app traduz em "arquive em vez de apagar")
select testes.cliente_a('cli_horas', 'a1');
select testes.evento_com_pasta('ev_horas', 'cli_horas', 21);
alter table public.checkins disable trigger checkins_validar;
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
values (testes.id('cli_horas'), testes.id('a1'), testes.id('A'), now() - interval '3 hours', now() - interval '2 hours', 'Atendimento');
alter table public.checkins enable trigger checkins_validar;
select throws_ok(format($$ delete from public.clientes where id = %L $$, testes.id('cli_horas')),
  '23503', null, 'cliente com horas continua não sendo apagado (restrict dos check-ins)');
select ok((select cliente_id is not null and pasta_id is not null from public.agenda_eventos where id = testes.id('ev_horas')),
  'e o evento segue ligado ao cliente');
delete from public.checkins where cliente_id = testes.id('cli_horas');

-- 3. Cliente muda de consultoria: o evento da antiga perde cliente e pasta, o resto fica
select testes.cliente_a('cli_move', 'a1');
select testes.evento_com_pasta('ev_move', 'cli_move', 22);
update public.clientes set consultoria_id = testes.id('B'), consultor_id = null where id = testes.id('cli_move');
select ok((select cliente_id is null and pasta_id is null and consultoria_id = testes.id('A') and consultor_id = testes.id('a1')
  and titulo = 'Evento ev_move' from public.agenda_eventos where id = testes.id('ev_move')),
  'cliente movido para B: o evento de A perde cliente e pasta e mantém o resto');
select testes.como('admin_a');
select ok((select i -> 'cliente' = 'null'::jsonb and i ->> 'titulo' = 'Evento ev_move'
  from jsonb_array_elements(public.eventos_do_periodo(timestamptz '2026-12-02 00:00-03', timestamptz '2026-12-03 00:00-03') -> 'itens') i
  where i ->> 'id' = testes.id('ev_move')::text), 'o administrador de A lê o evento sem o cliente');
reset role;
select testes.como('gestor_b');
select is((select count(*) from jsonb_array_elements(public.eventos_do_periodo(timestamptz '2026-12-02 00:00-03', timestamptz '2026-12-03 00:00-03') -> 'itens') i
  where i ->> 'id' = testes.id('ev_move')::text), 0::bigint, 'a consultoria B nunca vê o evento de A');
reset role;

-- 4. Defesa em profundidade: sem o gatilho de limpeza, o JSON ainda esconde o cliente de outra consultoria
select set_config('request.jwt.claims', '', true);
select testes.cliente_a('cli_move2', 'a1');
select testes.evento('ev_move2', 'A', 'a1', 23, testes.id('cli_move2'));
alter table public.clientes disable trigger clientes_limpar_agenda;
update public.clientes set consultoria_id = testes.id('B'), consultor_id = null where id = testes.id('cli_move2');
alter table public.clientes enable trigger clientes_limpar_agenda;
select testes.como('admin_a');
select ok((select i -> 'cliente' = 'null'::jsonb
  from jsonb_array_elements(public.eventos_do_periodo(timestamptz '2026-12-03 00:00-03', timestamptz '2026-12-04 00:00-03') -> 'itens') i
  where i ->> 'id' = testes.id('ev_move2')::text), 'mesmo sem a limpeza, o JSON não entrega o cliente de outra consultoria');
select ok(public.evento_da_agenda(testes.id('ev_move2')) -> 'cliente' = 'null'::jsonb, 'nem o detalhe');
reset role;

select * from finish();
rollback;
