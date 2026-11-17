-- painel_do_inicio: os números do painel do Início numa chamada só, no recorte de quem chama (central: tudo;
-- administrador e gestor: a consultoria; consultor: o que é dele). Os números têm de ser os de
-- consultores_por_ocupacao e consultorias_por_ocupacao. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text, p_carga numeric default 44,
  p_ativo boolean default true)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@painel.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, carga_semanal, ativo)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@painel.test', p_papel, p_carga, p_ativo);
  return v;
end $$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Painel Teste ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- p_criado e p_enviado servem para datas antigas (o gatilho grava "agora" ao inserir).
create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text,
  p_criado timestamptz default null, p_enviado timestamptz default null, p_arquivado boolean default false)
returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, p_horas, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  if p_criado is not null then update public.clientes set criado_em = p_criado where id = v; end if;
  if p_enviado is not null then update public.clientes set enviado_em = p_enviado where id = v; end if;
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

-- novembro/2037: 19 dias úteis x 44 h / 5 = 167,2 (mês futuro, com reservado). outubro/2026: 184,8 (passado).
create function testes.futuro() returns date language sql immutable as $$ select date '2037-11-01' $$;
create function testes.passado() returns date language sql immutable as $$ select date '2026-10-01' $$;

select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('Z');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_c', 'pessoa', 'A');
select testes.perfil('pessoa_d', 'pessoa', 'A');
select testes.perfil('zero_a', 'pessoa', 'A', 0);
select testes.perfil('inativo_a', 'pessoa', 'A', 44, false);
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.perfil('admin_z', 'admin', 'Z', 0);

select testes.cliente('a40', 40, 'A', 'pessoa_a');
select testes.cliente('a30', 30, 'A', 'pessoa_a');
select testes.cliente('c200', 200, 'A', 'pessoa_c');
select testes.cliente('sem_a', 25, 'A', null, '2000-12-01', '2003-01-01');
select testes.cliente('arq_a', 15, 'A', null, '2000-12-01', '2000-12-01', true);
select testes.cliente('b10', 10, 'B', 'pessoa_b');
select testes.cliente('sem_b', 12, 'B', null, '2000-12-01', '2004-01-01');
select testes.cliente('dist1', 8, null, null, '2001-01-01');
select testes.cliente('dist2', 9, null, null, '2002-01-01');

-- Check-ins: outubro/2026 de pessoa_a (2 x 23 h 06 = 46,2 h) e setembro/2026 (10 h); pessoa_b em outubro (23 h 06).
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('a40'), '2026-10-05 08:00-03', '2026-10-06 07:06-03', 'Implantação'),
  (testes.id('a40'), '2026-10-07 08:00-03', '2026-10-08 07:06-03', 'Implantação'),
  (testes.id('a30'), '2026-09-02 08:00-03', '2026-09-02 18:00-03', 'Reunião');
reset role;
select testes.como('pessoa_b');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('b10'), '2026-10-05 08:00-03', '2026-10-06 07:06-03', 'Implantação');
reset role;
select set_config('request.jwt.claims', '', true);

-- ── Central: tudo ────────────────────────────────────────────────────────────
select testes.como('central');
create temp table p_central as select public.painel_do_inicio(testes.futuro()) as j;
grant select on p_central to authenticated;

select is((select j ->> 'recorte' from p_central), 'tudo', 'central: recorte tudo');
select is((select (j -> 'indicadores' ->> 'a_distribuir')::bigint from p_central),
  (select count(*) from public.clientes where not arquivado and consultoria_id is null),
  'central: a distribuir = clientes ativos sem consultoria');
select is((select (j -> 'indicadores' ->> 'sem_consultor')::bigint from p_central),
  (select count(*) from public.clientes where not arquivado and consultoria_id is not null and consultor_id is null),
  'central: sem consultor = ativos de consultoria sem consultor');
select is((select (j -> 'indicadores' ->> 'aguardando')::bigint from p_central),
  (select (j -> 'indicadores' ->> 'a_distribuir')::bigint + (j -> 'indicadores' ->> 'sem_consultor')::bigint from p_central),
  'central: aguardando = a distribuir + sem consultor');
select is((select (j -> 'indicadores' ->> 'clientes_ativos')::bigint from p_central),
  (select count(*) from public.clientes where not arquivado), 'central: clientes ativos = todos os não arquivados');
select is((select (j -> 'indicadores' ->> 'clientes_novos')::bigint from p_central), 0::bigint,
  'central: em novembro/2037 nenhum cliente é novo (criado_em dentro do mês)');
