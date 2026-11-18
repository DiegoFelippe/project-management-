-- Base dos gráficos do Início: a história da situação de cada cliente (private.situacoes_dos_clientes, mantida por
-- gatilho e refeita pelos eventos), os dois resumos novos de check-ins (por cliente e mês; por consultoria e dia) e os
-- ajudantes do Início (recorte, período, período anterior e a situação num instante). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(99);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;
-- Clientes criados pelo gatilho neste teste (os "à mão" da seção do instante passado ficam fora).
create table testes.criados (id uuid primary key);
-- O que as telas devolvem a quem está logado (guardado para comparar depois, como o sistema).
create table testes.medidas (nome text primary key, valor jsonb not null);
grant select, insert on testes.medidas to authenticated;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Gráficos base ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text, p_exige_2fa boolean default false)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@graficos-base.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, exige_2fa)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@graficos-base.test', p_papel, p_exige_2fa);
  return v;
end $$;

-- Cliente gravado como o sistema (sem usuário logado), com o gatilho valendo.
create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text,
  p_arquivado boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, p_horas, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  if p_arquivado then update public.clientes set arquivado_em = now() where id = v; end if;
  insert into testes.fx values (p_nome, v);
  insert into testes.criados values (v);
  return v;
end $$;

-- Mudança no cliente feita como o sistema.
create function testes.mudar(p_nome text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute format('update public.clientes set %s where id = %L', p_sql, testes.id(p_nome));
end $$;

create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
    || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- O trecho aberto do cliente (sem o id), para comparar com o esperado; 'nenhum' quando não há.
create function testes.aberto(p_nome text) returns text language sql stable as $$
  select coalesce((
    select row(s.consultoria_id, s.consultor_id, s.horas_mes, s.de, s.espera_desde, s.entrou)::text
    from private.situacoes_dos_clientes s
    where s.cliente_id = testes.id(p_nome) and s.ate is null), 'nenhum')
$$;
create function testes.esperado(p_consultoria text, p_consultor text, p_horas numeric, p_espera timestamptz,
  p_entrou boolean) returns text language sql stable as $$
  select row(testes.id(p_consultoria), testes.id(p_consultor), p_horas::numeric(5, 1), now(), p_espera, p_entrou)::text
$$;
create function testes.trechos(p_nome text) returns int language sql stable as $$
  select count(*)::int from private.situacoes_dos_clientes where cliente_id = testes.id(p_nome)
$$;
-- Quantos trechos fechados do cliente não terminaram agora (o gatilho fecha com ate = now()).
create function testes.fechados_fora_de_agora(p_nome text) returns int language sql stable as $$
  select count(*)::int from private.situacoes_dos_clientes
  where cliente_id = testes.id(p_nome) and ate is not null and ate <> now()
$$;
create function testes.situacao(p_recorte text, p_consultoria text, p_eu text, p_instante timestamptz)
returns text language sql stable as $$
  select row(s.em_atendimento, s.a_distribuir, s.sem_consultor, s.reservado)::text
  from private.situacao_no_instante(p_recorte, testes.id(p_consultoria), testes.id(p_eu), p_instante) s
$$;

-- ── Dados ────────────────────────────────────────────────────────────────────
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('C');
select testes.consultoria('H');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('travado_a', 'pessoa', 'A', true);
select testes.perfil('sai_a', 'pessoa', 'A');
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.perfil('pessoa_c', 'pessoa', 'C');
select testes.perfil('pessoa_c2', 'pessoa', 'C');
select testes.perfil('pessoa_h', 'pessoa', 'H');

select testes.cliente('a1', 40, 'A', 'pessoa_a');
select testes.cliente('a2', 30, 'A', 'pessoa_a');
select testes.cliente('a3', 20, 'A', 'pessoa_a2');
select testes.cliente('a_sem', 25, 'A', null);
select testes.cliente('a_arq', 15, 'A', 'pessoa_a', true);
select testes.cliente('b1', 10, 'B', 'pessoa_b');
select testes.cliente('b_sem', 12, 'B', null);
select testes.cliente('dist', 8, null, null);
select testes.cliente('cli_sai', 6, 'A', 'sai_a');

-- ── As tabelas novas são internas ────────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'private.situacoes_dos_clientes'::regclass),
  'situacoes_dos_clientes: RLS ligado');
select table_privs_are('private', 'situacoes_dos_clientes', 'anon', '{}'::text[], 'situacoes_dos_clientes: nada para anon');
select table_privs_are('private', 'situacoes_dos_clientes', 'authenticated', '{}'::text[],
  'situacoes_dos_clientes: nada para authenticated');
