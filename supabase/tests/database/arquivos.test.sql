-- Arquivos do cliente: quem envia, quem vê e quem apaga a linha em cliente_arquivos e o objeto no Storage
-- (bucket "arquivos", pasta do cliente). Cada arquivo guarda a consultoria do envio (nula quando é da central);
-- a consultoria vê os dela e os da central; uma consultoria nunca vê os de outra. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

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

-- Apagar direto em storage.objects só passa com esta configuração (o Storage faz o mesmo por dentro);
-- quem decide o que sai são as políticas.
select set_config('storage.allow_delete_query', 'true', true);

-- Cenário: c1 na consultoria A com a consultora pessoa_a; c_arq arquivado na A; c_central na central.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.cliente('c1', 'A', 'pessoa_a');
select testes.cliente('c_arq', 'A', 'pessoa_a');
select testes.cliente('c_central', null, null);
update public.clientes set arquivado_em = now() where id = testes.id('c_arq');
insert into testes.fx
select n, gen_random_uuid()
from unnest(array['f_central', 'f_central2', 'f_cc', 'f_pessoa', 'f_pessoa2', 'f_gestor', 'f_admin', 'f_b',
  'f_x', 'f_solto']) n;

-- ── Bucket ───────────────────────────────────────────────────────────────────

select is((select public from storage.buckets where id = 'arquivos'), false,
  'bucket arquivos existe e é privado (download só por link assinado)');
select is((select file_size_limit from storage.buckets where id = 'arquivos'), 26214400::bigint,
  'bucket arquivos aceita até 25 MB');
select is((select allowed_mime_types from storage.buckets where id = 'arquivos'), null::text[],
  'bucket arquivos aceita qualquer tipo de arquivo');

-- ── Quem envia ───────────────────────────────────────────────────────────────

select testes.como('central');
select lives_ok($$select testes.enviar('f_central', 'c1')$$, 'a central envia arquivo a um cliente da consultoria A');
select ok((select consultoria_id is null and enviado_por = testes.id('central')
    from public.cliente_arquivos where id = testes.id('f_central')),
  'o arquivo da central fica sem consultoria e com ela como autora');
select lives_ok($$insert into public.cliente_arquivos (id, cliente_id, consultoria_id, enviado_por, caminho, nome, tamanho)
    values (testes.id('f_central2'), testes.id('c1'), testes.id('A'), testes.id('pessoa_a'),
      testes.caminho('c1', 'f_central2'), 'f_central2.pdf', 10)$$,
  'a central envia outro arquivo mandando consultoria e autor');
select ok((select consultoria_id is null and enviado_por = testes.id('central')
    from public.cliente_arquivos where id = testes.id('f_central2')),
  'consultoria e autor mandados pela central são ignorados');
select lives_ok($$select testes.enviar('f_cc', 'c_central')$$, 'a central envia arquivo a cliente que está com ela');
reset role;

select testes.como('pessoa_a');
select lives_ok($$insert into public.cliente_arquivos (id, cliente_id, consultoria_id, enviado_por, caminho, nome, tamanho, tipo)
    values (testes.id('f_pessoa'), testes.id('c1'), testes.id('B'), testes.id('admin_a'),
      testes.caminho('c1', 'f_pessoa'), 'Contrato.pdf', 2048, 'application/pdf')$$,
  'a consultora do cliente envia arquivo');
select ok((select consultoria_id = testes.id('A') and enviado_por = testes.id('pessoa_a')
    from public.cliente_arquivos where id = testes.id('f_pessoa')),
  'o arquivo dela fica com a consultoria do cliente e com ela como autora (o que ela mandou é ignorado)');
select lives_ok($$select testes.enviar('f_pessoa2', 'c1')$$, 'ela envia um segundo arquivo');
select throws_ok($$select testes.enviar('f_x', 'c_arq')$$,
  '42501', null, 'cliente arquivado não recebe arquivo da consultoria');
select throws_ok($$select testes.enviar('f_x', 'c_central')$$,
  '42501', null, 'cliente que está na central não recebe arquivo da consultoria');
select throws_ok($$insert into public.cliente_arquivos (cliente_id, caminho, nome, tamanho)
    values (testes.id('c1'), testes.caminho('c_arq', 'f_x'), 'f_x.pdf', 10)$$,
  '23514', null, 'o caminho fica na pasta do próprio cliente');
select throws_ok($$insert into public.cliente_arquivos (cliente_id, caminho, nome, tamanho)
    values (testes.id('c1'), testes.id('c1')::text || '/' || gen_random_uuid()::text || '-a b.pdf', 'a b.pdf', 10)$$,
  '23514', null, 'o nome no caminho só tem letras, números, ponto, hífen e sublinhado');
