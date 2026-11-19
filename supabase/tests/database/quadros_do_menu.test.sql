-- Quadros do menu (desenho em docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md; plano em
-- docs/superpowers/plans/2026-11-17-quadros-pessoais-e-de-time.md, Task 2): criar (criar_quadro, com as três colunas),
-- renomear, arquivar e restaurar (update direto, só quem administra; o arquivado não se renomeia), apagar
-- (apagar_quadro, com tudo o que é dele e os caminhos da pasta no balde), o seletor (quadros_para_escolher), os
-- recentes (quadros_por_ids), os arquivados (quadros_arquivados), os favoritos (quadro_favoritos), os times do "Novo
-- quadro" (times_para_novo_quadro), o favorito no quadro_por_id (só fora do quadro do cliente) e o aviso no canal
-- quando muda a consultoria ou o papel de alguém. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(155);

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

-- Mudança feita pelo sistema (sem usuário logado). testes.como deixa o usuário nas configurações até o fim da
-- transação (reset role não limpa): limpa aqui.
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

create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform testes.sistema();
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Time da consultoria com o gestor e os membros (pelo sistema).
create function testes.time(p_nome text, p_consultoria text, p_gestor text, p_membros text[]) returns uuid
language plpgsql as $$
declare v uuid;
begin
  perform testes.sistema();
  insert into public.times (consultoria_id, nome, gestor_id)
  values (testes.id(p_consultoria), 'Time ' || p_nome, testes.id(p_gestor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  insert into public.time_membros (time_id, pessoa_id) select v, testes.id(m) from unnest(p_membros) m;
  return v;
end $$;

-- Quadro criado por quem está logado, pela função do app (p_time nulo: pessoal); guardado com o nome dado.
create function testes.criar(p_nome text, p_titulo text, p_time text default null) returns uuid language sql as $$
  select testes.guardar(p_nome, (public.criar_quadro(p_titulo, testes.id(p_time)) ->> 'id')::uuid)
$$;

-- A coluna do quadro com aquele nome (as três de criar_quadro), guardada com o nome dado.
create function testes.coluna(p_nome text, p_quadro text, p_titulo text) returns uuid language sql as $$
  select testes.guardar(p_nome,
    (select c.id from public.quadro_colunas c where c.quadro_id = testes.id(p_quadro) and c.nome = p_titulo))
$$;

-- Cartão gravado por quem está logado, como o app grava.
create function testes.novo_cartao(p_nome text, p_coluna text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.cartoes (coluna_id, titulo) values (testes.id(p_coluna), 'Cartão ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Quantas linhas um comando de quem está logado mudou.
create function testes.mudou(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Nomes do cenário de uma lista de itens com "id", em ordem.
create function testes.nomes(p_itens jsonb) returns text language sql stable as $$
  select coalesce(string_agg(f.nome, ',' order by o), '')
  from jsonb_array_elements(p_itens) with ordinality as x(i, o) join testes.fx f on f.id = (i ->> 'id')::uuid
$$;

-- Um grupo do seletor como texto: 'nomes | total'.
create function testes.grupo(p_grupo jsonb) returns text language sql stable as $$
  select testes.nomes(p_grupo -> 'itens') || ' | ' || (p_grupo ->> 'total')
$$;

-- O seletor de quem está logado, grupo por grupo: 'favoritos=...; meus=...; dos_times=...'.
create function testes.seletor(p_busca text default null, p_limite int default 20) returns text language plpgsql as $$
declare r jsonb := public.quadros_para_escolher(p_busca, p_limite);
begin
  return 'favoritos=' || testes.grupo(r -> 'favoritos') || '; meus=' || testes.grupo(r -> 'meus')
    || '; dos_times=' || testes.grupo(r -> 'dos_times');
end $$;

-- O item de um quadro (do cenário) dentro de uma lista.
create function testes.item(p_itens jsonb, p_quadro text) returns jsonb language sql stable as $$
  select i from jsonb_array_elements(p_itens) i where (i ->> 'id')::uuid = testes.id(p_quadro)
$$;

-- ── Storage ──
-- Objeto no balde, na pasta do quadro: quadro/<quadro>/<cartão ou uuid>/<uuid>-<nome>.pdf (ou imagens/<uuid>.png).
create function testes.c_quadro(p_quadro text, p_cartao text, p_arquivo text) returns text language sql stable as $$
  select 'quadro/' || testes.id(p_quadro)::text || '/' || testes.id(p_cartao)::text || '/' || testes.id(p_arquivo)::text
    || '-' || p_arquivo || '.pdf'
$$;

create function testes.i_quadro(p_quadro text, p_cartao text, p_imagem text) returns text language sql stable as $$
  select 'quadro/' || testes.id(p_quadro)::text || '/' || testes.id(p_cartao)::text || '/imagens/'
    || testes.id(p_imagem)::text || '.png'
$$;

-- O objeto no Storage, como a API do Storage grava no envio (dono = quem está logado).
create function testes.subir(p_caminho text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('quadros', p_caminho, (select auth.uid())::text, '{"size": 2048}')
$$;

create function testes.anexar(p_cartao text, p_caminho text) returns uuid language sql as $$
  insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho, tipo)
  values (testes.id(p_cartao), p_caminho, 'arquivo.pdf', 2048, 'application/pdf')
  returning id
$$;

create function testes.tirar(p_caminhos text[]) returns bigint language plpgsql as $$
declare n bigint;
begin
  with d as (delete from storage.objects where bucket_id = 'quadros' and name = any(p_caminhos) returning 1)
  select count(*) into n from d;
  return n;
end $$;

create function testes.ordenado(p_lista jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(p_lista) x
$$;

create function testes.ordem(p_caminhos text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(p_caminhos) x
$$;

create function testes.doc_imagem(p_src text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
    jsonb_build_object('type', 'image', 'attrs', jsonb_build_object('src', p_src))))
$$;

-- ── Tempo real ──
-- Os avisos de acesso (os que trazem "acesso") mandados no canal do quadro desde a última leitura, em ordem; e some com
-- todos os avisos do canal (só os do teste: o tópico é de um quadro criado aqui, e tudo volta no rollback).
create function testes.avisos(p_quadro text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(m.payload - 'id' order by m.inserted_at), '[]') into v
  from realtime.messages m where m.topic = 'quadro:' || testes.id(p_quadro)::text and m.payload ? 'acesso';
  delete from realtime.messages m where m.topic = 'quadro:' || testes.id(p_quadro)::text;
  return v;
end $$;

create function testes.acesso(p_tabela text, p_operacao text) returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('tabela', p_tabela, 'operacao', p_operacao, 'acesso', true))
$$;

-- Apagar direto em storage.objects só passa com esta configuração (o Storage faz o mesmo por dentro); quem decide o
-- que sai são as políticas.
select set_config('storage.allow_delete_query', 'true', true);

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: administrador; gestor_a (gestor do time T1), gestor_a2 (gestor de T2); m1 e m2 (membros de T1), m3
-- (membro de T2), fora (consultor do cliente cA, sem time), a_senha (membro de T1 que ainda precisa trocar a senha),
-- viajante (vai mudar de consultoria). Consultoria B: admin_b (gestor de TB) e b1 (membro de TB). Central e dono.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('dono1', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('gestor_a2', 'gestor', 'A');
select testes.perfil('m1', 'pessoa', 'A');
select testes.perfil('m2', 'pessoa', 'A');
select testes.perfil('m3', 'pessoa', 'A');
select testes.perfil('fora', 'pessoa', 'A');
select testes.perfil('a_senha', 'pessoa', 'A');
select testes.perfil('viajante', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('b1', 'pessoa', 'B');

select testes.time('T1', 'A', 'gestor_a', array['m1', 'm2', 'a_senha']);
select testes.time('T2', 'A', 'gestor_a2', array['m3']);
select testes.time('TB', 'B', 'admin_b', array['b1']);
update public.perfis set precisa_trocar_senha = true where id = testes.id('a_senha');

select testes.cliente('cA', 'A', 'fora');

-- ── A tabela de favoritos e as funções ───────────────────────────────────────

select columns_are('public', 'quadro_favoritos', array['perfil_id', 'quadro_id', 'criado_em'],
  'quadro_favoritos: quem marcou, o quadro e quando');
select col_is_pk('public', 'quadro_favoritos', array['perfil_id', 'quadro_id'], 'um favorito por pessoa e quadro');
select col_default_is('public', 'quadro_favoritos', 'perfil_id', 'auth.uid()', 'quem marca é quem está logado');
select has_index('public', 'quadro_favoritos', 'quadro_favoritos_quadro_idx', array['quadro_id'],
  'índice no quadro (o favorito sai junto com o quadro)');
select ok((select relrowsecurity from pg_class where oid = 'public.quadro_favoritos'::regclass), 'RLS ligado');
select policies_are('public', 'quadro_favoritos', array['ver os meus favoritos', 'marcar favorito', 'desmarcar favorito'],
  'favoritos: ver, marcar e desmarcar (não há o que editar)');
select ok(has_table_privilege('authenticated', 'public.quadro_favoritos', 'select')
    and has_column_privilege('authenticated', 'public.quadro_favoritos', 'quadro_id', 'insert')
    and not has_column_privilege('authenticated', 'public.quadro_favoritos', 'perfil_id', 'insert')
    and not has_table_privilege('authenticated', 'public.quadro_favoritos', 'update')
    and has_table_privilege('authenticated', 'public.quadro_favoritos', 'delete')
    and not has_table_privilege('anon', 'public.quadro_favoritos', 'select'),
  'quem está logado lê, marca (só o quadro) e desmarca; sem login, nada');
select ok(has_function_privilege('authenticated', 'public.criar_quadro(text, uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.apagar_quadro(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.quadros_para_escolher(text, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.quadros_por_ids(uuid[])', 'execute')
    and has_function_privilege('authenticated', 'public.quadros_arquivados(text, text, integer)', 'execute')
    and has_function_privilege('authenticated', 'public.times_para_novo_quadro(text, integer)', 'execute'),
  'as funções novas: quem está logado chama');
select ok(not has_function_privilege('anon', 'public.criar_quadro(text, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.apagar_quadro(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.quadros_para_escolher(text, integer)', 'execute')
    and not has_function_privilege('anon', 'public.quadros_por_ids(uuid[])', 'execute')
    and not has_function_privilege('anon', 'public.quadros_arquivados(text, text, integer)', 'execute')
    and not has_function_privilege('anon', 'public.times_para_novo_quadro(text, integer)', 'execute'),
  'sem login, não');
select hasnt_function('private', 'objetos_do_cartao', array['uuid', 'uuid'],
  'private.objetos_do_cartao, sem uso desde os quadros pessoais e de time, saiu');

-- ── Criar ────────────────────────────────────────────────────────────────────

select testes.como('m1');
select lives_ok($$select testes.criar('mTarefas', '  Minhas tarefas  ')$$, 'a pessoa cria um quadro pessoal');
reset role;
select is((select array[tipo, nome, pessoa_id::text, consultoria_id::text, criado_por::text, coalesce(time_id::text, '-')]
    from public.quadros where id = testes.id('mTarefas')),
  array['pessoa', 'Minhas tarefas', testes.id('m1')::text, testes.id('A')::text, testes.id('m1')::text, '-'],
  'pessoal, da pessoa, na consultoria dela, sem os espaços das pontas e criado por ela');
select is((select array_agg(nome || ':' || concluidos order by posicao) from public.quadro_colunas
    where quadro_id = testes.id('mTarefas')),
  array['A fazer:false', 'Em andamento:false', 'Concluído:true'],
  'nasce com "A fazer", "Em andamento" e "Concluído" (a de concluídos)');

select testes.como('m1');
select is((select array_agg(k) from jsonb_object_keys(public.criar_quadro('Ideias')) k), array['id'],
  'criar_quadro devolve só { id }');
select testes.guardar('mIdeias', (select id from public.quadros where pessoa_id = testes.id('m1') and nome = 'Ideias'));
select throws_ok($$select public.criar_quadro('MINHAS tarefás')$$, '23505', null,
  'nome repetido entre os abertos da pessoa (sem acento e sem maiúscula) é recusado');
select throws_ok($$select public.criar_quadro('   ')$$, '23514', null, 'nome em branco é recusado');
select throws_ok($$select public.criar_quadro(null)$$, '23514', null, 'sem nome também');
select throws_ok(format($$select public.criar_quadro(%L)$$, repeat('x', 81)), '23514', null,
  'nome com mais de 80 letras também');
select lives_ok($$select testes.criar('tSprint', 'Sprint', 'T1')$$, 'o membro cria quadro do time');
reset role;
select is((select array[tipo, nome, time_id::text, consultoria_id::text, criado_por::text, coalesce(pessoa_id::text, '-')]
    from public.quadros where id = testes.id('tSprint')),
  array['time', 'Sprint', testes.id('T1')::text, testes.id('A')::text, testes.id('m1')::text, '-'],
  'do time, na consultoria do time, criado pelo membro');
select is((select count(*)::int from public.quadro_colunas where quadro_id = testes.id('tSprint')), 3,
  'também com as três colunas');

select testes.como('m2');
select lives_ok($$select testes.criar('m2Tarefas', 'Minhas tarefas')$$, 'outra pessoa usa o mesmo nome no pessoal');
select throws_ok($$select public.criar_quadro('sprint', testes.id('T1'))$$, '23505', null,
  'nome repetido entre os abertos do time é recusado');
reset role;
select testes.como('gestor_a');
select lives_ok($$select testes.criar('tAcao', 'Ação comercial', 'T1')$$, 'o gestor do time cria quadro do time');
select lives_ok($$select testes.criar('gPessoal', 'Do gestor')$$, 'e o pessoal dele');
reset role;
select testes.como('admin_a');
select lives_ok($$select testes.criar('tPlan', 'Planejamento', 'T1')$$,
  'o administrador da consultoria cria quadro de um time em que não está');
select lives_ok($$select testes.criar('aPessoal', 'Do administrador')$$, 'e o pessoal dele');
select throws_ok($$select public.criar_quadro('Invasão', testes.id('TB'))$$, 'P0001', 'time_invalido',
  'mas não de time de outra consultoria');
reset role;
select testes.como('gestor_a2');
select lives_ok($$select testes.criar('tBacklog', 'Backlog', 'T2')$$, 'o gestor de T2 cria no time dele');
select throws_ok($$select public.criar_quadro('Fora', testes.id('T1'))$$, 'P0001', 'time_invalido',
  'e não no time de outro gestor');
reset role;
select testes.como('fora');
select throws_ok($$select public.criar_quadro('Fora', testes.id('T1'))$$, 'P0001', 'time_invalido',
  'quem está fora do time não cria quadro dele');
select throws_ok(format($$select public.criar_quadro('Fora', %L)$$, gen_random_uuid()), 'P0001', 'time_invalido',
  'nem de um time que não existe (a mesma resposta: sem saber se existe)');
select lives_ok($$select testes.criar('foraPessoal', 'Meu')$$, 'mas cria o pessoal');
reset role;
select testes.como('central1');
select lives_ok($$select testes.criar('cPessoal', 'Tarefas')$$, 'a central cria quadro pessoal');
select throws_ok($$select public.criar_quadro('Do time', testes.id('T1'))$$, 'P0001', 'sem_permissao',
  'mas não quadro de time');
reset role;
select is((select array[tipo, coalesce(consultoria_id::text, 'nula')] from public.quadros where id = testes.id('cPessoal')),
  array['pessoa', 'nula'], 'o pessoal da central fica sem consultoria');
select testes.como('dono1');
select lives_ok($$select testes.criar('dPessoal', 'Tarefas')$$, 'o dono também (o mesmo nome que a central usou)');
reset role;
select testes.como('b1');
select throws_ok($$select public.criar_quadro('Sprint', testes.id('T1'))$$, 'P0001', 'time_invalido',
  'quem é de outra consultoria não cria no time');
select lives_ok($$select testes.criar('bSprint', 'Sprint B', 'TB')$$, 'e cria no time dela');
reset role;
select testes.como('a_senha');
select throws_ok($$select public.criar_quadro('Sem sessão')$$, 'P0001', 'sem_permissao',
  'com a sessão não liberada (senha provisória), não cria');
reset role;

-- ── Renomear, arquivar e restaurar: só quem administra ───────────────────────

select testes.como('m1');
select is(testes.mudou($$update public.quadros set nome = 'Outro' where id = testes.id('tSprint')$$), 0::bigint,
  'o membro não renomeia o quadro do time (nem o que criou)');
select is(testes.mudou($$update public.quadros set arquivado_em = now() where id = testes.id('tSprint')$$), 0::bigint,
  'nem arquiva');
select is(testes.mudou($$update public.quadros set nome = 'Ideias boas' where id = testes.id('mIdeias')$$), 1::bigint,
  'renomeia o pessoal');
select is(testes.mudou($$update public.quadros set nome = 'Ideias' where id = testes.id('mIdeias')$$), 1::bigint,
  'e volta o nome');
reset role;
select testes.como('fora');
select is(testes.mudou($$update public.quadros set nome = 'Outro' where id = testes.id('tSprint')$$), 0::bigint,
  'quem está fora do time não renomeia');
select is(testes.mudou($$update public.quadros set nome = 'Outro' where id = testes.id('mIdeias')$$), 0::bigint,
  'nem o pessoal de outro');
reset role;
select testes.como('admin_a');
select is(testes.mudou($$update public.quadros set nome = 'Outro' where id = testes.id('mIdeias')$$), 0::bigint,
  'o administrador não renomeia o pessoal de ninguém');
select is(testes.mudou($$update public.quadros set nome = 'Planejamento 2026' where id = testes.id('tPlan')$$), 1::bigint,
  'mas renomeia o do time');
select is(testes.mudou($$update public.quadros set nome = 'Planejamento' where id = testes.id('tPlan')$$), 1::bigint,
  'e volta');
reset role;

select testes.como('gestor_a');
select testes.criar('tVelho', 'Velho', 'T1');
select is(testes.mudou($$update public.quadros set arquivado_em = now() where id = testes.id('tVelho')$$), 1::bigint,
  'o gestor do time arquiva');
select throws_ok($$update public.quadros set nome = 'Velhíssimo' where id = testes.id('tVelho')$$, 'P0001',
  'quadro_arquivado', 'quadro arquivado não se renomeia (só para ler; restaure antes)');
select is(testes.mudou($$update public.quadros set arquivado_em = null where id = testes.id('tVelho')$$), 1::bigint,
  'restaura');
select is(testes.mudou($$update public.quadros set nome = 'Velho renomeado' where id = testes.id('tVelho')$$), 1::bigint,
  'e depois de restaurar, renomeia');
select is(testes.mudou($$update public.quadros set nome = 'Velho', arquivado_em = now() where id = testes.id('tVelho')$$),
  1::bigint, 'renomear e arquivar juntos (estava aberto) passa');
reset role;
select testes.sistema();
select throws_ok($$update public.quadros set nome = 'Pelo sistema' where id = testes.id('tVelho')$$, 'P0001',
  'quadro_arquivado', 'nem o sistema renomeia o arquivado');
select testes.como('m1');
select testes.criar('mAntigo', 'Antigo');
select is(testes.mudou($$update public.quadros set arquivado_em = now() where id = testes.id('mAntigo')$$), 1::bigint,
  'a pessoa arquiva o pessoal');
select throws_ok($$update public.quadros set nome = 'Antigo 2' where id = testes.id('mAntigo')$$, 'P0001',
  'quadro_arquivado', 'e nem ela o renomeia arquivado');
reset role;

-- ── Favoritos ────────────────────────────────────────────────────────────────

select testes.como('m1');
select lives_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('mIdeias')),
  'a pessoa marca o próprio quadro pessoal como favorito');
select lives_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('tSprint')),
  'e um quadro do time dela');
select is((select perfil_id from public.quadro_favoritos where quadro_id = testes.id('tSprint')), testes.id('m1'),
  'o favorito é de quem marcou');
select throws_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('tSprint')), '23505',
  null, 'marcar de novo dá 23505 (a tela trata como já marcado)');
select throws_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('m2Tarefas')), '42501',
  null, 'não marca o pessoal de outra pessoa');
