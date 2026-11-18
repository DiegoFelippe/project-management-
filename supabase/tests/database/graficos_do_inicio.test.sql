-- Funções dos gráficos do Início (design 2026-11-17-graficos-do-inicio-e-do-cliente): painel_do_inicio refeito,
-- comparacao_do_inicio, fila_de_clientes, clientes_em_risco, horas_por_cliente e checkins_por_semana, todas com o
-- recorte de private.recorte_do_inicio e o período de private.periodo_do_inicio. Duas consultorias (A e B) com central,
-- administrador e gestor de A, dois consultores de A e um de B; mais F (fila com 42 esperando) e K (ranking com 14
-- consultores). Datas relativas a hoje: o mês anterior (M) e os últimos 30 dias. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(108);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;
-- O que cada função devolveu a quem chamou.
create table testes.r (nome text primary key, j jsonb);

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Gráficos início ' || p_nome) returning id into v;
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
    p_nome || '@graficos-inicio.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, exige_2fa)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@graficos-inicio.test', p_papel, p_exige_2fa);
  return v;
end $$;

-- Cliente gravado como o sistema; p_desde = há quantos dias tem o consultor (consultor_desde no passado).
create function testes.cliente(p_nome text, p_horas numeric, p_consultoria text, p_consultor text,
  p_desde int default null, p_nome_tela text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values (coalesce(p_nome_tela, 'Cliente ' || p_nome), p_horas, testes.id(p_consultoria), testes.id(p_consultor))
  returning id into v;
  if p_desde is not null then
    update public.clientes set consultor_desde = now() - p_desde * interval '1 day' where id = v;
  end if;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Mudança no cliente feita como o sistema.
create function testes.mudar(p_nome text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute format('update public.clientes set %s where id = %L', p_sql, testes.id(p_nome));
end $$;

-- Check-in fechado gravado pelo consultor do cliente (o gatilho confere quem grava pelo JWT).
create function testes.checkin(p_consultor text, p_cliente text, p_inicio timestamptz, p_minutos int) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_consultor), 'role', 'authenticated')::text, true);
  insert into public.checkins (cliente_id, inicio, fim, descricao)
  values (testes.id(p_cliente), p_inicio, p_inicio + p_minutos * interval '1 minute', 'Gráficos do início');
  perform set_config('request.jwt.claims', '', true);
end $$;

create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
    || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- Chama uma função com o JWT de quem (as funções do Início são security definer: o recorte vem só do JWT).
create function testes.chamar(p_quem text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_quem), 'role', 'authenticated')::text, true);
  execute 'select (' || p_sql || ')::jsonb' into v;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
create function testes.guardar(p_nome text, p_quem text, p_sql text) returns void language sql as $$
  insert into testes.r values (p_nome, testes.chamar(p_quem, p_sql))
$$;
create function testes.j(p_nome text) returns jsonb language sql stable as $$
  select j from testes.r where nome = p_nome