select table_privs_are('private', 'situacoes_dos_clientes', 'service_role', '{}'::text[],
  'situacoes_dos_clientes: nada para service_role');
select ok((select relrowsecurity from pg_class where oid = 'private.checkins_horas_cliente_mes'::regclass),
  'checkins_horas_cliente_mes: RLS ligado');
select table_privs_are('private', 'checkins_horas_cliente_mes', 'anon', '{}'::text[],
  'checkins_horas_cliente_mes: nada para anon');
select table_privs_are('private', 'checkins_horas_cliente_mes', 'authenticated', '{}'::text[],
  'checkins_horas_cliente_mes: nada para authenticated');
select table_privs_are('private', 'checkins_horas_cliente_mes', 'service_role', '{}'::text[],
  'checkins_horas_cliente_mes: nada para service_role');
select ok((select relrowsecurity from pg_class where oid = 'private.checkins_por_dia'::regclass),
  'checkins_por_dia: RLS ligado');
select table_privs_are('private', 'checkins_por_dia', 'anon', '{}'::text[], 'checkins_por_dia: nada para anon');
select table_privs_are('private', 'checkins_por_dia', 'authenticated', '{}'::text[],
  'checkins_por_dia: nada para authenticated');
select table_privs_are('private', 'checkins_por_dia', 'service_role', '{}'::text[],
  'checkins_por_dia: nada para service_role');
select ok(to_regclass('public.situacoes_dos_clientes') is null and to_regclass('public.checkins_horas_cliente_mes') is null
    and to_regclass('public.checkins_por_dia') is null,
  'as três ficam em private, fora do PostgREST');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('situacoes_pelos_eventos', 'registrar_situacao_do_cliente',
      'somar_horas_cliente_mes', 'somar_checkin_do_dia', 'recorte_do_inicio', 'periodo_do_inicio', 'periodo_anterior',
      'situacao_no_instante', 'espera_do_trecho', 'trecho_entrou')
      and not has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')), 10,
  'as dez funções novas de private existem e ninguém logado (nem anônimo) as executa');
select ok(exists (select 1 from pg_indexes where schemaname = 'private' and tablename = 'situacoes_dos_clientes'
    and indexdef like '%(cliente_id)%WHERE (ate IS NULL)%' and indexdef like 'CREATE UNIQUE%'),
  'situacoes_dos_clientes: um só trecho aberto por cliente (único parcial)');
select ok((select count(*) = 3 from pg_indexes where schemaname = 'private' and tablename = 'situacoes_dos_clientes'
    and (indexdef like '%(consultoria_id, de)' or indexdef like '%(consultor_id, de)' or indexdef like '%(de)')),
  'situacoes_dos_clientes: índices por consultoria, por consultor e por data');

-- ── Gatilho, passo a passo ───────────────────────────────────────────────────
-- Tudo nesta transação acontece no mesmo instante (now()): os trechos fechados aqui têm duração zero.
select testes.cliente('passo', 20, null, null);
select is(testes.trechos('passo'), 1, 'cadastrar: um trecho');
select is(testes.aberto('passo'), testes.esperado(null, null, 20, null, false),
  'cadastrar sem consultoria: o trecho aberto é a distribuir, sem espera e sem entrar');

select testes.mudar('passo', format('consultoria_id = %L', testes.id('A')));
select is(testes.trechos('passo'), 2, 'enviar: fecha um e abre outro');
select is(testes.aberto('passo'), testes.esperado('A', null, 20, now(), false),
  'enviar: aberto na consultoria, sem consultor, esperando desde agora');

select testes.mudar('passo', format('consultor_id = %L', testes.id('pessoa_a')));
select is(testes.aberto('passo'), testes.esperado('A', 'pessoa_a', 20, now(), true),
  'escolher consultor: o trecho entra em atendimento (entrou)');
select is((select espera_desde from private.situacoes_dos_clientes where cliente_id = testes.id('passo') and ate is null),
  (select espera_desde from private.situacoes_dos_clientes where cliente_id = testes.id('passo')
    and consultoria_id = testes.id('A') and consultor_id is null),
  'escolher consultor: espera_desde é o do trecho de espera');

select testes.mudar('passo', format('consultor_id = %L', testes.id('pessoa_a2')));
select is(testes.aberto('passo'), testes.esperado('A', 'pessoa_a2', 20, now(), false),
  'trocar o consultor: não conta como cliente novo (entrou = false)');

select testes.mudar('passo', 'horas_mes = 25');
select is(testes.aberto('passo'), testes.esperado('A', 'pessoa_a2', 25, now(), false),
  'mudar a previsão: trecho novo com a mesma consultoria e o mesmo consultor, entrou = false');

