-- Quadros de consultorias anteriores para a central (desenho do Kanban, "Cliente muda de consultoria": a central vê os
-- quadros de todas as consultorias que atenderam o cliente, só para ler — mesmo molde de Arquivos e Check-ins).
-- quadros_do_cliente: só a central e o dono; quadro_por_id: pela regra de quem vê o quadro (private.vejo_quadro).
-- Também: a regra morta "apagar cartão" saiu (cartão só se apaga por apagar_cartao) e os arquivados trazem quem criou.
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select, insert on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.guardar(p_nome text, p_id uuid) returns uuid language sql as $$
  insert into testes.fx values (p_nome, p_id) returning id
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

create function testes.sistema() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform testes.sistema();
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

create function testes.abrir(p_quadro text, p_cliente text) returns uuid language sql as $$
  select testes.guardar(p_quadro, (public.quadro_do_cliente(testes.id(p_cliente)) ->> 'id')::uuid)
$$;

create function testes.coluna(p_quadro text, p_nome text) returns uuid language sql stable as $$
  select id from public.quadro_colunas where quadro_id = testes.id(p_quadro) and nome = p_nome
$$;

-- Os ids da lista de quadros, em ordem, pelos nomes do cenário.
create function testes.ids(p_lista jsonb) returns text language sql stable as $$
  select coalesce(string_agg(f.nome, ',' order by o), '')
  from jsonb_array_elements(p_lista) with ordinality as x(i, o) join testes.fx f on f.id = (i ->> 'id')::uuid
