-- painel_do_inicio: os números do painel do Início numa chamada só, no recorte de quem chama (central: tudo;
-- administrador e gestor: a consultoria; consultor: o que é dele). Os números têm de ser os de
-- consultores_por_ocupacao e consultorias_por_ocupacao. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(124);

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

-- p_criado e p_enviado servem para datas antigas (séculos atrás: nenhum cliente real é mais velho, então os da fila vêm primeiro em qualquer banco) (o gatilho grava "agora" ao inserir).
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

-- Todas as consultorias de consultorias_por_ocupacao (página a página, 50 por vez), para comparar sem depender de
-- quantas existem no banco.
create function testes.todas_consultorias(p_mes date)
returns table (id uuid, nome text, capacidade numeric, reservado numeric, realizado numeric, ocupacao numeric)
language sql stable as $$
  select c.id, c.nome, c.capacidade, c.reservado, c.realizado, c.ocupacao
  from generate_series(0, 2000, 50) o
  cross join lateral public.consultorias_por_ocupacao(null, 50, o, p_mes) c
$$;

-- Segundos fechados (soma direta dos check-ins, sem o resumo) no mês de p_mes, das consultorias não arquivadas.
create function testes.realizado_segundos(p_mes date) returns numeric language sql stable as $$
  select coalesce(sum(extract(epoch from k.fim - k.inicio)), 0)
  from public.checkins k
  join public.consultorias co on co.id = k.consultoria_id and co.arquivada_em is null
  where k.fim is not null
    and date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date = p_mes
$$;

-- Segundos no resumo de uma consultoria e mês.
create function testes.resumo(p_consultoria text, p_mes date) returns numeric language sql stable as $$
  select coalesce(sum(segundos), 0) from public.checkins_horas_mes where consultoria_id = testes.id(p_consultoria) and mes = p_mes
$$;

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

-- Time do gestor_a: só pessoa_a está nele (gestor vê a si, o time e quem criou); pessoa_c e pessoa_d ficam fora.
create temp table t_time as select gen_random_uuid() as id;
insert into public.times (id, consultoria_id, nome, gestor_id, criado_por)
select id, testes.id('A'), 'Time painel', testes.id('gestor_a'), testes.id('gestor_a') from t_time;
insert into public.time_membros (time_id, pessoa_id, adicionado_por)
select id, testes.id('pessoa_a'), testes.id('gestor_a') from t_time;

select testes.cliente('a40', 40, 'A', 'pessoa_a');
select testes.cliente('a30', 30, 'A', 'pessoa_a');
select testes.cliente('c200', 200, 'A', 'pessoa_c');
select testes.cliente('sem_a', 25, 'A', null, '1900-12-01', '1903-01-01');
select testes.cliente('arq_a', 15, 'A', null, '1900-12-01', '1900-12-01', true);
select testes.cliente('b10', 10, 'B', 'pessoa_b');
select testes.cliente('sem_b', 12, 'B', null, '1900-12-01', '1904-01-01');
select testes.cliente('dist1', 8, null, null, '1901-01-01');
select testes.cliente('dist2', 9, null, null, '1902-01-01');

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
select ok((select jsonb_array_length(j -> 'esperando') between 4 and 5 from p_central),
  'central: esperando traz no máximo 5 (os 4 da fixture, mais algum de verdade se houver)');
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
    left join testes.todas_consultorias(testes.futuro()) c on c.id = (r ->> 'id')::uuid
    where c.id is null
      or row(c.nome, c.capacidade, c.ocupacao)
        is distinct from row(r ->> 'nome', (r ->> 'capacidade')::numeric, (r ->> 'ocupacao')::numeric))
    from p_central),
  'central: ranking de consultorias (até 8) com os números de consultorias_por_ocupacao');
