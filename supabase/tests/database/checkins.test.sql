-- Check-ins: o consultor do cliente registra o trabalho; o check-in fica com quem trabalhou e com a
-- consultoria daquele momento. E o que acontece quando alguém sai (troca de consultor, cliente movido ou
-- arquivado, consultor desativado ou fora da consultoria, consultoria arquivada). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

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

-- Começo do mês atual no horário de São Paulo. Nas primeiras horas do mês, os check-ins do teste (de até
-- 5 horas atrás) caem no mês passado: aí o teste do realizado é pulado.
create function testes.inicio_do_mes() returns timestamptz language sql stable as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

create function testes.comeco_do_mes() returns boolean language sql stable as $$
  select now() < testes.inicio_do_mes() + interval '5 hours'
$$;

-- Cenário: tudo na consultoria A, menos admin_b. Cada consultor tem os próprios check-ins (os de um mesmo
-- consultor não podem se sobrepor, e cada fechamento automático acontece em now()).
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a2', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('pessoa_a3', 'pessoa', 'A');
select testes.perfil('pessoa_a4', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.time('time_a', 'A', 'gestor_a2');
insert into public.time_membros (time_id, pessoa_id) values
  (testes.id('time_a'), testes.id('pessoa_a')),
  (testes.id('time_a'), testes.id('pessoa_a2')),
  (testes.id('time_a'), testes.id('pessoa_a3'));
select testes.cliente('c1', 'A', 'pessoa_a2');
select testes.cliente('c2', 'A', 'pessoa_a2');
select testes.cliente('c_troca', 'A', 'pessoa_a3');
select testes.cliente('c_mov', 'A', 'admin_a');
select testes.cliente('c_arq', 'A', 'gestor_a2');
select testes.cliente('c_esq', 'A', 'pessoa_a4');
select testes.cliente('c_vazio', null, null);
insert into testes.fx
select n, gen_random_uuid()
from unnest(array['k1', 'k2', 'k3', 'k_prev', 'k_g', 'k_troca', 'k_mov', 'k_arq', 'k_esq', 'k_a']) n;

-- ── Check-in e check-out ─────────────────────────────────────────────────────

select testes.como('pessoa_a2');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio)
    values (testes.id('k1'), testes.id('c1'), now() - interval '2 hours')$$,
  'a consultora faz check-in no cliente dela');
select is((select consultoria_id from public.checkins where id = testes.id('k1')), testes.id('A'),
  'o check-in guarda a consultoria do cliente');
select throws_ok($$insert into public.checkins (cliente_id, inicio) values (testes.id('c2'), now() - interval '30 minutes')$$,
  '23P01', null, 'só um check-in aberto por vez');
select throws_ok($$update public.checkins set fim = now() - interval '1 hour' where id = testes.id('k1')$$,
  '23514', null, 'check-out sem descrição é recusado');
select lives_ok($$update public.checkins set fim = now() - interval '1 hour', descricao = 'Implantação do módulo financeiro'
    where id = testes.id('k1')$$,
  'check-out com a descrição');
select throws_ok($$insert into public.checkins (cliente_id, inicio) values (testes.id('c1'), now() + interval '10 minutes')$$,
  'P0001', 'checkin_no_futuro', 'check-in no futuro é recusado');
select throws_ok($$update public.checkins set fim = now() + interval '2 hours' where id = testes.id('k1')$$,
  'P0001', 'checkin_no_futuro', 'fim no futuro também é recusado ao editar');
select throws_ok($$insert into public.checkins (cliente_id, inicio, fim, descricao)
    values (testes.id('c1'), now() - interval '90 minutes', now() - interval '75 minutes', 'Sobreposto')$$,
  '23P01', null, 'check-in sobreposto a um fechado é recusado');
select throws_ok($$insert into public.checkins (cliente_id, inicio, fim, descricao)
    values (testes.id('c1'), now() - interval '60 hours', now() - interval '35 hours', 'Longo demais')$$,
  '23514', null, 'check-in de 25 horas é recusado');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio, fim, descricao)
    values (testes.id('k2'), testes.id('c1'), now() - interval '5 hours', now() - interval '210 minutes', 'Treinamento da equipe')$$,
  'lançar depois: um período passado de 1 h 30');
