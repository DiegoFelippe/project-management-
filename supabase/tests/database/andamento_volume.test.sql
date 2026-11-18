-- Volume do andamento dos clientes (aba Andamento de Check-ins): 50 consultorias, 5.515 clientes (5.000 com check-list
-- ativo de 40 tarefas — 200.000 tarefas e 195.000 dependências —, 500 sem modelo e 15 com o pior caso da próxima
-- tarefa: 500 tarefas em que a única livre é a última na ordem de data), criados aqui e desfeitos no fim (rollback: nada
-- fica no banco). Tempos (média de 5 execuções; o limite é o dobro do valor do meio do performs_within): a página de 15
-- e os números, para a Central (todas as consultorias), a gestão e o consultor, e a página do pior caso. Além do tempo,
-- o plano das consultas que as funções rodam não pode varrer checklist_tarefas nem checklist_dependencias (Seq Scan):
-- atrasadas e próxima tarefa saem só para as 15 linhas da página (a próxima, já na ordem do índice, para na primeira
-- livre), e os números de prazo só olham as tarefas dos check-lists que vencem em até 7 dias, pelo índice das não feitas.
-- Medido: Central ~7 a 12 ms a página e ~15 ms os números; gestão e consultor ~5 ms a página e ~1,5 ms os números; o pior
-- caso ~24 ms. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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

