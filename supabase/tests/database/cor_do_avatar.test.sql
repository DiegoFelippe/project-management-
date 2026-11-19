-- Cor do avatar: coluna perfis.cor (uma das 8 cores da paleta), mudada por quem muda a foto. Roda com: npm run test:db
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
create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

select testes.consultoria('A');
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_b', 'pessoa', 'A');

select has_column('public', 'perfis', 'cor', 'perfis tem a coluna cor');
select is((select cor from public.perfis where id = testes.id('pessoa_a')), null, 'sem escolha, a cor é nula (vale a automática)');

select testes.como('pessoa_a');
select lives_ok(format('update public.perfis set cor = %L where id = %L', '#7c3aed', testes.id('pessoa_a')), 'a pessoa muda a própria cor');
select lives_ok(format('update public.perfis set cor = %L where id = %L', '#db2777', testes.id('pessoa_b')), 'tenta mudar a cor de outra (não grava)');
reset role;
select is((select cor from public.perfis where id = testes.id('pessoa_a')), '#7c3aed', 'a cor da própria pessoa ficou');
select is((select cor from public.perfis where id = testes.id('pessoa_b')), null, 'a cor da outra continua vazia');

select testes.como('admin_a');
select lives_ok(format('update public.perfis set cor = %L where id = %L', '#16a34a', testes.id('pessoa_b')), 'o administrador muda a cor de uma pessoa da consultoria');
reset role;
select is((select cor from public.perfis where id = testes.id('pessoa_b')), '#16a34a', 'a cor foi gravada pelo administrador');

select throws_ok(format('update public.perfis set cor = %L where id = %L', '#123456', testes.id('pessoa_a')), '23514', null, 'cor fora da paleta falha');
select testes.como('pessoa_a');
select throws_ok(format('update public.perfis set cor = %L where id = %L', 'vermelho', testes.id('pessoa_a')), '23514', null, 'nome de cor também falha');
select lives_ok(format('update public.perfis set cor = null where id = %L', testes.id('pessoa_a')), 'voltar para a cor automática (nula) é permitido');
reset role;

select * from finish();
rollback;
