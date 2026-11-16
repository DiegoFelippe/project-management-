-- Ocupação e sugestão: consultores e consultorias em ordem de menor ocupação (capacidade 0 por último), com
-- capacidade, reservado, realizado e número de clientes, para "mandar para uma consultoria", "escolher o
-- consultor" e a Capacidade. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- Ajudantes só do teste (somem no rollback do fim). O banco local tem dados de verdade do Diego: as contas
-- abaixo olham só para o cenário (e-mails @ocupacao.test, consultorias "Ocupação Teste ...").
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.usuario(p_nome text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    replace(p_nome, '_', '.') || '@ocupacao.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.consultoria(p_nome text, p_arquivada boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome, arquivada_em)
  values ('Ocupação Teste ' || p_nome, case when p_arquivada then now() end) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- E-mail sem "_" (pessoa.a2@ocupacao.test), para a busca por "_" não achar ninguém do cenário.
create function testes.perfil(p_nome text, p_papel text, p_consultoria text, p_exibido text,
  p_carga numeric default 44, p_ativo boolean default true) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome);
  insert into public.perfis (id, consultoria_id, nome, email, papel, carga_semanal, ativo)
  values (v, testes.id(p_consultoria), p_exibido, replace(p_nome, '_', '.') || '@ocupacao.test', p_papel,
    p_carga, p_ativo);
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

-- Cliente gravado direto (sem usuário logado). testes.como deixa o usuário nas configurações até o fim da
-- transação (reset role não limpa): limpa aqui.
create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text,
  p_arquivado boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id, arquivado_em)
  values ('Cliente ' || p_nome, p_horas, testes.id(p_consultoria), testes.id(p_consultor),
    case when p_arquivado then now() end) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Meses do teste.
-- - futuro: novembro/2037 tem o calendário de novembro/2026 (dia 1º num domingo; feriados 2 e 20 em dia útil,
--   15 no domingo): 19 dias úteis x 44 h / 5 = 167,2. Como é um mês que ainda não chegou, mostra o reservado
--   (pela previsão de hoje), e o teste não vence quando novembro/2026 passar.
-- - passado: outubro/2026 tem 21 dias úteis (22 de segunda a sexta, menos 12/10): 21 x 44 / 5 = 184,8.
create function testes.futuro() returns date language sql immutable as $$ select date '2037-11-01' $$;
create function testes.passado() returns date language sql immutable as $$ select date '2026-10-01' $$;

-- Ids dos consultores (ou das consultorias) na ordem em que as funções devolvem.
create function testes.ordem(p_consultoria text, p_busca text, p_mes date) returns uuid[] language sql stable as $$
  select array(
    select f.id
    from public.consultores_por_ocupacao(testes.id(p_consultoria), p_busca, 50, 0, p_mes) with ordinality f
    order by f.ordinality)
$$;

create function testes.ordem_consultorias(p_busca text, p_mes date) returns uuid[] language sql stable as $$
  select array(
    select f.id
    from public.consultorias_por_ocupacao(p_busca, 50, 0, p_mes) with ordinality f
    order by f.ordinality)
$$;

-- Começo do mês atual no horário de São Paulo. Nas primeiras horas do mês, os check-ins de hoje (de até
-- 40 minutos atrás) podem cair no mês passado: aí o teste do realizado do mês atual é pulado.
create function testes.comeco_do_mes() returns boolean language sql stable as $$
  select now() < date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    + interval '1 hour'