select ok((select not exists (
    select 1 from p_central, jsonb_array_elements(j -> 'ranking') with ordinality a(r, o)
    join jsonb_array_elements(j -> 'ranking') with ordinality b(r, o) on b.o = a.o + 1
    where (a.r ->> 'ocupacao')::numeric < (b.r ->> 'ocupacao')::numeric) from p_central),
  'central: ranking do mais ocupado ao menos ocupado');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = (select sum(c.capacidade) from testes.todas_consultorias(testes.futuro()) c)
    and (j -> 'indicadores' ->> 'reservado')::numeric = (select sum(c.reservado) from testes.todas_consultorias(testes.futuro()) c)
    and (j -> 'indicadores' ->> 'realizado')::numeric = round(testes.realizado_segundos(testes.futuro()) / 3600, 1)
    from p_central),
  'central: capacidade e reservado somam as consultorias de consultorias_por_ocupacao; realizado = soma em segundos, arredondada uma vez');
select ok((select (j ->> 'passado')::boolean is false from p_central), 'mês futuro: passado = false');
select ok((select not exists (
    select 1 from p_central, jsonb_array_elements(j -> 'extremos' -> 'acima') e where (e ->> 'ocupacao')::numeric <= 1)
  and jsonb_array_length(j -> 'extremos' -> 'acima') <= 3 and jsonb_array_length(j -> 'extremos' -> 'folga') <= 3 from p_central),
  'central: extremos têm até 3 de cada lado e quem está acima passa de 100%');
select ok((select j -> 'meus_clientes' = '[]'::jsonb and j -> 'ranking' is not null from p_central), 'central: sem meus clientes');
select ok((select not exists (select 1 from p_central, jsonb_array_elements(j -> 'extremos' -> 'acima' || (j -> 'extremos' -> 'folga')) e
    where (e ->> 'visivel')::boolean is not true)),
  'central: visivel true em todos os extremos');
reset role;

-- Ocupação do mês passado (utilização) e flag.
select testes.como('central');
create temp table p_central_passado as select public.painel_do_inicio(testes.passado()) as j;
grant select on p_central_passado to authenticated;
select ok((select (j ->> 'passado')::boolean from p_central_passado), 'mês passado: passado = true');
select ok((select (j -> 'indicadores' ->> 'realizado')::numeric = round(testes.realizado_segundos(testes.passado()) / 3600, 1)
    from p_central_passado), 'central, mês passado: realizado = soma em segundos dos check-ins, arredondada uma vez');
select ok((select j -> 'indicadores' -> 'reservado' = 'null'::jsonb from p_central_passado), 'mês passado: reservado nulo');
reset role;

-- ── Administrador da consultoria A ───────────────────────────────────────────
select testes.como('admin_a');
create temp table p_admin as select public.painel_do_inicio(testes.futuro()) as j;
grant select on p_admin to authenticated;

select is((select j ->> 'recorte' from p_admin), 'consultoria', 'administrador: recorte consultoria');
select is((select j ->> 'mes' from p_admin), '2037-11-01', 'devolve o mês pedido');
select is((select (public.painel_do_inicio() -> 'indicadores' ->> 'clientes_novos')::int), 3,
  'administrador: novos do mês atual (a40, a30, c200; sem_a e arq_a são de 1900)');
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
select ok((select bool_and((r ->> 'visivel')::boolean) from p_admin, jsonb_array_elements(j -> 'ranking') r), 'administrador: visivel true em todo o ranking');
reset role;

-- ── Gestor: a consultoria inteira ────────────────────────────────────────────
select testes.como('gestor_a');
select is((select array_agg((r ->> 'visivel')::boolean order by r ->> 'nome') filter (where (r ->> 'id')::uuid in (testes.id('pessoa_a'), testes.id('pessoa_c'), testes.id('gestor_a')))
    from jsonb_array_elements(public.painel_do_inicio(testes.futuro()) -> 'ranking') r),
  array[true, true, false], 'gestor: visivel true para si e para o time dele (pessoa_a), false para pessoa_c (fora do time)');
select is((select array_agg((e ->> 'visivel')::boolean) from jsonb_array_elements(public.painel_do_inicio(testes.futuro()) -> 'extremos' -> 'acima') e
    where (e ->> 'id')::uuid = testes.id('pessoa_c')), array[false], 'gestor: extremos trazem visivel false para quem ele não vê');
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

