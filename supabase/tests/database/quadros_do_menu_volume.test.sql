-- Volume dos quadros do menu (plano docs/superpowers/plans/2026-11-17-quadros-pessoais-e-de-time.md, Task 2): uma
-- consultoria com 5.000 quadros (2.000 pessoais de 400 pessoas e 3.000 de 300 times, um em cada 10 arquivado), um quadro
-- de time com 2.000 cartões e 500 favoritos; e mais 9 consultorias com 2.000 quadros cada (18.000), porque no banco de
-- verdade os quadros se espalham por muitas consultorias: com uma só, "todos os quadros de time da consultoria" seria
-- a maior parte da tabela e varrer a tabela inteira seria o plano certo. Tudo é criado aqui e desfeito no fim
-- (rollback). O seletor (administrador e membro, com e sem busca), os recentes, os arquivados e abrir o quadro grande
-- precisam responder em menos de 50 ms na média (5 execuções), e nenhuma dessas funções pode varrer a tabela quadros
-- inteira (Seq Scan): conferido pelo contador de varreduras da transação (pg_stat_get_xact_numscans) antes e depois
-- de cada chamada, o que pega o plano que a função de fato usou, e não uma cópia da consulta. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

-- Quantas vezes a tabela quadros foi varrida inteira (Seq Scan) ao rodar o comando: o contador desta transação, antes
-- e depois.
create function testes.varreduras(p_sql text) returns bigint language plpgsql as $$
declare v_antes bigint := pg_stat_get_xact_numscans('public.quadros'::regclass);
begin
  execute p_sql;
  return pg_stat_get_xact_numscans('public.quadros'::regclass) - v_antes;
end $$;
grant execute on function testes.varreduras(text) to authenticated;

select set_config('request.jwt.claims', '', true);

-- ── Dados ────────────────────────────────────────────────────────────────────

-- Consultoria 1 (a grande) e 2 a 10.
create temp table v_consultorias (n int primary key, id uuid not null default gen_random_uuid());
insert into v_consultorias (n) select generate_series(1, 10);
insert into public.consultorias (id, nome) select id, 'Volume menu ' || n from v_consultorias;

-- Na consultoria 1: a pessoa 0 é a administradora; 1 a 30 são gestores (cada um gere 10 times); 31 a 400, pessoas.
-- Nas outras (k = 2 a 10): a pessoa 1000 * k é a administradora (e gestora dos 100 times dela) e 1000 * k + 1 a
-- 1000 * k + 49, pessoas.
create temp table v_pessoas (n int primary key, consultoria int not null, papel text not null,
  id uuid not null default gen_random_uuid());
insert into v_pessoas (n, consultoria, papel)
select n, 1, case when n = 0 then 'admin' when n <= 30 then 'gestor' else 'pessoa' end from generate_series(0, 400) n
union all
select 1000 * k + i, k, case when i = 0 then 'admin' else 'pessoa' end
from generate_series(2, 10) k, generate_series(0, 49) i;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'qmenu' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Pessoa menu ' || p.n, 'qmenu' || p.n || '@volume.test', p.papel
from v_pessoas p join v_consultorias c on c.n = p.consultoria;

-- Times: 300 na consultoria 1 (o time t gerido pela pessoa 1 + (t - 1) % 30, com 10 membros entre as pessoas 31 a 400)
-- e 100 em cada uma das outras (geridos pela administradora).
create temp table v_times (t int primary key, consultoria int not null, gestor int not null,
  id uuid not null default gen_random_uuid());
insert into v_times (t, consultoria, gestor)
select t, 1, 1 + (t - 1) % 30 from generate_series(1, 300) t
union all
select 1000 * k + i, k, 1000 * k from generate_series(2, 10) k, generate_series(1, 100) i;
insert into public.times (id, consultoria_id, nome, gestor_id)
select t.id, c.id, 'Time menu ' || lpad(t.t::text, 5, '0'), p.id
from v_times t join v_consultorias c on c.n = t.consultoria join v_pessoas p on p.n = t.gestor;
insert into public.time_membros (time_id, pessoa_id)
select t.id, p.id
from v_times t, generate_series(0, 9) j, v_pessoas p
where t.consultoria = 1 and p.n = 31 + ((t.t - 1) * 10 + j) % 370;

