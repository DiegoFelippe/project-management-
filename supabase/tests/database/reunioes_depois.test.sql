-- Depois da reunião (só a Edge Function reunioes-depois e o pg_cron chamam): histórico com os tipos novos, uma rotina
-- por vez, uma busca por reunião (reservas, com o recorte por consultorias dos testes, o espaçamento das buscas e a
-- janela de 48 h; reunião sem cliente fica fora), a pasta da reunião (uma por reunião, nome repetido com " (2)"), a
-- troca para "pasta_criada" com o histórico uma vez só, o segredo no Vault e o pg_cron a cada 10 minutos.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

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

-- Reunião da Ana (com o cliente k, se pedido), que termina p_fim a partir de agora.
create function testes.reuniao(p_nome text, p_fim interval, p_meet boolean default true, p_cliente boolean default true,
  p_reuniao text default 'agendada') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet,
    meet_codigo, reuniao)
  values (testes.id('A'), testes.id('ana'), case when p_cliente then testes.id('k') end, 'Reunião ' || p_nome,
    now() + p_fim - interval '1 hour', now() + p_fim, p_meet, case when p_meet then 'abc-defg-hij' end, p_reuniao)
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

select testes.consultoria('A');
select testes.perfil('ana', 'pessoa', 'A');
insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
values ('Cliente k', 10, testes.id('A'), testes.id('ana'));
insert into testes.fx select 'k', id from public.clientes where nome = 'Cliente k' and consultoria_id = testes.id('A');

select testes.reuniao('terminada', interval '-1 hour');
select testes.reuniao('aguardando', interval '-2 hours', p_reuniao => 'aguardando');
select testes.reuniao('futura', interval '1 hour');
select testes.reuniao('sem_meet', interval '-1 hour', p_meet => false);
select testes.reuniao('fechada', interval '-1 hour', p_reuniao => 'sem_artefatos');
select testes.reuniao('sem_cliente', interval '-1 hour', p_cliente => false);
select testes.reuniao('outra', interval '-3 hours');
select testes.reuniao('velha', interval '-50 hours');
select testes.reuniao('velha_aguardando', interval '-50 hours', p_reuniao => 'aguardando');

-- Outra consultoria, com uma reunião terminada que espera.
select testes.consultoria('B');
select testes.perfil('bia', 'pessoa', 'B');
insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
values ('Cliente kb', 10, testes.id('B'), testes.id('bia'));
insert into testes.fx select 'kb', id from public.clientes where nome = 'Cliente kb' and consultoria_id = testes.id('B');
with e as (
  insert into public.agenda_eventos (consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet, meet_codigo)
  values (testes.id('B'), testes.id('bia'), testes.id('kb'), 'Reunião da B', now() - interval '2 hours',
    now() - interval '1 hour', true, 'bbb-cccc-ddd')
  returning id)
insert into testes.fx select 'deB', id from e;

-- Há reunião de verdade (fora deste teste) terminada, com Meet e cliente, esperando no banco local?
create function testes.ha_reuniao_de_fora() returns boolean language sql stable as $$
  select exists (select 1 from public.agenda_eventos e
    where e.reuniao in ('agendada', 'aguardando') and e.meet_codigo is not null and e.cliente_id is not null
      and e.fim <= now() and e.id not in (select id from testes.fx))
$$;

-- ── Quem chama ───────────────────────────────────────────────────────────────
select ok(not exists (
  select 1 from unnest(array[
    'public.reunioes_comecar_rotina(int)', 'public.reunioes_terminar_rotina(uuid)',
    'public.reunioes_reservar(uuid, uuid, int, int, uuid[])', 'public.reunioes_liberar(uuid, uuid, timestamptz)',
    'public.pasta_da_reuniao(uuid, text)', 'public.concluir_reuniao(uuid, uuid, text)',
    'public.segredo_da_rotina_das_reunioes()', 'private.chamar_reunioes_depois()']::regprocedure[]) f
  where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')
), 'o navegador (logado ou não) não chama nenhuma função da rotina, nem lê o segredo');
select ok((
  select bool_and(has_function_privilege('service_role', f, 'execute')) from unnest(array[
    'public.reunioes_comecar_rotina(int)', 'public.reunioes_terminar_rotina(uuid)',
    'public.reunioes_reservar(uuid, uuid, int, int, uuid[])', 'public.reunioes_liberar(uuid, uuid, timestamptz)',
    'public.pasta_da_reuniao(uuid, text)', 'public.concluir_reuniao(uuid, uuid, text)',
    'public.segredo_da_rotina_das_reunioes()']::regprocedure[]) f
), 'a Edge Function (service_role) chama');
select ok(not has_function_privilege('service_role', 'private.chamar_reunioes_depois()', 'execute'),
  'chamar a função pelo pg_net é só do pg_cron');