select is((select jsonb_array_length(j -> 'esperando') from p_central), 5, 'central: esperando traz no máximo 5');
select is((select array_agg(e ->> 'id' order by o) from p_central, jsonb_array_elements(j -> 'esperando') with ordinality t(e, o) where o <= 4),
  array[testes.id('dist1')::text, testes.id('dist2')::text, testes.id('sem_a')::text, testes.id('sem_b')::text],
  'central: esperando do mais antigo ao mais novo, a distribuir e sem consultor juntos');
select is((select array_agg(e ->> 'situacao' order by o) from p_central, jsonb_array_elements(j -> 'esperando') with ordinality t(e, o) where o <= 4),
  array['a_distribuir', 'a_distribuir', 'sem_consultor', 'sem_consultor'], 'central: situação de cada um');
select is((select e ->> 'consultoria_nome' from p_central, jsonb_array_elements(j -> 'esperando') e
    where e ->> 'id' = testes.id('sem_a')::text), 'Painel Teste A', 'central: o sem consultor mostra a consultoria');
select ok((select not exists (
    select 1 from p_central, jsonb_array_elements(j -> 'esperando') e where e ->> 'id' = testes.id('arq_a')::text)),
  'central: cliente arquivado não espera');
select ok((select jsonb_array_length(j -> 'ranking') <= 8 and not exists (
    select 1 from p_central, jsonb_array_elements(j -> 'ranking') r
    left join public.consultorias_por_ocupacao(null, 50, 0, testes.futuro()) c on c.id = (r ->> 'id')::uuid
    where c.id is null
      or row(c.nome, c.capacidade, c.ocupacao)
        is distinct from row(r ->> 'nome', (r ->> 'capacidade')::numeric, (r ->> 'ocupacao')::numeric))
    from p_central),
  'central: ranking de consultorias (até 8) com os números de consultorias_por_ocupacao');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = (select sum(c.capacidade) from public.consultorias_por_ocupacao(null, 50, 0, testes.futuro()) c)
    and (j -> 'indicadores' ->> 'reservado')::numeric = (select sum(c.reservado) from public.consultorias_por_ocupacao(null, 50, 0, testes.futuro()) c)
    and (j -> 'indicadores' ->> 'realizado')::numeric = (select sum(c.realizado) from public.consultorias_por_ocupacao(null, 50, 0, testes.futuro()) c)
    from p_central),
  'central: capacidade, reservado e realizado somam as consultorias de consultorias_por_ocupacao');
select ok((select (j ->> 'passado')::boolean is false from p_central), 'mês futuro: passado = false');
select ok((select not exists (
    select 1 from p_central, jsonb_array_elements(j -> 'extremos' -> 'acima') e where (e ->> 'ocupacao')::numeric <= 1)
  and jsonb_array_length(j -> 'extremos' -> 'acima') <= 3 and jsonb_array_length(j -> 'extremos' -> 'folga') <= 3 from p_central),
  'central: extremos têm até 3 de cada lado e quem está acima passa de 100%');
select ok((select j -> 'meus_clientes' = '[]'::jsonb and j -> 'ranking' is not null from p_central), 'central: sem meus clientes');
reset role;

-- Ocupação do mês passado (utilização) e flag.
select testes.como('central');
create temp table p_central_passado as select public.painel_do_inicio(testes.passado()) as j;
grant select on p_central_passado to authenticated;
select ok((select (j ->> 'passado')::boolean from p_central_passado), 'mês passado: passado = true');
select ok((select (j -> 'indicadores' ->> 'realizado')::numeric = (select sum(c.realizado) from public.consultorias_por_ocupacao(null, 50, 0, testes.passado()) c)
    from p_central_passado), 'central, mês passado: realizado = soma de consultorias_por_ocupacao');
select ok((select j -> 'indicadores' -> 'reservado' = 'null'::jsonb from p_central_passado), 'mês passado: reservado nulo');
reset role;

-- ── Administrador da consultoria A ───────────────────────────────────────────
select testes.como('admin_a');
create temp table p_admin as select public.painel_do_inicio(testes.futuro()) as j;
grant select on p_admin to authenticated;

select is((select j ->> 'recorte' from p_admin), 'consultoria', 'administrador: recorte consultoria');
select is((select j ->> 'mes' from p_admin), '2037-11-01', 'devolve o mês pedido');
select is((select (public.painel_do_inicio() -> 'indicadores' ->> 'clientes_novos')::int), 3,
  'administrador: novos do mês atual (a40, a30, c200; sem_a e arq_a são de 2000)');
select is((select (j -> 'indicadores' ->> 'clientes_ativos')::int from p_admin), 4,
  'administrador: ativos da consultoria (a40, a30, c200, sem_a; o arquivado não conta)');
