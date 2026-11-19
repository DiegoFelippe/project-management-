-- Volume do check-list do cliente: 50 consultorias, 5.000 clientes com check-list ativo de 40 tarefas (200.000
-- tarefas e 195.000 dependências) de um modelo da Central para todas, e um cliente que recebe, por aplicar_modelo, um
-- modelo de 500 tarefas em 50 etapas (989 dependências), com um check-in aberto; tarefas pausadas, 47.500 trechos de
-- tempo e 50.000 comentários nos check-lists de 40, e no grande 2 trechos e 3 comentários por tarefa (a leitura soma os
-- tempos e conta os comentários das 500). Tudo é criado aqui e desfeito no fim
-- (rollback: nada fica no banco). Tempos (média de 5 execuções; o limite é o dobro do valor do meio do performs_within):
-- o check-list de 500 tarefas inteiro numa leitura, marcar e desmarcar nele, aplicar o modelo de 500 tarefas, e a lista,
-- os números e o uso dos modelos com um modelo usado por 5.000 clientes. Além do tempo, o plano das consultas que essas
-- funções rodam não pode varrer checklist_tarefas nem checklist_dependencias (Seq Scan): é o que garante que o tempo não
-- cresce com o número de check-lists. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

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

-- Marca a tarefa como feita e volta para a fazer (duas chamadas, para repetir sem esgotar).
create function testes.marcar_e_desmarcar(p_tarefa uuid) returns void language plpgsql as $$
begin
  perform public.marcar_tarefa(p_tarefa, 'feita');
  perform public.marcar_tarefa(p_tarefa, 'a_fazer');
end $$;
grant execute on function testes.marcar_e_desmarcar(uuid) to authenticated;

-- true quando o plano da consulta tem Seq Scan na tabela.
create function testes.varre(p_tabela text, p_sql text) returns boolean language plpgsql as $$
declare v_plano jsonb;
begin
  execute 'explain (format json) ' || p_sql into v_plano;
  return jsonb_path_exists(v_plano, '$.** ? (@."Node Type" == "Seq Scan" && @."Relation Name" == $t)',
    jsonb_build_object('t', p_tabela));
end $$;

-- true quando o plano da consulta usa o índice.
create function testes.usa(p_indice text, p_sql text) returns boolean language plpgsql as $$
declare v_plano jsonb;
begin
  execute 'explain (format json) ' || p_sql into v_plano;
  return jsonb_path_exists(v_plano, '$.** ? (@."Index Name" == $i)', jsonb_build_object('i', p_indice));
end $$;

select set_config('request.jwt.claims', '', true);

-- ── Dados ────────────────────────────────────────────────────────────────────

create temp table v_consultorias (n int primary key, id uuid not null default gen_random_uuid());
insert into v_consultorias (n) select generate_series(1, 50);
insert into public.consultorias (id, nome) select id, 'Volume check-list ' || n from v_consultorias;

