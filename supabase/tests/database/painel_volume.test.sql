-- Volume do painel do Início: 200 consultorias, 3.000 consultores, 52.000 clientes (50.000 como sempre, mais 2.000 com
-- consultor e sem check-in nenhum) e 200.000 check-ins fechados no mês atual mais 2.300.000 nos 23 meses anteriores
-- (100.000 por mês: o período vai até 2 anos), criados aqui e desfeitos no fim (rollback: nada fica no banco). A
-- história da situação dos clientes tem os trechos de 2 anos (cadastro, espera por consultor, consultor e, em 1 de cada
-- 3, uma mudança de previsão). Média de 5 execuções, com 50% de folga (os limites da tabela "Desempenho" do design
-- 2026-11-17-graficos-do-inicio-e-do-cliente):
-- - painel_do_inicio, Mês: 500 ms para a central (tudo), 150 ms para uma consultoria e 100 ms para um consultor;
-- - "Este ano" no pior caso (12 meses até hoje, o "Este ano" de dezembro) e o Personalizado mais longo (quase 2 anos,
--   do meio do mês mais antigo até hoje, com as duas bordas cheias): 600 ms para a central, 150 ms para a consultoria
--   e 100 ms para o consultor (os meses inteiros vêm dos resumos por mês; só as bordas leem check-ins);
-- - comparacao_do_inicio (Mês e 2 anos) como o painel; fila_de_clientes (2 anos) 200 / 50 ms; clientes_em_risco
--   400 / 100 / 50 ms; horas_por_cliente Mês / 2 anos 300 / 800 ms na central, 150 ms na consultoria e 100 ms no
--   consultor; checkins_por_semana (2 anos) 300 / 100 / 100 ms;
-- - gatilhos: trocar o consultor de um cliente e gravar e fechar um check-in em menos de 20 ms;
-- - horas por cliente e semanas da central em 2 anos sem ler a tabela de check-ins inteira (Seq Scan).
--   Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create schema testes;
grant usage on schema testes to authenticated;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

-- Média (ms) de 5 execuções, só para o relatório (diag): o limite de verdade é o performs_within.
create function testes.media_ms() returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop perform public.painel_do_inicio(); end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms() to authenticated;

-- "Este ano" no pior caso: 12 meses até hoje (o "Este ano" de dezembro). Fixo assim, a medida não muda com o mês em
-- que o teste roda. E o Personalizado mais longo com as duas bordas cheias: do dia 5 do mês mais antigo do volume (23
-- meses atrás; os check-ins de cada mês antigo vão do dia 1 ao 13, então a borda de 5 em diante tem ~70.000) até hoje
-- (a borda do mês atual tem os 200.000). Fica abaixo de 2 anos (o banco aceita até < de + 2 anos) e toca 24 meses.
create function testes.ano_de() returns date language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '11 months')::date
$$;
create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
create function testes.dois_anos_de() returns date language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '23 months' + interval '4 days')::date
$$;
grant execute on function testes.ano_de(), testes.hoje(), testes.dois_anos_de() to authenticated;

-- Média (ms) de 5 execuções do painel num período, só para o relatório (diag).
create function testes.media_ms_periodo(p_de date, p_ate date) returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop perform public.painel_do_inicio(p_de => p_de, p_ate => p_ate); end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms_periodo(date, date) to authenticated;

