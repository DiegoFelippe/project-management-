-- Gráficos variados do Início e a faixa Hoje ampliada (design 2026-11-19-graficos-variados-e-paleta, seções 2 e 3;
-- plano, Task 2): horas_do_painel_por_dia, horas_por_unidade_por_semana, checkins_por_dia_e_hora, tarefas_por_situacao e
-- clientes_por_cidade (o recorte de private.recorte_do_inicio e o período de private.periodo_do_inicio) e hoje_do_cliente
-- com andamento e pausadas por etapa e mais_tempo. Consultorias A (administrador, gestor e dois consultores), B, K (10
-- consultores com horas: os 8 maiores e "Outros"), C (as cidades) e E (vazia), e a central. O período é a semana S
-- (segunda a domingo, 3 semanas atrás). A central vê tudo: os números dela são conferidos pela diferença entre antes e
-- depois dos dados do teste (nada conta a tabela inteira). Os tempos (5.000 clientes e 200.000 check-ins) ficam no fim.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

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
  insert into public.consultorias (nome) values ('Gráficos variados ' || p_nome) returning id into v;
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
    p_nome || '@graficos-variados.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel, exige_2fa)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@graficos-variados.test', p_papel, p_exige_2fa);
  return v;
end $$;

-- Cliente gravado como o sistema.
create function testes.cliente(p_nome text, p_consultoria text, p_consultor text, p_cidade text default null,
  p_uf text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id, cidade, uf)
  values ('Cliente ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor), p_cidade, p_uf)
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Check-in fechado gravado pelo consultor do cliente (o gatilho confere quem grava pelo JWT).
create function testes.checkin(p_consultor text, p_cliente text, p_inicio timestamptz, p_minutos int) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_consultor), 'role', 'authenticated')::text, true);
  insert into public.checkins (cliente_id, inicio, fim, descricao)
  values (testes.id(p_cliente), p_inicio, p_inicio + p_minutos * interval '1 minute', 'Gráficos variados');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Check-list aberto (aplicado há 30 dias) gravado como o sistema, com as etapas 1 e 2 e os contadores de
-- recontar_checklist. Cada tarefa: [etapa, dias até vencer (negativo = vencida), estado]; título 'Tarefa <n>' na ordem.
create function testes.checklist(p_nome text, p_cliente text, p_tarefas jsonb) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into testes.fx values (p_nome, v);
  insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_nome, inicio)
  select v, c.id, c.consultoria_id, 'Modelo ' || p_nome, testes.hoje() - 30 from public.clientes c where c.id = testes.id(p_cliente);
  insert into public.checklist_etapas (checklist_id, nome, posicao) select v, 'Etapa ' || e, e from generate_series(1, 2) e;
  insert into public.checklist_tarefas (checklist_id, etapa_id, titulo, prazo_dias, vence_em, posicao, estado, feita_em, motivo)
  select v, e.id, 'Tarefa ' || t.o, 30 + (t.x ->> 1)::int, testes.hoje() + (t.x ->> 1)::int, t.o, t.x ->> 2,
    case when t.x ->> 2 in ('feita', 'nao_se_aplica') then now() end,
    case when t.x ->> 2 = 'nao_se_aplica' then 'Não se aplica aqui' end
  from jsonb_array_elements(p_tarefas) with ordinality t(x, o)
  join public.checklist_etapas e on e.checklist_id = v and e.posicao = (t.x ->> 0)::int;
  perform private.recontar_checklist(v);
  return v;
end $$;
-- A tarefa de um check-list pela posição.
create function testes.tarefa(p_checklist text, p_posicao int) returns uuid language sql stable as $$
  select t.id from public.checklist_tarefas t where t.checklist_id = testes.id(p_checklist) and t.posicao = p_posicao
$$;
-- Um trecho de tempo da tarefa: de p_de a p_ate segundos antes de agora (p_ate nulo = aberto).
create function testes.tempo(p_checklist text, p_posicao int, p_de int, p_ate int) returns void language sql as $$
  insert into public.checklist_tarefa_tempos (tarefa_id, pessoa_id, inicio, fim)
  values (testes.tarefa(p_checklist, p_posicao), testes.id('pessoa_a'), now() - p_de * interval '1 second',
    now() - p_ate * interval '1 second')
$$;

create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
    || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- Chama uma função com o JWT de quem (as funções são security definer: o recorte vem só do JWT).
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
-- A segunda-feira da semana S (3 semanas antes da semana de hoje): a semana inteira já passou.
create function testes.s() returns date language sql stable as $$
  select date_trunc('week', testes.hoje()::timestamp)::date - 21
$$;
-- Um instante da semana S: dia (0 = segunda) e hora de São Paulo.
create function testes.em(p_dia int, p_hora numeric) returns timestamptz language sql stable as $$
  select ((testes.s() + p_dia)::timestamp + p_hora * interval '1 hour') at time zone 'America/Sao_Paulo'
$$;
-- Os argumentos de um período de p_dias dias a partir de S.
create function testes.periodo(p_dias int default 7) returns text language sql stable as $$
  select format('p_de => %L::date, p_ate => %L::date', testes.s(), testes.s() + p_dias - 1)
$$;
-- 'S+n=valor' para os dias da semana S nas expectativas.
create function testes.d(p_n int, p_valor text) returns text language sql stable as $$
  select (testes.s() + p_n) || '=' || p_valor
$$;

-- Os dias com horas, como 'dia=horas', na ordem; com p_antes, só a diferença.
create function testes.dias(p jsonb, p_antes jsonb default null) returns text[] language sql immutable as $$
  select coalesce(array_agg(x.d || '=' || trim_scale(x.h - coalesce(a.h, 0)) order by x.d)
    filter (where x.h - coalesce(a.h, 0) <> 0), '{}')
  from (select (e ->> 'dia')::date as d, (e ->> 'horas')::numeric as h from jsonb_array_elements(p -> 'dias') e) x
  left join (select (e ->> 'dia')::date as d, (e ->> 'horas')::numeric as h
    from jsonb_array_elements(p_antes -> 'dias') e) a on a.d = x.d
$$;
-- As células com check-in, como 'dia_semana/hora=quantos', na ordem; com p_antes, só a diferença.
create function testes.calor(p jsonb, p_antes jsonb default null) returns text[] language sql immutable as $$
  select coalesce(array_agg(x.d || '/' || x.h || '=' || (x.n - coalesce(a.n, 0)) order by x.d, x.h)
    filter (where x.n - coalesce(a.n, 0) <> 0), '{}')
  from (select (e ->> 'dia_semana')::int as d, (e ->> 'hora')::int as h, (e ->> 'checkins')::int as n
    from jsonb_array_elements(p -> 'celulas') e) x
  left join (select (e ->> 'dia_semana')::int as d, (e ->> 'hora')::int as h, (e ->> 'checkins')::int as n
    from jsonb_array_elements(p_antes -> 'celulas') e) a on a.d = x.d and a.h = x.h
