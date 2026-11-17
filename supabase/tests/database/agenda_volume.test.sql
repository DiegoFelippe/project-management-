-- Volume da agenda: 200 consultorias, 3.000 consultores e 50.000 eventos (com 40.000 participantes), criados aqui e
-- desfeitos no fim (rollback: nada fica no banco). A leitura de um período (uma semana, como a tela pede, com os
-- participantes embutidos) e os indicadores precisam responder em até 150 ms para a central, 100 ms para uma
-- consultoria e 75 ms para um consultor (média de 5 execuções, com 50% de folga). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

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

-- A consulta da tela: eventos que tocam a semana, com os participantes (como o PostgREST monta o embutido).
create function testes.semana() returns bigint language sql stable as $$
  select count(*) from (
    select e.id, (select count(*) from public.agenda_participantes p where p.evento_id = e.id) as convidados
    from public.agenda_eventos e
    where e.inicio < timestamptz '2026-11-15 00:00-03' and e.fim > timestamptz '2026-11-08 00:00-03'
    order by e.inicio
  ) t
$$;
grant execute on function testes.semana() to authenticated;

create function testes.media_ms() returns numeric language plpgsql as $$
declare t0 timestamptz; i int;
begin
  t0 := clock_timestamp();
  for i in 1..5 loop perform testes.semana(); perform public.indicadores_da_agenda(date '2026-11-10'); end loop;
  return round(extract(epoch from clock_timestamp() - t0) * 1000 / 5, 1);
end $$;
grant execute on function testes.media_ms() to authenticated;

select set_config('request.jwt.claims', '', true);

create temp table v_consultorias (n int primary key, id uuid not null default gen_random_uuid());
insert into v_consultorias (n) select generate_series(1, 200);
insert into public.consultorias (id, nome) select id, 'Volume agenda ' || n from v_consultorias;

create temp table v_pessoas (n int primary key, id uuid not null default gen_random_uuid());
insert into v_pessoas (n) select generate_series(0, 3000);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'agvolume' || n || '@volume.test', 'hash-inicial', now(), '{}', '{}', now(), now()
from v_pessoas;

-- n = 0 é a central; 1 a 200 administradores (um por consultoria); o resto 'pessoa'. Consultor n é da
-- consultoria (n - 1) % 200 + 1.
insert into public.perfis (id, consultoria_id, nome, email, papel)
select p.id, c.id, 'Consultor volume ' || p.n, 'agvolume' || p.n || '@volume.test',
  case when p.n = 0 then 'central' when p.n <= 200 then 'admin' else 'pessoa' end
from v_pessoas p
left join v_consultorias c on p.n > 0 and c.n = (p.n - 1) % 200 + 1;
insert into testes.fx select 'central', id from v_pessoas where n = 0;
insert into testes.fx select 'adm1', id from v_pessoas where n = 1;
insert into testes.fx select 'pessoa401', id from v_pessoas where n = 401;

-- 50.000 eventos entre 1º/out e 31/dez de 2026 (a semana medida tem cerca de 1/9 deles), de 1 h, dos 3.000
-- consultores; metade com Meet, 5% aguardando, 2% com pasta.
create temp table v_eventos (n int primary key, id uuid not null default gen_random_uuid());
insert into v_eventos (n) select generate_series(1, 50000);

insert into public.agenda_eventos (id, consultoria_id, consultor_id, titulo, inicio, fim, com_meet, reuniao, pasta_id)
select v.id, c.id, p.id, 'Evento volume ' || v.n,
  timestamptz '2026-10-01 08:00-03' + ((v.n * 7919) % 92) * interval '1 day' + (v.n % 10) * interval '1 hour',
  timestamptz '2026-10-01 09:00-03' + ((v.n * 7919) % 92) * interval '1 day' + (v.n % 10) * interval '1 hour',
  v.n % 2 = 0, case when v.n % 20 = 0 then 'aguardando' else 'agendada' end, null
from v_eventos v
join v_pessoas p on p.n = (v.n - 1) % 3000 + 1
join v_consultorias c on c.n = (p.n - 1) % 200 + 1;

-- 40.000 participantes: o convidado de dentro é um consultor da mesma consultoria; o de fora, um e-mail.
insert into public.agenda_participantes (evento_id, perfil_id)
select v.id, q.id
from v_eventos v
join v_pessoas p on p.n = (v.n - 1) % 3000 + 1
join v_pessoas q on q.n = (p.n - 1 + 200 * (1 + v.n % 5)) % 3000 + 1
where v.n <= 25000 and q.id <> p.id;
insert into public.agenda_participantes (evento_id, email)
select v.id, 'fora' || v.n || '@exemplo.com' from v_eventos v where v.n > 25000 and v.n <= 40000;

analyze public.agenda_eventos;
analyze public.agenda_participantes;

select testes.como('central');
select diag('central, média medida: ' || testes.media_ms() || ' ms');
select ok(testes.semana() > 1000, 'a central lê a semana com milhares de eventos');
select performs_within('select testes.semana(), public.indicadores_da_agenda(date ''2026-11-10'')', 112.5, 112.5, 5,
  'central (50.000 eventos): a semana e os indicadores em até 150 ms na média (+50%)');
reset role;

select testes.como('adm1');
select diag('administrador, média medida: ' || testes.media_ms() || ' ms');
select ok(testes.semana() > 0, 'o administrador lê a semana da consultoria');
select performs_within('select testes.semana(), public.indicadores_da_agenda(date ''2026-11-10'')', 75, 75, 5,
  'administrador (15 consultores): a semana e os indicadores em até 100 ms na média (+50%)');
reset role;

select testes.como('pessoa401');
select diag('consultor, média medida: ' || testes.media_ms() || ' ms');
select performs_within('select testes.semana(), public.indicadores_da_agenda(date ''2026-11-10'')', 56.25, 56.25, 5,
  'consultor (17 eventos): a semana e os indicadores em até 75 ms na média (+50%)');
reset role;

select * from finish();
rollback;