select throws_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('tBacklog')), '42501',
  null, 'nem quadro de um time em que não está');
select throws_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('bSprint')), '42501',
  null, 'nem de outra consultoria');
select throws_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, gen_random_uuid()), '42501',
  null, 'nem um id que não existe (sem dizer se existe)');
select throws_ok(format($$insert into public.quadro_favoritos (perfil_id, quadro_id) values (%L, %L)$$,
    testes.id('m2'), testes.id('tSprint')), '42501', null, 'nem marca em nome de outra pessoa');
reset role;
select testes.como('fora');
select testes.guardar('qA', (public.quadro_do_cliente(testes.id('cA')) ->> 'id')::uuid);
select throws_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('qA')), '42501',
  null, 'quadro do cliente não vira favorito (fica na aba do cliente)');
reset role;
select testes.como('m2');
select lives_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('tSprint')),
  'outro membro marca o mesmo quadro');
select is((select count(*)::int from public.quadro_favoritos), 1, 'e só vê o favorito dele');
reset role;
select testes.como('m1');
select is((select count(*)::int from public.quadro_favoritos), 2, 'cada um só vê os seus');
select is(testes.mudou(format($$delete from public.quadro_favoritos where perfil_id = %L$$, testes.id('m2'))), 0::bigint,
  'e não desmarca o de outro');
