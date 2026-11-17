-- Pastas nos arquivos do cliente: quem cria, vê, renomeia e apaga cliente_pastas, e o que acontece com os
-- arquivos dentro dela. Segue as regras de cliente_arquivos. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

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

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := testes.usuario(p_nome, true);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
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

-- Mudança feita pelo sistema (sem usuário logado), como os gatilhos fazem.
create function testes.como_sistema() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Caminho do arquivo no Storage: <cliente>/<uuid>-<nome>.
create function testes.caminho(p_cliente text, p_arquivo text) returns text language sql stable as $$
  select testes.id(p_cliente)::text || '/' || testes.id(p_arquivo)::text || '-' || p_arquivo || '.pdf'
$$;

-- A linha do arquivo, gravada por quem está logado.
create function testes.enviar(p_arquivo text, p_cliente text) returns void language sql as $$
  insert into public.cliente_arquivos (id, cliente_id, caminho, nome, tamanho, tipo)
  values (testes.id(p_arquivo), testes.id(p_cliente), testes.caminho(p_cliente, p_arquivo),
    p_arquivo || '.pdf', 2048, 'application/pdf')
$$;

-- O objeto no Storage, como a API do Storage grava no envio (dono = quem está logado).
create function testes.objeto(p_arquivo text, p_cliente text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('arquivos', testes.caminho(p_cliente, p_arquivo), (select auth.uid())::text, '{"size": 2048}')
$$;

-- Quantas destas linhas / destes objetos quem está logado enxerga (só os do cenário: o banco tem dados reais).
create function testes.linhas(p_arquivos text[]) returns bigint language sql stable as $$
  select count(*) from public.cliente_arquivos
  where id in (select testes.id(n) from unnest(p_arquivos) n)
$$;

create function testes.objetos(p_cliente text, p_arquivos text[]) returns bigint language sql stable as $$
  select count(*) from storage.objects
  where bucket_id = 'arquivos' and name in (select testes.caminho(p_cliente, n) from unnest(p_arquivos) n)
$$;


-- A pasta gravada por quem está logado (o id vem do cenário).
create function testes.pasta(p_pasta text, p_cliente text, p_nome text) returns void language sql as $$
  insert into public.cliente_pastas (id, cliente_id, nome) values (testes.id(p_pasta), testes.id(p_cliente), p_nome)
$$;

-- Arquivo dentro de uma pasta, gravado por quem está logado.
create function testes.enviar_na_pasta(p_arquivo text, p_cliente text, p_pasta text) returns void language sql as $$
  insert into public.cliente_arquivos (id, cliente_id, caminho, nome, tamanho, tipo, pasta_id)
  values (testes.id(p_arquivo), testes.id(p_cliente), testes.caminho(p_cliente, p_arquivo),
    p_arquivo || '.pdf', 2048, 'application/pdf', testes.id(p_pasta))
$$;

create function testes.pastas(p_pastas text[]) returns bigint language sql stable as $$
  select count(*) from public.cliente_pastas where id in (select testes.id(n) from unnest(p_pastas) n)
$$;

select set_config('storage.allow_delete_query', 'true', true);

-- Cenário: c1 na consultoria A com a consultora pessoa_a; c_central na central; c_b na consultoria B.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.cliente('c1', 'A', 'pessoa_a');
select testes.cliente('c_central', null, null);
select testes.cliente('c_b', 'B', 'admin_b');
insert into testes.fx
select n, gen_random_uuid()
from unnest(array['p_central', 'p_pessoa', 'p_gestor', 'p_b', 'p_vazia', 'f_dentro', 'f_dentro2', 'f_fora']) n;

-- ── Tabela ───────────────────────────────────────────────────────────────────

select has_column('public', 'cliente_pastas', 'evento_id', 'a pasta tem evento_id (a pasta da reunião)');
select is((select count(*) from pg_constraint c
    join pg_attribute t on t.attrelid = c.conrelid and t.attnum = any (c.conkey)
    where c.conrelid = 'public.cliente_pastas'::regclass and c.contype = 'f' and t.attname = 'evento_id'), 0::bigint,
  'evento_id ainda não tem chave estrangeira (a tabela de eventos chega depois)');

-- ── Quem cria ────────────────────────────────────────────────────────────────

select testes.como('central');
select lives_ok($$select testes.pasta('p_central', 'c1', 'Documentos da central')$$,
  'a central cria pasta no cliente da consultoria A');
select ok((select consultoria_id is null and criada_por = testes.id('central') from public.cliente_pastas
    where id = testes.id('p_central')), 'a pasta da central fica sem consultoria e com ela como autora');
reset role;

select testes.como('pessoa_a');
select lives_ok($$insert into public.cliente_pastas (id, cliente_id, consultoria_id, criada_por, evento_id, nome)
    values (testes.id('p_pessoa'), testes.id('c1'), testes.id('B'), testes.id('admin_a'), gen_random_uuid(), 'Contratos')$$,
  'a consultora do cliente cria pasta');
select ok((select consultoria_id = testes.id('A') and criada_por = testes.id('pessoa_a') and evento_id is null
    from public.cliente_pastas where id = testes.id('p_pessoa')),
  'consultoria, autora e evento são os do banco (o que ela mandou é ignorado)');
select throws_ok($$select testes.pasta('p_b', 'c1', 'contratos')$$, '23505', null,
  'nome repetido no mesmo cliente falha, sem diferenciar maiúsculas');
select throws_ok($$select testes.pasta('p_b', 'c1', '   ')$$, '23514', null, 'nome vazio falha');
select throws_ok($$select testes.pasta('p_b', 'c_central', 'Qualquer')$$, '42501', null,
  'cliente que está na central não recebe pasta da consultoria');
reset role;

select testes.como('pessoa_a2');
select throws_ok($$select testes.pasta('p_b', 'c1', 'Outra')$$, '42501', null,
  'pessoa que não é consultora do cliente não cria pasta');
reset role;

select testes.como('admin_b');
select throws_ok($$select testes.pasta('p_b', 'c1', 'Outra')$$, '42501', null, 'outra consultoria não cria pasta');
select lives_ok($$select testes.pasta('p_b', 'c_b', 'Contratos')$$, 'o mesmo nome em outro cliente é permitido');
reset role;

select testes.como('gestor_a');
select lives_ok($$select testes.pasta('p_gestor', 'c1', 'Relatórios')$$, 'o gestor da consultoria cria pasta');
reset role;

-- ── Quem vê ──────────────────────────────────────────────────────────────────

select testes.como('pessoa_a');
select is(testes.pastas(array['p_central', 'p_pessoa', 'p_gestor', 'p_b']), 3::bigint,
  'a consultora vê as pastas dos clientes dela (as dela, as do gestor e as da central) e não as de outra consultoria');
reset role;

select testes.como('pessoa_a2');
select is(testes.pastas(array['p_central', 'p_pessoa', 'p_gestor', 'p_b']), 0::bigint,
  'pessoa que não vê o cliente não vê as pastas dele');
reset role;

select testes.como('admin_b');
select is(testes.pastas(array['p_central', 'p_pessoa', 'p_gestor', 'p_b']), 1::bigint,
  'a outra consultoria vê só as dos clientes dela');
reset role;

select testes.como('central');
select is(testes.pastas(array['p_central', 'p_pessoa', 'p_gestor', 'p_b']), 4::bigint, 'a central vê todas');
reset role;

-- ── Quem renomeia ────────────────────────────────────────────────────────────

select testes.como('pessoa_a');
with u as (update public.cliente_pastas set nome = 'Contratos 2026' where id = testes.id('p_pessoa') returning 1)
select is(count(*), 1::bigint, 'quem criou renomeia a própria pasta') from u;
with u as (update public.cliente_pastas set nome = 'Trocada' where id = testes.id('p_central') returning 1)
select is(count(*), 0::bigint, 'não renomeia a pasta da central') from u;
with u as (update public.cliente_pastas set nome = 'Trocada' where id = testes.id('p_gestor') returning 1)
select is(count(*), 0::bigint, 'nem a do gestor (quem não criou e não é gestor)') from u;
select throws_ok($$update public.cliente_pastas set nome = 'relatórios' where id = testes.id('p_pessoa')$$, '23505', null,
  'renomear para um nome que já existe no cliente falha');
select throws_ok($$update public.cliente_pastas set cliente_id = testes.id('c_central') where id = testes.id('p_pessoa')$$,
  '42501', null, 'a pasta não troca de cliente');
reset role;

select testes.como('gestor_a');
with u as (update public.cliente_pastas set nome = 'Contratos' where id = testes.id('p_pessoa') returning 1)
select is(count(*), 1::bigint, 'o gestor renomeia a pasta que a consultora criou') from u;
with u as (update public.cliente_pastas set nome = 'Trocada' where id = testes.id('p_central') returning 1)
select is(count(*), 0::bigint, 'o gestor não renomeia a pasta da central') from u;
reset role;

select testes.como('admin_b');
with u as (update public.cliente_pastas set nome = 'Trocada' where id = testes.id('p_pessoa') returning 1)
select is(count(*), 0::bigint, 'outra consultoria não renomeia') from u;
reset role;

-- ── Arquivos dentro da pasta ─────────────────────────────────────────────────

select testes.como('pessoa_a');
select lives_ok($$select testes.enviar_na_pasta('f_dentro', 'c1', 'p_pessoa')$$, 'a consultora envia arquivo para dentro da pasta');
select lives_ok($$select testes.enviar_na_pasta('f_dentro2', 'c1', 'p_central')$$, 'e para dentro da pasta da central, que ela vê');
select throws_ok($$select testes.enviar_na_pasta('f_fora', 'c1', 'p_b')$$, '42501', null,
  'arquivo não entra na pasta de outro cliente');
select lives_ok($$select testes.objeto('f_dentro', 'c1')$$, 'e sobe o objeto');
reset role;

-- ── Quem apaga: a pasta leva os arquivos dela ────────────────────────────────

select testes.como('pessoa_a');
with d as (delete from public.cliente_pastas where id = testes.id('p_central') returning 1)
select is(count(*), 0::bigint, 'a consultora não apaga a pasta da central') from d;
reset role;

select testes.como('admin_b');
with d as (delete from public.cliente_pastas where id = testes.id('p_pessoa') returning 1)
select is(count(*), 0::bigint, 'outra consultoria não apaga') from d;
reset role;

select testes.como('gestor_a');
with d as (delete from public.cliente_pastas where id = testes.id('p_pessoa') returning 1)
select is(count(*), 1::bigint, 'o gestor apaga a pasta da consultora') from d;
select is(testes.linhas(array['f_dentro']), 0::bigint, 'os arquivos da pasta saem junto');
select is(testes.objetos('c1', array['f_dentro']), 1::bigint, 'o objeto ainda está no Storage até alguém tirar');
with d as (delete from storage.objects where bucket_id = 'arquivos' and name = testes.caminho('c1', 'f_dentro') returning 1)
select is(count(*), 1::bigint, 'e quem apagou a pasta o tira depois') from d;
reset role;

select testes.como('pessoa_a');
select lives_ok($$select testes.pasta('p_vazia', 'c1', 'Vazia')$$, 'a consultora cria outra pasta');
with d as (delete from public.cliente_pastas where id = testes.id('p_vazia') returning 1)
select is(count(*), 1::bigint, 'e apaga a própria pasta') from d;
reset role;

select testes.como('central');
with d as (delete from public.cliente_pastas where id = testes.id('p_central') returning 1)
select is(count(*), 1::bigint, 'a central apaga qualquer pasta') from d;
select is(testes.linhas(array['f_dentro2']), 0::bigint, 'e os arquivos dela saem junto');
reset role;

select * from finish();
rollback;
