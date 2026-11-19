-- Anexos e imagens da descrição dos cartões (plano docs/superpowers/plans/2026-11-17-kanban-do-cliente.md, Task 2):
-- a linha do anexo (cartao_anexos) e o objeto no balde privado "quadros" (pasta <cliente>/<cartao>/): quem envia, quem
-- vê (baixa pelo link assinado) e quem apaga; a imagem da descrição (<cliente>/<cartao>/imagens/<uuid>.<ext>); apagar o
-- cartão, a coluna com os cartões junto e o cliente (o que sobra no Storage e quem tira); a descrição conferida no banco
-- (só o JSON do editor, link só http/https/mailto, imagem só deste cartão no balde); e os gatilhos sem oráculo (quem
-- não mexe no quadro recebe 42501 antes de qualquer outra resposta). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(146);

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

-- O quadro que quem está logado recebe ao abrir a aba, a coluna pelo nome e o cartão novo (guardados no cenário).
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

create function testes.novo_cartao(p_nome text, p_coluna text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.cartoes (coluna_id, titulo) values (testes.id(p_coluna), 'Cartão ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Caminho do anexo no balde: <cliente>/<cartao>/<uuid>-<nome>.pdf (o uuid é o do anexo no cenário).
create function testes.c_anexo(p_cliente text, p_cartao text, p_anexo text) returns text language sql stable as $$
  select testes.id(p_cliente)::text || '/' || testes.id(p_cartao)::text || '/' || testes.id(p_anexo)::text || '-'
    || p_anexo || '.pdf'
$$;

-- Caminho da imagem da descrição: <cliente>/<cartao>/imagens/<uuid>.<ext>.
create function testes.c_imagem(p_cliente text, p_cartao text, p_imagem text, p_ext text default 'png') returns text
language sql stable as $$
  select testes.id(p_cliente)::text || '/' || testes.id(p_cartao)::text || '/imagens/' || testes.id(p_imagem)::text
    || '.' || p_ext
$$;

-- O objeto no Storage, como a API do Storage grava no envio (dono = quem está logado).
create function testes.subir(p_caminho text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('quadros', p_caminho, (select auth.uid())::text, '{"size": 2048}')
$$;

-- A linha do anexo, gravada por quem está logado (o id da linha fica no cenário como "linha_<anexo>").
create function testes.anexar(p_anexo text, p_cliente text, p_cartao text, p_tamanho bigint default 2048)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho, tipo)
  values (testes.id(p_cartao), testes.c_anexo(p_cliente, p_cartao, p_anexo), p_anexo || '.pdf', p_tamanho,
    'application/pdf')
  returning id into v;
  insert into testes.fx values ('linha_' || p_anexo, v);
  return v;
end $$;

-- Envia como o app: sobe o objeto e grava a linha.
create function testes.enviar(p_anexo text, p_cliente text, p_cartao text) returns uuid language plpgsql as $$
begin
  perform testes.subir(testes.c_anexo(p_cliente, p_cartao, p_anexo));
  return testes.anexar(p_anexo, p_cliente, p_cartao);
end $$;

-- Quantas destas linhas / destes objetos quem está logado enxerga (só os do cenário: o banco tem dados reais).
create function testes.linhas(p_anexos text[]) returns bigint language sql stable as $$
  select count(*) from public.cartao_anexos where id in (select testes.id('linha_' || n) from unnest(p_anexos) n)
$$;

create function testes.objetos(p_caminhos text[]) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = 'quadros' and name = any(p_caminhos)
$$;

-- Tira do Storage o que quem está logado pode tirar destes caminhos; devolve quantos saíram.
create function testes.tirar(p_caminhos text[]) returns bigint language plpgsql as $$
declare n bigint;
begin
  with d as (delete from storage.objects where bucket_id = 'quadros' and name = any(p_caminhos) returning 1)
  select count(*) into n from d;
  return n;
end $$;

-- Apaga a linha do anexo (a regra decide); devolve quantas saíram.
create function testes.apagar_anexo(p_anexo text) returns bigint language plpgsql as $$
declare n bigint;
begin
  with d as (delete from public.cartao_anexos where id = testes.id('linha_' || p_anexo) returning 1)
  select count(*) into n from d;
  return n;
end $$;

-- Documentos do editor: um com uma imagem, outro com um link.
create function testes.doc_imagem(p_src text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
    jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Veja:'))),
    jsonb_build_object('type', 'image', 'attrs', jsonb_build_object('src', p_src, 'alt', 'print'))))
$$;

create function testes.doc_link(p_href text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object('type', 'paragraph',
    'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'site',
      'marks', jsonb_build_array(jsonb_build_object('type', 'link', 'attrs', jsonb_build_object('href', p_href))))))))
$$;

-- Grava a descrição do cartão (quem está logado); devolve quantas linhas mudaram.
create function testes.descrever(p_cartao text, p_doc jsonb) returns bigint language plpgsql as $$
declare n bigint;
begin
  with u as (update public.cartoes set descricao = p_doc where id = testes.id(p_cartao) returning 1)
  select count(*) into n from u;
  return n;
end $$;

