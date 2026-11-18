-- Quadros pessoais e de time (desenho em docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md; plano
-- em docs/superpowers/plans/2026-11-17-quadros-pessoais-e-de-time.md, Task 1): a tabela quadros com o tipo de dono
-- (cliente, pessoa, time) e a regra de um dono só; quem vê, mexe, gere e administra cada tipo (private.vejo_quadro,
-- mexo_no_quadro, gerencio_quadro e a nova administro_quadro) e o que cada papel lê pelas tabelas e pelas funções (a
-- central só lê os quadros do cliente); renomear e arquivar pelo update; o quadro pessoal na consultoria onde nasceu;
-- quem sai do time perde o acesso na hora; quadro arquivado só para ler; responsáveis por tipo; o nome único entre os
-- abertos; o quadro que segura o time; o Storage na pasta quadro/<id>/ (sem confundir com a pasta do cliente); os
-- avisos de acesso no canal; e o quadro do cliente como antes. Os quadros pessoais e de time nascem aqui pelo sistema
-- (criar_quadro chega na Task 2). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(194);

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

create function testes.como(p_nome text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, true);
end $$;

-- Só o token (o papel continua o do teste): o que um gatilho vê de quem está logado quando quem grava é uma função.
create function testes.so_token(p_nome text) returns void language plpgsql as $$
begin
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

-- Quadro pessoal (p_tipo 'pessoa', p_dono = a pessoa, na consultoria dela) ou do time (p_tipo 'time', p_dono = o time;
-- a consultoria vem do gatilho), criado pelo sistema com as colunas "A fazer" (<nome>_afazer) e "Feito" (<nome>_feito).
create function testes.quadro(p_nome text, p_tipo text, p_dono text, p_titulo text) returns uuid language plpgsql as $$
declare
  v uuid;
  c uuid;
begin
  perform testes.sistema();
  if p_tipo = 'pessoa' then
    insert into public.quadros (tipo, pessoa_id, consultoria_id, nome)
    values ('pessoa', testes.id(p_dono), (select consultoria_id from public.perfis where id = testes.id(p_dono)), p_titulo)
    returning id into v;
  else
    insert into public.quadros (tipo, time_id, nome) values ('time', testes.id(p_dono), p_titulo) returning id into v;
  end if;
  insert into testes.fx values (p_nome, v);
  insert into public.quadro_colunas (quadro_id, nome) values (v, 'A fazer') returning id into c;
  insert into testes.fx values (p_nome || '_afazer', c);
  insert into public.quadro_colunas (quadro_id, nome, concluidos) values (v, 'Feito', true) returning id into c;
  insert into testes.fx values (p_nome || '_feito', c);
  return v;
end $$;

-- O quadro do cliente que quem está logado recebe ao abrir a aba (guardado com o nome dado).
create function testes.abrir(p_quadro text, p_cliente text) returns uuid language sql as $$
  select testes.guardar(p_quadro, (public.quadro_do_cliente(testes.id(p_cliente)) ->> 'id')::uuid)
$$;