reset role;
select testes.como('admin_a');
select lives_ok(format($$insert into public.quadro_favoritos (quadro_id) values (%L)$$, testes.id('tBacklog')),
  'o administrador marca quadro de qualquer time da consultoria');
reset role;

-- ── quadro_por_id com o favorito ─────────────────────────────────────────────

select testes.como('m1');
select is(public.quadro_por_id(testes.id('tSprint')) -> 'favorito', 'true'::jsonb, 'quadro_por_id diz que é favorito');
select is(public.quadro_por_id(testes.id('tAcao')) -> 'favorito', 'false'::jsonb, 'ou que não é');
reset role;
select testes.como('m2');
select is(public.quadro_por_id(testes.id('tAcao')) -> 'favorito', 'false'::jsonb,
  'o favorito é de cada um (o de m1 não aparece para m2)');
reset role;
select testes.como('fora');
select is(public.quadro_por_id(testes.id('qA')), public.quadro_do_cliente(testes.id('cA')),
  'no quadro do cliente, quadro_por_id continua igual ao quadro_do_cliente (sem favorito)');
reset role;

-- ── O seletor ────────────────────────────────────────────────────────────────

-- Cartões: 3 em "Minhas tarefas" (1 arquivado) e 1 no Sprint.
select testes.como('m1');
select testes.coluna('mTarefas_afazer', 'mTarefas', 'A fazer');
select testes.coluna('tSprint_afazer', 'tSprint', 'A fazer');
select testes.novo_cartao('k1', 'mTarefas_afazer');
select testes.novo_cartao('k2', 'mTarefas_afazer');
select testes.novo_cartao('k3', 'mTarefas_afazer');
select testes.mudou($$update public.cartoes set arquivado_em = now() where id = testes.id('k3')$$);
select testes.novo_cartao('k4', 'tSprint_afazer');