-- Listas de caminhos em ordem, para comparar.
create function testes.ordenado(p_lista jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(p_lista) x
$$;

create function testes.ordem(p_caminhos text[]) returns text[] language sql immutable as $$
  select coalesce(array_agg(x order by x), '{}') from unnest(p_caminhos) x
$$;

-- Apagar direto em storage.objects só passa com esta configuração (o Storage faz o mesmo por dentro); quem decide o
-- que sai são as políticas.
select set_config('storage.allow_delete_query', 'true', true);

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: administrador, gestor, a1 (consultor de cA, cArq, cDel e cCheio) e a2 (colega). Consultoria B: gestor
-- e b1 (consultor de cB). k1, k3, k4 (de a1) e k2 (do gestor) no quadro de cA.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('dono1', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('a1', 'pessoa', 'A');
select testes.perfil('a2', 'pessoa', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('b1', 'pessoa', 'B');

select testes.cliente('cA', 'A', 'a1');
select testes.cliente('cArq', 'A', 'a1');
select testes.cliente('cDel', 'A', 'a1');
select testes.cliente('cCheio', 'A', 'a1');
select testes.cliente('cB', 'B', 'b1');

insert into testes.fx
select n, gen_random_uuid()
from unnest(array['a_a1', 'a_a1b', 'a_gestor', 'a_admin', 'a_x', 'a_solto', 'a_lixo', 'a_del', 'a_cheio',
  'i1', 'i1b', 'i_x', 'i_k4', 'i_k2', 'i_lixo', 'i_del']) n;
insert into testes.fx select 'a_k3_' || n, gen_random_uuid() from generate_series(1, 16) n;

select testes.como('a1');
select testes.abrir('qA', 'cA');
select testes.abrir('qArq', 'cArq');
select testes.abrir('qDel', 'cDel');
select testes.abrir('qCheio', 'cCheio');
select testes.coluna('afazer', 'qA', 'A fazer');
select testes.coluna('arq_afazer', 'qArq', 'A fazer');
select testes.coluna('del_afazer', 'qDel', 'A fazer');
select testes.coluna('cheio_afazer', 'qCheio', 'A fazer');
select testes.novo_cartao('k1', 'afazer');
select testes.novo_cartao('k3', 'afazer');
select testes.novo_cartao('k4', 'afazer');
select testes.novo_cartao('karq', 'arq_afazer');
select testes.novo_cartao('kdel', 'del_afazer');
select testes.novo_cartao('kcheio', 'cheio_afazer');
reset role;
select testes.como('gestor_a');
select testes.novo_cartao('k2', 'afazer');
reset role;
select testes.como('b1');
select testes.abrir('qB', 'cB');
select testes.coluna('b_afazer', 'qB', 'A fazer');
select testes.novo_cartao('kb', 'b_afazer');
reset role;

-- cArq arquivado (com quadro e cartão); o quadro de cCheio no limite de 50 colunas e kcheio com 200 itens.
select testes.sistema();
update public.clientes set arquivado_em = now() where id = testes.id('cArq');
insert into public.quadro_colunas (quadro_id, nome) select testes.id('qCheio'), 'Coluna ' || n from generate_series(1, 47) n;
insert into public.cartao_checklist (cartao_id, texto) select testes.id('kcheio'), 'Item ' || n from generate_series(1, 200) n;

-- ── Balde ────────────────────────────────────────────────────────────────────

select is((select public from storage.buckets where id = 'quadros'), false,
  'o balde quadros existe e é privado (baixar só por link assinado)');
select is((select file_size_limit from storage.buckets where id = 'quadros'), 26214400::bigint, 'aceita até 25 MB');
select is((select allowed_mime_types from storage.buckets where id = 'quadros'), null::text[],
  'aceita qualquer tipo de arquivo');

-- ── Quem anexa ───────────────────────────────────────────────────────────────

select testes.como('a1');
select lives_ok($$select testes.enviar('a_a1', 'cA', 'k1')$$,
  'o consultor do cliente anexa um arquivo ao cartão (sobe o objeto e grava a linha)');
select ok((select enviado_por = testes.id('a1') and enviado_em > now() - interval '1 minute'
    from public.cartao_anexos where id = testes.id('linha_a_a1')),
  'quem enviou é quem está logado, com a data do banco');
select throws_ok(format($$insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho, enviado_por)
    values (%L, %L, 'x.pdf', 10, %L)$$, testes.id('k1'), testes.c_anexo('cA', 'k1', 'a_x'), testes.id('gestor_a')),
  '42501', null, 'o autor não vem do app');
select throws_ok(format($$insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho) values (%L, %L, 'x.pdf', 10)$$,
    testes.id('k1'), testes.c_anexo('cA', 'k3', 'a_x')),
  '23514', null, 'o caminho fica na pasta do próprio cartão');
select throws_ok(format($$insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho) values (%L, %L, 'x.pdf', 10)$$,
    testes.id('k1'), testes.c_anexo('cB', 'k1', 'a_x')),
  '23514', 'caminho_invalido', 'e na pasta do cliente do quadro');