select throws_ok($$insert into public.cliente_arquivos (cliente_id, caminho, nome, tamanho)
    values (testes.id('c1'), testes.caminho('c1', 'f_x'), 'f_x.pdf', 26214401)$$,
  '23514', null, 'arquivo acima de 25 MB é recusado');
select throws_ok($$update public.cliente_arquivos set nome = 'Outro.pdf' where id = testes.id('f_pessoa')$$,
  '42501', null, 'o arquivo não é editado (apagar e enviar de novo)');
reset role;

select testes.como('pessoa_a2');
select throws_ok($$select testes.enviar('f_x', 'c1')$$,
  '42501', null, 'pessoa da consultoria que não é a consultora do cliente não envia');
reset role;

select testes.como('gestor_a');
select lives_ok($$select testes.enviar('f_gestor', 'c1')$$, 'gestor da consultoria envia arquivo');
reset role;

select testes.como('admin_a');
select lives_ok($$select testes.enviar('f_admin', 'c1')$$, 'administrador da consultoria envia arquivo');
reset role;

select testes.como('admin_b');
select throws_ok($$select testes.enviar('f_x', 'c1')$$,
  '42501', null, 'outra consultoria não envia arquivo ao cliente');
reset role;

-- ── Quem vê ──────────────────────────────────────────────────────────────────

select testes.como('pessoa_a');
select is(testes.linhas(array['f_central', 'f_central2', 'f_cc', 'f_pessoa', 'f_pessoa2', 'f_gestor', 'f_admin']), 6::bigint,
  'a consultora vê os arquivos do cliente: os da consultoria dela e os da central');
reset role;

select testes.como('gestor_a');
select is(testes.linhas(array['f_central', 'f_central2', 'f_cc', 'f_pessoa', 'f_pessoa2', 'f_gestor', 'f_admin']), 6::bigint,
  'o gestor vê os mesmos arquivos do cliente');
reset role;

select testes.como('pessoa_a2');
select is(testes.linhas(array['f_central', 'f_pessoa', 'f_gestor', 'f_admin']), 0::bigint,
  'quem não vê o cliente não vê os arquivos dele');
reset role;

select testes.como('admin_b');
select is(testes.linhas(array['f_central', 'f_central2', 'f_cc', 'f_pessoa', 'f_pessoa2', 'f_gestor', 'f_admin']), 0::bigint,
  'outra consultoria não vê os arquivos');
reset role;

select testes.como('central');
select is(testes.linhas(array['f_central', 'f_central2', 'f_cc', 'f_pessoa', 'f_pessoa2', 'f_gestor', 'f_admin']), 7::bigint,
  'a central vê todos os arquivos');
reset role;

select ok(not has_table_privilege('anon', 'public.cliente_arquivos', 'select'), 'sem login não se lê arquivo');
select ok(not has_table_privilege('authenticated', 'public.cliente_arquivos', 'update'), 'ninguém edita arquivo pela API');

-- ── Nome de quem enviou ──────────────────────────────────────────────────────
-- O gestor só enxerga em perfis quem ele criou e as pessoas dos times dele; o nome vem de autor_do_arquivo,
-- que relê o arquivo guardado. Para a consultoria, quem é da central aparece como "Central".

select testes.como('gestor_a');
select is((select count(*) from public.perfis where id = testes.id('pessoa_a')), 0::bigint,
  'o gestor sem times não enxerga a consultora em perfis');
select is((select (public.autor_do_arquivo(a)).nome from public.cliente_arquivos a where a.id = testes.id('f_pessoa')),
  'Pessoa pessoa_a', 'mas vê o nome dela no arquivo que ela enviou');
reset role;

select testes.como('pessoa_a');
select is((select (public.autor_do_arquivo(a)).nome from public.cliente_arquivos a where a.id = testes.id('f_gestor')),
  'Pessoa gestor_a', 'a consultora vê o nome do gestor que enviou');
select is((select (public.autor_do_arquivo(a)).nome from public.cliente_arquivos a where a.id = testes.id('f_central')),
  'Central', 'quem é da central aparece como "Central" para a consultoria');
select ok((select r.id is null and r.email is null and r.papel is null
    from public.cliente_arquivos a, public.autor_do_arquivo(a) r where a.id = testes.id('f_gestor')),
  'autor_do_arquivo devolve só o nome (nem id, nem e-mail, nem papel)');
reset role;