-- Quadros. Consultoria 1: 5 pessoais de cada pessoa 1 a 400 (2.000) e 10 de cada time (3.000); um em cada 10 arquivado
-- (a hora varia, para a ordem dos arquivados). Outras: 10 pessoais de cada pessoa 1 a 50 (500) e 15 de cada time
-- (1.500).
create temp table v_quadros (q int primary key, id uuid not null default gen_random_uuid());
insert into v_quadros (q) select generate_series(1, 23000);
insert into public.quadros (id, tipo, pessoa_id, consultoria_id, nome, arquivado_em)
select v.id, 'pessoa', p.id, c.id, 'Pessoal ' || v.q,
  case when v.q % 10 = 0 then now() - v.q * interval '1 minute' end
from v_quadros v
join v_pessoas p on p.n = 1 + (v.q - 1) / 5
join v_consultorias c on c.n = 1
where v.q <= 2000;
insert into public.quadros (id, tipo, time_id, nome, arquivado_em)
select v.id, 'time', t.id, 'Quadro ' || v.q, case when v.q % 10 = 0 then now() - v.q * interval '1 minute' end
from v_quadros v join v_times t on t.t = 1 + (v.q - 2001) / 10
where v.q between 2001 and 5000;
insert into public.quadros (id, tipo, pessoa_id, consultoria_id, nome, arquivado_em)
select v.id, 'pessoa', p.id, c.id, 'Pessoal ' || v.q, case when v.q % 10 = 0 then now() end
from v_quadros v
join lateral (select 2 + (v.q - 5001) / 2000 as k, (v.q - 5001) % 2000 as i) x on true
join v_pessoas p on p.n = 1000 * x.k + 1 + x.i % 49
join v_consultorias c on c.n = x.k
where v.q > 5000 and x.i < 500;
insert into public.quadros (id, tipo, time_id, nome, arquivado_em)
select v.id, 'time', t.id, 'Quadro ' || v.q, case when v.q % 10 = 0 then now() end
from v_quadros v
join lateral (select 2 + (v.q - 5001) / 2000 as k, (v.q - 5001) % 2000 as i) x on true
join v_times t on t.t = 1000 * x.k + 1 + (x.i - 500) / 15
where v.q > 5000 and x.i >= 500;

-- O quadro grande: o primeiro do time 1 (quadro 2001), com as três colunas e 2.000 cartões (um em cada 20 arquivado).
insert into testes.fx select 'grande', id from v_quadros where q = 2001;
create temp table v_colunas (i int primary key, id uuid not null default gen_random_uuid());
insert into v_colunas (i) select generate_series(0, 2);
insert into public.quadro_colunas (id, quadro_id, nome, concluidos, posicao)
select c.id, testes.id('grande'), (array['A fazer', 'Em andamento', 'Concluído'])[c.i + 1], c.i = 2, (c.i + 1) * 1024
from v_colunas c;
insert into public.cartoes (coluna_id, titulo, posicao, arquivado_em)
select c.id, 'Cartão menu ' || k, k * 1024, case when k % 20 = 0 then now() end
from generate_series(1, 2000) k join v_colunas c on c.i = k % 3;

-- 500 favoritos: 100 da administradora (quadros de time) e um de cada pessoa 1 a 400 (o primeiro pessoal dela).
insert into public.quadro_favoritos (perfil_id, quadro_id)
select p.id, q.id from v_pessoas p, v_quadros q where p.n = 0 and q.q between 2001 and 2100;
insert into public.quadro_favoritos (perfil_id, quadro_id)
select p.id, q.id from v_pessoas p join v_quadros q on q.q = (p.n - 1) * 5 + 1 where p.consultoria = 1 and p.n >= 1;

analyze public.perfis;
analyze public.times;
analyze public.time_membros;
analyze public.quadros;
analyze public.quadro_colunas;
analyze public.cartoes;
analyze public.quadro_favoritos;

insert into testes.fx select 'admin', id from v_pessoas where n = 0;
-- A pessoa 31: membro dos times 1, 38, 75, 112, 149, 186, 223, 260 e 297 (90 quadros) e com 5 pessoais.
insert into testes.fx select 'membro', id from v_pessoas where n = 31;
insert into testes.fx select 'c1', id from v_consultorias where n = 1;

-- Os recentes guardados no navegador do membro: 3 pessoais dele e 5 do time 1.
create table testes.recentes as
select array_agg(id order by q) as ids from v_quadros where q in (151, 152, 153, 2001, 2002, 2003, 2004, 2005);
grant select on testes.recentes to authenticated;

-- ── O que cada um recebe ─────────────────────────────────────────────────────

select testes.como('admin');
select is((public.quadros_para_escolher() -> 'dos_times' ->> 'total')::int, 2700,
  'administradora: os 2.700 quadros de time abertos da consultoria (dos 3.000)');
select is((public.quadros_para_escolher() -> 'dos_times' -> 'itens' -> 0 ->> 'cartoes')::int, 1900,
  'o primeiro (o grande, do time 1) com os 1.900 cartões não arquivados');