select is(testes.seletor(),
  'favoritos=mIdeias,tSprint | 2; meus=mIdeias,mTarefas | 2; dos_times=tAcao,tPlan,tSprint | 3',
  'membro: favoritos, os pessoais dele (sem o arquivado) e os quadros do time dele, pelo nome');
select is(testes.item(public.quadros_para_escolher() -> 'meus' -> 'itens', 'mTarefas'),
  jsonb_build_object('id', testes.id('mTarefas'), 'nome', 'Minhas tarefas', 'tipo', 'pessoa', 'time', null,
    'cartoes', 2, 'favorito', false),
  'o item: id, nome, tipo, time, cartões (só os não arquivados) e favorito');
select is(testes.item(public.quadros_para_escolher() -> 'dos_times' -> 'itens', 'tSprint'),
  jsonb_build_object('id', testes.id('tSprint'), 'nome', 'Sprint', 'tipo', 'time',
    'time', jsonb_build_object('id', testes.id('T1'), 'nome', 'Time T1'), 'cartoes', 1, 'favorito', true),
  'no do time, o time { id, nome }');
select is(testes.seletor('acao'), 'favoritos= | 0; meus= | 0; dos_times=tAcao | 1',
  'a busca é sem acento e sem maiúscula, nos três grupos');
select is(testes.seletor('TAREFAS'), 'favoritos= | 0; meus=mTarefas | 1; dos_times= | 0', 'nos pessoais também');
select is(testes.seletor('%'), 'favoritos= | 0; meus= | 0; dos_times= | 0', 'o % da busca é letra, não curinga');
select is(testes.seletor(null, 1), 'favoritos=mIdeias | 2; meus=mIdeias | 2; dos_times=tAcao | 3',
  'o limite vale por grupo e o total continua o de todos');
