-- Volume do quadro: 50 consultorias, 550 pessoas, 1.000 clientes com quadro e 50.000 cartões (2.000 num quadro só),
-- com 33.000 responsáveis, 37.500 itens de checklist e 20.000 comentários, criados aqui e desfeitos no fim (rollback:
-- nada fica no banco). Abrir o quadro grande (o quadro, a primeira página das 3 colunas e os 4 números) e buscar nele
-- precisam responder em até 50 ms para o consultor, a gestão e a central, e ler um cartão sozinho (o que a janela do
-- cartão faz) em até 15 ms (média de 5 execuções, com 50% de folga; medido: ~8 a 11 ms e ~3 ms). Além do tempo, o plano das consultas que essas funções rodam não pode varrer
-- a tabela de cartões inteira (Seq Scan): é o que garante que o tempo não cresce com o número de quadros.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

-- Abre o quadro grande como a tela abre: o quadro, a primeira página de cada coluna e os 4 números (com a busca, se
-- vier). Devolve quantos cartões vieram nas páginas.
create function testes.abrir(p_busca text default null) returns int language plpgsql as $$
declare
  v_quadro jsonb := public.quadro_do_cliente(testes.id('cliente1'));
  v_coluna jsonb;
  v_n int := 0;
begin
  for v_coluna in select * from jsonb_array_elements(v_quadro -> 'colunas') loop
    v_n := v_n + jsonb_array_length(public.cartoes_do_quadro((v_quadro ->> 'id')::uuid, (v_coluna ->> 'id')::uuid, 1,
      p_busca) -> 'itens');
  end loop;
  perform public.indicadores_do_quadro((v_quadro ->> 'id')::uuid, p_busca);
  return v_n;
end $$;
grant execute on function testes.abrir(text) to authenticated;

-- A janela do cartão: o cartão, os 30 comentários mais recentes e o checklist e os comentários lidos pela API.
create function testes.cartao() returns int language plpgsql as $$
begin
  perform public.cartao_do_quadro(testes.id('cartao1'));
  perform public.comentarios_do_cartao(testes.id('cartao1'));
  perform count(*) from public.cartao_checklist where cartao_id = testes.id('cartao1');
  perform count(*) from public.cartao_comentarios where cartao_id = testes.id('cartao1');
  return 1;
end $$;
grant execute on function testes.cartao() to authenticated;

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

select set_config('request.jwt.claims', '', true);

-- ── Dados ────────────────────────────────────────────────────────────────────

create temp table v_consultorias (n int primary key, id uuid not null default gen_random_uuid());
insert into v_consultorias (n) select generate_series(1, 50);
insert into public.consultorias (id, nome) select id, 'Volume quadro ' || n from v_consultorias;

-- n = 0 é a central; 1 a 50 administradores (um por consultoria); 51 a 550 consultores (10 por consultoria). A
-- pessoa n (n >= 51) é da consultoria (n - 51) % 50 + 1.
create temp table v_pessoas (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pessoas (n) select generate_series(0, 550);
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'qvolume' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Pessoa volume ' || p.n, 'qvolume' || p.n || '@volume.test',
  case when p.n = 0 then 'central' when p.n <= 50 then 'admin' else 'pessoa' end
from v_pessoas p
left join v_consultorias c on c.n = case when p.n = 0 then null when p.n <= 50 then p.n else (p.n - 51) % 50 + 1 end;

-- 1.000 clientes: o cliente m é da consultoria (m - 1) % 50 + 1, com o consultor 51 + (m - 1) % 500 (da mesma).
create temp table v_clientes (m int primary key, id uuid not null default gen_random_uuid(), quadro uuid not null default gen_random_uuid());
insert into v_clientes (m) select generate_series(1, 1000);
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
select k.id, 'Cliente volume ' || k.m, 10, c.id, p.id
from v_clientes k
join v_consultorias c on c.n = (k.m - 1) % 50 + 1
join v_pessoas p on p.n = 51 + (k.m - 1) % 500;

-- Um quadro por cliente, com as três colunas de sempre.
insert into public.quadros (id, cliente_id, consultoria_id)
select k.quadro, k.id, c.id from v_clientes k join v_consultorias c on c.n = (k.m - 1) % 50 + 1;
create temp table v_colunas (m int, i int, id uuid not null default gen_random_uuid(), primary key (m, i));
insert into v_colunas (m, i) select m, i from v_clientes, generate_series(0, 2) i;
insert into public.quadro_colunas (id, quadro_id, nome, concluidos, posicao)
select v.id, k.quadro, (array['A fazer', 'Em andamento', 'Concluído'])[v.i + 1], v.i = 2, (v.i + 1) * 1024
from v_colunas v join v_clientes k on k.m = v.m;

-- 50.000 cartões: os 2.000 primeiros no quadro do cliente 1, o resto espalhado pelos outros 999. Um em cada 20
-- arquivado, um em cada 10 com descrição, dois terços com prazo (de 30 dias atrás a 30 dias à frente).
create temp table v_cartoes (k int primary key, id uuid not null default gen_random_uuid(), m int not null);
insert into v_cartoes (k, m)
select k, case when k <= 2000 then 1 else 2 + (k - 2001) % 999 end from generate_series(1, 50000) k;
insert into public.cartoes (id, coluna_id, titulo, descricao, prioridade, prazo, posicao, arquivado_em, criado_por)
select v.id, col.id, 'Cartão volume ' || v.k,
  case when v.k % 10 = 0 then jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object(
    'type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text',
      'text', 'Descrição número ' || v.k || ' com integração'))))) end,
  (array['baixa', 'media', 'alta', null])[v.k % 4 + 1],
  case when v.k % 3 <> 0 then current_date + ((v.k * 37) % 61 - 30) end,
  v.k * 1024,
  case when v.k % 20 = 0 then now() - (v.k % 100) * interval '1 hour' end,
  p.id