select testes.mudar('passo', format('consultoria_id = %L', testes.id('B')));
select is(testes.aberto('passo'), testes.esperado('B', null, 25, now(), false),
  'mover de consultoria: sem consultor, esperando na nova');

select testes.mudar('passo', 'arquivado_em = now()');
select is(testes.aberto('passo'), 'nenhum', 'arquivar: nenhum trecho aberto');
select is(testes.trechos('passo'), 6, 'arquivar: só fecha (seis trechos, nenhum novo)');

select testes.mudar('passo', 'arquivado_em = null');
select is(testes.aberto('passo'), testes.esperado('B', null, 25, now(), false), 'reativar: abre de novo');
select is(testes.fechados_fora_de_agora('passo'), 0, 'todo trecho fechado terminou agora (ate = now())');

select testes.mudar('passo', 'nome = ''Cliente passo renomeado'', cidade = ''Recife''');
select is(testes.trechos('passo'), 7, 'mudar só o nome e a cidade não abre trecho');

-- ── Duas mudanças na mesma transação ─────────────────────────────────────────
select testes.cliente('duas', 8, null, null);
select testes.mudar('duas', format('consultoria_id = %L', testes.id('C')));
select testes.mudar('duas', format('consultor_id = %L', testes.id('pessoa_c')));
select is((select count(*)::int from private.situacoes_dos_clientes where cliente_id = testes.id('duas') and ate = de), 2,
  'duas mudanças na mesma transação: os trechos de duração zero existem');
select is(testes.situacao('consultoria', 'C', null, now()), '(1,0,0,8.0)',
  'situacao_no_instante não conta os trechos de duração zero (só o cliente com consultor)');
-- Consultor e previsão no mesmo comando: um trecho por mudança, na ordem do histórico (o do meio dura zero).
select testes.mudar('duas', format('consultor_id = %L, horas_mes = 9', testes.id('pessoa_c2')));
select is(testes.aberto('duas'), testes.esperado('C', 'pessoa_c2', 9, now(), false),
  'consultor e previsão de uma vez: o aberto tem os dois');
select is(testes.situacao('consultoria', 'C', null, now()), '(1,0,0,9.0)',
  'consultor e previsão de uma vez: continua um cliente, com a previsão nova');

-- ── Espera e entrada (as regras, com instantes diferentes) ───────────────────
select is(private.espera_do_trecho(true, testes.id('A'), null, '2026-01-05 10:00-03', testes.id('A'), null,
    '2026-02-01 10:00-03'), '2026-01-05 10:00-03'::timestamptz,
  'espera: mudar a previsão de quem espera passa a espera adiante');
select is(private.espera_do_trecho(true, testes.id('A'), null, '2026-01-05 10:00-03', testes.id('A'), testes.id('pessoa_a'),
    '2026-02-01 10:00-03'), '2026-01-05 10:00-03'::timestamptz,
  'espera: o trecho que ganha consultor copia o começo da espera');
select is(private.espera_do_trecho(true, testes.id('A'), testes.id('pessoa_a'), '2026-01-05 10:00-03', testes.id('A'), null,
    '2026-02-01 10:00-03'), '2026-02-01 10:00-03'::timestamptz,
  'espera: o consultor saiu, a espera começa de novo');
select is(private.espera_do_trecho(true, testes.id('A'), null, '2026-01-05 10:00-03', testes.id('B'), null,
    '2026-02-01 10:00-03'), '2026-02-01 10:00-03'::timestamptz,
  'espera: mudou de consultoria, a espera começa na nova');
select is(private.espera_do_trecho(true, null, null, null, null, null, '2026-02-01 10:00-03'), null::timestamptz,
  'espera: a distribuir não espera consultor');
select ok(private.trecho_entrou(true, null, testes.id('pessoa_a')) and private.trecho_entrou(false, null, testes.id('pessoa_a'))
    and not private.trecho_entrou(true, testes.id('pessoa_a'), testes.id('pessoa_a2'))
    and not private.trecho_entrou(true, null, null),
  'entrou: só quando ganha consultor vindo de um trecho sem consultor (ou de nenhum)');

-- ── situacao_no_instante(agora) bate com as telas ────────────────────────────
select testes.como('central');
insert into testes.medidas values ('central', public.indicadores_de_clientes());
reset role;
select testes.como('admin_a');
insert into testes.medidas values ('admin_a', public.indicadores_de_clientes());
reset role;
select testes.como('pessoa_a');
insert into testes.medidas values ('pessoa_a', public.indicadores_de_clientes());
reset role;
select set_config('request.jwt.claims', '', true);