select is(testes.seletor(null, 0), 'favoritos=mIdeias | 2; meus=mIdeias | 2; dos_times=tAcao | 3',
  'limite abaixo de 1 vira 1');
select is(jsonb_array_length(public.quadros_para_escolher(null, 500) -> 'dos_times' -> 'itens'), 3,
  'e acima de 50 vira 50 (aqui, todos os 3)');
reset role;

select testes.como('admin_a');
select is(testes.seletor(),
  'favoritos=tBacklog | 1; meus=aPessoal | 1; dos_times=tAcao,tPlan,tSprint,tBacklog | 4',
  'administrador: todos os quadros de time da consultoria, pelo nome do time e depois do quadro; nunca o pessoal de outro');
reset role;
select testes.como('gestor_a2');
select is(testes.seletor(), 'favoritos= | 0; meus= | 0; dos_times=tBacklog | 1',
  'gestor de T2: só os quadros do time dele');
reset role;
select testes.como('central1');
select is(testes.seletor(), 'favoritos= | 0; meus=cPessoal | 1; dos_times= | 0',
  'central: só os pessoais dela, sem Dos times');
reset role;
select testes.como('dono1');
select is(testes.seletor(), 'favoritos= | 0; meus=dPessoal | 1; dos_times= | 0', 'dono: o mesmo');
reset role;
select testes.como('b1');
select is(testes.seletor(), 'favoritos= | 0; meus= | 0; dos_times=bSprint | 1',
  'outra consultoria: só os dela');
reset role;
select testes.como('a_senha');
select throws_ok($$select public.quadros_para_escolher()$$, 'P0001', 'sem_permissao',
  'sessão não liberada: sem_permissao');
reset role;

-- Arquivar tira do seletor (e do favorito); restaurar volta.
select testes.como('gestor_a');
select testes.mudou($$update public.quadros set arquivado_em = now() where id = testes.id('tSprint')$$);
reset role;
select testes.como('m1');
select is(testes.seletor(), 'favoritos=mIdeias | 1; meus=mIdeias,mTarefas | 2; dos_times=tAcao,tPlan | 2',
  'quadro arquivado sai do seletor, inclusive dos favoritos');
reset role;
select testes.como('gestor_a');
select testes.mudou($$update public.quadros set arquivado_em = null where id = testes.id('tSprint')$$);
reset role;
select testes.como('m1');
select is(testes.seletor(), 'favoritos=mIdeias,tSprint | 2; meus=mIdeias,mTarefas | 2; dos_times=tAcao,tPlan,tSprint | 3',
  'e volta ao restaurar, com o favorito guardado');
reset role;

-- Perder o acesso tira o favorito da lista; recuperar devolve.
select testes.sistema();
delete from public.time_membros where time_id = testes.id('T1') and pessoa_id = testes.id('m2');
select testes.como('m2');
select is(testes.seletor(), 'favoritos= | 0; meus=m2Tarefas | 1; dos_times= | 0',
  'tirado do time: o favorito e os quadros do time somem');
select is(public.quadros_por_ids(array[testes.id('tSprint')]), '[]'::jsonb, 'nem pelos recentes');
reset role;
select is((select count(*)::int from public.quadro_favoritos where perfil_id = testes.id('m2')), 1,
  'mas o favorito fica guardado');
