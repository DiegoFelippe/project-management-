-- Volume: 200 consultorias, 3.000 consultores, 50.000 clientes e 200.000 check-ins fechados no mês, criados
-- aqui e desfeitos no fim (rollback: nada fica no banco). As janelas de sugestão precisam responder em até
-- 200 ms e a lista da central em até 50 ms. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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

alter table public.checkins enable trigger checkins_validar;

-- ── Tempos ───────────────────────────────────────────────────────────────────

select testes.como('central');

select is((select f.total from public.consultores_por_ocupacao(testes.id('v1')) f limit 1), 15::bigint,
  'a consultoria tem 15 consultores');
select is((select count(*) from public.consultores_por_ocupacao(null, null, 1000)), 50::bigint,
  'limite acima de 50 vira 50');
select ok((select f.total >= 200 from public.consultorias_por_ocupacao() f limit 1),
  'as 200 consultorias aparecem para a central');

select performs_ok('select * from public.consultorias_por_ocupacao()', 200,
  'mandar para uma consultoria: consultorias_por_ocupacao() em até 200 ms');
select performs_ok(format('select * from public.consultores_por_ocupacao(%L)', testes.id('v1')), 200,
  'escolher o consultor: consultores_por_ocupacao(<uma consultoria>) em até 200 ms');
select performs_ok('select * from public.consultores_por_ocupacao(null, null, 15)', 200,
  'Capacidade da central (todas as consultorias): consultores_por_ocupacao(null) em até 200 ms');
select performs_ok($$select id, nome, horas_mes from public.clientes
    where not arquivado and consultoria_id is null order by nome, id limit 15$$, 50,
  'lista da central (a distribuir) em até 50 ms');
reset role;

select * from finish();
rollback;