-- Coluna, cartão e comentário gravados por quem está logado, como o app grava.
create function testes.nova_coluna(p_nome text, p_quadro text, p_titulo text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.quadro_colunas (quadro_id, nome) values (testes.id(p_quadro), p_titulo) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.novo_cartao(p_nome text, p_coluna text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.cartoes (coluna_id, titulo) values (testes.id(p_coluna), 'Cartão ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  insert into testes.cartao_quadro select v, k.quadro_id from public.cartoes k where k.id = v;
  return v;
end $$;

create function testes.comentar(p_nome text, p_cartao text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.cartao_comentarios (cartao_id, texto) values (testes.id(p_cartao), 'Comentário ' || p_nome)
  returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Responsável posto por quem está logado.
create function testes.responsavel(p_cartao text, p_pessoa text) returns void language sql as $$
  insert into public.cartao_responsaveis (cartao_id, perfil_id) values (testes.id(p_cartao), testes.id(p_pessoa))
$$;

-- O que quem está logado pode no quadro: 'vê', 'mexe', 'gere', 'administra' (os que valem) ou 'nada'.
create function testes.regras(p_quadro text) returns text language sql stable as $$
  select coalesce(nullif(concat_ws(',',
    case when private.vejo_quadro(testes.id(p_quadro)) then 'vê' end,
    case when private.mexo_no_quadro(testes.id(p_quadro)) then 'mexe' end,
    case when private.gerencio_quadro(testes.id(p_quadro)) then 'gere' end,
    case when private.administro_quadro(testes.id(p_quadro)) then 'administra' end), ''), 'nada')
$$;

-- O que quem está logado enxerga do quadro pela API, tabela por tabela: quadros, colunas, cartões, responsáveis,
-- checklist, comentários e anexos (só os do cenário: o banco tem dados reais).
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
     where m.cartao_id in (select cartao from testes.cartao_quadro where quadro = testes.id(p_quadro))),
    (select count(*) from public.cartao_anexos a
     where a.cartao_id in (select cartao from testes.cartao_quadro where quadro = testes.id(p_quadro))))
$$;

-- Tudo o que quem não vê o quadro recebe, por todos os caminhos (regras, tabelas, funções de leitura e o update de
-- renomear), num texto só. Quem não vê: 'regras=nada; linhas=0,0,0,0,0,0,0; por_id=nulo; cartoes=sem_permissao;
-- arquivados=sem_permissao; indicadores=sem_permissao; pessoas=sem_permissao; cartao=nulo; comentarios=nulo;
-- anexos=nulo; renomear=0'.
create function testes.alcance(p_quadro text, p_coluna text, p_cartao text) returns text language plpgsql as $$
declare
  v_quadro uuid := testes.id(p_quadro);
  r text[] := '{}';
  v text;
  n bigint;
begin
  r := r || ('regras=' || testes.regras(p_quadro));
  r := r || ('linhas=' || testes.visto(p_quadro));
  r := r || ('por_id=' || coalesce(public.quadro_por_id(v_quadro) ->> 'id', 'nulo'));
  begin
    perform public.cartoes_do_quadro(v_quadro, testes.id(p_coluna));
    v := 'leu';
  exception when others then v := sqlerrm;
  end;
  r := r || ('cartoes=' || v);
  begin
    perform public.cartoes_arquivados(v_quadro);
    v := 'leu';
  exception when others then v := sqlerrm;
  end;
  r := r || ('arquivados=' || v);
  begin
    perform public.indicadores_do_quadro(v_quadro);
    v := 'leu';
  exception when others then v := sqlerrm;
  end;
  r := r || ('indicadores=' || v);
  begin
    perform public.pessoas_do_quadro(v_quadro);
    v := 'leu';
  exception when others then v := sqlerrm;
  end;
  r := r || ('pessoas=' || v);
  r := r || ('cartao=' || coalesce(public.cartao_do_quadro(testes.id(p_cartao)) ->> 'id', 'nulo'));
  r := r || ('comentarios=' || coalesce(public.comentarios_do_cartao(testes.id(p_cartao))::text, 'nulo'));
  r := r || ('anexos=' || coalesce(public.anexos_do_cartao(testes.id(p_cartao))::text, 'nulo'));
  with u as (update public.quadros set nome = 'Invadido' where id = v_quadro returning 1) select count(*) into n from u;
  r := r || ('renomear=' || n);
  return array_to_string(r, '; ');
end $$;

create function testes.nao_ve() returns text language sql immutable as $$
  select 'regras=nada; linhas=0,0,0,0,0,0,0; por_id=nulo; cartoes=sem_permissao; arquivados=sem_permissao; '
    || 'indicadores=sem_permissao; pessoas=sem_permissao; cartao=nulo; comentarios=nulo; anexos=nulo; renomear=0'
$$;

-- Quantas linhas um update de quem está logado mudou.
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

-- ── Storage ──
-- Caminho do anexo: na pasta do quadro (quadro/<quadro>/<cartao>/<uuid>-<nome>.pdf) ou na do cliente
-- (<cliente>/<cartao>/<uuid>-<nome>.pdf); o uuid é o do nome dado no cenário.
create function testes.c_quadro(p_quadro text, p_cartao text, p_arquivo text) returns text language sql stable as $$
  select 'quadro/' || testes.id(p_quadro)::text || '/' || testes.id(p_cartao)::text || '/' || testes.id(p_arquivo)::text
    || '-' || p_arquivo || '.pdf'
$$;

create function testes.c_cliente(p_cliente text, p_cartao text, p_arquivo text) returns text language sql stable as $$
  select testes.id(p_cliente)::text || '/' || testes.id(p_cartao)::text || '/' || testes.id(p_arquivo)::text
    || '-' || p_arquivo || '.pdf'
$$;

-- Imagem da descrição: quadro/<quadro>/<cartao>/imagens/<uuid>.png (ou <cliente>/<cartao>/imagens/<uuid>.png).
create function testes.i_quadro(p_quadro text, p_cartao text, p_imagem text) returns text language sql stable as $$
  select 'quadro/' || testes.id(p_quadro)::text || '/' || testes.id(p_cartao)::text || '/imagens/'
    || testes.id(p_imagem)::text || '.png'
$$;

create function testes.i_cliente(p_cliente text, p_cartao text, p_imagem text) returns text language sql stable as $$
  select testes.id(p_cliente)::text || '/' || testes.id(p_cartao)::text || '/imagens/' || testes.id(p_imagem)::text || '.png'
$$;

-- O objeto no Storage, como a API do Storage grava no envio (dono = quem está logado).
create function testes.subir(p_caminho text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('quadros', p_caminho, (select auth.uid())::text, '{"size": 2048}')
$$;

-- A linha do anexo, gravada por quem está logado.
create function testes.anexar(p_cartao text, p_caminho text) returns uuid language sql as $$
  insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho, tipo)
  values (testes.id(p_cartao), p_caminho, 'arquivo.pdf', 2048, 'application/pdf')
  returning id
$$;

-- Quantos destes objetos quem está logado enxerga; quantos tira (devolve quantos saíram).
create function testes.objetos(p_caminhos text[]) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = 'quadros' and name = any(p_caminhos)
$$;

create function testes.tirar(p_caminhos text[]) returns bigint language plpgsql as $$
declare n bigint;
begin
  with d as (delete from storage.objects where bucket_id = 'quadros' and name = any(p_caminhos) returning 1)
  select count(*) into n from d;
  return n;
end $$;

-- Documento do editor com uma imagem.
create function testes.doc_imagem(p_src text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
    jsonb_build_object('type', 'image', 'attrs', jsonb_build_object('src', p_src))))
$$;

create function testes.ordenado(p_lista jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(p_lista) x
$$;

create function testes.ordem(p_caminhos text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(p_caminhos) x
$$;

-- ── Tempo real ──
-- Entra no canal? A conferência que o servidor do Realtime faz ao entrar num canal privado (realtime.authorize). Roda
-- sem papel (reset role).
create function testes.ouve(p_nome text, p_topico text) returns boolean language sql as $$
  select a.read_allowed[1]
  from realtime.authorize('authenticated', p_topico,
    json_build_object('sub', testes.id(p_nome), 'role', 'authenticated')::text, testes.id(p_nome)::text, '{}',
    array['broadcast'], array[]::text[]) a
$$;

create function testes.canal(p_quadro text) returns text language sql stable as $$
  select 'quadro:' || testes.id(p_quadro)::text
$$;

-- Os avisos de acesso (os que trazem "acesso") mandados no canal do quadro desde a última leitura, em ordem; e some com
-- todos os avisos do canal (só os do teste: o tópico é de um quadro criado aqui, e tudo volta no rollback).
create function testes.avisos(p_quadro text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(m.payload - 'id' order by m.inserted_at), '[]') into v
  from realtime.messages m where m.topic = testes.canal(p_quadro) and m.payload ? 'acesso';
  delete from realtime.messages m where m.topic = testes.canal(p_quadro);
  return v;
end $$;

create function testes.acesso(p_tabela text, p_operacao text) returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('tabela', p_tabela, 'operacao', p_operacao, 'acesso', true))
$$;

-- Apagar direto em storage.objects só passa com esta configuração (o Storage faz o mesmo por dentro); quem decide o
-- que sai são as políticas.
select set_config('storage.allow_delete_query', 'true', true);

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: administrador; gestor_a (gestor do time T1), gestor_a2 (gestor de T2 e T3); m1, m2 e m3 (membros de
-- T1, como a_senha, que ainda precisa trocar a senha, e m_inativo, desativado); fora (consultor do cliente cA, sem
-- time); viajante (vai mudar de consultoria). Consultoria B: administrador (gestor de TB) e b1 (membro de TB).
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
select testes.perfil('a_senha', 'pessoa', 'A');
select testes.perfil('m_inativo', 'pessoa', 'A');
select testes.perfil('fora', 'pessoa', 'A');
select testes.perfil('viajante', 'pessoa', 'A');
select testes.perfil('admin_b', 'admin', 'B');
select testes.perfil('b1', 'pessoa', 'B');

select testes.time('T1', 'A', 'gestor_a', array['m1', 'm2', 'm3', 'a_senha', 'm_inativo']);
select testes.time('T2', 'A', 'gestor_a2', array[]::text[]);
select testes.time('T3', 'A', 'gestor_a2', array[]::text[]);
select testes.time('TB', 'B', 'admin_b', array['b1']);
update public.perfis set precisa_trocar_senha = true where id = testes.id('a_senha');
update public.perfis set ativo = false where id = testes.id('m_inativo');

select testes.cliente('cA', 'A', 'fora');
select testes.cliente('cB', 'B', 'b1');

select testes.quadro('qP', 'pessoa', 'm1', 'Minhas tarefas');
select testes.quadro('qP2', 'pessoa', 'm2', 'Minhas tarefas');
select testes.quadro('qV', 'pessoa', 'viajante', 'Viagem');
select testes.quadro('qPc', 'pessoa', 'central1', 'Tarefas');
select testes.quadro('qPd', 'pessoa', 'dono1', 'Tarefas');
select testes.quadro('qT', 'time', 'T1', 'Sprint');
select testes.quadro('qT2', 'time', 'T2', 'Planejamento');
select testes.quadro('qTB', 'time', 'TB', 'Sprint');

-- ── A tabela ─────────────────────────────────────────────────────────────────

select columns_are('public', 'quadros', array['id', 'cliente_id', 'consultoria_id', 'criado_em', 'tipo', 'pessoa_id',
  'time_id', 'nome', 'nome_busca', 'arquivado_em', 'criado_por'],
  'quadros: o tipo de dono, os donos novos (pessoa e time), o nome, a busca, o arquivamento e quem criou');
select col_is_null('public', 'quadros', 'cliente_id', 'cliente_id só no quadro do cliente');
select col_is_null('public', 'quadros', 'consultoria_id', 'consultoria nula no quadro pessoal da central e do dono');
select col_default_is('public', 'quadros', 'tipo', 'cliente',
  'o tipo padrão é cliente (quadro_do_cliente e o script de exemplo continuam sem mudar)');
select is((select count(*)::int from pg_constraint where conrelid = 'public.quadros'::regclass and conname = 'quadros_um_dono'),
  1, 'a regra de um dono só existe');
select is((select confdeltype from pg_constraint where conrelid = 'public.quadros'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute where attrelid = 'public.quadros'::regclass and attname = 'time_id')]),
  'r'::"char", 'o quadro segura o time (on delete restrict)');