select testes.sistema();
insert into public.time_membros (time_id, pessoa_id) values (testes.id('T1'), testes.id('m2'));
select testes.como('m2');
select is(testes.seletor(), 'favoritos=tSprint | 1; meus=m2Tarefas | 1; dos_times=tAcao,tPlan,tSprint | 3',
  'voltou ao time: o favorito volta');
reset role;

-- ── Recentes: quadros_por_ids ────────────────────────────────────────────────

select testes.como('m1');
select is(testes.nomes(public.quadros_por_ids(array[testes.id('tSprint'), testes.id('m2Tarefas'), testes.id('qA'),
    testes.id('mAntigo'), testes.id('bSprint'), testes.id('mIdeias'), gen_random_uuid(), testes.id('tSprint'),
    testes.id('tBacklog'), testes.id('cPessoal')])),
  'tSprint,mIdeias',
  'só os pessoais e de time abertos que vê, na ordem dos ids, sem repetir: nem pessoal de outro, de cliente, arquivado, '
  || 'de outra consultoria, de outro time ou que não existe (sem erro)');
select is(testes.nomes(public.quadros_por_ids(array[testes.id('mIdeias'), testes.id('tSprint')])), 'mIdeias,tSprint',
  'na ordem que veio');
select is(testes.item(public.quadros_por_ids(array[testes.id('mTarefas')]), 'mTarefas') -> 'cartoes', '2'::jsonb,
  'com o mesmo item do seletor');
select is(testes.nomes(public.quadros_por_ids(array_fill(gen_random_uuid(), array[20]) || testes.id('mIdeias'))), '',
  'até 20 ids (o 21º fica de fora)');
select is(public.quadros_por_ids(null), '[]'::jsonb, 'nada pedido, nada devolvido');
select is(public.quadros_por_ids('{}'), '[]'::jsonb, 'lista vazia também');
reset role;
select testes.como('central1');
select is(testes.nomes(public.quadros_por_ids(array[testes.id('cPessoal'), testes.id('tSprint'), testes.id('mIdeias')])),
  'cPessoal', 'a central: só o pessoal dela');
reset role;

-- ── Arquivados ───────────────────────────────────────────────────────────────

-- T2 com 16 quadros arquivados (horas diferentes: o mais novo é o 16) e um pessoal arquivado do gestor de T2.
select testes.sistema();
insert into public.quadros (tipo, time_id, nome)
select 'time', testes.id('T2'), 'Arquivado ' || lpad(n::text, 2, '0') from generate_series(1, 16) n;
insert into testes.fx select 'arq' || lpad(substr(nome, 11), 2, '0'), id from public.quadros
where time_id = testes.id('T2') and nome like 'Arquivado %';
insert into public.quadros (tipo, pessoa_id, consultoria_id, nome)
values ('pessoa', testes.id('gestor_a2'), testes.id('A'), 'Pessoal arquivado');
select testes.guardar('g2Arq', (select id from public.quadros where pessoa_id = testes.id('gestor_a2') and nome = 'Pessoal arquivado'));
-- A hora de cada arquivamento (o gatilho põe a hora do banco, a mesma em toda a transação): só para o teste.
set local session_replication_role = replica;
update public.quadros set arquivado_em = now() - (17 - substr(nome, 11)::int) * interval '1 hour'
where time_id = testes.id('T2') and nome like 'Arquivado %';
update public.quadros set arquivado_em = now() - interval '30 minutes' where id = testes.id('g2Arq');
set local session_replication_role = origin;

select testes.como('gestor_a2');
select is(testes.nomes(public.quadros_arquivados() -> 'itens'),
  'g2Arq,arq16,arq15,arq14,arq13,arq12,arq11,arq10,arq09,arq08,arq07,arq06,arq05,arq04,arq03',
  'os 15 mais recentes primeiro (pessoais e do time juntos)');
select is((public.quadros_arquivados() ->> 'total')::int, 17, 'com o total');
select is(testes.nomes(public.quadros_arquivados(null, null, 2) -> 'itens'), 'arq02,arq01', 'e a página 2');
select is(testes.nomes(public.quadros_arquivados(null, 'pessoa') -> 'itens'), 'g2Arq', 'filtro: só os pessoais');
select is((public.quadros_arquivados(null, 'time') ->> 'total')::int, 16, 'filtro: só os do time');
select is(testes.nomes(public.quadros_arquivados('arquivado 07') -> 'itens'), 'arq07', 'com busca');
select throws_ok($$select public.quadros_arquivados(null, 'cliente')$$, '22023', 'filtro_invalido',
  'outro tipo: filtro_invalido');
select is(testes.item(public.quadros_arquivados() -> 'itens', 'arq16') - 'arquivado_em',
  jsonb_build_object('id', testes.id('arq16'), 'nome', 'Arquivado 16', 'tipo', 'time',
    'time', jsonb_build_object('id', testes.id('T2'), 'nome', 'Time T2'), 'cartoes', 0, 'favorito', false,
    'pode_administrar', true),
  'o item do seletor, com pode_administrar (o gestor do time administra)');
select ok((testes.item(public.quadros_arquivados() -> 'itens', 'arq16') ->> 'arquivado_em') is not null,
  'e arquivado_em');
reset role;
select testes.como('m3');
select is((public.quadros_arquivados() ->> 'total')::int, 16, 'o membro de T2 vê os arquivados do time');
select is(testes.item(public.quadros_arquivados() -> 'itens', 'arq16') -> 'pode_administrar', 'false'::jsonb,
  'mas não os administra');
reset role;
select testes.como('admin_a');
select is(testes.nomes(public.quadros_arquivados() -> 'itens'),
  'tVelho,arq16,arq15,arq14,arq13,arq12,arq11,arq10,arq09,arq08,arq07,arq06,arq05,arq04,arq03',
  'o administrador vê os arquivados de todos os times da consultoria (e não o pessoal do gestor de T2)');