select is((select (j -> 'indicadores' ->> 'aguardando')::int from p_admin), 1, 'administrador: aguardando = sem consultor da consultoria');
select is((select (j -> 'indicadores' ->> 'sem_consultor')::int from p_admin), 1, 'administrador: sem consultor = 1');
select is((select (j -> 'indicadores' ->> 'a_distribuir')::int from p_admin), 0, 'administrador: nada a distribuir (a fila é da central)');
select is((select (j -> 'indicadores' ->> 'reservado')::numeric from p_admin), 295::numeric,
  'administrador: reservado = 40 + 30 + 200 + 25 (inclui quem espera consultor, como a lista de Consultorias)');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = (select sum(c.capacidade) from public.consultores_por_ocupacao(testes.id('A'), null, 50, 0, testes.futuro()) c)
    from p_admin), 'administrador: capacidade = soma de consultores_por_ocupacao da consultoria');
select ok((select (j -> 'indicadores' ->> 'ocupacao')::numeric = round((j -> 'indicadores' ->> 'reservado')::numeric / (j -> 'indicadores' ->> 'capacidade')::numeric, 4)
    from p_admin), 'administrador: ocupação = reservado / capacidade');
select is((select jsonb_array_length(j -> 'esperando') from p_admin), 1, 'administrador: só espera o sem consultor da própria consultoria');
select is((select j -> 'esperando' -> 0 ->> 'id' from p_admin), testes.id('sem_a')::text, 'administrador: o que espera é o sem_a');
select ok((select not exists (
    select 1 from p_admin, jsonb_array_elements(j -> 'ranking') r
    left join public.consultores_por_ocupacao(testes.id('A'), null, 50, 0, testes.futuro()) c on c.id = (r ->> 'id')::uuid
    where c.id is null
      or row(c.nome, c.capacidade, c.ocupacao)
        is distinct from row(r ->> 'nome', (r ->> 'capacidade')::numeric, (r ->> 'ocupacao')::numeric))
  and (select jsonb_array_length(j -> 'ranking') from p_admin) = 6),
  'administrador: ranking dos 6 consultores da consultoria, com os números de consultores_por_ocupacao');
select is((select j -> 'ranking' -> 0 ->> 'id' from p_admin), testes.id('pessoa_c')::text, 'ranking: o mais ocupado primeiro');
select is((select array_agg(e ->> 'id') from p_admin, jsonb_array_elements(j -> 'extremos' -> 'acima') e),
  array[testes.id('pessoa_c')::text], 'extremos: só pessoa_c passa de 100% (200 h de 167,2)');
select ok((select jsonb_array_length(j -> 'extremos' -> 'folga') = 3 and not exists (
    select 1 from p_admin, jsonb_array_elements(j -> 'extremos' -> 'folga') e where (e ->> 'ocupacao')::numeric >= 1) from p_admin),
  'extremos: 3 com folga, nenhum acima de 100%');
select ok((select not exists (
    select 1 from p_admin, jsonb_array_elements(j -> 'extremos' -> 'folga') e where e ->> 'id' = testes.id('pessoa_c')::text)),
  'extremos: quem está acima não aparece na folga');
select ok((select j::text not like '%' || testes.id('B')::text || '%'
    and j::text not like '%' || testes.id('pessoa_b')::text || '%'
    and j::text not like '%' || testes.id('sem_b')::text || '%'
    and j::text not like '%Painel Teste B%' and j::text not like '%Cliente dist1%' from p_admin),
  'administrador: nada de outra consultoria nem da fila da central');
select ok((select j -> 'meus_clientes' = '[]'::jsonb from p_admin), 'administrador: sem meus clientes');
select is((select jsonb_array_length(j -> 'horas_por_mes') from p_admin), 6, 'horas por mês: 6 meses');
select is((select j -> 'horas_por_mes' -> 5 ->> 'mes' from p_admin), '2037-11-01', 'horas por mês: o último é o mês pedido');
select is((select (j ->> 'previsao_atual')::numeric from p_admin), 295::numeric, 'previsão atual = soma atual de horas_mes da consultoria');

-- Mês passado: utilização, histórico de horas por mês.
create temp table p_admin_passado as select public.painel_do_inicio(testes.passado()) as j;
grant select on p_admin_passado to authenticated;
select ok((select (j ->> 'passado')::boolean and j -> 'indicadores' -> 'reservado' = 'null'::jsonb from p_admin_passado),
  'administrador, mês passado: passado = true e reservado nulo');
select is((select (j -> 'indicadores' ->> 'realizado')::numeric from p_admin_passado), 46.2::numeric, 'realizado de outubro: 46,2 h');
select ok((select (j -> 'indicadores' ->> 'ocupacao')::numeric = round(46.2 / (j -> 'indicadores' ->> 'capacidade')::numeric, 4)
    from p_admin_passado), 'mês passado: ocupação = realizado / capacidade (utilização)');
