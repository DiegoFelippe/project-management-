-- Quadro Kanban do cliente (desenho em docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md, "Quem faz o
-- quê"): quem recebe e cria o quadro, quem vê, quem grava cada coisa (cartão, coluna, checklist, comentário,
-- responsável), cliente arquivado só para ler, cliente que muda de consultoria ou de consultor, apagar coluna, mover
-- (ordem e renumeração), filtros, números do topo e paginação. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(228);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select, insert on testes.fx to authenticated, anon;
-- De que quadro é cada cartão do cenário (para contar o que alguém enxerga das tabelas filhas de um quadro).
create table testes.cartao_quadro (cartao uuid primary key, quadro uuid not null);
grant select, insert on testes.cartao_quadro to authenticated;

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

-- O quadro que quem está logado recebe ao abrir a aba (guardado com o nome dado).
create function testes.abrir(p_quadro text, p_cliente text) returns uuid language sql as $$
  select testes.guardar(p_quadro, (public.quadro_do_cliente(testes.id(p_cliente)) ->> 'id')::uuid)
$$;

-- Coluna do quadro pelo nome (leitura sem usuário logado).
create function testes.coluna(p_quadro text, p_nome text) returns uuid language sql stable as $$
  select id from public.quadro_colunas where quadro_id = testes.id(p_quadro) and nome = p_nome
$$;

-- Cartão gravado por quem está logado, como o app grava (coluna e título; o resto vem dos gatilhos).
create function testes.novo_cartao(p_nome text, p_coluna text, p_titulo text default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.cartoes (coluna_id, titulo) values (testes.id(p_coluna), coalesce(p_titulo, 'Cartão ' || p_nome))
  returning id into v;
  insert into testes.fx values (p_nome, v);
  insert into testes.cartao_quadro select v, k.quadro_id from public.cartoes k where k.id = v;
  return v;
end $$;

-- Coluna gravada por quem está logado.
create function testes.nova_coluna(p_nome text, p_quadro text, p_titulo text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.quadro_colunas (quadro_id, nome) values (testes.id(p_quadro), p_titulo) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Comentário gravado por quem está logado.
create function testes.comentar(p_nome text, p_cartao text, p_texto text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.cartao_comentarios (cartao_id, texto) values (testes.id(p_cartao), p_texto) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Ordem dos cartões não arquivados de uma coluna, pelos nomes do cenário (leitura sem usuário logado).
create function testes.ordem(p_coluna text) returns text language sql stable as $$
  select coalesce(string_agg(f.nome, ',' order by k.posicao, k.id), '')
  from public.cartoes k join testes.fx f on f.id = k.id
  where k.coluna_id = testes.id(p_coluna) and k.arquivado_em is null
$$;

-- Ordem das colunas de um quadro, pelos nomes.
create function testes.ordem_colunas(p_quadro text) returns text language sql stable as $$
  select string_agg(c.nome, ',' order by c.posicao, c.id) from public.quadro_colunas c where c.quadro_id = testes.id(p_quadro)
$$;

-- O que quem está logado enxerga do quadro, tabela por tabela: quadros, colunas, cartões, responsáveis, checklist,
-- comentários (só os do cenário: o banco tem dados reais).
create function testes.visto(p_quadro text) returns text language sql stable as $$
  select concat_ws(',',
    (select count(*) from public.quadros q where q.id = testes.id(p_quadro)),
    (select count(*) from public.quadro_colunas c where c.quadro_id = testes.id(p_quadro)),
    (select count(*) from public.cartoes k where k.quadro_id = testes.id(p_quadro)),
    (select count(*) from public.cartao_responsaveis r
     where r.cartao_id in (select cartao from testes.cartao_quadro where quadro = testes.id(p_quadro))),
    (select count(*) from public.cartao_checklist l
     where l.cartao_id in (select cartao from testes.cartao_quadro where quadro = testes.id(p_quadro))),
    (select count(*) from public.cartao_comentarios m
     where m.cartao_id in (select cartao from testes.cartao_quadro where quadro = testes.id(p_quadro))))
$$;

-- Um cartão da página de uma coluna (cartoes_do_quadro), pelo nome do cenário.
create function testes.item(p_pagina jsonb, p_cartao text) returns jsonb language sql stable as $$
  select i from jsonb_array_elements(p_pagina -> 'itens') i where i ->> 'id' = testes.id(p_cartao)::text
$$;

-- Nomes do cenário de uma lista de itens com "id", em ordem.
create function testes.nomes(p_itens jsonb) returns text language sql stable as $$
  select coalesce(string_agg(f.nome, ',' order by o), '')
  from jsonb_array_elements(p_itens) with ordinality as x(i, o) join testes.fx f on f.id = (i ->> 'id')::uuid
$$;

-- Página de uma coluna do quadro, só com os nomes (filtros como na tela).
create function testes.pagina(p_quadro text, p_coluna text, p_busca text default null, p_prioridade text default null,
  p_responsavel text default null, p_prazo text default null, p_pagina int default 1) returns text language sql as $$
  select testes.nomes(public.cartoes_do_quadro(testes.id(p_quadro), testes.id(p_coluna), p_pagina, p_busca,
    p_prioridade, p_responsavel, p_prazo) -> 'itens')
$$;

create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: administrador, gestor, a1 (consultor de cA, cArq, cArq2, cMove e cVazio), a2 (colega), um gestor
-- desativado e um administrador que ainda precisa trocar a senha. Consultoria B: gestor e b1 (consultor de cB).
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('dono1', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('a1', 'pessoa', 'A');
select testes.perfil('a2', 'pessoa', 'A');
select testes.perfil('gestor_inativo', 'gestor', 'A');
select testes.perfil('a_senha', 'admin', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('b1', 'pessoa', 'B');
update public.perfis set ativo = false where id = testes.id('gestor_inativo');
update public.perfis set precisa_trocar_senha = true where id = testes.id('a_senha');

select testes.cliente('cA', 'A', 'a1');
select testes.cliente('cArq', 'A', 'a1');
select testes.cliente('cArq2', 'A', 'a1');
select testes.cliente('cMove', 'A', 'a1');
select testes.cliente('cVazio', 'A', 'a1');
select testes.cliente('cB', 'B', 'b1');
update public.clientes set arquivado_em = now() where id = testes.id('cArq2');

-- ── Quem recebe o quadro ─────────────────────────────────────────────────────

select testes.como('a2');
select is(public.quadro_do_cliente(testes.id('cA')), null, 'o colega que não é consultor do cliente não recebe o quadro');
reset role;
select testes.como('central1');
select is(public.quadro_do_cliente(testes.id('cA')), null, 'a central não cria quadro: sem quadro, recebe nulo');
reset role;
select testes.como('gestor_b');
select is(public.quadro_do_cliente(testes.id('cA')), null, 'outra consultoria não recebe o quadro');
reset role;
select testes.como('a_senha');
select throws_ok($$select public.quadro_do_cliente(testes.id('cA'))$$, 'P0001', 'sem_permissao',
  'sessão que não está liberada (senha provisória) não abre o quadro');
reset role;
select is((select count(*) from public.quadros where cliente_id = testes.id('cA')), 0::bigint,
  'quem só olha (ou não vê) não criou quadro');

select testes.como('a1');
select testes.abrir('qA', 'cA');
select is((select jsonb_agg(c ->> 'nome') from jsonb_array_elements(public.quadro_do_cliente(testes.id('cA')) -> 'colunas') c),
  '["A fazer", "Em andamento", "Concluído"]'::jsonb, 'o quadro nasce com A fazer, Em andamento e Concluído, nessa ordem');
select is((select jsonb_agg((c ->> 'concluidos')::boolean)
  from jsonb_array_elements(public.quadro_do_cliente(testes.id('cA')) -> 'colunas') c),
  '[false, false, true]'::jsonb, 'só "Concluído" nasce como coluna de concluídos');
select is(public.quadro_do_cliente(testes.id('cA')) ->> 'id', testes.id('qA')::text, 'abrir de novo devolve o mesmo quadro');
select is(public.quadro_do_cliente(testes.id('cA')) - 'colunas' - 'criado_em',
  jsonb_build_object('id', testes.id('qA'), 'cliente_id', testes.id('cA'), 'consultoria_id', testes.id('A'),
    'pode_mexer', true, 'pode_gerir', false),
  'o consultor do cliente mexe, mas não gere (apagar coluna é da gestão)');
reset role;
select testes.guardar('afazer', testes.coluna('qA', 'A fazer'));
select testes.guardar('fazendo', testes.coluna('qA', 'Em andamento'));
select testes.guardar('feito', testes.coluna('qA', 'Concluído'));

select testes.como('gestor_a');
select is(public.quadro_do_cliente(testes.id('cA')) ->> 'id', testes.id('qA')::text, 'o gestor recebe o mesmo quadro');
select is((public.quadro_do_cliente(testes.id('cA')) ->> 'pode_gerir')::boolean, true, 'o gestor gere o quadro');
reset role;
select testes.como('admin_a');
select is((public.quadro_do_cliente(testes.id('cA')) ->> 'pode_gerir')::boolean, true, 'o administrador gere o quadro');
reset role;
select testes.como('central1');
select is(public.quadro_do_cliente(testes.id('cA')) ->> 'id', testes.id('qA')::text, 'a central recebe o quadro que existe');
select is((public.quadro_do_cliente(testes.id('cA')) ->> 'pode_mexer')::boolean, false, 'a central só lê');
reset role;
select testes.como('dono1');
select is((public.quadro_do_cliente(testes.id('cA')) ->> 'pode_mexer')::boolean, false, 'o dono só lê');
reset role;
select is((select count(*) from public.quadro_colunas where quadro_id = testes.id('qA')), 3::bigint,
  'abrir várias vezes não duplica as colunas');

-- ── O consultor e a gestão mexem: cartões ────────────────────────────────────

select testes.como('a1');
select lives_ok($$select testes.novo_cartao('k1', 'afazer', 'Levantar requisitos')$$, 'o consultor cria cartão');
select testes.novo_cartao('k2', 'afazer', 'Reunião de kickoff');
reset role;
select is((select criado_por from public.cartoes where id = testes.id('k1')), testes.id('a1'),
  'o autor do cartão é quem está logado');
select is((select quadro_id from public.cartoes where id = testes.id('k1')), testes.id('qA'),
  'o quadro do cartão vem da coluna');
select ok((select posicao from public.cartoes where id = testes.id('k2')) > (select posicao from public.cartoes where id = testes.id('k1')),
  'cartão novo vai para o fim da coluna');

select testes.como('a1');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo, criado_por) values (%L, 'X', %L)$$,
  testes.id('afazer'), testes.id('gestor_a')), '42501', null, 'o autor não vem do app');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, '   ')$$, testes.id('afazer')),
  '23514', null, 'título vazio não entra');