-- Média (ms) de 5 execuções de um comando qualquer, só para o relatório (diag).
create function testes.media_ms_de(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop execute p_sql; end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms_de(text) to authenticated;

-- Quantas vezes a tabela checkins foi varrida inteira (Seq Scan) ao rodar o comando: o contador desta transação, antes
-- e depois (pega o plano que a função de fato usou, e não uma cópia da consulta).
create function testes.varreduras(p_sql text) returns bigint language plpgsql as $$
declare v_antes bigint := pg_stat_get_xact_numscans('public.checkins'::regclass);
begin
  execute p_sql;
  return pg_stat_get_xact_numscans('public.checkins'::regclass) - v_antes;
end $$;
grant execute on function testes.varreduras(text) to authenticated;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Tudo como o sistema (sem usuário logado).
select set_config('request.jwt.claims', '', true);

-- ── Consultorias e consultores ───────────────────────────────────────────────
-- Consultor n (1 a 3.000) é da consultoria (n - 1) % 200 + 1: 15 por consultoria. Os 200 primeiros são
-- administradores, os 200 seguintes gestores. Um em cada 50 tem carga 0; um em cada 3 tem 5 dias de ausência.

create temp table v_consultorias (n int primary key, id uuid not null default gen_random_uuid());
insert into v_consultorias (n) select generate_series(1, 200);
insert into public.consultorias (id, nome) select id, 'Volume ocupação ' || n from v_consultorias;
insert into testes.fx select 'v1', id from v_consultorias where n = 1;

create temp table v_pessoas (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pessoas (n) select generate_series(0, 3000);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'volume' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;

-- n = 0 é a central.
insert into public.perfis (id, consultoria_id, nome, email, papel, carga_semanal)
select p.id, c.id, 'Consultor volume ' || p.n, 'volume' || p.n || '@volume.test',
  case when p.n = 0 then 'central' when p.n <= 200 then 'admin' when p.n <= 400 then 'gestor' else 'pessoa' end,
  case when p.n % 50 = 0 then 0 when p.n % 7 = 0 then 30 else 44 end
from v_pessoas p
left join v_consultorias c on p.n > 0 and c.n = (p.n - 1) % 200 + 1;
insert into testes.fx select 'central', id from v_pessoas where n = 0;

insert into public.ausencias (perfil_id, de, ate, motivo)
select p.id, m.dia + (p.n % 20), m.dia + (p.n % 20) + 4, 'Férias'
from v_pessoas p
cross join (select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as dia) m
where p.n > 0 and p.n % 3 = 0;

-- ── Clientes ─────────────────────────────────────────────────────────────────
-- Cliente g (1 a 48.000) é da consultoria (g - 1) % 200 + 1; o consultor é n = consultoria + 200 x faixa, com
-- faixa = ((g - 1) / 200) % 16 (a faixa 15 aguarda consultor). Os clientes 48.001 a 50.000 estão na central.
-- Assim o consultor n atende os clientes n + 3.200 x j (j de 0 a 14). Os clientes 50.001 a 52.000 têm consultor (n =
-- 401 a 3.000, na consultoria dele) e nenhum check-in: os parados do risco.
-- As datas se espalham por 2 anos: cadastro há 40 a 739 dias, chegada à consultoria um dia depois e o consultor 0 a 8
-- dias depois disso (sempre há mais de 30 dias). Os gatilhos de validação, do histórico e da história ficam desligados
-- só nesta transação (aqui quem grava é o sistema, em lote, com as datas já certas); a história é gravada depois numa
-- leitura só, igual ao que o gatilho faria passo a passo (o gatilho é conferido em graficos_base.test.sql).

create temp table v_clientes (n int primary key, id uuid not null default gen_random_uuid());
insert into v_clientes (n) select generate_series(1, 52000);

alter table public.clientes disable trigger clientes_validar;
alter table public.clientes disable trigger clientes_historico;
alter table public.clientes disable trigger clientes_situacao;
insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id, criado_em, enviado_em, consultor_desde)
select v.id, 'Cliente volume ' || v.n, 1 + v.n % 40, c.id, p.id,
  now() - ((v.n % 700) + 40) * interval '1 day',
  case when c.id is not null then now() - ((v.n % 700) + 39) * interval '1 day' end,
  case when p.id is not null then now() - ((v.n % 700) + 39 - v.n % 9) * interval '1 day' end
from v_clientes v
cross join lateral (
  select case when v.n <= 48000 then (v.n - 1) % 200 + 1
              when v.n > 50000 then (400 + (v.n - 50001) % 2600) % 200 + 1 end as consultoria,
         case when v.n <= 48000 and ((v.n - 1) / 200) % 16 < 15 then (v.n - 1) % 200 + 1 + 200 * (((v.n - 1) / 200) % 16)
              when v.n > 50000 then 401 + (v.n - 50001) % 2600 end as consultor
) m
left join v_consultorias c on c.n = m.consultoria
left join v_pessoas p on p.n = m.consultor;
alter table public.clientes enable trigger clientes_validar;
alter table public.clientes enable trigger clientes_historico;
alter table public.clientes enable trigger clientes_situacao;

-- A história: a distribuir do cadastro até a chegada (a central: até hoje); esperando consultor da chegada até o
-- consultor (a faixa 15: até hoje); com consultor desde então (entrou) e, em 1 de cada 3, uma mudança de previsão 10
-- dias depois.
insert into private.situacoes_dos_clientes (cliente_id, consultoria_id, consultor_id, horas_mes, de, ate, espera_desde, entrou)
select c.id, null::uuid, null::uuid, c.horas_mes, c.criado_em, c.enviado_em, null::timestamptz, false
from public.clientes c join v_clientes v on v.id = c.id
union all
select c.id, c.consultoria_id, null::uuid, c.horas_mes, c.enviado_em, c.consultor_desde, c.enviado_em, false
from public.clientes c join v_clientes v on v.id = c.id
where c.consultoria_id is not null
union all
select c.id, c.consultoria_id, c.consultor_id, case when v.n % 3 = 0 then c.horas_mes + 1 else c.horas_mes end,
  c.consultor_desde, case when v.n % 3 = 0 then c.consultor_desde + interval '10 days' end, c.enviado_em, true
from public.clientes c join v_clientes v on v.id = c.id
where c.consultor_id is not null
union all
select c.id, c.consultoria_id, c.consultor_id, c.horas_mes, c.consultor_desde + interval '10 days', null, c.enviado_em, false
from public.clientes c join v_clientes v on v.id = c.id
where c.consultor_id is not null and v.n % 3 = 0;

-- ── Check-ins ────────────────────────────────────────────────────────────────
-- 200.000 check-ins fechados no mês atual, cerca de 67 por consultor, sem sobreposição: o i-ésimo do
-- consultor começa em início do mês + i x passo e dura meio passo. Os gatilhos checkins_validar (o consultor
-- logado faz o próprio check-in, nada no futuro) e checkins_resumir_horas ficam desligados só nesta transação: aqui
-- quem grava é o sistema, em lote, e os dois resumos por mês (por consultoria e por consultor) são preenchidos depois
-- numa soma só, igual ao que o gatilho faria (o gatilho é conferido em painel_do_inicio.test.sql). Linha a linha, 2,5
-- milhões de check-ins levariam minutos e deixariam milhões de versões mortas nos resumos (numa transação só, nada
-- limpa), o que não acontece no banco de verdade. As restrições da tabela (sobreposição, 24 h, descrição) valem.

alter table public.checkins disable trigger checkins_validar;
alter table public.checkins disable trigger checkins_resumir_horas;

-- Histórico: 100.000 check-ins em cada um dos 23 meses anteriores (o período vai até 2 anos). O i-ésimo do consultor
-- no mês começa em início do mês + i x 9 h e dura 4 h (34 por consultor: cabem no mês, sem sobreposição). Gravados
-- em ordem de início, do mais antigo ao mais novo, e só depois o mês atual: no banco de verdade os check-ins entram
-- na ordem do tempo, e o planejador conta com isso (ordem física ≈ ordem de início) para ler um mês pelo índice.
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select cl.id, p.id, c.id, m.de + x.i * interval '9 hours', m.de + x.i * interval '9 hours' + interval '4 hours', 'Histórico'
from generate_series(1, 23) atras
cross join generate_series(1, 100000) k
cross join lateral (select (k - 1) % 3000 + 1 as n, (k - 1) / 3000 as i) x
cross join lateral (
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - atras * interval '1 month') at time zone 'America/Sao_Paulo' as de
) m
join v_pessoas p on p.n = x.n
join v_consultorias c on c.n = (x.n - 1) % 200 + 1
join v_clientes cl on cl.n = x.n + 3200 * (x.i % 15)
order by 4;

insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select cl.id, p.id, c.id, m.de + x.i * m.passo, m.de + x.i * m.passo + m.passo / 2, 'Atendimento'
from generate_series(1, 200000) k
cross join lateral (select (k - 1) % 3000 + 1 as n, (k - 1) / 3000 as i) x
cross join (
  select de, greatest((now() - de) / 70, interval '2 seconds') as passo
  from (select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as de) d
) m
join v_pessoas p on p.n = x.n
join v_consultorias c on c.n = (x.n - 1) % 200 + 1
join v_clientes cl on cl.n = x.n + 3200 * (x.i % 15)
order by 4;

alter table public.checkins enable trigger checkins_validar;
alter table public.checkins enable trigger checkins_resumir_horas;

-- Os quatro resumos, como o gatilho os deixaria (só os check-ins do volume; os de antes já estão neles).
insert into public.checkins_horas_mes (consultoria_id, mes, segundos)
select k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date, sum(extract(epoch from k.fim - k.inicio))
from public.checkins k
where k.fim is not null and k.consultoria_id in (select id from v_consultorias)
group by 1, 2
on conflict (consultoria_id, mes) do update set segundos = public.checkins_horas_mes.segundos + excluded.segundos;
insert into private.checkins_horas_consultor_mes (consultor_id, consultoria_id, mes, segundos)
select k.consultor_id, k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
  sum(extract(epoch from k.fim - k.inicio))
