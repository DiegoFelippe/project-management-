-- CRUD completo: desativar, arquivar, editar e apagar times. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Cenário
select testes.consultoria('A');
select testes.consultoria('C');
update public.consultorias set nome = 'Consultoria Arquivada Teste', arquivada_em = now() where id = testes.id('C');
select testes.perfil('dono', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a1', 'gestor', 'A');
select testes.perfil('gestor_a2', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_inativa', 'pessoa', 'A', p_ativo => false);
select testes.perfil('admin_c', 'admin', 'C');
select testes.time('time_a1', 'A', 'gestor_a1');
select testes.time('time_a3', 'A', 'gestor_a2');
insert into public.time_membros (time_id, pessoa_id) values
  (testes.id('time_a1'), testes.id('pessoa_a')), (testes.id('time_a1'), testes.id('pessoa_inativa'));

-- Desativado e consultoria arquivada não veem nada
select testes.como('pessoa_inativa');
select is((select count(*) from public.times), 0::bigint, 'pessoa desativada não vê times');
reset role;
select testes.como('admin_c');
select is((select count(*) from public.times), 0::bigint, 'consultoria arquivada: admin não vê times');
select is((select count(*) from public.consultorias), 0::bigint, 'consultoria arquivada: admin não vê a consultoria');
reset role;
select testes.como('dono');
select is((select count(*) from public.consultorias where id = testes.id('C')), 1::bigint, 'dono vê a consultoria arquivada');
reset role;

-- Editar time
select testes.como('gestor_a1');
select lives_ok($$ update public.times set nome = 'Renomeado', descricao = 'Nova' where id = testes.id('time_a1') $$, 'gestor edita o time dele');
select throws_ok($$ update public.times set gestor_id = testes.id('gestor_a2') where id = testes.id('time_a1') $$, 'P0001', null, 'gestor não troca o gestor');
select lives_ok($$ delete from public.times where id = testes.id('time_a3') $$, 'gestor tenta apagar time de outro (não apaga)');
reset role;
select is((select nome from public.times where id = testes.id('time_a1')), 'Renomeado', 'o nome mudou');
select is((select count(*) from public.times where id = testes.id('time_a3')), 1::bigint, 'o time do outro gestor continua');

select testes.como('pessoa_a');
select lives_ok($$ update public.times set nome = 'Da pessoa' where id = testes.id('time_a1') $$, 'pessoa tenta editar (não edita)');
reset role;
select is((select nome from public.times where id = testes.id('time_a1')), 'Renomeado', 'pessoa não editou o time');

select testes.como('admin_a');
select lives_ok($$ update public.times set gestor_id = testes.id('gestor_a2') where id = testes.id('time_a1') $$, 'admin troca o gestor');
select throws_ok($$ update public.times set consultoria_id = testes.id('C') where id = testes.id('time_a1') $$, '42501', null, 'ninguém muda a consultoria do time');
reset role;

-- Gestor com times não é desativado nem rebaixado; nome de consultoria não se repete
select throws_ok($$ update public.perfis set ativo = false where id = testes.id('gestor_a2') $$, 'P0001', null, 'gestor com times não é desativado');
select throws_ok($$ insert into public.consultorias (nome) values ('  CONSULTORIA a ') $$, '23505', null, 'nome de consultoria não se repete');

select * from finish();
rollback;