create function testes.media_ms(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop execute p_sql; end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms(text) to authenticated;

-- true quando o plano da consulta tem Seq Scan na tabela.
create function testes.varre(p_tabela text, p_sql text) returns boolean language plpgsql as $$
declare v_plano jsonb;
begin
  execute 'explain (format json) ' || p_sql into v_plano;
  return jsonb_path_exists(v_plano, '$.** ? (@."Node Type" == "Seq Scan" && @."Relation Name" == $t)',
    jsonb_build_object('t', p_tabela));
end $$;

-- true quando o plano da consulta ordena (Sort ou Incremental Sort): a leitura não sai na ordem do índice.
create function testes.ordena(p_sql text) returns boolean language plpgsql as $$
declare v_plano jsonb;
begin
  execute 'explain (format json) ' || p_sql into v_plano;
  return jsonb_path_exists(v_plano, '$.** ? (@."Node Type" == "Sort" || @."Node Type" == "Incremental Sort")');
end $$;

-- "Hoje" em São Paulo, como o banco conta os prazos.
create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

select set_config('request.jwt.claims', '', true);

-- ── Dados ────────────────────────────────────────────────────────────────────

create temp table v_consultorias (n int primary key, id uuid not null default gen_random_uuid());
insert into v_consultorias (n) select generate_series(1, 50);
insert into public.consultorias (id, nome) select id, 'Volume andamento ' || n from v_consultorias;

-- n = 0 é a central; 1 a 50 gestores (um por consultoria); 51 a 100 consultores (um por consultoria).
create temp table v_pessoas (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pessoas (n) select generate_series(0, 100);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'anvolume' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Pessoa volume ' || p.n, 'anvolume' || p.n || '@volume.test',
  case when p.n = 0 then 'central' when p.n <= 50 then 'gestor' else 'pessoa' end
from v_pessoas p
left join v_consultorias c on c.n = case when p.n = 0 then null when p.n <= 50 then p.n else p.n - 50 end;

-- 5.500 clientes (110 por consultoria, todos do consultor dela): k = 1..5000 com check-list, 5001..5500 sem.
create temp table v_clientes (k int primary key, id uuid not null default gen_random_uuid(), consultoria int not null);
insert into v_clientes (k, consultoria) select k, (k - 1) % 50 + 1 from generate_series(1, 5500) k;
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
select v.id, 'Cliente andamento ' || lpad(v.k::text, 4, '0'), 10, c.id, p.id
from v_clientes v join v_consultorias c on c.n = v.consultoria join v_pessoas p on p.n = 50 + v.consultoria;

-- O modelo da Central para todas (4 etapas de 10 tarefas, cada uma depende da anterior).
insert into testes.fx select 'modelo', gen_random_uuid();
insert into public.modelos (id, nome, da_central, consultoria_id, criado_por, etapas, tarefas, obrigatorias, maior_prazo)
select testes.id('modelo'), 'Modelo volume andamento', true, null, p.id, 4, 40, 27, 160 from v_pessoas p where p.n = 0;

-- 5.000 check-lists (um por cliente, k = 1..5000), como aplicar_modelo grava: as etapas, as 40 tarefas (as primeiras
-- k % 20 feitas pelo consultor; o início varia de hoje a 59 dias atrás, então há atrasadas, as que vencem em 7 dias e
-- as em dia) e as 39 dependências de cada um.
create temp table v_checklists (k int primary key, id uuid not null default gen_random_uuid());
insert into v_checklists (k) select generate_series(1, 5000);
insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_id, modelo_nome, inicio, aplicado_por)
select l.id, c.id, co.id, testes.id('modelo'), 'Modelo volume andamento', testes.hoje() - (l.k % 60), p.id
from v_checklists l join v_clientes c on c.k = l.k join v_consultorias co on co.n = c.consultoria
join v_pessoas p on p.n = c.consultoria;
create temp table v_cl_etapas (k int, e int, id uuid not null default gen_random_uuid(), primary key (k, e));
insert into v_cl_etapas (k, e) select k, e from generate_series(1, 5000) k, generate_series(1, 4) e;
insert into public.checklist_etapas (id, checklist_id, nome, posicao)
select e.id, l.id, 'Etapa ' || e.e, e.e from v_cl_etapas e join v_checklists l on l.k = e.k;
create temp table v_cl_tarefas (k int, t int, id uuid not null default gen_random_uuid(), primary key (k, t));
insert into v_cl_tarefas (k, t) select k, t from generate_series(1, 5000) k, generate_series(1, 40) t;
analyze v_cl_tarefas;
insert into public.checklist_tarefas (id, checklist_id, etapa_id, titulo, obrigatoria, prazo_dias, vence_em, posicao,
  estado, feita_em, feita_por)
select t.id, l.id, e.id, 'Tarefa ' || t.t, t.t % 3 <> 0, t.t * 4, testes.hoje() - (t.k % 60) + t.t * 4, t.t,
  case when t.t <= t.k % 20 then 'feita' else 'a_fazer' end,
  case when t.t <= t.k % 20 then now() end,
  case when t.t <= t.k % 20 then p.id end
from v_cl_tarefas t
join v_checklists l on l.k = t.k
join v_cl_etapas e on e.k = t.k and e.e = (t.t - 1) / 10 + 1
join v_clientes c on c.k = t.k
join v_pessoas p on p.n = 50 + c.consultoria;
insert into public.checklist_dependencias (checklist_id, tarefa_id, depende_de)
select l.id, t.id, a.id
from v_cl_tarefas t join v_cl_tarefas a on a.k = t.k and a.t = t.t - 1 join v_checklists l on l.k = t.k;
update public.cliente_checklists cl
set tarefas = x.tarefas, feitas = x.feitas, obrigatorias = x.obrigatorias, obrigatorias_feitas = x.obrigatorias_feitas,
    proximo_vencimento = x.proximo
from (
  select t.checklist_id, count(*) as tarefas, count(*) filter (where t.estado = 'feita') as feitas,
    count(*) filter (where t.obrigatoria) as obrigatorias,
    count(*) filter (where t.obrigatoria and t.estado = 'feita') as obrigatorias_feitas,
    min(t.vence_em) filter (where t.estado <> 'feita') as proximo
  from public.checklist_tarefas t join v_checklists l on l.id = t.checklist_id
  group by t.checklist_id) x
where cl.id = x.checklist_id;

-- O pior caso da próxima tarefa, na consultoria 2: 15 clientes com o check-list "Pior caso" de 500 tarefas, a 1ª vence
-- daqui a 365 dias e as outras 499 vencem amanhã, todas dependendo dela (bloqueadas): para achar a próxima livre, a
-- leitura passa pelas 499 bloqueadas.
create temp table v_pior (k int primary key, cliente uuid not null default gen_random_uuid(),
  checklist uuid not null default gen_random_uuid(), etapa uuid not null default gen_random_uuid());
insert into v_pior (k) select generate_series(1, 15);
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
select v.id, 'Cliente pior ' || v.k, 10, c.id, p.id
from (select k, cliente as id from v_pior) v join v_consultorias c on c.n = 2 join v_pessoas p on p.n = 52;
insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_nome, inicio, tarefas, proximo_vencimento)
select v.checklist, v.cliente, c.id, 'Pior caso', testes.hoje(), 500, testes.hoje() + 1
from v_pior v join v_consultorias c on c.n = 2;
insert into public.checklist_etapas (id, checklist_id, nome, posicao) select v.etapa, v.checklist, 'Única', 1 from v_pior v;
create temp table v_pior_t (k int, t int, id uuid not null default gen_random_uuid(), primary key (k, t));
insert into v_pior_t (k, t) select k, t from generate_series(1, 15) k, generate_series(1, 500) t;
insert into public.checklist_tarefas (id, checklist_id, etapa_id, titulo, prazo_dias, vence_em, posicao)
select t.id, v.checklist, v.etapa, 'Pior ' || t.t, case when t.t = 1 then 365 else 1 end,
  testes.hoje() + case when t.t = 1 then 365 else 1 end, t.t