-- ── Período (de/até, pedido do Diego em 17/11) ───────────────────────────────
-- Realizado = check-ins que começam entre de e até (dias de São Paulo); capacidade = a do mês proporcional aos dias
-- úteis de cada mês dentro do período (dias úteis sem feriado e sem ausência x carga / 5); utilização = realizado /
-- capacidade; nada de reservado nem previsão fora do Mês.
-- 16/09 a 15/10/2026: 11 dias úteis em setembro (16 a 30) + 10 em outubro (1 a 15, sem o feriado de 12/10) = 21
-- x 44 / 5 = 184,8 h por consultor. pessoa_d tem 5 dias úteis de ausência dentro (28/09 a 02/10: 3 + 2) e uma fora
-- (20 a 23/10): 16 x 8,8 = 140,8. Consultoria A: 4 x 184,8 + 140,8 + 0 (zero_a) = 880 h (inativo_a não conta).
-- Check-ins da pessoa_c nas bordas: 23h de 15/09 e 00h de 16/10 ficam fora; 00h10 de 16/09 (1 h) e 22h de 15/10
-- (1,5 h) entram. Realizado da A no período: 46,2 (pessoa_a, outubro) + 2,5 = 48,7 h.
select set_config('request.jwt.claims', '', true);
insert into public.ausencias (perfil_id, de, ate, motivo) values
  (testes.id('pessoa_d'), '2026-09-28', '2026-10-02', 'Férias'),
  (testes.id('pessoa_d'), '2026-10-20', '2026-10-23', 'Férias');
select testes.como('pessoa_c');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('c200'), '2026-09-15 23:00-03', '2026-09-15 23:50-03', 'Antes do período'),
  (testes.id('c200'), '2026-09-16 00:10-03', '2026-09-16 01:10-03', 'Primeiro dia'),
  (testes.id('c200'), '2026-10-15 22:00-03', '2026-10-15 23:30-03', 'Último dia'),
  (testes.id('c200'), '2026-10-16 00:00-03', '2026-10-16 02:00-03', 'Depois do período');
reset role;
select set_config('request.jwt.claims', '', true);

-- Segundos fechados (soma direta dos check-ins, sem o resumo) que começam entre p_de e p_ate em São Paulo, das
-- consultorias não arquivadas (p_consultoria nula = todas). Roda como o sistema (sem RLS).
create function testes.segundos_no_periodo(p_consultoria uuid, p_de date, p_ate date) returns numeric language sql stable as $$
  select coalesce(sum(extract(epoch from k.fim - k.inicio)), 0)
  from public.checkins k
  join public.consultorias co on co.id = k.consultoria_id and co.arquivada_em is null
  where k.fim is not null
    and (p_consultoria is null or k.consultoria_id = p_consultoria)
    and k.inicio >= p_de::timestamp at time zone 'America/Sao_Paulo'
    and k.inicio < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
$$;

select testes.como('admin_a');
create temp table p_admin_periodo as select public.painel_do_inicio(p_de => '2026-09-16', p_ate => '2026-10-15') as j;
create temp table p_admin_meio as select public.painel_do_inicio(p_de => '2026-08-20', p_ate => '2026-10-15') as j;
create temp table p_admin_outubro as select public.painel_do_inicio(p_de => '2026-10-01', p_ate => '2026-10-31') as j;
create temp table p_admin_mes_outubro as select public.painel_do_inicio(testes.passado()) as j;
create temp table p_admin_trinta as select public.painel_do_inicio(
  p_de => (now() at time zone 'America/Sao_Paulo')::date - 29, p_ate => (now() at time zone 'America/Sao_Paulo')::date) as j;
reset role;

select ok((select (j ->> 'intervalo')::boolean and j ->> 'de' = '2026-09-16' and j ->> 'ate' = '2026-10-15'
    and j ->> 'mes' = '2026-10-01' and (j ->> 'passado')::boolean from p_admin_periodo),
  'período: intervalo, de e até como pedidos, mês = o do fim do período, passado (sem previsão)');
select ok((select not (j ->> 'intervalo')::boolean and j ->> 'de' = '2026-10-01' and j ->> 'ate' = '2026-10-31'
    from p_admin_passado), 'Mês: intervalo = false, de e até = o mês inteiro');
select is((select (j -> 'indicadores' ->> 'capacidade')::numeric from p_admin_periodo), 880::numeric,
  'período: capacidade proporcional aos dias úteis de cada mês (21 dias), descontando a ausência dentro do período (880 h)');
