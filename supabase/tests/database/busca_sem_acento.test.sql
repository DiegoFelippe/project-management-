-- Busca por nome sem acento (e sem diferenciar maiúscula) em perfis e consultorias, no banco: a coluna gerada
-- nome_busca (minúscula e sem acento) tem índice trigram e a leitura continua recortada pelo RLS de cada tabela.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.usuario(p_nome text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@teste.test', 'hash-inicial', now(), '{}', '{}', now(), now());
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
  v := testes.usuario(p_nome);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@teste.test', p_papel);
  return v;
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;


select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('joao_a', 'pessoa', 'A');
update public.perfis set nome = 'João Pereira' where id = testes.id('joao_a');
update public.consultorias set nome = 'Consultoria Açaí' where id = testes.id('A');

-- ── Colunas, índices e permissões ────────────────────────────────────────────

select is((select nome_busca from public.perfis where id = testes.id('joao_a')), 'joao pereira',
  'perfis.nome_busca guarda o nome em minúscula e sem acento');
select is((select nome_busca from public.consultorias where id = testes.id('A')), 'consultoria acai',
  'consultorias.nome_busca guarda o nome em minúscula e sem acento');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'perfis' and indexdef ilike '%nome_busca%gin_trgm_ops%'),
  'perfis.nome_busca tem índice trigram');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'consultorias' and indexdef ilike '%nome_busca%gin_trgm_ops%'),
  'consultorias.nome_busca tem índice trigram');
select ok(has_column_privilege('authenticated', 'public.perfis', 'nome_busca', 'select'), 'authenticated lê perfis.nome_busca');
select ok(has_column_privilege('authenticated', 'public.consultorias', 'nome_busca', 'select'), 'authenticated lê consultorias.nome_busca');
select ok(not has_column_privilege('authenticated', 'public.perfis', 'nome_busca', 'update')
    and not has_column_privilege('authenticated', 'public.consultorias', 'nome_busca', 'update'),
  'ninguém grava nome_busca (coluna gerada, sem update para authenticated)');
select ok(not has_column_privilege('anon', 'public.perfis', 'nome_busca', 'select')
    and not has_column_privilege('anon', 'public.consultorias', 'nome_busca', 'select'),
  'anon não lê nome_busca');

-- ── A busca acha sem acento e o RLS continua igual ───────────────────────────

select testes.como('admin_a');
select is((select count(*) from public.perfis where nome_busca ilike '%joao%'), 1::bigint,
  'a busca "joao" acha "João Pereira" na própria consultoria');
select is((select count(*) from public.perfis where nome_busca ilike '%JOÃO%'), 0::bigint,
  'o termo da busca vai sem acento e em minúscula (a tela normaliza antes)');
select is((select count(*) from public.consultorias where nome_busca ilike '%acai%'), 1::bigint,
  'a busca "acai" acha "Consultoria Açaí"');
reset role;

select testes.como('admin_b');
select is((select count(*) from public.perfis where nome_busca ilike '%joao%'), 0::bigint,
  'outra consultoria não acha a pessoa pela busca (RLS igual)');
select is((select count(*) from public.consultorias where nome_busca ilike '%acai%'), 0::bigint,
  'outra consultoria não acha a consultoria pela busca (RLS igual)');
reset role;

select * from finish();
rollback;