select throws_ok(format($$insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho) values (%L, %L, 'x.pdf', 10)$$,
    testes.id('k1'), testes.id('cA')::text || '/' || testes.id('k1')::text || '/' || testes.id('a_x')::text || '-a b.pdf'),
  '23514', null, 'o nome no caminho só tem letras, números, ponto, hífen e sublinhado');
select throws_ok($$select testes.anexar('a_x', 'cA', 'k1', 26214401)$$, '23514', null, 'anexo acima de 25 MB é recusado');
select throws_ok(format($$update public.cartao_anexos set nome = 'Outro.pdf' where id = %L$$, testes.id('linha_a_a1')),
  '42501', null, 'o anexo não é editado (apagar e enviar de novo)');
reset role;

select testes.como('gestor_a');
select lives_ok($$select testes.enviar('a_gestor', 'cA', 'k1')$$, 'o gestor da consultoria anexa');
reset role;
select testes.como('admin_a');
select lives_ok($$select testes.enviar('a_admin', 'cA', 'k2')$$, 'o administrador da consultoria anexa');
reset role;

select testes.como('a2');
select throws_ok($$select testes.anexar('a_x', 'cA', 'k1')$$, '42501', 'sem_permissao',
  'o colega que não é consultor do cliente não anexa');
reset role;
select testes.como('gestor_b');
select throws_ok($$select testes.anexar('a_x', 'cA', 'k1')$$, '42501', 'sem_permissao', 'outra consultoria não anexa');
reset role;
select testes.como('central1');
select throws_ok($$select testes.anexar('a_x', 'cA', 'k1')$$, '42501', 'sem_permissao', 'a central não anexa (só lê)');
reset role;
select testes.como('a1');
select throws_ok($$select testes.anexar('a_x', 'cArq', 'karq')$$, '42501', 'sem_permissao',
  'cliente arquivado: ninguém anexa');
reset role;

-- ── Quem vê os anexos ────────────────────────────────────────────────────────

select testes.como('a1');
select is(testes.linhas(array['a_a1', 'a_gestor', 'a_admin']), 3::bigint, 'o consultor vê os anexos dos cartões do quadro');
reset role;
select testes.como('gestor_a');
select is(testes.linhas(array['a_a1', 'a_gestor', 'a_admin']), 3::bigint, 'o gestor também');
reset role;
select testes.como('a2');
select is(testes.linhas(array['a_a1', 'a_gestor', 'a_admin']), 0::bigint, 'o colega que não é consultor do cliente não vê');
reset role;
select testes.como('gestor_b');
select is(testes.linhas(array['a_a1', 'a_gestor', 'a_admin']), 0::bigint, 'outra consultoria não vê');
reset role;
select testes.como('central1');
select is(testes.linhas(array['a_a1', 'a_gestor', 'a_admin']), 3::bigint, 'a central vê (só lê)');
reset role;
select testes.como('dono1');
select is(testes.linhas(array['a_a1', 'a_gestor', 'a_admin']), 3::bigint, 'o dono vê (só lê)');
reset role;
select ok(not has_table_privilege('anon', 'public.cartao_anexos', 'select'), 'sem login não se lê anexo');
select ok(not has_table_privilege('authenticated', 'public.cartao_anexos', 'update'), 'ninguém edita anexo pela API');

-- ── Objetos no Storage ───────────────────────────────────────────────────────

select testes.como('a1');
select lives_ok(format($$select testes.subir(%L)$$, testes.c_imagem('cA', 'k1', 'i1')),
  'o consultor sobe uma imagem da descrição na pasta do cartão');
select lives_ok(format($$select testes.subir(%L)$$, testes.c_imagem('cA', 'k1', 'i1b', 'jpeg')), 'jpeg também');
select throws_ok(format($$select testes.subir(%L)$$, testes.c_imagem('cA', 'k1', 'i_x', 'svg')),
  '42501', null, 'imagem SVG não sobe (só png, jpg, gif e webp)');
select throws_ok(format($$select testes.subir(%L)$$, testes.c_anexo('cB', 'k1', 'a_x')),
  '42501', null, 'nem objeto na pasta de outro cliente com um cartão deste');
select throws_ok(format($$select testes.subir(%L)$$,
    testes.id('cA')::text || '/' || gen_random_uuid()::text || '/' || testes.id('a_x')::text || '-x.pdf'),
  '42501', null, 'nem na pasta de um cartão que não existe');
select throws_ok(format($$select testes.subir(%L)$$, testes.id('cA')::text || '/' || testes.id('k1')::text || '/solto.pdf'),
  '42501', null, 'nem com um caminho fora das duas formas (anexo e imagem)');
select throws_ok(format($$select testes.subir(%L)$$, testes.c_anexo('cB', 'kb', 'a_x')),
  '42501', null, 'nem no cartão de outra consultoria');
select throws_ok(format($$select testes.subir(%L)$$, testes.c_anexo('cArq', 'karq', 'a_x')),
  '42501', null, 'nem no cartão de cliente arquivado');
reset role;