from v_pior_t t join v_pior v on v.k = t.k;
insert into public.checklist_dependencias (checklist_id, tarefa_id, depende_de)
select v.checklist, t.id, f.id
from v_pior_t t join v_pior_t f on f.k = t.k and f.t = 1 join v_pior v on v.k = t.k where t.t > 1;

insert into testes.fx select 'central', id from v_pessoas where n = 0;
insert into testes.fx select 'gestor2', id from v_pessoas where n = 2;
insert into testes.fx select 'gestor1', id from v_pessoas where n = 1;
insert into testes.fx select 'consultor1', id from v_pessoas where n = 51;
insert into testes.fx select 'c1', id from v_consultorias where n = 1;
-- O check-list da primeira linha do gestor (o mais atrasado da consultoria 1), para os planos.
insert into testes.fx
select 'checklist_atrasado', cl.id from public.cliente_checklists cl join public.clientes c on c.id = cl.cliente_id
where cl.consultoria_id = testes.id('c1') and cl.encerrado_em is null
order by cl.proximo_vencimento nulls last, c.nome, c.id limit 1;

-- Estatísticas de agora (dentro desta transação, desfeitas no fim).
analyze public.clientes;
analyze public.perfis;
analyze public.modelos;
analyze public.cliente_checklists;
analyze public.checklist_etapas;
analyze public.checklist_tarefas;
analyze public.checklist_dependencias;

-- ── O que vem ────────────────────────────────────────────────────────────────

select testes.como('central');
select is((public.andamento_dos_clientes() ->> 'total')::int,
  (select count(*)::int from public.clientes where not arquivado and consultoria_id is not null),
  'central: o total é o de todos os clientes ativos numa consultoria');
select is(jsonb_array_length(public.andamento_dos_clientes() -> 'itens'), 15, 'central: 15 linhas na página');
select is((public.andamento_dos_clientes(p_situacao => 'sem_modelo', p_busca => 'cliente andamento') ->> 'total')::int,
  500, 'central: os 500 sem modelo');
reset role;

select testes.como('gestor1');
select is((public.andamento_dos_clientes() ->> 'total')::int, 110, 'gestor: os 110 da consultoria');
select is(public.andamento_dos_clientes() #> '{itens,0,checklist,id}', to_jsonb(testes.id('checklist_atrasado')),
  'gestor: o mais atrasado primeiro');
select is((public.indicadores_de_checkins() ->> 'clientes')::int, 110, 'gestor: os números da consultoria');
reset role;