-- 1 hora antes da meia-noite do dia 1 em São Paulo: no mês atual em UTC, no mês passado em São Paulo.
select case when testes.comeco_do_mes() then skip('primeiras horas do mês: o teste do realizado é pulado', 1)
  else lives_ok($$insert into public.checkins (id, cliente_id, inicio, fim, descricao)
      values (testes.id('k_prev'), testes.id('c1'), testes.inicio_do_mes() - interval '2 hours',
        testes.inicio_do_mes() - interval '1 hour', 'Fim do mês passado')$$,
    'check-in na última hora antes da virada do mês em São Paulo') end;
select lives_ok($$insert into public.checkins (id, cliente_id, inicio, fim, descricao)
    values (testes.id('k_g'), testes.id('c1'), now() - interval '60 minutes', now() - interval '40 minutes', 'Ajuste de cadastro')$$,
  'outro check-in fechado, colado no fim do primeiro');
select throws_ok($$update public.checkins set cliente_id = testes.id('c2') where id = testes.id('k1')$$,
  '42501', null, 'o check-in não muda de cliente');
reset role;

select testes.como('pessoa_a');
select throws_ok($$insert into public.checkins (cliente_id, inicio) values (testes.id('c1'), now() - interval '3 hours')$$,
  'P0001', 'checkin_sem_cliente', 'quem não é o consultor do cliente não faz check-in nele');
select is((select count(*) from public.checkins where id in (select id from testes.fx)), 0::bigint,
  'pessoa da consultoria não vê os check-ins de outra consultora');
reset role;

-- ── Quem corrige e quem vê ───────────────────────────────────────────────────

select testes.como('gestor_a2');
select is((select count(*) from public.checkins where id in (testes.id('k1'), testes.id('k2'), testes.id('k_g'))), 3::bigint,
  'gestor da consultoria vê os check-ins da equipe');
with u as (
  update public.checkins set fim = now() - interval '30 minutes', descricao = 'Ajuste de cadastro (corrigido)'
  where id = testes.id('k_g') returning 1
)
select is(count(*), 1::bigint, 'gestor da consultoria corrige o check-in da consultora') from u;
with d as (delete from public.checkins where id = testes.id('k_g') returning 1)
select is(count(*), 1::bigint, 'gestor da consultoria apaga o check-in da consultora') from d;
reset role;

select testes.como('admin_b');
select is((select count(*) from public.checkins where id in (select id from testes.fx)), 0::bigint,
  'outra consultoria não vê os check-ins');
reset role;

select testes.como('central');
select is((select count(*) from public.checkins where id in (testes.id('k1'), testes.id('k2'))), 2::bigint,
  'a central vê os check-ins de todas as consultorias');
with u as (update public.checkins set descricao = 'Mudado pela central' where id = testes.id('k1') returning 1)
select is(count(*), 0::bigint, 'a central só vê: não corrige check-ins') from u;
select throws_ok($$insert into public.checkins (cliente_id, inicio) values (testes.id('c1'), now() - interval '3 hours')$$,
  'P0001', 'checkin_sem_cliente', 'a central não faz check-in');
reset role;

-- ── Realizado no mês ─────────────────────────────────────────────────────────

select testes.como('pessoa_a2');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio) values (testes.id('k3'), testes.id('c2'), now() - interval '20 minutes')$$,
  'a consultora abre um check-in em outro cliente dela');
reset role;

create temp table linha_c1 (c public.clientes);
insert into linha_c1 select c from public.clientes c where c.id = testes.id('c1');
grant select on linha_c1 to authenticated;

select testes.como('gestor_a2');
select case when testes.comeco_do_mes() then skip('primeiras horas do mês', 1)
  else is((select public.realizado_no_mes(c) from public.clientes c where c.id = testes.id('c1')), 2.5,
    'realizado de c1 no mês: 1 h + 1 h 30 (o do mês passado em São Paulo e o apagado não contam)') end;
select is((select public.realizado_no_mes(c) from public.clientes c where c.id = testes.id('c2')), 0::numeric,
  'check-in aberto não entra no realizado');
reset role;

select testes.como('admin_b');
select is((select public.realizado_no_mes(l.c) from linha_c1 l), 0::numeric,
  'outra consultoria não soma as horas de c1 (cada um soma só os check-ins que enxerga)');
reset role;

-- ── O check-in continua de quem trabalhou ────────────────────────────────────

select testes.como('gestor_a2');
select lives_ok($$update public.clientes set consultor_id = testes.id('pessoa_a') where id = testes.id('c1')$$,
  'gestor troca a consultora de c1');
reset role;

select testes.como('pessoa_a2');
select is((select count(*) from public.checkins where id in (testes.id('k1'), testes.id('k2'))), 2::bigint,
  'a consultora antiga continua vendo os check-ins dela em c1');
