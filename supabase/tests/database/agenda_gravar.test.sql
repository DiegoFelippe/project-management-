-- Gravar um evento da agenda (public.gravar_evento_da_agenda, só a Edge Function agenda chama): o evento e a lista de
-- participantes numa transação; o ensaio confere as regras do banco (gatilhos e restrições) e não deixa nada; criar de
-- novo com o mesmo id vira edição; editar não ressuscita evento apagado nem troca o consultor.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create schema testes;
create table testes.fx (nome text primary key, id uuid not null);

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

-- O evento como a Edge Function manda: id, consultoria e consultor (dono da agenda), título e horário.
create function testes.ev(p_evento text, p_consultor text, p_extra jsonb default '{}') returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', testes.id(p_evento),
    'consultoria_id', (select consultoria_id from public.perfis where id = testes.id(p_consultor)),
    'consultor_id', testes.id(p_consultor),
    'titulo', 'Reunião ' || p_evento,
    'inicio', '2026-11-20T17:00:00Z',
    'fim', '2026-11-20T18:00:00Z',
    'criado_por', testes.id(p_consultor)
  ) || p_extra
$$;

create function testes.gravar(p_evento jsonb, p_participantes uuid[] default '{}', p_convidados text[] default '{}',
  p_novo boolean default true, p_ensaio boolean default false) returns jsonb language sql as $$
  select public.gravar_evento_da_agenda(p_evento, p_participantes, p_convidados, p_novo, p_ensaio)
$$;

create function testes.respostas(p_evento text) returns text language sql stable as $$
  select string_agg(coalesce(pp.nome, pt.email) || ':' || pt.resposta, ', ' order by coalesce(pp.nome, pt.email))
  from public.agenda_participantes pt left join public.perfis pp on pp.id = pt.perfil_id
  where pt.evento_id = testes.id(p_evento)
$$;

select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('ana', 'pessoa', 'A');
select testes.perfil('bia', 'pessoa', 'A');
select testes.perfil('caio', 'pessoa', 'B');
insert into testes.fx values ('e1', gen_random_uuid()), ('fantasma', gen_random_uuid());

-- ── Quem chama ───────────────────────────────────────────────────────────────
select ok(not has_function_privilege('authenticated',
  'public.gravar_evento_da_agenda(jsonb, uuid[], text[], boolean, boolean)', 'execute'), 'o navegador logado não grava evento');
select ok(not has_function_privilege('anon',
  'public.gravar_evento_da_agenda(jsonb, uuid[], text[], boolean, boolean)', 'execute'), 'nem o anônimo');
select ok(not has_function_privilege('authenticated', 'private.gravar_evento(jsonb, uuid[], text[], boolean)', 'execute'),
  'nem pela função de private');
select ok(has_function_privilege('service_role',
  'public.gravar_evento_da_agenda(jsonb, uuid[], text[], boolean, boolean)', 'execute'), 'a Edge Function (service_role) grava');

-- ── Ensaio: as regras do banco antes do Google ───────────────────────────────
select is(testes.gravar(testes.ev('e1', 'ana'), array[testes.id('bia')], array['x@cliente.test'], true, true),
  '{"ensaio": true}'::jsonb, 'o ensaio passa');
select is((select count(*) from public.agenda_eventos where id = testes.id('e1'))::int, 0, 'e não deixa o evento');
select is((select count(*) from public.agenda_participantes where evento_id = testes.id('e1'))::int, 0, 'nem os participantes');
select throws_ok($$ select testes.gravar(testes.ev('e1', 'ana'), array[testes.id('caio')], '{}', true, true) $$,
  'P0001', 'participante_invalido', 'ensaio devolve o erro do gatilho (participante de outra consultoria)');
select throws_ok($$ select testes.gravar(testes.ev('e1', 'ana'), '{}',
  array(select 'p' || i || '@cliente.test' from generate_series(1, 21) i), true, true) $$,
  '23514', 'No máximo 20 convidados de fora por evento', 'ensaio recusa o 21º convidado de fora');
select throws_ok($$ select testes.gravar(testes.ev('e1', 'ana'), '{}', array['a@cliente.test', 'A@cliente.test'], true, true) $$,
  '23505', null, 'ensaio recusa convidado de fora repetido');
select throws_ok($$ select testes.gravar(testes.ev('e1', 'ana', '{"fim": "2026-11-20T16:00:00Z"}'), '{}', '{}', true, true) $$,
  '23514', null, 'ensaio recusa fim antes do início');
select throws_ok($$ select testes.gravar(testes.ev('e1', 'ana', jsonb_build_object('consultoria_id', testes.id('B'))), '{}', '{}', true, true) $$,
  'P0001', 'consultor_invalido', 'ensaio recusa consultor de outra consultoria');

-- ── Criar ────────────────────────────────────────────────────────────────────
select is((testes.gravar(testes.ev('e1', 'ana', '{"com_meet": true, "meet_codigo": "abc-defg-hij"}'),
  array[testes.id('bia')], array['x@cliente.test']) ->> 'meet_codigo'), 'abc-defg-hij', 'cria e devolve o evento em JSON');
select is(testes.respostas('e1'), 'Pessoa bia:pendente, x@cliente.test:pendente', 'com os participantes');
select is((select reuniao from public.agenda_eventos where id = testes.id('e1')), 'agendada', 'reunião agendada');

-- ── Editar: troca a lista inteira, guarda a resposta de quem continua ───────
update public.agenda_participantes set resposta = 'confirmou' where evento_id = testes.id('e1') and perfil_id = testes.id('bia');
select is((testes.gravar(testes.ev('e1', 'ana', '{"titulo": "Reunião remarcada"}'), array[testes.id('bia')],
  array['y@cliente.test'], false) ->> 'titulo'), 'Reunião remarcada', 'edita');
select is(testes.respostas('e1'), 'Pessoa bia:confirmou, y@cliente.test:pendente', 'quem continua guarda a resposta; quem saiu sai');
select is((select criado_por from public.agenda_eventos where id = testes.id('e1')), testes.id('ana'), 'quem criou não muda');

-- ── Criar de novo com o mesmo id (a resposta anterior se perdeu) vira edição ─
select lives_ok($$ select testes.gravar(testes.ev('e1', 'ana', '{"titulo": "Repetida"}'), array[testes.id('bia')], '{}') $$,
  'criar de novo com o mesmo id e o mesmo consultor');
select is((select titulo || ' ' || count(*) over () from public.agenda_eventos where id = testes.id('e1')), 'Repetida 1',
  'um evento só, atualizado');
select throws_ok($$ select testes.gravar(testes.ev('e1', 'bia')) $$, 'P0001', 'sem_permissao',
  'o mesmo id na agenda de outra pessoa é recusado');

-- ── Editar não ressuscita nem troca o consultor ──────────────────────────────
select throws_ok($$ select testes.gravar(testes.ev('fantasma', 'ana'), '{}', '{}', false) $$, 'P0001', 'evento_nao_encontrado',
  'editar evento que não existe (apagado no meio do caminho) é recusado');
select throws_ok($$ select testes.gravar(testes.ev('e1', 'bia'), '{}', '{}', false) $$, 'P0001', 'evento_nao_encontrado',
  'editar não troca o consultor');
select is((select consultor_id from public.agenda_eventos where id = testes.id('e1')), testes.id('ana'), 'o consultor ficou');

select * from finish();
rollback;