select testes.como('central1');
select throws_ok(format($$select testes.subir(%L)$$, testes.c_anexo('cA', 'k1', 'a_x')),
  '42501', null, 'a central não sobe objeto (só lê)');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_a1'), testes.c_anexo('cA', 'k1', 'a_gestor'),
    testes.c_imagem('cA', 'k1', 'i1')]), 3::bigint,
  'a central vê os objetos dos cartões (baixa pelo link assinado)');
reset role;
select testes.como('a2');
select throws_ok(format($$select testes.subir(%L)$$, testes.c_anexo('cA', 'k1', 'a_x')),
  '42501', null, 'o colega não sobe objeto');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_a1'), testes.c_anexo('cA', 'k1', 'a_gestor'),
    testes.c_imagem('cA', 'k1', 'i1')]), 0::bigint, 'nem vê os objetos do cartão');
reset role;
select testes.como('gestor_b');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_a1'), testes.c_anexo('cA', 'k1', 'a_gestor'),
    testes.c_imagem('cA', 'k1', 'i1')]), 0::bigint, 'outra consultoria não vê os objetos (o link assinado precisa ver)');
reset role;
select testes.como('gestor_a');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_a1'), testes.c_anexo('cA', 'k1', 'a_gestor'),
    testes.c_imagem('cA', 'k1', 'i1')]), 3::bigint, 'o gestor vê os anexos e a imagem do cartão');
reset role;

-- Objeto de anexo que subiu sem linha (a gravação da linha falhou): só quem o enviou o enxerga e o tira.
select testes.como('a1');
select lives_ok(format($$select testes.subir(%L)$$, testes.c_anexo('cA', 'k1', 'a_solto')),
  'objeto de anexo sem linha (a linha não foi gravada)');
reset role;
select testes.como('gestor_a');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_solto')]), 0::bigint, 'objeto sem linha não aparece para os outros');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_solto')]), 0::bigint, 'nem é tirado por eles');
select throws_ok($$select testes.anexar('a_solto', 'cA', 'k1')$$, 'P0001', 'objeto_de_outra_pessoa',
  'nem ganha uma linha gravada por eles (a linha passaria a mostrá-lo)');
reset role;
select testes.como('a1');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_solto')]), 1::bigint, 'quem enviou vê o objeto sem linha');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_solto')]), 1::bigint, 'e o tira do Storage');
select is(testes.tirar(array[testes.c_imagem('cA', 'k1', 'i1')]), 0::bigint,
  'a imagem não sai do Storage enquanto o cartão existe (a descrição pode voltar a usá-la)');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_a1')]), 0::bigint,
  'o objeto do anexo não sai enquanto a linha existe, nem para quem enviou');
reset role;
select testes.como('central1');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_a1'), testes.c_imagem('cA', 'k1', 'i1')]), 0::bigint,
  'nem a central tira o que está em uso');
reset role;

-- ── Apagar anexo: quem enviou, ou a gestão ───────────────────────────────────

select testes.como('a1');
select is(testes.apagar_anexo('a_gestor'), 0::bigint, 'o consultor não apaga o anexo do gestor');
reset role;
select testes.como('a2');
select is(testes.apagar_anexo('a_a1'), 0::bigint, 'o colega não apaga anexo');
reset role;
select testes.como('gestor_b');
select is(testes.apagar_anexo('a_a1'), 0::bigint, 'outra consultoria não apaga anexo');
reset role;
select testes.como('central1');
select is(testes.apagar_anexo('a_a1'), 0::bigint, 'a central não apaga anexo (só lê)');
reset role;
select testes.como('gestor_a');
select is(testes.apagar_anexo('a_a1'), 1::bigint, 'a gestão apaga o anexo que o consultor enviou');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_a1')]), 1::bigint,
  'e depois tira o objeto do Storage, mesmo sem ter enviado (quem apagou a linha)');
reset role;
select testes.como('a1');
select lives_ok($$select testes.enviar('a_a1b', 'cA', 'k1')$$, 'o consultor anexa outro arquivo');
select is(testes.apagar_anexo('a_a1b'), 1::bigint, 'e apaga o próprio anexo');
reset role;
select testes.como('b1');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_a1b')]), 0::bigint,
  'quem não enviou nem apagou não tira o objeto que ficou sem linha');
reset role;
select testes.como('a1');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_a1b')]), 1::bigint, 'quem apagou tira');
reset role;
select ok(not has_table_privilege('authenticated', 'private.quadro_objetos_apagados', 'select'),
  'a lista de quem apagou o quê não é lida pela API');

-- ── Quantos anexos e a lista do cartão ───────────────────────────────────────

select testes.como('a1');
select is((select (i ->> 'anexos')::int
    from jsonb_array_elements(public.cartoes_do_quadro(testes.id('qA'), testes.id('afazer')) -> 'itens') i
    where i ->> 'id' = testes.id('k2')::text), 1,
  'a página da coluna traz quantos anexos cada cartão tem');
select is((public.cartao_do_quadro(testes.id('k1')) ->> 'anexos')::int, 1, 'o cartão sozinho também');
select is(public.anexos_do_cartao(testes.id('k1')) -> 'itens' -> 0 ->> 'nome', 'a_gestor.pdf',
  'a lista dos anexos do cartão traz o nome do arquivo');
