-- Volume dos modelos de check-in: 50 consultorias, 2.000 modelos (300 da Central para todas, 200 da Central para uma
-- consultoria e 1.500 das consultorias; um em cada 10 arquivado), cada um com 2 etapas e 10 tarefas (20.000 tarefas,
-- 18.000 dependências), e um modelo de 500 tarefas em 50 etapas (989 dependências), criados aqui e desfeitos no fim
-- (rollback: nada fica no banco). A lista (com e sem busca e tipo) e os números em até 20 ms, o modelo de 500 tarefas
-- inteiro em até 40 ms e salvá-lo (regravar) numa chamada em até 100 ms, para a gestão e a Central (média de 5
-- execuções, com 50% de folga; medido: lista ~3 a 5 ms, números ~0,5 ms, modelo grande ~6 ms, salvar ~30 ms). Além do
-- tempo, o plano das consultas que essas funções rodam não pode varrer as tabelas inteiras (Seq Scan): é o que garante
-- que o tempo não cresce com o número de modelos.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create schema testes;
grant usage on schema testes to authenticated;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated;
-- O modelo de 500 tarefas como o editor manda (p_dados), para medir salvar_modelo.
create table testes.grande (dados jsonb not null);
grant select on testes.grande to authenticated;

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
grant execute on function testes.varre(text, text) to authenticated;

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
insert into public.consultorias (id, nome) select id, 'Volume modelos ' || n from v_consultorias;