with u as (update public.cartoes set titulo = 'Levantar requisitos do ERP', prioridade = 'alta', prazo = testes.hoje()
  where id = testes.id('k1') returning 1)
select is(count(*), 1::bigint, 'o consultor edita título, prioridade e prazo') from u;
select throws_ok(format($$update public.cartoes set prioridade = 'urgente' where id = %L$$, testes.id('k1')),
  '23514', null, 'prioridade só baixa, média ou alta');
select throws_ok(format($$update public.cartoes set coluna_id = %L where id = %L$$, testes.id('fazendo'), testes.id('k1')),
  '42501', null, 'trocar de coluna só pela função de mover');
select throws_ok(format($$update public.cartoes set posicao = 1 where id = %L$$, testes.id('k1')),
  '42501', null, 'a posição só muda pela função de mover');
-- A imagem é um caminho do balde quadros na pasta deste cartão (o banco recusa outro; quadro_anexos.test.sql).
update public.cartoes set descricao = replace('{"type": "doc", "content": [
  {"type": "paragraph", "content": [{"type": "text", "text": "Integração "},
    {"type": "text", "marks": [{"type": "bold"}], "text": "Fis"}, {"type": "text", "text": "cal"}]},
  {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [
    {"type": "text", "text": "Configurar"}, {"type": "hardBreak"}, {"type": "text", "text": "ação"}]}]}]},
  {"type": "image", "attrs": {"src": "IMAGEM"}}]}',
  'IMAGEM', testes.id('cA')::text || '/' || testes.id('k2')::text || '/imagens/' || gen_random_uuid()::text || '.png')::jsonb
where id = testes.id('k2');
select is((select descricao_texto from public.cartoes where id = testes.id('k2')), 'Integração Fiscal Configurar ação',
  'o texto para a busca sai do JSON da descrição (pedaços com marca juntos, blocos separados)');
select throws_ok(format($$update public.cartoes set descricao_texto = 'x' where id = %L$$, testes.id('k2')),
  '42501', null, 'o texto da busca não vem do app');
select throws_ok(format($$update public.cartoes set descricao = '"texto solto"' where id = %L$$, testes.id('k2')),
  '23514', null, 'a descrição é um documento (objeto JSON)');
select is(testes.pagina('qA', 'afazer', 'ACAO'), 'k2', 'a busca acha a descrição sem acento e sem maiúscula');
select is(testes.pagina('qA', 'afazer', 'reuniao'), 'k2', 'e acha o título');
select is(testes.pagina('qA', 'afazer', 'fiscal'), 'k2', 'o texto partido por negrito é achado inteiro');
select is(public.cartoes_do_quadro(testes.id('qA'), testes.id('afazer'), 1, '100%') -> 'total', '0'::jsonb,
  'o % da busca procura o próprio caractere');
reset role;

-- ── Colunas ──────────────────────────────────────────────────────────────────

select testes.como('a1');
select lives_ok($$select testes.nova_coluna('revisao', 'qA', 'Revisão')$$, 'o consultor cria coluna');
select is(testes.ordem_colunas('qA'), 'A fazer,Em andamento,Concluído,Revisão', 'a coluna nova vai para o fim');
with u as (update public.quadro_colunas set nome = 'Em revisão', cor = 3, concluidos = true
  where id = testes.id('revisao') returning 1)
select is(count(*), 1::bigint, 'o consultor renomeia, pinta e marca a coluna como de concluídos') from u;
select throws_ok(format($$update public.quadro_colunas set cor = 10 where id = %L$$, testes.id('revisao')),
  '23514', null, 'cor só de 0 a 9');