select testes.como('central');
select is((select (public.autor_do_arquivo(a)).nome from public.cliente_arquivos a where a.id = testes.id('f_central')),
  'Pessoa central', 'a central vê o nome de quem enviou');
reset role;

create temp table forjado (a public.cliente_arquivos);
insert into forjado select a from public.cliente_arquivos a where a.id = testes.id('f_pessoa');
grant select on forjado to authenticated;
select testes.como('admin_b');
select is((select count(*) from forjado f, public.autor_do_arquivo(f.a)), 0::bigint,
  'outra consultoria não descobre quem enviou pelo arquivo');
reset role;
select ok(not has_function_privilege('anon', 'public.autor_do_arquivo(public.cliente_arquivos)', 'execute'),
  'autor_do_arquivo não roda sem login');

-- ── Objetos no Storage ───────────────────────────────────────────────────────

select testes.como('pessoa_a');
select lives_ok($$select testes.objeto('f_pessoa', 'c1')$$, 'a consultora sobe o objeto na pasta do cliente');
select lives_ok($$select testes.objeto('f_pessoa2', 'c1')$$, 'e o do segundo arquivo');
select throws_ok($$select testes.objeto('f_x', 'c_arq')$$,
  '42501', null, 'nem na pasta do cliente arquivado');
reset role;

select testes.como('central');
select lives_ok($$select testes.objeto('f_central', 'c1')$$, 'a central sobe o objeto dela');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
    values ('arquivos', gen_random_uuid()::text || '/' || gen_random_uuid()::text || '-a.pdf', (select auth.uid())::text)$$,
  '42501', null, 'nem a central sobe objeto na pasta de um cliente que não existe');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('arquivos', 'solto.pdf', (select auth.uid())::text)$$,
  '42501', null, 'objeto fora da pasta de um cliente é recusado');
reset role;

select testes.como('gestor_a');
select lives_ok($$select testes.objeto('f_gestor', 'c1')$$, 'o gestor sobe o objeto dele');
reset role;

select testes.como('admin_a');
select lives_ok($$select testes.objeto('f_admin', 'c1')$$, 'o administrador sobe o objeto dele');
reset role;

select testes.como('pessoa_a2');
select throws_ok($$select testes.objeto('f_x', 'c1')$$,
  '42501', null, 'quem não é a consultora do cliente não sobe objeto');
select is(testes.objetos('c1', array['f_central', 'f_pessoa', 'f_gestor']), 0::bigint,
  'nem vê os objetos do cliente');
reset role;

select testes.como('admin_b');
select throws_ok($$select testes.objeto('f_x', 'c1')$$, '42501', null, 'outra consultoria não sobe objeto');
select is(testes.objetos('c1', array['f_central', 'f_pessoa', 'f_gestor', 'f_admin']), 0::bigint,
  'nem vê os objetos (o link assinado precisa ver o objeto)');
reset role;

select testes.como('pessoa_a');
select is(testes.objetos('c1', array['f_central', 'f_pessoa', 'f_gestor', 'f_admin']), 4::bigint,
  'a consultora vê os objetos dos arquivos que ela vê');
-- Objeto que subiu sem linha (a gravação da linha falhou): só quem o enviou o enxerga e o tira.
select lives_ok($$select testes.objeto('f_solto', 'c1')$$, 'objeto sem linha (a linha não foi gravada)');
reset role;

select testes.como('gestor_a');
select is(testes.objetos('c1', array['f_solto']), 0::bigint, 'objeto sem linha não aparece para os outros');
with d as (delete from storage.objects where bucket_id = 'arquivos' and name = testes.caminho('c1', 'f_solto') returning 1)
select is(count(*), 0::bigint, 'nem é apagado por eles') from d;
select throws_ok($$insert into public.cliente_arquivos (cliente_id, caminho, nome, tamanho)
    values (testes.id('c1'), testes.caminho('c1', 'f_solto'), 'f_solto.pdf', 10)$$,
  'P0001', 'objeto_de_outra_pessoa', 'nem ganha uma linha gravada por eles (a linha passaria a mostrá-lo)');
reset role;

select testes.como('pessoa_a');
select is(testes.objetos('c1', array['f_solto']), 1::bigint, 'quem enviou vê o objeto sem linha');
with d as (delete from storage.objects where bucket_id = 'arquivos' and name = testes.caminho('c1', 'f_solto') returning 1)
select is(count(*), 1::bigint, 'e o tira do Storage') from d;
reset role;

-- ── Quem apaga ───────────────────────────────────────────────────────────────