select is((public.quadros_arquivados() ->> 'total')::int, 17, 'os 16 de T2 e o Velho de T1 (o Antigo é pessoal de m1)');
reset role;
select testes.como('m1');
select is((select string_agg(n, ',' order by n)
    from unnest(string_to_array(testes.nomes(public.quadros_arquivados() -> 'itens'), ',')) n), 'mAntigo,tVelho',
  'm1: o pessoal arquivado dele e o arquivado do time dele');
reset role;
select testes.como('central1');
select is(public.quadros_arquivados(), jsonb_build_object('itens', '[]'::jsonb, 'total', 0),
  'a central não tem arquivados (nem de time)');
reset role;

-- ── Times do "Novo quadro" ───────────────────────────────────────────────────

select testes.como('m1');
select is(testes.nomes(public.times_para_novo_quadro() -> 'itens'), 'T1', 'o membro: os times dele');
select is(public.times_para_novo_quadro() -> 'itens' -> 0, jsonb_build_object('id', testes.id('T1'), 'nome', 'Time T1'),
  'cada item: { id, nome }');
reset role;
select testes.como('gestor_a2');
select is(testes.nomes(public.times_para_novo_quadro() -> 'itens'), 'T2', 'o gestor: os times que gere');
reset role;
select testes.como('admin_a');
select is(testes.nomes(public.times_para_novo_quadro() -> 'itens'), 'T1,T2', 'o administrador: todos da consultoria');
select is(testes.grupo(public.times_para_novo_quadro('t2')), 'T2 | 1', 'com busca');
select is(testes.grupo(public.times_para_novo_quadro(null, 1)), 'T1 | 2', 'e limite, com o total');
reset role;
select testes.como('fora');
select is(public.times_para_novo_quadro(), jsonb_build_object('itens', '[]'::jsonb, 'total', 0),
  'quem não está em time: nenhum');
reset role;
select testes.como('central1');
select is(public.times_para_novo_quadro(), jsonb_build_object('itens', '[]'::jsonb, 'total', 0), 'a central: nenhum');
reset role;
select testes.como('b1');
select is(testes.nomes(public.times_para_novo_quadro() -> 'itens'), 'TB', 'outra consultoria: os dela');
reset role;

-- ── Apagar ───────────────────────────────────────────────────────────────────

-- O quadro qDel do time T1 com dois cartões (checklist, comentário, responsável, anexo e imagem), favorito de m1 e m2 e
-- uma sobra na pasta (objeto de um cartão apagado antes por outra pessoa); qKeep, outro quadro do time, com um objeto.
insert into testes.fx select n, gen_random_uuid() from unnest(array['a1', 'i1', 'sobra', 'cartao_velho', 'aKeep']) n;
select testes.como('m1');
select testes.criar('qDel', 'Para apagar', 'T1');
select testes.criar('qKeep', 'Fica', 'T1');
select testes.coluna('qDel_afazer', 'qDel', 'A fazer');
select testes.coluna('qKeep_afazer', 'qKeep', 'A fazer');
select testes.novo_cartao('kd1', 'qDel_afazer');
select testes.novo_cartao('kd2', 'qDel_afazer');
select testes.novo_cartao('kk1', 'qKeep_afazer');
insert into public.cartao_checklist (cartao_id, texto) values (testes.id('kd1'), 'Item');
insert into public.cartao_comentarios (cartao_id, texto) values (testes.id('kd1'), 'Comentário');
insert into public.cartao_responsaveis (cartao_id, perfil_id) values (testes.id('kd1'), testes.id('m1'));
select testes.subir(testes.c_quadro('qDel', 'kd1', 'a1'));
select testes.anexar('kd1', testes.c_quadro('qDel', 'kd1', 'a1'));
select testes.subir(testes.i_quadro('qDel', 'kd2', 'i1'));
select testes.mudou(format($$update public.cartoes set descricao = %L where id = testes.id('kd2')$$,
  testes.doc_imagem(testes.i_quadro('qDel', 'kd2', 'i1'))));
select testes.subir(testes.c_quadro('qKeep', 'kk1', 'aKeep'));
select testes.anexar('kk1', testes.c_quadro('qKeep', 'kk1', 'aKeep'));
insert into public.quadro_favoritos (quadro_id) values (testes.id('qDel'));
reset role;
select testes.como('m2');
insert into public.quadro_favoritos (quadro_id) values (testes.id('qDel'));
reset role;
-- A sobra: objeto de m2 num cartão que já não existe (fica na pasta do quadro).
select testes.sistema();
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('quadros', testes.c_quadro('qDel', 'cartao_velho', 'sobra'), testes.id('m2')::text, '{"size": 1}');

select testes.como('m1');
select throws_ok($$select public.apagar_quadro(testes.id('qDel'))$$, 'P0001', 'sem_permissao',
  'o membro não apaga o quadro do time (nem o que criou)');
reset role;
select testes.como('fora');
select throws_ok($$select public.apagar_quadro(testes.id('qDel'))$$, 'P0001', 'sem_permissao', 'quem está fora também não');
select throws_ok($$select public.apagar_quadro(testes.id('qA'))$$, 'P0001', 'sem_permissao',
  'quadro do cliente não se apaga por aqui');
reset role;
select testes.como('admin_b');
select throws_ok($$select public.apagar_quadro(testes.id('qDel'))$$, 'P0001', 'sem_permissao',
  'nem o administrador de outra consultoria');
select throws_ok(format($$select public.apagar_quadro(%L)$$, gen_random_uuid()), 'P0001', 'sem_permissao',
  'id que não existe: a mesma resposta');
