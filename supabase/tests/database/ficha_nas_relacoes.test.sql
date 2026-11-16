-- Ficha do consultor fora das relações calculadas: consultor(clientes) e consultor_do_checkin(checkins) rodam como
-- dono do banco (security definer) para mostrar o nome a quem não enxerga a pessoa em perfis (o gestor sem times).
-- Elas devolvem só id, nome, foto e ativo: telefone, cidade, uf, cargo, data de entrada e e-mail não vazam por aí.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.usuario(p_nome text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
  return v;
end $$;

-- Cliente gravado direto (sem usuário logado). testes.como deixa o usuário nas configurações até o fim da
-- transação (reset role não limpa): limpa aqui.
create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- O que a relação devolveu, sem id, nome, foto e ativo e sem os campos nulos: precisa sair vazio.
create function testes.sobra(p public.perfis) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(to_jsonb(p) - array['id', 'nome', 'foto', 'ativo'])
$$;

-- Cenário: a consultora pessoa_a, com a ficha toda preenchida, atende c1 e fez o check-in k1. O gestor sem times
-- vê o cliente e o check-in, mas não a enxerga em perfis.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('gestor_sem', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
update public.perfis
set telefone = '(11) 99999-0000', cidade = 'Campinas', uf = 'SP', cargo = 'Analista', data_entrada = '2024-03-01'
where id = testes.id('pessoa_a');
select testes.cliente('c1', 'A', 'pessoa_a');
insert into testes.fx values ('k1', gen_random_uuid());

select testes.como('pessoa_a');
insert into public.checkins (id, cliente_id, inicio, fim, descricao)
values (testes.id('k1'), testes.id('c1'), now() - interval '3 hours', now() - interval '2 hours', 'Implantação');
reset role;

-- ── Gestor sem times ─────────────────────────────────────────────────────────

select testes.como('gestor_sem');
select is((select count(*) from public.perfis where id = testes.id('pessoa_a')), 0::bigint,
  'o gestor sem times não enxerga a consultora em perfis');

select is((select p.nome from public.clientes c, public.consultor(c) p where c.id = testes.id('c1')),
  'Pessoa pessoa_a', 'consultor(clientes) continua trazendo o nome');
select is((select array[p.telefone, p.cidade, p.uf, p.cargo, p.data_entrada::text, p.email]
    from public.clientes c, public.consultor(c) p where c.id = testes.id('c1')),
  array[null, null, null, null, null, null]::text[],
  'consultor(clientes) não traz telefone, cidade, uf, cargo, data de entrada nem e-mail');
select is((select p.id from public.clientes c, public.consultor(c) p where c.id = testes.id('c1')),
  testes.id('pessoa_a'), 'consultor(clientes) traz o id');
select is((select p.ativo from public.clientes c, public.consultor(c) p where c.id = testes.id('c1')),
  true, 'consultor(clientes) traz se está ativo');
select is((select testes.sobra(p) from public.clientes c, public.consultor(c) p where c.id = testes.id('c1')),
  '{}'::jsonb, 'consultor(clientes) só preenche id, nome, foto e ativo');

select is((select p.nome from public.checkins k, public.consultor_do_checkin(k) p where k.id = testes.id('k1')),
  'Pessoa pessoa_a', 'consultor_do_checkin continua trazendo o nome');
select is((select array[p.telefone, p.cidade, p.uf, p.cargo, p.data_entrada::text, p.email]
    from public.checkins k, public.consultor_do_checkin(k) p where k.id = testes.id('k1')),
  array[null, null, null, null, null, null]::text[],
  'consultor_do_checkin não traz telefone, cidade, uf, cargo, data de entrada nem e-mail');
select is((select testes.sobra(p) from public.checkins k, public.consultor_do_checkin(k) p where k.id = testes.id('k1')),
  '{}'::jsonb, 'consultor_do_checkin só preenche id, nome, foto e ativo');
reset role;

-- ── A regra de quem vê continua a mesma ──────────────────────────────────────

select testes.como('admin_b');
select is((select count(*) from public.clientes c, public.consultor(c) p
    where c.id = testes.id('c1')), 0::bigint, 'outra consultoria não vê o cliente nem o consultor');
-- Linha forjada com o id do cliente/check-in de outra consultoria: a função relê a guardada e não devolve nada.
select is((select count(*) from public.consultor(
    jsonb_populate_record(null::public.clientes, jsonb_build_object('id', testes.id('c1'))))), 0::bigint,
  'consultor(clientes) com a linha forjada não devolve ninguém a outra consultoria');
select is((select count(*) from public.consultor_do_checkin(
    jsonb_populate_record(null::public.checkins, jsonb_build_object('id', testes.id('k1'))))), 0::bigint,
  'consultor_do_checkin com a linha forjada não devolve ninguém a outra consultoria');
reset role;

-- A própria consultora também recebe só o básico pela relação (a ficha dela fica em perfis e em Meu perfil).
select testes.como('pessoa_a');
select is((select testes.sobra(p) from public.clientes c, public.consultor(c) p where c.id = testes.id('c1')),
  '{}'::jsonb, 'a própria consultora recebe só o básico por consultor(clientes)');
select is((select p.nome from public.checkins k, public.consultor_do_checkin(k) p where k.id = testes.id('k1')),
  'Pessoa pessoa_a', 'e vê o próprio nome no check-in');
reset role;

select * from finish();
rollback;
