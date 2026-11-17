-- Quadro em tempo real (plano docs/superpowers/plans/2026-11-17-kanban-do-cliente.md, Task 3; desenho em
-- docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md, "Tempo real"): quem entra no canal privado
-- "quadro:<id>" do Supabase Realtime (a regra em realtime.messages, conferida pela mesma função que o servidor do
-- Realtime chama ao entrar no canal, realtime.authorize), o que os gatilhos avisam no canal (tabela, operação e ids;
-- nunca o texto do cartão, da descrição ou do comentário; um aviso por comando, não por linha) e as sobras da Task 2
-- (cartão só se apaga por apagar_cartao; objetos_para_tirar_do_quadro só para a central). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(63);

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

create function testes.coluna(p_nome text, p_quadro text, p_titulo text) returns uuid language sql as $$
  select testes.guardar(p_nome,
    (select id from public.quadro_colunas where quadro_id = testes.id(p_quadro) and nome = p_titulo))
$$;

create function testes.nova_coluna(p_nome text, p_quadro text, p_titulo text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.quadro_colunas (quadro_id, nome) values (testes.id(p_quadro), p_titulo) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.novo_cartao(p_nome text, p_coluna text, p_titulo text default null) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.cartoes (coluna_id, titulo) values (testes.id(p_coluna), coalesce(p_titulo, 'Cartão ' || p_nome))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Entra no canal? É a conferência que o servidor do Realtime faz ao entrar num canal privado (realtime.authorize: grava
-- uma mensagem de prova no tópico e vê se a pessoa, com o papel e o token dela, a enxerga). Roda sem papel (reset role).
-- p_extensao: 'broadcast' (os avisos) ou 'presence'. p_nome nulo = anônimo.
create function testes.ouve(p_nome text, p_topico text, p_extensao text default 'broadcast') returns boolean
language sql as $$
  select a.read_allowed[1]
  from realtime.authorize(
    case when p_nome is null then 'anon' else 'authenticated' end,
    p_topico,
    case when p_nome is null then '{"role": "anon"}'
      else json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text end,
    coalesce(testes.id(p_nome)::text, ''),
    '{}',
    array[p_extensao],
    array[]::text[]) a
$$;

-- Pode mandar mensagem no canal (o "write" da mesma conferência)?
create function testes.fala(p_nome text, p_topico text) returns boolean language sql as $$
  select a.write_allowed[1]
  from realtime.authorize('authenticated', p_topico,
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, testes.id(p_nome)::text, '{}',
    array[]::text[], array['broadcast']) a
$$;

create function testes.canal(p_quadro text) returns text language sql stable as $$
  select 'quadro:' || testes.id(p_quadro)::text
$$;

-- Os avisos mandados no canal do quadro desde a última leitura (sem o id que o realtime.send acrescenta), em ordem; e
-- some com eles (só os do teste: o tópico é de um quadro criado aqui, e tudo volta no rollback).
create table testes.historico (payload jsonb not null);

create function testes.avisos(p_quadro text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(m.payload - 'id' order by m.inserted_at), '[]') into v
  from realtime.messages m where m.topic = testes.canal(p_quadro);
  insert into testes.historico select jsonb_array_elements(v);
  delete from realtime.messages m where m.topic = testes.canal(p_quadro);
  return v;
end $$;

-- Lista de ids (em ordem, como o aviso manda) pelos nomes do cenário.
create function testes.ids(variadic p_nomes text[]) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(id order by id), '[]') from testes.fx where nome = any(p_nomes)
$$;