select is((select confdeltype from pg_constraint where conrelid = 'public.quadros'::regclass and contype = 'f'
    and conkey = array[(select attnum from pg_attribute where attrelid = 'public.quadros'::regclass and attname = 'pessoa_id')]),
  'r'::"char", 'e a pessoa do quadro pessoal (on delete restrict)');
select policies_are('public', 'quadros', array['ver quadros', 'renomear e arquivar quadro'],
  'quadros: ver e o update de renomear e arquivar (criar e apagar só por função)');
select policies_are('public', 'quadro_colunas', array['ver colunas', 'criar coluna', 'editar coluna'],
  'colunas: as mesmas regras, com os mesmos nomes');
select ok(has_column_privilege('authenticated', 'public.quadros', 'nome', 'update')
    and has_column_privilege('authenticated', 'public.quadros', 'arquivado_em', 'update'),
  'quem está logado grava nome e arquivado_em (a regra decide quem)');
select ok(not has_column_privilege('authenticated', 'public.quadros', 'tipo', 'update')
    and not has_column_privilege('authenticated', 'public.quadros', 'pessoa_id', 'update')
    and not has_column_privilege('authenticated', 'public.quadros', 'time_id', 'update')
    and not has_column_privilege('authenticated', 'public.quadros', 'cliente_id', 'update')
    and not has_column_privilege('authenticated', 'public.quadros', 'consultoria_id', 'update')
    and not has_column_privilege('authenticated', 'public.quadros', 'criado_por', 'update'),
  'o tipo, os donos, a consultoria e quem criou não se mudam');
select ok(not has_table_privilege('authenticated', 'public.quadros', 'insert')
    and not has_table_privilege('authenticated', 'public.quadros', 'delete'),
  'quadro não nasce nem se apaga direto na tabela');
select ok(has_function_privilege('authenticated', 'private.administro_quadro(uuid)', 'execute')
    and not has_function_privilege('anon', 'private.administro_quadro(uuid)', 'execute'),
  'administro_quadro: quem está logado chama (a regra roda com o papel da pessoa); sem login, não');
