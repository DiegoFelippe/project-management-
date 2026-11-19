-- Verificação em duas etapas: quem tem o app autenticador ativo (fator verificado) ou tem a verificação exigida
-- (perfis.exige_2fa) só usa o banco com a sessão confirmada pelo código (aal2). Sem 2FA, nada muda para ninguém.
-- Token com session_id: a sessão precisa existir (o Zerar e o Sair encerram as sessões) e, para quem precisa do
-- código, ser aal2 também na tabela de sessões do Auth.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

create schema testes;
grant usage on schema testes to authenticated, anon, service_role;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon, service_role;
create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;
create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;
create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
  return v;
end $$;
-- Fator do app autenticador (o segredo de verdade fica no Auth; aqui só importa existir e a situação).
create function testes.fator(p_nome text, p_situacao text, p_desde timestamptz default now()) returns void
language plpgsql as $$
begin
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  values (gen_random_uuid(), testes.id(p_nome), '', 'totp', p_situacao::auth.factor_status, p_desde, p_desde, 'SEGREDO');
end $$;
-- Entra como a pessoa; p_aal null = token sem o campo aal (como nos outros testes).
create function testes.como(p_nome text, p_aal text default null) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated')
      || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text, true);
end $$;

-- Sessão do Auth (o token de verdade traz o session_id dela).
create function testes.sessao(p_nome text, p_aal text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at, aal)
  values (v, testes.id(p_nome), now(), now(), p_aal::auth.aal_level);
  return v;