select is((select (r ->> 'capacidade')::numeric from p_admin_periodo, jsonb_array_elements(j -> 'ranking') r
    where r ->> 'id' = testes.id('pessoa_d')::text), 140.8::numeric,
  'período: a ausência fora do período não desconta (pessoa_d: 16 dias úteis, 140,8 h)');
select is((select (j -> 'indicadores' ->> 'realizado')::numeric from p_admin_periodo), 48.7::numeric,
  'período: realizado = check-ins que começam entre de e até em São Paulo (46,2 + 1 + 1,5; as bordas de fora não entram)');
select is((select (j -> 'indicadores' ->> 'realizado')::numeric from p_admin_periodo),
  round(testes.segundos_no_periodo(testes.id('A'), '2026-09-16', '2026-10-15') / 3600, 1),
  'período: realizado igual à soma direta dos check-ins (sem mês inteiro, só bordas)');
select is((select (j -> 'indicadores' ->> 'realizado')::numeric from p_admin_meio),
  round(testes.segundos_no_periodo(testes.id('A'), '2026-08-20', '2026-10-15') / 3600, 1),
  'período com um mês inteiro no meio (resumo) e duas bordas: realizado igual à soma direta (59,5 h)');
select is((select (j -> 'indicadores' ->> 'realizado')::numeric from p_admin_meio), 59.5::numeric,
  'período de 20/08 a 15/10: setembro inteiro (11,8 h) + 1 a 15/10 (47,7 h)');
select ok((select (j -> 'indicadores' ->> 'ocupacao')::numeric = round(48.7 / 880, 4) from p_admin_periodo),
  'período: ocupação = utilização = realizado / capacidade do período');
select ok((select j -> 'indicadores' -> 'reservado' = 'null'::jsonb and j -> 'previsao_atual' = 'null'::jsonb from p_admin_periodo),
  'período passado: sem reservado e sem previsão');
select ok((select (j ->> 'intervalo')::boolean and (j ->> 'passado')::boolean and j -> 'indicadores' -> 'reservado' = 'null'::jsonb
    and j -> 'previsao_atual' = 'null'::jsonb from p_admin_trinta),
  'últimos 30 dias (inclui hoje): também sem reservado nem previsão (a previsão só existe no Mês)');
select is((select (j -> 'indicadores' ->> 'clientes_novos')::int from p_admin_trinta), 3,
  'últimos 30 dias: novos = criados dentro do período (a40, a30, c200)');
select is((select (j -> 'indicadores' ->> 'clientes_novos')::int from p_admin_periodo), 0,
  'período de setembro a outubro: nenhum cliente novo');
select is((select j -> 'ranking' -> 0 ->> 'id' from p_admin_periodo), testes.id('pessoa_a')::text,
  'período: ranking pela utilização no período (pessoa_a, 46,2 de 184,8, primeiro)');
select ok((select (j -> 'ranking' -> 0 ->> 'ocupacao')::numeric = 0.25 and (j -> 'ranking' -> 0 ->> 'capacidade')::numeric = 184.8
    from p_admin_periodo), 'período: utilização (25%) e capacidade do período no ranking');
select ok((select not exists (
    select 1 from p_admin_periodo, jsonb_array_elements(j -> 'ranking') with ordinality a(r, o)
    join jsonb_array_elements(j -> 'ranking') with ordinality b(r, o) on b.o = a.o + 1
    where coalesce((a.r ->> 'ocupacao')::numeric, -1) < coalesce((b.r ->> 'ocupacao')::numeric, -1))),
  'período: ranking da maior para a menor utilização');
select ok((select j -> 'extremos' -> 'acima' = '[]'::jsonb and jsonb_array_length(j -> 'extremos' -> 'folga') = 3
    from p_admin_periodo), 'período: extremos pela utilização no período (ninguém acima de 100%, 3 com folga)');
select ok((select j::text not like '%' || testes.id('B')::text || '%'
    and j::text not like '%' || testes.id('pessoa_b')::text || '%'
    and j::text not like '%Painel Teste B%' from p_admin_periodo),
  'período: nada de outra consultoria (as 23,1 h da pessoa_b em outubro não entram)');