select ok(not has_function_privilege('authenticated', 'private.pasta_do_quadro(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'private.objetos_no_balde(text)', 'execute')
    and not has_function_privilege('anon', 'private.estou_no_time(uuid)', 'execute'),
  'os ajudantes internos ficam fora do alcance da API');

-- ── O gatilho do quadro ──────────────────────────────────────────────────────

select testes.so_token('m1');
insert into public.quadros (tipo, pessoa_id, consultoria_id, nome)
values ('pessoa', testes.id('m1'), testes.id('A'), '  Ideias  ');
select testes.guardar('qIdeias', (select id from public.quadros where pessoa_id = testes.id('m1') and nome = 'Ideias'));
select is((select array[nome, nome_busca, criado_por::text] from public.quadros where id = testes.id('qIdeias')),
  array['Ideias', 'ideias', testes.id('m1')::text],
  'o nome fica sem os espaços das pontas, a busca sem maiúscula, e quem criou é quem está logado');
select testes.sistema();
insert into public.quadros (tipo, time_id, consultoria_id, nome) values ('time', testes.id('T1'), testes.id('B'), 'Errado');
select is((select consultoria_id from public.quadros where time_id = testes.id('T1') and nome = 'Errado'), testes.id('A'),
  'no quadro do time, a consultoria é sempre a do time');
delete from public.quadros where time_id = testes.id('T1') and nome = 'Errado';
select is((select consultoria_id from public.quadros where id = testes.id('qT')), testes.id('A'),
  'o quadro do time nasce com a consultoria do time');

-- ── Quadro pessoal: a pessoa vê, mexe, gere e administra ─────────────────────

select testes.como('m1');
select is(testes.regras('qP'), 'vê,mexe,gere,administra', 'a pessoa vê, mexe, gere e administra o próprio quadro');
select is(public.quadro_por_id(testes.id('qP')) - 'colunas' - 'criado_em',
  jsonb_build_object('id', testes.id('qP'), 'cliente_id', null, 'consultoria_id', testes.id('A'), 'pode_mexer', true,
    'pode_gerir', true, 'tipo', 'pessoa', 'nome', 'Minhas tarefas', 'time', null, 'arquivado_em', null,
    'pode_administrar', true, 'favorito', false),
  'quadro_por_id traz as chaves de hoje e mais tipo, nome, time, arquivado_em, pode_administrar e favorito (Task 2)');
select is(jsonb_array_length(public.quadro_por_id(testes.id('qP')) -> 'colunas'), 2, 'com as colunas');
select lives_ok($$select testes.nova_coluna('p_col', 'qP', 'Hoje')$$, 'a pessoa cria coluna');
select lives_ok($$select testes.novo_cartao('kP', 'qP_afazer')$$, 'cria cartão');
select lives_ok($$select testes.comentar('cmP', 'kP')$$, 'comenta');
select lives_ok($$insert into public.cartao_checklist (cartao_id, texto) values (testes.id('kP'), 'Item')$$, 'põe checklist');
select lives_ok($$select testes.responsavel('kP', 'm1')$$, 'e se põe como responsável');
select is(testes.nomes(public.cartoes_do_quadro(testes.id('qP'), testes.id('qP_afazer')) -> 'itens'), 'kP',
  'lê os cartões da coluna');
select is((select string_agg(p ->> 'nome', ',') from jsonb_array_elements(public.pessoas_do_quadro(testes.id('qP'))) p),
  'Pessoa m1', 'no quadro pessoal, só a pessoa pode ser responsável');
select is(testes.visto('qP'), '1,3,1,1,1,1,0', 'e lê tudo do quadro pela API');
select is(public.apagar_coluna(testes.id('p_col')) ->> 'apagados', '0', 'gere: apaga coluna');
select is(testes.mudou($$update public.quadros set nome = '  Pessoal  ' where id = testes.id('qP')$$), 1::bigint,
  'renomeia pelo update');
select is((select nome from public.quadros where id = testes.id('qP')), 'Pessoal', 'sem os espaços das pontas');
reset role;

-- ── Storage no quadro pessoal ────────────────────────────────────────────────

insert into testes.fx select n, gen_random_uuid()
from unnest(array['a_p', 'a_x', 'i_p', 'i_x', 'sobra_p', 'sobra_t', 'a_k2', 'i_k2', 'a_k3', 'a_c']) n;

select testes.como('m1');
select lives_ok(format($$select testes.subir(%L)$$, testes.c_quadro('qP', 'kP', 'a_p')),
  'a pessoa sobe o anexo na pasta do quadro (quadro/<quadro>/<cartão>/...)');
select lives_ok(format($$select testes.anexar('kP', %L)$$, testes.c_quadro('qP', 'kP', 'a_p')), 'e grava a linha');
select ok(private.posso_subir_no_quadro(testes.c_quadro('qP', 'kP', 'a_x')), 'quem mexe no quadro sobe na pasta dele');
select ok(not private.posso_subir_no_quadro(testes.c_cliente('cA', 'kP', 'a_x'))
    and not private.posso_subir_no_quadro(testes.c_cliente('m1', 'kP', 'a_x')),
  'cartão pessoal na forma do cliente (<uuid>/<cartão>/...): não sobe');
select ok(not private.posso_subir_no_quadro(testes.c_quadro('qT', 'kP', 'a_x')),
  'nem com a pasta de outro quadro');
select throws_ok(format($$select testes.anexar('kP', %L)$$, testes.c_cliente('cA', 'kP', 'a_x')), '23514',
  'caminho_invalido', 'a linha do anexo na forma do cliente para cartão pessoal é recusada');
select throws_ok(format($$select testes.anexar('kP', %L)$$, testes.c_quadro('qT', 'kP', 'a_x')), '23514',
  'caminho_invalido', 'e com a pasta de outro quadro');
select testes.novo_cartao('kP2', 'qP_afazer');
select throws_ok(format($$select testes.anexar('kP', %L)$$, testes.c_quadro('qP', 'kP2', 'a_x')), '23514', null,
  'e com o id de outro cartão no lugar do cartão');
select lives_ok(format($$select testes.subir(%L)$$, testes.i_quadro('qP', 'kP', 'i_p')), 'sobe a imagem da descrição');
select is(testes.mudou(format($$update public.cartoes set descricao = %L where id = testes.id('kP')$$,
    testes.doc_imagem(testes.i_quadro('qP', 'kP', 'i_p')))), 1::bigint,
  'a descrição aceita a imagem da pasta de imagens do cartão no quadro');
select throws_ok(format($$update public.cartoes set descricao = %L where id = testes.id('kP')$$,
    testes.doc_imagem(testes.i_cliente('cA', 'kP', 'i_x'))), '23514', 'imagem_invalida',
  'a imagem na forma do cliente, num cartão pessoal, é recusada');
select throws_ok(format($$update public.cartoes set descricao = %L where id = testes.id('kP')$$,
    testes.doc_imagem(testes.i_quadro('qT', 'kP', 'i_x'))), '23514', 'imagem_invalida',
  'e na pasta de outro quadro');
select is(testes.objetos(array[testes.c_quadro('qP', 'kP', 'a_p'), testes.i_quadro('qP', 'kP', 'i_p')]), 2::bigint,
  'a pessoa vê o anexo e a imagem (é o que o link assinado pede)');
-- Um objeto sem uso (a linha não gravou): fica com quem o subiu.
select testes.subir(testes.c_quadro('qP', 'kP', 'sobra_p'));
select is(testes.objetos(array[testes.c_quadro('qP', 'kP', 'sobra_p')]), 1::bigint, 'e a sobra que ela subiu');
reset role;

select testes.como('central1');
select is(testes.objetos(array[testes.c_quadro('qP', 'kP', 'a_p'), testes.i_quadro('qP', 'kP', 'i_p'),
    testes.c_quadro('qP', 'kP', 'sobra_p')]), 0::bigint,
  'a central não vê o anexo, a imagem nem a sobra do quadro pessoal (nem link assinado, nem lista)');
select is(testes.tirar(array[testes.c_quadro('qP', 'kP', 'sobra_p')]), 0::bigint,
  'e não tira objeto sem uso de quadro/...');
reset role;
select testes.como('admin_a');
select is(testes.objetos(array[testes.c_quadro('qP', 'kP', 'a_p'), testes.i_quadro('qP', 'kP', 'i_p'),
    testes.c_quadro('qP', 'kP', 'sobra_p')]), 0::bigint, 'nem o administrador da consultoria');
select ok(not private.posso_subir_no_quadro(testes.c_quadro('qP', 'kP', 'a_x')), 'que também não sobe nada lá');
reset role;

-- Apagar o cartão e a coluna devolvem os objetos da pasta do quadro (o app os tira em seguida).
select testes.como('m1');
select testes.subir(testes.c_quadro('qP', 'kP2', 'a_k2'));
select testes.anexar('kP2', testes.c_quadro('qP', 'kP2', 'a_k2'));
select testes.subir(testes.i_quadro('qP', 'kP2', 'i_k2'));
select is(testes.ordenado(public.apagar_cartao(testes.id('kP2')) -> 'caminhos'),
  testes.ordem(array[testes.c_quadro('qP', 'kP2', 'a_k2'), testes.i_quadro('qP', 'kP2', 'i_k2')]),
  'apagar o cartão devolve o anexo e a imagem, na pasta quadro/<quadro>/<cartão>/');
select is(testes.tirar(array[testes.c_quadro('qP', 'kP2', 'a_k2'), testes.i_quadro('qP', 'kP2', 'i_k2')]), 2::bigint,
  'e quem apagou tira os dois do balde');
select testes.nova_coluna('p_col2', 'qP', 'Depois');
select testes.novo_cartao('kP3', 'p_col2');
select testes.subir(testes.c_quadro('qP', 'kP3', 'a_k3'));
select testes.anexar('kP3', testes.c_quadro('qP', 'kP3', 'a_k3'));
select is(public.apagar_coluna(testes.id('p_col2'), null, true) -> 'caminhos',
  jsonb_build_array(testes.c_quadro('qP', 'kP3', 'a_k3')),
  'apagar a coluna com os cartões junto devolve os objetos deles, na pasta do quadro');
select is(testes.tirar(array[testes.c_quadro('qP', 'kP3', 'a_k3')]), 1::bigint, 'e quem apagou tira');
reset role;

-- ── Quadro pessoal: ninguém mais vê ──────────────────────────────────────────

select testes.como('admin_a');
select is(testes.alcance('qP', 'qP_afazer', 'kP'), testes.nao_ve(),
  'o administrador da consultoria não vê o quadro pessoal (regras, tabelas, funções) nem o renomeia');
reset role;
select testes.como('gestor_a');
select is(testes.alcance('qP', 'qP_afazer', 'kP'), testes.nao_ve(), 'nem o gestor do time da pessoa');
reset role;
select testes.como('m2');
select is(testes.alcance('qP', 'qP_afazer', 'kP'), testes.nao_ve(), 'nem o colega');
reset role;
select testes.como('central1');
select is(testes.alcance('qP', 'qP_afazer', 'kP'), testes.nao_ve(), 'nem a central');
reset role;
select testes.como('dono1');
select is(testes.alcance('qP', 'qP_afazer', 'kP'), testes.nao_ve(), 'nem o dono');
reset role;
select testes.como('b1');
select is(testes.alcance('qP', 'qP_afazer', 'kP'), testes.nao_ve(), 'nem outra consultoria');
reset role;
select testes.sistema();
select is(testes.ouve('admin_a', testes.canal('qP')), false, 'o administrador não entra no canal do quadro pessoal');
select is(testes.ouve('central1', testes.canal('qP')), false, 'nem a central');
select is(testes.ouve('m1', testes.canal('qP')), true, 'a pessoa entra');

-- ── Quadro pessoal fica na consultoria onde nasceu ───────────────────────────

select testes.como('viajante');
select is(testes.regras('qV'), 'vê,mexe,gere,administra', 'a pessoa usa o quadro pessoal na consultoria dela');
reset role;
select testes.sistema();
update public.perfis set consultoria_id = testes.id('B') where id = testes.id('viajante');
select testes.como('viajante');
select is(testes.regras('qV'), 'nada', 'mudou de consultoria: o quadro pessoal some para ela');
select is((select count(*) from public.quadros where id = testes.id('qV')), 0::bigint, 'nem pela tabela');
reset role;
select testes.sistema();
update public.perfis set consultoria_id = testes.id('A') where id = testes.id('viajante');
select testes.como('viajante');
select is(testes.regras('qV'), 'vê,mexe,gere,administra', 'voltou: o quadro reaparece como estava');
reset role;
select testes.sistema();
update public.perfis set papel = 'central', consultoria_id = null where id = testes.id('viajante');
select testes.como('viajante');
select is(testes.regras('qV'), 'nada', 'foi para a central: o quadro da consultoria fica lá');
reset role;

select testes.como('central1');
select is(testes.regras('qPc'), 'vê,mexe,gere,administra', 'a central tem quadro pessoal (consultoria nula)');
select is((select count(*) from public.quadros where id = testes.id('qPc')), 1::bigint, 'e o lê pela tabela');
select is(public.quadro_por_id(testes.id('qPc')) ->> 'tipo', 'pessoa', 'e pelo id');
select is(testes.regras('qPd'), 'nada', 'mas não o do dono');
reset role;
select testes.como('dono1');
select is(testes.regras('qPd'), 'vê,mexe,gere,administra', 'o dono tem o dele');
select is(testes.regras('qPc'), 'nada', 'e não vê o da central');
reset role;

-- ── Quadro do time ───────────────────────────────────────────────────────────

select testes.como('m1');
select is(testes.regras('qT'), 'vê,mexe', 'o membro vê e mexe no quadro do time, mas não gere nem administra');
select lives_ok($$select testes.nova_coluna('t_col', 'qT', 'Revisão')$$, 'o membro cria coluna');
select lives_ok($$select testes.novo_cartao('kT', 'qT_afazer')$$, 'e cartão');
select lives_ok($$select testes.comentar('cmT', 'kT')$$, 'e comenta');
select throws_ok($$select public.apagar_coluna(testes.id('t_col'))$$, 'P0001', 'sem_permissao',
  'o membro não apaga coluna');
select is(testes.mudou($$update public.quadros set nome = 'Outro' where id = testes.id('qT')$$), 0::bigint,
  'nem renomeia o quadro');
select is(public.quadro_por_id(testes.id('qT')) -> 'time',
  jsonb_build_object('id', testes.id('T1'), 'nome', 'Time T1'), 'quadro_por_id traz o time');
select is(public.quadro_por_id(testes.id('qT')) - 'colunas' - 'criado_em' - 'time' - 'id' - 'consultoria_id',
  jsonb_build_object('cliente_id', null, 'pode_mexer', true, 'pode_gerir', false, 'tipo', 'time', 'nome', 'Sprint',
    'arquivado_em', null, 'pode_administrar', false, 'favorito', false),
  'e o que o membro pode');
select testes.novo_cartao('kT1', 'qT_afazer');
reset role;
select testes.como('m2');
select testes.novo_cartao('kT2', 'qT_afazer');
select testes.comentar('cmT2', 'kT');
reset role;
select testes.como('m1');
select throws_ok($$select public.apagar_cartao(testes.id('kT2'))$$, 'P0001', 'sem_permissao',
  'o membro não apaga o cartão de outro membro');
select is(testes.mudou($$delete from public.cartao_comentarios where id = testes.id('cmT2')$$), 0::bigint,
  'nem o comentário dele');
select is(public.apagar_cartao(testes.id('kT1')) -> 'caminhos', '[]'::jsonb, 'apaga o cartão que criou');
reset role;

select testes.como('gestor_a');
select is(testes.regras('qT'), 'vê,mexe,gere,administra', 'o gestor do time vê, mexe, gere e administra');
select is(testes.mudou($$delete from public.cartao_comentarios where id = testes.id('cmT2')$$), 1::bigint,
  'apaga o comentário de um membro');
select is(public.apagar_coluna(testes.id('t_col')) ->> 'apagados', '0', 'e apaga coluna');
reset role;
select testes.como('admin_a');
select is(testes.regras('qT'), 'vê,mexe,gere,administra',
  'o administrador da consultoria vê, mexe, gere e administra os quadros de time dela');
select is(public.quadro_por_id(testes.id('qT')) -> 'pode_administrar', 'true'::jsonb, 'quadro_por_id diz que administra');
select is(public.apagar_cartao(testes.id('kT2')) -> 'caminhos', '[]'::jsonb, 'e apaga o cartão de qualquer um');
select is(testes.regras('qTB'), 'nada', 'mas não os de outra consultoria');
reset role;
select testes.como('a_senha');
select is(testes.regras('qT'), 'nada', 'membro com a sessão não liberada (senha provisória) não vê');
reset role;
select testes.como('m_inativo');
select is(testes.regras('qT'), 'nada', 'nem o membro desativado');
reset role;

select testes.como('gestor_a2');
select is(testes.alcance('qT', 'qT_afazer', 'kT'), testes.nao_ve(), 'o gestor de outro time não vê o quadro do time');
reset role;
select testes.como('fora');
select is(testes.alcance('qT', 'qT_afazer', 'kT'), testes.nao_ve(), 'nem o consultor fora do time');
reset role;
select testes.como('central1');
select is(testes.alcance('qT', 'qT_afazer', 'kT'), testes.nao_ve(), 'nem a central');
reset role;
select testes.como('dono1');
select is(testes.alcance('qT', 'qT_afazer', 'kT'), testes.nao_ve(), 'nem o dono');
reset role;
select testes.como('admin_b');
select is(testes.alcance('qT', 'qT_afazer', 'kT'), testes.nao_ve(), 'nem o administrador de outra consultoria');
reset role;
select testes.como('b1');
select is(testes.alcance('qT', 'qT_afazer', 'kT'), testes.nao_ve(), 'nem quem é de outra consultoria');
reset role;
select testes.sistema();
select is(testes.ouve('m1', testes.canal('qT')), true, 'o membro entra no canal do quadro do time');
select is(testes.ouve('admin_a', testes.canal('qT')), true, 'o administrador também');
select is(testes.ouve('gestor_a2', testes.canal('qT')), false, 'o gestor de outro time não');
select is(testes.ouve('central1', testes.canal('qT')), false, 'nem a central');

-- ── Responsáveis ─────────────────────────────────────────────────────────────

select testes.como('m1');
select testes.novo_cartao('kT1b', 'qT_afazer');
select throws_ok($$select testes.responsavel('kP', 'admin_a')$$, 'P0001', 'responsavel_invalido',
  'no quadro pessoal, o administrador não pode ser responsável');
select throws_ok($$select testes.responsavel('kP', 'm2')$$, 'P0001', 'responsavel_invalido', 'nem o colega');
select lives_ok($$select testes.responsavel('kT', 'm2')$$, 'no quadro do time, um membro pode');
select lives_ok($$select testes.responsavel('kT', 'gestor_a')$$, 'e o gestor do time');
select throws_ok($$select testes.responsavel('kT', 'admin_a')$$, 'P0001', 'responsavel_invalido',
  'o administrador fora do time, não');
select throws_ok($$select testes.responsavel('kT', 'm_inativo')$$, 'P0001', 'responsavel_invalido',
  'nem o membro desativado');
select throws_ok($$select testes.responsavel('kT', 'b1')$$, 'P0001', 'responsavel_invalido', 'nem quem é de outra consultoria');
select is((select string_agg(p ->> 'nome', ',') from jsonb_array_elements(public.pessoas_do_quadro(testes.id('qT'))) p),
  'Pessoa a_senha,Pessoa gestor_a,Pessoa m1,Pessoa m2,Pessoa m3',
  'pessoas_do_quadro: os membros e o gestor do time, ativos, pelo nome');
select is((select string_agg(p ->> 'nome', ',') from jsonb_array_elements(public.pessoas_do_quadro(testes.id('qT'), 'm2')) p),
  'Pessoa m2', 'com a busca pelo nome');
reset role;

-- ── Tirar do time tira o acesso na hora ──────────────────────────────────────

select testes.sistema();
delete from public.time_membros where time_id = testes.id('T1') and pessoa_id = testes.id('m2');
select testes.como('m2');
select is(testes.regras('qT'), 'nada', 'tirado do time: não vê nem mexe mais no quadro do time');
select throws_ok($$select testes.novo_cartao('kT_m2', 'qT_afazer')$$, '42501', 'sem_permissao',
  'e a gravação que estava pendente é recusada');
reset role;
select is((select count(*) from public.cartao_responsaveis
  where cartao_id = testes.id('kT') and perfil_id = testes.id('m2')), 1::bigint, 'quem saiu fica nos cartões em que estava');
select testes.como('m1');
select throws_ok($$select testes.responsavel('kT1b', 'm2')$$, 'P0001', 'responsavel_invalido',
  'mas não é posto em outro cartão do quadro');
reset role;
select testes.sistema();
update public.times set gestor_id = testes.id('gestor_a2') where id = testes.id('T1');
select testes.como('gestor_a2');
select is(testes.regras('qT'), 'vê,mexe,gere,administra', 'trocar o gestor do time passa a administração na hora');
reset role;
select testes.como('gestor_a');
select is(testes.regras('qT'), 'nada', 'e o gestor antigo, que não é membro, deixa de ver');
reset role;
select testes.sistema();
update public.times set gestor_id = testes.id('gestor_a') where id = testes.id('T1');

-- ── Quadro arquivado: só para ler ────────────────────────────────────────────

select testes.como('gestor_a');
select is(testes.mudou($$update public.quadros set arquivado_em = '2000-01-01' where id = testes.id('qT')$$), 1::bigint,
  'o gestor do time arquiva pelo update');
reset role;
select ok((select arquivado_em > now() - interval '1 minute' from public.quadros where id = testes.id('qT')),
  'com a hora do banco (não a que veio do app)');
select testes.como('m1');
select is(testes.regras('qT'), 'vê', 'arquivado: o membro só lê');
select throws_ok($$select testes.novo_cartao('kT_arq', 'qT_afazer')$$, '42501', 'sem_permissao', 'não cria cartão');
select is(testes.mudou($$update public.cartoes set titulo = 'Mudou' where id = testes.id('kT')$$), 0::bigint,
  'não edita cartão');
select throws_ok($$select testes.comentar('cm_arq', 'kT')$$, '42501', null, 'não comenta');
select throws_ok(format($$select public.mover_cartao(%L, %L)$$, testes.id('kT'), testes.id('qT_feito')), 'P0001',
  'sem_permissao', 'não move');
select ok((public.quadro_por_id(testes.id('qT')) ->> 'arquivado_em') is not null
    and (public.quadro_por_id(testes.id('qT')) -> 'pode_mexer') = 'false'::jsonb,
  'quadro_por_id diz que está arquivado e que não mexe');
reset role;
select testes.como('gestor_a');
select is(testes.regras('qT'), 'vê,administra', 'o gestor também só lê, mas continua administrando (restaura ou apaga)');
select throws_ok($$select public.apagar_coluna(testes.id('qT_feito'))$$, 'P0001', 'sem_permissao',
  'e não apaga coluna do quadro arquivado');
reset role;
create temp table arquivado as select arquivado_em from public.quadros where id = testes.id('qT');
select testes.como('gestor_a');
select is(testes.mudou($$update public.quadros set arquivado_em = now() + interval '1 day' where id = testes.id('qT')$$),
  1::bigint, 'arquivar de novo passa');
reset role;
select is((select arquivado_em from public.quadros where id = testes.id('qT')), (select arquivado_em from arquivado),
  'mas a data de quem já estava arquivado não muda');
select testes.como('gestor_a');
select is(testes.mudou($$update public.quadros set arquivado_em = null where id = testes.id('qT')$$), 1::bigint,
  'restaura');
reset role;
select testes.como('m1');
select is(testes.regras('qT'), 'vê,mexe', 'restaurado: o membro volta a mexer');
select is(testes.mudou($$update public.quadros set arquivado_em = now() where id = testes.id('qP')$$), 1::bigint,
  'a pessoa arquiva o quadro pessoal');
select is(testes.regras('qP'), 'vê,administra', 'e passa a só ler (administrando)');
select throws_ok($$select testes.novo_cartao('kP_arq', 'qP_afazer')$$, '42501', 'sem_permissao',
  'sem criar cartão');
select is(testes.mudou($$update public.quadros set arquivado_em = null where id = testes.id('qP')$$), 1::bigint,
  'restaura');
select is(testes.regras('qP'), 'vê,mexe,gere,administra', 'e volta a mexer');
reset role;

-- ── Um dono só ───────────────────────────────────────────────────────────────

select testes.sistema();
select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, time_id, consultoria_id, nome)
    values ('pessoa', %L, %L, %L, 'Dois donos')$$, testes.id('m1'), testes.id('T1'), testes.id('A')),
  '23514', null, 'quadro com dois donos é recusado');
