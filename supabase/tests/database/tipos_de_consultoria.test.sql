-- Tipos de consultoria da pessoa (perfis.tipos_de_consultoria). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_b', 'pessoa', 'A');

select has_column('public', 'perfis', 'tipos_de_consultoria', 'perfis tem tipos_de_consultoria');
select is((select tipos_de_consultoria from public.perfis where id = testes.id('pessoa_a')), '{}'::text[], 'começa sem nenhum tipo');
select lives_ok(format('update public.perfis set tipos_de_consultoria = %L where id = %L',
  '{gestao,sucesso_do_cliente,assessoria_juridica,gestao_de_pessoas}', testes.id('pessoa_a')), 'aceita os quatro tipos juntos');
select lives_ok(format('update public.perfis set tipos_de_consultoria = %L where id = %L', '{}', testes.id('pessoa_a')), 'aceita nenhum');
select throws_ok(format('update public.perfis set tipos_de_consultoria = %L where id = %L', '{financeiro}', testes.id('pessoa_a')),
  '23514', null, 'recusa valor fora da lista');
select throws_ok(format('update public.perfis set tipos_de_consultoria = %L where id = %L', '{gestao,gestao}', testes.id('pessoa_a')),
  '23514', null, 'recusa tipo repetido');
select throws_ok(format('update public.perfis set tipos_de_consultoria = %L where id = %L', '{NULL}', testes.id('pessoa_a')),
  '23514', null, 'recusa item nulo');
select throws_ok(format('update public.perfis set tipos_de_consultoria = null where id = %L', testes.id('pessoa_a')),
  '23502', null, 'a lista nunca é nula');

update public.perfis set tipos_de_consultoria = '{gestao}' where id = testes.id('pessoa_a');
select is((select count(*)::int from public.perfis where tipos_de_consultoria @> array['gestao'] and id in (testes.id('pessoa_a'), testes.id('pessoa_b'))),
  1, 'o filtro por tipo acha só quem tem');

-- A pessoa não muda os próprios tipos (nem os de ninguém) direto no banco.
select testes.como('pessoa_a');
select throws_ok(format('update public.perfis set tipos_de_consultoria = %L where id = %L', '{gestao_de_pessoas}', testes.id('pessoa_a')),
  '42501', null, 'direto no banco, a pessoa não muda os tipos');
select throws_ok(format('update public.perfis set tipos_de_consultoria = %L where id = %L', '{gestao}', testes.id('pessoa_b')),
  '42501', null, 'nem os de outra pessoa');
reset role;

select * from finish();
rollback;