select is(public.anexos_do_cartao(testes.id('k1')) -> 'itens' -> 0 -> 'enviado_por' ->> 'nome', 'Pessoa gestor_a',
  'e o nome de quem enviou (o consultor não lê o perfil do gestor)');
select is((public.anexos_do_cartao(testes.id('k1')) -> 'itens' -> 0 ->> 'pode_apagar')::boolean, false,
  'o consultor não pode apagar o anexo do gestor');
select lives_ok($$select testes.enviar('a_k3_' || n, 'cA', 'k3') from generate_series(1, 16) n$$,
  'o consultor anexa 16 arquivos a um cartão');
select is(public.anexos_do_cartao(testes.id('k3')) -> 'total', '16'::jsonb, 'o total vem do banco');
select is(jsonb_array_length(public.anexos_do_cartao(testes.id('k3')) -> 'itens'), 15, '15 por página');
select is(jsonb_array_length(public.anexos_do_cartao(testes.id('k3'), 2) -> 'itens'), 1, 'a página 2 traz o resto');
select ok((select bool_and((i ->> 'pode_apagar')::boolean)
    from jsonb_array_elements(public.anexos_do_cartao(testes.id('k3')) -> 'itens') i),
  'quem enviou pode apagar os próprios');
reset role;
select testes.como('gestor_a');
select is((public.anexos_do_cartao(testes.id('k1')) -> 'itens' -> 0 ->> 'pode_apagar')::boolean, true,
  'a gestão pode apagar qualquer anexo');
reset role;
select testes.como('central1');
select is((public.anexos_do_cartao(testes.id('k1')) -> 'itens' -> 0 ->> 'pode_apagar')::boolean, false,
  'a central vê a lista, sem apagar');
reset role;
select testes.como('a2');
select is(public.anexos_do_cartao(testes.id('k1')), null, 'quem não vê o cartão não recebe a lista');
reset role;
select testes.como('gestor_b');
select is(public.anexos_do_cartao(testes.id('k1')), null, 'nem outra consultoria');
select is(public.anexos_do_cartao(gen_random_uuid()), null, 'cartão que não existe: a mesma resposta');
reset role;

-- ── Apagar o cartão: a linha sai e o app tira os objetos dele ────────────────

select testes.como('a1');
select throws_ok(format($$select public.apagar_cartao(%L)$$, testes.id('k2')), 'P0001', 'sem_permissao',
  'o consultor não apaga o cartão que o gestor criou');
reset role;
select testes.como('a2');
select throws_ok(format($$select public.apagar_cartao(%L)$$, testes.id('k1')), 'P0001', 'sem_permissao',
  'o colega não apaga cartão');
select throws_ok(format($$select public.apagar_cartao(%L)$$, gen_random_uuid()), 'P0001', 'sem_permissao',
  'cartão que não existe: a mesma resposta');
reset role;
select testes.como('central1');
select throws_ok(format($$select public.apagar_cartao(%L)$$, testes.id('k1')), 'P0001', 'sem_permissao',
  'a central não apaga cartão');
reset role;
select testes.como('a1');
select is(testes.ordenado(public.apagar_cartao(testes.id('k1')) -> 'caminhos'),
  testes.ordem(array[testes.c_anexo('cA', 'k1', 'a_gestor'), testes.c_imagem('cA', 'k1', 'i1'),
    testes.c_imagem('cA', 'k1', 'i1b', 'jpeg')]),
  'quem criou apaga o cartão e recebe os caminhos dos anexos e das imagens dele, para tirar do Storage');
reset role;
select is((select count(*) from public.cartao_anexos where cartao_id = testes.id('k1')), 0::bigint,
  'as linhas dos anexos saem com o cartão');
select is((select count(*) from storage.objects
    where bucket_id = 'quadros' and name like testes.id('cA')::text || '/' || testes.id('k1')::text || '/%'), 3::bigint,
  'os objetos ficam no Storage até o app tirar (primeiro a linha, depois o objeto)');
select testes.como('gestor_a');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_gestor'), testes.c_imagem('cA', 'k1', 'i1'),
    testes.c_imagem('cA', 'k1', 'i1b', 'jpeg')]), 0::bigint,
  'quem não apagou não vê os objetos do cartão apagado (nem quem enviou o anexo)');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_gestor'), testes.c_imagem('cA', 'k1', 'i1'),
    testes.c_imagem('cA', 'k1', 'i1b', 'jpeg')]), 0::bigint, 'nem os tira');
reset role;
select testes.como('a1');
select is(testes.objetos(array[testes.c_anexo('cA', 'k1', 'a_gestor'), testes.c_imagem('cA', 'k1', 'i1'),
    testes.c_imagem('cA', 'k1', 'i1b', 'jpeg')]), 3::bigint, 'quem apagou o cartão vê o que sobrou dele');
select is(testes.tirar(array[testes.c_anexo('cA', 'k1', 'a_gestor'), testes.c_imagem('cA', 'k1', 'i1'),
    testes.c_imagem('cA', 'k1', 'i1b', 'jpeg')]), 3::bigint, 'e tira tudo do Storage, imagens também');