select throws_ok(format($$insert into public.quadros (tipo, consultoria_id, nome) values ('pessoa', %L, 'Sem dono')$$,
    testes.id('A')), '23514', null, 'sem dono também');
select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome)
    values ('time', %L, %L, 'Trocado')$$, testes.id('m1'), testes.id('A')),
  '23514', null, 'e com o dono de outro tipo');
select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome)
    values ('outro', %L, %L, 'Outro')$$, testes.id('m1'), testes.id('A')),
  '23514', null, 'tipo que não existe');
select throws_ok(format($$insert into public.quadros (cliente_id, consultoria_id, nome) values (%L, %L, 'Nome')$$,
    testes.id('cB'), testes.id('B')), '23514', null, 'o quadro do cliente não tem nome');
select throws_ok(format($$insert into public.quadros (cliente_id, consultoria_id, arquivado_em) values (%L, %L, now())$$,
    testes.id('cB'), testes.id('B')), '23514', null, 'nem se arquiva');
select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id) values ('pessoa', %L, %L)$$,
    testes.id('m1'), testes.id('A')), '23514', null, 'o pessoal tem nome');
select throws_ok(format($$insert into public.quadros (tipo, time_id) values ('time', %L)$$, testes.id('T1')),
  '23514', null, 'o do time também');