$$;

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- A: admin_a, pessoa_a, gestor_a2, pessoa_a2 (veio da B) e pessoa_zero (carga 0); inativa_a não conta.
-- B: admin_b e pessoa_b (com ausências em novembro/2037). C: todos com carga 0. D: arquivada.
-- Os três da sugestão em A têm "Sugestão" no nome; a busca "sugestao" deixa admin_a e pessoa_a de fora.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('C');
select testes.consultoria('D', true);
select testes.perfil('central', 'central', null, 'Central Ocupação');
select testes.perfil('admin_a', 'admin', 'A', 'Alice Admin');
select testes.perfil('pessoa_a', 'pessoa', 'A', 'Paulo Pessoa');
select testes.perfil('gestor_a2', 'gestor', 'A', 'Carlos Sugestão');
select testes.perfil('pessoa_a2', 'pessoa', 'B', 'Bruna Sugestão');
select testes.perfil('pessoa_zero', 'pessoa', 'A', 'Diego Sugestão', 0);
select testes.perfil('inativa_a', 'pessoa', 'A', 'Elisa Sugestão', 44, false);
select testes.perfil('admin_b', 'admin', 'B', 'Beatriz Admin');
select testes.perfil('pessoa_b', 'pessoa', 'B', 'Pedro Pessoa');
select testes.perfil('admin_c', 'admin', 'C', 'Cecília Admin', 0);
select testes.perfil('pessoa_c', 'pessoa', 'C', 'Caio Pessoa', 0);
select testes.perfil('pessoa_d', 'pessoa', 'D', 'Davi Sugestão');

-- pessoa_a2 trabalha 10 h para a B em outubro/2026 e depois passa para a A: o cliente dela na B volta a
-- aguardar consultor, e as 10 h continuam da B.
select testes.cliente('b_antigo', 10, 'B', 'pessoa_a2');
select testes.como('pessoa_a2');
insert into public.checkins (cliente_id, inicio, fim, descricao)
values (testes.id('b_antigo'), '2026-10-20 09:00-03', '2026-10-20 19:00-03', 'Trabalho pela consultoria B');
reset role;
select set_config('request.jwt.claims', '', true);
update public.perfis set consultoria_id = testes.id('A') where id = testes.id('pessoa_a2');

-- O time do gestor tem só pessoa_a2: a sugestão mostra também quem está fora dos times dele.
select testes.time('time_a', 'A', 'gestor_a2');
insert into public.time_membros (time_id, pessoa_id) values (testes.id('time_a'), testes.id('pessoa_a2'));

select testes.cliente('a40', 40, 'A', 'pessoa_a2');
select testes.cliente('a30', 30, 'A', 'pessoa_a2');
select testes.cliente('a_arq', 50, 'A', 'pessoa_a2', true);
select testes.cliente('a120', 120, 'A', 'gestor_a2');
select testes.cliente('a_agu', 20, 'A', null);
select testes.cliente('b_admin', 10, 'B', 'admin_b');
select testes.cliente('b_agu', 5, 'B', null);
select testes.cliente('c_agu', 8, 'C', null);
select testes.cliente('x_central', 12, null, null);

-- Ausências de pessoa_b que se sobrepõem: 23 a 27 e 26 a 30/11/2037 = 6 dias úteis (23 a 27 e 30).
-- 19 - 6 = 13 dias x 44 / 5 = 114,4.
insert into public.ausencias (perfil_id, de, ate, motivo) values
  (testes.id('pessoa_b'), '2037-11-23', '2037-11-27', 'Férias'),
  (testes.id('pessoa_b'), '2037-11-26', '2037-11-30', 'Licença');

-- Outubro/2026 de pessoa_a2 na A: 2 x 23 h 06 = 46,2 h.
select testes.como('pessoa_a2');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('a40'), '2026-10-05 08:00-03', '2026-10-06 07:06-03', 'Implantação'),
  (testes.id('a40'), '2026-10-07 08:00-03', '2026-10-08 07:06-03', 'Implantação');
reset role;

-- Mês atual do gestor: um fechado de 12 minutos (0,2 h) e um aberto, que não conta.
select testes.como('gestor_a2');
insert into public.checkins (cliente_id, inicio, fim, descricao)
values (testes.id('a120'), now() - interval '40 minutes', now() - interval '28 minutes', 'Reunião de acompanhamento');
insert into public.checkins (cliente_id, inicio) values (testes.id('a120'), now() - interval '10 minutes');
reset role;

-- ── Consultores da consultoria (escolher o consultor) ────────────────────────