from public.checkins k
where k.fim is not null and k.consultoria_id in (select id from v_consultorias)
group by 1, 2, 3
on conflict (consultor_id, consultoria_id, mes)
  do update set segundos = private.checkins_horas_consultor_mes.segundos + excluded.segundos;
insert into private.checkins_horas_cliente_mes (cliente_id, consultoria_id, mes, segundos)
select k.cliente_id, k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
  sum(extract(epoch from k.fim - k.inicio))
from public.checkins k
where k.fim is not null and k.consultoria_id in (select id from v_consultorias)
group by 1, 2, 3
on conflict (cliente_id, consultoria_id, mes)
  do update set segundos = private.checkins_horas_cliente_mes.segundos + excluded.segundos;
insert into private.checkins_por_dia (consultoria_id, dia, quantidade, segundos)
select k.consultoria_id, (k.inicio at time zone 'America/Sao_Paulo')::date, count(*), sum(extract(epoch from k.fim - k.inicio))
from public.checkins k
where k.fim is not null and k.consultoria_id in (select id from v_consultorias)
group by 1, 2
on conflict (consultoria_id, dia)
  do update set quantidade = private.checkins_por_dia.quantidade + excluded.quantidade,
    segundos = private.checkins_por_dia.segundos + excluded.segundos;

-- Estatísticas do volume, como o autovacuum deixaria no banco de verdade. Sem isso o planejador usa as do banco local
-- (quase vazio, e mudando conforme os outros testes): na mesma carga, o consultor já mediu de 5 ms a 22 s no "Este
-- ano", escolhendo o índice por data em vez do índice do cliente ou do consultor. O ANALYZE vê as linhas desta
-- transação; as estatísticas voltam com o rollback.
analyze public.checkins, public.clientes, public.perfis, public.consultorias, public.ausencias,
  public.checkins_horas_mes, private.checkins_horas_consultor_mes, private.checkins_horas_cliente_mes,
  private.checkins_por_dia, private.situacoes_dos_clientes;

-- ── Tempos ───────────────────────────────────────────────────────────────────
-- O consultor n = 401 é o primeiro 'pessoa' (consultoria 1); o administrador n = 1 (consultoria 1).
insert into testes.fx select 'adm1', id from v_pessoas where n = 1;
insert into testes.fx select 'pessoa401', id from v_pessoas where n = 401;

select testes.como('central');
select diag('média medida: ' || testes.media_ms() || ' ms');
select is(public.painel_do_inicio() ->> 'recorte', 'tudo', 'a central recebe o recorte tudo');
select ok((public.painel_do_inicio() -> 'indicadores' ->> 'clientes_em_atendimento')::int
    = (select count(*) from public.clientes where not arquivado and consultor_id is not null)
  and (public.painel_do_inicio() -> 'indicadores' ->> 'clientes_em_atendimento')::int >= 47000,
  'a central conta os clientes em atendimento (os 47.000 com consultor do volume)');
select ok(jsonb_array_length(public.painel_do_inicio() -> 'ranking') = 12, 'ranking limitado a 12');
select ok((select bool_and((e ->> 'realizado')::numeric > 0) from jsonb_array_elements(public.painel_do_inicio() -> 'horas_por_mes') e),
  'os 6 meses do gráfico têm horas (o volume cobre o histórico inteiro)');

-- Média de 5 execuções (o pgTAP descarta a mais rápida); janela "média +- folga" centrada em 0,75 x limite com
-- folga de 0,75 x limite: o limite como média, com 50% de tolerância.
select performs_within('select public.painel_do_inicio()', 375, 375, 5,
  'central (todas as consultorias, 3.000 consultores): painel_do_inicio() em até 500 ms na média (+50%)');