create function testes.aviso(p_tabela text, p_operacao text, p_cartoes jsonb, p_colunas jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('tabela', p_tabela, 'operacao', p_operacao, 'cartoes', p_cartoes, 'colunas', p_colunas)
$$;

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: administrador, gestor, a1 (consultor de cA e cArq), a2 (colega) e um gestor desativado.
-- Consultoria B: gestor e b1 (consultor de cB).
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('dono1', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('a1', 'pessoa', 'A');
select testes.perfil('a2', 'pessoa', 'A');
select testes.perfil('gestor_inativo', 'gestor', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('b1', 'pessoa', 'B');
update public.perfis set ativo = false where id = testes.id('gestor_inativo');

select testes.cliente('cA', 'A', 'a1');
select testes.cliente('cArq', 'A', 'a1');
select testes.cliente('cB', 'B', 'b1');

select testes.como('a1');
select testes.abrir('qA', 'cA');
select testes.abrir('qArq', 'cArq');
reset role;
select testes.como('b1');
select testes.abrir('qB', 'cB');
reset role;
select testes.coluna('afazer', 'qA', 'A fazer');
select testes.coluna('fazendo', 'qA', 'Em andamento');
select testes.coluna('b_afazer', 'qB', 'A fazer');
select testes.sistema();
update public.clientes set arquivado_em = now() where id = testes.id('cArq');
-- Abrir o quadro já mandou avisos (as colunas novas); o teste começa do zero.
select testes.avisos('qA');
select testes.avisos('qB');
select testes.avisos('qArq');

-- ── Quem entra no canal ──────────────────────────────────────────────────────

select is(testes.ouve('a1', testes.canal('qA')), true, 'o consultor do cliente entra no canal do quadro');
select is(testes.ouve('gestor_a', testes.canal('qA')), true, 'o gestor da consultoria entra');
select is(testes.ouve('admin_a', testes.canal('qA')), true, 'o administrador da consultoria entra');
select is(testes.ouve('central1', testes.canal('qA')), true, 'a central entra (lê todos os quadros)');
select is(testes.ouve('dono1', testes.canal('qA')), true, 'o dono entra');
select is(testes.ouve('a2', testes.canal('qA')), false, 'o colega que não é consultor do cliente não entra');
select is(testes.ouve('gestor_b', testes.canal('qA')), false, 'o gestor de outra consultoria não entra');
select is(testes.ouve('b1', testes.canal('qA')), false, 'o consultor de outra consultoria não entra');
select is(testes.ouve('b1', testes.canal('qB')), true, 'e entra no canal do quadro do cliente dele');
select is(testes.ouve('gestor_inativo', testes.canal('qA')), false, 'quem está desativado não entra');
select is(testes.ouve(null, testes.canal('qA')), false, 'sem login não entra');
select is(testes.ouve('a1', testes.canal('qArq')), true, 'cliente arquivado: o consultor ainda entra (o quadro é só para ler)');
select is(testes.ouve('a1', 'quadro:' || gen_random_uuid()::text), false, 'quadro que não existe: não entra');
select is(testes.ouve('a1', 'quadro:nao-e-um-id'), false, 'tópico com id malformado: não entra (e não dá erro)');
select is(testes.ouve('a1', 'quadro:' || upper(testes.id('qA')::text)), false,
  'o tópico é exato (o mesmo id em maiúsculas é outro tópico): não entra');
select is(testes.ouve('a1', 'outro:' || testes.id('qA')::text), false, 'outro tópico com o id do quadro: não entra');
select is(testes.ouve('a1', testes.canal('qA'), 'presence'), false, 'presença não faz parte do canal: só os avisos');
select is(testes.fala('a1', testes.canal('qA')), false, 'ninguém manda mensagem no canal: só o banco avisa');
select is(testes.fala('gestor_a', testes.canal('qA')), false, 'nem a gestão');
select is(testes.fala('central1', testes.canal('qA')), false, 'nem a central');

-- A regra lê o tópico que o servidor põe na conexão; mensagem de outro tópico não aparece nem para quem vê o quadro.
select testes.sistema();
select realtime.send('{"x": 1}', 'mudou', testes.canal('qB'), true);
select testes.como('a1');
select set_config('realtime.topic', testes.canal('qA'), true);
select is((select count(*) from realtime.messages m where m.topic = testes.canal('qB')), 0::bigint,
  'pela regra, quem vê o quadro A não lê mensagens do canal do quadro B');
reset role;
select set_config('realtime.topic', '', true);
select testes.avisos('qB');

-- ── O que os gatilhos avisam ─────────────────────────────────────────────────

select testes.como('a1');
select testes.novo_cartao('k1', 'afazer', 'Título secreto do cartão');
reset role;
select is(testes.avisos('qA'), jsonb_build_array(testes.aviso('cartoes', 'insert', testes.ids('k1'), testes.ids('afazer'))),
  'cartão novo: um aviso com o cartão e a coluna');
select is((select count(*) from realtime.messages m
  where m.topic = testes.canal('qB') or m.topic = testes.canal('qArq')), 0::bigint, 'nenhum aviso nos canais dos outros quadros');

select testes.como('a1');
update public.cartoes set titulo = 'Outro título secreto',
  descricao = '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Descrição secreta"}]}]}'
where id = testes.id('k1');
reset role;
select testes.sistema();
select is(testes.avisos('qA'), jsonb_build_array(testes.aviso('cartoes', 'update', testes.ids('k1'), testes.ids('afazer'))),
  'editar o cartão avisa só os ids (sem título nem descrição)');

select testes.como('a1');
select public.mover_cartao(testes.id('k1'), testes.id('fazendo'));
reset role;
select is(testes.avisos('qA'),
  jsonb_build_array(testes.aviso('cartoes', 'update', testes.ids('k1'), testes.ids('afazer', 'fazendo'))),
  'mover o cartão avisa as duas colunas (a de onde saiu e a para onde foi)');

select testes.como('a1');
insert into public.cartao_comentarios (cartao_id, texto) values (testes.id('k1'), 'Comentário secreto');
reset role;
select is(testes.avisos('qA'),
  jsonb_build_array(testes.aviso('cartao_comentarios', 'insert', testes.ids('k1'), testes.ids('fazendo'))),
  'comentário novo: avisa o cartão e a coluna dele, sem o texto');
select testes.como('a1');
update public.cartao_comentarios set texto = 'Comentário secreto editado' where cartao_id = testes.id('k1');
reset role;
select is(testes.avisos('qA'),
  jsonb_build_array(testes.aviso('cartao_comentarios', 'update', testes.ids('k1'), testes.ids('fazendo'))),
  'editar o comentário também');

select testes.como('a1');
insert into public.cartao_checklist (cartao_id, texto) values (testes.id('k1'), 'Item secreto');
update public.cartao_checklist set feito = true where cartao_id = testes.id('k1');
reset role;
select is(testes.avisos('qA'), jsonb_build_array(
    testes.aviso('cartao_checklist', 'insert', testes.ids('k1'), testes.ids('fazendo')),
    testes.aviso('cartao_checklist', 'update', testes.ids('k1'), testes.ids('fazendo'))),
  'checklist: um aviso por comando');

select testes.como('a1');
insert into public.cartao_responsaveis (cartao_id, perfil_id) values (testes.id('k1'), testes.id('gestor_a'));
delete from public.cartao_responsaveis where cartao_id = testes.id('k1');
reset role;
select is(testes.avisos('qA'), jsonb_build_array(
    testes.aviso('cartao_responsaveis', 'insert', testes.ids('k1'), testes.ids('fazendo')),
    testes.aviso('cartao_responsaveis', 'delete', testes.ids('k1'), testes.ids('fazendo'))),
  'responsáveis: pôr e tirar avisam');

select testes.como('a1');
insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho, tipo)
values (testes.id('k1'), testes.id('cA')::text || '/' || testes.id('k1')::text || '/' || gen_random_uuid()::text
  || '-segredo.pdf', 'segredo.pdf', 100, 'application/pdf');
reset role;
select is(testes.avisos('qA'),
  jsonb_build_array(testes.aviso('cartao_anexos', 'insert', testes.ids('k1'), testes.ids('fazendo'))),
  'anexo novo avisa (sem o nome do arquivo)');

select testes.como('a1');
select testes.nova_coluna('nova', 'qA', 'Coluna secreta');
reset role;
select is(testes.avisos('qA'), jsonb_build_array(testes.aviso('quadro_colunas', 'insert', '[]', testes.ids('nova'))),
  'coluna nova: avisa a coluna (sem o nome)');
select testes.como('a1');
update public.quadro_colunas set nome = 'Coluna secreta 2' where id = testes.id('nova');
reset role;
select is(testes.avisos('qA'), jsonb_build_array(testes.aviso('quadro_colunas', 'update', '[]', testes.ids('nova'))),
  'renomear a coluna avisa');

-- Nenhum aviso leva texto: só tabela, operação e ids (todos os lidos até aqui, guardados no histórico).
select is((select count(*) filter (where h.payload::text ~* 'secret|segredo') || ' de ' || (count(*) >= 10)::text
  from testes.historico h), '0 de true',
  'nenhum aviso carrega título, descrição, comentário, item, nome de coluna ou de arquivo');

-- Muitos cartões num comando: um aviso só, sem a lista (nula = mais de 50: a tela relê a coluna).
select testes.como('a1');
insert into public.cartoes (coluna_id, titulo) select testes.id('afazer'), 'Lote ' || i from generate_series(1, 60) i;
reset role;
select is(testes.avisos('qA'), jsonb_build_array(
    jsonb_build_object('tabela', 'cartoes', 'operacao', 'insert', 'cartoes', null, 'colunas', testes.ids('afazer'))),
  '60 cartões num comando: um aviso só, sem a lista dos cartões (a tela relê a coluna)');
select testes.como('a1');
select testes.novo_cartao('k50a', 'afazer');
select testes.novo_cartao('k50b', 'afazer');
reset role;
select testes.avisos('qA');
select testes.como('gestor_a');
update public.cartoes set prioridade = 'baixa' where id in (testes.id('k50a'), testes.id('k50b'));
reset role;
select is(testes.avisos('qA'),
  jsonb_build_array(testes.aviso('cartoes', 'update', testes.ids('k50a', 'k50b'), testes.ids('afazer'))),
  'até 50 cartões vão na lista');

-- Apagar o cartão: um aviso (o checklist, os comentários e os anexos que saem junto não avisam de novo).
select testes.como('a1');
select public.apagar_cartao(testes.id('k1'));
reset role;
select is(testes.avisos('qA'), jsonb_build_array(testes.aviso('cartoes', 'delete', testes.ids('k1'), testes.ids('fazendo'))),
  'apagar o cartão: um aviso só, com o cartão e a coluna');

-- Apagar a coluna com os cartões junto: um aviso dos cartões e um da coluna.
select testes.como('gestor_a');
select testes.novo_cartao('k_col', 'nova');
reset role;
select testes.avisos('qA');
select testes.como('gestor_a');
select public.apagar_coluna(testes.id('nova'), null, true);
reset role;
select is(testes.avisos('qA'), jsonb_build_array(
    testes.aviso('cartoes', 'delete', testes.ids('k_col'), testes.ids('nova')),
    testes.aviso('quadro_colunas', 'delete', '[]', testes.ids('nova'))),
  'apagar a coluna com os cartões junto: um aviso dos cartões e um da coluna');

-- Comando que não muda nada (a central tentando editar) não avisa.
select testes.como('central1');
update public.cartoes set titulo = 'Trocado' where quadro_id = testes.id('qA');
reset role;
select is(testes.avisos('qA'), '[]'::jsonb, 'comando que não muda nenhuma linha não avisa');

-- Cada quadro no seu canal.
select testes.como('b1');
select testes.novo_cartao('kb', 'b_afazer');
reset role;
select is(testes.avisos('qA'), '[]'::jsonb, 'cartão do quadro B não avisa no canal do quadro A');
select is(testes.avisos('qB'), jsonb_build_array(testes.aviso('cartoes', 'insert', testes.ids('kb'), testes.ids('b_afazer'))),
  'avisa no canal do quadro B');

-- Como o aviso vai: canal privado, evento "mudou", pelo broadcast.
select testes.como('a1');
select testes.novo_cartao('k2', 'afazer');
reset role;
select is((select array_agg(distinct (m.private, m.event, m.extension)::text) from realtime.messages m
  where m.topic = testes.canal('qA')), array['(t,mudou,broadcast)'],
  'o aviso é privado (só quem entrou no canal recebe), evento "mudou", pelo broadcast');
select testes.avisos('qA');

-- ── O acesso muda: o canal avisa para a tela conferir ────────────────────────

select testes.sistema();
update public.clientes set observacoes = 'Só uma anotação' where id = testes.id('cA');
select is(testes.avisos('qA'), '[]'::jsonb, 'mudar outra coisa do cliente não avisa o quadro');
update public.clientes set consultor_id = testes.id('a2') where id = testes.id('cA');
select is(testes.avisos('qA'), jsonb_build_array(jsonb_build_object('tabela', 'clientes', 'operacao', 'update', 'acesso', true)),
  'trocar o consultor do cliente avisa no canal que o acesso mudou (a tela relê e entra de novo no canal)');
select is(testes.ouve('a1', testes.canal('qA')), false, 'o consultor antigo não entra mais no canal');
select is(testes.ouve('a2', testes.canal('qA')), true, 'o consultor novo entra');
select is(testes.ouve('gestor_a', testes.canal('qA')), true, 'a gestão continua');

update public.clientes set arquivado_em = now() where id = testes.id('cA');
select is(testes.avisos('qA'), jsonb_build_array(jsonb_build_object('tabela', 'clientes', 'operacao', 'update', 'acesso', true)),
  'arquivar o cliente avisa (o quadro passa a ser só para ler)');
update public.clientes set arquivado_em = null where id = testes.id('cA');
select testes.avisos('qA');

update public.clientes set consultoria_id = testes.id('B'), consultor_id = testes.id('b1') where id = testes.id('cA');
select is(testes.avisos('qA'), jsonb_build_array(jsonb_build_object('tabela', 'clientes', 'operacao', 'update', 'acesso', true)),
  'mudar o cliente de consultoria avisa no canal do quadro antigo');
select is(testes.ouve('gestor_a', testes.canal('qA')), false, 'a consultoria antiga não entra mais no canal do quadro dela');
select is(testes.ouve('a2', testes.canal('qA')), false, 'nem o consultor dela');
select is(testes.ouve('gestor_b', testes.canal('qA')), false,
  'nem a consultoria nova (o quadro antigo é da outra consultoria; ela ganha um quadro novo)');
select is(testes.ouve('central1', testes.canal('qA')), true, 'a central continua lendo');

-- ── Cartão só se apaga por apagar_cartao ─────────────────────────────────────

select ok(not has_table_privilege('authenticated', 'public.cartoes', 'delete'),
  'quem está logado não apaga cartão direto na tabela (o app usa apagar_cartao, que devolve o que tirar do Storage)');
select testes.como('b1');
select throws_ok(format($$delete from public.cartoes where id = %L$$, testes.id('kb')), '42501', null,
  'nem o autor do cartão: apagar direto dá 42501');
select is((public.apagar_cartao(testes.id('kb')) -> 'caminhos'), '[]'::jsonb, 'pelo apagar_cartao, o autor apaga');
reset role;
select is((select count(*) from public.cartoes where id = testes.id('kb')), 0::bigint, 'e o cartão saiu');

-- ── objetos_para_tirar_do_quadro: só a central ───────────────────────────────

select testes.como('b1');
select throws_ok(format($$select public.objetos_para_tirar_do_quadro(%L)$$, testes.id('cB')), 'P0001', 'sem_permissao',
  'o consultor não procura sobras na pasta do cliente');
reset role;
select testes.como('gestor_b');
select throws_ok(format($$select public.objetos_para_tirar_do_quadro(%L)$$, testes.id('cB')), 'P0001', 'sem_permissao',
  'nem a gestão');
reset role;
select testes.como('central1');
select is(public.objetos_para_tirar_do_quadro(testes.id('cB')), '[]'::jsonb, 'a central procura (e nada em uso aparece)');
reset role;

-- ── Permissões das funções ───────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'private.vejo_canal_do_quadro(text)', 'execute'),
  'sem login não chama a conferência do canal');
select ok(has_function_privilege('authenticated', 'private.vejo_canal_do_quadro(text)', 'execute'),
  'quem está logado chama (a regra do canal roda com o papel da pessoa)');
select ok(not has_function_privilege('authenticated', 'private.avisar_quadro(uuid, jsonb)', 'execute'),
  'ninguém de fora chama o aviso direto');
select ok(not has_function_privilege('anon', 'private.avisar_quadro(uuid, jsonb)', 'execute'), 'nem sem login');

select * from finish();
rollback;