select throws_ok(format($$insert into public.quadros (tipo, cliente_id, nome) values ('cliente', %L, null)$$,
    testes.id('cB')), '23514', null, 'o do cliente tem consultoria');

-- ── O nome ───────────────────────────────────────────────────────────────────

select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome) values ('pessoa', %L, %L, '   ')$$,
    testes.id('m3'), testes.id('A')), '23514', null, 'nome em branco é recusado');
select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome) values ('pessoa', %L, %L, %L)$$,
    testes.id('m3'), testes.id('A'), repeat('x', 81)), '23514', null, 'nome com mais de 80 letras também');
select lives_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome) values ('pessoa', %L, %L, %L)$$,
    testes.id('m3'), testes.id('A'), repeat('x', 80)), 'com 80, passa');
select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome) values ('pessoa', %L, %L, 'IDÉIAS')$$,
    testes.id('m1'), testes.id('A')), '23505', null,
  'o nome não se repete entre os quadros pessoais abertos da pessoa (sem acento e sem maiúscula)');
select lives_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome) values ('pessoa', %L, %L, 'Ideias')$$,
    testes.id('m2'), testes.id('A')), 'outra pessoa usa o mesmo nome');
select throws_ok(format($$insert into public.quadros (tipo, pessoa_id, nome) values ('pessoa', %L, 'tarefas')$$,
    testes.id('central1')), '23505', null, 'na central (consultoria nula) o nome também não se repete');