-- n = 0 é a central; 1 a 50 gestores (um por consultoria); 51 a 100 consultores (um por consultoria).
create temp table v_pessoas (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pessoas (n) select generate_series(0, 100);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'clvolume' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Pessoa volume ' || p.n, 'clvolume' || p.n || '@volume.test',
  case when p.n = 0 then 'central' when p.n <= 50 then 'gestor' else 'pessoa' end
from v_pessoas p
left join v_consultorias c on c.n = case when p.n = 0 then null when p.n <= 50 then p.n else p.n - 50 end;

-- 5.000 clientes (100 por consultoria, todos do consultor dela) e o cliente grande (consultoria 1, k = 0).
create temp table v_clientes (k int primary key, id uuid not null default gen_random_uuid(), consultoria int not null);
insert into v_clientes (k, consultoria) select k, case when k = 0 then 1 else (k - 1) % 50 + 1 end
from generate_series(0, 5000) k;
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
select v.id, 'Cliente volume ' || v.k, 10, c.id, p.id
from v_clientes v join v_consultorias c on c.n = v.consultoria join v_pessoas p on p.n = 50 + v.consultoria;

-- O modelo da Central para todas (4 etapas de 10 tarefas, cada uma depende da anterior) e o modelo grande da
-- consultoria 1 (50 etapas de 10 tarefas; cada tarefa depende da anterior e, a partir da 11ª, da que está 10 antes).
insert into testes.fx select 'modelo', gen_random_uuid();
insert into testes.fx select 'grande', gen_random_uuid();
insert into public.modelos (id, nome, da_central, consultoria_id, criado_por, etapas, tarefas, obrigatorias, maior_prazo)
select testes.id('modelo'), 'Modelo volume check-list', true, null, p.id, 4, 40, 27, 160 from v_pessoas p where p.n = 0
union all
select testes.id('grande'), 'Modelo grande check-list', false, c.id, p.id, 50, 500, 250, 365
from v_consultorias c join v_pessoas p on p.n = 1 where c.n = 1;
create temp table v_m_etapas (m text, e int, id uuid not null default gen_random_uuid(), primary key (m, e));
insert into v_m_etapas (m, e) select 'modelo', generate_series(1, 4) union all select 'grande', generate_series(1, 50);
insert into public.modelo_etapas (id, modelo_id, nome, posicao)
select id, testes.id(m), 'Etapa ' || e, e from v_m_etapas;
create temp table v_m_tarefas (m text, k int, id uuid not null default gen_random_uuid(), primary key (m, k));
insert into v_m_tarefas (m, k) select 'modelo', generate_series(1, 40) union all select 'grande', generate_series(1, 500);
insert into public.modelo_tarefas (id, modelo_id, etapa_id, titulo, obrigatoria, prazo_dias, posicao)
select t.id, testes.id(t.m), e.id, 'Tarefa ' || t.k, t.k % 3 <> 0, least(t.k * 4, 365), t.k
from v_m_tarefas t join v_m_etapas e on e.m = t.m and e.e = (t.k - 1) / 10 + 1;
insert into public.modelo_dependencias (tarefa_id, depende_de)
select t.id, a.id from v_m_tarefas t join v_m_tarefas a on a.m = t.m and a.k = t.k - 1
union all
select t.id, a.id from v_m_tarefas t join v_m_tarefas a on a.m = t.m and a.k = t.k - 10
where t.m = 'grande' and t.k > 10;

-- 5.000 check-lists do modelo da Central (um por cliente, k = 1..5000), como aplicar_modelo grava: as etapas, as 40
-- tarefas (as primeiras k % 20 feitas pelo consultor; nos k pares, a seguinte pausada) e as 39 dependências de cada um;
-- um trecho de tempo fechado em cada feita e um comentário a cada 4 tarefas.
create temp table v_checklists (k int primary key, id uuid not null default gen_random_uuid());
insert into v_checklists (k) select generate_series(1, 5000);
insert into public.cliente_checklists (id, cliente_id, consultoria_id, modelo_id, modelo_nome, inicio, aplicado_por)
select l.id, c.id, co.id, testes.id('modelo'), 'Modelo volume check-list', current_date - (l.k % 60), p.id
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
select t.id, l.id, e.id, 'Tarefa ' || t.t, t.t % 3 <> 0, t.t * 4, current_date - (t.k % 60) + t.t * 4, t.t,
  case when t.t <= t.k % 20 then 'feita' when t.t = t.k % 20 + 1 and t.k % 2 = 0 then 'pausada' else 'a_fazer' end,
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
    min(t.vence_em) filter (where t.estado in ('a_fazer', 'andamento', 'pausada')) as proximo
  from public.checklist_tarefas t join v_checklists l on l.id = t.checklist_id
  group by t.checklist_id) x
where cl.id = x.checklist_id;
insert into public.checklist_tarefa_tempos (tarefa_id, pessoa_id, inicio, fim)
select t.id, p.id, now() - interval '3 hours', now() - interval '2 hours'
from v_cl_tarefas t join v_clientes c on c.k = t.k join v_pessoas p on p.n = 50 + c.consultoria
where t.t <= t.k % 20;
insert into public.checklist_comentarios (tarefa_id, autor_id, texto)
select t.id, p.id, 'Comentário de volume ' || t.t
from v_cl_tarefas t join v_clientes c on c.k = t.k join v_pessoas p on p.n = 50 + c.consultoria
where t.t % 4 = 0;

insert into testes.fx select 'central', id from v_pessoas where n = 0;
insert into testes.fx select 'gestor1', id from v_pessoas where n = 1;
insert into testes.fx select 'consultor1', id from v_pessoas where n = 51;
insert into testes.fx select 'c1', id from v_consultorias where n = 1;
insert into testes.fx select 'cliente_grande', id from v_clientes where k = 0;
insert into testes.fx select 'cliente_40', id from v_clientes where k = 50;

