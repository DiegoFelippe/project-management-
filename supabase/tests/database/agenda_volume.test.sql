-- Volume da agenda: 200 consultorias, 3.000 consultores, 2.000 clientes e 100.000 eventos em dois anos de história
-- (jan/2025 a dez/2026), com 50.000 participantes, criados aqui e desfeitos no fim (rollback: nada fica no banco). A
-- leitura de uma semana (eventos_do_periodo, com participantes) e os indicadores precisam responder em até 150 ms para
-- a central, 100 ms para uma consultoria e 75 ms para um consultor (média de 5 execuções, com 50% de folga); a aba
-- Agenda do cliente (o mês e os números só daquele cliente), em até 50 ms para cada papel. Além do tempo, o plano das
-- consultas de cada papel não pode varrer a tabela de eventos inteira (Seq Scan): é o que garante que o tempo não
-- cresce com os anos de história. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create schema testes;
grant usage on schema testes to authenticated;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Semana de 8 a 14 de novembro de 2026, pela função que a tela chama; devolve quantos eventos vieram.
create function testes.semana() returns bigint language sql stable as $$
  select jsonb_array_length(public.eventos_do_periodo(timestamptz '2026-11-08 00:00-03', timestamptz '2026-11-15 00:00-03') -> 'itens')
$$;
grant execute on function testes.semana() to authenticated;

-- true quando o plano da consulta tem Seq Scan em agenda_eventos.
create function testes.varre_eventos(p_sql text) returns boolean language plpgsql as $$
declare v_plano jsonb;
begin
  execute 'explain (format json) ' || p_sql into v_plano;
  return jsonb_path_exists(v_plano, '$.** ? (@."Node Type" == "Seq Scan" && @."Relation Name" == "agenda_eventos")');
end $$;

-- Participantes da semana lidos direto pela tabela (a regra de leitura reaproveita a dos eventos).
create function testes.participantes_da_semana() returns bigint language sql stable as $$
  select count(*) from public.agenda_participantes p
  where p.evento_id in (
    select e.id from public.agenda_eventos e
    where e.inicio >= timestamptz '2026-11-08 00:00-03' and e.inicio < timestamptz '2026-11-15 00:00-03')
$$;
grant execute on function testes.participantes_da_semana() to authenticated;

create function testes.media_ms() returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop perform testes.semana(); perform public.indicadores_da_agenda(date '2026-11-10'); end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms() to authenticated;

-- A aba Agenda do cliente: o mês visível (novembro, na grade de domingo a sábado) e os 4 números, só do cliente.
create function testes.aba_do_cliente() returns jsonb language sql stable as $$
  select public.eventos_do_periodo(timestamptz '2026-11-01 00:00-03', timestamptz '2026-12-06 00:00-03',
    p_cliente => testes.id('k1')) || public.indicadores_da_agenda(date '2026-11-10', testes.id('k1'))
$$;
grant execute on function testes.aba_do_cliente() to authenticated;

select set_config('request.jwt.claims', '', true);

create temp table v_consultorias (n int primary key, id uuid not null default gen_random_uuid());
insert into v_consultorias (n) select generate_series(1, 200);
insert into public.consultorias (id, nome) select id, 'Volume agenda ' || n from v_consultorias;