select ok(not has_table_privilege('authenticated', 'private.reunioes_na_rotina', 'select')
  and not has_table_privilege('authenticated', 'private.rotina_das_reunioes', 'select'),
  'as reservas não aparecem para o navegador');

-- ── Histórico ────────────────────────────────────────────────────────────────
select lives_ok($$ insert into public.cliente_eventos (cliente_id, tipo) values
  (testes.id('k'), 'reuniao_realizada'), (testes.id('k'), 'pasta_da_reuniao_criada') $$,
  'o histórico aceita "Reunião realizada" e "Pasta da reunião criada"');
select throws_ok($$ insert into public.cliente_eventos (cliente_id, tipo) values (testes.id('k'), 'outro') $$,
  '23514', null, 'e continua recusando tipo desconhecido');
delete from public.cliente_eventos where cliente_id = testes.id('k') and tipo in ('reuniao_realizada', 'pasta_da_reuniao_criada');

-- ── Uma rotina por vez ───────────────────────────────────────────────────────
-- Começa do zero dentro do teste (uma rotina de verdade rodando agora não atrapalha; tudo volta no rollback).
update private.rotina_das_reunioes set dono = null, rodando_ate = null;
create table testes.vez (nome text primary key, dono uuid);
insert into testes.vez values ('primeira', public.reunioes_comecar_rotina(9));
select isnt((select dono from testes.vez where nome = 'primeira'), null, 'a primeira rotina pega a vez');
select is(public.reunioes_comecar_rotina(9), null, 'a segunda, ao mesmo tempo, fica de fora');
select public.reunioes_terminar_rotina(gen_random_uuid());
select is(public.reunioes_comecar_rotina(9), null, 'quem não tem a vez não a devolve');
select public.reunioes_terminar_rotina((select dono from testes.vez where nome = 'primeira'));
insert into testes.vez values ('segunda', public.reunioes_comecar_rotina(9));
select isnt((select dono from testes.vez where nome = 'segunda'), null, 'devolvida a vez, a próxima rotina roda');
update private.rotina_das_reunioes set rodando_ate = now() - interval '1 minute';
select isnt(public.reunioes_comecar_rotina(9), null, 'a vez de uma rotina que parou no meio vence sozinha');

-- ── Reservas ─────────────────────────────────────────────────────────────────
-- Os donos: d1, d2... são rotinas (ou cliques em "Buscar agora") diferentes.
create function testes.dono(p_n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(p_n::text, 2, '0'))::uuid
$$;
create function testes.reservar(p_dono int) returns uuid[] language sql as $$
  select public.reunioes_reservar(testes.dono(p_dono), null, 50, 5, array[testes.id('A')])
$$;
create table testes.lote (nome text primary key, ids uuid[]);
insert into testes.lote values ('r1', testes.reservar(1));
select ok(testes.id('terminada') = any (ids) and testes.id('aguardando') = any (ids) and testes.id('outra') = any (ids)
    and testes.id('velha_aguardando') = any (ids),
  'a rotina pega as reuniões terminadas, com Meet e cliente, que esperam (a aguardando passa das 48 h)')
from testes.lote where nome = 'r1';
select ok(not (testes.id('futura') = any (ids)) and not (testes.id('sem_meet') = any (ids))
    and not (testes.id('fechada') = any (ids)),
  'e não pega a que não terminou, a sem Meet nem a que já fechou')
from testes.lote where nome = 'r1';
select ok(not (testes.id('sem_cliente') = any (ids)), 'reunião sem cliente fica fora da rotina')
from testes.lote where nome = 'r1';
select ok(not (testes.id('velha') = any (ids)),
  'agendada que terminou há mais de 48 h e a rotina nunca olhou fica fora (só "Buscar agora")')
from testes.lote where nome = 'r1';
select ok(not (testes.id('deB') = any (ids)), 'o recorte dos testes deixa de fora as outras consultorias')
from testes.lote where nome = 'r1';
select ok(testes.id('deB') = any (public.reunioes_reservar(testes.dono(9), null, 50, 5)),
  'sem o recorte (o pg_cron), a rotina pega as reuniões de todas as consultorias');
select ok(not (testes.id('terminada') = any (testes.reservar(2))), 'outra rotina ao mesmo tempo não pega as reservadas');
select is(public.reunioes_reservar(testes.dono(2), testes.id('terminada')), '{}'::uuid[],
  '"Buscar agora" numa reunião que a rotina está buscando: não reserva');
select public.reunioes_liberar(testes.id('terminada'), testes.dono(2));
select is(public.reunioes_reservar(testes.dono(2), testes.id('terminada')), '{}'::uuid[],
  'só quem reservou solta a reunião');