-- Estatísticas de agora (dentro desta transação, desfeitas no fim).
analyze public.clientes;
analyze public.checkins;
analyze public.modelos;
analyze public.modelo_tarefas;
analyze public.modelo_dependencias;
analyze public.cliente_checklists;
analyze public.checklist_etapas;
analyze public.checklist_tarefas;
analyze public.checklist_dependencias;
analyze public.checklist_tarefa_tempos;
analyze public.checklist_comentarios;

-- ── Aplicar o modelo de 500 tarefas ──────────────────────────────────────────

select testes.como('gestor1');
select diag('gestor, aplicar o modelo de 500 tarefas: '
  || testes.media_ms(format('select public.aplicar_modelo(%L, %L, current_date - 30)', testes.id('cliente_grande'),
    testes.id('grande'))) || ' ms');
select performs_within(format('select public.aplicar_modelo(%L, %L, current_date - 30)', testes.id('cliente_grande'),
    testes.id('grande')), 50, 50, 5,
  'gestor: aplicar (copiar) o modelo de 500 tarefas numa chamada em até 100 ms na média');
reset role;
select set_config('request.jwt.claims', '', true);
insert into testes.fx select 'grande_ativo', id from public.cliente_checklists
where cliente_id = testes.id('cliente_grande') and encerrado_em is null;
select is((select (tarefas, (select count(*) from public.checklist_dependencias where checklist_id = cl.id))::text
    from public.cliente_checklists cl where id = testes.id('grande_ativo')),
  (500, 989::bigint)::text, 'o check-list grande tem as 500 tarefas e as 989 dependências');
insert into testes.fx select 'grande_t1', id from public.checklist_tarefas
where checklist_id = testes.id('grande_ativo') and posicao = 1;
insert into testes.fx select 'grande_t' || posicao, id from public.checklist_tarefas
where checklist_id = testes.id('grande_ativo') and posicao in (31, 450);
analyze public.cliente_checklists;
analyze public.checklist_tarefas;
analyze public.checklist_dependencias;

-- O consultor com o check-in aberto no cliente grande, marcando nele.
select testes.como('consultor1');
insert into public.checkins (cliente_id, inicio) values (testes.id('cliente_grande'), now() - interval '1 hour');
do $$
declare v_tarefa uuid;
begin
  for v_tarefa in select t.id from public.checklist_tarefas t
    where t.checklist_id = testes.id('grande_ativo') and t.posicao <= 30 order by t.posicao loop
    perform public.marcar_tarefa(v_tarefa, 'feita');
  end loop;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from public.checkin_tarefas k join public.checkins c on c.id = k.checkin_id
    where c.cliente_id = testes.id('cliente_grande') and c.fim is null), 30, 'as 30 tarefas marcadas entraram na sessão');

-- ── Ler e marcar ─────────────────────────────────────────────────────────────

select testes.como('consultor1');
select is(jsonb_array_length(public.checklist_do_cliente(testes.id('cliente_grande')) -> 'tarefas'), 500,
  'o check-list grande vem inteiro numa leitura');