-- Períodos: utilização de 3.000 consultores. Os meses inteiros vêm dos resumos; só o mês atual (borda) lê check-ins.
select diag('Este ano, média medida: ' || testes.media_ms_periodo(testes.ano_de(), testes.hoje()) || ' ms');
select diag('2 anos, média medida: ' || testes.media_ms_periodo(testes.dois_anos_de(), testes.hoje()) || ' ms');
select is((public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje()) -> 'indicadores' ->> 'realizado')::numeric,
  (select round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) from public.checkins k
   join public.consultorias co on co.id = k.consultoria_id and co.arquivada_em is null
   where k.fim is not null and k.inicio >= testes.ano_de()::timestamp at time zone 'America/Sao_Paulo'),
  'Este ano: o realizado da central soma todos os check-ins do ano (meses inteiros pelo resumo, o mês atual direto)');
select ok((select bool_and((e ->> 'ocupacao')::numeric = round(round(f.segundos / 3600, 1) / (e ->> 'capacidade')::numeric, 4))
    from jsonb_array_elements(public.painel_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje()) -> 'ranking') e
    cross join lateral (
      select coalesce(sum(extract(epoch from k.fim - k.inicio)), 0) as segundos from public.checkins k
      where k.fim is not null and k.consultoria_id = (e ->> 'id')::uuid
        and k.inicio >= testes.dois_anos_de()::timestamp at time zone 'America/Sao_Paulo') f),
  '2 anos: a utilização de cada consultoria do ranking = soma direta dos check-ins / capacidade (resumo por mês + bordas)');
select is(jsonb_array_length(public.painel_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje()) -> 'horas_por_mes'), 24,
  '2 anos: o gráfico mostra 24 meses');
select ok((select count(*) > 50000 from public.checkins k
    where k.inicio >= testes.dois_anos_de()::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (date_trunc('month', testes.dois_anos_de()) + interval '1 month') at time zone 'America/Sao_Paulo'),
  '2 anos: a borda do mês mais antigo tem check-ins (as duas bordas são lidas, o pior caso)');
select performs_within('select public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje())', 450, 450, 5,
  'central, Este ano (12 meses, 3.000 consultores, 1,3 milhão de check-ins): em até 600 ms na média (+50%)');
select performs_within('select public.painel_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 450, 450, 5,
  'central, 2 anos (2,5 milhões de check-ins): em até 600 ms na média (+50%)');