$$;
-- O detalhe (a frase) do erro de um comando, com o JWT de quem.
create function testes.detalhe(p_quem text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform testes.chamar(p_quem, p_sql);
  return null;
exception when others then
  get stacked diagnostics v = pg_exception_detail;
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.mes_atual() returns date language sql stable as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.mes_anterior() returns date language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date
$$;
create function testes.fim_do_mes(p date) returns date language sql immutable as $$
  select (date_trunc('month', p::timestamp) + interval '1 month - 1 day')::date
$$;
create function testes.futuro() returns date language sql immutable as $$ select date '2037-11-01' $$;
-- Um instante do mês anterior (M): dia (0 = dia 1) e hora de São Paulo.
create function testes.em(p_dia int, p_hora numeric default 12) returns timestamptz language sql stable as $$
  select ((testes.mes_anterior() + p_dia)::timestamp + p_hora * interval '1 hour') at time zone 'America/Sao_Paulo'
$$;
-- Um instante num dia contado de hoje (negativo = passado), na hora de São Paulo.
create function testes.dia(p_dias int, p_hora numeric) returns timestamptz language sql stable as $$
  select ((testes.hoje() + p_dias)::timestamp + p_hora * interval '1 hour') at time zone 'America/Sao_Paulo'
$$;
-- O último instante de um dia de São Paulo (o fim de um período).
create function testes.fim_do_dia(p date) returns timestamptz language sql stable as $$
  select (p + 1)::timestamp at time zone 'America/Sao_Paulo' - interval '1 microsecond'
$$;
-- Segundos fechados (soma direta dos check-ins) de uma consultoria (nula = as não arquivadas) e, se pedido, de um
-- consultor, que começam entre p_de e p_ate em São Paulo.
create function testes.segundos(p_consultoria text, p_de date, p_ate date, p_consultor text default null)
returns numeric language sql stable as $$
  select coalesce(sum(extract(epoch from k.fim - k.inicio)), 0)
  from public.checkins k
  join public.consultorias co on co.id = k.consultoria_id and co.arquivada_em is null
  where k.fim is not null
    and (p_consultoria is null or k.consultoria_id = testes.id(p_consultoria))
    and (p_consultor is null or k.consultor_id = testes.id(p_consultor))
    and k.inicio >= p_de::timestamp at time zone 'America/Sao_Paulo'
    and k.inicio < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
$$;
-- Quantos check-ins fechados (contagem direta), como testes.segundos.
create function testes.quantos(p_consultoria text, p_de date, p_ate date, p_consultor text default null)
returns bigint language sql stable as $$
  select count(*)
  from public.checkins k
  where k.fim is not null
    and k.consultoria_id = testes.id(p_consultoria)
    and (p_consultor is null or k.consultor_id = testes.id(p_consultor))
    and k.inicio >= p_de::timestamp at time zone 'America/Sao_Paulo'
    and k.inicio < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
$$;
-- A situação da consultoria A num instante, contada direto nos trechos (sem a função do banco).
create function testes.situacao_a(p_instante timestamptz) returns table (em bigint, sem bigint, reservado numeric)
language sql stable as $$
  select count(*) filter (where s.consultor_id is not null), count(*) filter (where s.consultor_id is null),
    coalesce(sum(s.horas_mes), 0)
  from private.situacoes_dos_clientes s
  where s.consultoria_id = testes.id('A') and s.de <= p_instante and (s.ate is null or s.ate > p_instante)
$$;
-- Horas por cliente de A (soma direta), na ordem da função: só os clientes que hoje são de A.
create function testes.horas_a(p_de date, p_ate date)
returns table (id uuid, horas_mes numeric, segundos numeric, o bigint) language sql stable as $$
  select c.id, c.horas_mes, s.segundos,
    row_number() over (order by s.segundos desc, c.horas_mes desc, c.nome, c.id)
  from (
    select k.cliente_id, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from public.checkins k
    where k.consultoria_id = testes.id('A') and k.fim is not null
      and k.inicio >= p_de::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo'
    group by k.cliente_id) s
  join public.clientes c on c.id = s.cliente_id and c.consultoria_id = testes.id('A')
$$;
-- Os ids de uma lista do JSON, na ordem.
create function testes.ids(p jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(e ->> 'id' order by o), '{}') from jsonb_array_elements(p) with ordinality t(e, o)
$$;
-- O que não pode aparecer para a gestão da A: ids e nomes da consultoria B, das pessoas e dos clientes dela.
create function testes.sem_b(p jsonb) returns boolean language sql stable as $$
  select not exists (
    select 1 from unnest(array[testes.id('B')::text, 'Gráficos início B', testes.id('admin_b')::text, 'Pessoa admin_b',
      testes.id('pessoa_b')::text, 'Pessoa pessoa_b', testes.id('b_um')::text, 'Cliente B-um',
      testes.id('b_espera')::text, 'Cliente B-espera', testes.id('b_parado')::text, 'Cliente B-parado',
      testes.id('m_ab')::text, 'Cliente B-veio-de-A']) m
    where p::text like '%' || m || '%')
$$;
-- Nenhum cliente que hoje é da pessoa_a2 aparece.
create function testes.sem_clientes_da_a2(p jsonb) returns boolean language sql stable as $$
  select not exists (
    select 1 from public.clientes c
    where c.consultor_id = testes.id('pessoa_a2') and p::text like '%' || c.id::text || '%')
$$;

-- ── Dados ────────────────────────────────────────────────────────────────────
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('F');
select testes.consultoria('K');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('travado_a', 'pessoa', 'A', true);
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.perfil('admin_f', 'admin', 'F');
select testes.perfil('admin_k', 'admin', 'K');
select testes.perfil('pessoa_k' || lpad(i::text, 2, '0'), 'pessoa', 'K') from generate_series(2, 14) i;

-- Ausência da pessoa_a no mês anterior (3 dias): a capacidade daquele mês desconta.
select set_config('request.jwt.claims', '', true);
insert into public.ausencias (perfil_id, de, ate, motivo)
values (testes.id('pessoa_a'), testes.mes_anterior() + 9, testes.mes_anterior() + 11, 'Férias');

-- Horas por cliente: h01 a h20 (ímpares da pessoa_a, pares da pessoa_a2), um check-in cada no mês anterior (dia i,
-- 8h, i x 12 min). h_x: 1 h da pessoa_a, depois passa para a pessoa_a2, que faz 30 min.
select testes.cliente('h' || lpad(i::text, 2, '0'), 5 + i, 'A', case when i % 2 = 1 then 'pessoa_a' else 'pessoa_a2' end)
from generate_series(1, 20) i;
select testes.checkin(case when i % 2 = 1 then 'pessoa_a' else 'pessoa_a2' end, 'h' || lpad(i::text, 2, '0'),
  testes.em(i - 1, 8), i * 12)
from generate_series(1, 20) i;
select testes.cliente('h_x', 12, 'A', 'pessoa_a');
select testes.checkin('pessoa_a', 'h_x', testes.em(21, 8), 60);
select testes.mudar('h_x', format('consultor_id = %L', testes.id('pessoa_a2')));
select testes.checkin('pessoa_a2', 'h_x', testes.em(22, 8), 30);

-- Risco: 18 sem check-in (consultor há 31 a 48 dias, nenhum check-in); 29 dias de consultor; 121% e 119% do ritmo
-- (previsão de 30 dias: 10 x 30 / 30,4 = 9,87 h; 11,95 h e 11,75 h); arquivado.
select testes.cliente('r_sem_' || lpad(k::text, 2, '0'), 10, 'A', case when k % 2 = 1 then 'pessoa_a2' else 'pessoa_a' end, 30 + k)
from generate_series(1, 18) k;
select testes.cliente('r_29', 10, 'A', 'pessoa_a', 29);
select testes.cliente('r_121', 10, 'A', 'pessoa_a2', 60);
select testes.cliente('r_119', 10, 'A', 'pessoa_a2', 60);
select testes.cliente('r_arq', 10, 'A', 'pessoa_a', 60);
select testes.mudar('r_arq', 'arquivado_em = now()');
select testes.checkin('pessoa_a2', 'r_121', testes.dia(-3, 14), 240);
select testes.checkin('pessoa_a2', 'r_121', testes.dia(-4, 14), 240);
select testes.checkin('pessoa_a2', 'r_121', testes.dia(-5, 14), 237);
select testes.checkin('pessoa_a2', 'r_119', testes.dia(-6, 14), 240);
select testes.checkin('pessoa_a2', 'r_119', testes.dia(-7, 14), 240);
select testes.checkin('pessoa_a2', 'r_119', testes.dia(-8, 14), 225);

-- r_mov: era da B (check-ins da pessoa_b há 50 e há 10 dias), veio para a A (pessoa_a2, consultor há 60 dias, um
-- check-in há 45 dias). Na A: nada da B no ritmo nem no último check-in.
select testes.cliente('r_mov', 10, 'B', 'pessoa_b');
select testes.checkin('pessoa_b', 'r_mov', testes.dia(-50, 14), 120);
select testes.checkin('pessoa_b', 'r_mov', testes.dia(-10, 14), 300);
select testes.mudar('r_mov', format('consultoria_id = %L', testes.id('A')));
select testes.mudar('r_mov', format('consultor_id = %L', testes.id('pessoa_a2')));
select testes.mudar('r_mov', $$consultor_desde = now() - interval '60 days'$$);
select testes.checkin('pessoa_a2', 'r_mov', testes.dia(-45, 19), 60);

-- m_ab: era da A (1 h da pessoa_a no mês anterior) e foi para a B: para a gestão da A, é cliente de outra consultoria.
select testes.cliente('m_ab', 10, 'A', 'pessoa_a', null, 'Cliente B-veio-de-A');
select testes.checkin('pessoa_a', 'm_ab', testes.em(24, 8), 60);
select testes.mudar('m_ab', format('consultoria_id = %L', testes.id('B')));
select testes.mudar('m_ab', format('consultor_id = %L', testes.id('pessoa_b')));

-- B: um cliente com horas, um esperando consultor e um parado (sem check-in há 40 dias).
select testes.cliente('b_um', 10, 'B', 'pessoa_b', 60, 'Cliente B-um');
select testes.checkin('pessoa_b', 'b_um', testes.em(5, 8), 120);
select testes.checkin('pessoa_b', 'b_um', testes.dia(-2, 9), 60);
select testes.cliente('b_espera', 12, 'B', null, null, 'Cliente B-espera');
select testes.cliente('b_parado', 10, 'B', 'pessoa_b', 40, 'Cliente B-parado');

-- Fila da A hoje: s1 (enviado há 2 dias), s2 (há 5 dias) e e7 (desde o dia 11 do mês anterior). F: 42 esperando, há 1
-- a 42 dias.
select testes.cliente('s1', 10, 'A', null);
select testes.mudar('s1', $$enviado_em = now() - interval '2 days'$$);
select testes.cliente('s2', 10, 'A', null);
select testes.mudar('s2', $$enviado_em = now() - interval '5 days'$$);
select testes.cliente('f' || lpad(k::text, 2, '0'), 5, 'F', null) from generate_series(1, 42) k;
update public.clientes c set enviado_em = now() - substr(x.nome, 2)::int * interval '1 day'
from testes.fx x where x.id = c.id and x.nome ~ '^f[0-9]{2}$';

-- História escrita à mão (como o sistema, só no teste) de e1 a e8, no mês anterior M (em(d) = dia d + 1 de M, 12h):
-- e1 espera de em(1) a em(4) e ganha consultor (3 dias); e2 espera desde em(-5) e ganha em(2) (7 dias); e3 troca de
-- consultor em em(3) (não conta); e4 ganha consultor e muda a previsão no mesmo instante em(6), num trecho de duração
-- zero com entrou (1 dia); e5 reativado com consultor em em(7) (novo, sem espera); e6 ganha consultor no mês atual;
-- e7 espera desde em(10) até hoje; e8 tinha consultor e foi arquivado no começo do mês atual.
select testes.cliente('e1', 10, 'A', 'pessoa_a');
select testes.cliente('e2', 10, 'A', 'pessoa_a');
select testes.cliente('e3', 10, 'A', 'pessoa_a2');
select testes.cliente('e4', 12, 'A', 'pessoa_a2');
select testes.cliente('e5', 10, 'A', 'pessoa_a');
select testes.cliente('e6', 10, 'A', 'pessoa_a2');
select testes.cliente('e7', 10, 'A', null);
select testes.mudar('e7', format('enviado_em = %L', testes.em(10)));
select testes.cliente('e8', 10, 'A', 'pessoa_a');
select testes.mudar('e8', 'arquivado_em = now()');
delete from private.situacoes_dos_clientes
where cliente_id in (select id from testes.fx where nome in ('e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'));
insert into private.situacoes_dos_clientes (cliente_id, consultoria_id, consultor_id, horas_mes, de, ate, espera_desde, entrou)
select testes.id(v.c), testes.id('A'), testes.id(v.p), v.h, v.de, v.ate, v.espera, v.entrou
from (values
  ('e1', null, 10, testes.em(1), testes.em(4), testes.em(1), false),
  ('e1', 'pessoa_a', 10, testes.em(4), null, testes.em(1), true),
  ('e2', null, 10, testes.em(-5), testes.em(2), testes.em(-5), false),
  ('e2', 'pessoa_a', 10, testes.em(2), null, testes.em(-5), true),
  ('e3', 'pessoa_a', 10, testes.em(-20), testes.em(3), testes.em(-25), true),
  ('e3', 'pessoa_a2', 10, testes.em(3), null, testes.em(-25), false),
  ('e4', null, 10, testes.em(5), testes.em(6), testes.em(5), false),
  ('e4', 'pessoa_a2', 10, testes.em(6), testes.em(6), testes.em(5), true),
  ('e4', 'pessoa_a2', 12, testes.em(6), null, testes.em(5), false),
  ('e5', 'pessoa_a', 10, testes.em(-30), testes.em(2), null, true),
  ('e5', 'pessoa_a', 10, testes.em(7), null, null, true),
  ('e6', null, 10, testes.em(15), testes.mes_atual()::timestamp at time zone 'America/Sao_Paulo', testes.em(15), false),
  ('e6', 'pessoa_a2', 10, testes.mes_atual()::timestamp at time zone 'America/Sao_Paulo', null, testes.em(15), true),
  ('e7', null, 10, testes.em(10), null, testes.em(10), false),
  ('e8', 'pessoa_a', 10, testes.em(-20), testes.mes_atual()::timestamp at time zone 'America/Sao_Paulo', testes.em(-22), true)
) v(c, p, h, de, ate, espera, entrou);

-- K: 14 consultores (admin_k e pessoa_k02 a k14), um cliente cada com 15 x i h. Em novembro de 2037 (167,2 h de
-- capacidade): acima de 100% os de 180, 195 e 210 h (3); abaixo de 70% os de 15 a 105 h (7); 120 e 165 h no meio.
select testes.cliente('k' || lpad(i::text, 2, '0'), 15 * i, 'K',
  case when i = 1 then 'admin_k' else 'pessoa_k' || lpad(i::text, 2, '0') end)
from generate_series(1, 14) i;
select set_config('request.jwt.claims', '', true);

-- ── O que cada um recebe ─────────────────────────────────────────────────────
select testes.guardar('painel_admin', 'admin_a', 'public.painel_do_inicio()');
select testes.guardar('painel_admin_m', 'admin_a', 'public.painel_do_inicio(testes.mes_anterior())');
select testes.guardar('painel_admin_futuro', 'admin_a', 'public.painel_do_inicio(testes.futuro())');
select testes.guardar('painel_pessoa', 'pessoa_a', 'public.painel_do_inicio()');
select testes.guardar('painel_pessoa_a2', 'pessoa_a2', 'public.painel_do_inicio()');
select testes.guardar('painel_pessoa_m', 'pessoa_a', 'public.painel_do_inicio(testes.mes_anterior())');
select testes.guardar('painel_central', 'central', 'public.painel_do_inicio()');
select testes.guardar('painel_k', 'admin_k', 'public.painel_do_inicio(testes.futuro())');
select testes.guardar('comp_admin', 'admin_a', 'public.comparacao_do_inicio()');
select testes.guardar('comp_admin_m', 'admin_a', 'public.comparacao_do_inicio(testes.mes_anterior())');
select testes.guardar('comp_admin_ano', 'admin_a',
  $$public.comparacao_do_inicio(p_de => date_trunc('year', testes.hoje()::timestamp)::date, p_ate => testes.hoje())$$);
select testes.guardar('comp_admin_fim', 'admin_a',
  'public.comparacao_do_inicio(p_de => testes.mes_atual() - 10, p_ate => testes.fim_do_mes(testes.mes_atual()))');
select testes.guardar('comp_pessoa', 'pessoa_a2', 'public.comparacao_do_inicio()');
select testes.guardar('comp_central_m', 'central', 'public.comparacao_do_inicio(testes.mes_anterior())');
select testes.guardar('fila_admin', 'admin_a', 'public.fila_de_clientes()');
select testes.guardar('fila_admin_m', 'admin_a', 'public.fila_de_clientes(testes.mes_anterior())');
select testes.guardar('fila_admin_futuro', 'admin_a', 'public.fila_de_clientes(testes.futuro())');
select testes.guardar('fila_central', 'central', 'public.fila_de_clientes()');
select testes.guardar('fila_f', 'admin_f', 'public.fila_de_clientes()');
select testes.guardar('risco_admin', 'admin_a', 'public.clientes_em_risco()');
select testes.guardar('risco_admin_2', 'admin_a', 'public.clientes_em_risco(2)');
select testes.guardar('risco_gestor', 'gestor_a', 'public.clientes_em_risco()');
select testes.guardar('risco_central', 'central', 'public.clientes_em_risco()');
select testes.guardar('risco_pessoa', 'pessoa_a', 'public.clientes_em_risco()');
select testes.guardar('risco_pessoa_a2', 'pessoa_a2', 'public.clientes_em_risco()');
select testes.guardar('horas_admin_m', 'admin_a', 'public.horas_por_cliente(testes.mes_anterior())');
select testes.guardar('horas_admin_m_2', 'admin_a', 'public.horas_por_cliente(testes.mes_anterior(), p_pagina => 2)');
select testes.guardar('horas_admin_10_dias', 'admin_a',
  'public.horas_por_cliente(p_de => testes.mes_anterior(), p_ate => testes.mes_anterior() + 9)');
select testes.guardar('horas_admin_futuro', 'admin_a', 'public.horas_por_cliente(testes.futuro())');
select testes.guardar('horas_central_m', 'central', 'public.horas_por_cliente(testes.mes_anterior())');
select testes.guardar('horas_pessoa_m', 'pessoa_a', 'public.horas_por_cliente(testes.mes_anterior())');
select testes.guardar('horas_pessoa_m_1', 'pessoa_a', 'public.horas_por_cliente(testes.mes_anterior(), p_pagina => 1)');
select testes.guardar('horas_pessoa_a2_m', 'pessoa_a2', 'public.horas_por_cliente(testes.mes_anterior())');
select testes.guardar('semanas_admin', 'admin_a', 'public.checkins_por_semana()');
select testes.guardar('semanas_admin_m', 'admin_a', 'public.checkins_por_semana(testes.mes_anterior())');
select testes.guardar('semanas_admin_futuro', 'admin_a', 'public.checkins_por_semana(testes.futuro())');
select testes.guardar('semanas_pessoa_a2', 'pessoa_a2', 'public.checkins_por_semana(testes.mes_anterior())');
select testes.guardar('semanas_central', 'central', 'public.checkins_por_semana(testes.mes_anterior())');

-- ── Recorte igual em todas ───────────────────────────────────────────────────
select ok(testes.sem_b(testes.j('painel_admin')) and testes.sem_b(testes.j('painel_admin_m')),
  'recorte: o painel da gestão da A não tem id nem nome da B');
select ok(testes.sem_b(testes.j('comp_admin')) and testes.sem_b(testes.j('comp_admin_m')),
  'recorte: a comparação da gestão da A não tem id nem nome da B');
select ok(testes.sem_b(testes.j('fila_admin')) and testes.sem_b(testes.j('fila_admin_m')),
  'recorte: a fila da gestão da A não tem id nem nome da B');
select ok(testes.sem_b(testes.j('risco_admin')) and testes.sem_b(testes.j('risco_admin_2')),
  'recorte: o risco da gestão da A não tem id nem nome da B (r_mov, que veio da B, só com o que é da A)');
select ok(testes.sem_b(testes.j('horas_admin_m')) and testes.sem_b(testes.j('horas_admin_m_2')),
  'recorte: horas por cliente da gestão da A sem a B (m_ab, que foi para a B, não aparece)');
select ok(testes.sem_b(testes.j('semanas_admin')) and testes.sem_b(testes.j('semanas_admin_m')),
  'recorte: as semanas da gestão da A sem a B');
select ok(testes.sem_clientes_da_a2(testes.j('risco_pessoa')) and testes.sem_clientes_da_a2(testes.j('horas_pessoa_m'))
    and testes.sem_clientes_da_a2(testes.j('horas_pessoa_m_1')),
  'recorte: o consultor só vê os clientes dele (nenhum da pessoa_a2 no risco nem nas horas da pessoa_a)');
select ok((select bool_and(c.consultor_id = testes.id('pessoa_a'))
    from jsonb_array_elements(testes.j('horas_pessoa_m') -> 'itens') e
    join public.clientes c on c.id = (e ->> 'id')::uuid),
  'recorte: horas da pessoa_a só com clientes dela');

select testes.como('travado_a', 'aal1');
select throws_ok('select public.painel_do_inicio()', '42501', 'sem_recorte', 'consultor não liberado: painel recusa');
select throws_ok('select public.comparacao_do_inicio()', '42501', 'sem_recorte', 'consultor não liberado: comparação recusa');
select throws_ok('select public.fila_de_clientes()', '42501', 'sem_recorte', 'consultor não liberado: fila recusa');
select throws_ok('select public.clientes_em_risco()', '42501', 'sem_recorte', 'consultor não liberado: risco recusa');
select throws_ok('select public.horas_por_cliente()', '42501', 'sem_recorte', 'consultor não liberado: horas por cliente recusa');
select throws_ok('select public.checkins_por_semana()', '42501', 'sem_recorte', 'consultor não liberado: semanas recusa');
reset role;
select testes.como('pessoa_a');
select throws_ok('select public.fila_de_clientes()', '42501', 'sem_recorte', 'a fila não existe para o consultor (sem_recorte)');
select lives_ok('select public.clientes_em_risco()', 'o consultor chama as outras como authenticated');
reset role;
set local role anon;
select throws_ok('select public.comparacao_do_inicio()', '42501', null, 'anônimo não executa a comparação');
reset role;
select ok(bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute')),
  'as 6 funções do Início: authenticated executa, anon não')
from unnest(array['public.painel_do_inicio(date, date, date)', 'public.comparacao_do_inicio(date, date, date)',
  'public.fila_de_clientes(date, date, date)', 'public.clientes_em_risco(integer)',
  'public.horas_por_cliente(date, date, date, integer)', 'public.checkins_por_semana(date, date, date)']) f;
select ok(not bool_or(has_function_privilege('authenticated', f, 'execute')),
  'os ajudantes novos e os refeitos em private: nenhum logado executa')
from unnest(array['private.capacidades_por_mes(uuid, uuid[], date, date)',
  'private.risco_dos_clientes(uuid, uuid, uuid)', 'private.segundos_do_periodo(uuid, date, date)',
  'private.fechar_checkins(uuid, uuid, text)', 'private.checkins_resumir_horas()', 'private.recalcular_horas_mes()']) f;

-- ── Painel ───────────────────────────────────────────────────────────────────
select is((select array_agg((e ->> 'capacidade')::numeric order by o)
    from jsonb_array_elements(testes.j('painel_admin') -> 'horas_por_mes') with ordinality t(e, o)),
  (select array_agg((select coalesce(sum(x.capacidade), 0) from private.capacidades_do_periodo(testes.id('A'), m.mes,
      case when m.mes = testes.mes_atual() then testes.hoje() else testes.fim_do_mes(m.mes) end, null) x) order by m.mes)
   from (select (e ->> 'mes')::date as mes from jsonb_array_elements(testes.j('painel_admin') -> 'horas_por_mes') e) m),
  'painel: capacidade de cada mês = soma de capacidades_do_periodo daquele mês (o mês em andamento só até hoje)');
select is((select array_agg((e ->> 'capacidade')::numeric order by o)
    from jsonb_array_elements(testes.j('painel_pessoa') -> 'horas_por_mes') with ordinality t(e, o)),
  (select array_agg((select coalesce(sum(x.capacidade), 0) from private.capacidades_do_periodo(testes.id('A'), m.mes,
      case when m.mes = testes.mes_atual() then testes.hoje() else testes.fim_do_mes(m.mes) end,
      array[testes.id('pessoa_a')]) x) order by m.mes)
   from (select (e ->> 'mes')::date as mes from jsonb_array_elements(testes.j('painel_pessoa') -> 'horas_por_mes') e) m),
  'painel do consultor: a capacidade de cada mês é a dele (a ausência do mês anterior desconta)');
select is((select array_agg((e ->> 'parcial')::boolean order by o)
    from jsonb_array_elements(testes.j('painel_admin') -> 'horas_por_mes') with ordinality t(e, o)),
  array[false, false, false, false, false, true], 'painel: só o mês em andamento é parcial');
select is((select array_agg((e ->> 'parcial')::boolean order by o)
    from jsonb_array_elements(testes.j('painel_admin_m') -> 'horas_por_mes') with ordinality t(e, o)),
  array[false, false, false, false, false, false], 'painel de um mês passado: nenhum mês parcial');
select is((testes.j('painel_admin') -> 'indicadores' ->> 'capacidade_ate_hoje')::numeric,
  (select sum(x.capacidade) from private.capacidades_do_periodo(testes.id('A'), testes.mes_atual(), testes.hoje(), null) x),
  'painel, Mês atual: capacidade_ate_hoje = capacidade de 1º até hoje');
select ok((testes.j('painel_admin_m') -> 'indicadores' ->> 'capacidade_ate_hoje')::numeric
    = (testes.j('painel_admin_m') -> 'indicadores' ->> 'capacidade')::numeric,
  'painel, mês passado: capacidade_ate_hoje = a capacidade do mês inteiro');
select ok(testes.j('painel_admin') ->> 'ate_efetivo' = testes.hoje()::text
    and testes.j('painel_admin_m') ->> 'ate_efetivo' = testes.fim_do_mes(testes.mes_anterior())::text,
  'painel: ate_efetivo = hoje no Mês atual e o fim do mês num mês passado');
select is(testes.ids(testes.j('painel_k') -> 'ranking'),
  array[testes.id('pessoa_k14'), testes.id('pessoa_k13'), testes.id('pessoa_k12'), testes.id('pessoa_k11'),
    testes.id('pessoa_k10'), testes.id('pessoa_k09'), testes.id('pessoa_k06'), testes.id('pessoa_k05'),
    testes.id('pessoa_k04'), testes.id('pessoa_k03'), testes.id('pessoa_k02'), testes.id('admin_k')]::text[],
  'painel: com 14 consultores, o ranking traz 12 (os 6 mais ocupados e os 6 com mais folga, do mais ao menos ocupado)');
select is(testes.j('painel_k') -> 'ranking_resumo', '{"total": 14, "acima": 3, "folga": 7, "no_meio": 2}'::jsonb,
  'painel: ranking_resumo conta os 14 (3 acima de 100%, 7 abaixo de 70%, 2 no meio fora da lista)');
select ok((select bool_and(r ? 'realizado' and r ? 'reservado' and r ? 'visivel' and not r ? 'pessoas')
    from jsonb_array_elements(testes.j('painel_k') -> 'ranking') r),
  'painel da gestão: cada consultor do ranking tem realizado, reservado e visivel');
select ok((select bool_and((r ->> 'pessoas')::int = (select count(*) from public.perfis p
      where p.consultoria_id = (r ->> 'id')::uuid and p.ativo and p.papel in ('admin', 'gestor', 'pessoa'))
      and r ? 'realizado' and not r ? 'visivel')
    from jsonb_array_elements(testes.j('painel_central') -> 'ranking') r),
  'painel da central: cada consultoria do ranking traz pessoas (os consultores ativos dela)');
select ok((testes.j('painel_central') -> 'ranking_resumo' ->> 'total')::int
    = (select count(*) from public.consultorias where arquivada_em is null),
  'painel da central: ranking_resumo conta todas as consultorias ativas');
select is((select row(e ->> 'clientes_em_atendimento', e ->> 'aguardando', e ->> 'sem_consultor', e ->> 'a_distribuir')::text
    from (select testes.j('painel_admin_m') -> 'indicadores' as e) x), '(6,2,2,0)',
  'painel de um mês passado: clientes em atendimento e aguardando no fim daquele mês, pela história (e1 a e5 e e8; e6 e e7 esperando)');
select is((testes.j('painel_pessoa_m') -> 'indicadores' ->> 'clientes_em_atendimento')::int, 4,
  'painel do consultor num mês passado: os clientes dele no fim do mês (e1, e2, e5 e e8; e3 já era da pessoa_a2)');
select ok((testes.j('painel_admin') -> 'indicadores' ->> 'clientes_em_atendimento')::int
      = (testes.chamar('admin_a', 'public.indicadores_de_clientes()') ->> 'em_atendimento')::int
    and (testes.j('painel_admin') -> 'indicadores' ->> 'aguardando')::int
      = (testes.chamar('admin_a', 'public.indicadores_de_clientes()') ->> 'aguardando_consultor')::int,
  'painel no Mês atual: clientes em atendimento e aguardando = indicadores_de_clientes (gestão)');
select is((testes.j('painel_pessoa') -> 'indicadores' ->> 'clientes_em_atendimento')::int,
  (testes.chamar('pessoa_a', 'public.indicadores_de_clientes()') ->> 'meus_clientes')::int,
  'painel no Mês atual: os clientes do consultor = meus_clientes de indicadores_de_clientes');
select ok((testes.j('painel_central') -> 'indicadores' ->> 'clientes_em_atendimento')::int
      = (testes.chamar('central', 'public.indicadores_de_clientes()') ->> 'em_atendimento')::int
    and (testes.j('painel_central') -> 'indicadores' ->> 'aguardando')::int
      = (testes.chamar('central', 'public.indicadores_de_clientes()') ->> 'aguardando_consultoria')::int
      + (testes.chamar('central', 'public.indicadores_de_clientes()') ->> 'aguardando_consultor')::int,
  'painel da central no Mês atual: em atendimento e aguardando = indicadores_de_clientes');
select ok((testes.j('painel_admin_futuro') -> 'indicadores' ->> 'clientes_em_atendimento')::int
      = (testes.j('painel_admin') -> 'indicadores' ->> 'clientes_em_atendimento')::int
    and (testes.j('painel_admin_futuro') -> 'indicadores' ->> 'capacidade_ate_hoje')::numeric = 0
    and testes.j('painel_admin_futuro') ->> 'ate_efetivo' = testes.hoje()::text,
  'painel de um mês futuro: os clientes de agora, capacidade até hoje 0 e ate_efetivo = hoje (antes do começo)');
select ok((testes.j('painel_pessoa_a2') -> 'indicadores' ->> 'checkins')::bigint
      = testes.quantos('A', testes.mes_atual(), testes.hoje(), 'pessoa_a2')
    and (testes.chamar('pessoa_a2', 'public.painel_do_inicio(testes.mes_anterior())') -> 'indicadores' ->> 'checkins')::bigint
      = testes.quantos('A', testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior()), 'pessoa_a2'),
  'painel do consultor: check-ins fechados dele no período efetivo (contagem direta)');