$$;
-- As séries como 'nome:h1|h2|...', na ordem.
create function testes.series(p jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(coalesce(s ->> 'nome', '?') || ':' || (
      select string_agg(trim_scale(h::text::numeric)::text, '|' order by i)
      from jsonb_array_elements(s -> 'horas') with ordinality y(h, i))
    order by o), '{}')
  from jsonb_array_elements(p -> 'series') with ordinality x(s, o)
$$;
-- A soma das séries (a primeira semana) de horas_por_unidade_por_semana.
create function testes.soma_series(p jsonb) returns numeric language sql immutable as $$
  select coalesce(sum((e -> 'horas' ->> 0)::numeric), 0) from jsonb_array_elements(p -> 'series') e
$$;
-- As horas fechadas de cada consultoria do teste na semana S, contadas direto dos check-ins (só as com horas).
create function testes.horas_na_semana_s() returns table (id uuid, horas numeric) language sql stable as $$
  select k.consultoria_id, sum(extract(epoch from k.fim - k.inicio)) / 3600
  from public.checkins k
  where k.consultoria_id in (select f.id from testes.fx f) and k.fim is not null
    and k.inicio >= testes.s()::timestamp at time zone 'America/Sao_Paulo'
    and k.inicio < (testes.s() + 7)::timestamp at time zone 'America/Sao_Paulo'
  group by k.consultoria_id
$$;
-- As partes das tarefas na ordem do desenho (feitas, não se aplica, andamento, pausadas, a fazer, atrasadas) e quantos
-- check-lists; com p_antes, só a diferença.
create function testes.partes(p jsonb, p_antes jsonb default '{}') returns int[] language sql immutable as $$
  select array_agg(coalesce((p ->> k)::int, 0) - coalesce((p_antes ->> k)::int, 0) order by o)
  from unnest(array['feitas', 'nao_se_aplica', 'andamento', 'pausadas', 'a_fazer', 'atrasadas', 'checklists'])
    with ordinality u(k, o)
$$;
-- O que não pode aparecer para a gestão da B: ids e nomes da A, das pessoas e dos clientes dela.
create function testes.sem_a(p jsonb) returns boolean language sql stable as $$
  select not exists (
    select 1 from unnest(array[testes.id('A')::text, 'Gráficos variados A', testes.id('pessoa_a')::text, 'Pessoa pessoa_a',
      testes.id('pessoa_a2')::text, testes.id('a1')::text, 'Cliente a1', 'Modelo cl_a1']) m
    where p::text like '%' || m || '%')
$$;