select throws_ok(format($$update public.quadro_colunas set nome = '' where id = %L$$, testes.id('revisao')),
  '23514', null, 'nome da coluna não fica vazio');
select throws_ok(format($$update public.quadro_colunas set posicao = 1 where id = %L$$, testes.id('revisao')),
  '42501', null, 'a ordem das colunas só muda pela função de mover');
select throws_ok(format($$delete from public.quadro_colunas where id = %L$$, testes.id('revisao')),
  '42501', null, 'coluna só se apaga pela função (que pergunta o destino dos cartões)');
select throws_ok(format($$select public.apagar_coluna(%L)$$, testes.id('revisao')), 'P0001', 'sem_permissao',
  'o consultor não apaga coluna');
reset role;

-- ── Checklist ────────────────────────────────────────────────────────────────

select testes.como('a1');
select lives_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, 'Mapear notas fiscais')$$,
  testes.id('k1')), 'o consultor cria item do checklist');
insert into public.cartao_checklist (cartao_id, texto) values (testes.id('k1'), 'Mapear boletos');
with u as (update public.cartao_checklist set feito = true
  where cartao_id = testes.id('k1') and texto = 'Mapear notas fiscais' returning 1)
select is(count(*), 1::bigint, 'o consultor marca o item') from u;
select is((select string_agg(texto, ',' order by posicao) from public.cartao_checklist where cartao_id = testes.id('k1')),
  'Mapear notas fiscais,Mapear boletos', 'o item novo vai para o fim do checklist');
select is(testes.item(public.cartoes_do_quadro(testes.id('qA'), testes.id('afazer')), 'k1') -> 'checklist',
  '{"total": 2, "feitos": 1}'::jsonb, 'a página da coluna traz o total e os feitos do checklist');
select throws_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, '')$$, testes.id('k1')),
  '23514', null, 'item vazio não entra');
reset role;
select testes.como('gestor_a');
with u as (delete from public.cartao_checklist where cartao_id = testes.id('k1') and texto = 'Mapear boletos' returning 1)
select is(count(*), 1::bigint, 'a gestão apaga item do checklist') from u;
reset role;

-- ── Comentários ──────────────────────────────────────────────────────────────

select testes.como('a1');
select lives_ok($$select testes.comentar('m1', 'k1', 'Primeira conversa')$$, 'o consultor comenta');
reset role;
select is((select autor_id from public.cartao_comentarios where id = testes.id('m1')), testes.id('a1'),
  'o autor do comentário é quem está logado');
select is((select editado_em from public.cartao_comentarios where id = testes.id('m1')), null, 'comentário novo não está editado');
select testes.como('a1');
with u as (update public.cartao_comentarios set texto = 'Primeira conversa feita' where id = testes.id('m1') returning 1)
select is(count(*), 1::bigint, 'quem comentou edita o próprio comentário') from u;
reset role;
select isnt((select editado_em from public.cartao_comentarios where id = testes.id('m1')), null, 'e o comentário fica "editado"');
select testes.como('gestor_a');
select testes.comentar('m2', 'k1', 'Comentário da gestão');
with u as (update public.cartao_comentarios set texto = 'Trocado' where id = testes.id('m1') returning 1)
select is(count(*), 0::bigint, 'a gestão não edita comentário dos outros') from u;
reset role;
select testes.como('a1');
with u as (update public.cartao_comentarios set texto = 'Trocado' where id = testes.id('m2') returning 1)
select is(count(*), 0::bigint, 'o consultor não edita comentário dos outros') from u;
with u as (delete from public.cartao_comentarios where id = testes.id('m2') returning 1)
select is(count(*), 0::bigint, 'o consultor não apaga comentário dos outros') from u;
select throws_ok(format($$insert into public.cartao_comentarios (cartao_id, texto) values (%L, repeat('x', 2001))$$,
  testes.id('k1')), '23514', null, 'comentário até 2000 caracteres');
reset role;
select testes.como('gestor_a');
with u as (delete from public.cartao_comentarios where id = testes.id('m1') returning 1)
select is(count(*), 1::bigint, 'a gestão apaga comentário de qualquer um') from u;
reset role;
select testes.como('a1');
select testes.comentar('m3', 'k1', 'Seguimos');
with u as (delete from public.cartao_comentarios where id = testes.id('m3') returning 1)
select is(count(*), 1::bigint, 'quem comentou apaga o próprio comentário') from u;
select testes.comentar('m4', 'k1', 'Ficou combinado');
select is(testes.item(public.cartoes_do_quadro(testes.id('qA'), testes.id('afazer')), 'k1') -> 'comentarios', '2'::jsonb,
  'a página da coluna traz quantos comentários o cartão tem');
reset role;

-- ── Responsáveis ─────────────────────────────────────────────────────────────

select testes.como('a1');
select lives_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('a1')), 'o consultor do cliente pode ser responsável');
select lives_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('gestor_a')), 'o gestor da consultoria pode ser responsável');
select lives_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('admin_a')), 'o administrador da consultoria pode ser responsável');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('a2')), 'P0001', 'responsavel_invalido', 'o colega que não atende o cliente é recusado');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('b1')), 'P0001', 'responsavel_invalido', 'alguém de outra consultoria é recusado');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('gestor_b')), 'P0001', 'responsavel_invalido', 'o gestor de outra consultoria é recusado');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('gestor_inativo')), 'P0001', 'responsavel_invalido', 'quem está desativado é recusado');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k1'), testes.id('central1')), 'P0001', 'responsavel_invalido', 'a central é recusada');
with u as (delete from public.cartao_responsaveis where cartao_id = testes.id('k1') and perfil_id = testes.id('admin_a') returning 1)
select is(count(*), 1::bigint, 'o consultor tira um responsável') from u;
select is(testes.item(public.cartoes_do_quadro(testes.id('qA'), testes.id('afazer')), 'k1') -> 'responsaveis',
  jsonb_build_array(
    jsonb_build_object('id', testes.id('a1'), 'nome', 'Pessoa a1', 'foto', null, 'cor', null),
    jsonb_build_object('id', testes.id('gestor_a'), 'nome', 'Pessoa gestor_a', 'foto', null, 'cor', null)),
  'a página da coluna traz os responsáveis com nome, foto e cor, em ordem de nome');
reset role;

-- ── Apagar cartão ────────────────────────────────────────────────────────────

select testes.como('gestor_a');
select testes.novo_cartao('k3', 'afazer', 'Cartão da gestão');
reset role;
select testes.como('a1');
-- Cartão só se apaga por apagar_cartao (a tabela não aceita delete de quem está logado: 20261117144310_quadro_ao_vivo.sql).
select throws_ok(format($$select public.apagar_cartao(%L)$$, testes.id('k3')), 'P0001', 'sem_permissao',
  'o consultor não apaga cartão que outra pessoa criou');
select testes.novo_cartao('k4', 'afazer');
select public.apagar_cartao(testes.id('k4'));
select is((select count(*) from public.cartoes where id = testes.id('k4')), 0::bigint,
  'o consultor apaga o cartão que ele criou');