select ok(testes.j('painel_admin') -> 'indicadores' -> 'checkins' = 'null'::jsonb,
  'painel da gestão: sem o número de check-ins (só do consultor)');
select ok(not (testes.j('painel_admin') ?| array['esperando', 'extremos', 'meus_clientes', 'previsao_atual'])
    and not (testes.j('painel_admin') -> 'indicadores' ?| array['clientes_ativos', 'clientes_novos'])
    and not (testes.j('painel_pessoa') ?| array['esperando', 'extremos', 'meus_clientes', 'previsao_atual']),
  'painel: as chaves que saíram não vêm mais');

-- ── Comparação ───────────────────────────────────────────────────────────────
create temp table c_mes as
select a.de, a.ate, a.forma from private.periodo_anterior(testes.mes_atual(), testes.hoje(), true) a;
select ok((select testes.j('comp_admin') ->> 'de' = c.de::text and testes.j('comp_admin') ->> 'ate' = c.ate::text
    and testes.j('comp_admin') ->> 'forma' = c.forma from c_mes c),
  'comparação, Mês atual: de 1º até hoje contra os mesmos dias do mês anterior (periodo_anterior)');
select is((testes.j('comp_admin') -> 'indicadores' ->> 'realizado')::numeric,
  (select round(testes.segundos('A', c.de, c.ate) / 3600, 1) from c_mes c),
  'comparação, Mês atual: realizado do anterior = soma direta dos check-ins');