select public.reunioes_liberar(testes.id('terminada'), testes.dono(1));
select ok(not (testes.id('terminada') = any (testes.reservar(3))),
  'olhada agora, só volta na hora marcada (sem hora, daqui a 5 minutos)');
select is(public.reunioes_reservar(testes.dono(3), testes.id('terminada')), array[testes.id('terminada')],
  'mas "Buscar agora" pega na hora');
select public.reunioes_liberar(testes.id('terminada'), testes.dono(3), now() - interval '1 minute');
select ok(not (testes.id('terminada') = any (testes.reservar(3))), 'deu a hora, mas na mesma rotina não volta');
select ok(testes.id('terminada') = any (testes.reservar(5)), 'na rotina seguinte, volta');
select public.reunioes_liberar(testes.id('terminada'), testes.dono(5), now() + interval '1 hour');
select is((select proxima_em from private.reunioes_na_rotina where evento_id = testes.id('terminada')),
  now() + interval '1 hour', 'a hora de olhar de novo é a que a Edge Function mandou');
select ok(not (testes.id('terminada') = any (testes.reservar(6))), 'e antes dela a rotina não pega');
update private.reunioes_na_rotina set reservada_ate = now() - interval '1 minute' where evento_id = testes.id('aguardando');
select ok(testes.id('aguardando') = any (testes.reservar(4)),
  'a reserva de quem parou no meio (nunca soltou) vence sozinha e a reunião volta');
select is((select dono from private.reunioes_na_rotina where evento_id = testes.id('aguardando')),
  testes.dono(4), 'e passa para quem pegou agora');
update public.agenda_eventos set reuniao = 'sem_artefatos' where id = testes.id('velha_aguardando');
select public.reunioes_liberar(testes.id('velha_aguardando'), testes.dono(1), now() - interval '1 minute');
select is((select proxima_em from private.reunioes_na_rotina where evento_id = testes.id('velha_aguardando')), null,
  'reunião que não espera mais sai da rotina');
select throws_ok($$ select public.reunioes_reservar(null) $$, '22023', null, 'reserva sem dono é recusada');

-- ── Pasta da reunião ─────────────────────────────────────────────────────────
insert into testes.fx values ('p1', public.pasta_da_reuniao(testes.id('terminada'), 'Reunião 20/11/2026 14:00 — Kickoff'));
select results_eq(
  $$ select nome, cliente_id, consultoria_id, evento_id, criada_por from public.cliente_pastas where id = testes.id('p1') $$,
  $$ values ('Reunião 20/11/2026 14:00 — Kickoff', testes.id('k'), testes.id('A'), testes.id('terminada'), null::uuid) $$,
  'a pasta nasce no cliente do evento, com a consultoria dele, ligada à reunião e sem autor');
select is(public.pasta_da_reuniao(testes.id('terminada'), 'Outro nome'), testes.id('p1'),
  'pedir de novo devolve a mesma pasta (uma por reunião)');
insert into testes.fx values ('p2', public.pasta_da_reuniao(testes.id('outra'), 'reunião 20/11/2026 14:00 — KICKOFF'));
select is((select nome from public.cliente_pastas where id = testes.id('p2')), 'reunião 20/11/2026 14:00 — KICKOFF (2)',
  'nome que já existe no cliente (sem diferenciar maiúsculas) ganha " (2)"');
select throws_ok($$ insert into public.cliente_pastas (cliente_id, nome, evento_id)
  values (testes.id('k'), 'Pasta solta', testes.id('terminada')) $$, '23505', null,
  'o banco não deixa duas pastas para a mesma reunião');
insert into testes.fx values ('p3', public.pasta_da_reuniao(testes.id('aguardando'), repeat('x', 200)));
insert into testes.fx values ('p4', public.pasta_da_reuniao(testes.id('fechada'), repeat('x', 200)));
select is((select char_length(nome) from public.cliente_pastas where id = testes.id('p4')), 120,
  'com o " (2)", o nome continua cabendo em 120 caracteres');
select is((select right(nome, 4) from public.cliente_pastas where id = testes.id('p4')), ' (2)', 'e termina com " (2)"');
select throws_ok($$ select public.pasta_da_reuniao(testes.id('sem_cliente'), 'Reunião interna') $$, 'P0001',
  'reuniao_sem_cliente', 'reunião sem cliente não tem pasta');
select throws_ok($$ select public.pasta_da_reuniao(testes.id('outra'), '  ') $$, '22023', null, 'nome vazio é recusado');

-- ── Concluir ─────────────────────────────────────────────────────────────────
select ok(public.concluir_reuniao(testes.id('terminada'), testes.id('p1'), 'https://drive.google.com/file/d/x/view'),
  'concluir a reunião com a pasta pronta');