create temp table v_pessoas (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pessoas (n) select generate_series(0, 3000);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'agvolume' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;

-- n = 0 é a central; 1 a 200 administradores (um por consultoria); o resto 'pessoa'. Consultor n é da
-- consultoria (n - 1) % 200 + 1.
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Consultor volume ' || p.n, 'agvolume' || p.n || '@volume.test',
  case when p.n = 0 then 'central' when p.n <= 200 then 'admin' else 'pessoa' end
from v_pessoas p
left join v_consultorias c on p.n > 0 and c.n = (p.n - 1) % 200 + 1;
insert into testes.fx select 'central', id from v_pessoas where n = 0;
insert into testes.fx select 'adm1', id from v_pessoas where n = 1;
insert into testes.fx select 'c1', id from v_consultorias where n = 1;
insert into testes.fx select 'pessoa401', id from v_pessoas where n = 401;

-- 2.000 clientes, 10 por consultoria (sem consultor escolhido: a agenda não depende disso). Cada consultor atende um
-- cliente da consultoria dele, o k = ((n - 1) / 200) % 10; o k1 é o do pessoa401 (e do 2401).
create temp table v_clientes (consultoria_n int, k int, id uuid not null default gen_random_uuid(),
  primary key (consultoria_n, k));
insert into v_clientes (consultoria_n, k) select c.n, k from v_consultorias c cross join generate_series(0, 9) k;
insert into public.clientes (id, nome, horas_mes, consultoria_id)
select k.id, 'Cliente volume ' || k.consultoria_n || '-' || k.k, 10, c.id
from v_clientes k join v_consultorias c on c.n = k.consultoria_n;
insert into testes.fx select 'k1', id from v_clientes where consultoria_n = 1 and k = 2;

-- 100.000 eventos entre 1º/jan/2025 e 31/dez/2026 (a semana medida tem cerca de 1/104 deles), de 1 h, dos 3.000
-- consultores; metade com Meet, 5% aguardando, 2% com pasta; cerca de um quarto (27.000) com o cliente do consultor.
create temp table v_eventos (n int primary key, id uuid not null default gen_random_uuid());
insert into v_eventos (n) select generate_series(1, 100000);

insert into public.agenda_eventos (id, consultoria_id, consultor_id, cliente_id, titulo, inicio, fim, com_meet, reuniao, pasta_id)
select v.id, c.id, p.id, k.id, 'Evento volume ' || v.n,
  timestamptz '2025-01-01 08:00-03' + ((v.n * 7919) % 730) * interval '1 day' + (v.n % 10) * interval '1 hour',
  timestamptz '2025-01-01 09:00-03' + ((v.n * 7919) % 730) * interval '1 day' + (v.n % 10) * interval '1 hour',
  v.n % 2 = 0, case when v.n % 20 = 0 then 'aguardando' else 'agendada' end, null
from v_eventos v
join v_pessoas p on p.n = (v.n - 1) % 3000 + 1
join v_consultorias c on c.n = (p.n - 1) % 200 + 1
left join v_clientes k on ((v.n - 1) / 3000) % 4 = 0 and k.consultoria_n = c.n and k.k = ((p.n - 1) / 200) % 10;

-- 50.000 participantes: o convidado de dentro é um consultor da mesma consultoria; mais 15.000 de fora (e-mail).
insert into public.agenda_participantes (evento_id, perfil_id)
select v.id, q.id
from v_eventos v
join v_pessoas p on p.n = (v.n - 1) % 3000 + 1
join v_pessoas q on q.n = (p.n - 1 + 200 * (1 + v.n % 5)) % 3000 + 1
where v.n <= 50000 and q.id <> p.id;
insert into public.agenda_participantes (evento_id, email)
select v.id, 'fora' || v.n || '@exemplo.com' from v_eventos v where v.n > 50000 and v.n <= 65000;

analyze public.agenda_eventos;
analyze public.agenda_participantes;

select testes.como('central');
select diag('central, média medida: ' || testes.media_ms() || ' ms');
select ok(testes.semana() > 500, 'a central lê a semana com centenas de eventos');
select performs_within('select testes.semana(), public.indicadores_da_agenda(date ''2026-11-10'')', 112.5, 112.5, 5,
  'central (100.000 eventos): a semana e os indicadores em até 150 ms na média (+50%)');
select performs_within('select testes.aba_do_cliente()', 25, 25, 5,
  'central, aba Agenda do cliente: o mês e os números do cliente em até 50 ms na média');
reset role;

select testes.como('adm1');
select diag('participantes da semana (administrador), ' || (select count(*) from testes.participantes_da_semana()) || ' linhas');
select performs_within('select testes.participantes_da_semana()', 50, 50, 5,
  'administrador: os participantes da semana, pela regra de leitura nova, em até 100 ms na média (+50%)');
select diag('administrador, média medida: ' || testes.media_ms() || ' ms');
select ok(testes.semana() > 0, 'o administrador lê a semana da consultoria');
select performs_within('select testes.semana(), public.indicadores_da_agenda(date ''2026-11-10'')', 75, 75, 5,
  'administrador (15 consultores): a semana e os indicadores em até 100 ms na média (+50%)');
select performs_within('select testes.aba_do_cliente()', 25, 25, 5,
  'administrador, aba Agenda do cliente: o mês e os números do cliente em até 50 ms na média');
reset role;

select testes.como('pessoa401');
select performs_within('select testes.participantes_da_semana()', 50, 50, 5,
  'consultor: os participantes da semana, pela regra de leitura nova, em até 100 ms na média (+50%)');
select diag('consultor, média medida: ' || testes.media_ms() || ' ms');
select performs_within('select testes.semana(), public.indicadores_da_agenda(date ''2026-11-10'')', 56.25, 56.25, 5,
  'consultor (33 eventos, próprios e convidados): a semana e os indicadores em até 75 ms na média (+50%)');
select performs_within('select testes.aba_do_cliente()', 25, 25, 5,
  'consultor, aba Agenda do cliente: o mês e os números do cliente em até 50 ms na média');
reset role;

-- Planos: as consultas de cada papel (as mesmas ramas de eventos_do_periodo) não varrem a tabela inteira.
select ok(not testes.varre_eventos(format($$
  select e.id from public.agenda_eventos e
  where e.consultoria_id = %L and e.inicio >= timestamptz '2026-11-08 00:00-03' - interval '31 days'
    and e.inicio < timestamptz '2026-11-15 00:00-03' and e.fim > timestamptz '2026-11-08 00:00-03'
  order by e.inicio, e.id limit 1001 $$, testes.id('c1'))),
  'administrador/gestor: a semana usa índice (sem Seq Scan em agenda_eventos)');
select ok(not testes.varre_eventos(format($$
  select e.id, e.inicio from public.agenda_eventos e
  where e.consultor_id = %1$L and e.inicio >= timestamptz '2026-11-08 00:00-03' - interval '31 days'
    and e.inicio < timestamptz '2026-11-15 00:00-03' and e.fim > timestamptz '2026-11-08 00:00-03'
  union all
  select e.id, e.inicio from public.agenda_participantes p join public.agenda_eventos e on e.id = p.evento_id
  where p.perfil_id = %1$L and e.consultor_id <> %1$L and e.consultoria_id = %2$L
    and e.inicio >= timestamptz '2026-11-08 00:00-03' - interval '31 days'
    and e.inicio < timestamptz '2026-11-15 00:00-03' and e.fim > timestamptz '2026-11-08 00:00-03'
  order by 2 limit 1001 $$, testes.id('pessoa401'), testes.id('c1'))),
  'consultor: próprios + convidados usam índice (sem Seq Scan em agenda_eventos)');
select ok(not testes.varre_eventos($$
  select e.id from public.agenda_eventos e
  where e.inicio >= timestamptz '2026-11-08 00:00-03' - interval '31 days'
    and e.inicio < timestamptz '2026-11-15 00:00-03' and e.fim > timestamptz '2026-11-08 00:00-03'
  order by e.inicio, e.id limit 1001 $$),
  'central: a semana usa o índice por início (sem Seq Scan em agenda_eventos)');
-- A aba do cliente (p_cliente): o filtro do cliente em cada ramo também vai por índice.
select ok(not testes.varre_eventos(format($$
  select e.id from public.agenda_eventos e
  where e.cliente_id = %L and e.inicio >= timestamptz '2026-11-01 00:00-03' - interval '31 days'
    and e.inicio < timestamptz '2026-12-06 00:00-03' and e.fim > timestamptz '2026-11-01 00:00-03'
  order by e.inicio, e.id limit 1001 $$, testes.id('k1'))),
  'central, aba do cliente: o período do cliente usa índice (sem Seq Scan em agenda_eventos)');
select ok(not testes.varre_eventos(format($$
  select e.inicio, e.cliente_id, e.com_meet, e.pasta_id from public.agenda_eventos e
  where e.consultoria_id = %L and e.cliente_id = %L
    and e.inicio >= timestamptz '2026-11-01 00:00-03' and e.inicio < timestamptz '2026-12-01 00:00-03' $$,
  testes.id('c1'), testes.id('k1'))),
  'administrador/gestor, aba do cliente: os números do cliente usam índice (sem Seq Scan em agenda_eventos)');
select ok(not testes.varre_eventos(format($$
  select 1 from public.agenda_eventos e
  where e.reuniao = 'aguardando' and e.cliente_id is not null and e.cliente_id = %L $$, testes.id('k1'))),
  'aba do cliente: o "aguardando" do cliente usa índice (sem Seq Scan em agenda_eventos)');
select ok(testes.varre_eventos($$ select e.id from public.agenda_eventos e where e.titulo = 'x' $$),
  'controle do teste: uma consulta sem índice é pega como Seq Scan');

select * from finish();
rollback;