select throws_ok(format($$insert into public.quadros (tipo, time_id, nome) values ('time', %L, ' sprint ')$$,
    testes.id('T1')), '23505', null, 'nem entre os quadros abertos do mesmo time');
select lives_ok(format($$insert into public.quadros (tipo, time_id, nome) values ('time', %L, 'Sprint')$$,
    testes.id('T2')), 'outro time usa o mesmo nome');
select lives_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome) values ('pessoa', %L, %L, 'Sprint')$$,
    testes.id('m1'), testes.id('A')), 'e um quadro pessoal pode ter o nome de um quadro do time');
select testes.como('m1');
select throws_ok($$update public.quadros set nome = 'ideias' where id = testes.id('qP')$$, '23505', null,
  'renomear para um nome em uso é recusado');
select is(testes.mudou($$update public.quadros set arquivado_em = now() where id = testes.id('qIdeias')$$), 1::bigint,
  'arquivar libera o nome');
reset role;
select testes.sistema();
select lives_ok(format($$insert into public.quadros (tipo, pessoa_id, consultoria_id, nome) values ('pessoa', %L, %L, 'Ideias')$$,
    testes.id('m1'), testes.id('A')), 'e outro quadro aberto pode usá-lo');
select testes.como('m1');
select throws_ok($$update public.quadros set arquivado_em = null where id = testes.id('qIdeias')$$, '23505', null,
  'restaurar com um nome em uso entre os abertos é recusado');
reset role;

-- ── O quadro segura o time ───────────────────────────────────────────────────

select testes.sistema();
select throws_ok(format($$delete from public.times where id = %L$$, testes.id('T2')), '23503', null,
  'time com quadro aberto não se apaga');
update public.quadros set arquivado_em = now() where time_id = testes.id('T2');
select throws_ok(format($$delete from public.times where id = %L$$, testes.id('T2')), '23503', null,
  'nem com os quadros arquivados');
select lives_ok(format($$delete from public.times where id = %L$$, testes.id('T3')), 'time sem quadros se apaga');

-- ── Quem administra tira a sobra da pasta do quadro do time ──────────────────

select testes.como('m1');
select testes.novo_cartao('kTs', 'qT_afazer');
select testes.subir(testes.c_quadro('qT', 'kTs', 'sobra_t'));
reset role;
select testes.como('m3');
select is(testes.objetos(array[testes.c_quadro('qT', 'kTs', 'sobra_t')]), 0::bigint,
  'a sobra de outro membro (objeto sem linha) não aparece para o membro');