select is((select row(s.em_atendimento, s.a_distribuir, s.sem_consultor)::text
    from private.situacao_no_instante('tudo', null, null, now()) s),
  (select row((valor ->> 'em_atendimento')::int, (valor ->> 'aguardando_consultoria')::int,
    (valor ->> 'aguardando_consultor')::int)::text from testes.medidas where nome = 'central'),
  'tudo, agora: em atendimento, aguardando consultoria e aguardando consultor iguais aos de Clientes');
select is((select reservado from private.situacao_no_instante('tudo', null, null, now())),
  (select coalesce(sum(horas_mes), 0) from public.clientes where not arquivado and consultoria_id is not null),
  'tudo, agora: reservado = previsões dos clientes não arquivados com consultoria');
select is((select row(s.em_atendimento, s.a_distribuir, s.sem_consultor)::text
    from private.situacao_no_instante('consultoria', testes.id('A'), null, now()) s),
  (select row((valor ->> 'em_atendimento')::int, 0, (valor ->> 'aguardando_consultor')::int)::text
    from testes.medidas where nome = 'admin_a'),
  'consultoria, agora: em atendimento e aguardando consultor iguais aos de Clientes da gestão');
select is((select reservado from private.situacao_no_instante('consultoria', testes.id('A'), null, now())),
  (select sum(horas_mes) from public.clientes where not arquivado and consultoria_id = testes.id('A')),
  'consultoria, agora: reservado = previsões não arquivadas da consultoria (com quem espera consultor)');
select is((select row(s.em_atendimento, s.a_distribuir, s.sem_consultor)::text
    from private.situacao_no_instante('pessoa', testes.id('A'), testes.id('pessoa_a'), now()) s),
  (select row((valor ->> 'meus_clientes')::int, 0, 0)::text from testes.medidas where nome = 'pessoa_a'),
  'pessoa, agora: em atendimento = meus clientes');
select is((select reservado from private.situacao_no_instante('pessoa', testes.id('A'), testes.id('pessoa_a'), now())),
  70.0, 'pessoa, agora: reservado = previsões dos clientes dele (40 + 30; o arquivado fica fora)');
select throws_ok($$ select * from private.situacao_no_instante('outro', null, null, now()) $$, '42501', 'sem_recorte',
  'recorte desconhecido: recusa');

-- ── Resumos acompanham os check-ins ──────────────────────────────────────────
create function testes.cliente_mes(p_cliente text, p_mes date) returns numeric language sql stable as $$
  select coalesce(sum(segundos), 0) from private.checkins_horas_cliente_mes
  where cliente_id = testes.id(p_cliente) and mes = p_mes
$$;
create function testes.dia(p_consultoria text, p_dia date) returns text language sql stable as $$
  select row(coalesce(sum(quantidade), 0), coalesce(sum(segundos), 0)::bigint)::text from private.checkins_por_dia
  where consultoria_id = testes.id(p_consultoria) and dia = p_dia
$$;
-- Os dois resumos iguais à soma direta dos check-ins fechados (pelo mês e pelo dia de São Paulo em que começaram).
create function testes.resumos_conferem() returns boolean language sql stable as $$
  select not exists (
    select 1 from (
      select k.cliente_id, k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date as mes,
        sum(extract(epoch from k.fim - k.inicio)) as segundos
      from public.checkins k where k.fim is not null group by 1, 2, 3) d
    full join private.checkins_horas_cliente_mes r
      on r.cliente_id = d.cliente_id and r.consultoria_id = d.consultoria_id and r.mes = d.mes
    where coalesce(d.segundos, 0) is distinct from coalesce(r.segundos, 0))
  and not exists (
    select 1 from (
      select k.consultoria_id, (k.inicio at time zone 'America/Sao_Paulo')::date as dia, count(*) as quantidade,
        sum(extract(epoch from k.fim - k.inicio)) as segundos
      from public.checkins k where k.fim is not null group by 1, 2) d
    full join private.checkins_por_dia r on r.consultoria_id = d.consultoria_id and r.dia = d.dia
    where coalesce(d.segundos, 0) is distinct from coalesce(r.segundos, 0)
      or coalesce(d.quantidade, 0) is distinct from coalesce(r.quantidade, 0))
$$;

select ok(testes.resumos_conferem(), 'o preenchimento: os dois resumos batem com a soma direta de todos os check-ins fechados');

select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, descricao) values (testes.id('a1'), '2025-03-10 08:00-03', 'Março');
reset role;
select set_config('request.jwt.claims', '', true);
select ok(testes.cliente_mes('a1', '2025-03-01') = 0 and testes.dia('A', '2025-03-10') = '(0,0)',
  'check-in aberto não entra nos resumos');

