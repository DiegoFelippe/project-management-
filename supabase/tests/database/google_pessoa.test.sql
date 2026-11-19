-- Google de cada pessoa: o token no Vault (gravar e ler só pela service_role; reconectar e renovar usam o mesmo
-- segredo e nada fica para trás no Vault) e os pedidos de "Conectar Google" (ninguém lê pelo navegador).
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria uuid) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, p_consultoria, 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

create function testes.segredo(p_nome text) returns uuid language sql stable as $$
  select segredo_id from public.google_pessoas where perfil_id = testes.id(p_nome)
$$;

create function testes.no_vault(p_segredo uuid) returns text language sql stable as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_segredo
$$;

-- Segredos do Vault desta bateria (o banco local tem os do Diego; conta só os das pessoas do teste).
create function testes.segredos_do_teste() returns bigint language sql stable as $$
  select count(*) from vault.secrets s
  where exists (select 1 from testes.fx f where s.name like 'google_pessoa_' || f.id::text || '_%')
$$;

create table testes.guardado (nome text primary key, valor uuid);

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Troca o segredo_id da conexão por um segredo novo, por fora das funções.
create function testes.trocar_segredo(p_nome text) returns void language plpgsql as $$
declare v uuid;
begin
  v := vault.create_secret('{"refresh_token":"r3"}', 'google_pessoa_' || testes.id(p_nome) || '_troca', 'teste');
  update public.google_pessoas set segredo_id = v where perfil_id = testes.id(p_nome);
end $$;

select testes.consultoria('G');
select testes.perfil('ana', 'pessoa', testes.id('G'));
select testes.perfil('bia', 'pessoa', testes.id('G'));

-- ── Pedidos de "Conectar Google" ─────────────────────────────────────────────
select has_table('public', 'google_estados', 'a tabela dos pedidos existe');
select ok((select relrowsecurity from pg_class where oid = 'public.google_estados'::regclass), 'RLS ligado em google_estados');
select ok(not has_table_privilege('authenticated', 'public.google_estados', 'select'), 'o navegador logado não lê os pedidos');
select ok(not has_table_privilege('authenticated', 'public.google_estados', 'insert'), 'nem cria pedido');
select ok(not has_table_privilege('anon', 'public.google_estados', 'select'), 'o anônimo também não');
select ok(has_table_privilege('service_role', 'public.google_estados', 'delete'), 'a Edge Function (service_role) gasta o pedido');
select throws_ok($$ insert into public.google_estados (estado, perfil_id, verificador) values ('curto', testes.id('ana'), repeat('v', 64)) $$,
  '23514', null, 'estado curto demais é recusado');
select lives_ok(format($$ insert into public.google_estados (estado, perfil_id, verificador) values (%L, %L, %L) $$,
  repeat('e', 43), testes.id('ana'), repeat('v', 64)), 'pedido válido entra');
select testes.como('ana');
select throws_ok($$ select count(*) from public.google_estados $$, '42501', null, 'nem a dona do pedido lê pelo navegador');
reset role;

-- ── Quem chama as funções do token ───────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'public.gravar_token_da_pessoa(uuid, text, text, text[])', 'execute'),
  'o navegador logado não grava token');
select ok(not has_function_privilege('authenticated', 'public.ler_token_da_pessoa(uuid)', 'execute'), 'nem lê token');
select ok(not has_function_privilege('anon', 'public.ler_token_da_pessoa(uuid)', 'execute'), 'o anônimo não lê token');
select ok(not has_function_privilege('authenticated', 'private.ler_token_da_pessoa(uuid)', 'execute'), 'nem pela função de private');
select ok(not has_function_privilege('authenticated', 'private.gravar_token_da_pessoa(uuid, text, text, text[])', 'execute'),
  'nem grava pela função de private');
select ok(has_function_privilege('service_role', 'public.gravar_token_da_pessoa(uuid, text, text, text[])', 'execute')
  and has_function_privilege('service_role', 'public.ler_token_da_pessoa(uuid)', 'execute'), 'a Edge Function grava e lê');