-- Média (ms) de 5 execuções, só para o relatório (diag): o limite de verdade é o performs_within.
create function testes.media_ms_de(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop execute p_sql; end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms_de(text) to authenticated;
-- Quantas vezes a tabela checkins foi varrida inteira (Seq Scan) ao rodar o comando (o contador desta transação).
create function testes.varreduras(p_sql text) returns bigint language plpgsql as $$
declare v_antes bigint := pg_stat_get_xact_numscans('public.checkins'::regclass);
begin
  execute p_sql;
  return pg_stat_get_xact_numscans('public.checkins'::regclass) - v_antes;
end $$;
grant execute on function testes.varreduras(text) to authenticated;
-- ── Antes dos dados: o que a central já vê ───────────────────────────────────
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('K');
select testes.consultoria('C');
select testes.consultoria('E');
select testes.perfil('central', 'central', null);
select testes.guardar('antes_dias', 'central', 'public.horas_do_painel_por_dia(' || testes.periodo() || ')');
select testes.guardar('antes_calor', 'central', 'public.checkins_por_dia_e_hora(' || testes.periodo() || ')');
select testes.guardar('antes_unid', 'central', 'public.horas_por_unidade_por_semana(' || testes.periodo() || ')');
select testes.guardar('antes_tarefas', 'central', 'public.tarefas_por_situacao()');
select testes.guardar('antes_cidades', 'central', 'public.clientes_por_cidade()');

-- ── Dados ────────────────────────────────────────────────────────────────────
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('travado_a', 'pessoa', 'A', true);
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.perfil('admin_k', 'admin', 'K');
select testes.perfil('pessoa_k' || lpad(i::text, 2, '0'), 'pessoa', 'K') from generate_series(1, 10) i;
select testes.perfil('admin_c', 'admin', 'C');
select testes.perfil('admin_e', 'admin', 'E');

-- A: a1 (pessoa_a) e a2 (pessoa_a2), sem cidade. Na semana S, hora de São Paulo:
-- - pessoa_a: segunda 10h (1 h); quarta 6h (1 h 30: conta na 7h); domingo 23h30 (30 min: no domingo e às 20h, embora
--   em UTC já seja segunda); o domingo antes de S às 23h30 (1 h: fora do período, embora em UTC já seja a segunda S); a
--   terça da semana seguinte às 9h (1 h: só no período de 2 semanas);
-- - pessoa_a2: segunda 14h (2 h) e terça 21h15 (45 min: conta na 20h; 0,75 h no dia).
select testes.cliente('a1', 'A', 'pessoa_a');
select testes.cliente('a2', 'A', 'pessoa_a2');
select testes.checkin('pessoa_a', 'a1', testes.em(0, 10), 60);
select testes.checkin('pessoa_a', 'a1', testes.em(2, 6), 90);
select testes.checkin('pessoa_a', 'a1', testes.em(6, 23.5), 30);
select testes.checkin('pessoa_a', 'a1', testes.em(-1, 23.5), 60);
select testes.checkin('pessoa_a', 'a1', testes.em(8, 9), 60);
select testes.checkin('pessoa_a2', 'a2', testes.em(0, 14), 120);
select testes.checkin('pessoa_a2', 'a2', testes.em(1, 21.25), 45);
-- B: b1 (pessoa_b, sem cidade), segunda 10h (1 h).
select testes.cliente('b1', 'B', 'pessoa_b');
select testes.checkin('pessoa_b', 'b1', testes.em(0, 10), 60);
-- K: a pessoa_kNN faz NN horas na quinta às 8h (55 h); a pessoa_k10 é desativada depois.
select testes.cliente('k' || lpad(i::text, 2, '0'), 'K', 'pessoa_k' || lpad(i::text, 2, '0')) from generate_series(1, 10) i;
select testes.checkin('pessoa_k' || lpad(i::text, 2, '0'), 'k' || lpad(i::text, 2, '0'), testes.em(3, 8), i * 60)
from generate_series(1, 10) i;
select set_config('request.jwt.claims', '', true);
update public.perfis set ativo = false, desativado_em = now() where id = testes.id('pessoa_k10');

-- Check-lists. a1: Etapa 1 (2 feitas, 1 não se aplica, 1 em andamento no prazo, 1 em andamento vencida) e Etapa 2 (1
-- pausada que vence hoje, 1 pausada vencida, 2 a fazer no prazo, 1 a fazer vencida). a2: 1 feita e 1 a fazer. a3 é
-- arquivado e a4 só tem um check-list encerrado: não contam. b1: 2 a fazer vencidas.
select testes.checklist('cl_a1', 'a1', '[[1, -10, "feita"], [1, -5, "feita"], [1, -3, "nao_se_aplica"],
  [1, 2, "andamento"], [1, -1, "andamento"], [2, 0, "pausada"], [2, -3, "pausada"], [2, 5, "a_fazer"],
  [2, 1, "a_fazer"], [2, -2, "a_fazer"]]');
select testes.checklist('cl_a2', 'a2', '[[1, -2, "feita"], [1, 3, "a_fazer"]]');
select testes.cliente('a3', 'A', 'pessoa_a');
select testes.checklist('cl_a3', 'a3', '[[1, -2, "a_fazer"]]');
update public.clientes set arquivado_em = now() where id = testes.id('a3');
select testes.cliente('a4', 'A', 'pessoa_a');
select testes.checklist('cl_a4', 'a4', '[[1, -2, "a_fazer"]]');
update public.cliente_checklists set encerrado_em = now(), motivo = 'tirado' where id = testes.id('cl_a4');
select testes.checklist('cl_b1', 'b1', '[[1, -1, "a_fazer"], [1, -2, "a_fazer"]]');

-- Tempos do a1 (segundos): Tarefa 2 = 3.600 + 3.600; Tarefa 1 = 3.600; Tarefa 4 aberta há 1.800; 5 = 600; 6 = 300;
-- 7 = 60; 8 = 30; 9 = um trecho de zero. a2: Tarefa 1 = zero, Tarefa 2 = 120.
select testes.tempo('cl_a1', 2, 30000, 26400);
select testes.tempo('cl_a1', 2, 20000, 16400);
select testes.tempo('cl_a1', 1, 10000, 6400);
select testes.tempo('cl_a1', 4, 1800, null);
select testes.tempo('cl_a1', 5, 5000, 4400);
select testes.tempo('cl_a1', 6, 4000, 3700);
select testes.tempo('cl_a1', 7, 3000, 2940);
select testes.tempo('cl_a1', 8, 2000, 1970);
select testes.tempo('cl_a1', 9, 1000, 1000);
select testes.tempo('cl_a2', 1, 1000, 1000);
select testes.tempo('cl_a2', 2, 900, 780);

-- C: só clientes esperando consultor, para as cidades. "Cidade Um" em três grafias (6 + 2 + 1 = 9), depois 8, 7, 6, 5 e
-- 4 (os 6 maiores), 3, 2 e 1 (Outras = 6), 2 sem cidade (nula e em branco) e um arquivado na Cidade Seis (não conta).
select testes.cliente('cid_' || v.k || '_' || i, 'C', null, v.cidade, v.uf)
from (values (1, 'Cidade Um', 'SC', 6), (2, 'cidade um ', 'SC', 2), (3, 'Cidade Úm', 'SC', 1), (4, 'Cidade Dois', 'SC', 8),
  (5, 'Cidade Três', 'SC', 7), (6, 'Cidade Quatro', 'PR', 6), (7, 'Cidade Cinco', 'PR', 5), (8, 'Cidade Seis', 'RS', 4),
  (9, 'Cidade Sete', 'RS', 3), (10, 'Cidade Oito', 'SP', 2), (11, 'Cidade Nove', 'SP', 1), (12, null, null, 1),
  (13, '  ', 'SC', 1)) v(k, cidade, uf, n)
cross join lateral generate_series(1, v.n) i;
select testes.cliente('cid_arq', 'C', null, 'Cidade Seis', 'RS');
update public.clientes set arquivado_em = now() where id = testes.id('cid_arq');

-- ── O que cada um recebe ─────────────────────────────────────────────────────
select testes.guardar('dias_admin', 'admin_a', 'public.horas_do_painel_por_dia(' || testes.periodo() || ')');
select testes.guardar('dias_pessoa', 'pessoa_a', 'public.horas_do_painel_por_dia(' || testes.periodo() || ')');
select testes.guardar('dias_central', 'central', 'public.horas_do_painel_por_dia(' || testes.periodo() || ')');
select testes.guardar('dias_b', 'admin_b', 'public.horas_do_painel_por_dia(' || testes.periodo() || ')');
select testes.guardar('dias_e', 'admin_e', 'public.horas_do_painel_por_dia(' || testes.periodo() || ')');
select testes.guardar('dias_futuro', 'admin_a', $$public.horas_do_painel_por_dia(date '2037-11-01')$$);
select testes.guardar('calor_admin', 'admin_a', 'public.checkins_por_dia_e_hora(' || testes.periodo() || ')');
select testes.guardar('calor_pessoa', 'pessoa_a', 'public.checkins_por_dia_e_hora(' || testes.periodo() || ')');
select testes.guardar('calor_central', 'central', 'public.checkins_por_dia_e_hora(' || testes.periodo() || ')');
select testes.guardar('calor_b', 'admin_b', 'public.checkins_por_dia_e_hora(' || testes.periodo() || ')');
select testes.guardar('calor_e', 'admin_e', 'public.checkins_por_dia_e_hora(' || testes.periodo() || ')');
select testes.guardar('calor_futuro', 'admin_a', $$public.checkins_por_dia_e_hora(date '2037-11-01')$$);
select testes.guardar('unid_admin', 'admin_a', 'public.horas_por_unidade_por_semana(' || testes.periodo() || ')');
select testes.guardar('unid_gestor', 'gestor_a', 'public.horas_por_unidade_por_semana(' || testes.periodo() || ')');
select testes.guardar('unid_admin_2', 'admin_a', 'public.horas_por_unidade_por_semana(' || testes.periodo(14) || ')');
select testes.guardar('unid_k', 'admin_k', 'public.horas_por_unidade_por_semana(' || testes.periodo() || ')');
select testes.guardar('unid_central', 'central', 'public.horas_por_unidade_por_semana(' || testes.periodo() || ')');
select testes.guardar('unid_b', 'admin_b', 'public.horas_por_unidade_por_semana(' || testes.periodo() || ')');
select testes.guardar('unid_e', 'admin_e', 'public.horas_por_unidade_por_semana(' || testes.periodo() || ')');
select testes.guardar('unid_futuro', 'admin_a', $$public.horas_por_unidade_por_semana(date '2037-11-01')$$);
select testes.guardar('tarefas_admin', 'admin_a', 'public.tarefas_por_situacao()');
select testes.guardar('tarefas_pessoa', 'pessoa_a', 'public.tarefas_por_situacao()');
select testes.guardar('tarefas_central', 'central', 'public.tarefas_por_situacao()');
select testes.guardar('tarefas_b', 'admin_b', 'public.tarefas_por_situacao()');
select testes.guardar('tarefas_e', 'admin_e', 'public.tarefas_por_situacao()');
select testes.guardar('cidades_c', 'admin_c', 'public.clientes_por_cidade()');
select testes.guardar('cidades_a', 'admin_a', 'public.clientes_por_cidade()');
select testes.guardar('cidades_central', 'central', 'public.clientes_por_cidade()');
select testes.guardar('cidades_b', 'admin_b', 'public.clientes_por_cidade()');
select testes.guardar('cidades_e', 'admin_e', 'public.clientes_por_cidade()');
select testes.guardar('hoje_a1', 'admin_a', format('public.hoje_do_cliente(%L::uuid)', testes.id('a1')));
select testes.guardar('hoje_a2', 'admin_a', format('public.hoje_do_cliente(%L::uuid)', testes.id('a2')));

-- ── Quem chama ───────────────────────────────────────────────────────────────
select testes.como('travado_a', 'aal1');
select throws_ok('select public.horas_do_painel_por_dia()', '42501', 'sem_recorte', 'não liberado: horas por dia recusa');
select throws_ok('select public.horas_por_unidade_por_semana()', '42501', 'sem_recorte', 'não liberado: horas por unidade recusa');
select throws_ok('select public.checkins_por_dia_e_hora()', '42501', 'sem_recorte', 'não liberado: calor recusa');
select throws_ok('select public.tarefas_por_situacao()', '42501', 'sem_recorte', 'não liberado: tarefas recusa');
select throws_ok('select public.clientes_por_cidade()', '42501', 'sem_recorte', 'não liberado: cidades recusa');
reset role;
select testes.como('pessoa_a');
select throws_ok('select public.horas_por_unidade_por_semana()', '42501', 'sem_recorte',
  'horas por unidade não existe para o consultor (central e gestão)');
select throws_ok('select public.clientes_por_cidade()', '42501', 'sem_recorte', 'cidades não existe para o consultor (central e gestão)');
reset role;
select ok(bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute')),
  'as 5 funções novas: authenticated executa, anon não')
from unnest(array['public.horas_do_painel_por_dia(date, date, date)', 'public.horas_por_unidade_por_semana(date, date, date)',
  'public.checkins_por_dia_e_hora(date, date, date)', 'public.tarefas_por_situacao()', 'public.clientes_por_cidade()']) f;

-- ── Período ──────────────────────────────────────────────────────────────────
select is(
  (select array_agg(d order by o) from unnest(array[
    testes.detalhe('admin_a', format('public.horas_do_painel_por_dia(p_de => %L::date, p_ate => %L::date)', testes.s() + 6, testes.s())),
    testes.detalhe('admin_a', format('public.horas_por_unidade_por_semana(p_de => %L::date, p_ate => %L::date)', testes.s() + 6, testes.s())),
    testes.detalhe('admin_a', format('public.checkins_por_dia_e_hora(p_de => %L::date, p_ate => %L::date)', testes.s() + 6, testes.s())),
    testes.detalhe('admin_a', format('public.horas_do_painel_por_dia(%L::date, %L::date, %L::date)', testes.s(), testes.s(), testes.s())),
    testes.detalhe('admin_a', format('public.horas_por_unidade_por_semana(%L::date, %L::date, %L::date)', testes.s(), testes.s(), testes.s())),
    testes.detalhe('admin_a', format('public.checkins_por_dia_e_hora(%L::date, %L::date, %L::date)', testes.s(), testes.s(), testes.s()))
  ]) with ordinality u(d, o)),
  array['A data inicial vem depois da final.', 'A data inicial vem depois da final.', 'A data inicial vem depois da final.',
    'Mande o mês ou o período (de e até), não os dois.', 'Mande o mês ou o período (de e até), não os dois.',
    'Mande o mês ou o período (de e até), não os dois.'],
  'período: as três com período recusam como o painel (a mesma frase)');
select testes.como('admin_a');
select throws_ok(format('select public.checkins_por_dia_e_hora(p_de => %L::date, p_ate => %L::date)', testes.s() + 6, testes.s()),
  '22023', 'periodo_invalido', 'período: o código e a mensagem do painel (periodo_invalido)');
reset role;
select ok(jsonb_array_length(testes.j('dias_futuro') -> 'dias') = 30 and testes.dias(testes.j('dias_futuro')) = '{}'
    and testes.j('unid_futuro') = jsonb_build_object('recorte', 'consultoria', 'semanas', '[]'::jsonb, 'series', '[]'::jsonb)
    and testes.calor(testes.j('calor_futuro')) = '{}' and jsonb_array_length(testes.j('calor_futuro') -> 'celulas') = 98,
  'período: um mês futuro tem os 30 dias zerados, nenhuma semana e o calor zerado');

-- ── Horas no período × capacidade ────────────────────────────────────────────
select is(array[jsonb_array_length(testes.j('dias_admin') -> 'dias')::text, testes.j('dias_admin') -> 'dias' -> 0 ->> 'dia',
    testes.j('dias_admin') -> 'dias' -> 6 ->> 'dia'] || testes.dias(testes.j('dias_admin')),
  array['7', testes.s()::text, (testes.s() + 6)::text, testes.d(0, '3'), testes.d(1, '0.75'), testes.d(2, '1.5'), testes.d(6, '0.5')],
  'por dia, gestão: os 7 dias da semana, cada um com as horas que começam nele no dia de São Paulo (o domingo 23h30 no '
  'domingo; o de antes de S fora)');
select is(array[(testes.j('dias_admin') ->> 'capacidade')::numeric, (testes.j('dias_admin') ->> 'hoje')::date - testes.hoje()],
  array[(select sum(x.capacidade) from private.capacidades_do_periodo(testes.id('A'), testes.s(), testes.s() + 6, null) x), 0],
  'por dia, gestão: a capacidade do período inteiro (capacidades_do_periodo) e o dia de hoje');
select is(testes.dias(testes.j('dias_pessoa')) || array[testes.j('dias_pessoa') ->> 'capacidade'],
  array[testes.d(0, '1'), testes.d(2, '1.5'), testes.d(6, '0.5'),
    (select sum(x.capacidade)::text from private.capacidades_do_periodo(testes.id('A'), testes.s(), testes.s() + 6,
      array[testes.id('pessoa_a')]) x)],
  'por dia, consultor: só as horas dele e só a capacidade dele');
select is(testes.dias(testes.j('dias_central'), testes.j('antes_dias')),
  array[testes.d(0, '4'), testes.d(1, '0.75'), testes.d(2, '1.5'), testes.d(3, '55'), testes.d(6, '0.5')],
  'por dia, central: as horas de todas as consultorias (o que o teste acrescentou: A, B e K)');
select is((testes.j('dias_central') ->> 'capacidade')::numeric - (testes.j('antes_dias') ->> 'capacidade')::numeric,
  (select sum(x.capacidade) from private.capacidades_do_periodo(null, testes.s(), testes.s() + 6,
    array(select f.id from testes.fx f join public.perfis p on p.id = f.id)) x),
  'por dia, central: a capacidade soma a de todos (o que o teste acrescentou: os consultores ativos do teste)');

-- ── Quando os check-ins acontecem ────────────────────────────────────────────
select is(testes.calor(testes.j('calor_admin')) || array[jsonb_array_length(testes.j('calor_admin') -> 'celulas')::text,
    testes.j('calor_admin') ->> 'de', testes.j('calor_admin') ->> 'ate'],
  array['0/20=1', '1/10=1', '1/14=1', '2/20=1', '3/7=1', '98', testes.s()::text, (testes.s() + 6)::text],
  'calor, gestão: domingo 23h30 no domingo às 20h, 21h15 na 20h, 6h na 7h; as 98 células (dom = 0, 7h a 20h); período '
  'de menos de 8 semanas: a janela é o período inteiro');
select is(testes.calor(testes.j('calor_pessoa')), array['0/20=1', '1/10=1', '3/7=1'], 'calor, consultor: só os check-ins dele');
select is(testes.calor(testes.j('calor_central'), testes.j('antes_calor')),
  array['0/20=1', '1/10=2', '1/14=1', '2/20=1', '3/7=1', '4/8=10'],
  'calor, central: os check-ins de todas as consultorias (o que o teste acrescentou: A, B e K)');

-- ── Horas por unidade por semana ─────────────────────────────────────────────
select ok(testes.j('unid_admin') ->> 'recorte' = 'consultoria'
    and testes.j('unid_admin') -> 'semanas' = jsonb_build_array(testes.s())
    and testes.series(testes.j('unid_admin')) = array['Pessoa pessoa_a:3', 'Pessoa pessoa_a2:2.8']
    and testes.j('unid_admin') -> 'series' -> 0 ->> 'id' = testes.id('pessoa_a')::text
    and testes.j('unid_gestor') = testes.j('unid_admin'),
  'por unidade, gestão (administrador e gestor): uma série por consultor, a maior primeiro');
select ok(testes.j('unid_admin_2') -> 'semanas' = jsonb_build_array(testes.s(), testes.s() + 7)
    and testes.series(testes.j('unid_admin_2')) = array['Pessoa pessoa_a:3|1', 'Pessoa pessoa_a2:2.8|0'],
  'por unidade, 2 semanas: as horas de cada série alinhadas com as semanas (0 na semana sem horas)');
select is(testes.series(testes.j('unid_k')),
  array['Pessoa pessoa_k10:10', 'Pessoa pessoa_k09:9', 'Pessoa pessoa_k08:8', 'Pessoa pessoa_k07:7', 'Pessoa pessoa_k06:6',
    'Pessoa pessoa_k05:5', 'Pessoa pessoa_k04:4', 'Pessoa pessoa_k03:3', 'Outros:3'],
  'por unidade, 10 consultores: os 8 maiores e "Outros" com o resto (1 + 2); a desativada aparece com o nome');
select ok((select e -> 'id' = 'null'::jsonb from jsonb_array_elements(testes.j('unid_k') -> 'series') e where e ->> 'nome' = 'Outros')
    and (select sum((e -> 'horas' ->> 0)::numeric) from jsonb_array_elements(testes.j('unid_k') -> 'series') e) = 55,
  'por unidade: "Outros" tem id nulo e a soma das séries é o total da consultoria (55 h)');
-- A central também vê os dados do banco local, que podem empurrar as consultorias do teste para "Outros": cada uma é
-- conferida na própria série ou dentro de "Outros", e a soma das séries contra a soma direta dos check-ins do teste.
select ok(testes.j('unid_central') ->> 'recorte' = 'tudo'
    and (select bool_and(e -> 'id' = 'null'::jsonb or exists (select 1 from public.consultorias co where co.id = (e ->> 'id')::uuid))
      from jsonb_array_elements(testes.j('unid_central') -> 'series') e),
  'por unidade, central: as séries são consultorias (e "Outros")');
select ok((select bool_and(case
      when exists (select 1 from jsonb_array_elements(testes.j('unid_central') -> 'series') e where e ->> 'id' = u.id::text)
        then exists (select 1 from jsonb_array_elements(testes.j('unid_central') -> 'series') e
          where e ->> 'id' = u.id::text and (e -> 'horas' ->> 0)::numeric = round(u.horas, 1))
      else exists (select 1 from jsonb_array_elements(testes.j('unid_central') -> 'series') e
          where e -> 'id' = 'null'::jsonb and (e -> 'horas' ->> 0)::numeric >= u.horas - 0.05) end)
    from testes.horas_na_semana_s() u),
  'por unidade, central: cada consultoria do teste com as horas dela (A 5,75 h, B 1 h, K 55 h) ou dentro de "Outros"');
select ok(abs(testes.soma_series(testes.j('unid_central')) - testes.soma_series(testes.j('antes_unid'))
      - (select sum(u.horas) from testes.horas_na_semana_s() u))
    <= 0.05 * (jsonb_array_length(testes.j('unid_central') -> 'series') + jsonb_array_length(testes.j('antes_unid') -> 'series')),
  'por unidade, central: a soma das séries cresce o total dos check-ins do teste (61,75 h; até 0,05 h por série arredondada)');

-- ── Tarefas por situação ─────────────────────────────────────────────────────
select is(testes.partes(testes.j('tarefas_admin')), array[3, 1, 1, 1, 3, 3, 2],
  'tarefas, gestão: feitas, não se aplica, em andamento e pausadas no prazo, a fazer no prazo, atrasadas e check-lists');
select is((select sum(x) from unnest(testes.partes(testes.j('tarefas_admin'))) with ordinality u(x, o) where o <= 6)::int,
  (select count(*)::int from public.checklist_tarefas t
    join public.cliente_checklists cl on cl.id = t.checklist_id and cl.encerrado_em is null
    join public.clientes c on c.id = cl.cliente_id and not c.arquivado and c.consultoria_id = testes.id('A')
    where cl.id in (select id from testes.fx)),
  'tarefas, gestão: as partes somam as tarefas dos check-lists abertos (a atrasada não conta em andamento, pausadas nem a fazer)');
select is(testes.partes(testes.j('tarefas_pessoa')), array[2, 1, 1, 1, 2, 3, 1],
  'tarefas, consultor: só o check-list do cliente dele (o arquivado e o encerrado não contam)');
select is(testes.partes(testes.j('tarefas_central'), testes.j('antes_tarefas')), array[3, 1, 1, 1, 3, 5, 3],
  'tarefas, central: todas as consultorias (o que o teste acrescentou: A e B)');

-- ── Clientes por cidade ──────────────────────────────────────────────────────
select is(testes.j('cidades_c'),
  '{"cidades": [{"cidade": "Cidade Um", "uf": "SC", "clientes": 9}, {"cidade": "Cidade Dois", "uf": "SC", "clientes": 8},
     {"cidade": "Cidade Três", "uf": "SC", "clientes": 7}, {"cidade": "Cidade Quatro", "uf": "PR", "clientes": 6},
     {"cidade": "Cidade Cinco", "uf": "PR", "clientes": 5}, {"cidade": "Cidade Seis", "uf": "RS", "clientes": 4},
     {"cidade": null, "uf": null, "clientes": 2}],
    "outras": 6, "total": 47}'::jsonb,
  'cidades: as 6 maiores (sem acento e sem maiúscula juntas, na grafia mais comum), "Sem cidade" (cidade nula) no fim, '
  'Outras com o resto e o total; o arquivado não conta');