select is((select array_agg(e ->> 'mes' order by o) from p_admin_periodo, jsonb_array_elements(j -> 'horas_por_mes') with ordinality t(e, o)),
  array['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'],
  'período curto: gráfico com os 6 meses que terminam no mês do fim');
select is((select array_agg((e ->> 'no_periodo')::boolean order by o) from p_admin_periodo, jsonb_array_elements(j -> 'horas_por_mes') with ordinality t(e, o)),
  array[false, false, false, false, true, true], 'período: no_periodo marca os meses tocados pelo período');
select is((select array_agg((e ->> 'realizado')::numeric order by o) from p_admin_periodo, jsonb_array_elements(j -> 'horas_por_mes') with ordinality t(e, o)),
  array[0, 0, 0, 0, 11.8, 49.7]::numeric[], 'período: cada barra é o mês inteiro (setembro 11,8 h; outubro 49,7 h)');
select is((select array_agg((e ->> 'no_periodo')::boolean order by o) from p_admin_passado, jsonb_array_elements(j -> 'horas_por_mes') with ordinality t(e, o)),
  array[false, false, false, false, false, true], 'Mês: só o mês escolhido fica marcado no gráfico');
select ok((select (o.j -> 'indicadores' ->> 'capacidade')::numeric = (m.j -> 'indicadores' ->> 'capacidade')::numeric
    and (o.j -> 'indicadores' ->> 'realizado')::numeric = (m.j -> 'indicadores' ->> 'realizado')::numeric
    and (o.j -> 'indicadores' ->> 'ocupacao')::numeric = (m.j -> 'indicadores' ->> 'ocupacao')::numeric
    from p_admin_outubro o, p_admin_mes_outubro m),
  'um mês inteiro como período dá a mesma capacidade, realizado e utilização do Mês passado');

-- Central no período: realizado de todas as consultorias igual à soma direta.
select testes.como('central');
create temp table p_central_meio as select public.painel_do_inicio(p_de => '2026-08-20', p_ate => '2026-10-15') as j;
reset role;
select is((select (j -> 'indicadores' ->> 'realizado')::numeric from p_central_meio),
  round(testes.segundos_no_periodo(null, '2026-08-20', '2026-10-15') / 3600, 1),
  'central no período: realizado = soma direta dos check-ins de todas as consultorias ativas');

-- Consultor no período: só o dele, sem previsto.
select testes.como('pessoa_a');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = 184.8 and (j -> 'indicadores' ->> 'realizado')::numeric = 46.2
    and (j -> 'indicadores' ->> 'ocupacao')::numeric = 0.25 and j -> 'indicadores' -> 'reservado' = 'null'::jsonb
    from (select public.painel_do_inicio(p_de => '2026-09-16', p_ate => '2026-10-15') as j) x),
  'consultor no período: capacidade do período, o realizado dele e a utilização');
select ok((select j -> 'meus_clientes' -> 0 ->> 'id' = testes.id('a40')::text
    and (j -> 'meus_clientes' -> 0 ->> 'realizado')::numeric = 46.2 and j -> 'meus_clientes' -> 0 -> 'previsto' = 'null'::jsonb
    from (select public.painel_do_inicio(p_de => '2026-09-16', p_ate => '2026-10-15') as j) x),
  'consultor no período: meus clientes pelo realizado do período, sem previsto');
reset role;
select testes.como('pessoa_b');
select is((select (public.painel_do_inicio(p_de => '2026-09-16', p_ate => '2026-10-15') -> 'indicadores' ->> 'realizado')::numeric),
  23.1::numeric, 'outro consultor no período vê só o dele (23,1 h)');
reset role;

-- Limites do período (o banco confere, além da tela).
select testes.como('admin_a');
select throws_ok($$ select public.painel_do_inicio(p_de => '2026-10-15', p_ate => '2026-10-01') $$, '22023', null,
  'período: de depois de até é recusado');
select throws_ok($$ select public.painel_do_inicio(p_de => '2026-10-01', p_ate => null) $$, '22023', null,
  'período: de sem até é recusado');