select is(jsonb_array_length(public.checklist_do_cliente(testes.id('cliente_grande')) #> '{sessao,tarefas}'), 30,
  'com a sessão aberta');
-- 30 tarefas bloqueadas (101 a 130, cada uma espera a anterior e a de 10 antes) viram "não se aplica": a leitura e o
-- marcar passam pela cadeia (presas) em todos os tempos abaixo.
reset role;
select set_config('request.jwt.claims', '', true);
insert into testes.fx select 'grande_t130', id from public.checklist_tarefas
where checklist_id = testes.id('grande_ativo') and posicao = 130;
select testes.como('consultor1');
do $$
declare v_tarefa uuid;
begin
  for v_tarefa in select t.id from public.checklist_tarefas t
    where t.checklist_id = testes.id('grande_ativo') and t.posicao between 101 and 130 order by t.posicao loop
    perform public.marcar_tarefa(v_tarefa, 'nao_se_aplica', 'Volume: não se aplica');
  end loop;
end $$;
select is((public.checklist_do_cliente(testes.id('cliente_grande')) #>> '{resumo,nao_se_aplica}')::int, 30,
  'as 30 bloqueadas viraram "não se aplica" (a cadeia continua esperando a tarefa 31)');
-- Os tempos e os comentários do check-list grande: 2 trechos de 10 minutos e 3 comentários em cada tarefa, e a 31 em
-- andamento (o trecho aberto).
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.checklist_tarefa_tempos (tarefa_id, pessoa_id, inicio, fim)
select t.id, p.id, now() - make_interval(hours => n * 2), now() - make_interval(hours => n * 2) + interval '10 minutes'
from public.checklist_tarefas t, generate_series(1, 2) n, (select id from v_pessoas where n = 51) p
where t.checklist_id = testes.id('grande_ativo');
insert into public.checklist_comentarios (tarefa_id, autor_id, texto)
select t.id, p.id, 'Comentário ' || n
from public.checklist_tarefas t, generate_series(1, 3) n, (select id from v_pessoas where n = 51) p
where t.checklist_id = testes.id('grande_ativo');
analyze public.checklist_tarefa_tempos;
analyze public.checklist_comentarios;
select testes.como('consultor1');
select is(public.marcar_tarefa(testes.id('grande_t31'), 'andamento') ->> 'tempo_segundos', '1200',
  'a tarefa 31 em andamento (dois trechos de 10 minutos e um aberto agora)');
select is((select jsonb_build_object('tempo', t -> 'tempo_segundos', 'comentarios', t -> 'comentarios',
      'aberto', t -> 'trecho_aberto_desde' is not null)
    from jsonb_array_elements(public.checklist_do_cliente(testes.id('cliente_grande')) -> 'tarefas') t
    where (t ->> 'id')::uuid = testes.id('grande_t31')),
  '{"tempo": 1200, "comentarios": 3, "aberto": true}'::jsonb, 'a leitura de 500 traz o tempo e os comentários de cada tarefa');
select diag('consultor, check-list de 500: '
  || testes.media_ms(format('select public.checklist_do_cliente(%L)', testes.id('cliente_grande'))) || ' ms; de 40: '
  || testes.media_ms(format('select public.checklist_do_cliente(%L)', testes.id('cliente_40'))) || ' ms; marcar e desmarcar: '
  || testes.media_ms(format('select testes.marcar_e_desmarcar(%L)', testes.id('grande_t31'))) || ' ms');
select performs_within(format('select public.checklist_do_cliente(%L)', testes.id('cliente_grande')), 25, 25, 5,
  'consultor: o check-list de 500 tarefas numa leitura em até 50 ms na média');
select performs_within(format('select public.checklist_do_cliente(%L)', testes.id('cliente_40')), 10, 10, 5,
  'consultor: o check-list de 40 tarefas em até 20 ms na média');
select performs_within(format('select testes.marcar_e_desmarcar(%L)', testes.id('grande_t31')), 15, 15, 5,
  'consultor: marcar e desmarcar no check-list de 500 tarefas (duas chamadas) em até 30 ms na média');
reset role;

select testes.como('gestor1');
select performs_within(format('select public.checklist_do_cliente(%L)', testes.id('cliente_grande')), 25, 25, 5,
  'gestor: o check-list de 500 tarefas em até 50 ms na média');
reset role;

-- ── Modelos com 5.000 clientes usando ────────────────────────────────────────

select testes.como('central');
select is((public.uso_do_modelo(testes.id('modelo')) ->> 'clientes')::int, 5000, 'o modelo da Central: 5.000 clientes');
select is(jsonb_array_length(public.uso_do_modelo(testes.id('modelo')) -> 'nomes'), 5, 'até 5 nomes');
select diag('central, lista: ' || testes.media_ms($$select public.modelos_da_lista('ativos', 'volume check-list')$$)
  || ' ms; números: ' || testes.media_ms('select public.indicadores_de_modelos()') || ' ms; uso: '
  || testes.media_ms(format('select public.uso_do_modelo(%L)', testes.id('modelo'))) || ' ms');
select performs_within($$select public.modelos_da_lista('ativos', 'volume check-list')$$, 15, 15, 5,
  'central: a lista de modelos com "clientes usando" (5.000) em até 30 ms na média');
select performs_within('select public.indicadores_de_modelos()', 15, 15, 5,
  'central: os números em até 30 ms na média');
select performs_within(format('select public.uso_do_modelo(%L)', testes.id('modelo')), 15, 15, 5,
  'central: o uso do modelo (contagem e 5 nomes) em até 30 ms na média');
reset role;

select testes.como('gestor1');
select is(public.uso_do_modelo(testes.id('modelo')) -> 'nomes',
  (select jsonb_agg(nome order by nome, id) from (select c.nome, c.id from public.clientes c
    join public.cliente_checklists cl on cl.cliente_id = c.id and cl.encerrado_em is null and cl.modelo_id = testes.id('modelo')
    where c.consultoria_id = testes.id('c1') order by c.nome, c.id limit 5) x),
  'a gestão: os 5 primeiros nomes da consultoria dela');
select is((public.uso_do_modelo(testes.id('modelo')) ->> 'clientes')::int, 100,
  'e conta só os 100 clientes da consultoria dela (a Central conta os 5.000)');
select diag('gestor, lista: ' || testes.media_ms($$select public.modelos_da_lista('ativos', 'volume check-list')$$)
  || ' ms; números: ' || testes.media_ms('select public.indicadores_de_modelos()') || ' ms; uso: '
  || testes.media_ms(format('select public.uso_do_modelo(%L)', testes.id('modelo'))) || ' ms');
select performs_within($$select public.modelos_da_lista('ativos', 'volume check-list')$$, 15, 15, 5,
  'gestor: a lista de modelos em até 30 ms na média');
reset role;

-- ── Planos ───────────────────────────────────────────────────────────────────
-- As consultas que as funções rodam, com os valores que o plano por chamada põe no lugar. Tarefas e dependências
-- (centenas de milhares de linhas): o plano de verdade não pode varrer a tabela.

select set_config('request.jwt.claims', '', true);
select ok(not testes.varre('checklist_tarefas', format($$
  select t.id, t.estado from public.checklist_tarefas t where t.checklist_id = %L order by t.posicao $$,
    testes.id('grande_ativo')))
  and not testes.varre('checklist_tarefas', format($$
  with recursive tarefas as materialized (
    select t.id, t.posicao, t.estado, t.estado in ('a_fazer', 'andamento', 'pausada') as pendente
    from public.checklist_tarefas t where t.checklist_id = %1$L
  ), presas(id) as (
    select d.tarefa_id from tarefas n
    join public.checklist_dependencias d on d.tarefa_id = n.id
    join tarefas p on p.id = d.depende_de
    where n.estado = 'nao_se_aplica' and p.pendente
    union
    select d.tarefa_id from presas pr
    join public.checklist_dependencias d on d.depende_de = pr.id
    join tarefas n on n.id = d.tarefa_id
    where n.estado = 'nao_se_aplica'
  )
  select d.tarefa_id, jsonb_agg(d.depende_de order by dt.posicao),
    bool_and(dt.estado = 'feita' or (dt.estado = 'nao_se_aplica' and pr.id is null))
  from tarefas t
  join public.checklist_dependencias d on d.tarefa_id = t.id
  join public.checklist_tarefas dt on dt.id = d.depende_de
  left join presas pr on pr.id = d.depende_de
  group by d.tarefa_id $$, testes.id('grande_ativo')))
  and not testes.varre('checklist_dependencias', format($$
  select d.tarefa_id from public.checklist_tarefas t join public.checklist_dependencias d on d.tarefa_id = t.id
  where t.checklist_id = %L $$, testes.id('grande_ativo'))),
  'o check-list inteiro (tarefas e "depende de") sai por índice, sem Seq Scan');
select ok(not testes.varre('checklist_tarefas', format($$
  with recursive acima(id, estado) as (
    select t.id, t.estado from public.checklist_dependencias d join public.checklist_tarefas t on t.id = d.tarefa_id
    where d.depende_de = %L
    union
    select t.id, t.estado from acima a
    join public.checklist_dependencias d on d.depende_de = a.id
    join public.checklist_tarefas t on t.id = d.tarefa_id
    where a.estado = 'nao_se_aplica'
  )
  select t.id, t.titulo
  from (select distinct a.id from acima a where a.estado in ('a_fazer', 'andamento', 'pausada')) x
  join public.checklist_tarefas t on t.id = x.id
  where not exists (select 1 from public.checklist_dependencias d2 join public.checklist_tarefas t2 on t2.id = d2.depende_de
    where d2.tarefa_id = t.id
      and (t2.estado in ('a_fazer', 'andamento', 'pausada')
        or (t2.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(t2.id)))) $$, testes.id('grande_t1')))
  and not testes.varre('checklist_dependencias', format($$
  select 1 from public.checklist_dependencias d join public.checklist_tarefas t on t.id = d.depende_de
  where d.tarefa_id = %L
    and (t.estado in ('a_fazer', 'andamento', 'pausada') or (t.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(t.id))) $$,
    testes.id('grande_t450')))
  and not testes.varre('checklist_tarefas', format($$
  with recursive cadeia(id, estado) as (
    select dt.id, dt.estado from public.checklist_dependencias d join public.checklist_tarefas dt on dt.id = d.depende_de
    where d.tarefa_id = %L
    union
    select dt.id, dt.estado from cadeia c
    join public.checklist_dependencias d on d.tarefa_id = c.id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    where c.estado = 'nao_se_aplica'
  )
  select exists (select 1 from cadeia c where c.estado in ('a_fazer', 'andamento', 'pausada')) $$, testes.id('grande_t130')))
  and not testes.varre('checklist_tarefas', format($$
  select count(*), count(*) filter (where t.estado = 'feita'), count(*) filter (where t.estado = 'nao_se_aplica'),
    min(t.vence_em) filter (where t.estado in ('a_fazer', 'andamento', 'pausada'))
  from public.checklist_tarefas t where t.checklist_id = %L $$, testes.id('grande_ativo'))),
  'marcar (dependências, liberadas e recontar) vai por índice, sem Seq Scan');

select ok(not testes.varre('cliente_checklists', format($$
  select cl.id from public.cliente_checklists cl where cl.cliente_id = %L and cl.encerrado_em is null $$,
    testes.id('cliente_grande'))),
  'o check-list ativo do cliente sai por índice, sem Seq Scan');

-- "Clientes usando": a contagem por consultoria passa por 100 dos 5.000 check-lists e a por modelo por todos (é o que
-- ela conta), e aí varrer ou ir pelo índice custam quase o mesmo (o plano escolhe por um fio); o que garante a escala
-- é a consulta poder ir pelo índice certo, conferido com a varredura desligada (o tempo de verdade está nos testes de
-- tempo acima).
set local enable_seqscan = off;
select ok(testes.usa('cliente_checklists_modelo_idx', format($$
  select count(*) from public.cliente_checklists cl
  where cl.modelo_id = %L and cl.encerrado_em is null and cl.consultoria_id = %L $$, testes.id('modelo'), testes.id('c1'))),
  '"clientes usando" um modelo, numa consultoria, vai pelo índice do modelo');
select ok(testes.usa('cliente_checklists_consultoria_idx', format($$
  select count(*) from public.cliente_checklists cl where cl.encerrado_em is null and cl.consultoria_id = %L $$,
    testes.id('c1'))),
  '"clientes usando" de uma consultoria vai pelo índice da consultoria');
reset enable_seqscan;

-- Os tempos e os comentários das tarefas (leitura do check-list): no de 40 (o comum), o plano de verdade vai pelo índice
-- da tarefa; no de 500, com dezenas de milhares de linhas, ler a tabela ou buscar 500 vezes no índice custam quase o
-- mesmo e o plano escolhe por um fio (aqui, a tabela); com mais linhas o índice ganha. Conferido com a varredura
-- desligada (o tempo de verdade está nos testes de tempo acima).
create function testes.tempos_e_comentarios(p_checklist uuid) returns boolean language sql as $f$
  select not testes.varre('checklist_tarefa_tempos', format($$
    with tarefas as materialized (select t.id from public.checklist_tarefas t where t.checklist_id = %L)
    select tt.tarefa_id, sum(extract(epoch from coalesce(tt.fim, now()) - tt.inicio)),
      max(tt.inicio) filter (where tt.fim is null)
    from tarefas t join public.checklist_tarefa_tempos tt on tt.tarefa_id = t.id group by tt.tarefa_id $$, p_checklist))
  and not testes.varre('checklist_comentarios', format($$
    with tarefas as materialized (select t.id from public.checklist_tarefas t where t.checklist_id = %L)
    select m.tarefa_id, count(*) from tarefas t join public.checklist_comentarios m on m.tarefa_id = t.id
    group by m.tarefa_id $$, p_checklist))
$f$;
select ok(testes.tempos_e_comentarios((select id from public.cliente_checklists
    where cliente_id = testes.id('cliente_40') and encerrado_em is null)),
  'os tempos e os comentários do check-list de 40 saem por índice, sem Seq Scan');
set local enable_seqscan = off;
select ok(testes.tempos_e_comentarios(testes.id('grande_ativo')),
  'os do check-list de 500 podem ir pelo índice');
reset enable_seqscan;

select ok(testes.varre('checklist_tarefas', $$ select t.id from public.checklist_tarefas t where t.nota = 'x' $$),
  'controle do teste: uma consulta sem índice é pega como Seq Scan');

select * from finish();
rollback;