select testes.como('admin_a');
select is(testes.ordem('A', 'sugestao', testes.futuro()),
  array[testes.id('pessoa_a2'), testes.id('gestor_a2'), testes.id('pessoa_zero')],
  'consultores em ordem de menor ocupação, capacidade 0 por último');
select is((select f.total from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f limit 1),
  3::bigint, 'total da busca: a inativa fica de fora');
select is((select f.capacidade from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_a2')),
  167.2::numeric, 'capacidade do mês: 19 dias úteis x 44 h / 5');
select is((select f.reservado from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_a2')),
  70::numeric, 'reservado: 40 + 30 h dos clientes ativos (o arquivado não conta)');
select is((select round(f.ocupacao, 3) from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_a2')),
  0.419::numeric, 'ocupação de pessoa_a2: 70 / 167,2');
select is((select f.clientes from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_a2')),
  2, 'clientes ativos de pessoa_a2 (nem o arquivado nem o que ficou na B)');
select is((select round(f.ocupacao, 3) from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f
    where f.id = testes.id('gestor_a2')),
  0.718::numeric, 'ocupação de gestor_a2: 120 / 167,2');
select ok((select f.capacidade = 0 and f.ocupacao is null
    from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_zero')),
  'carga 0: capacidade 0 e ocupação nula, sem divisão por zero');
select ok((select f.nome = 'Bruna Sugestão' and f.email = 'pessoa.a2@ocupacao.test' and f.papel = 'pessoa'
      and f.consultoria_id = testes.id('A') and f.consultoria_nome = 'Ocupação Teste A' and f.carga_semanal = 44
    from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_a2')),
  'a linha traz nome, e-mail, papel, consultoria e carga');

-- Paginação
select is(array(select f.id from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 1, 1, testes.futuro()) f),
  array[testes.id('gestor_a2')], 'limite 1 e deslocamento 1: o segundo');
select is((select f.total from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 1, 1, testes.futuro()) f),
  3::bigint, 'o total não muda com a página');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 0, 0, testes.futuro())),
  1::bigint, 'limite abaixo de 1 vira 1');
select is((select f.id from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 1, -5, testes.futuro()) f),
  testes.id('pessoa_a2'), 'deslocamento negativo vira 0');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'), null, null, null, testes.futuro())),
  5::bigint, 'sem busca, limite e deslocamento nulos: os 5 consultores ativos da A');

-- Busca
select is((select f.total from public.consultores_por_ocupacao(testes.id('A'), '  SUGESTÃO ', 8, 0, testes.futuro()) f limit 1),
  3::bigint, 'busca sem acento, sem diferença de maiúsculas e sem os espaços das pontas');
select is(array(select f.id from public.consultores_por_ocupacao(testes.id('A'), 'pessoa.a2@', 8, 0, testes.futuro()) f),
  array[testes.id('pessoa_a2')], 'busca pelo e-mail');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'), '%', 8, 0, testes.futuro())),
  0::bigint, 'busca por % procura o caractere, não amplia');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'), '_', 8, 0, testes.futuro())),
  0::bigint, 'busca por _ procura o caractere, não amplia');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'), '\', 8, 0, testes.futuro())),
  0::bigint, 'busca por \ não dá erro');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'), '   ', 8, 0, testes.futuro())),
  5::bigint, 'busca em branco não filtra');
reset role;

-- ── Mês passado e mês atual ──────────────────────────────────────────────────

select testes.como('admin_a');
select is((select f.realizado from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.passado()) f
    where f.id = testes.id('pessoa_a2')),
  46.2::numeric, 'realizado do mês: só os check-ins dela pela A (as 10 h da B ficam fora)');
select is((select f.reservado from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.passado()) f
    where f.id = testes.id('pessoa_a2')),
  null::numeric, 'mês passado não tem reservado');
select is((select f.ocupacao from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, testes.passado()) f
    where f.id = testes.id('pessoa_a2')),
  0.25::numeric, 'mês passado: utilização = realizado / capacidade (46,2 / 184,8)');