select is(testes.j('cidades_a'), '{"cidades": [{"cidade": null, "uf": null, "clientes": 3}], "outras": 0, "total": 3}'::jsonb,
  'cidades, gestão da A: só os clientes ativos dela (a1, a2 e a4, sem cidade; o a3 arquivado não conta)');
select is((testes.j('cidades_central') ->> 'total')::int - (testes.j('antes_cidades') ->> 'total')::int,
  (select count(*)::int from public.clientes c join testes.fx f on f.id = c.id where not c.arquivado),
  'cidades, central: o total conta os clientes ativos de todas as consultorias (o que o teste acrescentou)');

-- ── Outra consultoria ────────────────────────────────────────────────────────
select ok(testes.dias(testes.j('dias_b')) = array[testes.d(0, '1')] and testes.calor(testes.j('calor_b')) = array['1/10=1']
    and testes.series(testes.j('unid_b')) = array['Pessoa pessoa_b:1']
    and testes.partes(testes.j('tarefas_b')) = array[0, 0, 0, 0, 0, 2, 1]
    and testes.j('cidades_b') = '{"cidades": [{"cidade": null, "uf": null, "clientes": 1}], "outras": 0, "total": 1}'::jsonb
    and testes.sem_a(testes.j('dias_b')) and testes.sem_a(testes.j('calor_b')) and testes.sem_a(testes.j('unid_b'))
    and testes.sem_a(testes.j('tarefas_b')) and testes.sem_a(testes.j('cidades_b')),
  'outra consultoria: a gestão da B só recebe o que é da B (nada da A em nenhuma das cinco)');
