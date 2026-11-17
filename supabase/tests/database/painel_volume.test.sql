-- Volume do painel do Início: 200 consultorias, 3.000 consultores, 50.000 clientes e 200.000 check-ins fechados no mês
-- atual mais 2.300.000 nos 23 meses anteriores (100.000 por mês: o período vai até 2 anos), criados aqui e desfeitos
-- no fim (rollback: nada fica no banco). Média de 5 execuções, com 50% de folga:
-- - Mês: 500 ms para a central (tudo), 150 ms para uma consultoria e 100 ms para um consultor;
-- - "Este ano" no pior caso (12 meses até hoje, o "Este ano" de dezembro) e o Personalizado mais longo (quase 2 anos,
--   do meio do mês mais antigo até hoje, com as duas bordas cheias): 600 ms para a central, 150 ms para a consultoria
--   e 100 ms para o consultor (os meses inteiros vêm dos resumos por mês; só as bordas leem check-ins).
--   Roda com: npm run test:db
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

-- Os dois resumos, como o gatilho os deixaria (só os check-ins do volume; os de antes já estão neles).
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

-- Estatísticas do volume, como o autovacuum deixaria no banco de verdade. Sem isso o planejador usa as do banco local
-- (quase vazio, e mudando conforme os outros testes): na mesma carga, o consultor já mediu de 5 ms a 22 s no "Este
-- ano", escolhendo o índice por data em vez do índice do cliente ou do consultor. O ANALYZE vê as linhas desta
-- transação; as estatísticas voltam com o rollback.
analyze public.checkins, public.clientes, public.perfis, public.consultorias, public.ausencias,
  public.checkins_horas_mes, private.checkins_horas_consultor_mes;

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
-- Períodos: utilização de 3.000 consultores. Os meses inteiros vêm dos resumos; só o mês atual (borda) lê check-ins.
select diag('Este ano, média medida: ' || testes.media_ms_periodo(testes.ano_de(), testes.hoje()) || ' ms');
select diag('2 anos, média medida: ' || testes.media_ms_periodo(testes.dois_anos_de(), testes.hoje()) || ' ms');
select is((public.painel_do_inicio(p_de => testes.ano_de(), p_ate => testes.hoje()) -> 'indicadores' ->> 'realizado')::numeric,
  (select round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) from public.checkins k
   join public.consultorias co on co.id = k.consultoria_id and co.arquivada_em is null
   where k.fim is not null and k.inicio >= testes.ano_de()::timestamp at time zone 'America/Sao_Paulo'),
  'Este ano: o realizado da central soma todos os check-ins do ano (meses inteiros pelo resumo, o mês atual direto)');
select ok((select bool_and((e ->> 'ocupacao')::numeric = round(round(f.segundos / 3600, 1) / (e ->> 'capacidade')::numeric, 4))
    from jsonb_array_elements(public.painel_do_inicio(p_de => testes.dois_anos_de(), p_ate => testes.hoje()) -> 'extremos' -> 'folga') e
    cross join lateral (
      select coalesce(sum(extract(epoch from k.fim - k.inicio)), 0) as segundos from public.checkins k
      where k.fim is not null and k.consultor_id = (e ->> 'id')::uuid
        and k.inicio >= testes.dois_anos_de()::timestamp at time zone 'America/Sao_Paulo') f),
  '2 anos: a utilização de cada consultor nos extremos = soma direta dos check-ins / capacidade (resumo por consultor + borda)');
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
reset role;

select * from finish();
rollback;