select is((select row(testes.j('comp_admin') -> 'indicadores' ->> 'clientes_em_atendimento',
    testes.j('comp_admin') -> 'indicadores' ->> 'aguardando')::text),
  (select row(s.em::text, s.sem::text)::text from c_mes c, testes.situacao_a(testes.fim_do_dia(c.ate)) s),
  'comparação, Mês atual: clientes e aguardando no fim do anterior, pela história');
select is((testes.j('comp_admin') -> 'indicadores' ->> 'ocupacao')::numeric,
  (select round(s.reservado / (select sum(x.capacidade) from private.capacidades_do_periodo(testes.id('A'),
      testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior()), null) x), 4)
   from c_mes c, testes.situacao_a(testes.fim_do_dia(c.ate)) s),
  'comparação, Mês atual: ocupação = reservado no fim do anterior (história) / capacidade do mês anterior');
select ok(testes.j('comp_admin_m') ->> 'forma' = 'mes'
    and testes.j('comp_admin_m') ->> 'de' = (testes.mes_anterior() - interval '1 month')::date::text
    and (testes.j('comp_admin_m') -> 'indicadores' ->> 'ocupacao')::numeric
      = round((testes.j('comp_admin_m') -> 'indicadores' ->> 'realizado')::numeric
        / (select sum(x.capacidade) from private.capacidades_do_periodo(testes.id('A'),
          (testes.mes_anterior() - interval '1 month')::date, (testes.mes_anterior() - interval '1 day')::date, null) x), 4),
  'comparação de um mês passado: o mês anterior inteiro e a utilização (realizado / capacidade)');