select testes.novo_cartao('k5', 'afazer');
insert into public.cartao_checklist (cartao_id, texto) values (testes.id('k5'), 'Some junto');
select testes.comentar('m5', 'k5', 'Some junto');
reset role;
select testes.como('gestor_a');
select public.apagar_cartao(testes.id('k5'));
select is((select count(*) from public.cartoes where id = testes.id('k5')), 0::bigint,
  'a gestão apaga cartão de qualquer um');
reset role;
select is((select count(*) from public.cartao_checklist where cartao_id = testes.id('k5'))
  + (select count(*) from public.cartao_comentarios where cartao_id = testes.id('k5')), 0::bigint,
  'checklist e comentários somem junto com o cartão');

-- ── Arquivar e restaurar ─────────────────────────────────────────────────────

select testes.como('a1');
with u as (update public.cartoes set arquivado_em = '2001-01-01' where id = testes.id('k2') returning 1)
select is(count(*), 1::bigint, 'o consultor arquiva o cartão') from u;
reset role;
select is((select arquivado_em from public.cartoes where id = testes.id('k2')), now(), 'a hora do arquivamento é a do banco');
select testes.como('a1');
select is(testes.pagina('qA', 'afazer'), 'k1,k3', 'o arquivado some da coluna');
select is(testes.nomes(public.cartoes_arquivados(testes.id('qA')) -> 'itens'), 'k2', 'e aparece nos arquivados');
select is(public.cartoes_arquivados(testes.id('qA')) -> 'itens' -> 0 -> 'coluna' ->> 'nome', 'A fazer',
  'os arquivados dizem de que coluna são');
select is(testes.nomes(public.cartoes_arquivados(testes.id('qA'), 'kickoff') -> 'itens'), 'k2', 'os arquivados têm busca');
select is(public.cartoes_arquivados(testes.id('qA'), 'nada disso') -> 'total', '0'::jsonb, 'busca sem resultado');
with u as (update public.cartoes set arquivado_em = null where id = testes.id('k2') returning 1)
select is(count(*), 1::bigint, 'o consultor restaura o cartão') from u;
select is(testes.pagina('qA', 'afazer'), 'k1,k2,k3', 'restaurado, volta ao mesmo lugar');
reset role;

-- ── Quem não vê ──────────────────────────────────────────────────────────────

select is(testes.visto('qA'), '1,4,3,2,1,2', 'cenário do quadro: 4 colunas, 3 cartões, 2 responsáveis, 1 item, 2 comentários');

select testes.como('a1');
select is(testes.visto('qA'), '1,4,3,2,1,2', 'o consultor do cliente vê tudo do quadro');
reset role;
select testes.como('admin_a');
select is(testes.visto('qA'), '1,4,3,2,1,2', 'o administrador vê tudo do quadro');
reset role;

select testes.como('a2');
select is(testes.visto('qA'), '0,0,0,0,0,0', 'o colega que não é consultor do cliente não vê nada do quadro');
select throws_ok(format($$select public.cartoes_do_quadro(%L, %L)$$, testes.id('qA'), testes.id('afazer')),
  'P0001', 'sem_permissao', 'nem pela função da página');
select throws_ok(format($$select public.indicadores_do_quadro(%L)$$, testes.id('qA')),
  'P0001', 'sem_permissao', 'nem pelos números do topo');
select is(public.cartao_do_quadro(testes.id('k1')), null, 'nem o cartão sozinho');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, 'X')$$, testes.id('afazer')),
  '42501', null, 'e não cria cartão');
reset role;

select testes.como('gestor_b');
select is(testes.visto('qA'), '0,0,0,0,0,0', 'o gestor de outra consultoria não vê nada');
select throws_ok(format($$select public.cartoes_arquivados(%L)$$, testes.id('qA')),
  'P0001', 'sem_permissao', 'nem os arquivados');
select throws_ok(format($$select public.pessoas_do_quadro(%L)$$, testes.id('qA')),
  'P0001', 'sem_permissao', 'nem quem pode ser responsável');
reset role;
select testes.como('b1');
select is(testes.visto('qA'), '0,0,0,0,0,0', 'o consultor de outra consultoria não vê nada');
select is(public.comentarios_do_cartao(testes.id('k1')), null, 'nem os comentários');
reset role;

set local role anon;
select throws_ok($$select count(*) from public.cartoes$$, '42501', null, 'sem login não se lê cartão');
select throws_ok(format($$select public.quadro_do_cliente(%L)$$, testes.id('cA')), '42501', null,
  'sem login não se abre quadro');
reset role;

-- ── Central e dono só leem ───────────────────────────────────────────────────

select testes.como('central1');
select is(testes.visto('qA'), '1,4,3,2,1,2', 'a central vê tudo do quadro');
select is(testes.pagina('qA', 'afazer'), 'k1,k2,k3', 'e lê a página da coluna');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, 'X')$$, testes.id('afazer')),
  '42501', null, 'a central não cria cartão');
with u as (update public.cartoes set titulo = 'Trocado' where id = testes.id('k1') returning 1)
select is(count(*), 0::bigint, 'a central não edita cartão') from u;
select throws_ok(format($$select public.apagar_cartao(%L)$$, testes.id('k1')), 'P0001', 'sem_permissao',
  'a central não apaga cartão');
select throws_ok(format($$insert into public.quadro_colunas (quadro_id, nome) values (%L, 'X')$$, testes.id('qA')),
  '42501', null, 'a central não cria coluna');
select throws_ok(format($$insert into public.cartao_comentarios (cartao_id, texto) values (%L, 'X')$$, testes.id('k1')),
  '42501', null, 'a central não comenta');
select throws_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, 'X')$$, testes.id('k1')),
  '42501', null, 'a central não mexe no checklist');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k2'), testes.id('a1')), '42501', null, 'a central não escolhe responsável');
select throws_ok(format($$select public.mover_cartao(%L, %L)$$, testes.id('k1'), testes.id('fazendo')),
  'P0001', 'sem_permissao', 'a central não move cartão');
select throws_ok(format($$select public.mover_coluna(%L)$$, testes.id('afazer')),
  'P0001', 'sem_permissao', 'a central não move coluna');
select throws_ok(format($$select public.apagar_coluna(%L)$$, testes.id('revisao')),
  'P0001', 'sem_permissao', 'a central não apaga coluna');
reset role;
select testes.como('dono1');
select is(testes.visto('qA'), '1,4,3,2,1,2', 'o dono vê tudo do quadro');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, 'X')$$, testes.id('afazer')),
  '42501', null, 'o dono não cria cartão');
reset role;

-- ── Cartão sozinho e comentários (para a janela do cartão) ───────────────────

