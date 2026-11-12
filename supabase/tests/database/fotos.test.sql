-- Meu perfil: foto das pessoas, logo das consultorias e preferências (tema). Quem pode mudar o quê. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
select testes.perfil('admin_a2', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_solta', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.time('time_a', 'A', 'gestor_a');
insert into public.time_membros (time_id, pessoa_id) values (testes.id('time_a'), testes.id('pessoa_a'));

create function testes.foto(p_nome text) returns text language sql stable as $$
  select testes.id(p_nome)::text || '/' || gen_random_uuid()::text || '.webp'
$$;

select has_column('public', 'perfis', 'foto', 'perfis tem a coluna foto');
select is((select public from storage.buckets where id = 'fotos'), true, 'bucket fotos existe e é público (as fotos aparecem por endereço)');

-- Quem pode mudar a foto de quem
select testes.como('pessoa_a');
select ok(private.posso_mudar_foto(testes.id('pessoa_a')), 'a pessoa muda a própria foto');
select ok(not private.posso_mudar_foto(testes.id('pessoa_solta')), 'a pessoa não muda a foto de outra');
reset role;
select testes.como('gestor_a');
select ok(private.posso_mudar_foto(testes.id('pessoa_a')), 'o gestor muda a foto de quem está no time dele');
select ok(not private.posso_mudar_foto(testes.id('pessoa_solta')), 'o gestor não muda a foto de quem não está nos times dele');
reset role;
select testes.como('admin_a');
select ok(private.posso_mudar_foto(testes.id('gestor_a')), 'o administrador muda a foto de gestores e pessoas');
select ok(not private.posso_mudar_foto(testes.id('admin_a2')), 'o administrador não muda a foto de outro administrador');
select ok(not private.posso_mudar_foto(testes.id('admin_b')), 'nem de outra consultoria');
reset role;
select testes.como('dono');
select ok(private.posso_mudar_foto(testes.id('admin_b')), 'o dono muda a foto dos administradores');
select ok(not private.posso_mudar_foto(testes.id('pessoa_a')), 'o dono não muda a foto das pessoas');
reset role;

-- Gravar: só a coluna foto, só de quem pode, e o arquivo tem de estar na pasta da própria pessoa
select testes.como('pessoa_a');
select lives_ok(format('update public.perfis set foto = %L where id = %L', testes.foto('pessoa_a'), testes.id('pessoa_a')), 'a pessoa grava a própria foto');
select lives_ok(format('update public.perfis set foto = %L where id = %L', testes.foto('pessoa_solta'), testes.id('pessoa_solta')), 'tenta gravar a foto de outra (não grava)');
select throws_ok(format('update public.perfis set nome = %L where id = %L', 'Outro Nome', testes.id('pessoa_a')), '42501', null, 'direto no banco, só a foto muda (o nome vai pela Edge Function)');
reset role;
select is((select foto from public.perfis where id = testes.id('pessoa_solta')), null, 'a foto da outra continua vazia');
select throws_ok(format('update public.perfis set foto = %L where id = %L', testes.foto('pessoa_solta'), testes.id('pessoa_a')), '23514', null, 'a foto tem de estar na pasta da própria pessoa');

-- Logo da consultoria: só o dono (menu Consultorias)
select has_column('public', 'consultorias', 'logo', 'consultorias tem a coluna logo');
select is((select public from storage.buckets where id = 'logos'), true, 'bucket logos existe e é público');
select testes.como('dono');
select ok(private.posso_mudar_logo(testes.id('A')), 'o dono muda a logo de uma consultoria');
select lives_ok(format('update public.consultorias set logo = %L where id = %L', testes.id('A')::text || '/' || gen_random_uuid()::text || '.webp', testes.id('A')), 'o dono grava a logo');
reset role;
select testes.como('admin_a');
select ok(not private.posso_mudar_logo(testes.id('A')), 'o administrador não muda a logo (é no menu Consultorias, do dono)');
reset role;
select throws_ok(format('update public.consultorias set logo = %L where id = %L', testes.id('B')::text || '/' || gen_random_uuid()::text || '.webp', testes.id('A')), '23514', null, 'a logo tem de estar na pasta da própria consultoria');

-- Preferências (tema): cada um só lê e grava as suas
select testes.como('pessoa_a');
select lives_ok(format('insert into public.preferencias (pessoa_id, tema) values (%L, %L)', testes.id('pessoa_a'), 'escuro'), 'a pessoa grava o próprio tema');
select throws_ok(format('insert into public.preferencias (pessoa_id, tema) values (%L, %L)', testes.id('pessoa_solta'), 'escuro'), '42501', null, 'não grava o tema de outra pessoa');
reset role;
insert into public.preferencias (pessoa_id, tema) values (testes.id('gestor_a'), 'claro');
select testes.como('pessoa_a');
select is((select count(*) from public.preferencias), 1::bigint, 'cada um só vê as próprias preferências');
reset role;
select throws_ok(format('insert into public.preferencias (pessoa_id, tema) values (%L, %L)', testes.id('admin_a'), 'roxo'), '23514', null, 'tema só sistema, claro ou escuro');

select * from finish();
rollback;