select testes.como('gestor2');
select is(public.andamento_dos_clientes(p_busca => 'pior caso') #> '{itens,0,checklist,proxima}',
  jsonb_build_object('titulo', 'Pior 1', 'vence_em', testes.hoje() + 365),
  'pior caso: a próxima é a única livre, a última na ordem de data');
reset role;

-- ── Tempos ───────────────────────────────────────────────────────────────────

select testes.como('central');
select diag('central, página: ' || testes.media_ms('select public.andamento_dos_clientes()')
  || ' ms; com atraso: ' || testes.media_ms($$select public.andamento_dos_clientes(p_situacao => 'com_atraso')$$)
  || ' ms; sem modelo: ' || testes.media_ms($$select public.andamento_dos_clientes(p_situacao => 'sem_modelo')$$)
  || ' ms; busca: ' || testes.media_ms($$select public.andamento_dos_clientes(p_busca => 'volume andamento')$$)
  || ' ms; página 300: ' || testes.media_ms('select public.andamento_dos_clientes(p_pagina => 300)')
  || ' ms; números: ' || testes.media_ms('select public.indicadores_de_checkins()') || ' ms');
select performs_within('select public.andamento_dos_clientes()', 25, 25, 5,
  'central: a página de 15 entre 5.500 clientes em até 50 ms na média');
select performs_within($$select public.andamento_dos_clientes(p_situacao => 'com_atraso')$$, 25, 25, 5,
  'central: com atraso em até 50 ms na média');
select performs_within($$select public.andamento_dos_clientes(p_busca => 'volume andamento')$$, 25, 25, 5,
  'central: a busca pelo modelo em até 50 ms na média');
select performs_within('select public.indicadores_de_checkins()', 40, 40, 5,
  'central: os números de todas as consultorias em até 80 ms na média');
reset role;

select testes.como('gestor1');
select diag('gestor, página: ' || testes.media_ms('select public.andamento_dos_clientes()')
  || ' ms; números: ' || testes.media_ms('select public.indicadores_de_checkins()') || ' ms');
select performs_within('select public.andamento_dos_clientes()', 10, 10, 5,
  'gestor: a página em até 20 ms na média');
select performs_within('select public.indicadores_de_checkins()', 10, 10, 5,
  'gestor: os números em até 20 ms na média');
reset role;

select testes.como('consultor1');
select diag('consultor, página: ' || testes.media_ms('select public.andamento_dos_clientes()')
  || ' ms; números: ' || testes.media_ms('select public.indicadores_de_checkins()') || ' ms');
select performs_within('select public.andamento_dos_clientes()', 10, 10, 5,
  'consultor: a página em até 20 ms na média');
select performs_within('select public.indicadores_de_checkins()', 10, 10, 5,
  'consultor: os números em até 20 ms na média');
reset role;

select testes.como('gestor2');
select diag('gestor, página do pior caso (15 linhas de 500 tarefas): '
  || testes.media_ms($$select public.andamento_dos_clientes(p_busca => 'pior caso')$$) || ' ms');
select performs_within($$select public.andamento_dos_clientes(p_busca => 'pior caso')$$, 25, 25, 5,
  'gestor: a página do pior caso da próxima tarefa em até 50 ms na média');
reset role;

-- ── Planos ───────────────────────────────────────────────────────────────────
-- As consultas que as funções rodam, com os valores que o plano por chamada põe no lugar.

select set_config('request.jwt.claims', '', true);

-- A lista da gestão (a consultoria e, no consultor, ele): com 110 clientes espalhados entre 5.515, ler a tabela inteira
-- ou ir pelo índice custam quase o mesmo e o plano escolhe por um fio (aqui, a tabela); com mais clientes o índice
-- ganha. O que garante a escala é a consulta poder ir pelo índice, conferido com a varredura desligada (o tempo de
-- verdade está nos testes de tempo acima).
set local enable_seqscan = off;
select ok(not testes.varre('clientes', format($$
  select c.id, c.nome, cl.id, cl.proximo_vencimento
  from public.clientes c
  left join public.cliente_checklists cl
    on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
  where not c.arquivado and c.consultoria_id is not null and c.consultoria_id = %L $$, testes.id('c1')))
  and not testes.varre('cliente_checklists', format($$
  select c.id, c.nome, cl.id, cl.proximo_vencimento
  from public.clientes c
  left join public.cliente_checklists cl
    on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
  where not c.arquivado and c.consultoria_id is not null and c.consultoria_id = %L $$, testes.id('c1'))),
  'a lista da consultoria pode ir por índice (clientes e check-lists)');