select throws_ok($$ select public.painel_do_inicio(p_mes => '2026-10-01', p_de => '2026-10-01', p_ate => '2026-10-15') $$, '22023', null,
  'período: mês e período juntos são recusados');
select throws_ok($$ select public.painel_do_inicio(p_de => (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date,
    p_ate => (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date) $$, '22023', null,
  'período: até depois do fim do mês atual é recusado');
select lives_ok($$ select public.painel_do_inicio(p_de => date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
    p_ate => (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month - 1 day')::date) $$,
  'período: até no último dia do mês atual é aceito');
select throws_ok($$ select public.painel_do_inicio(p_de => '2024-01-01', p_ate => '2026-01-01') $$, '22023', null,
  'período: mais de 2 anos é recusado');
select is((select jsonb_array_length(public.painel_do_inicio(p_de => '2024-01-02', p_ate => '2026-01-01') -> 'horas_por_mes')), 24,
  'período de 2 anos (25 meses tocados): o gráfico mostra no máximo 24 meses');
select is((select public.painel_do_inicio(p_de => '2024-01-02', p_ate => '2026-01-01') -> 'horas_por_mes' -> 23 ->> 'mes'), '2026-01-01',
  'período longo: o gráfico termina no mês do fim');
select is((select jsonb_array_length(public.painel_do_inicio(p_de => '2025-01-01', p_ate => '2026-10-31') -> 'horas_por_mes')), 22,
  'período de 22 meses: uma barra por mês do período');
reset role;
select is((select count(*)::int from pg_proc where proname = 'painel_do_inicio' and pronamespace = 'public'::regnamespace), 1,
  'uma função painel_do_inicio só (sem sobrecarga ambígua para o PostgREST)');
-- Desfaz a fixture do período (o teste do check-in aberto, mais abaixo, conta com a pessoa_c sem check-ins depois de 2025).
delete from public.checkins where cliente_id = testes.id('c200') and inicio >= '2026-09-15' and inicio < '2026-10-17';
delete from public.ausencias where perfil_id = testes.id('pessoa_d') and de in ('2026-09-28', '2026-10-20');

-- ── Capacidade 0 ─────────────────────────────────────────────────────────────
select testes.como('admin_z');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = 0 and j -> 'indicadores' -> 'ocupacao' = 'null'::jsonb
    from (select public.painel_do_inicio(testes.futuro()) as j) x), 'capacidade 0 na consultoria: ocupação nula');
reset role;
select testes.como('zero_a');
select ok((select (j -> 'indicadores' ->> 'capacidade')::numeric = 0 and j -> 'indicadores' -> 'ocupacao' = 'null'::jsonb
    from (select public.painel_do_inicio(testes.futuro()) as j) x), 'capacidade 0 no consultor: ocupação nula');
reset role;

-- ── Realizado do topo = barra do mês (arredonda uma vez, no fim) ───────────────
-- Dois check-ins de 2 min em consultorias diferentes: cada um sozinho arredonda para 0,0 h, juntos dão 0,1 h.
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values (testes.id('a40'), '2026-08-03 08:00-03', '2026-08-03 08:02-03', 'Ajuste');
reset role;
select testes.como('pessoa_b');
insert into public.checkins (cliente_id, inicio, fim, descricao) values (testes.id('b10'), '2026-08-03 09:00-03', '2026-08-03 09:02-03', 'Ajuste');
reset role;
select testes.como('central');
select ok((select (j -> 'indicadores' ->> 'realizado')::numeric = (j -> 'horas_por_mes' -> 5 ->> 'realizado')::numeric
    from (select public.painel_do_inicio('2026-08-01') as j) x),
  'realizado do topo = barra do mês, arredondando uma vez só no fim');
reset role;

-- ── Resumo de horas por mês (checkins_horas_mes), mantido por gatilho ────────────
-- O resumo bate com a soma direta dos check-ins fechados, em cada consultoria e mês.
select ok((select not exists (
    select 1 from (
      select k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date as mes,
        sum(extract(epoch from k.fim - k.inicio)) as segundos
      from public.checkins k where k.fim is not null group by 1, 2) d
    full join public.checkins_horas_mes r on r.consultoria_id = d.consultoria_id and r.mes = d.mes
    where coalesce(d.segundos, 0) is distinct from coalesce(r.segundos, 0))),
  'resumo de horas: igual à soma direta dos check-ins fechados');
-- Check-in fechado soma no mês de início; mudar o fim ajusta; apagar desfaz.
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values (testes.id('a40'), '2026-07-03 08:00-03', '2026-07-03 10:00-03', 'Julho');
reset role;
select is((select segundos from public.checkins_horas_mes where consultoria_id = testes.id('A') and mes = '2026-07-01'), 7200::numeric,
  'resumo de horas: check-in fechado soma as horas no mês dele');
update public.checkins set fim = '2026-07-03 09:00-03' where cliente_id = testes.id('a40') and inicio = '2026-07-03 08:00-03';
select is((select segundos from public.checkins_horas_mes where consultoria_id = testes.id('A') and mes = '2026-07-01'), 3600::numeric,
  'resumo de horas: mudar o fim ajusta o resumo');
delete from public.checkins where cliente_id = testes.id('a40') and inicio = '2026-07-03 08:00-03';
select is((select coalesce(sum(segundos), 0) from public.checkins_horas_mes where consultoria_id = testes.id('A') and mes = '2026-07-01'), 0::numeric,
  'resumo de horas: apagar o check-in desfaz a soma');
select testes.como('pessoa_a');
select throws_ok($$ select * from public.checkins_horas_mes $$, '42501', null, 'resumo de horas: sem acesso direto para quem está logado');
reset role;

-- ── Gatilho do resumo: mudanças que mexem no mês, na consultoria ou no fechamento ──
-- Meses de 2025 (sem outros dados). Tudo feito pela pessoa_a (cliente a40, consultoria A); depois, como o sistema,
-- mexemos nas colunas do check-in.
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('a40'), '2025-04-10 08:00-03', '2025-04-10 10:00-03', 'Abril');
reset role;
update public.checkins set inicio = '2025-03-10 08:00-03', fim = '2025-03-10 10:00-03' where inicio = '2025-04-10 08:00-03' and cliente_id = testes.id('a40');
select is(testes.resumo('A', '2025-03-01'), 7200::numeric, 'resumo: mudar o início para outro mês soma no mês novo');
select is(testes.resumo('A', '2025-04-01'), 0::numeric, 'resumo: mudar o início para outro mês tira do mês antigo');
update public.checkins set consultoria_id = testes.id('B') where inicio = '2025-03-10 08:00-03' and cliente_id = testes.id('a40');
select is(testes.resumo('B', '2025-03-01'), 7200::numeric, 'resumo: mudar a consultoria soma na nova');
select is(testes.resumo('A', '2025-03-01'), 0::numeric, 'resumo: mudar a consultoria tira da antiga');
delete from public.checkins where inicio = '2025-03-10 08:00-03' and cliente_id = testes.id('a40');

-- Aberto não conta; fechar soma; reabrir desfaz. (Pela pessoa_c: o aberto vai até o infinito e a pessoa_a tem check-ins depois.)
select testes.como('pessoa_c');
insert into public.checkins (cliente_id, inicio, descricao) values (testes.id('c200'), '2025-05-10 08:00-03', 'Maio');
reset role;
select is(testes.resumo('A', '2025-05-01'), 0::numeric, 'resumo: check-in aberto não entra');
update public.checkins set fim = '2025-05-10 09:00-03' where inicio = '2025-05-10 08:00-03' and cliente_id = testes.id('c200');
select is(testes.resumo('A', '2025-05-01'), 3600::numeric, 'resumo: fechar o check-in soma as horas');
update public.checkins set fim = null where inicio = '2025-05-10 08:00-03' and cliente_id = testes.id('c200');
select is(testes.resumo('A', '2025-05-01'), 0::numeric, 'resumo: reabrir o check-in desfaz a soma');
delete from public.checkins where inicio = '2025-05-10 08:00-03' and cliente_id = testes.id('c200');

-- Virada do mês em São Paulo: 22h de 30/06 (já é julho em UTC) é junho; 00h10 de 01/07 é julho.
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('a40'), '2025-06-30 22:00-03', '2025-06-30 23:00-03', 'Virada'),
  (testes.id('a40'), '2025-07-01 00:10-03', '2025-07-01 01:10-03', 'Virada');