select is(testes.ordem('A', 'sugestao', '2026-10-31'),
  array[testes.id('gestor_a2'), testes.id('pessoa_a2'), testes.id('pessoa_zero')],
  'mês passado em ordem de utilização (qualquer dia do mês serve)');
reset role;

select testes.como('gestor_a2');
select case when testes.comeco_do_mes() then skip('primeira hora do mês: o realizado do mês atual é pulado', 1)
  else is((select f.realizado from public.consultores_por_ocupacao(testes.id('A'), 'sugestao') f
      where f.id = testes.id('gestor_a2')),
    0.2::numeric, 'mês atual (padrão): o check-in aberto não conta no realizado') end;
select ok((select f.reservado = 70
      and f.capacidade = public.capacidade_do_mes(f.id, (now() at time zone 'America/Sao_Paulo')::date)
    from public.consultores_por_ocupacao(testes.id('A'), 'sugestao') f
    where f.id = testes.id('pessoa_a2')),
  'mês atual (padrão): reservado e a capacidade do mês de São Paulo');
select ok(exists (select 1 from public.consultores_por_ocupacao(testes.id('A'), null, 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_zero')),
  'o gestor vê na sugestão quem está fora dos times dele');
reset role;

-- ── Capacidade com ausências e o mês de novembro/2026 ────────────────────────

select testes.como('central');
select is((select f.capacidade from public.consultores_por_ocupacao(testes.id('B'), null, 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_b')),
  114.4::numeric, 'ausências sobrepostas descontam cada dia útil uma vez');
select is((select f.capacidade from public.consultores_por_ocupacao(testes.id('B'), null, 8, 0, testes.futuro()) f
    where f.id = testes.id('pessoa_b')),
  public.capacidade_do_mes(testes.id('pessoa_b'), testes.futuro()), 'a mesma conta de capacidade_do_mes');
select is((select f.capacidade from public.consultores_por_ocupacao(testes.id('A'), 'sugestao', 8, 0, '2026-11-16') f
    where f.id = testes.id('pessoa_a2')),
  167.2::numeric, 'novembro/2026 com 44 h: 167,2');
reset role;

-- ── Quem pode ────────────────────────────────────────────────────────────────

select testes.como('pessoa_a');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'))), 0::bigint,
  'pessoa não vê a ocupação da consultoria');
reset role;

select testes.como('admin_b');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('A'))), 0::bigint,
  'outra consultoria não vê nada');
reset role;

select testes.como('admin_a');
select is((select count(*) from public.consultores_por_ocupacao(null)), 0::bigint,
  'só a central pede todas as consultorias');
reset role;

select testes.como('central');
select is(array(select distinct f.consultoria_id from public.consultores_por_ocupacao(null, 'ocupacao.test', 50) f order by 1),
  array(select id from testes.fx where nome in ('A', 'B', 'C') order by 1),
  'central sem consultoria: as consultorias ativas (a arquivada fica de fora)');
select is((select f.total from public.consultores_por_ocupacao(null, 'ocupacao.test', 50) f limit 1), 9::bigint,
  'central sem consultoria: 5 da A, 2 da B e 2 da C (nem central, nem inativa, nem da arquivada)');
select is((select count(*) from public.consultores_por_ocupacao(testes.id('D'))), 0::bigint,
  'consultoria arquivada não tem sugestão');
reset role;

select ok(not has_function_privilege('anon', 'public.consultores_por_ocupacao(uuid, text, int, int, date)', 'execute')
    and not has_function_privilege('anon', 'public.consultorias_por_ocupacao(text, int, int, date)', 'execute'),
  'anon não executa as funções de ocupação');
select ok(has_function_privilege('authenticated', 'public.consultores_por_ocupacao(uuid, text, int, int, date)', 'execute')
    and has_function_privilege('authenticated', 'public.consultorias_por_ocupacao(text, int, int, date)', 'execute'),
  'authenticated executa as funções de ocupação');

-- ── Consultorias (mandar para uma consultoria) ───────────────────────────────

