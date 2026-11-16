-- Papel central: vê todas as consultorias; o dono tem os mesmos poderes. Roda com: npm run test:db
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
select testes.consultoria('B');
select testes.perfil('dono', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.time('time_a', 'A', 'gestor_a');
insert into public.time_membros (time_id, pessoa_id) values (testes.id('time_a'), testes.id('pessoa_a'));

-- A central não pertence a consultoria nenhuma
select throws_ok($$select testes.perfil('central_x', 'central', 'A')$$, '23514', null,
  'perfil central com consultoria é recusado');
select lives_ok($$select testes.perfil('central', 'central', null)$$,
  'perfil central sem consultoria é aceito');

-- Como central
select testes.como('central');
select is((select count(*) from public.consultorias where id in (select id from testes.fx)), 2::bigint, 'central vê todas as consultorias');
select is((select count(*) from public.perfis where id in (select id from testes.fx)), 6::bigint, 'central vê todos os perfis');
select is((select count(*) from public.times where id in (select id from testes.fx)), 1::bigint, 'central vê os times');
select is((select count(*) from public.time_membros where time_id = testes.id('time_a')), 1::bigint, 'central vê os membros dos times');
select is(private.sou_central(), true, 'central: sou_central é verdadeiro');
select is(private.sou_dono(), false, 'central: sou_dono é falso');
select is(private.posso_mudar_logo(testes.id('A')), true, 'central muda o logo de uma consultoria');
select is(private.posso_mudar_foto(testes.id('admin_a')), true, 'central muda a foto do administrador');
select is(private.posso_mudar_foto(testes.id('pessoa_a')), false, 'central não muda a foto de uma pessoa');
reset role;

-- Como dono
select testes.como('dono');
select is(private.sou_central(), true, 'dono também tem os poderes da central');
reset role;

-- Como admin da consultoria A
select testes.como('admin_a');
select is(private.sou_central(), false, 'admin: sou_central é falso');
select is((select count(*) from public.consultorias), 1::bigint, 'admin continua vendo só a própria consultoria');
reset role;

-- Central desativada não vê nada
update public.perfis set ativo = false where id = testes.id('central');
select testes.como('central');
select is((select count(*) from public.consultorias), 0::bigint, 'central desativada não vê consultorias');
reset role;

select * from finish();
rollback;