select is((select count(*) from public.clientes where id = testes.id('c1')), 0::bigint,
  'mas não vê mais o cliente c1');
select is((select (public.cliente_do_checkin(k)).nome from public.checkins k where k.id = testes.id('k1')), 'Cliente c1',
  'cliente_do_checkin mostra o nome de c1 no check-in dela');
select ok((select r.id = testes.id('c1') and r.horas_mes is null and r.consultoria_id is null
    from public.checkins k, public.cliente_do_checkin(k) r where k.id = testes.id('k1')),
  'cliente_do_checkin devolve só o id e o nome do cliente');
with u as (
  update public.checkins set descricao = 'Implantação do módulo financeiro e do estoque'
  where id = testes.id('k1') returning 1
)
select is(count(*), 1::bigint, 'ela ainda corrige o check-in dela') from u;
select throws_ok($$update public.checkins set fim = null where id = testes.id('k1')$$,
  'P0001', 'checkin_sem_cliente', 'mas não reabre check-in de cliente que não é mais dela');
reset role;

create temp table forjado (k public.checkins);
insert into forjado select k from public.checkins k where k.id = testes.id('k1');
grant select on forjado to authenticated;
select testes.como('admin_b');
select is((select count(*) from forjado f, public.cliente_do_checkin(f.k)), 0::bigint,
  'outra consultoria não descobre o cliente pelo check-in');
reset role;

-- ── Check-in aberto quando o cliente troca de consultor, muda de consultoria ou é arquivado ──

select testes.como('pessoa_a3');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio) values (testes.id('k_troca'), testes.id('c_troca'), now() - interval '1 hour')$$,
  'pessoa_a3 abre check-in em c_troca');
reset role;
select testes.como('gestor_a2');
update public.clientes set consultor_id = testes.id('pessoa_a') where id = testes.id('c_troca');
reset role;
select ok((select fim = now() and descricao = 'Encerrado ao trocar o consultor' from public.checkins where id = testes.id('k_troca')),
  'trocar o consultor fecha o check-in aberto com a nota');

select testes.como('pessoa_a4');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio, descricao)
    values (testes.id('k_esq'), testes.id('c_esq'), now() - interval '30 hours', 'Levantamento inicial')$$,
  'check-in aberto há 30 horas (o check-out ficou esquecido)');
reset role;
select testes.como('gestor_a2');
select lives_ok($$update public.clientes set consultor_id = null where id = testes.id('c_esq')$$,
  'gestor tira a consultora mesmo com o check-in aberto há mais de 24 horas');
reset role;
select ok((select fim = inicio + interval '24 hours' and descricao = 'Levantamento inicial'
    from public.checkins where id = testes.id('k_esq')),
  'o check-in fecha com 24 horas e guarda a descrição que já tinha');

select testes.como('admin_a');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio) values (testes.id('k_mov'), testes.id('c_mov'), now() - interval '1 hour')$$,
  'admin_a abre check-in em c_mov');
reset role;
select testes.como('central');
select lives_ok($$update public.clientes set consultoria_id = testes.id('B') where id = testes.id('c_mov')$$,
  'central move c_mov para a consultoria B com o check-in aberto');
reset role;
select ok((select fim = now() and descricao = 'Encerrado ao mover o cliente' and consultoria_id = testes.id('A')
    from public.checkins where id = testes.id('k_mov')),
  'mover fecha o check-in aberto com a nota, e ele continua da consultoria A');
select testes.como('admin_b');
select is((select count(*) from public.checkins where cliente_id = testes.id('c_mov')), 0::bigint,
  'a consultoria nova não vê os check-ins da antiga');
reset role;

select testes.como('gestor_a2');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio) values (testes.id('k_arq'), testes.id('c_arq'), now() - interval '1 hour')$$,
  'gestor_a2 abre check-in no cliente dela');
reset role;
select testes.como('central');
update public.clientes set arquivado_em = now() where id = testes.id('c_arq');
reset role;
select ok((select fim = now() and descricao = 'Encerrado ao arquivar o cliente' from public.checkins where id = testes.id('k_arq')),
  'arquivar fecha o check-in aberto com a nota');
select testes.como('gestor_a2');
select throws_ok($$insert into public.checkins (cliente_id, inicio, fim, descricao)
    values (testes.id('c_arq'), now() - interval '3 hours', now() - interval '2 hours', 'Depois de arquivado')$$,
  'P0001', 'checkin_sem_cliente', 'não faz check-in em cliente arquivado');