-- As outras funções do Início, com os limites do design.
select diag('comparação, Mês: ' || testes.media_ms_de('select public.comparacao_do_inicio()') || ' ms; 2 anos: '
  || testes.media_ms_de('select public.comparacao_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('fila, 2 anos: ' || testes.media_ms_de('select public.fila_de_clientes(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('risco: ' || testes.media_ms_de('select public.clientes_em_risco()') || ' ms');
select diag('horas por cliente, Mês: ' || testes.media_ms_de('select public.horas_por_cliente()') || ' ms; 2 anos: '
  || testes.media_ms_de('select public.horas_por_cliente(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('semanas, 2 anos: ' || testes.media_ms_de('select public.checkins_por_semana(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select performs_within('select public.comparacao_do_inicio()', 375, 375, 5,
  'central: comparacao_do_inicio do Mês em até 500 ms na média (+50%)');
select performs_within('select public.comparacao_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 450, 450, 5,
  'central: comparacao_do_inicio de 2 anos em até 600 ms na média (+50%)');
select performs_within('select public.fila_de_clientes(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 150, 150, 5,
  'central: fila_de_clientes de 2 anos (5.000 esperando, 47.000 entradas) em até 200 ms na média (+50%)');
select performs_within('select public.clientes_em_risco()', 300, 300, 5,
  'central: clientes_em_risco (47.000 clientes, 2.000 parados) em até 400 ms na média (+50%)');
select performs_within('select public.horas_por_cliente()', 225, 225, 5,
  'central: horas_por_cliente do Mês em até 300 ms na média (+50%)');
select performs_within('select public.horas_por_cliente(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 600, 600, 5,
  'central: horas_por_cliente de 2 anos (pelo resumo por cliente) em até 800 ms na média (+50%)');
select performs_within('select public.checkins_por_semana(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 225, 225, 5,
  'central: checkins_por_semana de 2 anos (pelo resumo por dia) em até 300 ms na média (+50%)');
select is(testes.varreduras('select public.horas_por_cliente(p_de => testes.dois_anos_de(), p_ate => testes.hoje())'), 0::bigint,
  'central: horas por cliente de 2 anos sem Seq Scan em checkins');
select is(testes.varreduras('select public.checkins_por_semana(p_de => testes.dois_anos_de(), p_ate => testes.hoje())'), 0::bigint,
  'central: semanas de 2 anos sem Seq Scan em checkins');
reset role;

select testes.como('adm1');
select diag('média medida: ' || testes.media_ms() || ' ms');
select performs_within('select public.painel_do_inicio()', 112.5, 112.5, 5,
  'administrador (15 consultores, 250 clientes): painel_do_inicio() em até 150 ms na média (+50%)');
select diag('Este ano, média medida: ' || testes.media_ms_periodo(testes.ano_de(), testes.hoje()) || ' ms');
select diag('2 anos, média medida: ' || testes.media_ms_periodo(testes.dois_anos_de(), testes.hoje()) || ' ms');
select performs_within('select public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje())', 112.5, 112.5, 5,
  'administrador, Este ano (15 consultores): em até 150 ms na média (+50%)');
select performs_within('select public.painel_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 112.5, 112.5, 5,
  'administrador, 2 anos: em até 150 ms na média (+50%)');
select diag('comparação, Mês: ' || testes.media_ms_de('select public.comparacao_do_inicio()') || ' ms; 2 anos: '
  || testes.media_ms_de('select public.comparacao_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('fila, 2 anos: ' || testes.media_ms_de('select public.fila_de_clientes(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('risco: ' || testes.media_ms_de('select public.clientes_em_risco()') || ' ms');
select diag('horas por cliente, Mês: ' || testes.media_ms_de('select public.horas_por_cliente()') || ' ms; 2 anos: '
  || testes.media_ms_de('select public.horas_por_cliente(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('semanas, 2 anos: ' || testes.media_ms_de('select public.checkins_por_semana(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select performs_within('select public.comparacao_do_inicio()', 112.5, 112.5, 5,
  'administrador: comparacao_do_inicio do Mês em até 150 ms na média (+50%)');
select performs_within('select public.comparacao_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 112.5, 112.5, 5,
  'administrador: comparacao_do_inicio de 2 anos em até 150 ms na média (+50%)');
select performs_within('select public.fila_de_clientes(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 37.5, 37.5, 5,
  'administrador: fila_de_clientes de 2 anos em até 50 ms na média (+50%)');
select performs_within('select public.clientes_em_risco()', 75, 75, 5,
  'administrador: clientes_em_risco em até 100 ms na média (+50%)');
select performs_within('select public.horas_por_cliente()', 112.5, 112.5, 5,
  'administrador: horas_por_cliente do Mês em até 150 ms na média (+50%)');
select performs_within('select public.horas_por_cliente(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 112.5, 112.5, 5,
  'administrador: horas_por_cliente de 2 anos em até 150 ms na média (+50%)');
select performs_within('select public.checkins_por_semana(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 75, 75, 5,
  'administrador: checkins_por_semana de 2 anos em até 100 ms na média (+50%)');
reset role;

select testes.como('pessoa401');
select diag('média medida: ' || testes.media_ms() || ' ms');
select performs_within('select public.painel_do_inicio()', 75, 75, 5,
  'consultor (15 clientes, 67 check-ins): painel_do_inicio() em até 100 ms na média (+50%)');
select diag('Este ano, média medida: ' || testes.media_ms_periodo(testes.ano_de(), testes.hoje()) || ' ms');
select diag('2 anos, média medida: ' || testes.media_ms_periodo(testes.dois_anos_de(), testes.hoje()) || ' ms');
select performs_within('select public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje())', 75, 75, 5,
  'consultor, Este ano: em até 100 ms na média (+50%)');
select performs_within('select public.painel_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 75, 75, 5,
  'consultor, 2 anos: em até 100 ms na média (+50%)');
select diag('comparação, Mês: ' || testes.media_ms_de('select public.comparacao_do_inicio()') || ' ms; 2 anos: '
  || testes.media_ms_de('select public.comparacao_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('risco: ' || testes.media_ms_de('select public.clientes_em_risco()') || ' ms');
select diag('horas por cliente, Mês: ' || testes.media_ms_de('select public.horas_por_cliente()') || ' ms; 2 anos: '
  || testes.media_ms_de('select public.horas_por_cliente(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select diag('semanas, 2 anos: ' || testes.media_ms_de('select public.checkins_por_semana(p_de => testes.dois_anos_de(), p_ate => testes.hoje())') || ' ms');
select performs_within('select public.comparacao_do_inicio()', 75, 75, 5,
  'consultor: comparacao_do_inicio do Mês em até 100 ms na média (+50%)');
select performs_within('select public.comparacao_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 75, 75, 5,
  'consultor: comparacao_do_inicio de 2 anos em até 100 ms na média (+50%)');
select performs_within('select public.clientes_em_risco()', 37.5, 37.5, 5,
  'consultor: clientes_em_risco em até 50 ms na média (+50%)');
select performs_within('select public.horas_por_cliente()', 75, 75, 5,
  'consultor: horas_por_cliente do Mês em até 100 ms na média (+50%)');
select performs_within('select public.horas_por_cliente(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 75, 75, 5,
  'consultor: horas_por_cliente de 2 anos em até 100 ms na média (+50%)');
select performs_within('select public.checkins_por_semana(p_de => testes.dois_anos_de(), p_ate => testes.hoje())', 75, 75, 5,
  'consultor: checkins_por_semana de 2 anos em até 100 ms na média (+50%)');
reset role;

-- ── Gatilhos no volume ───────────────────────────────────────────────────────
-- Trocar o consultor de um cliente (todos os gatilhos de clientes: validação, histórico, história, fechar o check-in
-- aberto pelo índice parcial, quadros) e gravar e fechar um check-in (os quatro resumos) em menos de 20 ms na média.
-- O cliente 1 é da consultoria 1 e alterna entre o administrador (n = 1) e o gestor (n = 201) dela. O check-in é de
-- uma pessoa nova da consultoria 1 (sem check-in nenhum), em horários de 2015 que não se sobrepõem.
select set_config('request.jwt.claims', '', true);
insert into testes.fx select 'cli1', id from v_clientes where n = 1;
insert into testes.fx select 'ges201', id from v_pessoas where n = 201;
select diag('trocar o consultor de um cliente, média medida: ' || testes.media_ms_de(format(
  'update public.clientes set consultor_id = case when consultor_id = %L then %L::uuid else %L::uuid end where id = %L',
  testes.id('adm1'), testes.id('ges201'), testes.id('adm1'), testes.id('cli1'))) || ' ms');
select performs_within(format(
  'update public.clientes set consultor_id = case when consultor_id = %L then %L::uuid else %L::uuid end where id = %L',
  testes.id('adm1'), testes.id('ges201'), testes.id('adm1'), testes.id('cli1')), 15, 15, 5,
  'trocar o consultor de um cliente (todos os gatilhos) em menos de 20 ms na média');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000c0de', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'ponto@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now());
insert into public.perfis (id, consultoria_id, nome, email, papel)
select '00000000-0000-4000-8000-00000000c0de', id, 'Consultor do ponto', 'ponto@volume.test', 'pessoa'
from v_consultorias where n = 1;
insert into testes.fx values ('ponto', '00000000-0000-4000-8000-00000000c0de');
insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
select 'Cliente do ponto', 10, id, testes.id('ponto') from v_consultorias where n = 1;
insert into testes.fx select 'cli_ponto', id from public.clientes where nome = 'Cliente do ponto' and consultor_id = testes.id('ponto');
create sequence testes.ponto;
create function testes.gravar_e_fechar() returns void language plpgsql as $$
declare
  v_inicio timestamptz := timestamptz '2015-01-01 08:00-03' + nextval('testes.ponto') * interval '2 hours';
  v_id uuid;
begin
  insert into public.checkins (cliente_id, inicio, descricao)
  values (testes.id('cli_ponto'), v_inicio, 'Ponto') returning id into v_id;
  update public.checkins set fim = v_inicio + interval '1 hour' where id = v_id;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', testes.id('ponto'), 'role', 'authenticated')::text, true);
select diag('gravar e fechar um check-in, média medida: ' || testes.media_ms_de('select testes.gravar_e_fechar()') || ' ms');
select performs_within('select testes.gravar_e_fechar()', 15, 15, 5,
  'gravar e fechar um check-in (os quatro resumos) em menos de 20 ms na média');
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