reset role;
select testes.como('gestor_a');
select is(jsonb_array_length(public.apagar_cartao(testes.id('k3')) -> 'caminhos'), 16,
  'a gestão apaga o cartão do consultor, com os 16 anexos');
select is(testes.tirar(array(select testes.c_anexo('cA', 'k3', 'a_k3_' || n) from generate_series(1, 16) n)), 16::bigint,
  'e tira os objetos');
reset role;

-- ── Apagar a coluna com os cartões junto ─────────────────────────────────────

select testes.como('a1');
select testes.nova_coluna('lixo', 'qA', 'Lixo');
select testes.novo_cartao('klixo', 'lixo');
select testes.enviar('a_lixo', 'cA', 'klixo');
select testes.subir(testes.c_imagem('cA', 'klixo', 'i_lixo'));
reset role;
select testes.como('gestor_a');
select is(testes.ordenado(public.apagar_coluna(testes.id('lixo'), null, true) -> 'caminhos'),
  testes.ordem(array[testes.c_anexo('cA', 'klixo', 'a_lixo'), testes.c_imagem('cA', 'klixo', 'i_lixo')]),
  'apagar a coluna com os cartões junto devolve os caminhos dos objetos deles');
select is(testes.tirar(array[testes.c_anexo('cA', 'klixo', 'a_lixo'), testes.c_imagem('cA', 'klixo', 'i_lixo')]), 2::bigint,
  'e quem apagou tira os objetos');
reset role;

-- ── Cliente apagado: o que sobrou na pasta dele ──────────────────────────────

select testes.como('a1');
select testes.enviar('a_del', 'cDel', 'kdel');
select testes.subir(testes.c_imagem('cDel', 'kdel', 'i_del'));
select is(jsonb_array_length(public.apagar_cartao(testes.id('kdel')) -> 'caminhos'), 2,
  'o consultor apaga o cartão (e tirar os objetos falha: eles ficam)');
select throws_ok(format($$select public.objetos_para_tirar_do_quadro(%L)$$, testes.id('cDel')), 'P0001', 'sem_permissao',
  'só a central procura o que sobrou na pasta do cliente (quem apagou o cartão, não)');
reset role;
select testes.como('central1');
select lives_ok(format($$delete from public.clientes where id = %L$$, testes.id('cDel')),
  'sem cartões, a central apaga o cliente (o quadro vazio sai junto)');
reset role;
-- Passado 1 dia, a lembrança de quem apagou não vale mais.
update private.quadro_objetos_apagados set apagado_em = now() - interval '2 days'
where caminho in (testes.c_anexo('cDel', 'kdel', 'a_del'), testes.c_imagem('cDel', 'kdel', 'i_del'));
select testes.como('a1');
select throws_ok(format($$select public.objetos_para_tirar_do_quadro(%L)$$, testes.id('cDel')), 'P0001', 'sem_permissao',
  'dias depois, quem apagou continua sem procurar');
select is(testes.tirar(array[testes.c_anexo('cDel', 'kdel', 'a_del'), testes.c_imagem('cDel', 'kdel', 'i_del')]), 0::bigint,
  'nem tira');
reset role;
select testes.como('central1');
select is(testes.ordenado(public.objetos_para_tirar_do_quadro(testes.id('cDel'))),
  testes.ordem(array[testes.c_anexo('cDel', 'kdel', 'a_del'), testes.c_imagem('cDel', 'kdel', 'i_del')]),
  'a central acha o que sobrou do cliente apagado');
select is(testes.tirar(array[testes.c_anexo('cDel', 'kdel', 'a_del'), testes.c_imagem('cDel', 'kdel', 'i_del')]), 2::bigint,
  'e tira');
select is(public.objetos_para_tirar_do_quadro(testes.id('cA')), '[]'::jsonb,
  'no cliente que existe, nada em uso aparece para tirar (nem para a central)');
reset role;

-- ── A descrição: só o JSON do editor, link seguro e imagem deste cartão ──────

select testes.como('a1');
select lives_ok(format($$select testes.subir(%L)$$, testes.c_imagem('cA', 'k4', 'i_k4')), 'o consultor sobe a imagem do cartão');
select is(testes.descrever('k4', replace($j${"type": "doc", "content": [
    {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Plano"}]},
    {"type": "paragraph", "content": [
      {"type": "text", "marks": [{"type": "bold"}, {"type": "italic"}], "text": "Negrito e itálico"},
      {"type": "hardBreak"},
      {"type": "text", "marks": [{"type": "underline"}, {"type": "strike"}, {"type": "code"}], "text": "x"},
      {"type": "text", "text": "site", "marks": [{"type": "link", "attrs": {"href": "https://cliente.test/a?b=1",
        "target": "_blank", "rel": "noopener noreferrer nofollow", "class": null}}]}]},
    {"type": "bulletList", "content": [{"type": "listItem", "content": [{"type": "paragraph", "content": [
      {"type": "text", "text": "um"}]}]}]},
    {"type": "orderedList", "attrs": {"start": 1, "type": null}, "content": [{"type": "listItem", "content": [
      {"type": "paragraph"}]}]},
    {"type": "blockquote", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "citação"}]}]},
    {"type": "codeBlock", "attrs": {"language": null}, "content": [{"type": "text", "text": "select 1"}]},
    {"type": "horizontalRule"},
    {"type": "image", "attrs": {"src": "IMAGEM", "alt": "print", "title": null}}]}$j$,
    'IMAGEM', testes.c_imagem('cA', 'k4', 'i_k4'))::jsonb), 1::bigint,
  'a descrição aceita o que o editor produz: títulos, marcas, listas, citação, código, link e a imagem deste cartão');