select is((select array_agg(e ->> 'mes' order by o) from p_admin_passado, jsonb_array_elements(j -> 'horas_por_mes') with ordinality t(e, o)),
  array['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'],
  'horas por mês: seis meses terminando em outubro');
select is((select array_agg((e ->> 'realizado')::numeric order by o) from p_admin_passado, jsonb_array_elements(j -> 'horas_por_mes') with ordinality t(e, o)),
  array[0, 0, 0, 0, 10, 46.2]::numeric[], 'horas por mês: realizado de cada mês (só da consultoria A)');
reset role;

-- ── Gestor: a consultoria inteira ────────────────────────────────────────────
select testes.como('gestor_a');
select is((select jsonb_array_length(public.painel_do_inicio(testes.futuro()) -> 'ranking')), 6,
  'gestor: ranking cobre todos os consultores da consultoria (decisão do Diego)');
select is((select public.painel_do_inicio(testes.futuro()) ->> 'recorte'), 'consultoria', 'gestor: recorte consultoria');
reset role;

-- ── Consultor: só o dele ─────────────────────────────────────────────────────
select testes.como('pessoa_a');
create temp table p_pessoa as select public.painel_do_inicio(testes.futuro()) as j;
grant select on p_pessoa to authenticated;
select is((select j ->> 'recorte' from p_pessoa), 'pessoa', 'consultor: recorte pessoa');
select ok((select (j -> 'indicadores' ->> 'clientes_ativos')::int = 2 and (j -> 'indicadores' ->> 'reservado')::numeric = 70
    and (j -> 'indicadores' ->> 'capacidade')::numeric = 167.2 and (j -> 'indicadores' ->> 'aguardando')::int = 0
    from p_pessoa), 'consultor: 2 clientes, 70 h reservadas, capacidade 167,2, nada aguardando');
select ok((select j -> 'ranking' = '[]'::jsonb and j -> 'esperando' = '[]'::jsonb
    and j -> 'extremos' = '{"acima": [], "folga": []}'::jsonb from p_pessoa), 'consultor: sem ranking, esperando nem extremos');
select is((select array_agg(e ->> 'id' order by o) from p_pessoa, jsonb_array_elements(j -> 'meus_clientes') with ordinality t(e, o)),
  array[testes.id('a40')::text, testes.id('a30')::text], 'consultor: meus clientes pelo maior previsto');
select ok((select j::text not like '%' || testes.id('c200')::text || '%' and j::text not like '%' || testes.id('sem_a')::text || '%'
    and j::text not like '%Painel Teste B%' from p_pessoa), 'consultor: nenhum cliente de outra pessoa');
select ok((select j -> 'meus_clientes' -> 0 ->> 'previsto' = '40.0' or (j -> 'meus_clientes' -> 0 ->> 'previsto')::numeric = 40 from p_pessoa),
  'consultor: previsto do cliente');
select ok((select (j -> 'meus_clientes' -> 0 ->> 'realizado')::numeric = 46.2
    from (select public.painel_do_inicio(testes.passado()) as j) x),
  'consultor, mês passado: realizado do cliente = check-ins do mês');
select ok((select (j -> 'meus_clientes' -> 0 -> 'previsto') = 'null'::jsonb
    from (select public.painel_do_inicio(testes.passado()) as j) x), 'consultor, mês passado: sem previsto');
select ok((select (j -> 'indicadores' ->> 'realizado')::numeric = 46.2 and
    (j -> 'horas_por_mes' -> 4 ->> 'realizado')::numeric = 10
    from (select public.painel_do_inicio(testes.passado()) as j) x), 'consultor: realizado só dele, com histórico');
reset role;

select testes.como('pessoa_b');
select is((select (public.painel_do_inicio(testes.passado()) -> 'indicadores' ->> 'realizado')::numeric), 23.1::numeric,
  'outro consultor vê só o dele (23,1 h)');
reset role;

-- ── Capacidade 0 ─────────────────────────────────────────────────────────────
select testes.como('admin_z');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = 0 and j -> 'indicadores' -> 'ocupacao' = 'null'::jsonb
    from (select public.painel_do_inicio(testes.futuro()) as j) x), 'capacidade 0 na consultoria: ocupação nula');
reset role;
select testes.como('zero_a');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = 0 and j -> 'indicadores' -> 'ocupacao' = 'null'::jsonb
    from (select public.painel_do_inicio(testes.futuro()) as j) x), 'capacidade 0 no consultor: ocupação nula');
reset role;

-- ── Sem recorte ──────────────────────────────────────────────────────────────
select testes.como('inativo_a');
select throws_ok($$ select public.painel_do_inicio() $$, '42501', null, 'pessoa inativa não recebe o painel');
reset role;

set role anon;
select throws_ok($$ select public.painel_do_inicio() $$, '42501', null, 'anônimo não executa');
reset role;

select * from finish();
rollback;