select results_eq(
  $$ select reuniao, reuniao_erro, pasta_id, gravacao_url from public.agenda_eventos where id = testes.id('terminada') $$,
  $$ values ('pasta_criada', null::text, testes.id('p1'), 'https://drive.google.com/file/d/x/view') $$,
  'a reunião fica com "pasta_criada", a pasta e o link da gravação');
select results_eq(
  $$ select tipo, autor, em = (select fim from public.agenda_eventos where id = testes.id('terminada'))
     from public.cliente_eventos where cliente_id = testes.id('k')
       and tipo in ('reuniao_realizada', 'pasta_da_reuniao_criada') order by tipo $$,
  $$ values ('pasta_da_reuniao_criada', null::uuid, false), ('reuniao_realizada', testes.id('ana'), true) $$,
  'o histórico ganha "Reunião realizada" (no fim, pela organizadora) e "Pasta da reunião criada"');
select ok(not public.concluir_reuniao(testes.id('terminada'), testes.id('p1'), null), 'concluir de novo não faz nada');
select is((select count(*) from public.cliente_eventos where cliente_id = testes.id('k')
    and tipo in ('reuniao_realizada', 'pasta_da_reuniao_criada')), 2::bigint,
  'e o histórico não repete');
select ok(not public.concluir_reuniao(testes.id('sem_cliente'), testes.id('p1'), null), 'sem cliente, não conclui');

-- ── Segredo e pg_cron ────────────────────────────────────────────────────────
select ok((select decrypted_secret ~ '^[0-9a-f]{64}$' from vault.decrypted_secrets where name = 'reunioes_depois_segredo'),
  'o segredo da rotina está no Vault (aleatório, 32 bytes)');
select is(public.segredo_da_rotina_das_reunioes(),
  (select decrypted_secret from vault.decrypted_secrets where name = 'reunioes_depois_segredo'),
  'a Edge Function lê o mesmo segredo');
select ok((select decrypted_secret like '%/functions/v1/reunioes-depois' from vault.decrypted_secrets
  where name = 'reunioes_depois_url'), 'o endereço da função também está no Vault');
select results_eq(
  $$ select schedule, command, active from cron.job where jobname = 'reunioes-depois' $$,
  $$ values ('*/10 * * * *'::text, 'select private.chamar_reunioes_depois()'::text, true) $$,
  'o pg_cron chama a rotina a cada 10 minutos (um job só)');
create table testes.pedido (id bigint);
insert into testes.pedido select private.chamar_reunioes_depois();
select isnt((select id from testes.pedido), null, 'com reunião esperando, o pg_cron chama a função');
select results_eq(
  $$ select q.url, q.headers ->> 'x-rotina-segredo', q.method::text from net.http_request_queue q
     where q.id = (select id from testes.pedido) $$,
  $$ select (select decrypted_secret collate "default" from vault.decrypted_secrets where name = 'reunioes_depois_url'),
       (select decrypted_secret collate "default" from vault.decrypted_secrets where name = 'reunioes_depois_segredo'),
       'POST' $$,
  'pelo pg_net, no endereço do Vault e com o segredo no cabeçalho');
-- Ficam esperando só a sem cliente e a agendada de mais de 48 h: a rotina não tem o que fazer com elas.
update public.agenda_eventos set reuniao = 'sem_artefatos'
where id in (testes.id('aguardando'), testes.id('outra'), testes.id('deB'));
select ok(
  case when testes.ha_reuniao_de_fora()
    then true  -- há reunião de verdade esperando no banco local: não dá para conferir o "não chama"
    else private.chamar_reunioes_depois() is null end,
  'sem reunião que a rotina pegaria (a sem cliente e a agendada de mais de 48 h não contam), nem chama');

-- ── Índices ──────────────────────────────────────────────────────────────────
select ok((select indisunique from pg_index where indexrelid = 'public.cliente_pastas_uma_por_evento_idx'::regclass),
  'uma pasta por reunião, pelo índice único');
select ok(to_regclass('public.cliente_pastas_evento_idx') is null, 'o índice comum de evento_id saiu (o único serve à FK)');
select is((select pg_get_indexdef('public.agenda_eventos_reuniao_nova_idx'::regclass) like '%(fim)%WHERE%cliente_id%'), true,
  'a rotina acha as reuniões que ainda não olhou por índice');
select is((select pg_get_indexdef('private.reunioes_na_rotina_proxima_idx'::regclass) like '%(proxima_em)%WHERE%'), true,
  'e as que deram a hora de olhar de novo também');
select ok(to_regclass('public.agenda_eventos_reuniao_a_buscar_idx') is null, 'o índice antigo da rotina saiu');

select * from finish();
rollback;
