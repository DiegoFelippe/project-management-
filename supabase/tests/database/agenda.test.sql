-- Agenda: quem vê cada evento e cada participante, quem grava (ninguém pelo navegador), regras das tabelas, o
-- segredo do Google que o navegador nunca lê e os números do painel. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

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
-- Cenário: e2 saiu. a1: e5 (dia 14/11, com cliente, aguardando) e e3 (convidado, 12/11, aguardando).
select testes.como('central1');
select is((public.indicadores_da_agenda(date '2026-11-10') ->> 'aguardando')::int >= 2, true, 'central: aguardando conta as reuniões do cenário');
reset role;
select testes.como('a1', 'aal2');
select is(public.indicadores_da_agenda(date '2026-11-10'), '{"semana": 2, "mes": 2, "aguardando": 2, "pastas_no_mes": 0}'::jsonb,
  'consultor: semana, mês, aguardando e pastas no recorte dele (próprios e convidado)');
reset role;

select testes.como('gestor_a');
select is((select count(*) from public.feriados_do_periodo(date '2026-11-01', date '2026-11-30')), 3::bigint,
  'feriados de novembro de 2026: 2, 15 e 20');
select is((select count(*) from public.feriados_do_periodo(date '2026-12-20', date '2027-01-02')), 2::bigint,
  'o período cruza o ano: 25/12 e 01/01');
reset role;

select * from finish();
rollback;