select ok(testes.j('comp_admin_ano') ->> 'forma' = 'ano_anterior'
    and testes.j('comp_admin_ano') ->> 'de' = (date_trunc('year', testes.hoje()::timestamp) - interval '1 year')::date::text
    and testes.j('comp_admin_ano') ->> 'ate' = (testes.hoje() - interval '1 year')::date::text,
  'comparação, Este ano: as mesmas datas do ano anterior');
select is((testes.j('comp_admin_ano') -> 'indicadores' ->> 'realizado')::numeric,
  round(testes.segundos('A', (date_trunc('year', testes.hoje()::timestamp) - interval '1 year')::date,
    (testes.hoje() - interval '1 year')::date) / 3600, 1),
  'comparação, Este ano: realizado do ano anterior = soma direta');
select ok((select testes.j('comp_admin_fim') ->> 'de' = a.de::text and testes.j('comp_admin_fim') ->> 'ate' = a.ate::text
    and testes.j('comp_admin_fim') ->> 'forma' = 'dias_antes'
    from private.periodo_anterior(testes.mes_atual() - 10, testes.hoje(), false) a),
  'comparação, Personalizado até o fim do mês: o efetivo vai até hoje (os N dias logo antes)');
select ok((testes.j('comp_pessoa') -> 'indicadores' ->> 'checkins')::bigint
      = (select testes.quantos('A', c.de, c.ate, 'pessoa_a2') from c_mes c)
    and (testes.j('comp_pessoa') -> 'indicadores' ->> 'realizado')::numeric
      = (select round(testes.segundos('A', c.de, c.ate, 'pessoa_a2') / 3600, 1) from c_mes c),
  'comparação do consultor: check-ins e realizado dele no anterior');
select is((testes.j('comp_central_m') -> 'indicadores' ->> 'realizado')::numeric,
  round(testes.segundos(null, (testes.mes_anterior() - interval '1 month')::date,
    (testes.mes_anterior() - interval '1 day')::date) / 3600, 1),
  'comparação da central: realizado de todas as consultorias ativas no anterior');
select is(testes.chamar('admin_a', 'public.comparacao_do_inicio(testes.futuro())'),
  '{"de": null, "ate": null, "forma": null, "indicadores": null}'::jsonb,
  'comparação de um período efetivo vazio (mês futuro): tudo nulo');