update public.checkins set fim = '2025-03-10 10:00-03' where cliente_id = testes.id('a1') and inicio = '2025-03-10 08:00-03';
select is(testes.cliente_mes('a1', '2025-03-01'), 7200::numeric, 'fechar: soma no mês do cliente');
select is(testes.dia('A', '2025-03-10'), '(1,7200)', 'fechar: um check-in e as horas no dia da consultoria');

-- 22h30 de 02/04 em São Paulo já é 03/04 em UTC: conta em 02/04.
update public.checkins set inicio = '2025-04-02 22:30-03', fim = '2025-04-02 23:30-03'
where cliente_id = testes.id('a1') and inicio = '2025-03-10 08:00-03';
select ok(testes.cliente_mes('a1', '2025-03-01') = 0 and testes.dia('A', '2025-03-10') = '(0,0)',
  'mudar o início para outro mês e outro dia: sai do mês e do dia antigos');
select ok(testes.cliente_mes('a1', '2025-04-01') = 3600 and testes.dia('A', '2025-04-02') = '(1,3600)',
  'mudar o início: entra no mês e no dia novos (o dia de São Paulo)');

update public.checkins set cliente_id = testes.id('a2') where cliente_id = testes.id('a1') and inicio = '2025-04-02 22:30-03';
select ok(testes.cliente_mes('a1', '2025-04-01') = 0 and testes.cliente_mes('a2', '2025-04-01') = 3600,
  'mudar o cliente do check-in: tira de um cliente e soma no outro');
select ok(testes.resumos_conferem(), 'depois das mudanças: os dois resumos batem com a soma direta');

delete from public.checkins where cliente_id = testes.id('a2') and inicio = '2025-04-02 22:30-03';
select ok(testes.cliente_mes('a2', '2025-04-01') = 0 and testes.dia('A', '2025-04-02') = '(0,0)',
  'apagar: subtrai dos dois resumos');
select ok(testes.resumos_conferem(), 'depois de apagar: os dois resumos batem com a soma direta');

-- A ferramenta de conserto (private.recalcular_horas_mes) refaz também os dois resumos novos.
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('a1'), '2025-05-06 08:00-03', '2025-05-06 09:00-03', 'Maio');
reset role;
select set_config('request.jwt.claims', '', true);
update private.checkins_horas_cliente_mes set segundos = segundos + 999 where cliente_id = testes.id('a1');
delete from private.checkins_por_dia where consultoria_id = testes.id('A') and dia = '2025-05-06';
select private.recalcular_horas_mes();
select ok(testes.resumos_conferem(), 'recalcular_horas_mes refaz os dois resumos novos iguais à soma direta');