select testes.como('a1');
select is(public.cartao_do_quadro(testes.id('k1')) ->> 'titulo', 'Levantar requisitos do ERP', 'o consultor lê o cartão inteiro');
select is(public.cartao_do_quadro(testes.id('k1')) -> 'coluna' ->> 'nome', 'A fazer', 'com a coluna');
select is(public.cartao_do_quadro(testes.id('k1')) -> 'criado_por' ->> 'nome', 'Pessoa a1', 'com quem criou');
select is(jsonb_array_length(public.cartao_do_quadro(testes.id('k1')) -> 'checklist'), 1, 'com o checklist');
select is(jsonb_array_length(public.cartao_do_quadro(testes.id('k1')) -> 'responsaveis'), 2, 'com os responsáveis');
select is((public.cartao_do_quadro(testes.id('k1')) ->> 'pode_apagar')::boolean, true, 'quem criou pode apagar');
select is((public.cartao_do_quadro(testes.id('k3')) ->> 'pode_apagar')::boolean, false, 'o cartão dos outros, não');
select is(public.cartao_do_quadro(testes.id('k2')) -> 'descricao' ->> 'type', 'doc', 'a descrição vem como JSON');
-- 35 comentários: 30 mais recentes primeiro, depois os anteriores.
select testes.comentar('c' || n, 'k1', 'Comentário ' || n) from generate_series(1, 35) n;
reset role;
update public.cartao_comentarios set criado_em = now() - (40 - (texto_n.n)) * interval '1 minute'
from (select testes.id('c' || n) as id, n from generate_series(1, 35) n) texto_n
where cartao_comentarios.id = texto_n.id;
update public.cartao_comentarios set criado_em = now() - interval '2 hours' where id = testes.id('m4');
update public.cartao_comentarios set criado_em = now() - interval '3 hours' where id = testes.id('m2');
select testes.como('a1');
select is(jsonb_array_length(public.comentarios_do_cartao(testes.id('k1')) -> 'itens'), 30, 'vêm os 30 mais recentes');
select is(public.comentarios_do_cartao(testes.id('k1')) -> 'itens' -> 0 ->> 'texto', 'Comentário 35', 'o mais recente primeiro');
select is((public.comentarios_do_cartao(testes.id('k1')) ->> 'ha_mais')::boolean, true, 'e avisa que há anteriores');
select is(public.comentarios_do_cartao(testes.id('k1')) -> 'itens' -> 0 -> 'autor' ->> 'nome', 'Pessoa a1',
  'com o nome de quem escreveu');
select is(testes.nomes(public.comentarios_do_cartao(testes.id('k1'), testes.id('c6')) -> 'itens'), 'c5,c4,c3,c2,c1,m4,m2',
  '"ver anteriores" traz os mais antigos que o último mostrado');
select is((public.comentarios_do_cartao(testes.id('k1'), testes.id('c6')) ->> 'ha_mais')::boolean, false,
  'e avisa quando acabou');
reset role;

-- ── Cliente arquivado: só leitura ────────────────────────────────────────────

select testes.como('a1');
select testes.abrir('qArq', 'cArq');
reset role;
select testes.guardar('arq_afazer', testes.coluna('qArq', 'A fazer'));
select testes.guardar('arq_fazendo', testes.coluna('qArq', 'Em andamento'));
select testes.como('a1');
select testes.novo_cartao('karq', 'arq_afazer');
reset role;
select testes.sistema();
update public.clientes set arquivado_em = now() where id = testes.id('cArq');
select testes.como('a1');
select is(public.quadro_do_cliente(testes.id('cArq')) ->> 'id', testes.id('qArq')::text, 'cliente arquivado: o quadro continua aberto');
select is((public.quadro_do_cliente(testes.id('cArq')) ->> 'pode_mexer')::boolean, false, 'só para ler');
select is(testes.visto('qArq'), '1,3,1,0,0,0', 'o consultor ainda vê o quadro');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, 'X')$$, testes.id('arq_afazer')),
  '42501', null, 'cliente arquivado: não cria cartão');
with u as (update public.cartoes set titulo = 'Trocado' where id = testes.id('karq') returning 1)
select is(count(*), 0::bigint, 'cliente arquivado: não edita cartão') from u;
select throws_ok(format($$select public.mover_cartao(%L, %L)$$, testes.id('karq'), testes.id('arq_fazendo')),
  'P0001', 'sem_permissao', 'cliente arquivado: não move cartão');
select throws_ok(format($$insert into public.cartao_comentarios (cartao_id, texto) values (%L, 'X')$$, testes.id('karq')),
  '42501', null, 'cliente arquivado: não comenta');
select throws_ok(format($$select public.apagar_cartao(%L)$$, testes.id('karq')), 'P0001', 'sem_permissao',
  'cliente arquivado: não apaga o próprio cartão');
select is(public.quadro_do_cliente(testes.id('cArq2')), null, 'cliente arquivado sem quadro: não cria');
reset role;
select testes.como('gestor_a');
select throws_ok(format($$select public.apagar_coluna(%L)$$, testes.id('arq_fazendo')),
  'P0001', 'sem_permissao', 'cliente arquivado: a gestão não apaga coluna');
reset role;
select is((select count(*) from public.quadros where cliente_id = testes.id('cArq2')), 0::bigint,
  'nenhum quadro foi criado para o cliente arquivado');

-- ── Cliente que muda de consultoria ──────────────────────────────────────────

select testes.como('a1');
select testes.abrir('qMoveA', 'cMove');
reset role;
select testes.guardar('move_afazer', testes.coluna('qMoveA', 'A fazer'));
select testes.como('a1');
select testes.novo_cartao('kmove', 'move_afazer');
reset role;
select testes.sistema();
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('cMove');
update public.clientes set consultor_id = testes.id('b1') where id = testes.id('cMove');
select testes.como('a1');
select is(public.quadro_do_cliente(testes.id('cMove')), null, 'a consultora antiga não recebe mais o quadro');
select is(testes.visto('qMoveA'), '0,0,0,0,0,0', 'e não vê mais nada dele');
select throws_ok(format($$select public.cartoes_do_quadro(%L, %L)$$, testes.id('qMoveA'), testes.id('move_afazer')),
  'P0001', 'sem_permissao', 'nem pela função da página');
reset role;
select testes.como('gestor_a');
select is(testes.visto('qMoveA'), '0,0,0,0,0,0', 'a gestão da consultoria antiga também perde o quadro');
reset role;
select testes.como('b1');
select testes.abrir('qMoveB', 'cMove');
select isnt(testes.id('qMoveB'), testes.id('qMoveA'), 'a consultoria nova começa com um quadro novo');
select is(testes.visto('qMoveB'), '1,3,0,0,0,0', 'vazio, com as três colunas');
select is(testes.visto('qMoveA'), '0,0,0,0,0,0', 'e não vê o quadro da antiga');
reset role;
select testes.como('central1');
select is((select count(*) from public.quadros where cliente_id = testes.id('cMove')), 2::bigint, 'a central vê os dois quadros');
select is(testes.visto('qMoveA'), '1,3,1,0,0,0', 'e lê o da consultoria antiga');
reset role;
select testes.sistema();
update public.clientes set consultoria_id = testes.id('A') where id = testes.id('cMove');
update public.clientes set consultor_id = testes.id('a1') where id = testes.id('cMove');
select testes.como('a1');
select is(public.quadro_do_cliente(testes.id('cMove')) ->> 'id', testes.id('qMoveA')::text,
  'o cliente volta: o quadro antigo da consultoria reaparece');
reset role;
select testes.como('b1');
select is(testes.visto('qMoveB'), '0,0,0,0,0,0', 'e a consultoria que o perdeu deixa de ver o dela');
reset role;

-- ── Apagar coluna ────────────────────────────────────────────────────────────