select is((public.quadros_para_escolher() -> 'favoritos' ->> 'total')::int, 90,
  'os 90 favoritos abertos dela (dos 100)');
reset role;
select testes.como('membro');
select is((public.quadros_para_escolher() -> 'dos_times' ->> 'total')::int, 81,
  'membro: os 81 quadros abertos dos 9 times dele');
select is((public.quadros_para_escolher() -> 'meus' ->> 'total')::int, 5, 'e os 5 pessoais');
reset role;

-- ── Tempo ────────────────────────────────────────────────────────────────────

select testes.como('admin');
select diag('administradora: seletor ' || testes.media_ms('select public.quadros_para_escolher()') || ' ms; com busca '
  || testes.media_ms($$select public.quadros_para_escolher('quadro 21')$$) || ' ms; arquivados '
  || testes.media_ms('select public.quadros_arquivados()') || ' ms; arquivados p. 10 '
  || testes.media_ms('select public.quadros_arquivados(null, null, 10)') || ' ms; abrir o grande '
  || testes.media_ms($$select public.quadro_por_id(testes.id('grande'))$$) || ' ms');
select performs_within('select public.quadros_para_escolher()', 25, 25, 5,
  'administradora: o seletor (3.000 quadros de time na consultoria) em menos de 50 ms na média');
select performs_within($$select public.quadros_para_escolher('quadro 21')$$, 25, 25, 5,
  'administradora: o seletor com busca em menos de 50 ms');
select performs_within('select public.quadros_arquivados()', 25, 25, 5,
  'administradora: os arquivados em menos de 50 ms');
select performs_within($$select public.quadro_por_id(testes.id('grande'))$$, 25, 25, 5,
  'administradora: abrir o quadro de 2.000 cartões em menos de 50 ms');
reset role;

select testes.como('membro');
select diag('membro: seletor ' || testes.media_ms('select public.quadros_para_escolher()') || ' ms; com busca '
  || testes.media_ms($$select public.quadros_para_escolher('quadro 2')$$) || ' ms; recentes '
  || testes.media_ms('select public.quadros_por_ids((select ids from testes.recentes))') || ' ms; arquivados '
  || testes.media_ms('select public.quadros_arquivados()') || ' ms; abrir o grande '
  || testes.media_ms($$select public.quadro_por_id(testes.id('grande'))$$) || ' ms');
select performs_within('select public.quadros_para_escolher()', 25, 25, 5,
  'membro: o seletor em menos de 50 ms');
select performs_within($$select public.quadros_para_escolher('quadro 2')$$, 25, 25, 5,
  'membro: o seletor com busca em menos de 50 ms');
select performs_within('select public.quadros_por_ids((select ids from testes.recentes))', 25, 25, 5,
  'membro: os recentes em menos de 50 ms');
select performs_within('select public.quadros_arquivados()', 25, 25, 5, 'membro: os arquivados em menos de 50 ms');
select performs_within($$select public.quadro_por_id(testes.id('grande'))$$, 25, 25, 5,
  'membro: abrir o quadro de 2.000 cartões em menos de 50 ms');
reset role;

-- ── Sem varrer a tabela quadros ──────────────────────────────────────────────

select testes.como('admin');
select is(testes.varreduras('select public.quadros_para_escolher()'), 0::bigint,
  'administradora: o seletor não varre a tabela quadros');
select is(testes.varreduras($$select public.quadros_para_escolher('quadro 21')$$), 0::bigint,
  'nem com busca');
select is(testes.varreduras('select public.quadros_arquivados()'), 0::bigint, 'nem os arquivados');
select is(testes.varreduras($$select public.quadros_arquivados('quadro 1', 'time', 2)$$), 0::bigint,
  'nem os arquivados com busca e filtro');
select is(testes.varreduras($$select public.quadro_por_id(testes.id('grande'))$$), 0::bigint, 'nem abrir o quadro');
reset role;
select testes.como('membro');
select is(testes.varreduras('select public.quadros_para_escolher()'), 0::bigint, 'membro: o seletor não varre');
select is(testes.varreduras($$select public.quadros_para_escolher('quadro 2')$$), 0::bigint, 'nem com busca');
select is(testes.varreduras('select public.quadros_por_ids((select ids from testes.recentes))'), 0::bigint,
  'nem os recentes');
select is(testes.varreduras('select public.quadros_arquivados()'), 0::bigint, 'nem os arquivados');
select is(testes.varreduras('select public.times_para_novo_quadro()'), 0::bigint, 'nem os times do Novo quadro');
reset role;

select * from finish();
rollback;