reset role;

-- ── Quando alguém sai ────────────────────────────────────────────────────────
-- As mudanças abaixo são feitas direto no banco, como as Edge Functions. Os dados de login de gestor_a2
-- ficam nas configurações de propósito: o que o sistema faz não pode depender de quem estava logado.

select testes.como('gestor_a2');
update public.clientes set consultor_id = testes.id('pessoa_a2') where id = testes.id('c1');
reset role;
select lives_ok($$update public.perfis set ativo = false, desativado_em = now() where id = testes.id('pessoa_a2')$$,
  'desativar pessoa_a2');
select is((select count(*) from public.clientes where id in (testes.id('c1'), testes.id('c2')) and consultor_id is null),
  2::bigint, 'os clientes da pessoa desativada voltam a aguardar consultor');
select is((select count(*) from public.cliente_eventos where cliente_id in (testes.id('c1'), testes.id('c2'))
    and tipo = 'consultor_removido' and de_consultor = testes.id('pessoa_a2')), 2::bigint,
  'histórico: consultor_removido nos dois clientes');
select ok((select fim = now() and descricao = 'Encerrado ao trocar o consultor' from public.checkins where id = testes.id('k3')),
  'o check-in aberto da pessoa desativada fecha com a nota');
select is((select count(*) from public.time_membros where pessoa_id = testes.id('pessoa_a2')), 1::bigint,
  'desativar não tira a pessoa dos times');

select lives_ok($$update public.perfis set papel = 'central', consultoria_id = null where id = testes.id('pessoa_a')$$,
  'mover pessoa_a para a central');
select is((select count(*) from public.time_membros where pessoa_id = testes.id('pessoa_a')), 0::bigint,
  'quem vai para a central sai dos times na mesma hora');
select ok((select consultor_id is null from public.clientes where id = testes.id('c_troca')),
  'os clientes de quem vai para a central voltam a aguardar consultor');

update public.perfis set consultoria_id = testes.id('B') where id = testes.id('pessoa_a3');
select is((select count(*) from public.time_membros where pessoa_id = testes.id('pessoa_a3')), 0::bigint,
  'quem muda de consultoria sai dos times da antiga');

select testes.como('gestor_a2');
update public.clientes set consultor_id = testes.id('pessoa_a4') where id = testes.id('c_esq');
reset role;
select testes.como('pessoa_a4');
select lives_ok($$insert into public.checkins (id, cliente_id, inicio) values (testes.id('k_a'), testes.id('c_esq'), now() - interval '1 hour')$$,
  'pessoa_a4 abre check-in em c_esq');
reset role;
select lives_ok($$update public.consultorias set arquivada_em = now() where id = testes.id('A')$$,
  'arquivar a consultoria A');
select is((select count(*) from public.clientes
    where id in (testes.id('c1'), testes.id('c2'), testes.id('c_troca'), testes.id('c_esq'))
      and consultoria_id is null and consultor_id is null), 4::bigint,
  'os clientes ativos de A voltam para a central, sem consultor');
select is((select consultoria_id from public.clientes where id = testes.id('c_arq')), testes.id('A'),
  'o cliente arquivado continua em A');
select is((select count(*) from public.cliente_eventos
    where cliente_id in (testes.id('c1'), testes.id('c2'), testes.id('c_troca'), testes.id('c_esq'))
      and tipo = 'devolvido' and de_consultoria = testes.id('A') and para_consultoria is null), 4::bigint,
  'histórico: devolvido para a central');
select ok((select fim = now() and descricao = 'Encerrado ao mover o cliente' from public.checkins where id = testes.id('k_a')),
  'arquivar a consultoria fecha o check-in aberto');

-- ── Apagar cliente ───────────────────────────────────────────────────────────

select testes.como('central');
select throws_ok($$delete from public.clientes where id = testes.id('c1')$$,
  '23503', null, 'a central não apaga cliente com check-ins');
with d as (delete from public.clientes where id = testes.id('c_vazio') returning 1)
select is(count(*), 1::bigint, 'a central apaga cliente sem check-ins') from d;
reset role;

-- ── Índices ──────────────────────────────────────────────────────────────────

select has_index('public', 'checkins', 'checkins_cliente_idx', 'Check-ins do cliente por início');
select has_index('public', 'checkins', 'checkins_consultor_idx', 'Check-ins do consultor por início');
select has_index('public', 'checkins', 'checkins_consultoria_idx', 'Check-ins da consultoria por início');

select * from finish();
rollback;