select ok(testes.dias(testes.j('dias_e')) = '{}' and jsonb_array_length(testes.j('dias_e') -> 'dias') = 7
    and (testes.j('dias_e') ->> 'capacidade')::numeric
      = (select sum(x.capacidade) from private.capacidades_do_periodo(testes.id('E'), testes.s(), testes.s() + 6, null) x)
    and testes.calor(testes.j('calor_e')) = '{}'
    and testes.j('unid_e') = jsonb_build_object('recorte', 'consultoria', 'semanas', jsonb_build_array(testes.s()), 'series', '[]'::jsonb)
    and testes.partes(testes.j('tarefas_e')) = array[0, 0, 0, 0, 0, 0, 0]
    and testes.j('cidades_e') = '{"cidades": [], "outras": 0, "total": 0}'::jsonb,
  'consultoria vazia: dias zerados (com a capacidade dela), calor zerado, nenhuma série, tarefas zeradas e nenhuma cidade');

-- ── Faixa Hoje do cliente: etapas e tempo ────────────────────────────────────
select is((select jsonb_agg(e - 'id' order by o) from jsonb_array_elements(testes.j('hoje_a1') -> 'checklist' -> 'etapas')
    with ordinality t(e, o)),
  '[{"nome": "Etapa 1", "tarefas": 5, "feitas": 2, "nao_se_aplica": 1, "atrasadas": 1, "andamento": 1, "pausadas": 0},
    {"nome": "Etapa 2", "tarefas": 5, "feitas": 0, "nao_se_aplica": 0, "atrasadas": 2, "andamento": 0, "pausadas": 1}]'::jsonb,
  'hoje: cada etapa com andamento e pausadas no prazo (a vencida conta só em atrasadas; a que vence hoje está no prazo)');