select testes.como('admin_b');
with d as (delete from public.cliente_arquivos where id = testes.id('f_pessoa') returning 1)
select is(count(*), 0::bigint, 'outra consultoria não apaga arquivo') from d;
reset role;

select testes.como('pessoa_a2');
with d as (delete from public.cliente_arquivos where id = testes.id('f_pessoa') returning 1)
select is(count(*), 0::bigint, 'pessoa que não vê o cliente não apaga arquivo') from d;
reset role;

select testes.como('pessoa_a');
with d as (delete from public.cliente_arquivos where id = testes.id('f_gestor') returning 1)
select is(count(*), 0::bigint, 'a consultora não apaga o arquivo do gestor') from d;
with d as (delete from public.cliente_arquivos where id = testes.id('f_central') returning 1)
select is(count(*), 0::bigint, 'nem o da central') from d;
with d as (delete from storage.objects where bucket_id = 'arquivos' and name = testes.caminho('c1', 'f_pessoa') returning 1)
select is(count(*), 0::bigint, 'o objeto não sai do Storage enquanto a linha existe, nem para quem enviou') from d;
with d as (delete from public.cliente_arquivos where id = testes.id('f_pessoa') returning 1)
select is(count(*), 1::bigint, 'quem enviou apaga o próprio arquivo') from d;
with d as (delete from storage.objects where bucket_id = 'arquivos' and name = testes.caminho('c1', 'f_pessoa') returning 1)
select is(count(*), 1::bigint, 'e depois tira o objeto do Storage') from d;
reset role;

select testes.como('gestor_a');
with d as (delete from public.cliente_arquivos where id = testes.id('f_central') returning 1)
select is(count(*), 0::bigint, 'o gestor não apaga o arquivo da central') from d;
with d as (delete from public.cliente_arquivos where id = testes.id('f_pessoa2') returning 1)
select is(count(*), 1::bigint, 'o gestor apaga o arquivo que a consultora enviou') from d;
reset role;

select testes.como('admin_b');
with d as (delete from storage.objects where bucket_id = 'arquivos' and name = testes.caminho('c1', 'f_pessoa2') returning 1)
select is(count(*), 0::bigint, 'o objeto sem linha não é tirado por quem não enviou nem apagou a linha') from d;
reset role;

select testes.como('gestor_a');
with d as (delete from storage.objects where bucket_id = 'arquivos' and name = testes.caminho('c1', 'f_pessoa2') returning 1)
select is(count(*), 1::bigint, 'quem apagou a linha tira o objeto, mesmo sem ter enviado') from d;
reset role;

select ok(not has_table_privilege('authenticated', 'private.arquivos_apagados', 'select'),
  'a lista de quem apagou o quê não é lida pela API');

select testes.como('central');
with d as (delete from public.cliente_arquivos where id = testes.id('f_central2') returning 1)
select is(count(*), 1::bigint, 'a central apaga arquivo') from d;
reset role;

-- ── Cliente movido: a consultoria nova vê os da central, não os da antiga ─────

select testes.como_sistema();
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('c1');

select testes.como('admin_b');
select is(testes.linhas(array['f_central']), 1::bigint, 'a consultoria nova vê os arquivos da central');
select is(testes.linhas(array['f_gestor', 'f_admin']), 0::bigint, 'e não vê os da consultoria antiga');
select is(testes.objetos('c1', array['f_central', 'f_gestor', 'f_admin']), 1::bigint,
  'nem os objetos da consultoria antiga');
select lives_ok($$select testes.enviar('f_b', 'c1')$$, 'a consultoria nova envia arquivo');
select is((select consultoria_id from public.cliente_arquivos where id = testes.id('f_b')), testes.id('B'),
  'com a consultoria nova');
with d as (delete from public.cliente_arquivos where id = testes.id('f_central') returning 1)
select is(count(*), 0::bigint, 'a consultoria nova não apaga o arquivo da central') from d;
reset role;

select testes.como('admin_a');
select is(testes.linhas(array['f_central', 'f_gestor', 'f_admin', 'f_b']), 0::bigint,
  'a consultoria antiga não vê mais os arquivos do cliente que saiu dela');
with d as (delete from public.cliente_arquivos where id = testes.id('f_admin') returning 1)
select is(count(*), 0::bigint, 'nem apaga') from d;
reset role;

-- ── Estrutura ────────────────────────────────────────────────────────────────

select has_index('public', 'cliente_arquivos', 'cliente_arquivos_cliente_idx', 'Arquivos do cliente por data de envio');

select * from finish();
rollback;