select is(
  (select array_agg(testes.detalhe('admin_a', format('public.comparacao_do_inicio(%s)', a)) order by o)
   from unnest(array[
     $$p_de => '2026-10-15', p_ate => '2026-10-01'$$,
     $$p_de => '2026-10-01'$$,
     $$p_mes => '2026-10-01', p_de => '2026-10-01', p_ate => '2026-10-15'$$,
     $$p_de => '2024-01-01', p_ate => '2026-01-01'$$,
     $$p_de => testes.mes_atual(), p_ate => testes.fim_do_mes(testes.mes_atual()) + 1$$]) with ordinality t(a, o)),
  (select array_agg(testes.detalhe('admin_a', format('public.painel_do_inicio(%s)', a)) order by o)
   from unnest(array[
     $$p_de => '2026-10-15', p_ate => '2026-10-01'$$,
     $$p_de => '2026-10-01'$$,
     $$p_mes => '2026-10-01', p_de => '2026-10-01', p_ate => '2026-10-15'$$,
     $$p_de => '2024-01-01', p_ate => '2026-01-01'$$,
     $$p_de => testes.mes_atual(), p_ate => testes.fim_do_mes(testes.mes_atual()) + 1$$]) with ordinality t(a, o)),
  'comparação: período inválido com as mesmas frases do painel');
select ok((select bool_and(d is not null) from unnest(array[
    testes.detalhe('admin_a', $$public.comparacao_do_inicio(p_de => '2026-10-15', p_ate => '2026-10-01')$$),
    testes.detalhe('admin_a', $$public.fila_de_clientes(p_de => '2026-10-15', p_ate => '2026-10-01')$$),
    testes.detalhe('admin_a', $$public.horas_por_cliente(p_de => '2026-10-15', p_ate => '2026-10-01')$$),
    testes.detalhe('admin_a', $$public.checkins_por_semana(p_de => '2026-10-15', p_ate => '2026-10-01')$$)]) d),
  'período inválido: as funções do período recusam com a frase');

-- ── Fila ─────────────────────────────────────────────────────────────────────
select ok((testes.j('fila_admin') -> 'sem_consultor' ->> 'total')::int
      = (testes.chamar('admin_a', 'public.indicadores_de_clientes()') ->> 'aguardando_consultor')::int
    and (testes.j('fila_admin') -> 'em_atendimento' ->> 'total')::int
      = (testes.chamar('admin_a', 'public.indicadores_de_clientes()') ->> 'em_atendimento')::int
    and testes.j('fila_admin') -> 'a_distribuir' = 'null'::jsonb,
  'fila da gestão: contagens de hoje iguais às de indicadores_de_clientes; sem a etapa a distribuir');
select ok((testes.j('fila_central') -> 'a_distribuir' ->> 'total')::int
      = (testes.chamar('central', 'public.indicadores_de_clientes()') ->> 'aguardando_consultoria')::int
    and (testes.j('fila_central') -> 'sem_consultor' ->> 'total')::int
      = (testes.chamar('central', 'public.indicadores_de_clientes()') ->> 'aguardando_consultor')::int
    and (testes.j('fila_central') -> 'em_atendimento' ->> 'total')::int
      = (testes.chamar('central', 'public.indicadores_de_clientes()') ->> 'em_atendimento')::int,
  'fila da central: as três etapas iguais às de indicadores_de_clientes');
select is((select row(e ->> 'media_dias', e ->> 'maior_dias')::text from (select testes.j('fila_admin') -> 'sem_consultor' as e) x),
  (select row(round((2 + 5 + d)::numeric / 3, 1)::text, d::text)::text
   from (select testes.hoje() - (testes.em(10) at time zone 'America/Sao_Paulo')::date as d) x),
  'fila: média e maior espera em dias de calendário de São Paulo (2, 5 e e7)');
select is(testes.ids(testes.j('fila_admin') -> 'pontos'),
  array[testes.id('e7'), testes.id('s2'), testes.id('s1')]::text[], 'fila: pontos de quem espera há mais tempo primeiro');
select ok((select bool_and(e ->> 'situacao' = 'sem_consultor' and e ->> 'consultoria_nome' = 'Gráficos início A')
    from jsonb_array_elements(testes.j('fila_admin') -> 'pontos') e)
    and (testes.j('fila_admin') ->> 'total_esperando')::int = 3,
  'fila: cada ponto com a situação e a consultoria; total_esperando = 3');
select ok(jsonb_array_length(testes.j('fila_f') -> 'pontos') = 40
    and testes.j('fila_f') -> 'pontos' -> 0 ->> 'id' = testes.id('f42')::text
    and (testes.j('fila_f') -> 'pontos' -> 0 ->> 'dias')::int = 42
    and testes.j('fila_f') -> 'pontos' -> 39 ->> 'id' = testes.id('f03')::text,
  'fila: no máximo 40 pontos, de quem espera há mais tempo (42 dias) até o 40º (3 dias)');
select is(testes.j('fila_f') -> 'sem_consultor', '{"total": 42, "media_dias": 21.5, "maior_dias": 42}'::jsonb,
  'fila: total, média e maior espera contam todos os 42 (não só os 40 pontos)');
select ok(jsonb_array_length(testes.j('fila_central') -> 'pontos') <= 40 and not exists (
    select 1 from jsonb_array_elements(testes.j('fila_central') -> 'pontos') with ordinality a(e, o)
    join jsonb_array_elements(testes.j('fila_central') -> 'pontos') with ordinality b(e, o) on b.o = a.o + 1
    where (a.e ->> 'dias')::int < (b.e ->> 'dias')::int),
  'fila da central: no máximo 40 pontos, em ordem de espera');
select is((select row(f -> 'em_atendimento' ->> 'novos_no_periodo', f ->> 'receberam_consultor', f ->> 'espera_media_dias')::text
    from (select testes.j('fila_admin_m') as f) x), '(4,3,3.7)',
  'fila do mês anterior: novos (e1, e2, e4 e e5), receberam consultor (e1, e2 e e4, que entrou num trecho de duração zero) e espera média (3, 7 e 1 dia); troca de consultor (e3) não conta');
select ok((testes.j('fila_admin') -> 'em_atendimento' ->> 'novos_no_periodo')::int
    = (select count(*) from private.situacoes_dos_clientes s
       where s.consultoria_id = testes.id('A') and s.entrou
         and s.de >= testes.mes_atual()::timestamp at time zone 'America/Sao_Paulo'),
  'fila do Mês atual: novos = trechos com entrou na consultoria no período (e6 e os cadastrados agora)');
select is((select row(f -> 'em_atendimento' ->> 'novos_no_periodo', f ->> 'receberam_consultor',
    coalesce(f ->> 'espera_media_dias', 'nulo'), f -> 'sem_consultor' ->> 'total')::text
    from (select testes.j('fila_admin_futuro') as f) x), '(0,0,nulo,3)',
  'fila de um período efetivo vazio: nada no período, a fila de hoje continua');

-- ── Risco ────────────────────────────────────────────────────────────────────
select is((testes.j('risco_admin') ->> 'sem_checkin')::int,
  (testes.chamar('admin_a', 'public.indicadores_de_clientes()') ->> 'sem_checkin_30_dias')::int,
  'risco da gestão: sem_checkin = sem_checkin_30_dias de indicadores_de_clientes');
select ok((testes.j('risco_pessoa_a2') ->> 'sem_checkin')::int
      = (testes.chamar('pessoa_a2', 'public.indicadores_de_clientes()') ->> 'sem_checkin_30_dias')::int
    and (testes.j('risco_pessoa') ->> 'sem_checkin')::int
      = (testes.chamar('pessoa_a', 'public.indicadores_de_clientes()') ->> 'sem_checkin_30_dias')::int,
  'risco do consultor: sem_checkin = sem_checkin_30_dias dele');
select is((select row(r ->> 'total', r ->> 'sem_checkin', r ->> 'acima_do_ritmo')::text from (select testes.j('risco_admin') as r) x),
  '(19,18,1)', 'risco da gestão: 18 sem check-in + 1 acima de 120% (29 dias, 119%, arquivado e sem consultor não entram)');
select is(testes.ids(testes.j('risco_admin_2') -> 'itens'),
  array[testes.id('r_sem_03'), testes.id('r_sem_02'), testes.id('r_sem_01'), testes.id('r_121')]::text[],
  'risco: a página 2 traz os seguintes, pela nota (dias / 30 ou ritmo / 1,2), nome e id');