select is(testes.j('hoje_a1') -> 'checklist' -> 'mais_tempo',
  '[{"titulo": "Tarefa 2", "segundos": 7200}, {"titulo": "Tarefa 1", "segundos": 3600}, {"titulo": "Tarefa 4", "segundos": 1800},
    {"titulo": "Tarefa 5", "segundos": 600}, {"titulo": "Tarefa 6", "segundos": 300}]'::jsonb,
  'hoje: mais_tempo são as 5 tarefas com mais tempo, a maior primeiro (a soma dos trechos; o aberto até agora)');
select is(testes.j('hoje_a2') -> 'checklist' -> 'mais_tempo', '[{"titulo": "Tarefa 2", "segundos": 120}]'::jsonb,
  'hoje: mais_tempo só com tempo maior que zero');
select is(array[
    (select array_agg(k order by k) from jsonb_object_keys(testes.j('hoje_a1')) k)::text,
    (select array_agg(k order by k) from jsonb_object_keys(testes.j('hoje_a1') -> 'checklist') k)::text,
    (select array_agg(k order by k) from jsonb_object_keys(testes.j('hoje_a1') -> 'checklist' -> 'etapas' -> 0) k)::text],
  array['{arquivado_em,checkin,checklist,previsao,quadro,reuniao}',
    '{atrasadas,etapas,feitas,mais_tempo,modelo_nome,nao_se_aplica,proxima,tarefas}',
    '{andamento,atrasadas,feitas,id,nao_se_aplica,nome,pausadas,tarefas}'],
  'hoje: as chaves de antes continuam; entram só mais_tempo e, por etapa, andamento e pausadas');