-- Apagar uma pessoa com clientes e check-ins (um fechado e um aberto) funciona; os resumos continuam batendo e o
-- cliente dela passa a esperar consultor.
select testes.como('sai_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('cli_sai'), '2025-06-03 08:00-03', '2025-06-03 10:00-03', 'Junho');
insert into public.checkins (cliente_id, inicio, descricao) values (testes.id('cli_sai'), '2025-06-04 08:00-03', 'Aberto');
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok($$ delete from auth.users where id = testes.id('sai_a') $$,
  'apagar a pessoa (com cliente e check-ins) funciona');
select ok(testes.resumos_conferem(), 'depois de apagar a pessoa: os dois resumos batem com a soma direta');
select is(testes.aberto('cli_sai'), testes.esperado('A', null, 6, now(), false),
  'o cliente da pessoa apagada fica esperando consultor na consultoria');

-- ── Os eventos refazem o que o gatilho gravou ────────────────────────────────
-- Para cada cliente criado neste teste, os trechos refeitos de cliente_eventos são exatamente os da tabela.
create function testes.eventos_batem(p_cliente uuid) returns boolean language sql stable as $$
  select not exists (
    (select consultoria_id, consultor_id, horas_mes::numeric, de, ate, espera_desde, entrou
     from private.situacoes_dos_clientes where cliente_id = p_cliente
     except all
     select * from private.situacoes_pelos_eventos(p_cliente))
    union all
    (select * from private.situacoes_pelos_eventos(p_cliente)
     except all
     select consultoria_id, consultor_id, horas_mes::numeric, de, ate, espera_desde, entrou
     from private.situacoes_dos_clientes where cliente_id = p_cliente))
$$;
select is((select string_agg(f.nome, ', ' order by f.nome) from testes.criados c join testes.fx f on f.id = c.id
    where not testes.eventos_batem(c.id)), null,
  'os eventos refazem exatamente os trechos que o gatilho gravou, em todos os clientes do teste');
select results_eq(
  $$ select consultoria_id, consultor_id, horas_mes::numeric, de, ate, espera_desde, entrou
     from private.situacoes_dos_clientes where cliente_id = testes.id('passo') order by id $$,
  $$ select * from private.situacoes_pelos_eventos(testes.id('passo')) $$,
  'passo a passo: os eventos refazem os mesmos trechos, na mesma ordem');
select is((select count(*)::int from testes.criados), 11, 'a conferência passou pelos 11 clientes do teste');

-- ── O preenchimento deixou exatamente o estado de agora ──────────────────────
select is((select count(*)::int from public.clientes c
    where not c.arquivado and not exists (
      select 1 from private.situacoes_dos_clientes s
      where s.cliente_id = c.id and s.ate is null
        and s.consultoria_id is not distinct from c.consultoria_id
        and s.consultor_id is not distinct from c.consultor_id
        and s.horas_mes = c.horas_mes)), 0,
  'todo cliente não arquivado tem um trecho aberto igual à situação dele agora');
select is((select count(*)::int from public.clientes c
    join private.situacoes_dos_clientes s on s.cliente_id = c.id and s.ate is null
    where c.arquivado), 0, 'nenhum cliente arquivado tem trecho aberto');
select is((select count(*)::int from private.situacoes_dos_clientes where de > now() or ate > now()), 0,
  'nenhum trecho começa ou termina no futuro');

-- ── situacao_no_instante num instante passado ────────────────────────────────
-- Trechos de datas fixas em 1990 (nenhum dado real é dessa época), escritos como superusuário só aqui, para clientes
-- sem trecho nenhum (os do gatilho são tirados).
create function testes.cliente_a_mao(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes) values ('Cliente ' || p_nome, 1) returning id into v;
  delete from private.situacoes_dos_clientes where cliente_id = v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;
select testes.cliente_a_mao('h1');
select testes.cliente_a_mao('h2');
select testes.cliente_a_mao('h3');
select testes.cliente_a_mao('h4');
select testes.cliente_a_mao('h5');
select testes.cliente_a_mao('h6');
insert into private.situacoes_dos_clientes (cliente_id, consultoria_id, consultor_id, horas_mes, de, ate) values
  (testes.id('h1'), testes.id('H'), testes.id('pessoa_h'), 10, '1990-01-10 00:00-03', '1990-03-05 00:00-03'),
  (testes.id('h1'), testes.id('H'), null, 10, '1990-03-05 00:00-03', null),
  (testes.id('h2'), testes.id('H'), null, 5, '1990-02-01 00:00-03', '1990-02-20 00:00-03'),
  (testes.id('h2'), testes.id('H'), testes.id('pessoa_h'), 5, '1990-02-20 00:00-03', '1990-06-01 00:00-03'),
  (testes.id('h3'), testes.id('H'), testes.id('pessoa_h'), 7, '1990-04-01 00:00-03', null),
  (testes.id('h4'), testes.id('H'), testes.id('pessoa_h'), 3, '1989-12-01 00:00-03', '1990-02-15 00:00-03'),
  (testes.id('h5'), testes.id('H'), testes.id('pessoa_h'), 100, '1990-02-10 12:00-03', '1990-02-10 12:00-03'),
  (testes.id('h6'), null, null, 4, '1990-01-01 00:00-03', '1990-12-31 00:00-03');

select is(testes.situacao('consultoria', 'H', null, '1990-02-10 12:00-03'), '(2,0,1,18.0)',
  'instante passado, consultoria: conta quem estava aberto naquele instante (o de duração zero, não)');
select is(testes.situacao('pessoa', 'H', 'pessoa_h', '1990-02-10 12:00-03'), '(2,0,0,13.0)',
  'instante passado, pessoa: os clientes dele naquele instante');
select is(testes.situacao('tudo', null, null, '1990-02-10 12:00-03'), '(2,1,1,18.0)',
  'instante passado, tudo: com o a distribuir (o reservado só soma quem tem consultoria)');
select is(testes.situacao('consultoria', 'H', null, '1990-03-05 00:00-03'), '(1,0,1,15.0)',
  'no instante exato da mudança vale o trecho que começa (de <= instante < ate)');
select is(testes.situacao('consultoria', 'H', null, '1990-05-01 00:00-03'), '(2,0,1,22.0)',
  'o trecho que abriu depois entra só a partir de quando abriu');
select is(testes.situacao('consultoria', 'H', null, '1989-06-01 00:00-03'), '(0,0,0,0)',
  'antes de tudo: nada');
select is(testes.situacao('consultoria', 'A', null, '1990-02-10 12:00-03'), '(0,0,0,0)',
  'outra consultoria não vê os clientes da H naquele instante');

-- ── periodo_anterior ─────────────────────────────────────────────────────────
select results_eq($$ select * from private.periodo_anterior('2026-11-01', '2026-11-17', true) $$,
  $$ values (date '2026-10-01', date '2026-10-17', 'mes_parcial') $$, 'Mês até o dia 17: 1º a 17 do mês anterior');
select results_eq($$ select * from private.periodo_anterior('2026-10-01', '2026-10-31', true) $$,
  $$ values (date '2026-09-01', date '2026-09-30', 'mes') $$, 'outubro inteiro: setembro inteiro (31 vira 30)');
select results_eq($$ select * from private.periodo_anterior('2026-03-01', '2026-03-31', true) $$,
  $$ values (date '2026-02-01', date '2026-02-28', 'mes') $$, '31/03: fevereiro inteiro (até 28/02)');
select results_eq($$ select * from private.periodo_anterior('2028-03-01', '2028-03-30', true) $$,
  $$ values (date '2028-02-01', date '2028-02-29', 'mes') $$, '30/03 de ano bissexto: fevereiro inteiro (até 29/02)');
select results_eq($$ select * from private.periodo_anterior('2027-01-01', '2027-01-17', true) $$,
  $$ values (date '2026-12-01', date '2026-12-17', 'mes_parcial') $$, 'janeiro compara com dezembro do ano anterior');
select results_eq($$ select * from private.periodo_anterior('2026-01-01', '2026-11-17', false) $$,
  $$ values (date '2025-01-01', date '2025-11-17', 'ano_anterior') $$, 'Este ano: as mesmas datas do ano anterior');
select results_eq($$ select * from private.periodo_anterior('2028-01-01', '2028-02-29', false) $$,
  $$ values (date '2027-01-01', date '2027-02-28', 'ano_anterior') $$, 'Este ano até 29/02: até 28/02 do ano anterior');
select results_eq($$ select * from private.periodo_anterior('2026-01-01', '2026-01-01', false) $$,
  $$ values (date '2025-01-01', date '2025-01-01', 'ano_anterior') $$, 'Este ano no dia 1º de janeiro: 1º de janeiro anterior');
select results_eq($$ select * from private.periodo_anterior('2026-10-19', '2026-11-17', false) $$,
  $$ values (date '2026-09-19', date '2026-10-18', 'dias_antes') $$, 'Últimos 30 dias: os 30 dias logo antes');
select results_eq($$ select * from private.periodo_anterior('2025-06-15', '2026-11-17', false) $$,
  $$ values (date '2024-01-11', date '2025-06-14', 'dias_antes') $$, 'Personalizado de 521 dias: os 521 dias antes');
select results_eq($$ select * from private.periodo_anterior('2026-11-17', '2026-11-17', false) $$,
  $$ values (date '2026-11-16', date '2026-11-16', 'dias_antes') $$, 'um dia só: o dia anterior');
select is((select count(*)::int from private.periodo_anterior('2026-11-25', '2026-11-18', false)), 0,
  'período efetivo vazio (começa depois de hoje): sem período anterior');

-- ── periodo_do_inicio ────────────────────────────────────────────────────────
-- Estado, mensagem e detalhe da recusa (ou 'aceitou').
create function testes.recusa(p_sql text) returns text language plpgsql as $$
declare v_estado text; v_msg text; v_detalhe text;
begin
  execute p_sql;
  return 'aceitou';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_detalhe = pg_exception_detail;
  return v_estado || ' ' || v_msg || ': ' || coalesce(v_detalhe, '');
end $$;
create function testes.mes_atual() returns date language sql stable as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

select is(testes.recusa($$ select * from private.periodo_do_inicio('2026-10-01', '2026-10-01', '2026-10-31') $$),
  '22023 periodo_invalido: Mande o mês ou o período (de e até), não os dois.', 'recusa: mês e período juntos');
select is(testes.recusa($$ select * from private.periodo_do_inicio(null, '2026-10-31', '2026-10-01') $$),
  '22023 periodo_invalido: A data inicial vem depois da final.', 'recusa: início depois do fim');
select is(testes.recusa(format($$ select * from private.periodo_do_inicio(null, %L, %L) $$, testes.mes_atual(),
    (testes.mes_atual() + interval '1 month')::date)),
  '22023 periodo_invalido: O período vai no máximo até o fim do mês atual.', 'recusa: passa do fim do mês atual');
select is(testes.recusa($$ select * from private.periodo_do_inicio(null, '2024-01-01', '2026-01-01') $$),
  '22023 periodo_invalido: O período pode ter no máximo 2 anos.', 'recusa: 2 anos ou mais');
-- As mesmas frases do painel_do_inicio de hoje.
select testes.como('central');
insert into testes.medidas
select 'painel_recusas', jsonb_build_array(
  testes.recusa($$ select public.painel_do_inicio('2026-10-01', '2026-10-01', '2026-10-31') $$),
  testes.recusa($$ select public.painel_do_inicio(null, '2026-10-31', '2026-10-01') $$),
  testes.recusa(format($$ select public.painel_do_inicio(null, %L, %L) $$, testes.mes_atual(),
    (testes.mes_atual() + interval '1 month')::date)),
  testes.recusa($$ select public.painel_do_inicio(null, '2024-01-01', '2026-01-01') $$));
reset role;
select is((select valor from testes.medidas where nome = 'painel_recusas'), jsonb_build_array(
  testes.recusa($$ select * from private.periodo_do_inicio('2026-10-01', '2026-10-01', '2026-10-31') $$),
  testes.recusa($$ select * from private.periodo_do_inicio(null, '2026-10-31', '2026-10-01') $$),
  testes.recusa(format($$ select * from private.periodo_do_inicio(null, %L, %L) $$, testes.mes_atual(),
    (testes.mes_atual() + interval '1 month')::date)),
  testes.recusa($$ select * from private.periodo_do_inicio(null, '2024-01-01', '2026-01-01') $$)),
  'as quatro recusas são as mesmas do painel_do_inicio');

select results_eq(
  format($$ select * from private.periodo_do_inicio(null, %L, %L) $$, testes.mes_atual(),
    (testes.mes_atual() + interval '1 month - 1 day')::date),
  format($$ values (%L::date, %L::date, %L::date, %L::date, true, true) $$, testes.mes_atual(), testes.mes_atual(),
    (testes.mes_atual() + interval '1 month - 1 day')::date, testes.hoje()),
  'Personalizado até o fim do mês atual: o efetivo para em hoje');
select results_eq(
  format($$ select * from private.periodo_do_inicio(%L, null, null) $$, (testes.mes_atual() - interval '1 month')::date),
  format($$ values (%L::date, %L::date, %L::date, %L::date, false, true) $$,
    (testes.mes_atual() - interval '1 month')::date, (testes.mes_atual() - interval '1 month')::date,
    (testes.mes_atual() - interval '1 day')::date, (testes.mes_atual() - interval '1 day')::date),
  'Mês passado: passado, e o efetivo é o mês inteiro');
select results_eq($$ select * from private.periodo_do_inicio(null, null, null) $$,
  format($$ values (%L::date, %L::date, %L::date, %L::date, false, false) $$, testes.mes_atual(), testes.mes_atual(),
    (testes.mes_atual() + interval '1 month - 1 day')::date, testes.hoje()),
  'Mês atual (sem nada): de 1º até hoje, não passado');

-- ── recorte_do_inicio ────────────────────────────────────────────────────────
-- Chamado como seria de dentro de uma função security definer do Início.
create function testes.recorte() returns text language plpgsql security definer set search_path = '' as $$
begin
  return (select row(r.recorte, r.consultoria, r.eu)::text from private.recorte_do_inicio() r);
end $$;
grant execute on function testes.recorte() to authenticated;
create table testes.recortes (nome text primary key, valor text);
grant insert on testes.recortes to authenticated;

select testes.como('central');
insert into testes.recortes values ('central', testes.recorte());
reset role;
select testes.como('admin_a');
insert into testes.recortes values ('admin_a', testes.recorte());
reset role;
select testes.como('gestor_a');
insert into testes.recortes values ('gestor_a', testes.recorte());
reset role;
select testes.como('pessoa_a');
insert into testes.recortes values ('pessoa_a', testes.recorte());
reset role;
select testes.como('travado_a', 'aal1');
select throws_ok($$ select testes.recorte() $$, '42501', 'sem_recorte',
  'consultor não liberado (precisa do código e entrou só com a senha): sem recorte');
reset role;

select is((select valor from testes.recortes where nome = 'central'), row('tudo', null::uuid, testes.id('central'))::text,
  'central: tudo');
select is((select valor from testes.recortes where nome = 'admin_a'), row('consultoria', testes.id('A'), testes.id('admin_a'))::text,
  'administrador: a consultoria atual');
select is((select valor from testes.recortes where nome = 'gestor_a'), row('consultoria', testes.id('A'), testes.id('gestor_a'))::text,
  'gestor: a consultoria atual');
select is((select valor from testes.recortes where nome = 'pessoa_a'), row('pessoa', testes.id('A'), testes.id('pessoa_a'))::text,
  'consultor liberado: pessoa, na consultoria atual');

select * from finish();
rollback;