-- Novembro/2037: A = 4 x 167,2 = 668,8 de capacidade e 40 + 30 + 120 + 20 (aguardando) = 210 reservadas
-- (0,314); B = 167,2 + 114,4 = 281,6 e 10 + 10 + 5 = 25 (0,089); C só com carga 0.
select testes.como('central');
select is(testes.ordem_consultorias('ocupacao teste', testes.futuro()),
  array[testes.id('B'), testes.id('A'), testes.id('C')],
  'consultorias em ordem de menor ocupação, capacidade 0 por último');
select is((select f.total from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f limit 1),
  3::bigint, 'total da busca: a arquivada fica de fora');
select is((select f.aguardando from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('A')),
  1, 'aguardando consultor na A');
select is((select f.aguardando from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('B')),
  2, 'aguardando consultor na B (inclui o cliente de quem saiu)');
select ok((select f.consultores = 5 and f.clientes = 4
    from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('A')),
  'A: 5 consultores ativos e 4 clientes ativos');
select is((select f.capacidade from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('A')),
  668.8::numeric, 'capacidade da consultoria = soma da dos consultores ativos');
select is((select f.reservado from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('A')),
  210::numeric, 'reservado da consultoria inclui os clientes aguardando consultor');
select is((select round(f.ocupacao, 3) from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('A')),
  0.314::numeric, 'ocupação da A: 210 / 668,8');
select is((select f.capacidade from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('B')),
  281.6::numeric, 'capacidade da B com as ausências');
select ok((select f.capacidade = 0 and f.ocupacao is null and f.consultores = 2 and f.reservado = 8
    from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.futuro()) f
    where f.id = testes.id('C')),
  'consultoria só com carga 0: capacidade 0 e ocupação nula, sem divisão por zero');
select is(array(select f.id from public.consultorias_por_ocupacao('ocupacao teste', 1, 2, testes.futuro()) f),
  array[testes.id('C')], 'limite 1 e deslocamento 2: a última');
select is((select f.reservado from public.consultorias_por_ocupacao('ocupacao teste') f where f.id = testes.id('A')),
  210::numeric, 'mês atual (padrão): reservado pela previsão de hoje');

-- Outubro/2026: A = 4 x 184,8 = 739,2 e 46,2 h feitas (0,0625); B = 2 x 184,8 = 369,6 e as 10 h de pessoa_a2.
select is((select f.realizado from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.passado()) f
    where f.id = testes.id('A')),
  46.2::numeric, 'realizado da consultoria no mês');
select is((select f.realizado from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.passado()) f
    where f.id = testes.id('B')),
  10::numeric, 'o check-in fica com a consultoria daquele momento, mesmo depois de a pessoa sair');
select ok((select f.reservado is null and f.ocupacao = 0.0625
    from public.consultorias_por_ocupacao('ocupacao teste', 8, 0, testes.passado()) f
    where f.id = testes.id('A')),
  'mês passado: sem reservado, utilização = realizado / capacidade');

-- Busca
select is(array(select f.id from public.consultorias_por_ocupacao('OCUPAÇÃO teste b') f),
  array[testes.id('B')], 'busca pelo nome, sem acento e sem diferença de maiúsculas');
select is((select count(*) from public.consultorias_por_ocupacao('%', 50) f
    where f.id in (select id from testes.fx where nome in ('A', 'B', 'C', 'D'))),
  0::bigint, 'busca por % procura o caractere, não amplia');
select is((select count(*) from public.consultorias_por_ocupacao('_', 50) f
    where f.id in (select id from testes.fx where nome in ('A', 'B', 'C', 'D'))),
  0::bigint, 'busca por _ procura o caractere, não amplia');
reset role;

select testes.como('admin_a');
select is((select count(*) from public.consultorias_por_ocupacao()), 0::bigint,
  'administrador da consultoria não vê as consultorias');
reset role;

select testes.como('gestor_a2');
select is((select count(*) from public.consultorias_por_ocupacao()), 0::bigint,
  'gestor não vê as consultorias');
reset role;

select * from finish();
rollback;