from v_cartoes v
join v_colunas col on col.m = v.m and col.i = v.k % 3
join v_pessoas p on p.n = 51 + (v.m - 1) % 500;

-- Responsável (o consultor do cliente) em dois terços; 3 itens de checklist em um quarto; 2 comentários em um quinto.
insert into public.cartao_responsaveis (cartao_id, perfil_id)
select v.id, p.id from v_cartoes v join v_pessoas p on p.n = 51 + (v.m - 1) % 500 where v.k % 3 <> 0;
insert into public.cartao_checklist (cartao_id, texto, feito)
select v.id, 'Item ' || i, i = 1 from v_cartoes v, generate_series(1, 3) i where v.k % 4 = 0;
insert into public.cartao_comentarios (cartao_id, autor_id, texto)
select v.id, p.id, 'Comentário ' || i from v_cartoes v join v_pessoas p on p.n = 51 + (v.m - 1) % 500,
  generate_series(1, 2) i
where v.k % 5 = 0;

-- Estatísticas de agora (dentro desta transação, desfeitas no fim) também para clientes e pessoas: sem elas o plano
-- varia com o que sobrou de execuções anteriores.
analyze public.clientes;
analyze public.perfis;
analyze public.quadros;
analyze public.quadro_colunas;
analyze public.cartoes;
analyze public.cartao_responsaveis;
analyze public.cartao_checklist;
analyze public.cartao_comentarios;

insert into testes.fx select 'central', id from v_pessoas where n = 0;
insert into testes.fx select 'adm1', id from v_pessoas where n = 1;
insert into testes.fx select 'consultor1', id from v_pessoas where n = 51;
insert into testes.fx select 'cliente1', id from v_clientes where m = 1;
insert into testes.fx select 'quadro1', quadro from v_clientes where m = 1;
insert into testes.fx select 'coluna1', id from v_colunas where m = 1 and i = 0;
insert into testes.fx select 'c1', id from v_consultorias where n = 1;
insert into testes.fx select 'cartao1', id from v_cartoes where k = 20;

-- ── Tempo ────────────────────────────────────────────────────────────────────

select testes.como('consultor1');
select is(testes.abrir(), 150, 'o consultor abre o quadro de 2.000 cartões: 50 por coluna');
select diag('consultor, abrir: ' || testes.media_ms('select testes.abrir()') || ' ms; buscar: '
  || testes.media_ms('select testes.abrir(''integração'')') || ' ms; cartão: '
  || testes.media_ms('select testes.cartao()') || ' ms');
select performs_within('select testes.abrir()', 37.5, 37.5, 5,
  'consultor: abrir o quadro (3 colunas e os números) em até 50 ms na média (+50%)');
select performs_within('select testes.abrir(''integração'')', 37.5, 37.5, 5,
  'consultor: buscar no quadro (título e descrição, sem acento) em até 50 ms na média (+50%)');
select performs_within('select testes.cartao()', 11.25, 11.25, 5,
  'consultor: abrir um cartão (com checklist e comentários) em até 15 ms na média (+50%)');
reset role;

