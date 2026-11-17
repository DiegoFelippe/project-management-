-- Cartões de números das telas (abaixo da barra de filtros): uma função por tela, contada no banco, no recorte de quem
-- vê (o mesmo da lista da tela). Uma consultoria nunca conta a outra. Também a busca de Times sem acento (nome_busca).
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(102);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text, p_carga numeric default 44,
  p_ativo boolean default true, p_criado_por text default null)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@cartoes.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, carga_semanal, ativo, criado_por)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@cartoes.test', p_papel, p_carga, p_ativo,
    testes.id(p_criado_por));
  return v;
end $$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Cartões Teste ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- p_desde: há quantos dias o consultor está com o cliente (o gatilho grava "agora").
create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text,
  p_desde int default 40, p_arquivado boolean default false)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, p_horas, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  if p_consultor is not null then
    update public.clientes set consultor_desde = now() - make_interval(days => p_desde) where id = v;
  end if;
  if p_arquivado then update public.clientes set arquivado_em = now() where id = v; end if;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Chama a função como a pessoa e volta a ser o dono do banco (para os testes compararem com consultas diretas).
create function testes.ver(p_nome text, p_chamada text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform testes.como(p_nome);
  execute 'select ' || p_chamada into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function testes.n(p jsonb, p_chave text) returns numeric language sql immutable as $$
  select (p ->> p_chave)::numeric
$$;

-- novembro/2037: 19 dias úteis x 44 h / 5 = 167,2 (mês futuro: ocupação pelo reservado). outubro/2026: passado.
create function testes.futuro() returns date language sql immutable as $$ select date '2037-11-01' $$;
create function testes.passado() returns date language sql immutable as $$ select date '2026-10-01' $$;

-- Todas as consultorias de consultorias_por_ocupacao (50 por vez), para comparar sem depender do banco.
create function testes.todas_consultorias(p_mes date)
returns table (id uuid, consultores int, ocupacao numeric)
language sql stable as $$
  select c.id, c.consultores, c.ocupacao
  from generate_series(0, 5000, 50) o
  cross join lateral public.consultorias_por_ocupacao(null, 50, o, p_mes) c
$$;

-- A coluna Consultores (soma) e a média da coluna Ocupação da tabela "Ocupação do mês", lidas como a central.
create function testes.coluna_das_consultorias(p_mes date) returns jsonb language sql as $$
  select testes.ver('central', format(
    '(select jsonb_build_object(''consultores'', coalesce(sum(c.consultores), 0), ''media'', round(avg(c.ocupacao), 4)) '
    'from testes.todas_consultorias(%L) c)', p_mes))
$$;

select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('dono', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_c', 'pessoa', 'A', 44, true, 'gestor_a');
select testes.perfil('pessoa_d', 'pessoa', 'A');
select testes.perfil('zero_a', 'pessoa', 'A', 0);
select testes.perfil('inativo_a', 'pessoa', 'A', 44, false);
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
update public.perfis set tipos_de_consultoria = '{gestao}' where id = testes.id('pessoa_a');

-- Times: T1 do gestor_a com pessoa_a; T2 do admin_a sem ninguém; TB da B com pessoa_b.
insert into public.times (consultoria_id, nome, gestor_id) values
  (testes.id('A'), 'Implantação Cartões', testes.id('gestor_a')),
  (testes.id('A'), 'Suporte Cartões', testes.id('admin_a')),
  (testes.id('B'), 'Time B Cartões', testes.id('admin_b'));
insert into testes.fx select 'T1', id from public.times where nome = 'Implantação Cartões';
insert into testes.fx select 'T2', id from public.times where nome = 'Suporte Cartões';
insert into testes.fx select 'TB', id from public.times where nome = 'Time B Cartões';
insert into public.time_membros (time_id, pessoa_id) values
  (testes.id('T1'), testes.id('pessoa_a')), (testes.id('TB'), testes.id('pessoa_b'));

-- Clientes da A: a40 e pouco (pessoa_a, com check-in agora), c200 (pessoa_c, sem check-in há 40 dias),
-- c_novo (pessoa_c desde hoje), sem_a (aguardando consultor), arq_a e arq_a2 (arquivados). B: b10 e sem_b. Central: dist.
select testes.cliente('a40', 40, 'A', 'pessoa_a');
select testes.cliente('pouco', 0.1, 'A', 'pessoa_a');
select testes.cliente('c200', 200, 'A', 'pessoa_c');
select testes.cliente('c_novo', 10, 'A', 'pessoa_c', 0);
select testes.cliente('sem_a', 25, 'A', null);
select testes.cliente('arq_a', 15, 'A', null, 40, true);
select testes.cliente('arq_a2', 15, 'A', 'pessoa_a', 40, true);
select testes.cliente('b10', 10, 'B', 'pessoa_b');
select testes.cliente('sem_b', 12, 'B', null);
-- mudou: estava na A (check-in de 1 h da pessoa_a) e passou para a B no mesmo mês (meia hora da pessoa_b). Previsão
-- 1 h: só somando as duas consultorias passaria; a B não vê as horas da A.
select testes.cliente('mudou', 1, 'B', 'pessoa_b', 0);
select testes.cliente('dist', 8, null, null);

-- Check-ins em horas fixas do mês corrente (início do mês em SP + 1 h…), seja qual for a hora em que o teste roda.
-- Gravados direto, sem o gatilho de validação (que exige ser quem atende e proíbe o futuro), só nesta transação de
-- teste. As horas da pessoa_a no mês, na A: a40 1 h + pouco 1 h + mudou 1 h = 3,0 h.
set local session_replication_role = replica;
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select testes.id(x.cliente), testes.id(x.consultor), testes.id(x.consultoria), m.ini + x.de, m.ini + x.ate, 'Atendimento'
from (select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as ini) m
cross join (values
  ('a40', 'pessoa_a', 'A', interval '1 hour', interval '2 hours'),
  ('pouco', 'pessoa_a', 'A', interval '2 hours', interval '3 hours'),
  ('mudou', 'pessoa_a', 'A', interval '3 hours', interval '4 hours'),
  ('mudou', 'pessoa_b', 'B', interval '1 hour', interval '90 minutes')) x(cliente, consultor, consultoria, de, ate);
-- Atividade dentro dos últimos 30 dias em a40 e pouco (de outra pessoa: não mexe nas horas da pessoa_a nem no selo).
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select testes.id(c), testes.id('pessoa_d'), testes.id('A'), now() - interval '5 days' + d, now() - interval '5 days' + d + interval '30 minutes', 'Visita'
from (values ('a40', interval '0 hours'), ('pouco', interval '1 hour')) x(c, d);
set local session_replication_role = origin;

-- Integrações da A: IA conectada (testada em 10/11) e e-mail com erro (testado em 12/11); Google não configurado.
insert into public.integracoes (consultoria_id, tipo, situacao, ultimo_teste_em) values
  (testes.id('A'), 'ia', 'conectada', '2026-11-10 10:00-03'),
  (testes.id('A'), 'smtp', 'com_erro', '2026-11-12 10:00-03');

-- O selo "Passou da previsão" da lista, visto por quem chama: realizado_no_mes roda com o RLS dela (os check-ins que
-- ela enxerga), sobre os clientes ativos que ela vê.
create function testes.selo(p_nome text) returns numeric language sql as $$
  select testes.n(testes.ver(p_nome, '(select jsonb_build_object(''n'', count(*)) from public.clientes c '
    'where not c.arquivado and public.realizado_no_mes(c) > c.horas_mes)'), 'n')
$$;

-- ── Times sem acento ────────────────────────────────────────────────────────
select has_column('public', 'times', 'nome_busca', 'times.nome_busca existe');
select has_index('public', 'times', 'times_nome_busca_idx', 'Times: busca sem acento por trigramas');
select is((select nome_busca from public.times where id = testes.id('T1')), 'implantacao cartoes',
  'nome_busca = nome sem acento e em minúsculas');
select is((select nome from public.times where id = testes.id('T1')), 'Implantação Cartões', 'o nome do time não muda');
select ok(has_column_privilege('authenticated', 'public.times', 'nome_busca', 'select'), 'quem está logado lê nome_busca');
select ok(not has_column_privilege('authenticated', 'public.times', 'nome_busca', 'update'), 'ninguém grava nome_busca');
select is(private.padrao_de_busca('IMPLANTAÇÃO Cartões'), '%implantacao cartoes%', 'o termo da busca sai sem acento');
select testes.como('admin_a');
select is((select count(*) from public.times where nome_busca like '%implantacao cartoes%'),
  1::bigint, 'busca sem acento e sem maiúscula acha o time (no recorte do RLS)');
reset role;
select testes.como('admin_b');
select is((select count(*) from public.times where nome_busca like '%implantacao cartoes%'),
  0::bigint, 'a outra consultoria não acha o time');
reset role;
select set_config('request.jwt.claims', '', true);

-- ── Clientes ────────────────────────────────────────────────────────────────
-- Central com a consultoria A: as quatro situações.
create temp table j as select testes.ver('central', format('public.indicadores_de_clientes(%L)', testes.id('A'))) as v;
select is((select v ->> 'recorte' from j), 'tudo', 'clientes, central: recorte tudo');
select is((select testes.n(v, 'aguardando_consultoria') from j), 0::numeric, 'central + A: nenhum aguardando consultoria (é da central)');
select is((select testes.n(v, 'aguardando_consultor') from j), 1::numeric, 'central + A: 1 aguardando consultor');
select is((select testes.n(v, 'em_atendimento') from j), 4::numeric, 'central + A: 4 em atendimento');
select is((select testes.n(v, 'arquivados') from j), 2::numeric, 'central + A: 2 arquivados');
drop table j;

-- Central sem filtro: as contas do banco inteiro.
create temp table j as select testes.ver('central', 'public.indicadores_de_clientes()') as v;
select is((select testes.n(v, 'aguardando_consultoria') from j),
  (select count(*)::numeric from public.clientes where not arquivado and consultoria_id is null), 'central: aguardando consultoria = sem consultoria');
select is((select testes.n(v, 'aguardando_consultor') from j),
  (select count(*)::numeric from public.clientes where not arquivado and consultoria_id is not null and consultor_id is null),
  'central: aguardando consultor = de consultoria, sem consultor');
select is((select testes.n(v, 'em_atendimento') from j),
  (select count(*)::numeric from public.clientes where not arquivado and consultor_id is not null), 'central: em atendimento = com consultor');
select is((select testes.n(v, 'arquivados') from j),
  (select count(*)::numeric from public.clientes where arquivado), 'central: arquivados');
drop table j;

-- Central com consultoria e consultor; e com "sem consultor".
create temp table j as select testes.ver('central',
  format('public.indicadores_de_clientes(%L, %L)', testes.id('A'), testes.id('pessoa_a'))) as v;
select is((select array[testes.n(v, 'aguardando_consultoria'), testes.n(v, 'aguardando_consultor'), testes.n(v, 'em_atendimento'),
  testes.n(v, 'arquivados')] from j), array[0, 0, 2, 1]::numeric[], 'central + A + pessoa_a: os números seguem o filtro de consultor');
drop table j;
create temp table j as select testes.ver('central', 'public.indicadores_de_clientes(null, null, true)') as v;
select is((select testes.n(v, 'em_atendimento') from j), 0::numeric, 'central + sem consultor: ninguém em atendimento');
select is((select testes.n(v, 'arquivados') from j),
  (select count(*)::numeric from public.clientes where arquivado and consultor_id is null), 'central + sem consultor: arquivados sem consultor');
select is((select testes.n(v, 'aguardando_consultor') from j),
  (select count(*)::numeric from public.clientes where not arquivado and consultoria_id is not null and consultor_id is null),
  'central + sem consultor: aguardando consultor continua');
drop table j;

-- Administrador (e gestor): a consultoria dele, mesmo pedindo outra.
create temp table j as select testes.ver('admin_a', format('public.indicadores_de_clientes(%L)', testes.id('B'))) as v;
select is((select v ->> 'recorte' from j), 'consultoria', 'clientes, administrador: recorte consultoria');
select is((select testes.n(v, 'aguardando_consultor') from j), 1::numeric, 'administrador A: 1 aguardando consultor (pedir a B não muda nada)');
select is((select testes.n(v, 'em_atendimento') from j), 4::numeric, 'administrador A: 4 em atendimento');
select is((select testes.n(v, 'passaram_da_previsao') from j), testes.selo('admin_a'),
  'administrador A: passaram da previsão = clientes com o selo "Passou da previsão" que ele vê na lista');
select is((select testes.n(v, 'passaram_da_previsao') from j), 1::numeric, 'administrador A: só o "pouco" passou da previsão');
select is((select testes.n(v, 'sem_checkin_30_dias') from j), 1::numeric,
  'administrador A: sem check-in há 30 dias = c200 (c_novo chegou hoje; a40 e pouco têm check-in)');
select ok((select not (v ? 'arquivados') and not (v ? 'aguardando_consultoria') from j), 'administrador: sem os números da central');
drop table j;
create temp table j as select testes.ver('gestor_a', 'public.indicadores_de_clientes()') as v;
select is((select array[testes.n(v, 'aguardando_consultor'), testes.n(v, 'em_atendimento'), testes.n(v, 'passaram_da_previsao'),
  testes.n(v, 'sem_checkin_30_dias')] from j), array[1, 4, 1, 1]::numeric[], 'gestor A: os mesmos números da consultoria');
drop table j;
create temp table j as select testes.ver('admin_a', format('public.indicadores_de_clientes(null, %L)', testes.id('pessoa_c'))) as v;
select is((select array[testes.n(v, 'aguardando_consultor'), testes.n(v, 'em_atendimento'), testes.n(v, 'passaram_da_previsao'),
  testes.n(v, 'sem_checkin_30_dias')] from j), array[0, 2, 0, 1]::numeric[], 'administrador A + pessoa_c: os números seguem o consultor');
drop table j;
create temp table j as select testes.ver('admin_a', 'public.indicadores_de_clientes(null, null, true)') as v;
select is((select array[testes.n(v, 'aguardando_consultor'), testes.n(v, 'em_atendimento'), testes.n(v, 'passaram_da_previsao'),
  testes.n(v, 'sem_checkin_30_dias')] from j), array[1, 0, 0, 0]::numeric[], 'administrador A + sem consultor');
drop table j;
create temp table j as select testes.ver('admin_b', 'public.indicadores_de_clientes()') as v;
select is((select array[testes.n(v, 'aguardando_consultor'), testes.n(v, 'em_atendimento'), testes.n(v, 'passaram_da_previsao'),
  testes.n(v, 'sem_checkin_30_dias')] from j), array[1, 2, 0, 1]::numeric[],
  'administrador B: só a B (a A nunca conta); mudou não passou da previsão com as horas da B');
select is((select testes.n(v, 'passaram_da_previsao') from j), testes.selo('admin_b'),
  'administrador B: passaram da previsão = o selo que ele vê (as horas da A não entram)');
drop table j;

-- Consultor: os dele.
create temp table j as select testes.ver('pessoa_a', format('public.indicadores_de_clientes(%L, %L)', testes.id('B'), testes.id('pessoa_b'))) as v;
select is((select v ->> 'recorte' from j), 'pessoa', 'clientes, consultor: recorte pessoa');
select is((select testes.n(v, 'meus_clientes') from j), 2::numeric, 'pessoa_a: 2 clientes ativos (filtros pedidos não valem)');
select is((select testes.n(v, 'passaram_da_previsao') from j), testes.selo('pessoa_a'),
  'pessoa_a: passaram da previsão = os dele com o selo que ele vê');
select is((select testes.n(v, 'passaram_da_previsao') from j), 1::numeric, 'pessoa_a: só o "pouco" passou da previsão');
select is((select testes.n(v, 'horas_no_mes') from j), 3.0,
  'pessoa_a: horas no mês = check-ins fechados dele no mês, na consultoria (inclui o do cliente que foi para a B)');
select is((select testes.n(v, 'sem_checkin_30_dias') from j), 0::numeric, 'pessoa_a: nenhum sem check-in');
drop table j;
create temp table j as select testes.ver('pessoa_c', 'public.indicadores_de_clientes()') as v;
select is((select array[testes.n(v, 'meus_clientes'), testes.n(v, 'passaram_da_previsao'), testes.n(v, 'horas_no_mes'),
  testes.n(v, 'sem_checkin_30_dias')] from j), array[2, 0, 0, 1]::numeric[], 'pessoa_c: 2 clientes, nenhuma hora, c200 sem check-in');
drop table j;
select throws_ok($$ select testes.ver('inativo_a', 'public.indicadores_de_clientes()') $$, 'P0001', 'sem_permissao',
  'clientes: pessoa inativa não recebe números');

-- ── Times ───────────────────────────────────────────────────────────────────
create temp table j as select testes.ver('admin_a', 'public.indicadores_de_times()') as v;
select is((select testes.n(v, 'times') from j), 2::numeric, 'times, administrador A: 2 times');
select is((select testes.n(v, 'pessoas_em_times') from j), 3::numeric, 'administrador A: 3 pessoas em times (gestor_a, admin_a, pessoa_a)');
select is((select testes.n(v, 'pessoas_sem_time') from j), 3::numeric, 'administrador A: pessoa_c, pessoa_d e zero_a sem time (inativo não conta)');
select is((select testes.n(v, 'times_sem_membros') from j), 1::numeric, 'administrador A: T2 sem membros');
drop table j;
create temp table j as select testes.ver('admin_a', format('public.indicadores_de_times(%L)', testes.id('B'))) as v;
select is((select testes.n(v, 'times') from j), 2::numeric, 'administrador A pedindo a B: continua na A');
drop table j;
create temp table j as select testes.ver('gestor_a', 'public.indicadores_de_times()') as v;
select is((select array[testes.n(v, 'times'), testes.n(v, 'pessoas_em_times'), testes.n(v, 'pessoas_sem_time'), testes.n(v, 'times_sem_membros')] from j),
  array[1, 2, 1, 0]::numeric[], 'gestor A: o time dele (T1), 2 pessoas nele, pessoa_c (criada por ele) sem time');
drop table j;
create temp table j as select testes.ver('pessoa_d', 'public.indicadores_de_times()') as v;
select is((select array[testes.n(v, 'times'), testes.n(v, 'pessoas_em_times'), testes.n(v, 'pessoas_sem_time'), testes.n(v, 'times_sem_membros')] from j),
  array[0, 0, 1, 0]::numeric[], 'consultor sem time: nenhum time, ele mesmo sem time');
drop table j;
create temp table j as select testes.ver('central', format('public.indicadores_de_times(%L)', testes.id('A'))) as v;
select is((select array[testes.n(v, 'times'), testes.n(v, 'pessoas_em_times'), testes.n(v, 'pessoas_sem_time'), testes.n(v, 'times_sem_membros')] from j),
  array[2, 3, 3, 1]::numeric[], 'central + A: os números da A');
drop table j;
create temp table j as select testes.ver('central', format('public.indicadores_de_times(%L)', testes.id('B'))) as v;
select is((select array[testes.n(v, 'times'), testes.n(v, 'pessoas_em_times'), testes.n(v, 'pessoas_sem_time'), testes.n(v, 'times_sem_membros')] from j),
  array[1, 2, 0, 0]::numeric[], 'central + B: os números da B');
drop table j;
create temp table j as select testes.ver('admin_b', 'public.indicadores_de_times()') as v;
select is((select array[testes.n(v, 'times'), testes.n(v, 'pessoas_em_times'), testes.n(v, 'pessoas_sem_time'), testes.n(v, 'times_sem_membros')] from j),
  array[1, 2, 0, 0]::numeric[], 'administrador B: só a B');
drop table j;
create temp table j as select testes.ver('central', 'public.indicadores_de_times()') as v;
select is((select testes.n(v, 'times') from j), (select count(*)::numeric from public.times), 'central: todos os times');
select is((select testes.n(v, 'times_sem_membros') from j),
  (select count(*)::numeric from public.times t where not exists (select 1 from public.time_membros m where m.time_id = t.id)),
  'central: times sem membros no banco todo');
select is((select testes.n(v, 'pessoas_em_times') from j),
  (select count(distinct x.id)::numeric from (
     select m.pessoa_id as id from public.time_membros m union select t.gestor_id from public.times t) x
   join public.perfis p on p.id = x.id and p.ativo),
  'central: pessoas ativas em algum time (membro ou gestor)');
select is((select testes.n(v, 'pessoas_sem_time') from j),
  (select count(*)::numeric from public.perfis p
   where p.ativo and p.papel in ('admin', 'gestor', 'pessoa')
     and not exists (select 1 from public.time_membros m where m.pessoa_id = p.id)
     and not exists (select 1 from public.times t where t.gestor_id = p.id)),
  'central: pessoas ativas das consultorias sem time');
drop table j;
select throws_ok($$ select testes.ver('inativo_a', 'public.indicadores_de_times()') $$, 'P0001', 'sem_permissao',
  'times: pessoa inativa não recebe números');

-- ── Usuários ────────────────────────────────────────────────────────────────
-- A no mês futuro: capacidade 167,2 (zero_a: 0). Reservado: pessoa_a 40,1; pessoa_c 210 (> 100%); os outros 0.
create temp table j as select testes.ver('admin_a', format('public.indicadores_de_usuarios(%L)', testes.futuro())) as v;
select is((select v ->> 'mes' from j), testes.futuro()::text, 'usuários: devolve o mês pedido');
select is((select (v ->> 'passado')::boolean from j), false, 'usuários: mês futuro não é passado');
select is((select testes.n(v, 'pessoas_ativas') from j), 6::numeric, 'administrador A: 6 pessoas ativas (inativo não conta)');
select is((select testes.n(v, 'ocupacao_media') from j), round((round(40.1 / 167.2, 4) + round(210 / 167.2, 4)) / 5, 4),
  'administrador A: ocupação média = média da coluna Ocupação (quem tem capacidade)');
select is((select testes.n(v, 'acima_de_100') from j), 1::numeric, 'administrador A: pessoa_c acima de 100%');
select is((select testes.n(v, 'sem_tipo') from j), 5::numeric, 'administrador A: 5 sem tipo de consultoria (pessoa_a tem)');
drop table j;
create temp table j as select testes.ver('admin_a', format('public.indicadores_de_usuarios(%L, %L)', testes.futuro(), testes.id('B'))) as v;
select is((select testes.n(v, 'pessoas_ativas') from j), 6::numeric, 'administrador A pedindo a B: continua na A');
drop table j;
create temp table j as select testes.ver('gestor_a', format('public.indicadores_de_usuarios(%L)', testes.futuro())) as v;
select is((select array[testes.n(v, 'pessoas_ativas'), testes.n(v, 'ocupacao_media'), testes.n(v, 'acima_de_100'), testes.n(v, 'sem_tipo')] from j),
  array[3, round((round(40.1 / 167.2, 4) + round(210 / 167.2, 4)) / 3, 4), 1, 2]::numeric[],
  'gestor A: ele, quem ele criou (pessoa_c) e quem está no time dele (pessoa_a)');
drop table j;
create temp table j as select testes.ver('central', format('public.indicadores_de_usuarios(%L, %L)', testes.futuro(), testes.id('A'))) as v;
select is((select array[testes.n(v, 'pessoas_ativas'), testes.n(v, 'acima_de_100'), testes.n(v, 'sem_tipo')] from j),
  array[6, 1, 5]::numeric[], 'central + A: os números da A');
drop table j;
create temp table j as select testes.ver('admin_b', format('public.indicadores_de_usuarios(%L)', testes.futuro())) as v;
select is((select array[testes.n(v, 'pessoas_ativas'), testes.n(v, 'acima_de_100'), testes.n(v, 'sem_tipo')] from j),
  array[2, 0, 2]::numeric[], 'administrador B: só a B');
drop table j;
create temp table j as select testes.ver('central', format('public.indicadores_de_usuarios(%L)', testes.futuro())) as v;
select is((select testes.n(v, 'pessoas_ativas') from j),
  (select count(*)::numeric from public.perfis where ativo and papel <> 'dono'), 'central: todas as pessoas ativas (menos o dono)');
select is((select testes.n(v, 'sem_tipo') from j),
  (select count(*)::numeric from public.perfis where ativo and papel in ('admin', 'gestor', 'pessoa') and tipos_de_consultoria = '{}'),
  'central: sem tipo no banco todo');
select is((select testes.n(v, 'acima_de_100') from j),
  (select count(*)::numeric from private.ocupacao_dos_consultores(null, testes.futuro(), null) x where x.taxa > 1),
  'central: acima de 100% no banco todo');
drop table j;
create temp table j as select testes.ver('admin_a', format('public.indicadores_de_usuarios(%L)', testes.passado())) as v;
select is((select (v ->> 'passado')::boolean from j), true, 'usuários: mês passado é passado (utilização)');
drop table j;
create temp table j as select testes.ver('admin_a', 'public.indicadores_de_usuarios()') as v;
select is((select v ->> 'mes' from j), date_trunc('month', now() at time zone 'America/Sao_Paulo')::date::text,
  'usuários: sem mês = mês atual');
drop table j;
select throws_ok($$ select testes.ver('inativo_a', 'public.indicadores_de_usuarios()') $$, 'P0001', 'sem_permissao',
  'usuários: pessoa inativa não recebe números');

-- ── Consultorias (só a central e o dono) ────────────────────────────────────
create temp table j as select testes.ver('central', format('public.indicadores_de_consultorias(%L)', testes.futuro())) as v;
select is((select testes.n(v, 'consultorias_ativas') from j),
  (select count(*)::numeric from public.consultorias where arquivada_em is null), 'consultorias: ativas');
select is((select testes.n(v, 'clientes_ativos') from j),
  (select count(*)::numeric from public.clientes where not arquivado), 'consultorias: clientes ativos (como no Início)');
select is((select testes.n(v, 'consultores') from j), testes.n(testes.coluna_das_consultorias(testes.futuro()), 'consultores'),
  'consultorias: consultores = soma da coluna Consultores da ocupação');
select is((select testes.n(v, 'ocupacao_media') from j), testes.n(testes.coluna_das_consultorias(testes.futuro()), 'media'),
  'consultorias: ocupação média = média da coluna Ocupação de consultorias_por_ocupacao');
select is((select (v ->> 'passado')::boolean from j), false, 'consultorias: mês futuro');
drop table j;
create temp table j as select testes.ver('dono', format('public.indicadores_de_consultorias(%L)', testes.passado())) as v;
select is((select testes.n(v, 'ocupacao_media') from j), testes.n(testes.coluna_das_consultorias(testes.passado()), 'media'),
  'consultorias (dono, mês passado): média da utilização');
select is((select (v ->> 'passado')::boolean from j), true, 'consultorias: mês passado');
drop table j;
select throws_ok($$ select testes.ver('admin_a', 'public.indicadores_de_consultorias()') $$, 'P0001', 'sem_permissao',
  'consultorias: administrador não recebe');

-- ── Integrações (dono e administrador) ──────────────────────────────────────
create temp table j as select testes.ver('admin_a', 'public.indicadores_de_integracoes()') as v;
select is((select array[testes.n(v, 'conectadas'), testes.n(v, 'com_erro'), testes.n(v, 'nao_configuradas')] from j),
  array[1, 1, 1]::numeric[], 'integrações, administrador A: 1 conectada, 1 com erro, 1 não configurada');
select is((select (v ->> 'ultimo_teste')::timestamptz from j), '2026-11-12 10:00-03'::timestamptz,
  'administrador A: último teste = o mais recente (ultimo_teste_em)');
drop table j;
create temp table j as select testes.ver('admin_a', format('public.indicadores_de_integracoes(%L)', testes.id('B'))) as v;
select is((select testes.n(v, 'conectadas') from j), 1::numeric, 'administrador A pedindo a B: continua na A');
drop table j;
create temp table j as select testes.ver('admin_b', 'public.indicadores_de_integracoes()') as v;
select is((select array[testes.n(v, 'conectadas'), testes.n(v, 'com_erro'), testes.n(v, 'nao_configuradas')] from j),
  array[0, 0, 3]::numeric[], 'administrador B: nada conectado, a A não conta');
select ok((select v -> 'ultimo_teste' = 'null'::jsonb from j), 'administrador B: sem teste');
drop table j;
create temp table j as select testes.ver('dono', format('public.indicadores_de_integracoes(%L)', testes.id('A'))) as v;
select is((select array[testes.n(v, 'conectadas'), testes.n(v, 'com_erro'), testes.n(v, 'nao_configuradas')] from j),
  array[1, 1, 1]::numeric[], 'dono + A: os números da A');
drop table j;
create temp table j as select testes.ver('dono', 'public.indicadores_de_integracoes()') as v;
select is((select testes.n(v, 'conectadas') from j),
  (select count(*)::numeric from public.integracoes i join public.consultorias c on c.id = i.consultoria_id
   where c.arquivada_em is null and i.situacao = 'conectada'), 'dono: conectadas de todas as consultorias ativas');
select is((select testes.n(v, 'nao_configuradas') from j),
  (select 3 * count(*)::numeric from public.consultorias where arquivada_em is null)
    - (select count(*) from public.integracoes i join public.consultorias c on c.id = i.consultoria_id where c.arquivada_em is null),
  'dono: não configuradas = 3 por consultoria ativa menos as que existem');
drop table j;
select throws_ok($$ select testes.ver('central', 'public.indicadores_de_integracoes()') $$, 'P0001', 'sem_permissao',
  'integrações: a central não vê');
select throws_ok($$ select testes.ver('gestor_a', 'public.indicadores_de_integracoes()') $$, 'P0001', 'sem_permissao',
  'integrações: o gestor não vê');

-- ── Proteções ───────────────────────────────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.indicadores_de_clientes(uuid, uuid, boolean)', 'execute'), 'anônimo não conta clientes');
select ok(not has_function_privilege('anon', 'public.indicadores_de_times(uuid)', 'execute'), 'anônimo não conta times');
select ok(not has_function_privilege('anon', 'public.indicadores_de_usuarios(date, uuid)', 'execute'), 'anônimo não conta usuários');
select ok(not has_function_privilege('anon', 'public.indicadores_de_consultorias(date)', 'execute'), 'anônimo não conta consultorias');
select ok(not has_function_privilege('anon', 'public.indicadores_de_integracoes(uuid)', 'execute'), 'anônimo não conta integrações');
select ok(has_function_privilege('authenticated', 'public.indicadores_de_clientes(uuid, uuid, boolean)', 'execute'), 'logado conta clientes');
select ok(has_function_privilege('authenticated', 'public.indicadores_de_times(uuid)', 'execute'), 'logado conta times');
select ok(has_function_privilege('authenticated', 'public.indicadores_de_usuarios(date, uuid)', 'execute'), 'logado conta usuários');
select ok(has_function_privilege('authenticated', 'public.indicadores_de_consultorias(date)', 'execute'), 'logado conta consultorias');
select ok(has_function_privilege('authenticated', 'public.indicadores_de_integracoes(uuid)', 'execute'), 'logado conta integrações');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'indicadores\_de\_%'
    and p.prosecdef and p.proconfig @> array['search_path=""']), 5::bigint,
  'as 5 funções: security definer com search_path vazio');

select * from finish();
rollback;