end $$;
-- Entra como a pessoa com um token que traz o session_id (p_sessao texto: '' testa o campo vazio).
create function testes.como_na_sessao(p_nome text, p_aal text, p_sessao text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', testes.id(p_nome), 'role', 'authenticated', 'aal', p_aal, 'session_id', p_sessao)::text, true);
end $$;

-- Cenário: consultoria A com admin, gestor e pessoas; B separada.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_livre', 'pessoa', 'A');
select testes.perfil('pessoa_exigida', 'pessoa', 'A');
select testes.perfil('pessoa_com_app', 'pessoa', 'A');
select testes.perfil('pessoa_pela_metade', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
insert into public.times (consultoria_id, nome, gestor_id) values (testes.id('A'), 'Time A', testes.id('gestor_a'));
insert into public.time_membros (time_id, pessoa_id)
  select t.id, p.id from public.times t, public.perfis p
  where t.consultoria_id = testes.id('A') and p.id in (testes.id('pessoa_livre'), testes.id('pessoa_exigida'), testes.id('pessoa_com_app'));
update public.perfis set exige_2fa = true where id = testes.id('pessoa_exigida');
select testes.fator('pessoa_com_app', 'verified', '2026-11-10 12:00:00-03');
select testes.fator('pessoa_pela_metade', 'unverified');

-- A coluna
select has_column('public', 'perfis', 'exige_2fa', 'perfis tem a coluna exige_2fa');
select col_not_null('public', 'perfis', 'exige_2fa', 'exige_2fa não aceita nulo');
select col_default_is('public', 'perfis', 'exige_2fa', 'false', 'exige_2fa começa desligada');

-- Sem 2FA nem exigência: nada muda, com ou sem o aal no token
select testes.como('pessoa_livre');
select ok(private.liberado(), 'sem 2FA e sem aal no token: liberado');
reset role;
select testes.como('pessoa_livre', 'aal1');
select ok(private.liberado(), 'sem 2FA, sessão aal1: liberado');
select is((select count(*) from public.times), 1::bigint, 'sem 2FA, sessão aal1: vê o time');
select is((select count(*) from public.consultorias), 1::bigint, 'sem 2FA, sessão aal1: vê a consultoria');
reset role;
select testes.como('admin_a', 'aal1');
select is((select count(*) from public.perfis where consultoria_id = testes.id('A')), 6::bigint, 'admin sem 2FA (aal1) vê as 6 pessoas de A');
reset role;

-- Exigida e sessão aal1: só o próprio perfil (para a tela saber que falta configurar)
select testes.como('pessoa_exigida', 'aal1');
select ok(not private.liberado(), 'exigida, sessão aal1: não liberado');
select is((select count(*) from public.times), 0::bigint, 'exigida, sessão aal1: não vê times');
select is((select count(*) from public.consultorias), 0::bigint, 'exigida, sessão aal1: não vê a consultoria');
select is((select count(*) from public.perfis), 1::bigint, 'exigida, sessão aal1: vê só o próprio perfil');
select is((select exige_2fa from public.perfis where id = testes.id('pessoa_exigida')), true, 'exigida, sessão aal1: lê que a verificação é exigida');
select throws_ok($$ select public.atualizar_meu_contato('11 9999-0000', 'Santos', 'SP') $$,
  'P0001', 'sem_permissao', 'exigida, sessão aal1: não grava nem o próprio contato');
reset role;
select testes.como('pessoa_exigida');
select ok(not private.liberado(), 'exigida, token sem aal: vale como aal1 (não liberado)');
reset role;

-- Exigida e sessão aal2: tudo volta
select testes.como('pessoa_exigida', 'aal2');
select ok(private.liberado(), 'exigida, sessão aal2: liberado');
select is((select count(*) from public.times), 1::bigint, 'exigida, sessão aal2: vê o time');
select is((select count(*) from public.consultorias), 1::bigint, 'exigida, sessão aal2: vê a consultoria');
select lives_ok($$ select public.atualizar_meu_contato('11 9999-0000', 'Santos', 'SP') $$, 'exigida, sessão aal2: grava o próprio contato');
reset role;

-- App autenticador ativo (sem exigência): a sessão também precisa do código
select testes.como('pessoa_com_app', 'aal1');
select ok(not private.liberado(), 'com app ativo, sessão aal1: não liberado');
select is((select count(*) from public.times), 0::bigint, 'com app ativo, sessão aal1: não vê times');
reset role;
select testes.como('pessoa_com_app', 'aal2');
select ok(private.liberado(), 'com app ativo, sessão aal2: liberado');
select is((select count(*) from public.times), 1::bigint, 'com app ativo, sessão aal2: vê o time');
reset role;

-- Cadastro começado e não confirmado não conta
select testes.como('pessoa_pela_metade', 'aal1');
select ok(private.liberado(), 'fator não verificado, sessão aal1: liberado');
reset role;

-- Papéis: admin com app e sessão aal1 perde o que o papel dá
select testes.fator('admin_a', 'verified');
select testes.como('admin_a', 'aal1');
select ok(not private.sou_admin(), 'admin com app, sessão aal1: não age como admin');
select ok(not private.gerencio_consultoria(testes.id('A')), 'admin com app, sessão aal1: não gerencia a consultoria');
select is((select count(*) from public.perfis), 1::bigint, 'admin com app, sessão aal1: vê só o próprio perfil');
reset role;
select testes.como('admin_a', 'aal2');
select ok(private.sou_admin(), 'admin com app, sessão aal2: age como admin');
select is((select count(*) from public.perfis where consultoria_id = testes.id('A')), 6::bigint, 'admin com app, sessão aal2: vê as 6 pessoas de A');
reset role;

-- A exigência de um não muda a vida dos outros
select testes.como('gestor_a', 'aal1');
select ok(private.liberado(), 'gestor sem 2FA continua liberado com aal1');
reset role;

-- Situação para a ficha: desde quando o app está ativo (só para quem vê a pessoa)
select testes.como('admin_a', 'aal2');
select is((select p.verificacao_desde from public.perfis p where p.id = testes.id('pessoa_com_app')),
  '2026-11-10 12:00:00-03'::timestamptz, 'admin vê desde quando a pessoa tem o app ativo');
select is((select p.verificacao_desde from public.perfis p where p.id = testes.id('pessoa_pela_metade')),
  null::timestamptz, 'cadastro não confirmado: sem data');
select is((select p.verificacao_desde from public.perfis p where p.id = testes.id('pessoa_livre')),
  null::timestamptz, 'sem app: sem data');
reset role;
select testes.como('admin_b', 'aal1');
select is(public.verificacao_desde(jsonb_populate_record(null::public.perfis,
  jsonb_build_object('id', testes.id('pessoa_com_app')))), null::timestamptz,
  'quem não vê a pessoa não descobre a situação dela (chamando a função direto)');
reset role;
select testes.como('pessoa_com_app', 'aal1');
select is((select p.verificacao_desde from public.perfis p where p.id = testes.id('pessoa_com_app')),
  '2026-11-10 12:00:00-03'::timestamptz, 'a própria pessoa (aal1) vê que tem o app ativo: a tela pede o código');
reset role;

-- Ninguém liga ou desliga a exigência pelo navegador: só a Edge Function (chave secreta)
select testes.como('admin_a', 'aal2');
select throws_ok(format('update public.perfis set exige_2fa = false where id = %L', testes.id('pessoa_exigida')),
  '42501', null, 'admin não muda exige_2fa direto no banco');
reset role;
select testes.como('pessoa_exigida', 'aal2');
select throws_ok(format('update public.perfis set exige_2fa = false where id = %L', testes.id('pessoa_exigida')),
  '42501', null, 'a pessoa não tira a própria exigência direto no banco');
reset role;

-- A sessão do token precisa existir (para todos, não só para quem tem 2FA)
create temp table sessoes (nome text primary key, id uuid not null);
grant select on sessoes to authenticated;
insert into sessoes values
  ('livre', testes.sessao('pessoa_livre', 'aal1')),
  ('livre_outra', testes.sessao('pessoa_livre', 'aal1')),
  ('gestor', testes.sessao('gestor_a', 'aal1')),
  ('app_aal2', testes.sessao('pessoa_com_app', 'aal2')),
  ('app_aal1', testes.sessao('pessoa_com_app', 'aal1')),
  ('exigida_aal2', testes.sessao('pessoa_exigida', 'aal2')),
  ('exigida_aal1', testes.sessao('pessoa_exigida', 'aal1'));

select testes.como_na_sessao('pessoa_livre', 'aal1', (select id from sessoes where nome = 'livre')::text);
select ok(private.liberado(), 'sem 2FA, sessão do token existe: liberado');
select is((select count(*) from public.times), 1::bigint, 'sem 2FA, sessão do token existe: vê o time');
reset role;
select testes.como_na_sessao('pessoa_livre', 'aal1', (select id from sessoes where nome = 'gestor')::text);
select ok(not private.liberado(), 'session_id de outra pessoa: não liberado');
reset role;
select testes.como_na_sessao('pessoa_livre', 'aal1', '');
select ok(private.liberado(), 'session_id vazio vale como sem session_id (como antes)');
reset role;
select testes.como_na_sessao('pessoa_livre', 'aal1', gen_random_uuid()::text);
select ok(not private.liberado(), 'sem 2FA, sessão que não existe: não liberado');
select is((select count(*) from public.times), 0::bigint, 'sem 2FA, sessão que não existe: não vê o time');
select is((select count(*) from public.consultorias), 0::bigint, 'sem 2FA, sessão que não existe: não vê a consultoria');
reset role;

-- Com o app ou a exigência: token aal2 e sessão aal2
select testes.como_na_sessao('pessoa_com_app', 'aal2', (select id from sessoes where nome = 'app_aal2')::text);
select ok(private.liberado(), 'com app, token aal2 e sessão aal2: liberado');
reset role;
select testes.como_na_sessao('pessoa_com_app', 'aal2', (select id from sessoes where nome = 'app_aal1')::text);
select ok(not private.liberado(), 'com app, token aal2 mas sessão aal1: não liberado');
select is((select count(*) from public.times), 0::bigint, 'com app, token aal2 mas sessão aal1: não vê times');
reset role;
select testes.como_na_sessao('pessoa_com_app', 'aal1', (select id from sessoes where nome = 'app_aal2')::text);
select ok(not private.liberado(), 'com app, token aal1 (mesmo com a sessão aal2): não liberado');
reset role;
select testes.como_na_sessao('pessoa_exigida', 'aal2', (select id from sessoes where nome = 'exigida_aal2')::text);
select ok(private.liberado(), 'exigida, token aal2 e sessão aal2: liberado');
reset role;
select testes.como_na_sessao('pessoa_exigida', 'aal2', (select id from sessoes where nome = 'exigida_aal1')::text);
select ok(not private.liberado(), 'exigida, token aal2 mas sessão aal1: não liberado');
reset role;

-- Encerrar as sessões (Zerar): só a chave secreta (service_role), e só as da pessoa
select ok(not has_function_privilege('authenticated', 'public.encerrar_sessoes_de(uuid)', 'execute'), 'authenticated não encerra sessões');
select ok(not has_function_privilege('anon', 'public.encerrar_sessoes_de(uuid)', 'execute'), 'anon não encerra sessões');
select ok(has_function_privilege('service_role', 'public.encerrar_sessoes_de(uuid)', 'execute'), 'service_role encerra sessões');
select ok(not has_function_privilege('authenticated', 'private.encerrar_sessoes(uuid)', 'execute'), 'authenticated não chama private.encerrar_sessoes');
select testes.como('admin_a', 'aal2');
select throws_ok(format('select public.encerrar_sessoes_de(%L)', testes.id('pessoa_livre')), '42501', null,
  'o administrador não encerra sessões pelo navegador');
reset role;
set local role service_role;
select is(public.encerrar_sessoes_de(testes.id('pessoa_livre')), 2, 'service_role encerra as duas sessões da pessoa');
reset role;
select is((select count(*) from auth.sessions where user_id = testes.id('pessoa_livre')), 0::bigint, 'as sessões da pessoa somem');
select is((select count(*) from auth.sessions where user_id = testes.id('gestor_a')), 1::bigint, 'as sessões dos outros ficam');
select testes.como_na_sessao('pessoa_livre', 'aal1', (select id from sessoes where nome = 'livre')::text);
select ok(not private.liberado(), 'depois de encerrar, o token antigo não libera nada');
reset role;

select * from finish();
rollback;