-- ── Conectar, renovar, reconectar ────────────────────────────────────────────
select ok(public.gravar_token_da_pessoa(testes.id('ana'), '{"refresh_token":"r1"}', 'Ana@Gmail.test',
  array['openid', 'email']), 'conectar cria a conexão');
select is((select email from public.google_pessoas where perfil_id = testes.id('ana')), 'ana@gmail.test', 'e-mail guardado em minúsculas');
select is(public.ler_token_da_pessoa(testes.id('ana')), '{"refresh_token":"r1"}', 'o token fica no Vault e volta igual');
select is(testes.no_vault(testes.segredo('ana')), '{"refresh_token":"r1"}', 'segredo_id aponta para ele');
insert into testes.guardado values ('ana_segredo', testes.segredo('ana'));
select is(testes.segredos_do_teste(), 1::bigint, 'um segredo no Vault');

-- renovar (sem e-mail): troca o token no mesmo segredo, mantém a conta e limpa o erro
update public.google_pessoas set erro = 'O Google não aceita mais esta conexão. Reconecte o Google.',
  conectado_em = now() - interval '1 day' where perfil_id = testes.id('ana');
select ok(public.gravar_token_da_pessoa(testes.id('ana'), '{"refresh_token":"r1","access_token":"a1"}', null, null), 'renovar grava');
select is(testes.segredo('ana'), (select valor from testes.guardado where nome = 'ana_segredo'), 'renovar usa o mesmo segredo');
select is(public.ler_token_da_pessoa(testes.id('ana')), '{"refresh_token":"r1","access_token":"a1"}', 'com o token novo');
select is((select email from public.google_pessoas where perfil_id = testes.id('ana')), 'ana@gmail.test', 'renovar mantém a conta');
select ok((select conectado_em < now() - interval '12 hours' from public.google_pessoas where perfil_id = testes.id('ana')),
  'renovar não mexe em quando conectou');
select is((select erro from public.google_pessoas where perfil_id = testes.id('ana')), null, 'renovar limpa o erro');

-- reconectar (com e-mail): mesmo segredo, conta e escopos novos; o Vault não ganha segredo a mais
select ok(public.gravar_token_da_pessoa(testes.id('ana'), '{"refresh_token":"r2"}', 'outra@gmail.test',
  array['openid', 'email', 'https://www.googleapis.com/auth/calendar.events']), 'reconectar grava');
select is(testes.segredo('ana'), (select valor from testes.guardado where nome = 'ana_segredo'), 'reconectar usa o mesmo segredo');
select is(testes.segredos_do_teste(), 1::bigint, 'o Vault continua com um segredo só (nada vazou)');
select is((select email || ' ' || array_length(escopos, 1) from public.google_pessoas where perfil_id = testes.id('ana')),
  'outra@gmail.test 3', 'conta e escopos novos');
select ok((select conectado_em > now() - interval '1 minute' from public.google_pessoas where perfil_id = testes.id('ana')),
  'reconectar atualiza quando conectou');

-- renovar quem já desconectou não recria nada
select ok(not public.gravar_token_da_pessoa(testes.id('bia'), '{"refresh_token":"x"}', null, null),
  'renovar sem conexão devolve false');
select is((select count(*) from public.google_pessoas where perfil_id = testes.id('bia')) + testes.segredos_do_teste(), 1::bigint,
  'e não cria conexão nem segredo');

-- trocar o segredo_id por fora também apaga o antigo (defesa: nenhum caminho deixa segredo para trás)
select testes.trocar_segredo('ana');
select is(testes.no_vault((select valor from testes.guardado where nome = 'ana_segredo')), null, 'trocar o segredo_id apaga o antigo do Vault');
select is(testes.segredos_do_teste(), 1::bigint, 'e fica só o novo');

-- desconectar (apagar a linha) apaga o segredo
delete from public.google_pessoas where perfil_id = testes.id('ana');
select is(testes.segredos_do_teste(), 0::bigint, 'desconectar apaga o token do Vault');

-- o navegador não chama as funções do token
select testes.como('bia');
select throws_ok(format($$ select public.ler_token_da_pessoa(%L) $$, testes.id('bia')), '42501', null,
  'logado, ler o token é recusado');

select * from finish();
rollback;