select ok(jsonb_array_length(testes.j('risco_admin') -> 'itens') = 15
    and testes.j('risco_admin') -> 'itens' -> 0 ->> 'id' = testes.id('r_sem_18')::text,
  'risco: 15 por página, o maior risco primeiro (48 dias sem check-in)');
select is((select row(e ->> 'sem_checkin_dias', coalesce(e ->> 'ultimo_checkin', 'nulo'), e ->> 'sem_checkin',
      e ->> 'acima_do_ritmo', e ->> 'horas_30', e ->> 'ritmo', e ->> 'horas_mes')::text
    from jsonb_array_elements(testes.j('risco_admin') -> 'itens') e where e ->> 'id' = testes.id('r_sem_18')::text),
  '(48,nulo,true,false,0.0,0.0000,10.0)', 'risco: sem check-in nunca, há 48 dias com o consultor');
select is((select row(e ->> 'ritmo', e ->> 'horas_30', e ->> 'acima_do_ritmo', e ->> 'sem_checkin',
      e ->> 'ultimo_checkin')::text
    from jsonb_array_elements(testes.j('risco_admin_2') -> 'itens') e where e ->> 'id' = testes.id('r_121')::text),
  row('1.2109', '12.0', 'true', 'false', (testes.hoje() - 3)::text)::text,
  'risco: 121% da previsão entra (11,95 h em 30 dias), com o último check-in');
select is((select row(x.ritmo, x.acima_do_ritmo, x.sem_checkin)::text
    from private.risco_dos_clientes(testes.id('A'), null, testes.id('r_119')) x),
  '(1.1907,f,f)', 'risco: 119% da previsão não entra');
select is((select row(coalesce(x.ritmo::text, 'nulo'), x.sem_checkin, x.sem_checkin_dias)::text
    from private.risco_dos_clientes(testes.id('A'), null, testes.id('r_29')) x),
  '(nulo,f,29)', 'risco: 29 dias com o consultor não entra (sem ritmo nem sem check-in)');
select ok(not exists (select 1 from private.risco_dos_clientes(testes.id('A'), null, null) x
    where x.cliente_id in (testes.id('r_arq'), testes.id('s1'), testes.id('e7'))),
  'risco: arquivado e sem consultor não entram');
select is((select row(x.horas_30, x.ritmo, x.ultimo_checkin, x.sem_checkin)::text
    from private.risco_dos_clientes(testes.id('A'), null, testes.id('r_mov')) x),
  row(0.0, 0.0000, testes.hoje() - 45, false)::text,
  'risco: check-in de outra consultoria (a B, há 10 e há 50 dias) não entra no ritmo nem no último check-in');
select ok((select bool_and(e ->> 'consultor_nome' = p.nome and not e ? 'consultoria_nome')
    from jsonb_array_elements(testes.j('risco_admin') -> 'itens' || (testes.j('risco_admin_2') -> 'itens')) e
    join public.clientes c on c.id = (e ->> 'id')::uuid join public.perfis p on p.id = c.consultor_id),
  'risco da gestão: o nome do consultor de cada cliente (o administrador vê todos)');
select ok((select bool_and(e -> 'consultor_nome' = 'null'::jsonb) from jsonb_array_elements(testes.j('risco_gestor') -> 'itens') e),
  'risco do gestor: sem o nome de quem ele não vê (vejo_perfil)');
select ok((select bool_and(e ->> 'consultoria_nome' is not null and not e ? 'consultor_nome')
    from jsonb_array_elements(testes.j('risco_central') -> 'itens') e)
    and (select bool_and(not e ? 'consultor_nome' and not e ? 'consultoria_nome')
    from jsonb_array_elements(testes.j('risco_pessoa') -> 'itens') e),
  'risco: a central vê a consultoria; o consultor, nem consultor nem consultoria');
select ok((testes.j('risco_pessoa') ->> 'total')::int = 9 and (testes.j('risco_pessoa_a2') ->> 'total')::int = 10,
  'risco do consultor: só os dele (9 sem check-in da pessoa_a; 9 + r_121 da pessoa_a2)');

-- ── Horas por cliente ────────────────────────────────────────────────────────
select is(testes.ids(testes.j('horas_admin_m') -> 'itens'),
  (select array_agg(h.id::text order by h.o) from testes.horas_a(testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior())) h
   where h.o <= 10),
  'horas por cliente: os 10 com mais horas no mês, na ordem (horas, previsão, nome)');
select is((select row(j ->> 'total_clientes', j ->> 'total_horas', j -> 'resto' ->> 'clientes', j -> 'resto' ->> 'horas')::text
    from (select testes.j('horas_admin_m') as j) x),
  (select row(count(*)::text, round(sum(h.segundos) / 3600, 1)::text, (count(*) - 10)::text,
      round(sum(h.segundos) filter (where h.o > 10) / 3600, 1)::text)::text
   from testes.horas_a(testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior())) h),
  'horas por cliente: os 10 + o resto = total direto dos check-ins (clientes e horas)');
select is((select row(j ->> 'participacao_3', j ->> 'participacao_10')::text from (select testes.j('horas_admin_m') as j) x),
  (select row(round(sum(h.segundos) filter (where h.o <= 3) / sum(h.segundos), 4)::text,
      round(sum(h.segundos) filter (where h.o <= 10) / sum(h.segundos), 4)::text)::text
   from testes.horas_a(testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior())) h),
  'horas por cliente: participações dos 3 e dos 10 maiores, em fração');
select ok((testes.j('horas_admin_m') ->> 'participacao_3')::numeric between 0 and 1
    and (testes.j('horas_admin_m') ->> 'participacao_10')::numeric between 0 and 1
    and (testes.j('horas_central_m') ->> 'participacao_3')::numeric between 0 and 1
    and (testes.j('horas_central_m') ->> 'participacao_10')::numeric between 0 and 1,
  'horas por cliente: participações entre 0 e 1');
select ok((select bool_and((e ->> 'previsto')::numeric = c.horas_mes and (e ->> 'horas')::numeric = round(h.segundos / 3600, 1))
    from jsonb_array_elements(testes.j('horas_admin_m') -> 'itens') e
    join public.clientes c on c.id = (e ->> 'id')::uuid
    join testes.horas_a(testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior())) h on h.id = c.id),
  'horas por cliente no Mês: previsto = a previsão do mês; horas de cada um');
select ok((select bool_and((e ->> 'previsto')::numeric = round(c.horas_mes * 10 / 30.4, 1))
    from jsonb_array_elements(testes.j('horas_admin_10_dias') -> 'itens') e
    join public.clientes c on c.id = (e ->> 'id')::uuid),
  'horas por cliente num período de 10 dias: previsto proporcional (previsão x 10 / 30,4)');
select ok((select bool_and(e ->> 'sub' = 'Pessoa ' || case when c.consultor_id = testes.id('pessoa_a') then 'pessoa_a' else 'pessoa_a2' end)
    from jsonb_array_elements(testes.j('horas_admin_m') -> 'itens') e join public.clientes c on c.id = (e ->> 'id')::uuid)
    and (select bool_and(e ->> 'sub' = co.nome) from jsonb_array_elements(testes.j('horas_central_m') -> 'itens') e
      join public.clientes c on c.id = (e ->> 'id')::uuid join public.consultorias co on co.id = c.consultoria_id)
    and (select bool_and(e -> 'sub' = 'null'::jsonb) from jsonb_array_elements(testes.j('horas_pessoa_m') -> 'itens') e),
  'horas por cliente: sub = o consultor (gestão), a consultoria (central) ou nada (consultor)');
select is((testes.j('horas_pessoa_a2_m') ->> 'total_clientes')::int,
  (select count(*)::int from public.clientes where consultor_id = testes.id('pessoa_a2') and not arquivado),
  'horas por cliente do consultor: todos os clientes dele, com 0 h inclusive');
select ok((select bool_and((e ->> 'horas')::numeric = 0) from jsonb_array_elements(
    testes.chamar('pessoa_a2', 'public.horas_por_cliente(testes.mes_anterior(), p_pagina => 2)') -> 'itens') e)
    and jsonb_array_length(testes.chamar('pessoa_a2', 'public.horas_por_cliente(testes.mes_anterior(), p_pagina => 2)') -> 'itens') > 0,
  'horas por cliente do consultor: os de 0 h entram na lista (a página 2 dele só tem clientes sem horas)');