reset role;
select is(testes.resumo('A', '2025-06-01'), 3600::numeric, 'resumo: 22h de 30/06 em São Paulo conta em junho');
select is(testes.resumo('A', '2025-07-01'), 3600::numeric, 'resumo: 00h10 de 01/07 em São Paulo conta em julho');
delete from public.checkins where cliente_id = testes.id('a40') and inicio in ('2025-06-30 22:00-03', '2025-07-01 00:10-03');

-- Editar só a descrição não mexe no resumo (o gatilho nem dispara): um resumo desajustado de propósito continua assim.
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values (testes.id('a40'), '2025-08-10 08:00-03', '2025-08-10 09:00-03', 'Agosto');
reset role;
update public.checkins_horas_mes set segundos = segundos + 1 where consultoria_id = testes.id('A') and mes = '2025-08-01';
update public.checkins set descricao = 'Agosto editado' where inicio = '2025-08-10 08:00-03' and cliente_id = testes.id('a40');
select is(testes.resumo('A', '2025-08-01'), 3601::numeric, 'resumo: editar só a descrição não mexe no resumo');
delete from public.checkins where inicio = '2025-08-10 08:00-03' and cliente_id = testes.id('a40');
select is(testes.resumo('A', '2025-08-01'), 1::numeric, 'resumo: apagar tira as horas do check-in (o 1 s desajustado fica)');

