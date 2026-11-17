-- Volume do painel do Início: 200 consultorias, 3.000 consultores, 50.000 clientes e 200.000 check-ins fechados no mês atual mais 500.000 nos 5 meses anteriores (o gráfico lê 6 meses), criados
-- aqui e desfeitos no fim (rollback: nada fica no banco). painel_do_inicio no Mês precisa responder em até 500 ms
-- para a central (tudo), 150 ms para uma consultoria e 100 ms para um consultor (média de 5 execuções, com 50% de
-- folga). No período "Este ano" (12 meses até hoje, o pior caso: lê os 700.000 check-ins), 1000 ms para a central e
-- 300 ms para a consultoria e para o consultor. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

-- "Este ano" no pior caso: 12 meses até hoje (o "Este ano" de dezembro), que cobre o volume inteiro (os check-ins são
-- do mês atual e dos 5 anteriores). Fixo assim, a medida não muda com o mês em que o teste roda.
create function testes.ano_de() returns date language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '11 months')::date
$$;
create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
grant execute on function testes.ano_de(), testes.hoje() to authenticated;

-- Média (ms) de 5 execuções do painel no "Este ano" acima, só para o relatório (diag).
create function testes.media_ms_ano() returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop perform public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje()); end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms_ano() to authenticated;

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
-- Assim o consultor n atende os clientes n + 3.200 x j (j de 0 a 14).

create temp table v_clientes (n int primary key, id uuid not null default gen_random_uuid());
insert into v_clientes (n) select generate_series(1, 50000);

insert into public.clientes (id, nome, horas_mes, consultoria_id, consultor_id)
select v.id, 'Cliente volume ' || v.n, 1 + v.n % 40, c.id, p.id
from v_clientes v
left join v_consultorias c on v.n <= 48000 and c.n = (v.n - 1) % 200 + 1
left join v_pessoas p on v.n <= 48000 and ((v.n - 1) / 200) % 16 < 15
  and p.n = (v.n - 1) % 200 + 1 + 200 * (((v.n - 1) / 200) % 16);

-- ── Check-ins ────────────────────────────────────────────────────────────────
-- 200.000 check-ins fechados no mês atual, cerca de 67 por consultor, sem sobreposição: o i-ésimo do
-- consultor começa em início do mês + i x passo e dura meio passo. O gatilho checkins_validar (o consultor
-- logado faz o próprio check-in, nada no futuro) fica desligado só nesta transação: aqui quem grava é o
-- sistema, em lote. As restrições da tabela (sobreposição, 24 h, descrição) continuam valendo.

alter table public.checkins disable trigger checkins_validar;

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
join v_clientes cl on cl.n = x.n + 3200 * (x.i % 15);

-- Histórico: 100.000 check-ins em cada um dos 5 meses anteriores (o gráfico "Horas por mês" lê 6 meses). O i-ésimo
-- do consultor no mês começa em início do mês + i x 9 h e dura 4 h (34 por consultor: cabem no mês, sem sobreposição).
insert into public.checkins (cliente_id, consultor_id, consultoria_id, inicio, fim, descricao)
select cl.id, p.id, c.id, m.de + x.i * interval '9 hours', m.de + x.i * interval '9 hours' + interval '4 hours', 'Histórico'
from generate_series(1, 5) atras
cross join generate_series(1, 100000) k
cross join lateral (select (k - 1) % 3000 + 1 as n, (k - 1) / 3000 as i) x
cross join lateral (
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - atras * interval '1 month') at time zone 'America/Sao_Paulo' as de
) m
join v_pessoas p on p.n = x.n
join v_consultorias c on c.n = (x.n - 1) % 200 + 1
join v_clientes cl on cl.n = x.n + 3200 * (x.i % 15);

alter table public.checkins enable trigger checkins_validar;

-- ── Tempos ───────────────────────────────────────────────────────────────────
-- O consultor n = 401 é o primeiro 'pessoa' (consultoria 1); o administrador n = 1 (consultoria 1).
insert into testes.fx select 'adm1', id from v_pessoas where n = 1;
insert into testes.fx select 'pessoa401', id from v_pessoas where n = 401;

select testes.como('central');
select diag('média medida: ' || testes.media_ms() || ' ms');
select is(public.painel_do_inicio() ->> 'recorte', 'tudo', 'a central recebe o recorte tudo');
select ok((public.painel_do_inicio() -> 'indicadores' ->> 'clientes_ativos')::int >= 50000,
  'a central conta os 50.000 clientes');
select ok(jsonb_array_length(public.painel_do_inicio() -> 'ranking') = 8, 'ranking limitado a 8');
select ok((select bool_and((e ->> 'realizado')::numeric > 0) from jsonb_array_elements(public.painel_do_inicio() -> 'horas_por_mes') e),
  'os 6 meses do gráfico têm horas (o volume cobre o histórico inteiro)');

-- Média de 5 execuções (o pgTAP descarta a mais rápida); janela "média +- folga" centrada em 0,75 x limite com
-- folga de 0,75 x limite: o limite como média, com 50% de tolerância.
select performs_within('select public.painel_do_inicio()', 375, 375, 5,
  'central (todas as consultorias, 3.000 consultores): painel_do_inicio() em até 500 ms na média (+50%)');
-- "Este ano" (12 meses até hoje): utilização de 3.000 consultores sobre os 700.000 check-ins do volume.
select diag('Este ano, média medida: ' || testes.media_ms_ano() || ' ms');
select is((public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje()) -> 'indicadores' ->> 'realizado')::numeric,
  (select round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) from public.checkins k
   join public.consultorias co on co.id = k.consultoria_id and co.arquivada_em is null
   where k.fim is not null and k.inicio >= testes.ano_de()::timestamp at time zone 'America/Sao_Paulo'),
  'Este ano: o realizado da central soma todos os check-ins do ano (meses inteiros pelo resumo, o mês atual direto)');
select performs_within('select public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje())', 750, 750, 5,
  'central, Este ano (3.000 consultores, 700.000 check-ins): painel_do_inicio(de, até) em até 1000 ms na média (+50%)');
reset role;

select testes.como('adm1');
select diag('média medida: ' || testes.media_ms() || ' ms');
select performs_within('select public.painel_do_inicio()', 112.5, 112.5, 5,
  'administrador (15 consultores, 250 clientes): painel_do_inicio() em até 150 ms na média (+50%)');
select diag('Este ano, média medida: ' || testes.media_ms_ano() || ' ms');
select performs_within('select public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje())', 225, 225, 5,
  'administrador, Este ano (15 consultores): painel_do_inicio(de, até) em até 300 ms na média (+50%)');
reset role;

select testes.como('pessoa401');
select diag('média medida: ' || testes.media_ms() || ' ms');
select performs_within('select public.painel_do_inicio()', 75, 75, 5,
  'consultor (15 clientes, 67 check-ins): painel_do_inicio() em até 100 ms na média (+50%)');
select diag('Este ano, média medida: ' || testes.media_ms_ano() || ' ms');
select performs_within('select public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje())', 225, 225, 5,
  'consultor, Este ano: painel_do_inicio(de, até) em até 300 ms na média (+50%)');
reset role;

select * from finish();
rollback;