select testes.como('a1');
select testes.novo_cartao('kr1', 'revisao');
select testes.novo_cartao('kr2', 'revisao');
update public.cartoes set arquivado_em = now() where id = testes.id('kr2');
select testes.novo_cartao('kf1', 'fazendo');
reset role;
select testes.como('gestor_a');
select throws_ok(format($$select public.apagar_coluna(%L)$$, testes.id('revisao')), 'P0001', 'coluna_com_cartoes',
  'coluna com cartões e sem destino: recusa');
select throws_ok(format($$select public.apagar_coluna(%L, %L)$$, testes.id('revisao'), testes.id('revisao')),
  'P0001', 'coluna_invalida', 'o destino não pode ser a própria coluna');
select throws_ok(format($$select public.apagar_coluna(%L, %L)$$, testes.id('revisao'), testes.id('move_afazer')),
  'P0001', 'coluna_invalida', 'o destino é uma coluna do mesmo quadro');
reset role;
select is((select count(*) from public.cartoes where coluna_id = testes.id('revisao')), 2::bigint,
  'recusado, nada sumiu');
select testes.como('gestor_a');
select is(public.apagar_coluna(testes.id('revisao'), testes.id('fazendo')) - 'ids_apagados',
  '{"movidos": 2, "apagados": 0, "caminhos": []}'::jsonb,
  'com destino: os cartões (arquivados também) vão para a outra coluna (nada a tirar do Storage)');
reset role;
select is(testes.ordem('fazendo'), 'kf1,kr1', 'no fim do destino, na mesma ordem');
select is((select coluna_id from public.cartoes where id = testes.id('kr2')), testes.id('fazendo'),
  'o arquivado segue a mesma escolha');
select is((select count(*) from public.quadro_colunas where id = testes.id('revisao')), 0::bigint, 'e a coluna sumiu');

select testes.como('a1');
select testes.nova_coluna('lixo', 'qA', 'Lixo');
select testes.novo_cartao('kl1', 'lixo');
insert into public.cartao_checklist (cartao_id, texto) values (testes.id('kl1'), 'Some junto');
reset role;
select testes.como('gestor_a');
select is(public.apagar_coluna(testes.id('lixo'), null, true) -> 'apagados', '1'::jsonb,
  '"apagar junto": os cartões somem com a coluna');
reset role;
select is((select count(*) from public.cartoes where id = testes.id('kl1'))
  + (select count(*) from public.cartao_checklist where cartao_id = testes.id('kl1')), 0::bigint,
  'com o checklist deles');
select testes.como('a1');
select testes.nova_coluna('vazia', 'qA', 'Vazia');
reset role;
select testes.como('admin_a');
select lives_ok(format($$select public.apagar_coluna(%L)$$, testes.id('vazia')), 'coluna vazia se apaga sem perguntar');
reset role;

-- O quadro da consultoria B (o cliente cMove volta para ela) fica com uma coluna só.
select testes.sistema();
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('cMove');
update public.clientes set consultor_id = testes.id('b1') where id = testes.id('cMove');
select testes.guardar('mb_afazer', testes.coluna('qMoveB', 'A fazer'));
select testes.guardar('mb_fazendo', testes.coluna('qMoveB', 'Em andamento'));
select testes.guardar('mb_feito', testes.coluna('qMoveB', 'Concluído'));
select testes.como('gestor_b');
select public.apagar_coluna(testes.id('mb_afazer'));
select public.apagar_coluna(testes.id('mb_fazendo'));
select throws_ok(format($$select public.apagar_coluna(%L)$$, testes.id('mb_feito')),
  'P0001', 'ultima_coluna', 'a última coluna do quadro não se apaga');
reset role;

-- ── Mover cartões ────────────────────────────────────────────────────────────

select testes.como('a1');
select testes.nova_coluna('ordem', 'qA', 'Ordem');
select testes.novo_cartao('o1', 'ordem');
select testes.novo_cartao('o2', 'ordem');
select testes.novo_cartao('o3', 'ordem');
select testes.novo_cartao('o4', 'ordem');
select is((public.mover_cartao(testes.id('o4'), testes.id('ordem'), testes.id('o1'), testes.id('o2')) ->> 'coluna_id')::uuid,
  testes.id('ordem'), 'mover devolve a coluna final');
select is(testes.ordem('ordem'), 'o1,o4,o2,o3', 'entre dois vizinhos');
select public.mover_cartao(testes.id('o1'), testes.id('ordem'), testes.id('o3'), null);
select is(testes.ordem('ordem'), 'o4,o2,o3,o1', 'para o fim (só o vizinho de cima)');
select public.mover_cartao(testes.id('o3'), testes.id('ordem'), null, testes.id('o4'));
select is(testes.ordem('ordem'), 'o3,o4,o2,o1', 'para o topo (só o vizinho de baixo)');
select public.mover_cartao(testes.id('o2'), testes.id('afazer'), null, null);
select is(testes.ordem('afazer'), 'k1,k2,k3,o2', 'para outra coluna sem vizinhos: vai para o fim dela');
select is(testes.ordem('ordem'), 'o3,o4,o1', 'e sai da coluna de onde veio');
select is((select posicao from public.cartoes where id = testes.id('o3')) < 1024, true,
  'o topo fica antes do primeiro (posição fracionária, sem mexer nos outros)');
select throws_ok(format($$select public.mover_cartao(%L, %L, %L)$$, testes.id('o4'), testes.id('ordem'), testes.id('k1')),
  'P0001', 'vizinho_invalido', 'o vizinho precisa estar na coluna de destino');
select throws_ok(format($$select public.mover_cartao(%L, %L, %L)$$, testes.id('o4'), testes.id('ordem'), testes.id('o4')),
  'P0001', 'vizinho_invalido', 'o cartão não é vizinho dele mesmo');
select throws_ok(format($$select public.mover_cartao(%L, %L)$$, testes.id('o4'), testes.id('arq_afazer')),
  'P0001', 'coluna_invalida', 'não vai para coluna de outro quadro');
select throws_ok(format($$select public.mover_cartao(%L, %L)$$, testes.id('kr2'), testes.id('afazer')),
  'P0001', 'cartao_arquivado', 'cartão arquivado não se move (a tela de quem arrastou volta)');
reset role;

-- Sem espaço entre os vizinhos: renumera a coluna (de 1024 em 1024) e põe o cartão no meio.
update public.cartoes set posicao = 1 where id = testes.id('o3');
update public.cartoes set posicao = 1.00005 where id = testes.id('o4');
update public.cartoes set posicao = 2 where id = testes.id('o1');
select testes.como('a1');
select is((public.mover_cartao(testes.id('o1'), testes.id('ordem'), testes.id('o3'), testes.id('o4')) ->> 'renumerou')::boolean,
  true, 'sem espaço entre os vizinhos, a coluna é renumerada');
reset role;
select is(testes.ordem('ordem'), 'o3,o1,o4', 'e a ordem fica certa');
select is((select array_agg(posicao order by posicao) from public.cartoes where coluna_id = testes.id('ordem')),
  array[1024, 1536, 2048]::numeric[], 'as posições voltam a ter espaço');
-- Empate (dois cartões na mesma posição) também renumera.
update public.cartoes set posicao = 7 where id in (testes.id('o3'), testes.id('o1'));
select testes.como('a1');
select is((public.mover_cartao(testes.id('o4'), testes.id('ordem'), null,
  least(testes.id('o3'), testes.id('o1'))) ->> 'renumerou')::boolean, false, 'com espaço, não renumera');