select ok(not testes.varre('clientes', format($$
  select c.id, c.nome, cl.id, cl.proximo_vencimento
  from public.clientes c
  left join public.cliente_checklists cl
    on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
  where not c.arquivado and c.consultoria_id is not null and c.consultoria_id = %L and c.consultor_id = %L $$,
    testes.id('c1'), testes.id('consultor1'))),
  'a do consultor também');
reset enable_seqscan;

-- Atrasadas e próxima tarefa de uma linha da página (15 vezes por página): pelo índice das não feitas.
select ok(not testes.varre('checklist_tarefas', format($$
  select count(*) from public.checklist_tarefas t
  where %L::date < %L::date and t.checklist_id = %L and t.estado <> 'feita' and t.vence_em < %L $$,
    testes.hoje() - 30, testes.hoje(), testes.id('checklist_atrasado'), testes.hoje()))
  and not testes.varre('checklist_tarefas', format($$
  select jsonb_build_object('titulo', t.titulo, 'vence_em', t.vence_em)
  from public.checklist_tarefas t
  where t.checklist_id = %L and t.estado <> 'feita'
    and not exists (select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = t.id and dt.estado <> 'feita')
  order by t.vence_em, t.posicao limit 1 $$, testes.id('checklist_atrasado')))
  and not testes.varre('checklist_dependencias', format($$
  select 1 from public.checklist_tarefas t
  where t.checklist_id = %L and t.estado <> 'feita'
    and not exists (select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = t.id and dt.estado <> 'feita') $$, testes.id('checklist_atrasado'))),
  'atrasadas e próxima tarefa de cada linha: por índice, sem Seq Scan nas tarefas e dependências');
select ok(not testes.ordena(format($$
  select jsonb_build_object('titulo', t.titulo, 'vence_em', t.vence_em)
  from public.checklist_tarefas t
  where t.checklist_id = %L and t.estado <> 'feita'
    and not exists (select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = t.id and dt.estado <> 'feita')
  order by t.vence_em, t.posicao limit 1 $$, testes.id('checklist_atrasado'))),
  'a próxima tarefa sai na ordem do índice (vencimento e posição), sem ordenar: para na primeira livre');

-- Os números de prazo da Central (todas as consultorias): só as tarefas dos check-lists que vencem em até 7 dias, uma
-- busca no índice por check-list, nunca a tabela de tarefas inteira.
select ok(not testes.varre('checklist_tarefas', format($$
  with ativos as materialized (
    select cl.id as checklist_id, cl.proximo_vencimento
    from public.clientes c
    left join public.cliente_checklists cl
      on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
    where not c.arquivado and c.consultoria_id is not null)
  select coalesce(sum(x.atrasadas), 0), coalesce(sum(x.vencem), 0)
  from ativos a
  cross join lateral (
    select count(*) filter (where t.vence_em < %1$L) as atrasadas, count(*) filter (where t.vence_em >= %1$L) as vencem
    from public.checklist_tarefas t
    where t.checklist_id = a.checklist_id and t.estado <> 'feita' and t.vence_em <= %2$L) x
  where a.proximo_vencimento <= %2$L $$, testes.hoje(), testes.hoje() + 7)),
  'os números de prazo de todas as consultorias: pelo índice das não feitas, sem Seq Scan nas tarefas');

select ok(testes.varre('checklist_tarefas', $$ select t.id from public.checklist_tarefas t where t.nota = 'x' $$),
  'controle do teste: uma consulta sem índice é pega como Seq Scan');

select * from finish();
rollback;