select is(testes.descrever('k4', testes.doc_link('mailto:contato@cliente.test')), 1::bigint, 'link mailto:');
select is(testes.descrever('k4', testes.doc_link('HTTP://cliente.test')), 1::bigint, 'link http (com maiúsculas também)');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_link('javascript:alert(1)')),
  '23514', 'link_invalido', 'link javascript: é recusado');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_link(' https://cliente.test')),
  '23514', 'link_invalido', 'nem com espaço antes do esquema');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_link('data:text/html,<script>alert(1)</script>')),
  '23514', 'link_invalido', 'nem data:');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_link('/caminho/relativo')),
  '23514', 'link_invalido', 'nem endereço sem esquema');
select throws_ok(format($$select testes.descrever('k4', %L)$$,
    '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x", "marks": [{"type": "link"}]}]}]}'),
  '23514', 'link_invalido', 'nem link sem endereço');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_imagem('https://cliente.test/x.png')),
  '23514', 'imagem_invalida', 'imagem de outro endereço é recusada');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_imagem('data:image/png;base64,iVBORw0KGgo=')),
  '23514', 'imagem_invalida', 'nem imagem embutida (data:)');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_imagem(testes.c_imagem('cA', 'k2', 'i_k2'))),
  '23514', 'imagem_invalida', 'nem a imagem de outro cartão');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_imagem(testes.c_imagem('cB', 'k4', 'i_k4'))),
  '23514', 'imagem_invalida', 'nem com a pasta de outro cliente');
select throws_ok(format($$select testes.descrever('k4', %L)$$, testes.doc_imagem(testes.c_imagem('cA', 'k4', 'i_k4', 'svg'))),
  '23514', 'imagem_invalida', 'nem SVG');
select throws_ok(format($$select testes.descrever('k4', %L)$$, '{"type": "doc", "content": [{"type": "image"}]}'),
  '23514', 'imagem_invalida', 'nem imagem sem src');
select throws_ok(format($$select testes.descrever('k4', %L)$$,
    '{"type": "doc", "content": [{"type": "iframe", "attrs": {"src": "https://cliente.test"}}]}'),
  '23514', 'descricao_invalida', 'nó que o editor não tem é recusado');
select throws_ok(format($$select testes.descrever('k4', %L)$$,
    '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "x", "marks": [{"type": "textStyle", "attrs": {"color": "red"}}]}]}]}'),
  '23514', 'descricao_invalida', 'marca que o editor não tem também');
select throws_ok(format($$select testes.descrever('k4', %L)$$, '{"type": "paragraph", "content": []}'),
  '23514', 'descricao_invalida', 'o documento começa em doc');
select throws_ok(format($$select testes.descrever('k4', %L)$$, '{"type": "doc", "content": {"type": "paragraph"}}'),
  '23514', 'descricao_invalida', 'content é uma lista');
select throws_ok(format($$select testes.descrever('k4', %L)$$, '{"type": "doc", "content": ["<script>alert(1)</script>"]}'),
  '23514', 'descricao_invalida', 'texto solto no lugar de um nó é recusado');
select throws_ok(format($$select testes.descrever('k4', %L)$$, '{"type": "doc", "content": [{"type": "doc", "content": []}]}'),
  '23514', 'descricao_invalida', 'doc só na raiz');
select is(testes.descrever('k4', null), 1::bigint, 'limpar a descrição (nulo) pode');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo, descricao) values (%L, 'Com imagem', %L)$$,
    testes.id('afazer'), testes.doc_imagem(testes.c_imagem('cA', 'k4', 'i_k4'))),
  '23514', 'imagem_invalida', 'cartão novo não nasce com imagem (ela sobe depois que o cartão existe, na pasta dele)');
reset role;
select testes.sistema();
select throws_ok(format($$update public.cartoes set descricao = %L where id = %L$$,
    testes.doc_link('javascript:alert(1)'), testes.id('kb')),
  '23514', 'link_invalido', 'a regra vale também para o que não vem da API');

-- ── Sem oráculo: quem não mexe no quadro recebe 42501 antes de tudo ──────────
-- O quadro de cCheio tem 50 colunas e kcheio tem 200 itens: sem a conferência no começo dos gatilhos, quem é de fora
-- receberia colunas_demais, checklist_cheio, responsavel_invalido ou coluna_invalida (e ficaria sabendo que o quadro, o
-- cartão ou a coluna existem, e quem atende o cliente), e travaria linhas de um quadro alheio.