select is(testes.ordem('ordem'), case when testes.id('o3') < testes.id('o1') then 'o4,o3,o1' else 'o4,o1,o3' end,
  'para o topo, antes do empate');
select is((public.mover_cartao(testes.id('o4'), testes.id('ordem'), least(testes.id('o3'), testes.id('o1')), null)
  ->> 'renumerou')::boolean, true, 'entre dois cartões empatados, renumera');
select is(testes.ordem('ordem'), case when testes.id('o3') < testes.id('o1') then 'o3,o4,o1' else 'o1,o4,o3' end,
  'e o cartão fica entre os dois');
reset role;

-- Travas: mover trava as duas colunas (a de onde o cartão sai e a de destino) numa consulta só, em ordem de id, e só
-- depois o cartão. Assim, duas pessoas trocando cartões entre as mesmas colunas esperam uma pela outra em vez de travar
-- (40P01) quando as duas precisam renumerar. A espera de verdade precisa de duas sessões (conferida à mão, com psql, em
-- .superpowers/sdd/2026-11-17-kanban-do-cliente/final-fix-report.md); aqui, a ordem das travas na função.
select ok(pg_get_functiondef('public.mover_cartao(uuid, uuid, uuid, uuid)'::regprocedure)
    ~ 'where c\.id in \(v_origem, p_coluna\).*order by c\.id\s+for no key update.*where k\.id = p_cartao\s+for update',
  'mover trava as colunas de origem e destino em ordem de id, antes do cartão');
select ok(pg_get_functiondef('public.apagar_coluna(uuid, uuid, boolean)'::regprocedure)
    ~ 'where c\.id in \(p_coluna, p_destino\).*order by c\.id\s+for no key update',
  'apagar coluna trava a que sai e a de destino na mesma ordem (quem move um cartão entre elas espera)');

-- ── Mover colunas ────────────────────────────────────────────────────────────

select testes.como('a1');
select public.mover_coluna(testes.id('ordem'), null, testes.id('afazer'));
select is(testes.ordem_colunas('qA'), 'Ordem,A fazer,Em andamento,Concluído', 'a coluna vai para o começo');
select public.mover_coluna(testes.id('ordem'), testes.id('fazendo'), testes.id('feito'));
select is(testes.ordem_colunas('qA'), 'A fazer,Em andamento,Ordem,Concluído', 'e para o meio');
reset role;
update public.quadro_colunas set posicao = 1 where id = testes.id('afazer');
update public.quadro_colunas set posicao = 5 where id = testes.id('fazendo');
update public.quadro_colunas set posicao = 5.00001 where id = testes.id('feito');
update public.quadro_colunas set posicao = 9 where id = testes.id('ordem');
select testes.como('a1');
select is((public.mover_coluna(testes.id('ordem'), testes.id('fazendo'), testes.id('feito')) ->> 'renumerou')::boolean,
  true, 'sem espaço entre as colunas vizinhas, renumera o quadro');
select is(testes.ordem_colunas('qA'), 'A fazer,Em andamento,Ordem,Concluído', 'e a ordem fica certa');
select throws_ok(format($$select public.mover_coluna(%L, %L)$$, testes.id('ordem'), testes.id('arq_afazer')),
  'P0001', 'vizinho_invalido', 'a coluna vizinha é do mesmo quadro');
reset role;

-- ── Filtros, números do topo, paginação e quem pode ser responsável (quadro da consultoria B) ────────────

select testes.como('b1');
select testes.abrir('qB', 'cB');
reset role;
select testes.guardar('b_afazer', testes.coluna('qB', 'A fazer'));
select testes.guardar('b_fazendo', testes.coluna('qB', 'Em andamento'));
select testes.guardar('b_feito', testes.coluna('qB', 'Concluído'));
select testes.como('b1');
select testes.novo_cartao('i1', 'b_afazer', 'Indicador um');
select testes.novo_cartao('i2', 'b_afazer', 'Indicador dois');
select testes.novo_cartao('i7', 'b_afazer', 'Indicador sete');
select testes.novo_cartao('i3', 'b_fazendo', 'Indicador três');
select testes.novo_cartao('i4', 'b_fazendo', 'Indicador quatro');
select testes.novo_cartao('i5', 'b_feito', 'Indicador cinco');
select testes.novo_cartao('i6', 'b_feito', 'Indicador seis');
update public.cartoes set prazo = testes.hoje() - 3, prioridade = 'alta' where id = testes.id('i1');
update public.cartoes set prazo = testes.hoje() + 2, prioridade = 'media' where id = testes.id('i2');
update public.cartoes set prazo = testes.hoje() + 7, prioridade = 'baixa' where id = testes.id('i3');
update public.cartoes set prazo = testes.hoje() + 8 where id = testes.id('i4');
update public.cartoes set prazo = testes.hoje() - 1 where id = testes.id('i5');
update public.cartoes set arquivado_em = now() where id = testes.id('i6');
insert into public.cartao_responsaveis (cartao_id, perfil_id) values
  (testes.id('i1'), testes.id('b1')), (testes.id('i3'), testes.id('gestor_b')), (testes.id('i5'), testes.id('b1'));
select is(public.indicadores_do_quadro(testes.id('qB')),
  '{"cartoes": 6, "atrasados": 1, "vencem_em_7_dias": 2, "sem_responsavel": 3}'::jsonb,
  'os 4 números: sem arquivados; o atrasado da coluna de concluídos não conta');
select is(public.indicadores_do_quadro(testes.id('qB'), null, 'alta'),
  '{"cartoes": 1, "atrasados": 1, "vencem_em_7_dias": 0, "sem_responsavel": 0}'::jsonb, 'os números seguem o filtro de prioridade');
select is(public.indicadores_do_quadro(testes.id('qB'), null, null, 'sem'),
  '{"cartoes": 3, "atrasados": 0, "vencem_em_7_dias": 1, "sem_responsavel": 3}'::jsonb, 'e o de "sem responsável"');
select is(public.indicadores_do_quadro(testes.id('qB'), null, null, testes.id('b1')::text),
  '{"cartoes": 2, "atrasados": 1, "vencem_em_7_dias": 0, "sem_responsavel": 0}'::jsonb, 'e o de um responsável');
select is(public.indicadores_do_quadro(testes.id('qB'), null, null, null, 'atrasados') ->> 'cartoes', '1',
  'e o de prazo (atrasados, fora das colunas de concluídos)');