$$;

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- cMove começa na consultoria A (consultor a1), que abre o quadro qA com um cartão e um arquivado; depois vai para B
-- (consultor b1), que abre o quadro qB. cNada nunca teve quadro.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('dono1', 'dono', null);
select testes.perfil('central_senha', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('a1', 'pessoa', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('b1', 'pessoa', 'B');
update public.perfis set precisa_trocar_senha = true where id = testes.id('central_senha');

select testes.cliente('cMove', 'A', 'a1');
select testes.cliente('cNada', 'A', 'a1');

select testes.como('a1');
select testes.abrir('qA', 'cMove');
insert into public.cartoes (coluna_id, titulo) values (testes.coluna('qA', 'A fazer'), 'Levantar contratos');
insert into public.cartoes (coluna_id, titulo) values (testes.coluna('qA', 'A fazer'), 'Revisar boletos');
update public.cartoes set arquivado_em = now() where quadro_id = testes.id('qA') and titulo = 'Revisar boletos';
reset role;

select testes.sistema();
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('cMove');
update public.clientes set consultor_id = testes.id('b1') where id = testes.id('cMove');

select testes.como('b1');
select testes.abrir('qB', 'cMove');
reset role;

-- ── Quem chama ───────────────────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.quadros_do_cliente(uuid)', 'execute'),
  'quem não está logado não lista os quadros do cliente');
select ok(not has_function_privilege('anon', 'public.quadro_por_id(uuid)', 'execute'),
  'nem abre um quadro pelo id');
select ok(has_function_privilege('authenticated', 'public.quadros_do_cliente(uuid)', 'execute'),
  'quem está logado chama quadros_do_cliente (a função confere o papel)');
select ok(has_function_privilege('authenticated', 'public.quadro_por_id(uuid)', 'execute'),
  'e quadro_por_id (a função confere quem vê)');

-- ── quadros_do_cliente: só a central e o dono ────────────────────────────────

select testes.como('central1');
select is(testes.ids(public.quadros_do_cliente(testes.id('cMove'))), 'qB,qA',
  'a central vê os dois quadros do cliente, o da consultoria que atende primeiro');
select is(public.quadros_do_cliente(testes.id('cMove')) -> 0 -> 'atual', 'true'::jsonb, 'o primeiro é o atual');
select is(public.quadros_do_cliente(testes.id('cMove')) -> 1 -> 'atual', 'false'::jsonb, 'o outro é de uma consultoria anterior');
select is(public.quadros_do_cliente(testes.id('cMove')) -> 0 -> 'consultoria' ->> 'nome', 'Consultoria B',
  'com o nome da consultoria (para o seletor da barra)');
select is(public.quadros_do_cliente(testes.id('cMove')) -> 1 -> 'consultoria' ->> 'id', testes.id('A')::text,
  'e o id dela');
select ok((public.quadros_do_cliente(testes.id('cMove')) -> 1 ->> 'criado_em') is not null, 'e quando o quadro nasceu');
select is(public.quadros_do_cliente(testes.id('cNada')), '[]'::jsonb, 'cliente sem quadro: lista vazia');
select is(public.quadros_do_cliente(gen_random_uuid()), '[]'::jsonb, 'cliente que não existe: lista vazia');
reset role;

select testes.como('dono1');
select is(testes.ids(public.quadros_do_cliente(testes.id('cMove'))), 'qB,qA', 'o dono também');
reset role;

select testes.como('b1');
select throws_ok($$select public.quadros_do_cliente(testes.id('cMove'))$$, 'P0001', 'sem_permissao',
  'o consultor da consultoria que atende não lista os quadros (veria o da consultoria anterior)');
reset role;
select testes.como('gestor_b');
select throws_ok($$select public.quadros_do_cliente(testes.id('cMove'))$$, 'P0001', 'sem_permissao',
  'nem a gestão da consultoria que atende');
reset role;
select testes.como('a1');
select throws_ok($$select public.quadros_do_cliente(testes.id('cMove'))$$, 'P0001', 'sem_permissao',
  'nem o consultor da consultoria antiga');
reset role;
select testes.como('admin_a');
select throws_ok($$select public.quadros_do_cliente(testes.id('cMove'))$$, 'P0001', 'sem_permissao',
  'nem a administração da consultoria antiga');
reset role;
select testes.como('central_senha');
select throws_ok($$select public.quadros_do_cliente(testes.id('cMove'))$$, 'P0001', 'sem_permissao',
  'a central com a sessão não liberada (senha provisória) também não');
reset role;

-- ── quadro_por_id: pela regra de quem vê o quadro ───────────────────────────

select testes.como('central1');
select is((public.quadro_por_id(testes.id('qA')) ->> 'id')::uuid, testes.id('qA'),
  'a central abre o quadro da consultoria anterior');
select is(public.quadro_por_id(testes.id('qA')) -> 'pode_mexer', 'false'::jsonb, 'só para ler');
select is(public.quadro_por_id(testes.id('qA')) -> 'pode_gerir', 'false'::jsonb, 'sem gerir');
select is((select string_agg(c ->> 'nome', ',' order by o) from jsonb_array_elements(public.quadro_por_id(testes.id('qA')) -> 'colunas') with ordinality as x(c, o)),
  'A fazer,Em andamento,Concluído', 'com as colunas em ordem');
select is(public.quadro_por_id(testes.id('qA')) -> 'colunas' -> 0 -> 'cartoes', '1'::jsonb,
  'e quantos cartões cada coluna tem');
select is(public.quadro_por_id(testes.id('qA')) -> 'colunas' -> 0 -> 'arquivados', '1'::jsonb, 'e quantos arquivados');
select is(public.quadro_por_id(testes.id('qA')) ->> 'consultoria_id', testes.id('A')::text, 'de que consultoria é');
select is(public.quadro_por_id(testes.id('qB')), public.quadro_do_cliente(testes.id('cMove')),
  'o quadro atual pelo id é o mesmo que quadro_do_cliente devolve');
select is(public.quadro_por_id(gen_random_uuid()), null, 'quadro que não existe: nulo');
reset role;

select testes.como('b1');
select is(public.quadro_por_id(testes.id('qB')), public.quadro_do_cliente(testes.id('cMove')),
  'o consultor de agora abre o quadro atual pelo id, igual ao quadro_do_cliente (pode mexer)');
select is(public.quadro_por_id(testes.id('qA')), null, 'mas não o da consultoria anterior');
reset role;
select testes.como('gestor_b');
select is(public.quadro_por_id(testes.id('qA')), null, 'nem a gestão da consultoria de agora');
reset role;
select testes.como('a1');
select is(public.quadro_por_id(testes.id('qA')), null, 'a consultoria antiga perdeu o próprio quadro (o cliente saiu dela)');
select is(public.quadro_por_id(testes.id('qB')), null, 'e não vê o da consultoria nova');
reset role;
select testes.como('admin_a');
select is(public.quadro_por_id(testes.id('qA')), null, 'nem a administração da antiga');
reset role;
select testes.como('central_senha');
select throws_ok(format($$select public.quadro_por_id(%L)$$, testes.id('qA')), 'P0001', 'sem_permissao',
  'sessão não liberada não abre quadro');
reset role;

-- ── Arquivados trazem quem criou (a tela mostra Apagar a quem criou e à gestão) ──

select testes.como('central1');
select is(public.cartoes_arquivados(testes.id('qA')) -> 'itens' -> 0 ->> 'criado_por', testes.id('a1')::text,
  'cada arquivado diz quem o criou');
select is(public.cartoes_arquivados(testes.id('qA')) -> 'itens' -> 0 ->> 'titulo', 'Revisar boletos',
  'e continua com o resto (título, coluna, datas)');
reset role;

-- ── A regra morta "apagar cartão" saiu ──────────────────────────────────────

select policies_are('public', 'cartoes', array['ver cartões', 'criar cartão', 'editar cartão'],
  'cartões: só ver, criar e editar pela tabela; apagar só por apagar_cartao (sem delete para quem está logado)');
select ok(not has_table_privilege('authenticated', 'public.cartoes', 'delete'), 'e o delete continua tirado');

select * from finish();
rollback;