select testes.como('adm1');
select diag('administrador, abrir: ' || testes.media_ms('select testes.abrir()') || ' ms; cartão: '
  || testes.media_ms('select testes.cartao()') || ' ms');
select performs_within('select testes.abrir()', 37.5, 37.5, 5,
  'administrador (20 clientes com quadro): abrir o quadro em até 50 ms na média (+50%)');
select performs_within('select testes.cartao()', 11.25, 11.25, 5,
  'administrador: abrir um cartão em até 15 ms na média (+50%)');
reset role;

select testes.como('central');
select diag('central, abrir: ' || testes.media_ms('select testes.abrir()') || ' ms');
select performs_within('select testes.abrir()', 37.5, 37.5, 5,
  'central (1.000 quadros): abrir o quadro em até 50 ms na média (+50%)');
reset role;

-- ── Planos ───────────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', '', true);
select ok(not testes.varre('cartoes', format($$
  select k.id from public.cartoes k
  where k.coluna_id = %L and k.arquivado_em is null
  order by k.posicao, k.id limit 50 $$, testes.id('coluna1'))),
  'a página da coluna usa índice (sem Seq Scan em cartoes)');
select ok(not testes.varre('cartoes', format($$
  select count(*) from public.cartoes k
  where k.coluna_id = %L and k.arquivado_em is null and k.busca like '%%integracao%%' $$, testes.id('coluna1'))),
  'a busca numa coluna parte do índice da coluna');
select ok(not testes.varre('cartoes', format($$
  select count(*), count(*) filter (where not c.concluidos and k.prazo < current_date)
  from public.cartoes k join public.quadro_colunas c on c.id = k.coluna_id
  where k.quadro_id = %L and k.arquivado_em is null $$, testes.id('quadro1'))),
  'os números do topo usam índice (sem Seq Scan em cartoes)');
select ok(not testes.varre('cartoes', format($$
  select k.id from public.cartoes k
  where k.quadro_id = %L and k.arquivado_em is not null
  order by k.arquivado_em desc, k.id limit 15 $$, testes.id('quadro1'))),
  'os arquivados usam índice (sem Seq Scan em cartoes)');

-- Leituras pela API (com as regras de quem vê): o checklist e os comentários de um cartão.
select testes.como('consultor1');
select ok(not testes.varre('cartoes', format($$ select count(*) from public.cartao_checklist where cartao_id = %L $$,
  testes.id('cartao1')))
  and not testes.varre('cartao_checklist', format($$ select count(*) from public.cartao_checklist where cartao_id = %L $$,
  testes.id('cartao1'))),
  'consultor: o checklist de um cartão pela API usa índice (cartoes e cartao_checklist)');
reset role;
select testes.como('adm1');
select ok(not testes.varre('cartao_comentarios', format($$
  select id from public.cartao_comentarios where cartao_id = %L order by criado_em desc, id desc limit 30 $$,
  testes.id('cartao1'))) and not testes.varre('cartoes', format($$
  select count(*) from public.cartoes where id = %L $$, testes.id('cartao1'))),
  'administrador: os comentários e o cartão pela API usam índice (cartoes e cartao_comentarios)');
reset role;

-- Os quadros que cada papel vê (o corpo de private.meus_quadros, que as regras de leitura usam): a gestão pelos quadros
-- da consultoria, o consultor pelos clientes dele.
select set_config('request.jwt.claims', '', true);
select ok(not testes.varre('quadros', format($$
  select q.id from public.quadros q join public.clientes c on c.id = q.cliente_id and c.consultoria_id = q.consultoria_id
  where q.consultoria_id = %L $$, testes.id('c1')))
  and not testes.varre('clientes', format($$
  select q.id from public.clientes c join public.quadros q on q.cliente_id = c.id and q.consultoria_id = c.consultoria_id
  where c.consultor_id = %L and c.consultoria_id = %L $$, testes.id('consultor1'), testes.id('c1')))
  and not testes.varre('quadros', format($$
  select q.id from public.clientes c join public.quadros q on q.cliente_id = c.id and q.consultoria_id = c.consultoria_id
  where c.consultor_id = %L and c.consultoria_id = %L $$, testes.id('consultor1'), testes.id('c1'))),
  'os quadros que cada papel vê saem por índice (sem Seq Scan em quadros e clientes)');

select set_config('request.jwt.claims', '', true);
select ok(testes.varre('cartoes', $$ select k.id from public.cartoes k where k.titulo = 'x' $$),
  'controle do teste: uma consulta sem índice é pega como Seq Scan');

select * from finish();
rollback;