-- ── Calor: as últimas 8 semanas do período ───────────────────────────────────
-- J: um período de um ano até hoje (como "Este ano", mas sem depender da data em que o teste roda); a janela do calor é
-- de hoje - 55 a hoje. Check-ins 10 semanas antes do fim (9h) e no dia antes da janela (11h): fora; no primeiro dia da
-- janela (13h) e 3 semanas antes do fim (15h): dentro. Fica depois das conferências da central (que contam pela
-- diferença e pelos dados do teste).
select testes.consultoria('J');
select testes.perfil('admin_j', 'admin', 'J');
select testes.perfil('pessoa_j', 'pessoa', 'J');
select testes.cliente('j1', 'J', 'pessoa_j');
select testes.checkin('pessoa_j', 'j1', ((testes.hoje() - x.d)::timestamp + x.h * interval '1 hour') at time zone 'America/Sao_Paulo', 30)
from (values (70, 9), (56, 11), (55, 13), (21, 15)) x(d, h);
select testes.guardar('calor_j', 'admin_j',
  format('public.checkins_por_dia_e_hora(p_de => %L::date, p_ate => %L::date)', testes.hoje() - 364, testes.hoje()));
select is(array[testes.j('calor_j') ->> 'de', testes.j('calor_j') ->> 'ate'] || testes.calor(testes.j('calor_j')),
  array[(testes.hoje() - 55)::text, testes.hoje()::text] || (select array_agg(x.d || '/' || x.h || '=1' order by x.d, x.h)
    from (values (extract(dow from testes.hoje() - 55)::int, 13), (extract(dow from testes.hoje() - 21)::int, 15)) x(d, h)),
  'calor, período longo: só as últimas 8 semanas (de hoje - 55 a hoje, devolvidas em de e ate); 10 semanas antes e o '
  'dia antes da janela ficam fora, 3 semanas antes e o primeiro dia entram');

-- ── Tempos ───────────────────────────────────────────────────────────────────
-- 20 consultorias (V), 250 consultores (o n-ésimo é da consultoria (n - 1) % 20 + 1; os 20 primeiros administram), 5.000
-- clientes (20 por consultor; 1 em cada 20 sem cidade, os outros em 40 cidades), 200.000 check-ins fechados de 1 h (800
-- por consultor, um a cada 1 h 48, de ontem para trás: ~2 meses, ≈ 100.000 por mês, a densidade de painel_volume) e 2.500
-- check-lists abertos de 20 tarefas. Gravados pelo sistema, em lote: os check-ins em ordem de início, com
-- checkins_validar e checkins_resumir_horas desligados só nesta transação (como em painel_volume) e o resumo por dia (o
-- único resumo que estas funções leem) preenchido numa soma só; os contadores dos check-lists por recontar_checklist.
select set_config('request.jwt.claims', '', true);
create temp table v_co (n int primary key, id uuid not null default gen_random_uuid());
insert into v_co (n) select generate_series(1, 20);
insert into public.consultorias (id, nome) select id, 'Volume variados ' || n from v_co;
create temp table v_pe (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pe (n) select generate_series(1, 250);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'variados' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pe;
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Volume variados ' || p.n, 'variados' || p.n || '@volume.test',
  case when p.n <= 20 then 'admin' else 'pessoa' end
from v_pe p join v_co c on c.n = (p.n - 1) % 20 + 1;
insert into testes.fx select 'v_admin', id from v_pe where n = 1;
insert into testes.fx select 'v_pessoa', id from v_pe where n = 21;

create temp table v_cl (n int primary key, id uuid not null default gen_random_uuid());
insert into v_cl (n) select generate_series(1, 5000);
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id, cidade, uf)
select cl.id, 'Cliente volume variados ' || cl.n, 10, c.id, p.id,
  case when cl.n % 20 <> 0 then 'Cidade volume ' || cl.n % 40 end, case when cl.n % 20 <> 0 then 'SC' end
from v_cl cl
join v_pe p on p.n = (cl.n - 1) % 250 + 1
join v_co c on c.n = (p.n - 1) % 20 + 1;

alter table public.checkins disable trigger checkins_validar;
alter table public.checkins disable trigger checkins_resumir_horas;
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select cl.id, p.id, c.id, now() - interval '1 day' - k * interval '108 minutes',
  now() - interval '1 day' - k * interval '108 minutes' + interval '1 hour', 'Volume variados'
from generate_series(799, 0, -1) k
cross join v_pe p
join v_co c on c.n = (p.n - 1) % 20 + 1
join v_cl cl on cl.n = p.n + 250 * (k % 20)
order by 4;
insert into private.checkins_por_dia (consultoria_id, dia, quantidade, segundos)
select k.consultoria_id, (k.inicio at time zone 'America/Sao_Paulo')::date, count(*), sum(extract(epoch from k.fim - k.inicio))
from public.checkins k join v_co c on c.id = k.consultoria_id
group by 1, 2;
alter table public.checkins enable trigger checkins_validar;
alter table public.checkins enable trigger checkins_resumir_horas;

-- Check-lists dos clientes ímpares: 8 feitas, 1 não se aplica, 2 em andamento, 1 pausada e 8 a fazer, vencendo de 38
-- dias atrás a 6 dias à frente (parte vencida, parte no prazo).
create temp table v_ck (n int primary key, id uuid not null default gen_random_uuid(), etapa uuid not null default gen_random_uuid());
insert into v_ck (n) select n from v_cl where n % 2 = 1;
insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_nome, inicio)
select v.id, c.id, c.consultoria_id, 'Modelo volume', testes.hoje() - 40
from v_ck v join v_cl x on x.n = v.n join public.clientes c on c.id = x.id;
insert into public.checklist_etapas (id, checklist_id, nome, posicao) select v.etapa, v.id, 'Etapa volume', 1 from v_ck v;
insert into public.checklist_tarefas (checklist_id, etapa_id, titulo, prazo_dias, vence_em, posicao, estado, feita_em, motivo)
select v.id, v.etapa, 'Tarefa volume ' || t, 2 * t + v.n % 7, testes.hoje() - 40 + 2 * t + v.n % 7, t,
  case when t <= 8 then 'feita' when t = 9 then 'nao_se_aplica' when t in (18, 19) then 'andamento'
    when t = 20 then 'pausada' else 'a_fazer' end,
  case when t <= 9 then now() end, case when t = 9 then 'Não se aplica no volume' end
from v_ck v cross join generate_series(1, 20) t;
do $$ begin perform private.recontar_checklist(v.id) from v_ck v; end $$;