select testes.como('gestor_b');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, 'X')$$, testes.id('cheio_afazer')),
  '42501', 'sem_permissao', 'quem não mexe no quadro não cria cartão na coluna dele');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, 'X')$$, gen_random_uuid()),
  '42501', 'sem_permissao', 'e recebe a mesma resposta para uma coluna que não existe');
select throws_ok(format($$insert into public.quadro_colunas (quadro_id, nome) values (%L, 'X')$$, testes.id('qCheio')),
  '42501', 'sem_permissao', 'coluna em quadro alheio no limite: sem_permissao, não colunas_demais');
select throws_ok(format($$insert into public.quadro_colunas (quadro_id, nome) values (%L, 'X')$$, gen_random_uuid()),
  '42501', 'sem_permissao', 'quadro que não existe: a mesma resposta');
select throws_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, 'X')$$, testes.id('kcheio')),
  '42501', 'sem_permissao', 'item em cartão alheio com 200 itens: sem_permissao, não checklist_cheio');
select throws_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, 'X')$$, gen_random_uuid()),
  '42501', 'sem_permissao', 'cartão que não existe: a mesma resposta');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
    testes.id('kcheio'), testes.id('b1')),
  '42501', 'sem_permissao', 'responsável que não atende o cliente, em cartão alheio: sem_permissao, não responsavel_invalido');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
    testes.id('kcheio'), testes.id('a1')),
  '42501', 'sem_permissao', 'com quem atende o cliente: a mesma resposta (não revela quem é o consultor)');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
    gen_random_uuid(), testes.id('a1')),
  '42501', 'sem_permissao', 'cartão que não existe: a mesma resposta');
select throws_ok(format($$insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho) values (%L, %L, 'x.pdf', 10)$$,
    testes.id('kcheio'), testes.c_anexo('cCheio', 'kcheio', 'a_cheio')),
  '42501', 'sem_permissao', 'anexo em cartão alheio');
select throws_ok(format($$insert into public.cartao_anexos (cartao_id, caminho, nome, tamanho) values (%L, %L, 'x.pdf', 10)$$,
    gen_random_uuid(), testes.c_anexo('cCheio', 'kcheio', 'a_cheio')),
  '42501', 'sem_permissao', 'anexo em cartão que não existe: a mesma resposta');
reset role;
select testes.como('a2');
select throws_ok(format($$insert into public.cartoes (coluna_id, titulo) values (%L, 'X')$$, testes.id('cheio_afazer')),
  '42501', 'sem_permissao', 'o colega da mesma consultoria que não atende o cliente também');
select throws_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, 'X')$$, testes.id('kcheio')),
  '42501', 'sem_permissao', 'também no checklist');
reset role;
select testes.como('a1');
select throws_ok(format($$insert into public.quadro_colunas (quadro_id, nome) values (%L, 'X')$$, testes.id('qCheio')),
  'P0001', 'colunas_demais', 'quem mexe no quadro continua recebendo o limite de colunas');
select throws_ok(format($$insert into public.cartao_checklist (cartao_id, texto) values (%L, 'X')$$, testes.id('kcheio')),
  'P0001', 'checklist_cheio', 'e o do checklist');
select throws_ok(format($$insert into public.cartao_responsaveis (cartao_id, perfil_id) values (%L, %L)$$,
    testes.id('kcheio'), testes.id('b1')),
  'P0001', 'responsavel_invalido', 'e o do responsável');
reset role;

-- ── Permissões e estrutura ───────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.anexos_do_cartao(uuid, int)', 'execute'), 'sem login não se lista anexo');
select ok(not has_function_privilege('anon', 'public.apagar_cartao(uuid)', 'execute'), 'nem se apaga cartão pela função');
select ok(not has_function_privilege('anon', 'public.objetos_para_tirar_do_quadro(uuid)', 'execute'),
  'nem se procura o que tirar do Storage');
select ok(has_function_privilege('authenticated', 'public.apagar_cartao(uuid)', 'execute'),
  'quem entrou chama apagar_cartao (a função confere quem pode)');
select ok(not has_function_privilege('anon', 'public.cartoes_do_quadro(uuid, uuid, int, text, text, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.cartoes_do_quadro(uuid, uuid, int, text, text, text, text)', 'execute'),
  'cartoes_do_quadro continua com as mesmas permissões');
select is((select count(*) from pg_proc where proname = 'cartoes_do_quadro' and pronamespace = 'public'::regnamespace),
  1::bigint, 'e com uma versão só');
select ok((select prosecdef and proconfig @> array['search_path=""', 'plan_cache_mode=force_custom_plan']
    from pg_proc where proname = 'cartoes_do_quadro' and pronamespace = 'public'::regnamespace),
  'security definer, search_path vazio e plano por chamada, como antes');
select has_index('public', 'cartao_anexos', 'cartao_anexos_cartao_idx', 'anexos do cartão por data de envio');
select is((select confdeltype from pg_constraint
    where conrelid = 'public.cartao_anexos'::regclass and contype = 'f' and confrelid = 'public.cartoes'::regclass),
  'c'::"char", 'os anexos saem com o cartão (on delete cascade)');

select * from finish();
rollback;
