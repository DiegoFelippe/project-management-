-- Regras de acesso: uma consultoria não vê a outra, cada papel vê e mexe só no que é dele,
-- e a senha provisória bloqueia tudo até ser trocada. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
  p_trocar boolean default false, p_convite boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome, not p_convite);
  insert into public.perfis (id, consultoria_id, nome, email, papel, precisa_trocar_senha, convite_pendente)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel, p_trocar, p_convite);
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

-- Cenário: consultorias A e B, o dono acima de todas.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('dono', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a1', 'gestor', 'A');
select testes.perfil('gestor_a2', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a_prov', 'pessoa', 'A', p_trocar => true);
select testes.perfil('pessoa_a_conv', 'pessoa', 'A', p_convite => true);
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.time('time_a1', 'A', 'gestor_a1');
select testes.time('time_a2', 'A', 'gestor_a2');
select testes.time('time_b1', 'B', 'admin_b');
insert into public.time_membros (time_id, pessoa_id) values
  (testes.id('time_a1'), testes.id('pessoa_a')),
  (testes.id('time_b1'), testes.id('pessoa_b'));

-- Uma consultoria não vê a outra
select testes.como('admin_b');
select is((select count(*) from public.consultorias where id = testes.id('A')), 0::bigint, 'admin de B não vê a consultoria A');
select is((select count(*) from public.times where consultoria_id = testes.id('A')), 0::bigint, 'admin de B não vê times de A');
select is((select count(*) from public.perfis where consultoria_id = testes.id('A')), 0::bigint, 'admin de B não vê pessoas de A');
reset role;

-- Administrador vê a consultoria inteira
select testes.como('admin_a');
select is((select count(*) from public.times), 2::bigint, 'admin de A vê os 2 times de A');
select is((select count(*) from public.perfis), 6::bigint, 'admin de A vê as 6 pessoas de A');
reset role;

-- Gestor só vê o time dele e as pessoas dele
select testes.como('gestor_a1');
select is((select count(*) from public.times), 1::bigint, 'gestor vê só o time dele');
select is((select count(*) from public.perfis), 2::bigint, 'gestor vê ele e o membro do time dele');
reset role;

-- Pessoa vê os próprios times
select testes.como('pessoa_a');
select is((select count(*) from public.times), 1::bigint, 'pessoa vê o time em que está');
select is((select count(*) from public.times where id = testes.id('time_a2')), 0::bigint, 'pessoa não vê time de que não participa');
reset role;

-- Senha provisória bloqueia tudo menos o próprio perfil
select testes.como('pessoa_a_prov');
select is((select count(*) from public.perfis), 1::bigint, 'com senha provisória vê só o próprio perfil');
select is((select count(*) from public.times), 0::bigint, 'com senha provisória não vê times');
select is((select count(*) from public.consultorias), 0::bigint, 'com senha provisória não vê a consultoria');
reset role;

-- Dono vê tudo, mas só olha
select testes.como('dono');
select is((select count(*) from public.consultorias where id in (testes.id('A'), testes.id('B'))), 2::bigint, 'dono vê todas as consultorias');
select is((select count(*) from public.times where consultoria_id in (testes.id('A'), testes.id('B'))), 3::bigint, 'dono vê todos os times');
select throws_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Do dono', testes.id('gestor_a1')) $$,
  '42501', null, 'dono não cria time dentro de uma consultoria');
reset role;

-- Gestor cria e mexe só no que é dele
select testes.como('gestor_a1');
select lives_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Novo do g1', testes.id('gestor_a1')) $$,
  'gestor cria time com ele mesmo de gestor');
select lives_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Com retorno', testes.id('gestor_a1')) returning id $$,
  'gestor cria time e recebe o id de volta (como a tela faz)');
select throws_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Para o g2', testes.id('gestor_a2')) $$,
  '42501', null, 'gestor não cria time para outro gestor');
select throws_ok(
  $$ insert into public.time_membros (time_id, pessoa_id) values (testes.id('time_a2'), testes.id('pessoa_a')) $$,
  '42501', null, 'gestor não coloca gente no time de outro gestor');
reset role;

-- Administrador cria times para os gestores da consultoria dele
select testes.como('admin_a');
select lives_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Do g2', testes.id('gestor_a2')) $$,
  'admin cria time para um gestor');
select lives_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Admin com retorno', testes.id('gestor_a2')) returning id $$,
  'admin cria time e recebe o id de volta');
select throws_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Da pessoa', testes.id('pessoa_a')) $$,
  'P0001', null, 'gestor do time precisa ser gestor ou admin');
select throws_ok(
  $$ insert into public.time_membros (time_id, pessoa_id) values (testes.id('time_a1'), testes.id('pessoa_b')) $$,
  'P0001', null, 'não entra pessoa de outra consultoria');
select throws_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Do g2', testes.id('gestor_a1')) $$,
  '23505', null, 'nome de time não se repete na mesma consultoria');
reset role;

select testes.como('admin_b');
select lives_ok(
  $$ insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('B'), 'Do g2', testes.id('admin_b')) $$,
  'o mesmo nome de time vale em outra consultoria');
reset role;

-- Gestor tira gente do time dele
select testes.como('gestor_a1');
select lives_ok(
  $$ delete from public.time_membros where time_id = testes.id('time_a1') and pessoa_id = testes.id('pessoa_a') $$,
  'gestor tira pessoa do time dele');
reset role;
select is((select count(*) from public.time_membros where time_id = testes.id('time_a1')), 0::bigint, 'a pessoa saiu mesmo do time');

-- Sem login não se lê nada
set local role anon;
select throws_ok($$ select * from public.perfis $$, '42501', null, 'sem login não lê perfis');
reset role;

-- Trocar a senha e aceitar o convite liberam o acesso
update auth.users set encrypted_password = 'outro-hash' where id = testes.id('pessoa_a_prov');
select is((select precisa_trocar_senha from public.perfis where id = testes.id('pessoa_a_prov')), false, 'trocar a senha libera o acesso');
update auth.users set email_confirmed_at = now() where id = testes.id('pessoa_a_conv');
select is((select convite_pendente from public.perfis where id = testes.id('pessoa_a_conv')), false, 'aceitar o convite tira o pendente');

select * from finish();
rollback;