select is(public.indicadores_do_quadro(testes.id('qB'), 'dois') ->> 'cartoes', '1', 'e a busca');
select is(testes.pagina('qB', 'b_afazer'), 'i1,i2,i7', 'a página da coluna, sem filtro');
select is(testes.pagina('qB', 'b_afazer', null, 'media'), 'i2', 'filtro de prioridade');
select is(testes.pagina('qB', 'b_afazer', null, null, 'sem'), 'i2,i7', 'filtro "sem responsável"');
select is(testes.pagina('qB', 'b_afazer', null, null, testes.id('b1')::text), 'i1', 'filtro de responsável');
select is(testes.pagina('qB', 'b_afazer', null, null, null, 'atrasados'), 'i1', 'filtro de atrasados');
select is(testes.pagina('qB', 'b_afazer', null, null, null, 'proximos_7_dias'), 'i2', 'filtro dos próximos 7 dias');
select is(testes.pagina('qB', 'b_fazendo', null, null, null, 'proximos_7_dias'), 'i3', 'o sétimo dia entra');
select is(testes.pagina('qB', 'b_afazer', null, null, null, 'sem_prazo'), 'i7', 'filtro sem prazo');
select is(testes.pagina('qB', 'b_feito', null, null, null, 'atrasados'), '', 'na coluna de concluídos ninguém está atrasado');
select throws_ok(format($$select public.cartoes_do_quadro(%L, %L, 1, null, 'urgente')$$, testes.id('qB'), testes.id('b_afazer')),
  '22023', 'filtro_invalido', 'prioridade que não existe é recusada');
select throws_ok(format($$select public.cartoes_do_quadro(%L, %L, 1, null, null, 'fulano')$$, testes.id('qB'), testes.id('b_afazer')),
  '22023', 'filtro_invalido', 'responsável que não é "sem" nem um id é recusado');
select throws_ok(format($$select public.indicadores_do_quadro(%L, null, null, null, 'ontem')$$, testes.id('qB')),
  '22023', 'filtro_invalido', 'prazo que não existe é recusado');
select throws_ok(format($$select public.cartoes_do_quadro(%L, %L)$$, testes.id('qB'), testes.id('afazer')),
  'P0001', 'coluna_invalida', 'a coluna precisa ser do quadro');
select is(public.pessoas_do_quadro(testes.id('qB')),
  jsonb_build_array(
    jsonb_build_object('id', testes.id('b1'), 'nome', 'Pessoa b1', 'foto', null, 'cor', null),
    jsonb_build_object('id', testes.id('gestor_b'), 'nome', 'Pessoa gestor_b', 'foto', null, 'cor', null)),
  'quem pode ser responsável: o consultor do cliente e a gestão da consultoria');
reset role;
select testes.como('a1');
select is(public.pessoas_do_quadro(testes.id('qA')) @> jsonb_build_array(jsonb_build_object('id', testes.id('a2'))), false,
  'o colega que não atende o cliente não aparece');
select is(jsonb_array_length(public.pessoas_do_quadro(testes.id('qA'))), 4,
  'nem quem está desativado (ficam a1, os dois administradores e o gestor)');
select is(public.pessoas_do_quadro(testes.id('qA'), 'GESTOR') -> 0 ->> 'nome', 'Pessoa gestor_a', 'busca pelo nome, sem maiúscula');
reset role;
select testes.como('central1');
select is(jsonb_array_length(public.pessoas_do_quadro(testes.id('qB'))), 2, 'a central também vê a lista (para filtrar)');
reset role;

-- Paginação: 51 cartões numa coluna, 50 por página.
select testes.como('b1');
select testes.nova_coluna('muitos', 'qB', 'Muitos');
insert into public.cartoes (coluna_id, titulo) select testes.id('muitos'), 'Muitos ' || n from generate_series(1, 51) n;
select is(jsonb_array_length(public.cartoes_do_quadro(testes.id('qB'), testes.id('muitos')) -> 'itens'), 50, 'a página 1 traz 50');
select is(public.cartoes_do_quadro(testes.id('qB'), testes.id('muitos')) -> 'total', '51'::jsonb, 'com o total da coluna');
select is(public.cartoes_do_quadro(testes.id('qB'), testes.id('muitos'), 2) -> 'itens' -> 0 ->> 'titulo', 'Muitos 51',
  'a página 2 traz o que sobrou, na ordem');
select is(jsonb_array_length(public.cartoes_do_quadro(testes.id('qB'), testes.id('muitos'), 3) -> 'itens'), 0,
  'página que passou do fim vem vazia');
select is((select jsonb_agg(c ->> 'cartoes') from jsonb_array_elements(public.quadro_do_cliente(testes.id('cB')) -> 'colunas') c),
  '["3", "2", "1", "51"]'::jsonb, 'o quadro diz quantos cartões (não arquivados) cada coluna tem');
select is(public.quadro_do_cliente(testes.id('cB')) -> 'colunas' -> 2 -> 'arquivados', '1'::jsonb,
  'e quantos arquivados (para a confirmação de apagar)');
reset role;

-- ── Limites (para o quadro não crescer sem fim) ──────────────────────────────

select testes.como('b1');
insert into public.cartao_checklist (cartao_id, texto) select testes.id('i1'), 'Item ' || n from generate_series(1, 200) n;
select throws_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, 'Mais um')$$, testes.id('i1')),
  'P0001', 'checklist_cheio', 'o checklist vai até 200 itens');
insert into public.quadro_colunas (quadro_id, nome) select testes.id('qB'), 'Coluna ' || n from generate_series(1, 46) n;
select throws_ok(format($$insert into public.quadro_colunas (quadro_id, nome) values (%L, 'Mais uma')$$, testes.id('qB')),
  'P0001', 'colunas_demais', 'o quadro vai até 50 colunas');
reset role;

-- ── Consultor trocado ────────────────────────────────────────────────────────

select testes.sistema();
update public.clientes set consultor_id = testes.id('a2') where id = testes.id('cA');
select testes.como('a2');
select is((public.quadro_do_cliente(testes.id('cA')) ->> 'pode_mexer')::boolean, true, 'o consultor novo vê e mexe');
select is(testes.item(public.cartoes_do_quadro(testes.id('qA'), testes.id('afazer')), 'k1') -> 'responsaveis' -> 0 ->> 'nome',
  'Pessoa a1', 'os cartões do antigo continuam, com o nome dele');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
  testes.id('k2'), testes.id('a1')), 'P0001', 'responsavel_invalido', 'o antigo não é escolhido de novo');
reset role;
select testes.como('a1');
select is(public.quadro_do_cliente(testes.id('cA')), null, 'o consultor antigo perde o quadro na hora');
select is(testes.visto('qA'), '0,0,0,0,0,0', 'e não vê mais nada dele');
reset role;

-- ── Apagar o cliente ─────────────────────────────────────────────────────────

select testes.como('a1');
select testes.abrir('qVazio', 'cVazio');
reset role;
select testes.sistema();
select lives_ok(format($$delete from public.clientes where id = %L$$, testes.id('cVazio')),
  'quadro sem cartões não segura o cliente');
select is((select count(*) from public.quadros where id = testes.id('qVazio')), 0::bigint, 'e sai junto com ele');
select throws_ok(format($$delete from public.clientes where id = %L$$, testes.id('cB')), '23503', null,
  'cliente com cartões não se apaga (arquive)');

-- ── Permissões da API ────────────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.cartoes_do_quadro(uuid, uuid, int, text, text, text, text)', 'execute'),
  'sem login não se chama a página do quadro');
select ok(has_function_privilege('authenticated', 'public.mover_cartao(uuid, uuid, uuid, uuid)', 'execute'),
  'quem entrou chama mover_cartao (a função confere quem pode)');
select ok(not has_table_privilege('authenticated', 'public.quadros', 'insert'), 'quadro só nasce pela função');
select ok(not has_table_privilege('authenticated', 'public.quadros', 'delete'), 'e não se apaga pelo navegador');

select * from finish();
rollback;