select is(testes.tirar(array[testes.c_quadro('qT', 'kTs', 'sobra_t')]), 0::bigint, 'e ele não tira');
reset role;
select testes.como('central1');
select is(testes.tirar(array[testes.c_quadro('qT', 'kTs', 'sobra_t')]), 0::bigint, 'nem a central');
reset role;
select testes.como('gestor_a');
select is(testes.objetos(array[testes.c_quadro('qT', 'kTs', 'sobra_t')]), 1::bigint,
  'quem administra o quadro vê a sobra da pasta dele');
select is(testes.tirar(array[testes.c_quadro('qT', 'kTs', 'sobra_t')]), 1::bigint, 'e tira');
reset role;

-- ── O canal avisa quando o acesso muda ───────────────────────────────────────

select testes.sistema();
select testes.avisos('qT');
select testes.avisos('qT2');
delete from public.time_membros where time_id = testes.id('T1') and pessoa_id = testes.id('m3');
select is(testes.avisos('qT'), testes.acesso('time_membros', 'delete'),
  'tirar alguém do time avisa no canal de cada quadro do time (a tela relê e entra de novo)');
select is(testes.ouve('m3', testes.canal('qT')), false, 'e quem saiu não entra mais no canal');
insert into public.time_membros (time_id, pessoa_id) values (testes.id('T1'), testes.id('m3'));
select is(testes.avisos('qT'), testes.acesso('time_membros', 'insert'), 'pôr alguém no time também avisa');
select is(testes.ouve('m3', testes.canal('qT')), true, 'e quem entrou entra no canal');
select is(testes.avisos('qT2'), '[]'::jsonb, 'os quadros de outro time não recebem nada');
update public.times set gestor_id = testes.id('gestor_a2') where id = testes.id('T1');
select is(testes.avisos('qT'), testes.acesso('times', 'update'), 'trocar o gestor do time avisa');
update public.times set gestor_id = testes.id('gestor_a') where id = testes.id('T1');
select testes.avisos('qT');
update public.times set descricao = 'Só uma descrição' where id = testes.id('T1');
select is(testes.avisos('qT'), '[]'::jsonb, 'mudar outra coisa do time não avisa');
select testes.como('gestor_a');
select testes.mudou($$update public.quadros set nome = 'Sprint 2' where id = testes.id('qT')$$);
reset role;
select is(testes.avisos('qT'), testes.acesso('quadros', 'update'), 'renomear o quadro avisa no canal dele');
select testes.como('gestor_a');
select testes.mudou($$update public.quadros set nome = 'Sprint 2' where id = testes.id('qT')$$);
reset role;
select is(testes.avisos('qT'), '[]'::jsonb, 'renomear para o mesmo nome não avisa');
select testes.como('gestor_a');
select testes.mudou($$update public.quadros set arquivado_em = now() where id = testes.id('qT')$$);
reset role;
select is(testes.avisos('qT'), testes.acesso('quadros', 'update'), 'arquivar avisa');
select testes.como('gestor_a');
select testes.mudou($$update public.quadros set arquivado_em = null where id = testes.id('qT')$$);
reset role;
select is(testes.avisos('qT'), testes.acesso('quadros', 'update'), 'restaurar avisa');
select testes.quadro('qApagar', 'time', 'T1', 'Para apagar');
select testes.avisos('qApagar');
delete from public.quadros where id = testes.id('qApagar');
select is(testes.avisos('qApagar'), testes.acesso('quadros', 'delete'), 'apagar o quadro avisa no canal dele');

-- ── O quadro do cliente como antes ───────────────────────────────────────────

select testes.como('fora');
select testes.abrir('qA', 'cA');
select is(testes.regras('qA'), 'vê,mexe', 'o consultor do cliente vê e mexe no quadro do cliente');
select is((select array_agg(k order by k) from jsonb_object_keys(public.quadro_do_cliente(testes.id('cA'))) k),
  array['cliente_id', 'colunas', 'consultoria_id', 'criado_em', 'id', 'pode_gerir', 'pode_mexer'],
  'quadro_do_cliente devolve as mesmas chaves de antes');
select is(public.quadro_por_id(testes.id('qA')), public.quadro_do_cliente(testes.id('cA')),
  'e quadro_por_id de um quadro de cliente devolve o mesmo que quadro_do_cliente (sem as chaves novas)');
select testes.guardar('qA_afazer', (select id from public.quadro_colunas where quadro_id = testes.id('qA') and nome = 'A fazer'));
select testes.novo_cartao('kA', 'qA_afazer');
select ok(not private.posso_subir_no_quadro(testes.c_quadro('qA', 'kA', 'a_c')),
  'cartão de cliente com a pasta quadro/<quadro>/: não sobe');
select ok(private.posso_subir_no_quadro(testes.c_cliente('cA', 'kA', 'a_c')), 'na pasta do cliente, sobe como antes');
select throws_ok(format($$select testes.anexar('kA', %L)$$, testes.c_quadro('qA', 'kA', 'a_c')), '23514',
  'caminho_invalido', 'e a linha do anexo na forma quadro/ para cartão de cliente é recusada');
select throws_ok(format($$update public.cartoes set descricao = %L where id = testes.id('kA')$$,
    testes.doc_imagem(testes.i_quadro('qA', 'kA', 'i_x'))), '23514', 'imagem_invalida',
  'como a imagem na forma quadro/ num cartão de cliente');
reset role;
select testes.sistema();
select is((select array[tipo, coalesce(nome, 'sem nome'), criado_por::text] from public.quadros where id = testes.id('qA')),
  array['cliente', 'sem nome', testes.id('fora')::text], 'o quadro do cliente nasce com tipo cliente, sem nome');
select testes.como('admin_a');
select is(testes.regras('qA'), 'vê,mexe,gere', 'a gestão gere o quadro do cliente; ninguém o administra (nem arquiva)');
select is(testes.mudou($$update public.quadros set nome = 'Nome' where id = testes.id('qA')$$), 0::bigint,
  'o quadro do cliente não se renomeia');
reset role;

-- A central lê os quadros do cliente pela tabela, inclusive o de uma consultoria anterior.
select testes.sistema();
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('cA');
update public.clientes set consultor_id = testes.id('b1') where id = testes.id('cA');
select testes.como('b1');
select testes.abrir('qA2', 'cA');
reset role;
select testes.como('central1');
select is(testes.regras('qA'), 'vê', 'a central lê o quadro do cliente da consultoria anterior');
select is(testes.visto('qA'), '1,3,1,0,0,0,0', 'pela tabela: o quadro, as colunas e os cartões');
select is((select count(*) from public.quadros where cliente_id = testes.id('cA')), 2::bigint,
  'e os dois quadros do cliente');
select is(public.quadro_por_id(testes.id('qA')) ->> 'id', testes.id('qA')::text, 'e pelo id');
select is((select count(*) from public.quadros where id in (testes.id('qP'), testes.id('qT'), testes.id('qPd'))),
  0::bigint, 'mas nenhum quadro pessoal de outro, nem de time');
reset role;

select * from finish();
rollback;