-- Estatísticas de agora (dentro desta transação, desfeitas no fim), como nos outros testes de volume.
analyze public.consultorias, public.perfis, public.clientes, public.checkins, public.cliente_checklists,
  public.checklist_tarefas, private.checkins_por_dia;

select ok((select count(*) from public.clientes c join v_cl v on v.id = c.id) = 5000
    and (select count(*) from public.checkins k join v_co c on c.id = k.consultoria_id) = 200000
    and (select count(*) from public.checklist_tarefas t join v_ck v on v.id = t.checklist_id) = 50000,
  'volume: 5.000 clientes, 200.000 check-ins e 2.500 check-lists de 20 tarefas');

-- Média de 5 execuções (o pgTAP descarta a mais rápida); janela "média +- folga" centrada em 0,75 x limite com folga de
-- 0,75 x limite: o limite como média, com 50% de tolerância (como painel_volume). O Mês atual (o que o Início abre).
select testes.como('central');
select diag('central, Mês: por dia ' || testes.media_ms_de('select public.horas_do_painel_por_dia()')
  || ' ms; por unidade ' || testes.media_ms_de('select public.horas_por_unidade_por_semana()')
  || ' ms; calor ' || testes.media_ms_de('select public.checkins_por_dia_e_hora()')
  || ' ms; tarefas ' || testes.media_ms_de('select public.tarefas_por_situacao()')
  || ' ms; cidades ' || testes.media_ms_de('select public.clientes_por_cidade()') || ' ms');
select diag('central, Este ano: por dia ' || testes.media_ms_de(format('select public.horas_do_painel_por_dia(p_de => %L::date, p_ate => %L::date)',
    date_trunc('year', testes.hoje()::timestamp)::date, testes.hoje()))
  || ' ms; por unidade ' || testes.media_ms_de(format('select public.horas_por_unidade_por_semana(p_de => %L::date, p_ate => %L::date)',
    date_trunc('year', testes.hoje()::timestamp)::date, testes.hoje()))
  || ' ms; calor ' || testes.media_ms_de(format('select public.checkins_por_dia_e_hora(p_de => %L::date, p_ate => %L::date)',
    date_trunc('year', testes.hoje()::timestamp)::date, testes.hoje())) || ' ms');
select performs_within('select public.horas_do_painel_por_dia()', 37.5, 37.5, 5, 'central: horas por dia em até 50 ms na média (+50%)');
select performs_within('select public.horas_por_unidade_por_semana()', 37.5, 37.5, 5, 'central: horas por unidade em até 50 ms na média (+50%)');
select performs_within('select public.checkins_por_dia_e_hora()', 37.5, 37.5, 5, 'central: calor em até 50 ms na média (+50%)');
select performs_within(format('select public.checkins_por_dia_e_hora(p_de => %L::date, p_ate => %L::date)',
    date_trunc('year', testes.hoje()::timestamp)::date, testes.hoje()), 37.5, 37.5, 5,
  'central: calor de "Este ano" (as últimas 8 semanas) em até 50 ms na média (+50%)');
select performs_within('select public.tarefas_por_situacao()', 37.5, 37.5, 5, 'central: tarefas em até 50 ms na média (+50%)');
select performs_within('select public.clientes_por_cidade()', 37.5, 37.5, 5, 'central: cidades em até 50 ms na média (+50%)');
-- O calor da central fica fora desta conferência: aqui os 200.000 check-ins são todos dos últimos 2 meses e nenhuma
-- página está "toda visível" (a transação não comitou), então a janela é boa parte da tabela e o Seq Scan é a escolha
-- certa do planejador. Num banco de verdade a janela é uma fatia pequena e sai pelo índice checkins_fechados_inicio_idx
-- (só índice); o EXPLAIN está no relatório da Task 2. O tempo dele está acima.
select is(testes.varreduras('select public.horas_do_painel_por_dia()') + testes.varreduras('select public.horas_por_unidade_por_semana()'),
  0::bigint, 'central: horas por dia e por unidade não varrem a tabela de check-ins (leem o resumo por dia)');
reset role;
select testes.como('v_admin');
select diag('gestão, Mês: por dia ' || testes.media_ms_de('select public.horas_do_painel_por_dia()')
  || ' ms; por unidade ' || testes.media_ms_de('select public.horas_por_unidade_por_semana()')
  || ' ms; calor ' || testes.media_ms_de('select public.checkins_por_dia_e_hora()')
  || ' ms; tarefas ' || testes.media_ms_de('select public.tarefas_por_situacao()')
  || ' ms; cidades ' || testes.media_ms_de('select public.clientes_por_cidade()') || ' ms');
select performs_within('select public.horas_do_painel_por_dia()', 37.5, 37.5, 5, 'gestão: horas por dia em até 50 ms na média (+50%)');
select performs_within('select public.horas_por_unidade_por_semana()', 37.5, 37.5, 5, 'gestão: horas por unidade em até 50 ms na média (+50%)');
select performs_within('select public.checkins_por_dia_e_hora()', 37.5, 37.5, 5, 'gestão: calor em até 50 ms na média (+50%)');
select performs_within('select public.tarefas_por_situacao()', 37.5, 37.5, 5, 'gestão: tarefas em até 50 ms na média (+50%)');
select performs_within('select public.clientes_por_cidade()', 37.5, 37.5, 5, 'gestão: cidades em até 50 ms na média (+50%)');
select is(testes.varreduras('select public.horas_do_painel_por_dia()') + testes.varreduras('select public.horas_por_unidade_por_semana()')
    + testes.varreduras('select public.checkins_por_dia_e_hora()'), 0::bigint,
  'gestão: nenhuma varre a tabela de check-ins (sem Seq Scan)');
reset role;
select testes.como('v_pessoa');
select diag('consultor, Mês: por dia ' || testes.media_ms_de('select public.horas_do_painel_por_dia()')
  || ' ms; calor ' || testes.media_ms_de('select public.checkins_por_dia_e_hora()')
  || ' ms; tarefas ' || testes.media_ms_de('select public.tarefas_por_situacao()') || ' ms');
select performs_within('select public.horas_do_painel_por_dia()', 37.5, 37.5, 5, 'consultor: horas por dia em até 50 ms na média (+50%)');
select performs_within('select public.checkins_por_dia_e_hora()', 37.5, 37.5, 5, 'consultor: calor em até 50 ms na média (+50%)');
select performs_within('select public.tarefas_por_situacao()', 37.5, 37.5, 5, 'consultor: tarefas em até 50 ms na média (+50%)');
select is(testes.varreduras('select public.horas_do_painel_por_dia()') + testes.varreduras('select public.checkins_por_dia_e_hora()'),
  0::bigint, 'consultor: nenhuma varre a tabela de check-ins (sem Seq Scan)');
reset role;

select * from finish();
rollback;
