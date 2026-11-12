-- Integrações: quem vê, o segredo fica no Vault e só a Edge Function (service_role) grava. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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
select testes.perfil('admin_b', 'admin', 'B');

-- A Edge Function grava pelas funções (aqui o teste roda como dono do banco, como a service_role faria)
select ok(public.integracao_salvar(testes.id('A'), 'ia', '{"provedor":"anthropic","modelo":"claude-opus-5-5"}', 'chave-secreta-1', testes.id('admin_a')) is not null, 'salva a integração com o segredo');
select is(public.integracao_segredo((select id from public.integracoes where consultoria_id = testes.id('A') and tipo = 'ia')), 'chave-secreta-1', 'o segredo fica no Vault e a função lê');
select ok(public.integracao_salvar(testes.id('A'), 'ia', '{"provedor":"anthropic","modelo":"claude-sonnet-5-5"}', null, testes.id('admin_a')) is not null, 'editar sem segredo mantém o atual');
select is(public.integracao_segredo((select id from public.integracoes where consultoria_id = testes.id('A') and tipo = 'ia')), 'chave-secreta-1', 'o segredo continua o mesmo');
select is((select config->>'modelo' from public.integracoes where consultoria_id = testes.id('A') and tipo = 'ia'), 'claude-sonnet-5-5', 'a configuração mudou');
select is((select count(*) from public.integracoes where consultoria_id = testes.id('A')), 1::bigint, 'uma conexão por tipo por consultoria');
select public.integracao_salvar(testes.id('B'), 'smtp', '{"host":"smtp.b.test"}', 'senha-b', testes.id('admin_b'));

-- Quem vê
select testes.como('admin_a');
select is((select count(*) from public.integracoes), 1::bigint, 'o administrador vê só as da consultoria dele');
select throws_ok('select segredo_id from public.integracoes', '42501', null, 'o navegador não lê nem o id do segredo');
select throws_ok($$ select public.integracao_segredo(id) from public.integracoes $$, '42501', null, 'o navegador não chama a função que lê o segredo');
select throws_ok(format('select public.integracao_salvar(%L, %L, %L, %L, %L)', testes.id('A'), 'smtp', '{}', 'x', testes.id('admin_a')), '42501', null, 'nem a que salva');
select throws_ok(format('insert into public.integracoes (consultoria_id, tipo) values (%L, %L)', testes.id('A'), 'google'), '42501', null, 'gravar direto na tabela não pode');
select throws_ok($$ select count(*) from vault.decrypted_secrets $$, '42501', null, 'o Vault não é visível');
reset role;
select testes.como('gestor_a');
select is((select count(*) from public.integracoes), 0::bigint, 'o gestor não vê integrações');
reset role;
select testes.como('dono');
select is((select count(*) from public.integracoes), 2::bigint, 'o dono vê as de todas as consultorias');
reset role;

-- Desconectar apaga a linha e o segredo
select lives_ok(format('select public.integracao_desconectar(%L)', (select id from public.integracoes where consultoria_id = testes.id('B'))), 'desconecta');
select is((select count(*) from public.integracoes where consultoria_id = testes.id('B')), 0::bigint, 'a integração sumiu');
select is((select count(*) from vault.secrets where name like 'integracao_smtp_' || testes.id('B')::text || '%'), 0::bigint, 'o segredo saiu do Vault junto');

select * from finish();
rollback;
