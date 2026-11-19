-- Tirar ou trocar um check-list que ninguém tocou apaga em vez de encerrar (usabilidade, U6; pedido do Diego, 18/11):
-- "tocado" é ter alguma tarefa fora de "a fazer", nota, trecho de tempo, comentário, linha em check-in ou linha de tarefa
-- no Histórico. O apagado some de vez (o cliente volta a poder ser apagado); o Histórico guarda as linhas do modelo, com o
-- nome, só para a Central e para a consultoria do check-list. O tocado continua encerrando e virando histórico. E o
-- relógio da tarefa: o trecho fecha em greatest(now(), inicio) (duas chamadas quase juntas não dão fim antes do início).
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select, insert on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria Intocado ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@intocado.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@intocado.test', p_papel);
  return v;
end $$;

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

-- Chama como a pessoa: o resultado em JSON, ou { erro: "<código> <mensagem>" } (o erro desfaz só esta chamada).
create function testes.chamar(p_quem text, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform testes.como(p_quem);
  begin
    execute 'select to_jsonb((' || p_sql || '))' into v;
  exception when others then
    v := jsonb_build_object('erro', sqlstate || ' ' || sqlerrm);
  end;
  reset role;
  perform testes.sistema();
  return v;
end $$;

-- O texto devolvido, 'ok' (nada devolvido) ou o erro.
create function testes.fazer(p_quem text, p_sql text) returns text language plpgsql as $$
declare v jsonb := testes.chamar(p_quem, p_sql);
begin
  return case when jsonb_typeof(v) = 'object' and v ? 'erro' then v ->> 'erro'
    when jsonb_typeof(v) = 'string' and v #>> '{}' <> '' then v #>> '{}' else 'ok' end;
end $$;

-- Aplica como a gestão e guarda o id do check-list com a chave.
create function testes.aplicar(p_cliente text, p_modelo text, p_chave text) returns void language plpgsql as $$
declare v jsonb;
begin
  v := testes.chamar('gestor_a', format('public.aplicar_modelo(%L::uuid, %L::uuid, %L::date)', testes.id(p_cliente),
    testes.id(p_modelo), current_date));
  if jsonb_typeof(v) <> 'string' then
    raise exception 'cenário: %', v;
  end if;
  insert into testes.fx values (p_chave, (v #>> '{}')::uuid);
end $$;

create function testes.tarefa(p_checklist text, p_titulo text) returns uuid language sql stable as $$
  select id from public.checklist_tarefas where checklist_id = testes.id(p_checklist) and titulo = p_titulo
$$;

-- Marca como o consultor do cliente; pára o teste se não der certo.
create function testes.marcar(p_checklist text, p_titulo text, p_estado text, p_motivo text default null)
returns void language plpgsql as $$
declare v jsonb := testes.chamar('pessoa_a', format('public.marcar_tarefa(%L::uuid, %L, %L)',
  testes.tarefa(p_checklist, p_titulo), p_estado, p_motivo));
begin
  if v ? 'erro' then
    raise exception 'cenário: %', v;
  end if;
end $$;

create function testes.exigir(p_resultado text) returns void language plpgsql as $$
begin
  if p_resultado is distinct from 'ok' then
    raise exception 'cenário: %', p_resultado;
  end if;
end $$;

-- As linhas de modelo do Histórico, como a pessoa vê: "tipo: modelo" (— sem o nome), em ordem.
create function testes.historico(p_quem text, p_cliente text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform testes.como(p_quem);
  select coalesce(array_agg(h.tipo || ': ' || coalesce(h.modelo, '—')
    order by h.tipo || ': ' || coalesce(h.modelo, '—') collate "C"), '{}')
  into v
  from public.historico_do_cliente(testes.id(p_cliente), 50) h
  where h.tipo like 'modelo\_%';
  reset role;
  perform testes.sistema();
  return v;
end $$;

create function testes.dados(p_nome text) returns jsonb language sql as $$
  select jsonb_build_object('nome', p_nome, 'descricao', 'Descrição de ' || p_nome, 'tipo', null, 'para', 'todas',
    'etapas', jsonb_build_array(
      jsonb_build_object('nome', 'Diagnóstico', 'tarefas', jsonb_build_array(
        jsonb_build_object('chave', 't1', 'titulo', 'Análise do DRE', 'obrigatoria', true, 'prazo_dias', 5,
          'depende_de', '[]'::jsonb),
        jsonb_build_object('chave', 't2', 'titulo', 'Mapa de custos', 'obrigatoria', false, 'prazo_dias', 10,
          'depende_de', jsonb_build_array('t1'))))))
$$;

create function testes.modelo(p_chave text, p_nome text) returns void language plpgsql as $$
begin
  perform testes.como('central1');
  insert into testes.fx values (p_chave, public.salvar_modelo(null, testes.dados(p_nome)));
  reset role;
  perform testes.sistema();
end $$;

-- ── Cenário ──────────────────────────────────────────────────────────────────

select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.modelo('m1', 'Zqt Primeiro');
select testes.modelo('m2', 'Zqt Segundo');

-- Um cliente por jeito de tocar o check-list (e os intocados). Todos com o consultor pessoa_a, na A.
select testes.cliente(c, 'A', 'pessoa_a') from unnest(array['c_limpo', 'c_movido', 'c_feita', 'c_trecho', 'c_comentario',
  'c_nota', 'c_checkin', 'c_reaberta', 'c_troca_limpo', 'c_troca_feita', 'c_relogio']) c;
select testes.aplicar(c, 'm1', 'cl_' || substr(c, 3)) from unnest(array['c_limpo', 'c_movido', 'c_feita', 'c_trecho',
  'c_comentario', 'c_nota', 'c_checkin', 'c_reaberta', 'c_troca_limpo', 'c_troca_feita', 'c_relogio']) c;

-- feita: uma tarefa feita.
select testes.marcar('cl_feita', 'Análise do DRE', 'feita');
-- trecho: iniciou e voltou para a fazer (todas a fazer, mas o relógio andou).
select testes.marcar('cl_trecho', 'Análise do DRE', 'andamento');
select testes.marcar('cl_trecho', 'Análise do DRE', 'a_fazer');
-- comentário da gestão (todas a fazer).
select testes.exigir(testes.fazer('gestor_a', format($$public.comentar_tarefa(%L, 'Começar pela DRE')$$,
  testes.tarefa('cl_comentario', 'Análise do DRE'))));
-- nota do consultor (todas a fazer).
select testes.exigir(testes.fazer('pessoa_a', format($$public.anotar_tarefa(%L, 'Pedir a DRE')$$,
  testes.tarefa('cl_nota', 'Análise do DRE'))));
-- check-in: feita com o check-in aberto, check-out, e reaberta depois (fica a linha no check-in fechado).
insert into testes.fx values ('k1', gen_random_uuid());
select testes.como('pessoa_a');
insert into public.checkins (id, cliente_id, inicio) values (testes.id('k1'), testes.id('c_checkin'), now() - interval '2 hours');
reset role;
select testes.sistema();
select testes.marcar('cl_checkin', 'Análise do DRE', 'feita');
select testes.como('pessoa_a');
update public.checkins set fim = now() - interval '1 hour', descricao = 'Atendimento do teste' where id = testes.id('k1');
reset role;
select testes.sistema();
select testes.marcar('cl_checkin', 'Análise do DRE', 'a_fazer');
-- reaberta: "não se aplica" e reaberta (todas a fazer, mas o Histórico tem as linhas da tarefa).
select testes.marcar('cl_reaberta', 'Análise do DRE', 'nao_se_aplica', 'Já tem DRE');
select testes.marcar('cl_reaberta', 'Análise do DRE', 'a_fazer');
-- troca_feita: uma tarefa feita antes da troca.
select testes.marcar('cl_troca_feita', 'Análise do DRE', 'feita');

-- ── Acesso ───────────────────────────────────────────────────────────────────

select ok(has_function_privilege('authenticated', 'public.tirar_modelo(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.tirar_modelo(uuid)', 'execute'),
  'tirar_modelo: authenticated executa, anon não');
select is((select (p.prosecdef, p.proconfig @> array['search_path=""'], p.prorettype::regtype::text)::text
    from pg_proc p where p.oid = 'public.tirar_modelo(uuid)'::regprocedure),
  (true, true, 'text')::text, 'tirar_modelo: security definer, search_path vazio, devolve o que aconteceu');
select ok(not has_function_privilege('authenticated', 'private.checklist_intocado(uuid)', 'execute')
    and not has_function_privilege('anon', 'private.checklist_intocado(uuid)', 'execute'),
  'checklist_intocado é só das funções do banco');

-- ── O que a tela lê ──────────────────────────────────────────────────────────

select is((select jsonb_object_agg(substr(c, 3), testes.chamar('gestor_a', format('public.checklist_do_cliente(%L::uuid)',
    testes.id(c))) #> '{checklist,intocado}') from unnest(array['c_limpo', 'c_feita', 'c_trecho', 'c_comentario', 'c_nota',
    'c_checkin', 'c_reaberta']) c),
  jsonb_build_object('limpo', true, 'feita', false, 'trecho', false, 'comentario', false, 'nota', false, 'checkin', false,
    'reaberta', false),
  'checklist_do_cliente diz se o check-list está intocado (tarefa, trecho, comentário, nota, check-in, Histórico)');
select is(testes.chamar('pessoa_a', format('public.checklist_do_cliente(%L::uuid)', testes.id('c_limpo')))
    #> '{checklist,intocado}', 'true'::jsonb, 'o consultor lê o mesmo');

-- ── Tirar ────────────────────────────────────────────────────────────────────

select is(testes.fazer('pessoa_a', format('public.tirar_modelo(%L)', testes.id('cl_limpo'))), 'P0001 sem_permissao',
  'o consultor não tira o modelo');
select is(testes.fazer('gestor_b', format('public.tirar_modelo(%L)', testes.id('cl_limpo'))), 'P0001 sem_permissao',
  'outra consultoria não');
select is(testes.fazer('gestor_a', format('public.tirar_modelo(%L)', testes.id('cl_limpo'))), 'apagado',
  'intocado: tirar apaga e diz "apagado"');
select is((select count(*)::int from public.cliente_checklists where id = testes.id('cl_limpo'))
    + (select count(*)::int from public.checklist_tarefas where checklist_id = testes.id('cl_limpo'))
    + (select count(*)::int from public.checklist_etapas where checklist_id = testes.id('cl_limpo')), 0,
  'o check-list, as etapas e as tarefas somem');
select is(testes.chamar('gestor_a', format('public.checklist_do_cliente(%L::uuid)', testes.id('c_limpo'))) -> 'checklist',
  'null'::jsonb, 'o cliente fica sem check-list');
select is(testes.historico('gestor_a', 'c_limpo'), array['modelo_aplicado: Zqt Primeiro', 'modelo_tirado: Zqt Primeiro'],
  'o Histórico guarda "aplicado" e "tirado", com o nome do modelo, para a consultoria');
select is(testes.historico('pessoa_a', 'c_limpo'), array['modelo_aplicado: Zqt Primeiro', 'modelo_tirado: Zqt Primeiro'],
  'e para o consultor dela');
select is(testes.historico('central1', 'c_limpo'), array['modelo_aplicado: Zqt Primeiro', 'modelo_tirado: Zqt Primeiro'],
  'e para a Central');
select is(testes.fazer('gestor_a', format('public.tirar_modelo(%L)', testes.id('cl_limpo'))), 'P0001 sem_permissao',
  'tirar de novo (a tela velha): sem_permissao, e a tela relê');
select testes.como('central1');
select lives_ok(format('delete from public.clientes where id = %L', testes.id('c_limpo')),
  'sem o check-list, a Central apaga o cliente');
reset role;
select testes.sistema();
select is((select count(*)::int from public.clientes where id = testes.id('c_limpo')), 0, 'e ele some');

-- O nome do modelo apagado segue a regra de sempre: a Central e a consultoria do check-list. (Aqui todos os eventos têm a
-- hora da transação, então a B enxerga as linhas de quando o cliente estava na A.)
select is(testes.fazer('gestor_a', format('public.tirar_modelo(%L)', testes.id('cl_movido'))), 'apagado', 'outro intocado');
select testes.como('central1');
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('c_movido');
reset role;
select testes.sistema();
select is(testes.historico('gestor_b', 'c_movido'), array['modelo_aplicado: —', 'modelo_tirado: —'],
  'o nome do modelo apagado não aparece para outra consultoria');
select is(testes.historico('central1', 'c_movido'), array['modelo_aplicado: Zqt Primeiro', 'modelo_tirado: Zqt Primeiro'],
  'a Central continua vendo');

-- Tocado: continua encerrando e virando histórico (e segurando o cliente).
select is((select jsonb_object_agg(substr(c, 4), testes.fazer('gestor_a', format('public.tirar_modelo(%L)', testes.id(c)))
    order by c)
    from unnest(array['cl_feita', 'cl_trecho', 'cl_comentario', 'cl_nota', 'cl_checkin', 'cl_reaberta']) c),
  jsonb_build_object('feita', 'encerrado', 'trecho', 'encerrado', 'comentario', 'encerrado', 'nota', 'encerrado',
    'checkin', 'encerrado', 'reaberta', 'encerrado'),
  'tocado (de qualquer jeito): tirar encerra e diz "encerrado"');
select is((select array_agg(distinct motivo) from public.cliente_checklists
    where id in (select testes.id(c) from unnest(array['cl_feita', 'cl_trecho', 'cl_comentario', 'cl_nota', 'cl_checkin',
      'cl_reaberta']) c) and encerrado_por = testes.id('gestor_a')),
  array['tirado'], 'os tocados ficam encerrados como "tirado", com quem tirou');
select is(testes.historico('gestor_a', 'c_feita'), array['modelo_aplicado: Zqt Primeiro', 'modelo_tirado: Zqt Primeiro'],
  'o Histórico do tocado é o de sempre');
select testes.como('central1');
select throws_ok(format('delete from public.clientes where id = %L', testes.id('c_nota')), '23503', null,
  'cliente com check-list tocado continua sem poder ser apagado (arquiva-se)');
reset role;
select testes.sistema();

-- ── Trocar ───────────────────────────────────────────────────────────────────

select testes.aplicar('c_troca_limpo', 'm2', 'cl_troca_limpo_2');
select is((select array_agg(id) from public.cliente_checklists where cliente_id = testes.id('c_troca_limpo')),
  array[testes.id('cl_troca_limpo_2')], 'trocar um intocado apaga o antigo: fica só o novo');
select is(testes.historico('gestor_a', 'c_troca_limpo'), array['modelo_aplicado: Zqt Primeiro', 'modelo_trocado: Zqt Segundo'],
  'o Histórico guarda "aplicado" (com o nome do apagado) e "trocado"');
select testes.aplicar('c_troca_feita', 'm2', 'cl_troca_feita_2');
select is((select array_agg(coalesce(motivo, 'ativo') order by aplicado_em, motivo nulls last)
    from public.cliente_checklists where cliente_id = testes.id('c_troca_feita')),
  array['trocado', 'ativo'], 'trocar um tocado encerra o antigo como "trocado", como antes');

-- ── O relógio da tarefa ──────────────────────────────────────────────────────
-- Duas chamadas quase juntas (duas abas): a que começou antes grava depois e fecha o trecho que a outra abriu com início
-- "no futuro" dela. O trecho fecha no início (duração 0), sem recusar (fim < inicio quebrava a regra da coluna).

select testes.marcar('cl_relogio', 'Análise do DRE', 'andamento');
update public.checklist_tarefa_tempos set inicio = now() + interval '2 seconds'
where tarefa_id = testes.tarefa('cl_relogio', 'Análise do DRE') and fim is null;
select is(testes.chamar('pessoa_a', format($$public.marcar_tarefa(%L, 'pausada')$$,
    testes.tarefa('cl_relogio', 'Análise do DRE'))) ->> 'estado', 'pausada', 'pausar fecha o trecho sem erro');
select is((select fim = inicio from public.checklist_tarefa_tempos where tarefa_id = testes.tarefa('cl_relogio', 'Análise do DRE')),
  true, 'o trecho que começou "depois" fecha no próprio início');

select * from finish();
rollback;