select is((select (e ->> 'horas')::numeric from jsonb_array_elements(
    testes.chamar('pessoa_a2', 'public.horas_por_cliente(testes.mes_anterior(), p_pagina => 1)') -> 'itens') e
    where e ->> 'id' = testes.id('h_x')::text), 0.5,
  'horas por cliente do consultor: só as horas dele (h_x: 30 min da pessoa_a2, não a 1 h da pessoa_a)');
select is((select (e ->> 'horas')::numeric from jsonb_array_elements(
    testes.chamar('admin_a', 'public.horas_por_cliente(testes.mes_anterior(), p_pagina => 1)') -> 'itens') e
    where e ->> 'id' = testes.id('h_x')::text), 1.5,
  'horas por cliente da gestão: todas as horas da consultoria no cliente (h_x: 1,5 h)');
select is(testes.ids(testes.j('horas_admin_m_2') -> 'itens'),
  (select array_agg(h.id::text order by h.o) from testes.horas_a(testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior())) h
   where h.o between 16 and 30),
  'horas por cliente: a página 2 traz os 15 seguintes');
select is((testes.j('horas_admin_m_2') ->> 'total')::int,
  (select count(*)::int from testes.horas_a(testes.mes_anterior(), testes.fim_do_mes(testes.mes_anterior()))),
  'horas por cliente com página: total = os clientes com horas');
select is(testes.j('horas_admin_futuro'),
  '{"itens": [], "resto": {"horas": 0, "clientes": 0}, "total_horas": 0, "total_clientes": 0, "participacao_3": null, "participacao_10": null}'::jsonb,
  'horas por cliente de um período efetivo vazio: lista vazia');

-- ── Check-ins por semana ─────────────────────────────────────────────────────
select ok(jsonb_array_length(testes.j('semanas_admin') -> 'semanas') >= 8
    and jsonb_array_length(testes.j('semanas_admin_m') -> 'semanas') >= 8,
  'semanas: no mínimo 8');
select is((select array_agg(e ->> 'semana') from jsonb_array_elements(testes.j('semanas_admin') -> 'semanas') e
    where (e ->> 'parcial')::boolean),
  array[date_trunc('week', testes.hoje()::timestamp)::date::text], 'semanas: só a semana de hoje é parcial');
select ok((select bool_and(extract(isodow from (e ->> 'semana')::date) = 1)
    from jsonb_array_elements(testes.j('semanas_admin_m') -> 'semanas') e)
    and (testes.j('semanas_admin_m') -> 'semanas' -> 0 ->> 'semana')::date <= testes.mes_anterior(),
  'semanas: de segunda a domingo, a partir da semana que toca o começo do período (ou antes, para ter 8)');
select ok((select bool_and((e ->> 'checkins')::bigint = testes.quantos('A', (e ->> 'semana')::date, (e ->> 'semana')::date + 6)
      and (e ->> 'horas')::numeric = round(testes.segundos('A', (e ->> 'semana')::date, (e ->> 'semana')::date + 6) / 3600, 1))
    from jsonb_array_elements(testes.j('semanas_admin_m') -> 'semanas' || (testes.j('semanas_admin') -> 'semanas')) e),
  'semanas da gestão: check-ins e horas de cada semana = contagem direta');
select ok((select sum((e ->> 'checkins')::int) from jsonb_array_elements(testes.j('semanas_admin_m') -> 'semanas') e) > 0,
  'semanas: o mês anterior tem check-ins (o teste confere alguma coisa)');
select is((testes.j('semanas_admin_m') ->> 'media')::numeric,
  (select round(avg(testes.quantos('A', s, s + 6)), 1)
   from (select (e ->> 'semana')::date as s from jsonb_array_elements(testes.j('semanas_admin_m') -> 'semanas') e) w
   where s >= testes.mes_anterior() and s + 6 <= testes.fim_do_mes(testes.mes_anterior()) and s + 6 < testes.hoje()),
  'semanas: a média só das semanas inteiras dentro do período');
select is(testes.j('semanas_admin_m') -> 'pico',
  (select jsonb_build_object('semana', e ->> 'semana', 'checkins', (e ->> 'checkins')::int)
   from jsonb_array_elements(testes.j('semanas_admin_m') -> 'semanas') e
   where (e ->> 'no_periodo')::boolean order by (e ->> 'checkins')::int desc, e ->> 'semana' limit 1),
  'semanas: o pico é a semana do período com mais check-ins');
select ok((select bool_and((e ->> 'checkins')::bigint = testes.quantos('A', (e ->> 'semana')::date, (e ->> 'semana')::date + 6, 'pessoa_a2'))
    from jsonb_array_elements(testes.j('semanas_pessoa_a2') -> 'semanas') e),
  'semanas do consultor: só os check-ins dele');
select ok((select bool_and((e ->> 'no_periodo')::boolean = ((e ->> 'semana')::date + 6 >= testes.mes_anterior()
      and (e ->> 'semana')::date <= testes.fim_do_mes(testes.mes_anterior())))
    from jsonb_array_elements(testes.j('semanas_admin_m') -> 'semanas') e),
  'semanas: no_periodo marca as semanas que tocam o período');
select ok((select sum((e ->> 'checkins')::int) from jsonb_array_elements(testes.j('semanas_central') -> 'semanas') e)
    >= (select sum((e ->> 'checkins')::int) from jsonb_array_elements(testes.j('semanas_admin_m') -> 'semanas') e),
  'semanas da central: todas as consultorias (pelo menos as da A)');
select is(testes.j('semanas_admin_futuro'), '{"semanas": [], "media": null, "pico": null}'::jsonb,
  'semanas de um período efetivo vazio: lista vazia');

-- ── Acréscimos da revisão da T1 ──────────────────────────────────────────────
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'checkins'
    and indexdef like '%(cliente_id)%' and indexdef like '%fim IS NULL%')
  and exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'checkins'
    and indexdef like '%(consultor_id)%' and indexdef like '%fim IS NULL%'),
  'check-ins abertos: índices parciais por cliente e por consultor');
select is((select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'private.fechar_checkins(uuid, uuid, text)'::regprocedure), 'plpgsql',
  'fechar_checkins em plpgsql (um update pelo cliente, outro pelo consultor)');
select ok(obj_description('private.situacoes_dos_clientes'::regclass, 'pg_class') like '%entrou%'
    and obj_description('private.situacoes_dos_clientes'::regclass, 'pg_class') like '%travas%',
  'situacoes_dos_clientes: o comentário diz a regra do entrou em trecho zero e a das travas');
-- Fechar pelo cliente e pelo consultor continua como antes (cada um pelo seu índice).
select testes.cliente('fc1', 10, 'A', 'pessoa_a');
select testes.cliente('fc2', 10, 'A', 'pessoa_a2');
select set_config('request.jwt.claims', json_build_object('sub', testes.id('pessoa_a'), 'role', 'authenticated')::text, true);
insert into public.checkins (cliente_id, inicio, descricao) values (testes.id('fc1'), now() - interval '1 hour', 'Aberto');
select set_config('request.jwt.claims', json_build_object('sub', testes.id('pessoa_a2'), 'role', 'authenticated')::text, true);
insert into public.checkins (cliente_id, inicio, descricao) values (testes.id('fc2'), now() - interval '1 hour', 'Aberto');
select set_config('request.jwt.claims', '', true);
select private.fechar_checkins(testes.id('fc1'), null, 'Nota do cliente');
select private.fechar_checkins(null, testes.id('pessoa_a2'), 'Nota do consultor');
select is((select array_agg(row(k.fim = now(), k.descricao)::text order by k.descricao) from public.checkins k
    where k.cliente_id in (testes.id('fc1'), testes.id('fc2'))),
  array['(t,Aberto)', '(t,Aberto)'], 'fechar_checkins: fecha o aberto do cliente e o do consultor, sem trocar a descrição que já existe');

select * from finish();
rollback;