-- n = 0 é a central; 1 a 50 gestores (um por consultoria); 51 a 100 consultores (um por consultoria).
create temp table v_pessoas (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pessoas (n) select generate_series(0, 100);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'mvolume' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Pessoa volume ' || p.n, 'mvolume' || p.n || '@volume.test',
  case when p.n = 0 then 'central' when p.n <= 50 then 'gestor' else 'pessoa' end
from v_pessoas p
left join v_consultorias c on c.n = case when p.n = 0 then null when p.n <= 50 then p.n else p.n - 50 end;

-- 2.000 modelos: 1 a 300 da Central para todas; 301 a 500 da Central para a consultoria (m - 301) % 50 + 1; 501 a
-- 2.000 da consultoria (m - 501) % 50 + 1, feitos pelo gestor dela. Um em cada 10 arquivado; um em cada 7 se chama
-- "Análise volume m"; o tipo gira entre os quatro e nenhum.
create temp table v_modelos (m int primary key, id uuid not null default gen_random_uuid(), consultoria int);
insert into v_modelos (m, consultoria)
select m, case when m <= 300 then null when m <= 500 then (m - 301) % 50 + 1 else (m - 501) % 50 + 1 end
from generate_series(1, 2000) m;
insert into public.modelos (id, nome, descricao, tipo, da_central, consultoria_id, criado_por, arquivado_em,
  etapas, tarefas, obrigatorias, maior_prazo)
select v.id,
  case when v.m % 7 = 0 then 'Análise volume ' else 'Modelo volume ' end || v.m,
  'Descrição do modelo ' || v.m,
  (array['gestao', 'sucesso_do_cliente', 'assessoria_juridica', 'gestao_de_pessoas', null])[v.m % 5 + 1],
  v.m <= 500, c.id, coalesce(p.id, (select id from v_pessoas where n = 0)),
  case when v.m % 10 = 0 then now() end,
  2, 10, 7, 45
from v_modelos v
left join v_consultorias c on c.n = v.consultoria
left join v_pessoas p on v.m > 500 and p.n = v.consultoria;

-- 2 etapas e 10 tarefas por modelo (5 em cada etapa); cada tarefa depende da anterior.
create temp table v_etapas (m int, e int, id uuid not null default gen_random_uuid(), primary key (m, e));
insert into v_etapas (m, e) select m, e from v_modelos, generate_series(1, 2) e;
insert into public.modelo_etapas (id, modelo_id, nome, posicao)
select e.id, v.id, 'Etapa ' || e.e, e.e from v_etapas e join v_modelos v on v.m = e.m;
create temp table v_tarefas (m int, k int, id uuid not null default gen_random_uuid(), primary key (m, k));
insert into v_tarefas (m, k) select m, k from v_modelos, generate_series(1, 10) k;
insert into public.modelo_tarefas (id, modelo_id, etapa_id, titulo, obrigatoria, prazo_dias, posicao)
select t.id, v.id, e.id, 'Tarefa ' || t.k, t.k % 3 <> 0, t.k * 4, t.k
from v_tarefas t join v_modelos v on v.m = t.m join v_etapas e on e.m = t.m and e.e = (t.k - 1) / 5 + 1;
insert into public.modelo_dependencias (tarefa_id, depende_de)
select t.id, a.id from v_tarefas t join v_tarefas a on a.m = t.m and a.k = t.k - 1;

-- O modelo grande, da consultoria 1: 50 etapas com 10 tarefas; cada tarefa depende da anterior e (a partir da 11ª) da
-- que está 10 posições antes.
insert into testes.fx select 'grande', gen_random_uuid();
insert into public.modelos (id, nome, da_central, consultoria_id, criado_por, etapas, tarefas, obrigatorias, maior_prazo)
select testes.id('grande'), 'Modelo grande volume', false, c.id, p.id, 50, 500, 250, 365
from v_consultorias c join v_pessoas p on p.n = 1 where c.n = 1;
create temp table v_grande_etapas (e int primary key, id uuid not null default gen_random_uuid());
insert into v_grande_etapas (e) select generate_series(1, 50);
insert into public.modelo_etapas (id, modelo_id, nome, posicao)
select id, testes.id('grande'), 'Etapa grande ' || e, e from v_grande_etapas;
create temp table v_grande (k int primary key, id uuid not null default gen_random_uuid());
insert into v_grande (k) select generate_series(1, 500);
insert into public.modelo_tarefas (id, modelo_id, etapa_id, titulo, obrigatoria, prazo_dias, posicao)
select g.id, testes.id('grande'), e.id, 'Tarefa grande ' || g.k, g.k % 2 = 0, least(g.k, 365), g.k
from v_grande g join v_grande_etapas e on e.e = (g.k - 1) / 10 + 1;
insert into public.modelo_dependencias (tarefa_id, depende_de)
select g.id, a.id from v_grande g join v_grande a on a.k = g.k - 1
union all
select g.id, a.id from v_grande g join v_grande a on a.k = g.k - 10 and g.k > 10;

-- O mesmo modelo grande como o editor manda para salvar_modelo.
insert into testes.grande
select jsonb_build_object('nome', 'Modelo grande volume', 'descricao', 'Regravado', 'tipo', 'gestao', 'para', 'todas',
  'etapas', (select jsonb_agg(jsonb_build_object('nome', 'Etapa grande ' || e, 'tarefas', (
    select jsonb_agg(jsonb_build_object('chave', 'k' || k, 'titulo', 'Tarefa grande ' || k, 'descricao', 'Tarefa número ' || k,
      'obrigatoria', k % 2 = 0, 'prazo_dias', least(k, 365),
      'depende_de', case when k = 1 then '[]'::jsonb when k <= 10 then jsonb_build_array('k' || (k - 1))
        else jsonb_build_array('k' || (k - 1), 'k' || (k - 10)) end) order by k)
    from generate_series((e - 1) * 10 + 1, e * 10) k)) order by e) from generate_series(1, 50) e));

-- Estatísticas de agora (dentro desta transação, desfeitas no fim).
analyze public.perfis;
analyze public.consultorias;
analyze public.modelos;
analyze public.modelo_etapas;
analyze public.modelo_tarefas;
analyze public.modelo_dependencias;

insert into testes.fx select 'central', id from v_pessoas where n = 0;
insert into testes.fx select 'gestor1', id from v_pessoas where n = 1;
insert into testes.fx select 'consultor1', id from v_pessoas where n = 51;
insert into testes.fx select 'c1', id from v_consultorias where n = 1;
-- Quantos ativos a consultoria 1 vê: os da Central para todas e para ela, os dela e o grande.
create table testes.esperado (nome text primary key, n int not null);
grant select on testes.esperado to authenticated;
insert into testes.esperado
select 'ativos_c1', count(*) + 1 from v_modelos v join public.modelos m on m.id = v.id
where m.arquivado_em is null and (v.consultoria is null or v.consultoria = 1);

-- ── Respostas e tempo ────────────────────────────────────────────────────────

select testes.como('gestor1');
select is((public.modelos_da_lista() ->> 'total')::int, (select n from testes.esperado where nome = 'ativos_c1'),
  'o gestor vê os ativos da consultoria dele e os da Central para todas e para ela (e o grande)');
select is(jsonb_array_length(public.modelos_da_lista() -> 'itens'), 15, 'numa página de 15');
select is(jsonb_array_length(public.modelo_completo(testes.id('grande')) #> '{etapas}'), 50,
  'o modelo grande vem inteiro (50 etapas)');
select is(jsonb_array_length(jsonb_path_query_array(public.modelo_completo(testes.id('grande')),
  '$.etapas[*].tarefas[*]')), 500, 'com as 500 tarefas');
select diag('gestor, lista: ' || testes.media_ms('select public.modelos_da_lista()') || ' ms; busca: '
  || testes.media_ms($$select public.modelos_da_lista('ativos', 'analise')$$) || ' ms; tipo: '
  || testes.media_ms($$select public.modelos_da_lista('ativos', null, 'gestao')$$) || ' ms; arquivados: '
  || testes.media_ms($$select public.modelos_da_lista('arquivados')$$) || ' ms; números: '
  || testes.media_ms('select public.indicadores_de_modelos()') || ' ms; modelo grande: '
  || testes.media_ms(format('select public.modelo_completo(%L)', testes.id('grande'))) || ' ms');
select performs_within('select public.modelos_da_lista()', 15, 15, 5,
  'gestor: a lista (primeira página) em até 20 ms na média (+50%)');
select performs_within($$select public.modelos_da_lista('ativos', 'analise', 'gestao')$$, 15, 15, 5,
  'gestor: a lista com busca e tipo em até 20 ms na média (+50%)');
select performs_within('select public.indicadores_de_modelos()', 15, 15, 5,
  'gestor: os números em até 20 ms na média (+50%)');
select performs_within(format('select public.modelo_completo(%L)', testes.id('grande')), 30, 30, 5,
  'gestor: o modelo de 500 tarefas inteiro numa leitura em até 40 ms na média (+50%)');
select diag('gestor, salvar o modelo de 500 tarefas: '
  || testes.media_ms(format('select public.salvar_modelo(%L, (select dados from testes.grande))', testes.id('grande')))
  || ' ms');
select performs_within(format('select public.salvar_modelo(%L, (select dados from testes.grande))', testes.id('grande')),
  75, 75, 5, 'gestor: salvar (regravar) o modelo de 500 tarefas numa chamada em até 100 ms na média (+50%)');
reset role;

select testes.como('central');
select diag('central, lista: ' || testes.media_ms('select public.modelos_da_lista()') || ' ms; por consultoria: '
  || testes.media_ms(format('select public.modelos_da_lista(%L, null, null, %L)', 'ativos', testes.id('c1')))
  || ' ms; busca: ' || testes.media_ms($$select public.modelos_da_lista('ativos', 'analise volume 7')$$)
  || ' ms; números: ' || testes.media_ms('select public.indicadores_de_modelos()') || ' ms');
select performs_within('select public.modelos_da_lista()', 15, 15, 5,
  'central (2.000 modelos): a lista em até 20 ms na média (+50%)');
select performs_within('select public.indicadores_de_modelos()', 15, 15, 5,
  'central: os números em até 20 ms na média (+50%)');
reset role;

-- ── Planos ───────────────────────────────────────────────────────────────────
-- As consultas que as funções rodam, com os valores que o plano por chamada (force_custom_plan) põe no lugar.
--
-- Etapas, tarefas e dependências (dezenas de milhares de linhas): o plano de verdade não pode varrer a tabela.

select set_config('request.jwt.claims', '', true);
select ok(not testes.varre('modelo_etapas', format($$
  select e.id from public.modelo_etapas e where e.modelo_id = %L order by e.posicao $$, testes.id('grande')))
  and not testes.varre('modelo_tarefas', format($$
  select t.id from public.modelo_tarefas t where t.modelo_id = %L order by t.posicao $$, testes.id('grande')))
  and not testes.varre('modelo_dependencias', format($$
  select t.id, (select jsonb_agg(d.depende_de order by dt.posicao) from public.modelo_dependencias d
    join public.modelo_tarefas dt on dt.id = d.depende_de where d.tarefa_id = t.id)
  from public.modelo_tarefas t where t.modelo_id = %L $$, testes.id('grande'))),
  'o modelo inteiro sai por índice (sem Seq Scan em etapas, tarefas e dependências)');

-- Modelos: 2.000 linhas cabem em 50 a 160 páginas (varia com o espaço que execuções anteriores deixaram), e aí varrer
-- e ir pelo índice custam quase o mesmo: o plano escolhe por um fio e muda de uma execução para outra. O que garante a
-- escala é a consulta poder ir pelo índice certo; isso é conferido com a varredura desligada (o planejador ainda varre
-- se nenhum índice servir). O tempo de verdade está nos testes de tempo acima.
-- O índice trigram (GIN) guarda o que entra numa lista pendente até o autovacuum passar; dentro desta transação não há
-- vacuum (e salvar o modelo grande acima pôs mais na lista), e com a lista cheia o índice parece caro. Aqui ela vai para
-- o índice, como no banco de verdade.
select gin_clean_pending_list('public.modelos_busca_idx'::regclass) >= 0 as lista_pendente_limpa;
set local enable_seqscan = off;
select ok(not testes.varre('modelos', format($$
  select m.id from public.modelos m
  where m.arquivado_em is null and (m.consultoria_id = %L or m.consultoria_id is null) $$, testes.id('c1')))
  and testes.usa('modelos_consultoria_idx', format($$
  select m.id from public.modelos m
  where m.arquivado_em is null and (m.consultoria_id = %L or m.consultoria_id is null) $$, testes.id('c1'))),
  'a lista e os números da gestão (e da Central filtrada) vão pelo índice da consultoria');
select ok(not testes.varre('modelos', format($$
  select m.id from public.modelos m
  where m.arquivado_em is not null and (m.consultoria_id = %L or m.consultoria_id is null) $$, testes.id('c1'))),
  'a aba Arquivados também vai por índice');
select ok(testes.usa('modelos_busca_idx', $$
  select m.id from public.modelos m where m.arquivado_em is null and m.busca like '%analise volume 7%' $$),
  'a busca vai pelo índice trigram');
select ok(testes.usa('modelos_tipo_idx', $$
  select m.id from public.modelos m where m.arquivado_em is null and m.tipo = 'gestao' $$),
  'o filtro de tipo da Central vai pelo índice do tipo');
-- A lista da Central sem filtro passa por todos os modelos (é o que ela pede: todos, contados); fica no tempo acima.
reset enable_seqscan;

select ok(testes.varre('modelos', $$ select m.id from public.modelos m where m.descricao = 'x' $$),
  'controle do teste: uma consulta sem índice é pega como Seq Scan');

select * from finish();
rollback;