reset role;
select testes.como('admin_a');
select throws_ok($$select public.apagar_quadro(testes.id('mIdeias'))$$, 'P0001', 'sem_permissao',
  'o administrador não apaga o pessoal de ninguém');
reset role;

select testes.sistema();
select testes.avisos('qDel');
create table testes.apagado (r jsonb);
insert into testes.apagado values (null);
grant select, update on testes.apagado to authenticated;
select testes.como('gestor_a');
select lives_ok($$update testes.apagado set r = public.apagar_quadro(testes.id('qDel'))$$, 'o gestor do time apaga o quadro');
select is(testes.ordenado((select r from testes.apagado) -> 'caminhos'),
  testes.ordem(array[testes.c_quadro('qDel', 'kd1', 'a1'), testes.i_quadro('qDel', 'kd2', 'i1'),
    testes.c_quadro('qDel', 'cartao_velho', 'sobra')]),
  'devolve todos os objetos da pasta do quadro (anexo, imagem e a sobra), e nada de outra pasta');
select is(testes.tirar(testes.ordenado((select r from testes.apagado) -> 'caminhos')), 3::bigint,
  'e quem apagou tira todos do balde (também a sobra de outra pessoa)');
reset role;
select is((select array[
    (select count(*) from public.quadros where id = testes.id('qDel')),
    (select count(*) from public.quadro_colunas where quadro_id = testes.id('qDel')),
    (select count(*) from public.cartoes where id in (testes.id('kd1'), testes.id('kd2'))),
    (select count(*) from public.cartao_checklist where cartao_id = testes.id('kd1')),
    (select count(*) from public.cartao_comentarios where cartao_id = testes.id('kd1')),
    (select count(*) from public.cartao_responsaveis where cartao_id = testes.id('kd1')),
    (select count(*) from public.cartao_anexos where cartao_id = testes.id('kd1')),
    (select count(*) from public.quadro_favoritos where quadro_id = testes.id('qDel'))]::int[]),
  array[0, 0, 0, 0, 0, 0, 0, 0],
  'o quadro sai com as colunas, os cartões, o checklist, os comentários, os responsáveis, os anexos e os favoritos');
select is((select count(*)::int from storage.objects where bucket_id = 'quadros'
    and name = testes.c_quadro('qKeep', 'kk1', 'aKeep')), 1, 'o objeto do outro quadro continua no balde');
select is((select count(*)::int from public.cartoes where id = testes.id('kk1')), 1, 'e o cartão dele também');
select ok(testes.avisos('qDel') @> testes.acesso('quadros', 'delete'),
  'o canal do quadro avisa que ele foi apagado (quem estava nele relê e vê "sem acesso")');

select testes.como('admin_a');
select is(public.apagar_quadro(testes.id('tVelho')), jsonb_build_object('caminhos', '[]'::jsonb),
  'o administrador apaga um quadro arquivado do time (sem objetos: caminhos vazio)');
reset role;
select testes.como('m1');
select is(public.apagar_quadro(testes.id('mAntigo')) -> 'caminhos', '[]'::jsonb, 'a pessoa apaga o próprio pessoal');
select is((select count(*)::int from public.quadros where id in (testes.id('tVelho'), testes.id('mAntigo'))), 0,
  'e eles saem');
reset role;

-- ── Aviso no canal quando muda a consultoria ou o papel ──────────────────────

select testes.como('viajante');
select testes.criar('vPessoal', 'Viagem');
reset role;
select testes.sistema();
select testes.avisos('vPessoal');
select testes.avisos('tSprint');
select testes.avisos('tBacklog');
select testes.avisos('bSprint');
select testes.avisos('mIdeias');

update public.perfis set consultoria_id = testes.id('B') where id = testes.id('viajante');
select is(testes.avisos('vPessoal'), testes.acesso('perfis', 'update'),
  'mudou de consultoria: o canal de cada quadro pessoal dela avisa (a tela relê e vê "sem acesso")');
select is(testes.avisos('tSprint'), '[]'::jsonb, 'os quadros de time de quem não tem nada com ela não recebem nada');
update public.perfis set consultoria_id = testes.id('A') where id = testes.id('viajante');
select is(testes.avisos('vPessoal'), testes.acesso('perfis', 'update'), 'voltar também avisa');

update public.perfis set papel = 'admin' where id = testes.id('m3');
select is(testes.avisos('tSprint') || testes.avisos('tBacklog'),
  testes.acesso('perfis', 'update') || testes.acesso('perfis', 'update'),
  'virou administrador: os quadros de time da consultoria avisam');
select is(testes.avisos('bSprint'), '[]'::jsonb, 'os de outra consultoria não');
update public.perfis set papel = 'pessoa' where id = testes.id('m3');
select is(testes.avisos('tSprint'), testes.acesso('perfis', 'update'), 'deixou de ser administrador: também avisa');
select testes.avisos('tBacklog');

update public.perfis set papel = 'gestor' where id = testes.id('m1');
select is(testes.avisos('mIdeias'), testes.acesso('perfis', 'update'), 'mudou de papel: os pessoais dela avisam');
select is(testes.avisos('tSprint'), '[]'::jsonb,
  'e os do time não (continua membro; não é administrador nem gestor do time)');

update public.perfis set consultoria_id = testes.id('B') where id = testes.id('gestor_a2');
select ok(testes.avisos('tBacklog') @> testes.acesso('perfis', 'update'),
  'o gestor do time mudou de consultoria: os quadros do time que ele gere avisam');
select testes.como('gestor_a2');
select is(public.quadro_por_id(testes.id('tBacklog')), null, 'e ele perde o acesso');
reset role;
select testes.sistema();

update public.perfis set nome = 'Outro nome' where id = testes.id('m1');
select is(testes.avisos('mIdeias'), '[]'::jsonb, 'mudar outra coisa da pessoa não avisa');

select * from finish();
rollback;
