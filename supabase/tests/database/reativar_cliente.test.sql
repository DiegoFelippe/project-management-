-- Reativar cliente: o arquivado guarda a consultoria e o consultor de quando foi arquivado, e quem saiu
-- enquanto ele estava arquivado não volta junto. Consultoria arquivada → o cliente volta para a central
-- (devolvido); consultor desativado, movido para a central ou para outra consultoria → aguardando consultor.
-- E o check-in só entra em cliente da consultoria atual de quem o faz. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

-- Mudança feita pelo sistema (como as Edge Functions, com a chave secreta): sem usuário logado.
create function testes.sistema() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Cenário: cada cliente é arquivado com o consultor e, enquanto está arquivado, o consultor (ou a
-- consultoria) sai.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('C');
select testes.perfil('central', 'central', null);
select testes.perfil('p_des', 'pessoa', 'A');
select testes.perfil('p_cen', 'pessoa', 'A');
select testes.perfil('p_mov', 'pessoa', 'A');
select testes.perfil('p_ok', 'pessoa', 'A');
select testes.perfil('p_c', 'pessoa', 'C');
select testes.perfil('p_b', 'pessoa', 'B');
select testes.cliente('k_des', 'A', 'p_des');
select testes.cliente('k_cen', 'A', 'p_cen');
select testes.cliente('k_mov', 'A', 'p_mov');
select testes.cliente('k_ok', 'A', 'p_ok');
select testes.cliente('k_c', 'C', 'p_c');
select testes.cliente('k_fora', 'A', null);

select testes.como('central');
update public.clientes set arquivado_em = now()
where id in (testes.id('k_des'), testes.id('k_cen'), testes.id('k_mov'), testes.id('k_ok'), testes.id('k_c'));
reset role;

select testes.sistema();
update public.perfis set ativo = false, desativado_em = now() where id = testes.id('p_des');
update public.perfis set papel = 'central', consultoria_id = null where id = testes.id('p_cen');
update public.perfis set consultoria_id = testes.id('B') where id = testes.id('p_mov');
update public.consultorias set arquivada_em = now() where id = testes.id('C');

select is((select count(*) from public.clientes
    where id in (testes.id('k_des'), testes.id('k_cen'), testes.id('k_mov'), testes.id('k_c')) and consultor_id is not null),
  4::bigint, 'arquivados guardam o consultor de quando foram arquivados (quem sai não mexe neles)');
select is((select consultoria_id from public.clientes where id = testes.id('k_c')), testes.id('C'),
  'o arquivado continua na consultoria que foi arquivada');

-- ── Reativar ─────────────────────────────────────────────────────────────────

select testes.como('central');
select lives_ok($$update public.clientes set arquivado_em = null
    where id in (testes.id('k_des'), testes.id('k_cen'), testes.id('k_mov'), testes.id('k_ok'), testes.id('k_c'))$$,
  'a central reativa os cinco clientes');
reset role;

select ok((select consultor_id is null and consultor_desde is null and consultoria_id = testes.id('A')
    from public.clientes where id = testes.id('k_des')),
  'consultor desativado enquanto o cliente estava arquivado: volta aguardando consultor, na mesma consultoria');
select ok((select consultor_id is null and consultoria_id = testes.id('A') from public.clientes where id = testes.id('k_cen')),
  'consultor movido para a central: volta aguardando consultor');
select ok((select consultor_id is null and consultoria_id = testes.id('A') from public.clientes where id = testes.id('k_mov')),
  'consultor que foi para outra consultoria: volta aguardando consultor');
select ok((select consultor_id = testes.id('p_ok') and consultoria_id = testes.id('A')
    from public.clientes where id = testes.id('k_ok')),
  'consultor que continua valendo: o cliente volta com ele');
select ok((select consultoria_id is null and consultor_id is null from public.clientes where id = testes.id('k_c')),
  'consultoria arquivada: o cliente volta para a central (a distribuir)');

select is((select count(*) from public.cliente_eventos
    where cliente_id in (testes.id('k_des'), testes.id('k_cen'), testes.id('k_mov'))
      and tipo = 'consultor_removido' and para_consultor is null
      and de_consultor in (testes.id('p_des'), testes.id('p_cen'), testes.id('p_mov'))), 3::bigint,
  'histórico: consultor_removido nos três clientes');
select is((select count(*) from public.cliente_eventos
    where cliente_id = testes.id('k_c') and tipo = 'devolvido'
      and de_consultoria = testes.id('C') and para_consultoria is null and de_consultor = testes.id('p_c')), 1::bigint,
  'histórico: devolvido para a central, levando o consultor que saiu');
select is((select count(*) from public.cliente_eventos
    where cliente_id in (testes.id('k_des'), testes.id('k_cen'), testes.id('k_mov'), testes.id('k_ok'), testes.id('k_c'))
      and tipo = 'reativado'), 5::bigint,
  'histórico: reativado nos cinco');
select is((select count(*) from public.cliente_eventos
    where cliente_id = testes.id('k_ok') and tipo in ('consultor_removido', 'devolvido')), 0::bigint,
  'o cliente que volta com o consultor não ganha consultor_removido');

select testes.como('p_mov');
select throws_ok($$insert into public.checkins (cliente_id, inicio) values (testes.id('k_mov'), now() - interval '1 hour')$$,
  'P0001', 'checkin_sem_cliente', 'quem foi para outra consultoria não faz check-in no cliente reativado');
reset role;

-- A central pode escolher a consultoria junto com a reativação: aí vale a regra de sempre.
select testes.como('central');
update public.clientes set arquivado_em = now() where id = testes.id('k_c');
select throws_ok($$update public.clientes set arquivado_em = null, consultoria_id = testes.id('C') where id = testes.id('k_c')$$,
  'P0001', 'consultoria_arquivada', 'reativar mandando para consultoria arquivada continua recusado');
select lives_ok($$update public.clientes set arquivado_em = null, consultoria_id = testes.id('B') where id = testes.id('k_c')$$,
  'reativar mandando para outra consultoria');
select ok((select consultoria_id = testes.id('B') and consultor_id is null from public.clientes where id = testes.id('k_c')),
  'o cliente vai para B aguardando consultor');
reset role;

-- ── Check-in só em cliente da consultoria atual ──────────────────────────────
-- Estado que as regras dos clientes não deixam acontecer (consultor de outra consultoria): forçado com o
-- gatilho desligado para conferir que o check-in também recusa por conta própria.

select testes.sistema();
alter table public.clientes disable trigger clientes_validar;
update public.clientes set consultor_id = testes.id('p_b') where id = testes.id('k_fora');
alter table public.clientes enable trigger clientes_validar;

select testes.como('p_b');
select throws_ok($$insert into public.checkins (cliente_id, inicio) values (testes.id('k_fora'), now() - interval '1 hour')$$,
  'P0001', 'checkin_sem_cliente', 'check-in em cliente de outra consultoria é recusado, mesmo sendo o consultor dele');
reset role;

select testes.como('p_ok');
select lives_ok($$insert into public.checkins (cliente_id, inicio) values (testes.id('k_ok'), now() - interval '1 hour')$$,
  'o consultor da própria consultoria continua fazendo check-in');
reset role;

select * from finish();
rollback;
