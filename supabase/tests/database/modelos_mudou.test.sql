-- Duas pessoas editando o mesmo modelo de check-in (migração 20261118005708_modelo_mudou.sql): quem abriu uma versão velha
-- não apaga o que o outro salvou. salvar_modelo recebe em p_dados o atualizado_em lido no modelo_completo e, se o modelo
-- mudou desde então (ou a data não dá para ler), recusa com 'modelo_mudou' sem gravar nada; com a data certa salva;
-- sem a data salva como antes; criar não olha a data. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select, insert on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria Modelo Mudou ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@modelo-mudou.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@modelo-mudou.test', p_papel);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

create function testes.sistema() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Um modelo de uma etapa e duas tarefas; `atualizado_em` (o que a pessoa leu) vai junto quando dado.
create function testes.dados(p_nome text, p_atualizado text default null) returns jsonb language sql as $$
  select jsonb_build_object('nome', p_nome, 'para', 'todas',
    'etapas', jsonb_build_array(jsonb_build_object('nome', 'Etapa', 'tarefas', jsonb_build_array(
      jsonb_build_object('chave', 'a', 'titulo', p_nome || ' 1', 'obrigatoria', true, 'prazo_dias', 2, 'depende_de', '[]'::jsonb),
      jsonb_build_object('chave', 'b', 'titulo', p_nome || ' 2', 'obrigatoria', true, 'prazo_dias', 5,
        'depende_de', jsonb_build_array('a'))))))
    || case when p_atualizado is null then '{}'::jsonb else jsonb_build_object('atualizado_em', p_atualizado) end
$$;

-- Salva como a pessoa: 'ok' ou o código e a mensagem do erro (o erro desfaz só esta chamada, como na API).
create function testes.salvar(p_quem text, p_id uuid, p_dados jsonb) returns text language plpgsql as $$
declare v text;
begin
  perform testes.como(p_quem);
  begin
    perform public.salvar_modelo(p_id, p_dados);
    v := 'ok';
  exception when others then
    v := sqlstate || ' ' || sqlerrm;
  end;
  perform testes.sistema();
  return v;
end $$;

-- O atualizado_em como a pessoa lê no modelo_completo (o texto do JSON, que o editor devolve ao salvar).
create function testes.lido(p_quem text, p_modelo uuid) returns text language plpgsql as $$
declare v text;
begin
  perform testes.como(p_quem);
  v := public.modelo_completo(p_modelo) ->> 'atualizado_em';
  perform testes.sistema();
  return v;
end $$;

-- O modelo inteiro, direto das tabelas, para comparar antes e depois.
create function testes.retrato(p_modelo uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'modelo', to_jsonb(m),
    'etapas', (select jsonb_agg(to_jsonb(e) order by e.posicao) from public.modelo_etapas e where e.modelo_id = m.id),
    'tarefas', (select jsonb_agg(to_jsonb(t) order by t.posicao) from public.modelo_tarefas t where t.modelo_id = m.id))
  from public.modelos m where m.id = p_modelo
$$;

create table testes.guardado (nome text primary key, v jsonb);

-- ── Cenário: duas pessoas da gestão da mesma consultoria e a Central ────────
select testes.consultoria('A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('central1', 'central', null);

-- Criar não olha a data (nem uma que não dá para ler).
select is(testes.salvar('gestor_a', null, testes.dados('Zqm Criado', 'ontem')), 'ok', 'criar ignora o atualizado_em');
insert into testes.fx select 'm1', id from public.modelos where nome = 'Zqm Criado';
select isnt(testes.id('m1'), null, 'o modelo foi criado');

-- As duas abriram o modelo numa versão de uma hora atrás (a transação do teste tem um só now()).
update public.modelos set atualizado_em = now() - interval '1 hour' where id = testes.id('m1');
insert into testes.guardado values ('lido_por_todos', to_jsonb(testes.lido('gestor_a', testes.id('m1'))));
select is(testes.lido('admin_a', testes.id('m1')), (select v #>> '{}' from testes.guardado where nome = 'lido_por_todos'),
  'as duas leem o mesmo atualizado_em');

-- A primeira salva com a data que leu: vale.
select is(testes.salvar('gestor_a', testes.id('m1'),
    testes.dados('Zqm Versão da primeira', (select v #>> '{}' from testes.guardado where nome = 'lido_por_todos'))),
  'ok', 'com a data que leu, salva');
insert into testes.guardado values ('depois_da_primeira', testes.retrato(testes.id('m1')));

-- A segunda, com a data velha: recusada, e o modelo continua o da primeira.
select is(testes.salvar('admin_a', testes.id('m1'),
    testes.dados('Zqm Versão da segunda', (select v #>> '{}' from testes.guardado where nome = 'lido_por_todos'))),
  'P0001 modelo_mudou', 'quem abriu antes do outro salvar é recusado (modelo_mudou)');
select is(testes.retrato(testes.id('m1')), (select v from testes.guardado where nome = 'depois_da_primeira'),
  'a recusa não mexe em nada: nome, etapas, tarefas e contadores da primeira');
select is((select nome from public.modelos where id = testes.id('m1')), 'Zqm Versão da primeira', 'o nome é o da primeira');

-- A Central também passa pela mesma conferência.
select is(testes.salvar('central1', testes.id('m1'),
    testes.dados('Zqm Versão da Central', (select v #>> '{}' from testes.guardado where nome = 'lido_por_todos'))
      || jsonb_build_object('para', testes.id('A')::text)),
  'P0001 modelo_mudou', 'a Central com a data velha também é recusada');

-- Data que não dá para ler conta como diferente.
select is(testes.salvar('admin_a', testes.id('m1'), testes.dados('Zqm Data ruim', 'ontem')), 'P0001 modelo_mudou',
  'data que não dá para ler: recusada');

-- Quem abre de novo (data atual) salva.
select is(testes.salvar('admin_a', testes.id('m1'),
    testes.dados('Zqm Versão da segunda, de novo', testes.lido('admin_a', testes.id('m1')))),
  'ok', 'abrindo de novo (a data atual), a segunda salva');

-- Sem a data em p_dados, salva como antes.
select is(testes.salvar('gestor_a', testes.id('m1'), testes.dados('Zqm Sem data')), 'ok', 'sem atualizado_em, salva como antes');

select * from finish();
rollback;
