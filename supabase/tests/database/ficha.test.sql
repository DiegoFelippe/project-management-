-- Ficha do consultor: campos novos do perfil e atualizar_meu_contato. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

select has_column('public', 'perfis', 'telefone', 'perfis tem telefone');
select has_column('public', 'perfis', 'cidade', 'perfis tem cidade');
select has_column('public', 'perfis', 'uf', 'perfis tem uf');
select has_column('public', 'perfis', 'cargo', 'perfis tem cargo');
select has_column('public', 'perfis', 'data_entrada', 'perfis tem data_entrada');

-- Limites (gravando como sistema)
select lives_ok(format('update public.perfis set telefone = %L, cidade = %L, uf = %L, cargo = %L, data_entrada = %L where id = %L',
  '(11) 99999-0000', 'Campinas', 'SP', 'Analista', '2024-03-01', testes.id('pessoa_a')), 'grava os campos válidos');
select throws_ok(format('update public.perfis set telefone = %L where id = %L', repeat('1', 31), testes.id('pessoa_a')), '23514', null, 'telefone até 30');
select throws_ok(format('update public.perfis set cidade = %L where id = %L', repeat('a', 121), testes.id('pessoa_a')), '23514', null, 'cidade até 120');
select throws_ok(format('update public.perfis set cargo = %L where id = %L', repeat('a', 81), testes.id('pessoa_a')), '23514', null, 'cargo até 80');
select throws_ok(format('update public.perfis set uf = %L where id = %L', 'XX', testes.id('pessoa_a')), '23514', null, 'uf só as 27');
select throws_ok(format('update public.perfis set data_entrada = %L where id = %L', (now() at time zone 'America/Sao_Paulo')::date + 1, testes.id('pessoa_a')), '23514', null, 'data de entrada não no futuro');
select lives_ok(format('update public.perfis set data_entrada = %L where id = %L', (now() at time zone 'America/Sao_Paulo')::date, testes.id('pessoa_a')), 'hoje vale');

-- atualizar_meu_contato
select testes.como('pessoa_a');
select lives_ok($$select public.atualizar_meu_contato('  (19) 3333-0000 ', 'Santos', 'sp')$$, 'a pessoa atualiza o próprio contato');
select lives_ok($$select public.atualizar_meu_contato('', '', '')$$, 'texto vazio é aceito');
reset role;
select is((select telefone || cidade || uf from public.perfis where id = testes.id('pessoa_a')) is null, true, 'texto vazio vira nulo');
select testes.como('pessoa_a');
select public.atualizar_meu_contato('1', 'Rio', 'rj');
select throws_ok($$select public.atualizar_meu_contato('1', 'Rio', 'ZZ')$$, '23514', null, 'uf inválida recusada');
reset role;
select is((select uf from public.perfis where id = testes.id('pessoa_a')), 'RJ', 'uf guardada em maiúsculas');
select testes.como('pessoa_a');
select throws_ok(format('update public.perfis set cargo = %L where id = %L', 'Chefe', testes.id('pessoa_a')), '42501', null, 'direto no banco, cargo não muda');
reset role;

select * from finish();
rollback;