-- Realizado do topo: 3 s + 3 s + 174 s em três consultorias dão 0,1 h somando segundos (arredondando antes: 0,0).
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio, fim, descricao) values
  (testes.id('a40'), '2025-09-10 08:00-03', '2025-09-10 08:02:54-03', 'Setembro'),
  (testes.id('a40'), '2025-09-11 08:00-03', '2025-09-11 08:00:03-03', 'Setembro'),
  (testes.id('a40'), '2025-09-12 08:00-03', '2025-09-12 08:00:03-03', 'Setembro');
reset role;
update public.checkins set consultoria_id = testes.id('B') where inicio = '2025-09-11 08:00-03' and cliente_id = testes.id('a40');
update public.checkins set consultoria_id = testes.id('Z') where inicio = '2025-09-12 08:00-03' and cliente_id = testes.id('a40');
select testes.como('central');
select is((select (j -> 'indicadores' ->> 'realizado')::numeric from (select public.painel_do_inicio('2025-09-01') as j) x),
  round(testes.realizado_segundos('2025-09-01') / 3600, 1),
  'realizado do topo: soma em segundos e arredonda uma vez (3 s + 3 s + 174 s = 0,1 h)');
reset role;

-- O recálculo da migração (private.recalcular_horas_mes) refaz o resumo igual à recontagem direta, mesmo
-- com o resumo estragado.
update public.checkins_horas_mes set segundos = segundos + 999 where consultoria_id = testes.id('A') and mes = '2025-09-01';
delete from public.checkins_horas_mes where consultoria_id = testes.id('B') and mes = '2025-09-01';
insert into public.checkins_horas_mes (consultoria_id, mes, segundos) values (testes.id('Z'), '2020-01-01', 5);
select private.recalcular_horas_mes();
select ok((select not exists (
    select 1 from (
      select k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date as mes,
        sum(extract(epoch from k.fim - k.inicio)) as segundos
      from public.checkins k where k.fim is not null group by 1, 2) d
    full join public.checkins_horas_mes r on r.consultoria_id = d.consultoria_id and r.mes = d.mes
    where d.segundos is distinct from r.segundos)),
  'resumo: o recálculo da migração bate com a recontagem direta');
select ok((select exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'checkins_horas_mes'
    and indexdef like '%(mes)%')), 'resumo: índice por mês');

-- ── Sem recorte ──────────────────────────────────────────────────────────────
select testes.como('inativo_a');
select throws_ok($$ select public.painel_do_inicio() $$, '42501', null, 'pessoa inativa não recebe o painel');
reset role;

set role anon;
select throws_ok($$ select public.painel_do_inicio() $$, '42501', null, 'anônimo não executa');
reset role;

select * from finish();
rollback;
