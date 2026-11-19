-- Histórico do cliente com nomes: cada consultoria só vê os próprios nomes. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.usuario(p_nome text, p_confirmado boolean) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', case when p_confirmado then now() end,
    '{}', '{}', now(), now());
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

create function testes.perfil(p_nome text, p_papel text, p_consultoria text,
  p_trocar boolean default false, p_convite boolean default false, p_ativo boolean default true) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome, not p_convite);
  insert into public.perfis (id, consultoria_id, nome, email, papel, precisa_trocar_senha, convite_pendente, ativo)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel, p_trocar, p_convite, p_ativo);
  return v;
end $$;

create function testes.time(p_nome text, p_consultoria text, p_gestor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.times (consultoria_id, nome, gestor_id)
  values (testes.id(p_consultoria), p_nome, testes.id(p_gestor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Cliente gravado direto (sem usuário logado), já na consultoria e com o consultor, se vierem.
-- testes.como deixa o usuário nas configurações até o fim da transação (reset role não limpa): limpa aqui.
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

-- Cenário: a central cadastra, manda para A, o administrador de A escolhe o consultor, a central move para B.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
insert into testes.fx values ('cli', gen_random_uuid());

select testes.como('central');
insert into public.clientes (id, nome, horas_mes) values (testes.id('cli'), 'Cliente Histórico', 20);
update public.clientes set consultoria_id = testes.id('A') where id = testes.id('cli');
reset role;
select testes.como('admin_a');
update public.clientes set consultor_id = testes.id('pessoa_a') where id = testes.id('cli');
reset role;
-- Os eventos até aqui são anteriores à chegada em B.
update public.cliente_eventos set em = em - interval '1 hour' where cliente_id = testes.id('cli');
select testes.como('central');
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('cli');
reset role;

-- A central vê tudo, com os nomes
select testes.como('central');
select is((select count(*) from public.historico_do_cliente(testes.id('cli'))), 4::bigint,
  'central: cadastrado, enviado, consultor escolhido e movido');
select is((select de_consultoria from public.historico_do_cliente(testes.id('cli')) where tipo = 'movido'),
  'Consultoria A', 'central vê o nome da consultoria anterior');
select is((select de_consultor from public.historico_do_cliente(testes.id('cli')) where tipo = 'movido'),
  'Pessoa pessoa_a', 'central vê o nome do consultor anterior');
select is((select autor from public.historico_do_cliente(testes.id('cli')) where tipo = 'cadastrado'),
  'Pessoa central', 'central vê o nome do autor');
select is((select total from public.historico_do_cliente(testes.id('cli'), 2, 0) limit 1), 4::bigint,
  'o total vem junto, independente da página');
select is((select count(*) from public.historico_do_cliente(testes.id('cli'), 2, 3)), 1::bigint,
  'o deslocamento pula as linhas da página anterior');
reset role;

-- A consultoria nova (B) só vê o seu nome
select testes.como('gestor_b');
select is((select para_consultoria from public.historico_do_cliente(testes.id('cli')) where tipo = 'movido'),
  'Consultoria B', 'a consultoria nova vê o próprio nome');
select is((select de_consultoria from public.historico_do_cliente(testes.id('cli')) where tipo = 'movido'),
  null, 'a consultoria nova não vê o nome da anterior');
select is((select de_consultor from public.historico_do_cliente(testes.id('cli')) where tipo = 'movido'),
  null, 'a consultoria nova não vê o consultor anterior');
select is((select autor from public.historico_do_cliente(testes.id('cli')) where tipo = 'movido'),
  'Central', 'o autor da central aparece como Central');
reset role;

-- Período opcional (p_de inclusivo, p_ate exclusivo); os três eventos antigos têm 1 hora, o "movido" é de agora.
select testes.como('central');
select is((select count(*) from public.historico_do_cliente(testes.id('cli'), 15, 0, now() - interval '30 minutes', null)),
  1::bigint, 'p_de corta os eventos anteriores');
select is((select count(*) from public.historico_do_cliente(testes.id('cli'), 15, 0, null, now() - interval '30 minutes')),
  3::bigint, 'p_ate corta os eventos a partir dele');
select is((select total from public.historico_do_cliente(testes.id('cli'), 1, 0, null, now() - interval '30 minutes')),
  3::bigint, 'o total respeita o período');
select is((select count(*) from public.historico_do_cliente(testes.id('cli'), 15, 0, now() + interval '1 day', now() + interval '2 days')),
  0::bigint, 'período sem eventos devolve 0 linhas');
reset role;
select testes.como('gestor_b');
select is((select de_consultoria is null and para_consultoria = 'Consultoria B'
  from public.historico_do_cliente(testes.id('cli'), 15, 0, now() - interval '30 minutes', null) where tipo = 'movido'),
  true, 'com período, os nomes continuam mascarados');
reset role;

-- Quem não vê o cliente não recebe linhas
select testes.como('pessoa_a');
select is((select count(*) from public.historico_do_cliente(testes.id('cli'))), 0::bigint,
  'consultor de outra consultoria (sem acesso ao cliente) recebe 0 linhas');
reset role;

select * from finish();
rollback;
