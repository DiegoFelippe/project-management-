-- Check-list do cliente (desenho em docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md, "Quem faz o quê",
-- "Aplicar = copiar", "Marcar", "Quando alguém sai" e "O que muda no check-in de hoje"; plano em
-- docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 2): aplicar copia o modelo (e editar, arquivar ou apagar
-- o modelo depois não muda a cópia); trocar e tirar guardam o antigo; só o consultor do cliente marca; bloqueada até as
-- dependências; o que ele marca com o check-in aberto neste cliente entra no check-in; quem vê o quê; cliente movido,
-- arquivado ou com outro consultor; o Histórico com o nome do modelo só para quem pode; cliente com check-list não se
-- apaga; modelo em uso não se apaga; "clientes usando" nas listas e números dos modelos. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(406);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select, insert on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

-- "Hoje" em São Paulo, como o banco conta os prazos.
create function testes.hoje() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria Check-list ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@checklists.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@checklists.test', p_papel);
  return v;
end $$;

-- testes.como deixa o usuário nas configurações até o fim da transação (reset role não limpa): limpa aqui.
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

-- Cliente gravado direto (sem usuário logado), já na consultoria e com o consultor, se vierem.
create function testes.cliente(p_nome text, p_consultoria text, p_consultor text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform testes.sistema();
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id)
  values ('Cliente ' || p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor)) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Chama como a pessoa e volta a ser o dono do banco: o resultado em JSON, ou { erro: "<código> <mensagem>" }. O erro
-- desfaz só esta chamada, como uma chamada da API.
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

-- O mesmo, para o que não devolve nada: 'ok' ou o erro.
create function testes.fazer(p_quem text, p_sql text) returns text language plpgsql as $$
declare v jsonb := testes.chamar(p_quem, p_sql);
begin
  return case when jsonb_typeof(v) = 'object' and v ? 'erro' then v ->> 'erro' else 'ok' end;
end $$;

-- Aplica como a pessoa: 'ok' (e guarda o id do check-list com a chave) ou o erro.
create function testes.aplicar(p_quem text, p_cliente uuid, p_modelo uuid, p_inicio date, p_chave text default null)
returns text language plpgsql as $$
declare v jsonb;
begin
  v := testes.chamar(p_quem, format('public.aplicar_modelo(%L::uuid, %L::uuid, %L::date)', p_cliente, p_modelo, p_inicio));
  if jsonb_typeof(v) = 'string' then
    if p_chave is not null then
      insert into testes.fx values (p_chave, (v #>> '{}')::uuid);
    end if;
    return 'ok';
  end if;
  return v ->> 'erro';
end $$;

create function testes.marcar(p_quem text, p_tarefa uuid, p_estado text) returns jsonb language sql as $$
  select testes.chamar(p_quem, format('public.marcar_tarefa(%L::uuid, %L)', p_tarefa, p_estado))
$$;

-- Marca "não se aplica" como a pessoa, com o motivo.
create function testes.nsa(p_quem text, p_tarefa uuid, p_motivo text) returns jsonb language sql as $$
  select testes.chamar(p_quem, format('public.marcar_tarefa(%L::uuid, %L, %L)', p_tarefa, 'nao_se_aplica', p_motivo))
$$;

create function testes.ler(p_quem text, p_cliente text) returns jsonb language sql as $$
  select testes.chamar(p_quem, format('public.checklist_do_cliente(%L::uuid)', testes.id(p_cliente)))
$$;

-- O check-list ativo do cliente e uma tarefa dele (pelo título), lidos como o dono do banco.
create function testes.ativo(p_cliente text) returns uuid language sql stable as $$
  select id from public.cliente_checklists where cliente_id = testes.id(p_cliente) and encerrado_em is null
$$;

create function testes.tarefa(p_checklist uuid, p_titulo text) returns uuid language sql stable as $$
  select id from public.checklist_tarefas where checklist_id = p_checklist and titulo = p_titulo
$$;

-- Cria o modelo como a pessoa e guarda o id com a chave.
create function testes.criar(p_quem text, p_chave text, p_dados jsonb) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform testes.como(p_quem);
  v := public.salvar_modelo(null, p_dados);
  reset role;
  perform testes.sistema();
  insert into testes.fx values (p_chave, v);
  return v;
end $$;

-- O modelo padrão: "Diagnóstico" (Análise do DRE, dia 5, obrigatória; Mapa de custos, dia 10, opcional, depende da
-- Análise) e "Plano" (Plano de ação, dia 20, obrigatória, depende das duas).
create function testes.dados(p_nome text, p_para text default 'todas', p_tipo text default null) returns jsonb
language sql as $$
  select jsonb_build_object('nome', p_nome, 'descricao', 'Descrição de ' || p_nome, 'tipo', p_tipo, 'para', p_para,
    'etapas', jsonb_build_array(
      jsonb_build_object('nome', 'Diagnóstico', 'tarefas', jsonb_build_array(
        jsonb_build_object('chave', 't1', 'titulo', 'Análise do DRE', 'descricao', 'Ler o DRE', 'obrigatoria', true,
          'prazo_dias', 5, 'depende_de', '[]'::jsonb),
        jsonb_build_object('chave', 't2', 'titulo', 'Mapa de custos', 'obrigatoria', false, 'prazo_dias', 10,
          'depende_de', jsonb_build_array('t1')))),
      jsonb_build_object('nome', 'Plano', 'tarefas', jsonb_build_array(
        jsonb_build_object('chave', 't3', 'titulo', 'Plano de ação', 'obrigatoria', true, 'prazo_dias', 20,
          'depende_de', jsonb_build_array('t1', 't2'))))))
$$;

-- O check-list inteiro, lido direto das tabelas (como o dono do banco), para comparar antes e depois. O modelo_id fica
-- de fora (vira nulo quando o modelo é apagado).
create function testes.retrato(p_checklist uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'checklist', to_jsonb(cl) - 'modelo_id',
    'etapas', (select jsonb_agg(to_jsonb(e) order by e.posicao) from public.checklist_etapas e where e.checklist_id = cl.id),
    'tarefas', (select jsonb_agg(to_jsonb(t) order by t.posicao) from public.checklist_tarefas t where t.checklist_id = cl.id),
    'dependencias', (select jsonb_agg(to_jsonb(d) order by d.tarefa_id, d.depende_de)
      from public.checklist_dependencias d where d.checklist_id = cl.id))
  from public.cliente_checklists cl where cl.id = p_checklist
$$;

-- As tarefas do check-list em ordem: "etapa.posição: título (prazo, obrigatória, dias do início ao vencimento, estado)".
create function testes.tarefas(p_checklist uuid) returns text[] language sql stable as $$
  select array_agg(e.posicao || '.' || t.posicao || ': ' || t.titulo || ' (' || t.prazo_dias || ', '
    || case when t.obrigatoria then 'obrig' else 'opc' end || ', ' || (t.vence_em - cl.inicio) || ', ' || t.estado || ')'
    order by t.posicao)
  from public.checklist_tarefas t
  join public.checklist_etapas e on e.id = t.etapa_id
  join public.cliente_checklists cl on cl.id = t.checklist_id
  where t.checklist_id = p_checklist
$$;

-- As dependências do check-list: "título -> título de que depende", em ordem.
create function testes.dependencias(p_checklist uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(t.titulo || ' -> ' || d2.titulo order by t.posicao, d2.posicao), '{}')
  from public.checklist_dependencias d
  join public.checklist_tarefas t on t.id = d.tarefa_id
  join public.checklist_tarefas d2 on d2.id = d.depende_de
  where t.checklist_id = p_checklist
$$;

-- Os contadores gravados no check-list.
create function testes.contadores(p_checklist uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('tarefas', tarefas, 'feitas', feitas, 'obrigatorias', obrigatorias,
    'obrigatorias_feitas', obrigatorias_feitas, 'proximo_vencimento', proximo_vencimento)
  from public.cliente_checklists where id = p_checklist
$$;

-- Check-in como a pessoa (aberto quando p_fim é nulo).
create function testes.checkin(p_quem text, p_chave text, p_cliente text, p_inicio timestamptz) returns void
language plpgsql as $$
begin
  insert into testes.fx values (p_chave, gen_random_uuid());
  perform testes.como(p_quem);
  insert into public.checkins (id, cliente_id, inicio) values (testes.id(p_chave), testes.id(p_cliente), p_inicio);
  reset role;
  perform testes.sistema();
end $$;

create function testes.checkout(p_quem text, p_chave text, p_fim timestamptz) returns void language plpgsql as $$
begin
  perform testes.como(p_quem);
  update public.checkins set fim = p_fim, descricao = 'Atendimento do teste' where id = testes.id(p_chave);
  reset role;
  perform testes.sistema();
end $$;

-- As tarefas guardadas num check-in (títulos em ordem).
create function testes.no_checkin(p_chave text) returns text[] language sql stable as $$
  select coalesce(array_agg(titulo order by titulo), '{}') from public.checkin_tarefas where checkin_id = testes.id(p_chave)
$$;

-- Quantas linhas a pessoa enxerga com uma consulta direta (pela API).
create function testes.contar(p_quem text, p_sql text) returns int language plpgsql as $$
declare v int;
begin
  perform testes.como(p_quem);
  execute 'select count(*)::int from (' || p_sql || ') x' into v;
  reset role;
  perform testes.sistema();
  return v;
end $$;

-- Os nomes dos modelos (em ordem) que vieram para aplicar.
create function testes.nomes(p jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(i ->> 'nome' order by o), '{}') from jsonb_array_elements(p -> 'itens') with ordinality x(i, o)
$$;

create function testes.item(p jsonb, p_nome text) returns jsonb language sql immutable as $$
  select i from jsonb_array_elements(p -> 'itens') i where i ->> 'nome' = p_nome
$$;

-- A tarefa da leitura do check-list, pelo título.
create function testes.da_leitura(p jsonb, p_titulo text) returns jsonb language sql immutable as $$
  select t from jsonb_array_elements(p -> 'tarefas') t where t ->> 'titulo' = p_titulo
$$;

-- Os eventos de modelo no histórico do cliente, como a pessoa: "tipo: modelo" em ordem de texto.
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

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: administrador, gestor, os consultores pessoa_a (tipo Gestão), pessoa_a2 e pessoa_t, e um
-- administrador que ainda precisa trocar a senha (sessão não liberada). B: gestor e consultor. C: gestor e consultor
-- (C é arquivada no fim).
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('C');
select testes.perfil('central1', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('pessoa_t', 'pessoa', 'A');
select testes.perfil('a_senha', 'admin', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
select testes.perfil('gestor_c', 'gestor', 'C');
select testes.perfil('pessoa_c', 'pessoa', 'C');
update public.perfis set precisa_trocar_senha = true where id = testes.id('a_senha');
update public.perfis set tipos_de_consultoria = '{gestao}' where id = testes.id('pessoa_a');

select testes.cliente('c1', 'A', 'pessoa_a');
select testes.cliente('c2', 'A', 'pessoa_a');
select testes.cliente('c_arq', 'A', 'pessoa_a');
select testes.cliente('c_mov', 'A', 'pessoa_a');
select testes.cliente('c_troca', 'A', 'pessoa_t');
select testes.cliente('c_aguarda', 'A', null);
select testes.cliente('c_vazio', 'A', null);
select testes.cliente('c_sem', null, null);
select testes.cliente('c_b', 'B', 'pessoa_b');
select testes.cliente('c_c', 'C', 'pessoa_c');

select testes.criar('central1', 'm_todas', testes.dados('Zqc Central todas', 'todas', 'gestao'));
select testes.criar('central1', 'm_ca', testes.dados('Zqc Central para A', testes.id('A')::text));
select testes.criar('central1', 'm_cb', testes.dados('Zqc Central para B', testes.id('B')::text));
select testes.criar('gestor_a', 'm_a', testes.dados('Zqc Gestão A'));
select testes.criar('gestor_a', 'm_a2', testes.dados('Zqc Outro A'));
select testes.criar('gestor_a', 'm_x', testes.dados('Zqc Primeiro'));
select testes.criar('gestor_a', 'm_arq', testes.dados('Zqc Arquivado A'));
select testes.criar('gestor_b', 'm_b', testes.dados('Zqc Gestão B'));
update public.modelos set arquivado_em = now() where id = testes.id('m_arq');

-- ── Estrutura e permissões da API ────────────────────────────────────────────

select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.cliente_checklists'::regclass, 'public.checklist_etapas'::regclass,
    'public.checklist_tarefas'::regclass, 'public.checklist_dependencias'::regclass, 'public.checkin_tarefas'::regclass)),
  'RLS ligado nas cinco tabelas novas');
select ok((select bool_and(has_table_privilege('authenticated', t, 'select')
      and not has_table_privilege('authenticated', t, 'insert')
      and not has_table_privilege('authenticated', t, 'update')
      and not has_table_privilege('authenticated', t, 'delete')
      and not has_table_privilege('anon', t, 'select')
      and not has_table_privilege('anon', t, 'insert'))
    from unnest(array['public.cliente_checklists', 'public.checklist_etapas', 'public.checklist_tarefas',
      'public.checklist_dependencias', 'public.checkin_tarefas']) t),
  'authenticated só lê as tabelas novas (escrita só pelas funções do banco); anon nada');
select ok((select bool_and(has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
    from unnest(array['public.aplicar_modelo(uuid, uuid, date)', 'public.modelos_para_aplicar(uuid, text, int)',
      'public.mudar_inicio_do_checklist(uuid, date)', 'public.tirar_modelo(uuid)', 'public.checklist_do_cliente(uuid)',
      'public.marcar_tarefa(uuid, text, text)', 'public.anotar_tarefa(uuid, text)', 'public.uso_do_modelo(uuid)',
      'public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz)']) f),
  'as funções novas: authenticated executa, anon não');
select ok(not has_function_privilege('authenticated', 'private.recontar_checklist(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.recontar_checklist(uuid)', 'execute'),
  'recontar é só das funções do banco');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('aplicar_modelo', 'modelos_para_aplicar', 'mudar_inicio_do_checklist',
      'tirar_modelo', 'checklist_do_cliente', 'marcar_tarefa', 'anotar_tarefa', 'uso_do_modelo')),
  'as funções novas são security definer com search_path vazio');

-- ── Aplicar ──────────────────────────────────────────────────────────────────

select is(testes.aplicar('central1', testes.id('c1'), testes.id('m_x'), testes.hoje() - 3, 'cl_c1_1'), 'ok',
  'a Central aplica o modelo no cliente');
select is((select jsonb_build_object('cliente', cliente_id, 'consultoria', consultoria_id, 'modelo', modelo_id,
    'nome', modelo_nome, 'inicio', inicio, 'aplicado_por', aplicado_por, 'encerrado_em', encerrado_em,
    'motivo', motivo, 'tarefas', tarefas, 'feitas', feitas, 'obrigatorias', obrigatorias,
    'obrigatorias_feitas', obrigatorias_feitas, 'proximo_vencimento', proximo_vencimento)
  from public.cliente_checklists where id = testes.id('cl_c1_1')),
  jsonb_build_object('cliente', testes.id('c1'), 'consultoria', testes.id('A'), 'modelo', testes.id('m_x'),
    'nome', 'Zqc Primeiro', 'inicio', testes.hoje() - 3, 'aplicado_por', testes.id('central1'), 'encerrado_em', null,
    'motivo', null, 'tarefas', 3, 'feitas', 0, 'obrigatorias', 2, 'obrigatorias_feitas', 0,
    'proximo_vencimento', testes.hoje() + 2),
  'o check-list guarda o cliente, a consultoria dele, o modelo (e o nome), o início, quem aplicou e os contadores');
select is((select array_agg(nome order by posicao) from public.checklist_etapas where checklist_id = testes.id('cl_c1_1')),
  array['Diagnóstico', 'Plano'], 'as etapas copiadas, na ordem do modelo');
select is(testes.tarefas(testes.id('cl_c1_1')),
  array['1.1: Análise do DRE (5, obrig, 5, a_fazer)', '1.2: Mapa de custos (10, opc, 10, a_fazer)',
    '2.3: Plano de ação (20, obrig, 20, a_fazer)'],
  'as tarefas copiadas em ordem, a fazer, vencendo no início + o prazo');
select is((select array_agg(origem order by posicao) from public.checklist_tarefas where checklist_id = testes.id('cl_c1_1')),
  (select array_agg(id order by posicao) from public.modelo_tarefas where modelo_id = testes.id('m_x')),
  'cada tarefa guarda de que tarefa do modelo veio');
select is((select descricao from public.checklist_tarefas where id = testes.tarefa(testes.id('cl_c1_1'), 'Análise do DRE')),
  'Ler o DRE', 'a descrição vem junto');
select is(testes.dependencias(testes.id('cl_c1_1')),
  array['Mapa de custos -> Análise do DRE', 'Plano de ação -> Análise do DRE', 'Plano de ação -> Mapa de custos'],
  'as dependências apontam para as tarefas copiadas (nunca para as do modelo)');
select is((select (tipo, checklist_id, autor)::text from public.cliente_eventos
    where cliente_id = testes.id('c1') and tipo like 'modelo\_%'),
  ('modelo_aplicado', testes.id('cl_c1_1'), testes.id('central1'))::text,
  'o histórico registra "modelo aplicado", com o check-list e quem aplicou');

select is(testes.aplicar('gestor_a', testes.id('c1'), testes.id('m_todas'), testes.hoje() - 7, 'cl_c1_2'), 'ok',
  'o gestor troca o modelo do cliente');
select is((select (encerrado_em is not null, encerrado_por, motivo)::text from public.cliente_checklists
    where id = testes.id('cl_c1_1')),
  (true, testes.id('gestor_a'), 'trocado')::text, 'o check-list anterior fica encerrado como "trocado", com quem trocou');
select is((select array_agg(id) from public.cliente_checklists where cliente_id = testes.id('c1') and encerrado_em is null),
  array[testes.id('cl_c1_2')], 'o cliente fica com um check-list ativo só: o novo');
select is((select (tipo, autor)::text from public.cliente_eventos where checklist_id = testes.id('cl_c1_2')),
  ('modelo_trocado', testes.id('gestor_a'))::text, 'o histórico registra "modelo trocado" com o check-list novo');
select throws_ok(format($$insert into public.cliente_checklists (cliente_id, consultoria_id, modelo_nome, inicio)
    values (%L, %L, 'Outro ativo', current_date)$$, testes.id('c1'), testes.id('A')),
  '23505', null, 'o banco não aceita dois check-lists ativos no mesmo cliente');

select is(testes.aplicar('central1', testes.id('c2'), testes.id('m_ca'), testes.hoje(), 'cl_c2'), 'ok',
  'a Central aplica o modelo dela para a consultoria');
select is(testes.aplicar('admin_a', testes.id('c_arq'), testes.id('m_a'), testes.hoje(), 'cl_arq'), 'ok',
  'o administrador aplica');
select is(testes.aplicar('gestor_a', testes.id('c_aguarda'), testes.id('m_a'), testes.hoje(), 'cl_aguarda'), 'ok',
  'cliente aguardando consultor também recebe modelo');
select is(testes.aplicar('gestor_a', testes.id('c_mov'), testes.id('m_a'), testes.hoje(), 'cl_mov'), 'ok',
  'o gestor aplica o modelo da consultoria');
select is(testes.aplicar('gestor_a', testes.id('c_troca'), testes.id('m_todas'), testes.hoje(), 'cl_troca'), 'ok',
  'o gestor aplica o modelo da Central para todas');
select is(testes.aplicar('gestor_b', testes.id('c_b'), testes.id('m_todas'), testes.hoje(), 'cl_b'), 'ok',
  'a gestão de B aplica o modelo da Central para todas num cliente dela');
select is(testes.aplicar('gestor_c', testes.id('c_c'), testes.id('m_todas'), testes.hoje(), 'cl_c'), 'ok',
  'a gestão de C também');

select is(testes.aplicar('pessoa_a', testes.id('c1'), testes.id('m_a'), testes.hoje()), 'P0001 sem_permissao',
  'o consultor não aplica (nem no cliente dele)');
select is(testes.aplicar('gestor_b', testes.id('c1'), testes.id('m_b'), testes.hoje()), 'P0001 sem_permissao',
  'outra consultoria não aplica');
select is(testes.aplicar('gestor_a', testes.id('c_b'), testes.id('m_todas'), testes.hoje()), 'P0001 sem_permissao',
  'o gestor não aplica em cliente de outra consultoria');
select is(testes.aplicar('a_senha', testes.id('c1'), testes.id('m_a'), testes.hoje()), 'P0001 sem_permissao',
  'sessão não liberada não aplica');
select is(testes.aplicar('gestor_a', testes.id('c_sem'), testes.id('m_a'), testes.hoje()), 'P0001 sem_permissao',
  'o gestor não aplica em cliente da Central');
select is(testes.aplicar('gestor_a', gen_random_uuid(), testes.id('m_a'), testes.hoje()), 'P0001 sem_permissao',
  'cliente que não existe: sem_permissao');
select is(testes.aplicar('central1', testes.id('c_sem'), testes.id('m_todas'), testes.hoje()),
  'P0001 cliente_sem_consultoria', 'cliente sem consultoria não recebe modelo');
select is(testes.aplicar('gestor_a', testes.id('c1'), testes.id('m_b'), testes.hoje()), 'P0001 modelo_indisponivel',
  'modelo de outra consultoria');
select is(testes.aplicar('central1', testes.id('c1'), testes.id('m_cb'), testes.hoje()), 'P0001 modelo_indisponivel',
  'modelo da Central só para outra consultoria');
select is(testes.aplicar('gestor_a', testes.id('c1'), testes.id('m_arq'), testes.hoje()), 'P0001 modelo_indisponivel',
  'modelo arquivado');
select is(testes.aplicar('central1', testes.id('c1'), gen_random_uuid(), testes.hoje()), 'P0001 modelo_indisponivel',
  'modelo que não existe');
select is(testes.aplicar('gestor_a', testes.id('c1'), testes.id('m_a'), null), 'P0001 inicio_invalido',
  'sem a data de início');
select is(testes.aplicar('gestor_a', testes.id('c1'), testes.id('m_a'), (testes.hoje() - interval '2 years')::date - 1),
  'P0001 inicio_invalido', 'início mais de 2 anos atrás');
select is(testes.aplicar('gestor_a', testes.id('c1'), testes.id('m_a'), (testes.hoje() + interval '1 year')::date + 1),
  'P0001 inicio_invalido', 'início mais de 1 ano à frente');
select is((select array_agg(id order by aplicado_em, id) filter (where encerrado_em is null)
    from public.cliente_checklists where cliente_id = testes.id('c1')),
  array[testes.id('cl_c1_2')], 'depois das recusas, o cliente continua com o mesmo check-list ativo');
select is((select count(*)::int from public.cliente_checklists where cliente_id = testes.id('c1')), 2,
  'e nenhuma recusa encerrou ou criou check-list');

-- ── A cópia não muda com o modelo ────────────────────────────────────────────

create table testes.antes (nome text primary key, r jsonb not null);
insert into testes.antes values ('c1_2', testes.retrato(testes.id('cl_c1_2'))), ('c1_1', testes.retrato(testes.id('cl_c1_1')));
select testes.como('central1');
select public.salvar_modelo(testes.id('m_todas'), jsonb_build_object('nome', 'Zqc Central todas', 'tipo', 'gestao',
  'para', 'todas', 'etapas', jsonb_build_array(jsonb_build_object('nome', 'Única', 'tarefas', jsonb_build_array(
    jsonb_build_object('chave', 'n', 'titulo', 'Nova tarefa', 'prazo_dias', 1),
    jsonb_build_object('chave', 'm', 'titulo', 'Outra nova', 'prazo_dias', 2, 'depende_de', jsonb_build_array('n')))))));
reset role;
select testes.sistema();
select is(testes.retrato(testes.id('cl_c1_2')), (select r from testes.antes where nome = 'c1_2'),
  'editar o modelo depois não muda o check-list de quem já usa');
update public.modelos set arquivado_em = now() where id = testes.id('m_todas');
select is(testes.retrato(testes.id('cl_c1_2')), (select r from testes.antes where nome = 'c1_2'),
  'arquivar o modelo também não');
update public.modelos set arquivado_em = null where id = testes.id('m_todas');

select testes.como('gestor_a');
with d as (delete from public.modelos where id = testes.id('m_x') returning 1)
select is(count(*)::int, 1, 'modelo usado só por check-list encerrado se apaga') from d;
reset role;
select testes.sistema();
select is((select modelo_id from public.cliente_checklists where id = testes.id('cl_c1_1')), null::uuid,
  'o check-list encerrado fica sem o modelo apagado');
select is(testes.retrato(testes.id('cl_c1_1')), (select r from testes.antes where nome = 'c1_1'),
  'e com o nome do modelo, as etapas, as tarefas e as dependências como estavam');

select testes.como('central1');
select throws_ok(format('delete from public.modelos where id = %L', testes.id('m_todas')), 'P0001', 'modelo_em_uso',
  'modelo com check-list ativo não se apaga (a Central)');
reset role;
select testes.como('gestor_a');
select throws_ok(format('delete from public.modelos where id = %L', testes.id('m_a')), 'P0001', 'modelo_em_uso',
  'nem o da consultoria (o gestor)');
reset role;
select testes.sistema();

-- ── Modelos para aplicar ─────────────────────────────────────────────────────

select is(testes.nomes(testes.chamar('gestor_a', format($$public.modelos_para_aplicar(%L, 'zqc')$$, testes.id('c1')))),
  array['Zqc Central todas', 'Zqc Central para A', 'Zqc Gestão A', 'Zqc Outro A'],
  'os que a consultoria do cliente vê, sem os arquivados; os do tipo do consultor primeiro, depois por nome');
select is(testes.chamar('gestor_a', format($$public.modelos_para_aplicar(%L, 'zqc')$$, testes.id('c1'))) -> 'total',
  '4'::jsonb, 'com o total');
select is(testes.item(testes.chamar('gestor_a', format($$public.modelos_para_aplicar(%L, 'zqc')$$, testes.id('c1'))),
    'Zqc Central todas'),
  jsonb_build_object('id', testes.id('m_todas'), 'nome', 'Zqc Central todas', 'tipo', 'gestao', 'da_central', true,
    'etapas', 1, 'tarefas', 2, 'obrigatorias', 2, 'maior_prazo', 2, 'do_tipo_do_consultor', true),
  'cada modelo traz o que a janela mostra (os números do modelo como está agora)');
select is(testes.item(testes.chamar('gestor_a', format($$public.modelos_para_aplicar(%L, 'zqc')$$, testes.id('c1'))),
    'Zqc Gestão A') -> 'do_tipo_do_consultor', 'false'::jsonb, 'modelo sem tipo não é do tipo do consultor');
select is(testes.nomes(testes.chamar('central1', format($$public.modelos_para_aplicar(%L, 'zqc')$$, testes.id('c1')))),
  array['Zqc Central todas', 'Zqc Central para A', 'Zqc Gestão A', 'Zqc Outro A'],
  'a Central vê os mesmos que a consultoria do cliente');
select is((select jsonb_build_object('n', jsonb_array_length(r -> 'itens'), 'total', r -> 'total')
    from testes.chamar('gestor_a', format($$public.modelos_para_aplicar(%L, 'zqc', 1)$$, testes.id('c1'))) r),
  '{"n": 1, "total": 4}'::jsonb, 'p_limite corta a lista, o total continua');
select is(testes.nomes(testes.chamar('gestor_a', format($$public.modelos_para_aplicar(%L, 'GESTAO a')$$, testes.id('c1')))),
  array['Zqc Gestão A'], 'busca sem acento e sem maiúscula');
select is(testes.nomes(testes.chamar('gestor_b', format($$public.modelos_para_aplicar(%L, 'zqc')$$, testes.id('c_b')))),
  array['Zqc Central para B', 'Zqc Central todas', 'Zqc Gestão B'],
  'a gestão de B vê os dela e os da Central para ela (o consultor sem tipo: só por nome)');
select is(testes.chamar('pessoa_a', format('public.modelos_para_aplicar(%L)', testes.id('c1'))) ->> 'erro',
  'P0001 sem_permissao', 'o consultor não pede a lista para aplicar');
select is(testes.chamar('gestor_a', format('public.modelos_para_aplicar(%L)', testes.id('c_b'))) ->> 'erro',
  'P0001 sem_permissao', 'nem a gestão para cliente de outra consultoria');

-- ── Ler o check-list ─────────────────────────────────────────────────────────

select is(testes.ler('pessoa_a', 'c1') - 'checklist' - 'etapas' - 'tarefas' - 'resumo',
  jsonb_build_object('pode_aplicar', false, 'pode_marcar', true, 'pode_comentar', true,
    'consultor', jsonb_build_object('id', testes.id('pessoa_a'), 'nome', 'Pessoa pessoa_a'),
    'sessao', null, 'ultimo_checkin', null),
  'o consultor do cliente marca e não aplica; sem check-in aberto nem anterior');
select is((testes.ler('pessoa_a', 'c1') -> 'checklist') - 'aplicado_em',
  jsonb_build_object('id', testes.id('cl_c1_2'), 'modelo_id', testes.id('m_todas'), 'modelo_nome', 'Zqc Central todas',
    'inicio', testes.hoje() - 7, 'aplicado_por', jsonb_build_object('nome', 'Pessoa gestor_a')),
  'o check-list ativo: modelo, início e quem aplicou');
select is((select jsonb_agg(e - 'id' order by e ->> 'posicao') from jsonb_array_elements(testes.ler('pessoa_a', 'c1') -> 'etapas') e),
  '[{"nome": "Diagnóstico", "posicao": 1, "tarefas": 2, "feitas": 0, "nao_se_aplica": 0}, {"nome": "Plano", "posicao": 2, "tarefas": 1, "feitas": 0, "nao_se_aplica": 0}]'::jsonb,
  'as etapas com quantas tarefas, quantas feitas e quantas não se aplicam');
select is(testes.da_leitura(testes.ler('pessoa_a', 'c1'), 'Análise do DRE'),
  jsonb_build_object('id', testes.tarefa(testes.id('cl_c1_2'), 'Análise do DRE'),
    'etapa_id', (select etapa_id from public.checklist_tarefas where id = testes.tarefa(testes.id('cl_c1_2'), 'Análise do DRE')),
    'posicao', 1, 'titulo', 'Análise do DRE', 'descricao', 'Ler o DRE', 'obrigatoria', true, 'prazo_dias', 5,
    'vence_em', testes.hoje() - 2, 'estado', 'a_fazer', 'nota', null, 'motivo', null, 'feita_em', null, 'feita_por', null,
    'depende_de', '[]'::jsonb, 'na_sessao', false, 'tempo_segundos', 0, 'trecho_aberto_desde', null, 'comentarios', 0),
  'cada tarefa traz o que a lista, o fluxograma e a janela da tarefa mostram');
select is(testes.da_leitura(testes.ler('pessoa_a', 'c1'), 'Plano de ação') -> 'depende_de',
  jsonb_build_array(testes.tarefa(testes.id('cl_c1_2'), 'Análise do DRE'), testes.tarefa(testes.id('cl_c1_2'), 'Mapa de custos')),
  '"depende de" com os ids, na ordem do check-list');
select is(testes.ler('pessoa_a', 'c1') -> 'resumo',
  jsonb_build_object('tarefas', 3, 'feitas', 0, 'nao_se_aplica', 0, 'resolvidas', 0, 'obrigatorias', 2,
    'obrigatorias_feitas', 0, 'vencem_7_dias', 1, 'atrasadas', 1, 'proxima', jsonb_build_object('id', testes.tarefa(testes.id('cl_c1_2'), 'Análise do DRE'),
      'titulo', 'Análise do DRE', 'vence_em', testes.hoje() - 2)),
  'o resumo contado no banco: atrasada (venceu ontem ou antes), vence em 7 dias (mesmo bloqueada) e a próxima livre');
select is((select jsonb_build_object('aplicar', r -> 'pode_aplicar', 'marcar', r -> 'pode_marcar',
    'por', r #> '{checklist,aplicado_por,nome}') from testes.ler('gestor_a', 'c1') r),
  '{"aplicar": true, "marcar": false, "por": "Pessoa gestor_a"}'::jsonb, 'o gestor aplica e só acompanha');
select is((select jsonb_build_object('aplicar', r -> 'pode_aplicar', 'marcar', r -> 'pode_marcar') from testes.ler('central1', 'c1') r),
  '{"aplicar": true, "marcar": false}'::jsonb, 'a Central aplica e só acompanha');
select is(testes.ler('gestor_a', 'c2') #>> '{checklist,aplicado_por,nome}', 'Central',
  'quem é da Central aparece como "Central" para a consultoria');
select is(testes.ler('central1', 'c2') #>> '{checklist,aplicado_por,nome}', 'Pessoa central1', 'a Central vê o nome');
select is(testes.ler('pessoa_a2', 'c1'), null::jsonb, 'colega que não é o consultor não vê o check-list');
select is(testes.ler('gestor_b', 'c1'), null::jsonb, 'outra consultoria não vê');
select is(testes.ler('a_senha', 'c1') ->> 'erro', 'P0001 sem_permissao', 'sessão não liberada não lê');
select is((select jsonb_build_object('consultor', r -> 'consultor', 'marcar', r -> 'pode_marcar', 'aplicar', r -> 'pode_aplicar')
    from testes.ler('gestor_a', 'c_aguarda') r),
  '{"consultor": null, "marcar": false, "aplicar": true}'::jsonb, 'cliente aguardando consultor: ninguém marca');
select is(testes.ler('gestor_a', 'c_vazio') - 'consultor' - 'sessao' - 'ultimo_checkin',
  jsonb_build_object('pode_aplicar', true, 'pode_marcar', false, 'pode_comentar', false, 'checklist', null, 'etapas', '[]'::jsonb,
    'tarefas', '[]'::jsonb, 'resumo', jsonb_build_object('tarefas', 0, 'feitas', 0, 'nao_se_aplica', 0, 'resolvidas', 0,
      'obrigatorias', 0, 'obrigatorias_feitas', 0, 'vencem_7_dias', 0, 'atrasadas', 0, 'proxima', null)),
  'cliente sem modelo: check-list nulo, listas vazias e números zerados');

-- ── Marcar ───────────────────────────────────────────────────────────────────

insert into testes.fx
select 'c1_' || k, testes.tarefa(testes.id('cl_c1_2'), t)
from (values ('analise', 'Análise do DRE'), ('mapa', 'Mapa de custos'), ('plano', 'Plano de ação')) x(k, t);

select is(testes.marcar('pessoa_a', testes.id('c1_mapa'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'tarefa bloqueada não se marca como feita');
select is(testes.marcar('pessoa_a', testes.id('c1_mapa'), 'andamento') ->> 'erro', 'P0001 tarefa_bloqueada',
  'nem se começa');
select is(testes.marcar('pessoa_a', testes.id('c1_analise'), 'pronta') ->> 'erro', 'P0001 estado_invalido',
  'estado que não existe');
select is(testes.marcar('pessoa_a', testes.id('c1_analise'), null) ->> 'erro', 'P0001 estado_invalido', 'estado nulo');
select is(testes.marcar('gestor_a', testes.id('c1_analise'), 'feita') ->> 'erro', 'P0001 so_o_consultor_marca',
  'o gestor que não é o consultor não marca');
select is(testes.marcar('admin_a', testes.id('c1_analise'), 'feita') ->> 'erro', 'P0001 so_o_consultor_marca',
  'nem o administrador');
select is(testes.marcar('central1', testes.id('c1_analise'), 'feita') ->> 'erro', 'P0001 so_o_consultor_marca',
  'nem a Central');
select is(testes.marcar('pessoa_a2', testes.id('c1_analise'), 'feita') ->> 'erro', 'P0001 sem_permissao',
  'colega que não vê o cliente: sem_permissao');
select is(testes.marcar('gestor_b', testes.id('c1_analise'), 'feita') ->> 'erro', 'P0001 sem_permissao',
  'outra consultoria: sem_permissao');
select is(testes.marcar('a_senha', testes.id('c1_analise'), 'feita') ->> 'erro', 'P0001 sem_permissao',
  'sessão não liberada: sem_permissao');
select is(testes.marcar('pessoa_a', gen_random_uuid(), 'feita') ->> 'erro', 'P0001 sem_permissao',
  'tarefa que não existe: sem_permissao');

select is(testes.marcar('pessoa_a', testes.id('c1_analise'), 'andamento'),
  jsonb_build_object('estado', 'andamento', 'feita_em', null, 'liberadas', '[]'::jsonb, 'na_sessao', false,
    'tempo_segundos', 0, 'trecho_aberto_desde', now()),
  'o consultor começa a tarefa (o relógio dela começa a correr)');
select is(testes.marcar('pessoa_a', testes.id('c1_analise'), 'feita') - 'feita_em',
  jsonb_build_object('estado', 'feita', 'liberadas', jsonb_build_array(jsonb_build_object('id', testes.id('c1_mapa'),
    'titulo', 'Mapa de custos')), 'na_sessao', false, 'tempo_segundos', 0, 'trecho_aberto_desde', null),
  'e marca como feita: diz o que liberou e que ficou fora de uma sessão (sem check-in aberto)');
select is((select (estado, feita_em, feita_por)::text from public.checklist_tarefas where id = testes.id('c1_analise')),
  ('feita', now(), testes.id('pessoa_a'))::text, 'grava quem e quando');
select is(testes.contadores(testes.id('cl_c1_2')),
  jsonb_build_object('tarefas', 3, 'feitas', 1, 'obrigatorias', 2, 'obrigatorias_feitas', 1,
    'proximo_vencimento', testes.hoje() + 3),
  'os contadores e o próximo vencimento (a não feita de data mais cedo) acompanham');
select is(testes.marcar('pessoa_a', testes.id('c1_mapa'), 'feita') -> 'liberadas',
  jsonb_build_array(jsonb_build_object('id', testes.id('c1_plano'), 'titulo', 'Plano de ação')),
  'feita a última dependência, libera a seguinte');
select is(testes.marcar('pessoa_a', testes.id('c1_analise'), 'a_fazer') - 'liberadas',
  '{"estado": "a_fazer", "feita_em": null, "na_sessao": false, "tempo_segundos": 0, "trecho_aberto_desde": null}'::jsonb,
  'reabrir pode mesmo com tarefa dependente já feita');
select is((select array_agg(estado order by posicao) from public.checklist_tarefas where checklist_id = testes.id('cl_c1_2')),
  array['a_fazer', 'feita', 'a_fazer'], 'a dependente feita continua feita');
select is((select (feita_em, feita_por)::text from public.checklist_tarefas where id = testes.id('c1_analise')),
  (null::timestamptz, null::uuid)::text, 'reaberta, perde quem e quando');
select is(testes.contadores(testes.id('cl_c1_2')),
  jsonb_build_object('tarefas', 3, 'feitas', 1, 'obrigatorias', 2, 'obrigatorias_feitas', 0,
    'proximo_vencimento', testes.hoje() - 2),
  'os contadores voltam');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'com a dependência reaberta, a seguinte volta a ficar bloqueada');
select is(testes.marcar('pessoa_a', testes.id('c1_mapa'), 'andamento') ->> 'erro', 'P0001 tarefa_bloqueada',
  'passar uma feita para "em andamento" também pede as dependências feitas');
select is(testes.marcar('pessoa_a', testes.id('c1_analise'), 'feita') -> 'liberadas',
  jsonb_build_array(jsonb_build_object('id', testes.id('c1_plano'), 'titulo', 'Plano de ação')),
  'marcada de novo, libera só a que ainda não estava feita');
select is(testes.marcar('pessoa_a', testes.id('c1_analise'), 'feita') - 'feita_em',
  '{"estado": "feita", "liberadas": [], "na_sessao": false, "tempo_segundos": 0, "trecho_aberto_desde": null}'::jsonb, 'marcar de novo no mesmo estado não muda nada');
select is(testes.ler('pessoa_a', 'c1') -> 'resumo',
  jsonb_build_object('tarefas', 3, 'feitas', 2, 'nao_se_aplica', 0, 'resolvidas', 2, 'obrigatorias', 2,
    'obrigatorias_feitas', 1, 'vencem_7_dias', 0, 'atrasadas', 0, 'proxima', jsonb_build_object('id', testes.id('c1_plano'), 'titulo', 'Plano de ação',
      'vence_em', testes.hoje() + 13)),
  'o resumo acompanha');
select is(testes.da_leitura(testes.ler('gestor_a', 'c1'), 'Análise do DRE') -> 'feita_por',
  '{"nome": "Pessoa pessoa_a"}'::jsonb, 'quem fez aparece para a gestão');
select is((select jsonb_agg(e -> 'feitas' order by e ->> 'posicao') from jsonb_array_elements(testes.ler('pessoa_a', 'c1') -> 'etapas') e),
  '[2, 0]'::jsonb, 'as feitas por etapa');

-- ── Nota ─────────────────────────────────────────────────────────────────────

select is(testes.fazer('pessoa_a', format($$public.anotar_tarefa(%L, '  Falar com o contador  ')$$, testes.id('c1_plano'))),
  'ok', 'o consultor escreve a nota');
select is((select nota from public.checklist_tarefas where id = testes.id('c1_plano')), 'Falar com o contador',
  'sem os espaços das pontas');
select is(testes.fazer('pessoa_a', format($$public.anotar_tarefa(%L, 'Esperando o DRE')$$,
    testes.tarefa(testes.id('cl_c2'), 'Mapa de custos'))), 'ok', 'tarefa bloqueada também recebe nota');
select is(testes.fazer('pessoa_a', format($$public.anotar_tarefa(%L, '   ')$$, testes.id('c1_plano'))), 'ok',
  'nota em branco');
select is((select nota from public.checklist_tarefas where id = testes.id('c1_plano')), null, 'vira nula');
select ok(testes.fazer('pessoa_a', format('public.anotar_tarefa(%L, %L)', testes.id('c1_plano'), repeat('x', 501)))
  like '23514 %', 'nota acima de 500 letras é recusada');
select is(testes.fazer('gestor_a', format($$public.anotar_tarefa(%L, 'Oi')$$, testes.id('c1_plano'))),
  'P0001 so_o_consultor_marca', 'o gestor não escreve a nota');
select is(testes.fazer('pessoa_a2', format($$public.anotar_tarefa(%L, 'Oi')$$, testes.id('c1_plano'))),
  'P0001 sem_permissao', 'quem não vê o cliente também não');

-- ── O que é marcado com o check-in aberto ────────────────────────────────────
-- pessoa_a: k1 em c1 (6 h atrás), k2 em c2 (4 h), k3 em c1 (2 h, depois apagado) e k4 em c1 (1 h, aberto na troca do
-- modelo). Os check-ins de uma pessoa não se sobrepõem.

select testes.checkin('pessoa_a', 'k1', 'c1', now() - interval '6 hours');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'feita') - 'feita_em',
  '{"estado": "feita", "liberadas": [], "na_sessao": true, "tempo_segundos": 0, "trecho_aberto_desde": null}'::jsonb,
  'com o check-in aberto neste cliente, a tarefa feita entra na sessão');
select is((select (checkin_id, titulo)::text from public.checkin_tarefas where tarefa_id = testes.id('c1_plano')),
  (testes.id('k1'), 'Plano de ação')::text, 'o check-in guarda a tarefa com o título');
select is((testes.ler('pessoa_a', 'c1') -> 'sessao') - 'inicio',
  jsonb_build_object('checkin_id', testes.id('k1'), 'consultor', jsonb_build_object('nome', 'Pessoa pessoa_a'),
    'tarefas', jsonb_build_array(jsonb_build_object('tarefa_id', testes.id('c1_plano'), 'titulo', 'Plano de ação',
      'estado', 'feita', 'motivo', null))),
  'a leitura traz a sessão aberta com o que foi marcado nela');
select is(testes.da_leitura(testes.ler('pessoa_a', 'c1'), 'Plano de ação') -> 'na_sessao', 'true'::jsonb,
  'e a tarefa diz que está na sessão');
select is(testes.ler('gestor_a', 'c1') #> '{sessao,checkin_id}', to_jsonb(testes.id('k1')),
  'a gestão também vê a sessão aberta');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'a_fazer') -> 'na_sessao', 'false'::jsonb,
  'desmarcar com o check-in ainda aberto tira da sessão');
select is(testes.no_checkin('k1'), '{}'::text[], 'e do check-in');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'feita') -> 'na_sessao', 'true'::jsonb, 'marcar de novo põe de volta');
select testes.checkout('pessoa_a', 'k1', now() - interval '5 hours');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'a_fazer') -> 'na_sessao', 'false'::jsonb,
  'depois do check-out, desmarcar não mexe na sessão');
select is(testes.no_checkin('k1'), array['Plano de ação'], 'o check-in fechado não muda mais');
select is(testes.ler('pessoa_a', 'c1') -> 'ultimo_checkin',
  jsonb_build_object('inicio', now() - interval '6 hours', 'fim', now() - interval '5 hours',
    'consultor', jsonb_build_object('nome', 'Pessoa pessoa_a')),
  'a leitura traz o último check-in fechado');

select testes.checkin('pessoa_a', 'k2', 'c2', now() - interval '4 hours');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'feita') -> 'na_sessao', 'false'::jsonb,
  'com o check-in aberto em outro cliente, a tarefa fica feita fora de uma sessão');
select is(testes.no_checkin('k2'), '{}'::text[], 'e não entra no check-in do outro cliente');
select is(testes.ler('pessoa_a', 'c1') -> 'sessao', 'null'::jsonb, 'e c1 não tem sessão aberta');
select testes.checkout('pessoa_a', 'k2', now() - interval '3 hours');

select testes.checkin('pessoa_a', 'k3', 'c1', now() - interval '2 hours');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'a_fazer') -> 'na_sessao', 'false'::jsonb, 'reabre');
select is(testes.marcar('pessoa_a', testes.id('c1_plano'), 'feita') -> 'na_sessao', 'true'::jsonb, 'e marca na sessão k3');
select testes.checkout('pessoa_a', 'k3', now() - interval '90 minutes');
select testes.como('pessoa_a');
delete from public.checkins where id = testes.id('k3');
reset role;
select testes.sistema();
select is((select estado from public.checklist_tarefas where id = testes.id('c1_plano')), 'feita',
  'apagar o check-in não desmarca a tarefa');
select is(testes.no_checkin('k3'), '{}'::text[], 'some só o registro de que foi feita naquele check-in');
select is(testes.no_checkin('k1'), array['Plano de ação'], 'os outros check-ins continuam como estavam');

-- Trocar o modelo com o check-in aberto.
select testes.checkin('pessoa_a', 'k4', 'c1', now() - interval '1 hour');
select is(testes.marcar('pessoa_a', testes.id('c1_mapa'), 'a_fazer') -> 'na_sessao', 'false'::jsonb, 'reabre o mapa');
select is(testes.marcar('pessoa_a', testes.id('c1_mapa'), 'feita') -> 'na_sessao', 'true'::jsonb, 'e marca na sessão k4');
select is(testes.aplicar('gestor_a', testes.id('c1'), testes.id('m_a2'), testes.hoje(), 'cl_c1_3'), 'ok',
  'a gestão troca o modelo com o check-in aberto');
select is(testes.no_checkin('k4'), array['Mapa de custos'], 'o que já foi marcado fica no check-in aberto, com o título');
select is(testes.marcar('pessoa_a', testes.id('c1_analise'), 'a_fazer') ->> 'erro', 'P0001 checklist_encerrado',
  'marcar no check-list trocado é recusado');
select is(testes.fazer('pessoa_a', format($$public.anotar_tarefa(%L, 'Oi')$$, testes.id('c1_analise'))),
  'P0001 checklist_encerrado', 'escrever nota nele também');
select is(testes.contadores(testes.id('cl_c1_3')),
  jsonb_build_object('tarefas', 3, 'feitas', 0, 'obrigatorias', 2, 'obrigatorias_feitas', 0,
    'proximo_vencimento', testes.hoje() + 5),
  'o check-list novo começa do zero');
select is((select jsonb_build_object('checklist', r #> '{checklist,id}', 'sessao', r #> '{sessao,tarefas}',
    'na_sessao', (select jsonb_agg(t -> 'na_sessao') from jsonb_array_elements(r -> 'tarefas') t))
    from testes.ler('pessoa_a', 'c1') r),
  jsonb_build_object('checklist', testes.id('cl_c1_3'),
    'sessao', jsonb_build_array(jsonb_build_object('tarefa_id', testes.id('c1_mapa'), 'titulo', 'Mapa de custos',
      'estado', 'feita', 'motivo', null)),
    'na_sessao', '[false, false, false]'::jsonb),
  'a sessão mostra o que foi marcado antes da troca; nada do novo está nela');
select is(testes.marcar('pessoa_a', testes.tarefa(testes.id('cl_c1_3'), 'Análise do DRE'), 'feita') -> 'na_sessao',
  'true'::jsonb, 'marcar no novo entra na mesma sessão');
select testes.checkout('pessoa_a', 'k4', now());
select is(testes.no_checkin('k4'), array['Análise do DRE', 'Mapa de custos'], 'o check-out fica com as duas');

-- ── Consultor trocado ────────────────────────────────────────────────────────

select testes.checkin('pessoa_t', 'k_t', 'c_troca', now() - interval '3 hours');
select is(testes.marcar('pessoa_t', testes.tarefa(testes.id('cl_troca'), 'Análise do DRE'), 'feita') -> 'na_sessao',
  'true'::jsonb, 'o consultor marca na sessão');
select testes.como('gestor_a');
update public.clientes set consultor_id = testes.id('pessoa_a2') where id = testes.id('c_troca');
reset role;
select testes.sistema();
select is((select fim is not null from public.checkins where id = testes.id('k_t')), true,
  'trocar o consultor fecha o check-in aberto dele');
select is(testes.no_checkin('k_t'), array['Análise do DRE'], 'com as tarefas que ele marcou');
select is((select (cl.encerrado_em, t.estado, t.feita_por)::text from public.cliente_checklists cl
    join public.checklist_tarefas t on t.checklist_id = cl.id and t.titulo = 'Análise do DRE'
    where cl.id = testes.id('cl_troca')),
  (null::timestamptz, 'feita', testes.id('pessoa_t'))::text, 'o check-list continua o mesmo, com o que ele fez');
select is(testes.marcar('pessoa_t', testes.tarefa(testes.id('cl_troca'), 'Mapa de custos'), 'feita') ->> 'erro',
  'P0001 sem_permissao', 'o consultor antigo deixa de marcar na hora');
select is((select jsonb_build_object('marcar', r -> 'pode_marcar', 'por', testes.da_leitura(r, 'Análise do DRE') -> 'feita_por')
    from testes.ler('pessoa_a2', 'c_troca') r),
  '{"marcar": true, "por": {"nome": "Pessoa pessoa_t"}}'::jsonb, 'o novo continua de onde parou');
select is(testes.marcar('pessoa_a2', testes.tarefa(testes.id('cl_troca'), 'Mapa de custos'), 'feita') -> 'liberadas',
  jsonb_build_array(jsonb_build_object('id', testes.tarefa(testes.id('cl_troca'), 'Plano de ação'), 'titulo', 'Plano de ação')),
  'e marca');
update public.perfis set consultoria_id = testes.id('B') where id = testes.id('pessoa_t');
select is(testes.contar('pessoa_t', format('select titulo from public.checkin_tarefas where checkin_id = %L', testes.id('k_t'))),
  1, 'o consultor que mudou de consultoria ainda lê as tarefas dos check-ins dele');
select is(testes.da_leitura(testes.ler('gestor_a', 'c_troca'), 'Análise do DRE') -> 'feita_por', '{"nome": null}'::jsonb,
  '"feita por" segue a regra de nome visível: quem foi para outra consultoria some para a antiga');
select is(testes.da_leitura(testes.ler('central1', 'c_troca'), 'Análise do DRE') #>> '{feita_por,nome}', 'Pessoa pessoa_t',
  'a Central vê o nome');

-- ── Quem vê (leitura direta) ─────────────────────────────────────────────────

select is(testes.contar('pessoa_a', format('select id from public.cliente_checklists where cliente_id = %L', testes.id('c1'))),
  3, 'o consultor do cliente vê os check-lists dele (o ativo e os encerrados)');
select is(testes.contar('pessoa_a', format('select id from public.checklist_tarefas where checklist_id = %L', testes.id('cl_c1_3'))),
  3, 'e as tarefas');
select is(testes.contar('gestor_a', format('select id from public.cliente_checklists where cliente_id = %L', testes.id('c1'))),
  3, 'a gestão vê');
select is(testes.contar('central1', format('select id from public.cliente_checklists where cliente_id = %L', testes.id('c1'))),
  3, 'a Central vê');
select is(testes.contar('pessoa_a2', format($$
    select id from public.cliente_checklists where cliente_id = %1$L
    union all select e.id from public.checklist_etapas e where e.checklist_id = %2$L
    union all select t.id from public.checklist_tarefas t where t.checklist_id = %2$L
    union all select d.tarefa_id from public.checklist_dependencias d where d.checklist_id = %2$L $$,
    testes.id('c1'), testes.id('cl_c1_3'))),
  0, 'colega que não é o consultor não vê check-list, etapas, tarefas nem dependências');
select is(testes.contar('gestor_b', format($$
    select id from public.cliente_checklists where cliente_id = %1$L
    union all select t.id from public.checklist_tarefas t where t.checklist_id = %2$L $$,
    testes.id('c1'), testes.id('cl_c1_3'))),
  0, 'outra consultoria também não');
select is(testes.contar('a_senha', format('select id from public.cliente_checklists where cliente_id = %L', testes.id('c1'))),
  0, 'sessão não liberada não vê');
select is(testes.contar('pessoa_a', format('select 1 from public.checkin_tarefas where checkin_id = %L', testes.id('k4'))),
  2, 'o consultor vê as tarefas dos check-ins dele');
select is(testes.contar('gestor_a', format('select 1 from public.checkin_tarefas where checkin_id = %L', testes.id('k4'))),
  2, 'a gestão vê as da consultoria');
select is(testes.contar('central1', format('select 1 from public.checkin_tarefas where checkin_id = %L', testes.id('k4'))),
  2, 'a Central vê todas');
select is(testes.contar('pessoa_a2', format('select 1 from public.checkin_tarefas where checkin_id = %L', testes.id('k4'))),
  0, 'colega não vê as do check-in de outra pessoa');
select is(testes.contar('gestor_b', format('select 1 from public.checkin_tarefas where checkin_id = %L', testes.id('k4'))),
  0, 'outra consultoria não vê');

-- ── Cliente arquivado ────────────────────────────────────────────────────────

update public.clientes set arquivado_em = now() where id = testes.id('c_arq');
select is(testes.marcar('pessoa_a', testes.tarefa(testes.id('cl_arq'), 'Análise do DRE'), 'feita') ->> 'erro',
  'P0001 cliente_arquivado', 'cliente arquivado: ninguém marca');
select is(testes.fazer('pessoa_a', format($$public.anotar_tarefa(%L, 'Oi')$$, testes.tarefa(testes.id('cl_arq'), 'Análise do DRE'))),
  'P0001 cliente_arquivado', 'nem escreve nota');
select is(testes.aplicar('gestor_a', testes.id('c_arq'), testes.id('m_a2'), testes.hoje()), 'P0001 cliente_arquivado',
  'nem aplica');
select is(testes.fazer('gestor_a', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_arq'), testes.hoje())),
  'P0001 cliente_arquivado', 'nem muda o início');
select is(testes.fazer('gestor_a', format('public.tirar_modelo(%L)', testes.id('cl_arq'))), 'P0001 cliente_arquivado',
  'nem tira');
select is((select jsonb_build_object('checklist', r #> '{checklist,id}', 'marcar', r -> 'pode_marcar')
    from testes.ler('pessoa_a', 'c_arq') r),
  jsonb_build_object('checklist', testes.id('cl_arq'), 'marcar', false), 'o check-list fica só para ler');
update public.clientes set arquivado_em = null where id = testes.id('c_arq');
select is(testes.marcar('pessoa_a', testes.tarefa(testes.id('cl_arq'), 'Análise do DRE'), 'feita') ->> 'estado', 'feita',
  'reativado, continua de onde parou');

-- ── Início dos prazos ────────────────────────────────────────────────────────

select is(testes.marcar('pessoa_a', testes.tarefa(testes.id('cl_c2'), 'Análise do DRE'), 'feita') ->> 'estado', 'feita',
  'uma feita em c2');
select is(testes.fazer('gestor_a', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_c2'), testes.hoje() + 2)),
  'ok', 'a gestão muda o início');
select is(testes.tarefas(testes.id('cl_c2')),
  array['1.1: Análise do DRE (5, obrig, 5, feita)', '1.2: Mapa de custos (10, opc, 10, a_fazer)',
    '2.3: Plano de ação (20, obrig, 20, a_fazer)'],
  'os prazos são recalculados a partir do novo início, sem mexer no que foi feito');
select is((select (inicio, proximo_vencimento, feitas)::text from public.cliente_checklists where id = testes.id('cl_c2')),
  (testes.hoje() + 2, testes.hoje() + 12, 1)::text, 'o início, o próximo vencimento e as feitas');
select is(testes.fazer('central1', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_c2'),
    (testes.hoje() + interval '1 year')::date)), 'ok', 'a Central muda (até 1 ano à frente)');
select is(testes.fazer('central1', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_c2'),
    (testes.hoje() - interval '2 years')::date)), 'ok', 'e até 2 anos atrás');
select is(testes.fazer('central1', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_c2'),
    (testes.hoje() - interval '2 years')::date - 1)), 'P0001 inicio_invalido', 'antes disso não');
select is(testes.fazer('central1', format('public.mudar_inicio_do_checklist(%L, null)', testes.id('cl_c2'))),
  'P0001 inicio_invalido', 'nem sem data');
select is(testes.fazer('pessoa_a', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_c2'), testes.hoje())),
  'P0001 sem_permissao', 'o consultor não muda o início');
select is(testes.fazer('gestor_b', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_c2'), testes.hoje())),
  'P0001 sem_permissao', 'outra consultoria não');
select is(testes.fazer('gestor_a', format('public.mudar_inicio_do_checklist(%L, %L)', testes.id('cl_c1_1'), testes.hoje())),
  'P0001 checklist_encerrado', 'check-list encerrado não muda');

-- ── Tirar o modelo ───────────────────────────────────────────────────────────

select is(testes.fazer('pessoa_a', format('public.tirar_modelo(%L)', testes.id('cl_c2'))), 'P0001 sem_permissao',
  'o consultor não tira o modelo');
select is(testes.fazer('gestor_b', format('public.tirar_modelo(%L)', testes.id('cl_c2'))), 'P0001 sem_permissao',
  'outra consultoria não');
select is(testes.fazer('gestor_a', format('public.tirar_modelo(%L)', testes.id('cl_c2'))), 'ok', 'a gestão tira');
select is((select (encerrado_em is not null, encerrado_por, motivo)::text from public.cliente_checklists
    where id = testes.id('cl_c2')),
  (true, testes.id('gestor_a'), 'tirado')::text, 'o check-list fica encerrado como "tirado" (vira histórico)');
select is((select (tipo, autor)::text from public.cliente_eventos where checklist_id = testes.id('cl_c2') and tipo = 'modelo_tirado'),
  ('modelo_tirado', testes.id('gestor_a'))::text, 'o histórico registra "modelo tirado"');
select is(testes.ler('pessoa_a', 'c2') -> 'checklist', 'null'::jsonb, 'o cliente fica sem check-list');
select is(testes.fazer('gestor_a', format('public.tirar_modelo(%L)', testes.id('cl_c2'))), 'P0001 checklist_encerrado',
  'tirar de novo: checklist_encerrado');
select is(testes.marcar('pessoa_a', testes.tarefa(testes.id('cl_c2'), 'Plano de ação'), 'feita') ->> 'erro',
  'P0001 checklist_encerrado', 'marcar no tirado é recusado');

-- ── Cliente movido ───────────────────────────────────────────────────────────

select testes.como('central1');
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('c_mov');
reset role;
select testes.sistema();
select is((select (encerrado_em is not null, motivo)::text from public.cliente_checklists where id = testes.id('cl_mov')),
  (true, 'cliente_movido')::text, 'mover o cliente encerra o check-list ativo na mesma transação');
select is((select jsonb_build_object('checklist', r -> 'checklist', 'aplicar', r -> 'pode_aplicar') from testes.ler('gestor_b', 'c_mov') r),
  '{"checklist": null, "aplicar": true}'::jsonb, 'a nova consultoria começa sem modelo e pode aplicar');
select is(testes.ler('gestor_a', 'c_mov'), null::jsonb, 'a antiga perde tudo');
select is(testes.contar('gestor_b', format('select id from public.cliente_checklists where cliente_id = %L', testes.id('c_mov'))),
  0, 'a nova não vê o check-list da antiga');
select is(testes.nomes(testes.chamar('gestor_b', format($$public.modelos_para_aplicar(%L, 'zqc')$$, testes.id('c_mov')))),
  array['Zqc Central para B', 'Zqc Central todas', 'Zqc Gestão B'], 'e só os modelos dela e os da Central para ela');
select is(testes.aplicar('gestor_b', testes.id('c_mov'), testes.id('m_b'), testes.hoje(), 'cl_mov_b'), 'ok',
  'a nova consultoria aplica um dos dela');
select testes.como('central1');
update public.clientes set consultoria_id = testes.id('A') where id = testes.id('c_mov');
reset role;
select testes.sistema();
select is((select array_agg(motivo order by aplicado_em, modelo_nome) from public.cliente_checklists
    where cliente_id = testes.id('c_mov')),
  array['cliente_movido', 'cliente_movido'], 'voltando, o de B também se encerra e o antigo não volta');
select is((select jsonb_build_object('checklist', r -> 'checklist', 'aplicar', r -> 'pode_aplicar') from testes.ler('gestor_a', 'c_mov') r),
  '{"checklist": null, "aplicar": true}'::jsonb, 'a consultoria começa de novo, sem modelo');
update public.consultorias set arquivada_em = now() where id = testes.id('C');
select is((select (encerrado_em is not null, motivo)::text from public.cliente_checklists where id = testes.id('cl_c')),
  (true, 'cliente_movido')::text, 'consultoria arquivada: o cliente volta à Central e o check-list se encerra');

-- ── Uso do modelo ────────────────────────────────────────────────────────────
-- m_todas tem check-list ativo em c_troca (A) e c_b (B); o de c_c (C) se encerrou.

-- "Uma consultoria nunca vê clientes de outra" vale também para a contagem: cada um conta só os que vê (revisão da
-- Task 2; o gatilho modelo_em_uso continua olhando todos para não deixar apagar).
select is(testes.chamar('gestor_a', format('public.uso_do_modelo(%L)', testes.id('m_todas'))),
  '{"clientes": 1, "nomes": ["Cliente c_troca"]}'::jsonb,
  'a gestão: conta e nomeia só os clientes da consultoria dela (o de B não entra nem no número)');
select is(testes.chamar('central1', format('public.uso_do_modelo(%L)', testes.id('m_todas'))),
  '{"clientes": 2, "nomes": ["Cliente c_b", "Cliente c_troca"]}'::jsonb, 'a Central conta e vê todos');
select is(testes.chamar('pessoa_a2', format('public.uso_do_modelo(%L)', testes.id('m_todas'))),
  '{"clientes": 1, "nomes": ["Cliente c_troca"]}'::jsonb, 'o consultor: só os clientes dele');
select is(testes.chamar('pessoa_a', format('public.uso_do_modelo(%L)', testes.id('m_todas'))),
  '{"clientes": 0, "nomes": []}'::jsonb, 'quem não atende nenhum: zero, sem nomes');
select is(testes.chamar('gestor_a', format('public.uso_do_modelo(%L)', testes.id('m_b'))), null::jsonb,
  'modelo que não vê: nulo');
select is(testes.chamar('a_senha', format('public.uso_do_modelo(%L)', testes.id('m_todas'))) ->> 'erro',
  'P0001 sem_permissao', 'sessão não liberada: sem_permissao');

-- ── "Clientes usando" na lista e nos números dos modelos ─────────────────────

select is(testes.item(testes.chamar('gestor_a', $$public.modelos_da_lista('ativos', 'zqc')$$), 'Zqc Central todas')
    -> 'clientes_usando', '1'::jsonb, 'a gestão conta só os clientes da consultoria');
select is(testes.item(testes.chamar('central1', $$public.modelos_da_lista('ativos', 'zqc')$$), 'Zqc Central todas')
    -> 'clientes_usando', '2'::jsonb, 'a Central conta todos');
select is(testes.item(testes.chamar('central1', format($$public.modelos_da_lista('ativos', 'zqc', null, %L)$$,
    testes.id('B'))), 'Zqc Central todas') -> 'clientes_usando', '1'::jsonb, 'a Central filtrada conta só os daquela consultoria');
select is(testes.item(testes.chamar('pessoa_a2', $$public.modelos_da_lista('ativos', 'zqc')$$), 'Zqc Central todas')
    -> 'clientes_usando', '1'::jsonb, 'o consultor conta os clientes dele');
select is(testes.item(testes.chamar('pessoa_a', $$public.modelos_da_lista('ativos', 'zqc')$$), 'Zqc Gestão A')
    -> 'clientes_usando', '1'::jsonb, 'só os dele (c_arq; c_aguarda não é dele)');
select is(testes.chamar('gestor_a', 'public.indicadores_de_modelos()') -> 'clientes_usando',
  to_jsonb((select count(*) from public.cliente_checklists where encerrado_em is null and consultoria_id = testes.id('A'))),
  'os números: clientes com check-list ativo na consultoria');
select is(testes.chamar('pessoa_a', 'public.indicadores_de_modelos()') -> 'clientes_usando',
  to_jsonb((select count(*) from public.cliente_checklists cl join public.clientes c on c.id = cl.cliente_id
    where cl.encerrado_em is null and c.consultor_id = testes.id('pessoa_a'))),
  'o consultor: os clientes dele');
select is(testes.chamar('central1', 'public.indicadores_de_modelos()') -> 'clientes_usando',
  to_jsonb((select count(*) from public.cliente_checklists where encerrado_em is null)), 'a Central: todos');
select is(testes.chamar('central1', format('public.indicadores_de_modelos(%L)', testes.id('B'))) -> 'clientes_usando',
  to_jsonb((select count(*) from public.cliente_checklists where encerrado_em is null and consultoria_id = testes.id('B'))),
  'a Central filtrada: os daquela consultoria');

-- ── Histórico ────────────────────────────────────────────────────────────────

select is(testes.historico('gestor_a', 'c1'),
  array['modelo_aplicado: Zqc Primeiro', 'modelo_trocado: Zqc Central todas', 'modelo_trocado: Zqc Outro A'],
  'o histórico diz o nome do modelo (mesmo o apagado) para a consultoria do check-list');
select is(testes.historico('central1', 'c1'),
  array['modelo_aplicado: Zqc Primeiro', 'modelo_trocado: Zqc Central todas', 'modelo_trocado: Zqc Outro A'],
  'e para a Central');
select is(testes.historico('pessoa_a', 'c2'), array['modelo_aplicado: Zqc Central para A', 'modelo_tirado: Zqc Central para A'],
  'o consultor também vê "tirado"');
-- Aqui todos os eventos têm a mesma hora (a da transação), então A enxerga o evento de quando o cliente estava em B: o
-- nome do modelo de B não aparece para A.
select is(testes.historico('gestor_a', 'c_mov'), array['modelo_aplicado: Zqc Gestão A', 'modelo_aplicado: —'],
  'o nome do modelo de outra consultoria nunca aparece');
select is(testes.historico('central1', 'c_mov'), array['modelo_aplicado: Zqc Gestão A', 'modelo_aplicado: Zqc Gestão B'],
  'a Central vê os dois');

-- ── Apagar o cliente ─────────────────────────────────────────────────────────

select testes.como('central1');
select throws_ok(format('delete from public.clientes where id = %L', testes.id('c_mov')), '23503', null,
  'cliente com check-list (mesmo encerrado e sem horas) não se apaga: o app pede para arquivar');
with d as (delete from public.clientes where id = testes.id('c_vazio') returning 1)
select is(count(*)::int, 1, 'cliente sem check-list continua se apagando') from d;
reset role;
select testes.sistema();

-- ── Não se aplica (acréscimo de 18/11) ───────────────────────────────────────
-- Um consultor só deste cliente (pessoa_n), para os números dele serem só os deste check-list. Início 7 dias atrás:
-- Análise do DRE venceu há 2 dias (atrasada), Mapa de custos vence em 3 (depende da Análise) e Plano de ação em 13
-- (depende das duas).

select testes.perfil('pessoa_n', 'pessoa', 'A');
select testes.cliente('c_nsa', 'A', 'pessoa_n');
select is(testes.aplicar('gestor_a', testes.id('c_nsa'), testes.id('m_a2'), testes.hoje() - 7, 'cl_nsa'), 'ok',
  'não se aplica: o check-list do cenário');
insert into testes.fx
select 'n_' || k, testes.tarefa(testes.id('cl_nsa'), t)
from (values ('analise', 'Análise do DRE'), ('mapa', 'Mapa de custos'), ('plano', 'Plano de ação')) x(k, t);

-- A tarefa como está gravada: "estado | motivo | feita_em | feita_por".
create function testes.gravada(p_tarefa uuid) returns text language sql stable as $$
  select concat_ws(' | ', estado, coalesce(motivo, '—'), coalesce(feita_em::text, '—'), coalesce(feita_por::text, '—'))
  from public.checklist_tarefas where id = p_tarefa
$$;

-- As linhas "não se aplica" do histórico do cliente, como a pessoa: "tarefa: motivo (autor)" em ordem de texto.
create function testes.historico_nsa(p_quem text, p_cliente text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform testes.como(p_quem);
  select coalesce(array_agg(x.linha order by x.linha collate "C"), '{}') into v
  from (select coalesce(h.tarefa, '—') || ': ' || coalesce(h.motivo, '—') || ' (' || coalesce(h.autor, '—') || ')' as linha
    from public.historico_do_cliente(testes.id(p_cliente), 50) h
    where h.tipo = 'tarefa_nao_se_aplica') x;
  reset role;
  perform testes.sistema();
  return v;
end $$;

-- As linhas "tarefa reaberta" do histórico do cliente, como a pessoa: "tarefa (autor)" em ordem de texto.
create function testes.historico_reaberta(p_quem text, p_cliente text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform testes.como(p_quem);
  select coalesce(array_agg(x.linha order by x.linha collate "C"), '{}') into v
  from (select coalesce(h.tarefa, '—') || ' (' || coalesce(h.autor, '—') || ')' || coalesce(' ' || h.motivo, '') as linha
    from public.historico_do_cliente(testes.id(p_cliente), 50) h
    where h.tipo = 'tarefa_reaberta') x;
  reset role;
  perform testes.sistema();
  return v;
end $$;

select hasnt_function('public', 'marcar_tarefa', array['uuid', 'text'],
  'marcar_tarefa tem só a assinatura com o motivo (a API não fica em dúvida entre duas)');

-- Recusas.
select is(testes.nsa('pessoa_n', testes.id('n_analise'), null) ->> 'erro', '22023 motivo_obrigatorio',
  'não se aplica sem motivo: motivo_obrigatorio');
select is(testes.nsa('pessoa_n', testes.id('n_analise'), '   ') ->> 'erro', '22023 motivo_obrigatorio',
  'motivo só com espaços também');
select is(testes.marcar('pessoa_n', testes.id('n_analise'), 'nao_se_aplica') ->> 'erro', '22023 motivo_obrigatorio',
  'a chamada sem o motivo (o parâmetro novo tem padrão) também');
select ok(testes.nsa('pessoa_n', testes.id('n_analise'), repeat('x', 501)) ->> 'erro' like '23514 %',
  'motivo acima de 500 letras é recusado');
select is(testes.nsa('gestor_a', testes.id('n_analise'), 'Não precisa') ->> 'erro', 'P0001 so_o_consultor_marca',
  'a gestão não marca "não se aplica"');
select is(testes.nsa('central1', testes.id('n_analise'), 'Não precisa') ->> 'erro', 'P0001 so_o_consultor_marca',
  'nem a Central');
select is(testes.nsa('pessoa_a2', testes.id('n_analise'), 'Não precisa') ->> 'erro', 'P0001 sem_permissao',
  'nem outro consultor');
select is(testes.nsa('gestor_b', testes.id('n_analise'), 'Não precisa') ->> 'erro', 'P0001 sem_permissao',
  'nem outra consultoria');
select is(testes.marcar('pessoa_n', testes.id('n_mapa'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'a bloqueada continua sem poder ser feita (o "não se aplica" dela está na cadeia, mais abaixo)');
select is(testes.gravada(testes.id('n_analise')), 'a_fazer | — | — | —', 'as recusas não mudam a tarefa');
select is(testes.chamar('pessoa_n', 'public.indicadores_de_checkins()'),
  '{"recorte": "pessoa", "clientes": 1, "com_modelo": 1, "progresso_medio": 0, "atrasadas": 1, "vencem_7_dias": 1}'::jsonb,
  'os números do consultor antes: uma atrasada e uma vencendo');
select is((testes.chamar('pessoa_n', $$public.andamento_dos_clientes(p_situacao => 'com_atraso')$$) ->> 'total')::int, 1,
  'e o cliente aparece "com atraso" no Andamento');

-- Marcar.
select is(testes.nsa('pessoa_n', testes.id('n_analise'), '  Cliente já tem o DRE auditado  ') - 'feita_em',
  jsonb_build_object('estado', 'nao_se_aplica', 'liberadas', jsonb_build_array(jsonb_build_object('id', testes.id('n_mapa'),
    'titulo', 'Mapa de custos')), 'na_sessao', false, 'tempo_segundos', 0, 'trecho_aberto_desde', null),
  'o consultor marca "não se aplica" (tarefa obrigatória e atrasada): libera a que dependia dela, fora de uma sessão');
select is(testes.gravada(testes.id('n_analise')),
  concat_ws(' | ', 'nao_se_aplica', 'Cliente já tem o DRE auditado', now()::text, testes.id('pessoa_n')::text),
  'grava o estado, o motivo (sem os espaços das pontas), quem e quando');
select is((select jsonb_build_object('tarefas', tarefas, 'feitas', feitas, 'nao_se_aplica', nao_se_aplica,
    'obrigatorias_feitas', obrigatorias_feitas, 'proximo_vencimento', proximo_vencimento)
  from public.cliente_checklists where id = testes.id('cl_nsa')),
  jsonb_build_object('tarefas', 3, 'feitas', 0, 'nao_se_aplica', 1, 'obrigatorias_feitas', 0,
    'proximo_vencimento', testes.hoje() + 3),
  'os contadores: conta à parte e o próximo vencimento ignora a que não se aplica');
select is((select jsonb_build_object('estado', t -> 'estado', 'motivo', t -> 'motivo', 'por', t -> 'feita_por')
    from testes.da_leitura(testes.ler('gestor_a', 'c_nsa'), 'Análise do DRE') t),
  '{"estado": "nao_se_aplica", "motivo": "Cliente já tem o DRE auditado", "por": {"nome": "Pessoa pessoa_n"}}'::jsonb,
  'a leitura traz o estado, o motivo e quem marcou (a gestão vê)');
select is(testes.ler('central1', 'c_nsa') -> 'resumo',
  jsonb_build_object('tarefas', 3, 'feitas', 0, 'nao_se_aplica', 1, 'resolvidas', 1, 'obrigatorias', 2,
    'obrigatorias_feitas', 0, 'vencem_7_dias', 1, 'atrasadas', 0, 'proxima', jsonb_build_object('id', testes.id('n_mapa'),
      'titulo', 'Mapa de custos', 'vence_em', testes.hoje() + 3)),
  'o resumo: resolvidas = feitas + não se aplica; a que não se aplica não é atrasada nem a próxima');
select is((select jsonb_agg(e - 'id' - 'nome' - 'posicao' order by e ->> 'posicao')
    from jsonb_array_elements(testes.ler('pessoa_n', 'c_nsa') -> 'etapas') e),
  '[{"tarefas": 2, "feitas": 0, "nao_se_aplica": 1}, {"tarefas": 1, "feitas": 0, "nao_se_aplica": 0}]'::jsonb,
  'as etapas contam as que não se aplicam');
select is(testes.chamar('pessoa_n', 'public.andamento_dos_clientes()') #> '{itens,0,checklist}',
  jsonb_build_object('id', testes.id('cl_nsa'), 'modelo_nome', 'Zqc Outro A', 'tarefas', 3, 'feitas', 0,
    'nao_se_aplica', 1, 'pct', 33, 'atrasadas', 0,
    'proxima', jsonb_build_object('titulo', 'Mapa de custos', 'vence_em', testes.hoje() + 3)),
  'o Andamento conta como resolvida (33%), sem atrasada, e a próxima é a liberada');
select is((testes.chamar('pessoa_n', $$public.andamento_dos_clientes(p_situacao => 'com_atraso')$$) ->> 'total')::int, 0,
  'e o cliente sai de "com atraso"');
select is(testes.chamar('pessoa_n', 'public.indicadores_de_checkins()'),
  '{"recorte": "pessoa", "clientes": 1, "com_modelo": 1, "progresso_medio": 33, "atrasadas": 0, "vencem_7_dias": 1}'::jsonb,
  'os números seguem a mesma regra');
select is(testes.historico_nsa('gestor_a', 'c_nsa'), array['Análise do DRE: Cliente já tem o DRE auditado (Pessoa pessoa_n)'],
  'o Histórico ganha a linha: tarefa, motivo e quem');

-- Com o check-in aberto.
select testes.checkin('pessoa_n', 'kn', 'c_nsa', now() - interval '1 hour');
select is(testes.nsa('pessoa_n', testes.id('n_mapa'), 'Sem custos fixos') - 'feita_em',
  jsonb_build_object('estado', 'nao_se_aplica', 'liberadas', jsonb_build_array(jsonb_build_object('id', testes.id('n_plano'),
    'titulo', 'Plano de ação')), 'na_sessao', true, 'tempo_segundos', 0, 'trecho_aberto_desde', null),
  'com o check-in aberto, entra na sessão e libera a seguinte');
select is((select (titulo, estado, motivo)::text from public.checkin_tarefas
    where checkin_id = testes.id('kn') and tarefa_id = testes.id('n_mapa')),
  ('Mapa de custos', 'nao_se_aplica', 'Sem custos fixos')::text, 'o check-in guarda o título, o estado e o motivo');
select is((testes.ler('pessoa_n', 'c_nsa') -> 'sessao') -> 'tarefas',
  jsonb_build_array(jsonb_build_object('tarefa_id', testes.id('n_mapa'), 'titulo', 'Mapa de custos',
    'estado', 'nao_se_aplica', 'motivo', 'Sem custos fixos')),
  'a sessão da leitura traz o estado e o motivo');
select is(testes.nsa('pessoa_n', testes.id('n_mapa'), ' Sem custos fixos ') ->> 'estado', 'nao_se_aplica',
  'marcar de novo com o mesmo motivo não muda nada (dois cliques)');
select is(testes.nsa('pessoa_n', testes.id('n_mapa'), 'Outro motivo') ->> 'erro', 'P0001 ja_nao_se_aplica',
  'com outro motivo, recusa: para trocar o motivo, reabre e marca de novo');
select is((select motivo from public.checklist_tarefas where id = testes.id('n_mapa')), 'Sem custos fixos',
  'o motivo fica o primeiro');
select is(testes.marcar('pessoa_n', testes.id('n_mapa'), 'a_fazer') -> 'na_sessao', 'false'::jsonb,
  'voltar para a fazer com o check-in aberto tira da sessão');
select is((select count(*)::int from public.checkin_tarefas where checkin_id = testes.id('kn')), 0, 'e do check-in');
select is(testes.gravada(testes.id('n_mapa')), 'a_fazer | — | — | —', 'e limpa o motivo, quem e quando');
select is(testes.marcar('pessoa_n', testes.id('n_mapa'), 'feita') -> 'na_sessao', 'true'::jsonb, 'feita entra na sessão');
select is(testes.nsa('pessoa_n', testes.id('n_mapa'), 'Sem custos fixos') -> 'na_sessao', 'true'::jsonb,
  'de feita para "não se aplica", continua na sessão');
select is((select (estado, motivo)::text from public.checkin_tarefas
    where checkin_id = testes.id('kn') and tarefa_id = testes.id('n_mapa')),
  ('nao_se_aplica', 'Sem custos fixos')::text, 'com o estado novo no check-in');
select is(testes.fazer('pessoa_n', format($$public.anotar_tarefa(%L, 'Conferi com a contabilidade')$$, testes.id('n_mapa'))),
  'ok', 'a que não se aplica também recebe nota');
select is((select (estado, motivo, nota)::text from public.checklist_tarefas where id = testes.id('n_mapa')),
  ('nao_se_aplica', 'Sem custos fixos', 'Conferi com a contabilidade')::text, 'e a nota não apaga nem troca o motivo');

-- Voltar para a fazer bloqueia de novo as que dependem dela.
select is(testes.marcar('pessoa_n', testes.id('n_analise'), 'a_fazer') - 'liberadas',
  '{"estado": "a_fazer", "feita_em": null, "na_sessao": false, "tempo_segundos": 0, "trecho_aberto_desde": null}'::jsonb, 'o consultor desfaz o "não se aplica"');
select is(testes.gravada(testes.id('n_analise')), 'a_fazer | — | — | —', 'o motivo, quem e quando saem');
select is(testes.marcar('pessoa_n', testes.id('n_plano'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'e a que dependia dela volta a ficar bloqueada');
select is((select (nao_se_aplica, proximo_vencimento)::text from public.cliente_checklists where id = testes.id('cl_nsa')),
  (1, testes.hoje() - 2)::text, 'os contadores voltam');
-- O Mapa (vence em 3 dias) continua "não se aplica" e a Análise voltou atrasada (o check-list entra na conta dos
-- prazos): a que não se aplica não vence em 7 dias, nem no resumo nem nos números.
select is((select jsonb_build_object('vencem', r -> 'vencem_7_dias', 'atrasadas', r -> 'atrasadas')
    from (select testes.ler('pessoa_n', 'c_nsa') -> 'resumo' as r) x),
  '{"vencem": 0, "atrasadas": 1}'::jsonb, 'resumo: a que não se aplica dentro dos 7 dias não conta em "vencem em 7 dias"');
select is((select jsonb_build_object('vencem', r -> 'vencem_7_dias', 'atrasadas', r -> 'atrasadas')
    from testes.chamar('pessoa_n', 'public.indicadores_de_checkins()') r),
  '{"vencem": 0, "atrasadas": 1}'::jsonb, 'números: também não conta');
select is(testes.historico_reaberta('gestor_a', 'c_nsa'),
  array['Análise do DRE (Pessoa pessoa_n)', 'Mapa de custos (Pessoa pessoa_n)'],
  'desfazer o "não se aplica" grava "tarefa reaberta" no Histórico, com quem (sem motivo)');
select testes.checkout('pessoa_n', 'kn', now());
select is(testes.marcar('pessoa_n', testes.id('n_mapa'), 'a_fazer') -> 'na_sessao', 'false'::jsonb,
  'depois do check-out, desfazer não mexe no check-in');
select is((select (titulo, estado, motivo)::text from public.checkin_tarefas where checkin_id = testes.id('kn')),
  ('Mapa de custos', 'nao_se_aplica', 'Sem custos fixos')::text, 'o check-in fechado continua com o motivo');

-- As regras das tabelas.
select throws_ok(format($$update public.checklist_tarefas set estado = 'nao_se_aplica', feita_em = now() where id = %L$$,
    testes.id('n_plano')), '23514', null, '"não se aplica" sem motivo: a tabela recusa');
select throws_ok(format($$update public.checklist_tarefas set motivo = 'Sobrou' where id = %L$$, testes.id('n_plano')),
  '23514', null, 'motivo sem "não se aplica": a tabela recusa');
select throws_ok(format($$update public.checklist_tarefas set estado = 'nao_se_aplica', motivo = '  ', feita_em = now()
    where id = %L$$, testes.id('n_plano')), '23514', null, 'motivo em branco: a tabela recusa');
select throws_ok(format($$insert into public.checkin_tarefas (checkin_id, tarefa_id, titulo, estado)
    values (%L, %L, 'Plano de ação', 'nao_se_aplica')$$, testes.id('kn'), testes.id('n_plano')),
  '23514', null, 'no check-in também: "não se aplica" pede o motivo');

-- Cliente arquivado, histórico e cliente movido.
update public.clientes set arquivado_em = now() where id = testes.id('c_nsa');
select is(testes.nsa('pessoa_n', testes.id('n_analise'), 'Não precisa') ->> 'erro', 'P0001 cliente_arquivado',
  'cliente arquivado: ninguém marca "não se aplica"');
update public.clientes set arquivado_em = null where id = testes.id('c_nsa');
select is(testes.historico_nsa('central1', 'c_nsa'),
  array['Análise do DRE: Cliente já tem o DRE auditado (Pessoa pessoa_n)', 'Mapa de custos: Sem custos fixos (Pessoa pessoa_n)',
    'Mapa de custos: Sem custos fixos (Pessoa pessoa_n)'],
  'cada "não se aplica" é uma linha no Histórico (a Central vê)');
select testes.como('central1');
update public.clientes set consultoria_id = testes.id('B'), consultor_id = null where id = testes.id('c_nsa');
reset role;
select testes.sistema();
select is(testes.historico_nsa('gestor_b', 'c_nsa'), array['—: — (—)', '—: — (—)', '—: — (—)'],
  'outra consultoria nunca vê a tarefa, o motivo nem quem marcou');
select is(testes.historico_reaberta('central1', 'c_nsa'),
  array['Análise do DRE (Pessoa pessoa_n)', 'Mapa de custos (Pessoa pessoa_n)', 'Mapa de custos (Pessoa pessoa_n)'],
  'cada "não se aplica" desfeito é uma linha "tarefa reaberta" (a Central vê)');
select is(testes.historico_reaberta('gestor_b', 'c_nsa'), array['— (—)', '— (—)', '— (—)'],
  'outra consultoria também não vê qual tarefa foi reaberta nem quem reabriu');
select is((select count(*)::int from public.cliente_eventos where tipo = 'tarefa_reaberta' and cliente_id <> testes.id('c_nsa')
    and cliente_id in (select id from testes.fx)),
  0, 'reabrir uma tarefa feita não grava "tarefa reaberta" (só desfazer o "não se aplica")');

-- ── Não se aplica numa bloqueada: a cadeia (pedido do Diego, 18/11) ──────────
-- C depende de B, B depende de A. B (bloqueada) vira "não se aplica" com A pendente: C continua esperando A. C vence
-- antes de todas (dia 1), então ela seria a próxima se B liberasse sozinha.

select testes.perfil('pessoa_k', 'pessoa', 'A');
select testes.cliente('c_cadeia', 'A', 'pessoa_k');
select testes.criar('gestor_a', 'm_cadeia', jsonb_build_object('nome', 'Zqc Cadeia', 'para', 'todas',
  'etapas', jsonb_build_array(jsonb_build_object('nome', 'Única', 'tarefas', jsonb_build_array(
    jsonb_build_object('chave', 'a', 'titulo', 'Tarefa A', 'prazo_dias', 20),
    jsonb_build_object('chave', 'b', 'titulo', 'Tarefa B', 'prazo_dias', 10, 'depende_de', jsonb_build_array('a')),
    jsonb_build_object('chave', 'c', 'titulo', 'Tarefa C', 'prazo_dias', 1, 'depende_de', jsonb_build_array('b')))))));
select is(testes.aplicar('gestor_a', testes.id('c_cadeia'), testes.id('m_cadeia'), testes.hoje(), 'cl_cadeia'), 'ok',
  'cadeia: o check-list do cenário');
insert into testes.fx
select 'ca_' || k, testes.tarefa(testes.id('cl_cadeia'), t)
from (values ('a', 'Tarefa A'), ('b', 'Tarefa B'), ('c', 'Tarefa C')) x(k, t);

select is(testes.nsa('pessoa_k', testes.id('ca_b'), 'O cliente já faz isso') - 'feita_em',
  '{"estado": "nao_se_aplica", "liberadas": [], "na_sessao": false, "tempo_segundos": 0, "trecho_aberto_desde": null}'::jsonb,
  'a bloqueada pode ser "não se aplica" (com motivo), e não libera ninguém enquanto A está pendente');
select is(testes.marcar('pessoa_k', testes.id('ca_c'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'C continua bloqueada: espera A pela cadeia');
select is(testes.marcar('pessoa_k', testes.id('ca_c'), 'andamento') ->> 'erro', 'P0001 tarefa_bloqueada',
  'nem começa');
select is(testes.ler('pessoa_k', 'c_cadeia') #>> '{resumo,proxima,titulo}', 'Tarefa A',
  'a próxima é A (C vence antes, mas não está livre)');
select is(testes.chamar('pessoa_k', 'public.andamento_dos_clientes()') #>> '{itens,0,checklist,proxima,titulo}', 'Tarefa A',
  'no Andamento também');
select is(testes.marcar('pessoa_k', testes.id('ca_a'), 'feita') -> 'liberadas',
  jsonb_build_array(jsonb_build_object('id', testes.id('ca_c'), 'titulo', 'Tarefa C')),
  'A feita libera C, através de B (não se aplica)');
select is(testes.ler('pessoa_k', 'c_cadeia') #>> '{resumo,proxima,titulo}', 'Tarefa C', 'e C vira a próxima');
select is(testes.marcar('pessoa_k', testes.id('ca_b'), 'a_fazer') ->> 'estado', 'a_fazer', 'reabrir B');
select is(testes.marcar('pessoa_k', testes.id('ca_c'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'reaberta B, C volta a ficar bloqueada');
select is(testes.nsa('pessoa_k', testes.id('ca_b'), 'O cliente já faz isso') -> 'liberadas',
  jsonb_build_array(jsonb_build_object('id', testes.id('ca_c'), 'titulo', 'Tarefa C')),
  'com A feita, B "não se aplica" libera C na hora');
select is(testes.historico_reaberta('gestor_a', 'c_cadeia'), array['Tarefa B (Pessoa pessoa_k)'],
  'reabrir B fica no Histórico');

-- ── A cadeia com mais de um elo (revisão da T8) e a pausada na cadeia ────────
-- C depende de B, B de A, A de Z. B e depois A viram "não se aplica" com Z pendente: C espera Z através dos dois. Z
-- pausada continua pendente (C espera); Z feita libera C.

select testes.cliente('c_cadeia2', 'A', 'pessoa_k');
select testes.criar('gestor_a', 'm_cadeia2', jsonb_build_object('nome', 'Zqc Cadeia longa', 'para', 'todas',
  'etapas', jsonb_build_array(jsonb_build_object('nome', 'Única', 'tarefas', jsonb_build_array(
    jsonb_build_object('chave', 'z', 'titulo', 'Tarefa Z', 'prazo_dias', 30),
    jsonb_build_object('chave', 'a', 'titulo', 'Tarefa A', 'prazo_dias', 20, 'depende_de', jsonb_build_array('z')),
    jsonb_build_object('chave', 'b', 'titulo', 'Tarefa B', 'prazo_dias', 10, 'depende_de', jsonb_build_array('a')),
    jsonb_build_object('chave', 'c', 'titulo', 'Tarefa C', 'prazo_dias', 1, 'depende_de', jsonb_build_array('b')))))));
select is(testes.aplicar('gestor_a', testes.id('c_cadeia2'), testes.id('m_cadeia2'), testes.hoje(), 'cl_cadeia2'), 'ok',
  'cadeia longa: o check-list do cenário');
insert into testes.fx
select 'cl2_' || k, testes.tarefa(testes.id('cl_cadeia2'), t)
from (values ('z', 'Tarefa Z'), ('a', 'Tarefa A'), ('b', 'Tarefa B'), ('c', 'Tarefa C')) x(k, t);

-- A próxima tarefa da linha do cliente no Andamento (o consultor tem mais de um cliente).
create function testes.proxima_no_andamento(p_quem text, p_cliente text) returns text language sql as $$
  select i #>> '{checklist,proxima,titulo}'
  from jsonb_array_elements(testes.chamar(p_quem, 'public.andamento_dos_clientes()') -> 'itens') i
  where (i #>> '{cliente,id}')::uuid = testes.id(p_cliente)
$$;

select is(testes.nsa('pessoa_k', testes.id('cl2_b'), 'Já feito antes') -> 'liberadas', '[]'::jsonb,
  'B "não se aplica" com A pendente: não libera ninguém');
select is(testes.nsa('pessoa_k', testes.id('cl2_a'), 'Também já feito') -> 'liberadas', '[]'::jsonb,
  'A também "não se aplica" (com Z pendente): C continua esperando, agora Z');
select is(testes.marcar('pessoa_k', testes.id('cl2_c'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'C espera Z através de dois elos que não se aplicam');
select is(testes.ler('pessoa_k', 'c_cadeia2') #>> '{resumo,proxima,titulo}', 'Tarefa Z', 'a próxima é Z');
select is(testes.proxima_no_andamento('pessoa_k', 'c_cadeia2'), 'Tarefa Z', 'no Andamento também');
select is(testes.marcar('pessoa_k', testes.id('cl2_z'), 'andamento') ->> 'estado', 'andamento', 'Z em andamento');
select is(testes.marcar('pessoa_k', testes.id('cl2_z'), 'pausada') ->> 'estado', 'pausada', 'Z pausada');
select is(testes.marcar('pessoa_k', testes.id('cl2_c'), 'andamento') ->> 'erro', 'P0001 tarefa_bloqueada',
  'pausada é pendente na cadeia: C continua esperando Z');
select is(testes.ler('pessoa_k', 'c_cadeia2') #>> '{resumo,proxima,titulo}', 'Tarefa Z', 'e Z pausada continua a próxima');
select is(testes.proxima_no_andamento('pessoa_k', 'c_cadeia2'), 'Tarefa Z', 'no Andamento também');
select is(testes.marcar('pessoa_k', testes.id('cl2_z'), 'feita') -> 'liberadas',
  jsonb_build_array(jsonb_build_object('id', testes.id('cl2_c'), 'titulo', 'Tarefa C')),
  'Z feita libera C, através de A e B (não se aplicam)');
select is(testes.ler('pessoa_k', 'c_cadeia2') #>> '{resumo,proxima,titulo}', 'Tarefa C', 'e C vira a próxima');
select is(testes.marcar('pessoa_k', testes.id('cl2_a'), 'a_fazer') ->> 'estado', 'a_fazer', 'reabrir A');
select is(testes.marcar('pessoa_k', testes.id('cl2_c'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'reaberta A, C volta a esperar (através de B)');

-- ── Pausada, tempo por tarefa, motivo no Editar e comentários (acréscimo de 18/11 (2)) ──
-- Um consultor só deste cliente (pessoa_p). Início 7 dias atrás: Análise do DRE venceu há 2 dias (atrasada), Mapa de
-- custos vence em 3 (depende da Análise) e Plano de ação em 13 (depende das duas).

select testes.perfil('pessoa_p', 'pessoa', 'A');
select testes.cliente('c_pausa', 'A', 'pessoa_p');
select is(testes.aplicar('gestor_a', testes.id('c_pausa'), testes.id('m_a2'), testes.hoje() - 7, 'cl_pausa'), 'ok',
  'pausada: o check-list do cenário');
insert into testes.fx
select 'p_' || k, testes.tarefa(testes.id('cl_pausa'), t)
from (values ('analise', 'Análise do DRE'), ('mapa', 'Mapa de custos'), ('plano', 'Plano de ação')) x(k, t);

-- Os trechos de tempo da tarefa: "N abertos, M fechados".
create function testes.trechos(p_tarefa uuid) returns text language sql stable as $$
  select count(*) filter (where fim is null) || ' abertos, ' || count(*) filter (where fim is not null) || ' fechados'
  from public.checklist_tarefa_tempos where tarefa_id = p_tarefa
$$;

-- Leva o começo do trecho aberto da tarefa para p_minutos antes (dentro da transação o relógio não anda).
create function testes.recuar(p_tarefa uuid, p_minutos int) returns void language sql as $$
  update public.checklist_tarefa_tempos set inicio = inicio - make_interval(mins => p_minutos)
  where tarefa_id = p_tarefa and fim is null
$$;

-- As linhas de um tipo no histórico do cliente, como a pessoa: "tarefa: motivo (autor)" em ordem de texto.
create function testes.historico_do_tipo(p_quem text, p_cliente text, p_tipo text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform testes.como(p_quem);
  select coalesce(array_agg(x.linha order by x.linha collate "C"), '{}') into v
  from (select coalesce(h.tarefa, '—') || ': ' || coalesce(h.motivo, '—') || ' (' || coalesce(h.autor, '—') || ')' as linha
    from public.historico_do_cliente(testes.id(p_cliente), 50) h
    where h.tipo = p_tipo) x;
  reset role;
  perform testes.sistema();
  return v;
end $$;

create function testes.trocar(p_quem text, p_tarefa uuid, p_motivo text) returns text language sql as $$
  select testes.fazer(p_quem, format('public.trocar_motivo(%L::uuid, %L)', p_tarefa, p_motivo))
$$;

create function testes.comentar(p_quem text, p_tarefa uuid, p_texto text) returns jsonb language sql as $$
  select testes.chamar(p_quem, format('public.comentar_tarefa(%L::uuid, %L)', p_tarefa, p_texto))
$$;

create function testes.comentarios(p_quem text, p_tarefa uuid) returns jsonb language sql as $$
  select testes.chamar(p_quem, format('public.comentarios_da_tarefa(%L::uuid)', p_tarefa))
$$;

-- Os comentários da leitura, cada um "texto: pode_editar/pode_apagar", em ordem de texto.
create function testes.permissoes(p jsonb) returns text[] language sql immutable as $$
  select array_agg((i ->> 'texto') || ': ' || (i ->> 'pode_editar') || '/' || (i ->> 'pode_apagar') order by i ->> 'texto')
  from jsonb_array_elements(p -> 'itens') i
$$;

-- Estrutura e permissões.
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.checklist_tarefa_tempos'::regclass, 'public.checklist_comentarios'::regclass)),
  'RLS ligado nos tempos e nos comentários das tarefas');
select ok((select bool_and(has_table_privilege('authenticated', t, 'select')
      and not has_table_privilege('authenticated', t, 'insert')
      and not has_table_privilege('authenticated', t, 'update')
      and not has_table_privilege('authenticated', t, 'delete')
      and not has_table_privilege('anon', t, 'select'))
    from unnest(array['public.checklist_tarefa_tempos', 'public.checklist_comentarios']) t),
  'authenticated só lê os tempos e os comentários (escrita só pelas funções do banco); anon nada');
select ok((select bool_and(has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
    from unnest(array['public.trocar_motivo(uuid, text)', 'public.comentar_tarefa(uuid, text)',
      'public.editar_comentario(uuid, text)', 'public.apagar_comentario(uuid)',
      'public.comentarios_da_tarefa(uuid, uuid, int)', 'public.historico_da_tarefa(uuid)']) f),
  'as funções novas: authenticated executa, anon não');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('trocar_motivo', 'comentar_tarefa', 'editar_comentario',
      'apagar_comentario', 'comentarios_da_tarefa', 'historico_da_tarefa')),
  'as funções novas são security definer com search_path vazio');
select ok(not has_function_privilege('authenticated', 'private.travar_para_comentar(uuid)', 'execute'),
  'travar para comentar é só das funções do banco');

-- Iniciar, pausar e retomar: o tempo da tarefa é a soma dos trechos.
select is(testes.marcar('pessoa_p', testes.id('p_analise'), 'andamento') - 'liberadas',
  jsonb_build_object('estado', 'andamento', 'feita_em', null, 'na_sessao', false, 'tempo_segundos', 0,
    'trecho_aberto_desde', now()),
  'Iniciar: em andamento, com o trecho aberto agora');
select is((select (pessoa_id, inicio, fim)::text from public.checklist_tarefa_tempos where tarefa_id = testes.id('p_analise')),
  (testes.id('pessoa_p'), now(), null::timestamptz)::text, 'o trecho guarda quem e quando');
select is(testes.marcar('pessoa_p', testes.id('p_analise'), 'andamento') ->> 'estado', 'andamento',
  'Iniciar de novo não muda nada');
select is(testes.trechos(testes.id('p_analise')), '1 abertos, 0 fechados', 'nem abre outro trecho');
select throws_ok(format($$insert into public.checklist_tarefa_tempos (tarefa_id, pessoa_id) values (%L, %L)$$,
    testes.id('p_analise'), testes.id('pessoa_p')), '23505', null, 'a tabela não deixa dois trechos abertos na tarefa');
select throws_ok(format($$update public.checklist_tarefa_tempos set fim = inicio - interval '1 minute' where tarefa_id = %L$$,
    testes.id('p_analise')), '23514', null, 'nem trecho que acaba antes de começar');
select testes.recuar(testes.id('p_analise'), 10);
select is(testes.marcar('pessoa_p', testes.id('p_analise'), 'pausada') - 'liberadas',
  '{"estado": "pausada", "feita_em": null, "na_sessao": false, "tempo_segundos": 600, "trecho_aberto_desde": null}'::jsonb,
  'Pausar fecha o trecho: 10 minutos feitos');
select is(testes.trechos(testes.id('p_analise')), '0 abertos, 1 fechados', 'o trecho fica fechado');

-- Pausada é pendente como em andamento.
select is((select jsonb_build_object('atrasadas', r -> 'atrasadas', 'resolvidas', r -> 'resolvidas',
      'proxima', r #> '{proxima,titulo}')
    from (select testes.ler('pessoa_p', 'c_pausa') -> 'resumo' as r) x),
  '{"atrasadas": 1, "resolvidas": 0, "proxima": "Análise do DRE"}'::jsonb,
  'resumo: a pausada vencida é atrasada, não resolvida, e é a próxima');
select is((select proximo_vencimento from public.cliente_checklists where id = testes.id('cl_pausa')), testes.hoje() - 2,
  'o próximo vencimento conta a pausada');
select is(testes.chamar('pessoa_p', 'public.indicadores_de_checkins()'),
  '{"recorte": "pessoa", "clientes": 1, "com_modelo": 1, "progresso_medio": 0, "atrasadas": 1, "vencem_7_dias": 1}'::jsonb,
  'os números contam a pausada atrasada');
select is((testes.chamar('pessoa_p', 'public.andamento_dos_clientes()') #> '{itens,0,checklist}') - 'id' - 'modelo_nome',
  jsonb_build_object('tarefas', 3, 'feitas', 0, 'nao_se_aplica', 0, 'pct', 0, 'atrasadas', 1,
    'proxima', jsonb_build_object('titulo', 'Análise do DRE', 'vence_em', testes.hoje() - 2)),
  'o Andamento: atrasada e a próxima');
select is((testes.chamar('pessoa_p', $$public.andamento_dos_clientes(p_situacao => 'com_atraso')$$) ->> 'total')::int, 1,
  'e o cliente fica "com atraso"');
select is(testes.chamar('pessoa_p', format('public.hoje_do_cliente(%L)', testes.id('c_pausa'))) #> '{checklist,etapas,0,atrasadas}',
  '1'::jsonb, 'a faixa Hoje do cliente conta a pausada atrasada na etapa');
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'feita') ->> 'erro', 'P0001 tarefa_bloqueada',
  'a pausada segura as que dependem dela');

-- Retomar e marcar como feita.
select is(testes.marcar('pessoa_p', testes.id('p_analise'), 'andamento') ->> 'tempo_segundos', '600',
  'Retomar abre outro trecho; o tempo continua de onde parou');
select is(testes.trechos(testes.id('p_analise')), '1 abertos, 1 fechados', 'um aberto e um fechado');
select testes.recuar(testes.id('p_analise'), 5);
select is((select jsonb_build_object('tempo', t -> 'tempo_segundos',
      'desde', (t ->> 'trecho_aberto_desde')::timestamptz = now() - interval '5 minutes', 'comentarios', t -> 'comentarios')
    from testes.da_leitura(testes.ler('gestor_a', 'c_pausa'), 'Análise do DRE') t),
  '{"tempo": 900, "desde": true, "comentarios": 0}'::jsonb,
  'a leitura soma os trechos (o aberto até agora) e diz desde quando corre (a gestão vê)');
select is(testes.marcar('pessoa_p', testes.id('p_analise'), 'feita') - 'feita_em',
  jsonb_build_object('estado', 'feita', 'na_sessao', false, 'tempo_segundos', 900, 'trecho_aberto_desde', null,
    'liberadas', jsonb_build_array(jsonb_build_object('id', testes.id('p_mapa'), 'titulo', 'Mapa de custos'))),
  'feita fecha o trecho, guarda o tempo e libera a seguinte');
select is(testes.trechos(testes.id('p_analise')), '0 abertos, 2 fechados', 'os dois trechos ficam');

-- A fazer e "não se aplica" também fecham o trecho; com o check-in aberto, a "não se aplica" entra nele.
select testes.checkin('pessoa_p', 'kp', 'c_pausa', now() - interval '1 hour');
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'andamento') ->> 'estado', 'andamento', 'Mapa em andamento');
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'a_fazer') -> 'trecho_aberto_desde', 'null'::jsonb,
  'voltar para a fazer fecha o trecho');
select is(testes.trechos(testes.id('p_mapa')), '0 abertos, 1 fechados', 'o trecho fechado fica');
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'andamento') ->> 'estado', 'andamento', 'Mapa em andamento de novo');
select is(testes.nsa('pessoa_p', testes.id('p_mapa'), 'Sem custos') -> 'na_sessao', 'true'::jsonb,
  '"não se aplica" com o check-in aberto entra na sessão');
select is(testes.trechos(testes.id('p_mapa')), '0 abertos, 2 fechados', 'e fecha o trecho');

-- Trocar o motivo (no Editar).
select is(testes.trocar('pessoa_p', testes.id('p_plano'), 'Outro'), 'P0001 so_em_nao_se_aplica',
  'trocar o motivo só numa tarefa que não se aplica');
select is(testes.trocar('pessoa_p', testes.id('p_mapa'), '   '), '22023 motivo_obrigatorio', 'motivo em branco: recusa');
select ok(testes.trocar('pessoa_p', testes.id('p_mapa'), repeat('x', 501)) like '23514 %', 'motivo acima de 500: recusa');
select is(testes.trocar('gestor_a', testes.id('p_mapa'), 'Outro'), 'P0001 so_o_consultor_marca', 'a gestão não troca');
select is(testes.trocar('central1', testes.id('p_mapa'), 'Outro'), 'P0001 so_o_consultor_marca', 'nem a Central');
select is(testes.trocar('pessoa_a2', testes.id('p_mapa'), 'Outro'), 'P0001 sem_permissao', 'nem outro consultor');
select is(testes.trocar('gestor_b', testes.id('p_mapa'), 'Outro'), 'P0001 sem_permissao', 'nem outra consultoria');
select is(testes.gravada(testes.id('p_mapa')),
  concat_ws(' | ', 'nao_se_aplica', 'Sem custos', now()::text, testes.id('pessoa_p')::text), 'as recusas não mudam nada');
select is(testes.trocar('pessoa_p', testes.id('p_mapa'), '  O cliente não tem custos fixos  '), 'ok', 'o consultor troca');
select is(testes.gravada(testes.id('p_mapa')),
  concat_ws(' | ', 'nao_se_aplica', 'O cliente não tem custos fixos', now()::text, testes.id('pessoa_p')::text),
  'o motivo novo (sem os espaços das pontas); o estado, quem e quando ficam');
select is((select motivo from public.checkin_tarefas where checkin_id = testes.id('kp') and tarefa_id = testes.id('p_mapa')),
  'O cliente não tem custos fixos', 'o check-in aberto leva o motivo novo');
select is(testes.historico_do_tipo('gestor_a', 'c_pausa', 'motivo_trocado'),
  array['Mapa de custos: O cliente não tem custos fixos (Pessoa pessoa_p)'], 'o Histórico ganha "Motivo trocado"');
select is(testes.trocar('pessoa_p', testes.id('p_mapa'), 'O cliente não tem custos fixos'), 'ok',
  'trocar pelo mesmo motivo não muda nada');
select is(cardinality(testes.historico_do_tipo('gestor_a', 'c_pausa', 'motivo_trocado')), 1, 'nem grava outra linha');
select testes.checkout('pessoa_p', 'kp', now());
select is(testes.trocar('pessoa_p', testes.id('p_mapa'), 'Terceiro motivo'), 'ok', 'depois do check-out, troca de novo');
select is((select motivo from public.checkin_tarefas where checkin_id = testes.id('kp') and tarefa_id = testes.id('p_mapa')),
  'O cliente não tem custos fixos', 'o check-in fechado guarda o motivo de então');

-- "Tarefa reaberta" só quando volta para a fazer.
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'feita') ->> 'estado', 'feita', 'de não se aplica para feita');
select is(testes.nsa('pessoa_p', testes.id('p_mapa'), 'De novo') ->> 'estado', 'nao_se_aplica', 'e de volta');
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'andamento') ->> 'estado', 'andamento',
  'de não se aplica para em andamento');
select is(cardinality(testes.historico_do_tipo('gestor_a', 'c_pausa', 'tarefa_reaberta')), 0,
  'sair de "não se aplica" para feita ou em andamento não grava "tarefa reaberta"');
select is(testes.nsa('pessoa_p', testes.id('p_mapa'), 'Outra vez') ->> 'estado', 'nao_se_aplica', 'não se aplica outra vez');
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'a_fazer') ->> 'estado', 'a_fazer', 'e para a fazer');
select is(testes.historico_do_tipo('gestor_a', 'c_pausa', 'tarefa_reaberta'), array['Mapa de custos: — (Pessoa pessoa_p)'],
  'voltar para a fazer grava "tarefa reaberta"');

-- O histórico curto da tarefa (o Editar).
select is((select jsonb_build_object(
      'tipos', (select jsonb_agg(e ->> 'tipo' order by e ->> 'tipo') from jsonb_array_elements(h -> 'eventos') e),
      'motivos', (select jsonb_agg(e ->> 'motivo' order by e ->> 'motivo') from jsonb_array_elements(h -> 'eventos') e
        where e ->> 'motivo' is not null),
      'autores', (select jsonb_agg(distinct e ->> 'autor') from jsonb_array_elements(h -> 'eventos') e),
      'trechos', jsonb_array_length(h -> 'trechos'),
      'pessoa', h #> '{trechos,0,pessoa}', 'tempo', h -> 'tempo_segundos')
    from testes.chamar('pessoa_p', format('public.historico_da_tarefa(%L)', testes.id('p_mapa'))) h),
  jsonb_build_object(
    'tipos', jsonb_build_array('motivo_trocado', 'motivo_trocado', 'tarefa_nao_se_aplica', 'tarefa_nao_se_aplica',
      'tarefa_nao_se_aplica', 'tarefa_reaberta'),
    'motivos', jsonb_build_array('De novo', 'O cliente não tem custos fixos', 'Outra vez', 'Sem custos', 'Terceiro motivo'),
    'autores', jsonb_build_array('Pessoa pessoa_p'), 'trechos', 3, 'pessoa', 'Pessoa pessoa_p', 'tempo', 0),
  'o histórico da tarefa: as linhas dela no Histórico, os trechos de tempo e o total');
select is(testes.chamar('central1', format('public.historico_da_tarefa(%L)', testes.id('p_mapa'))) -> 'tempo_segundos',
  '0'::jsonb, 'a Central também lê');
select is(testes.chamar('pessoa_p', format('public.historico_da_tarefa(%L)', testes.id('p_plano'))),
  '{"eventos": [], "trechos": [], "tempo_segundos": 0}'::jsonb, 'tarefa sem histórico: listas vazias');
select is(testes.chamar('gestor_b', format('public.historico_da_tarefa(%L)', testes.id('p_mapa'))), null,
  'outra consultoria não lê');
select is(testes.chamar('pessoa_a2', format('public.historico_da_tarefa(%L)', testes.id('p_mapa'))), null,
  'nem outro consultor');
do $$
begin
  for i in 1..3 loop
    perform testes.nsa('pessoa_p', testes.id('p_mapa'), 'Volta ' || i);
    perform testes.marcar('pessoa_p', testes.id('p_mapa'), 'a_fazer');
  end loop;
end $$;
select is(jsonb_array_length(testes.chamar('pessoa_p', format('public.historico_da_tarefa(%L)', testes.id('p_mapa'))) -> 'eventos'),
  10, 'só as últimas 10 linhas');

-- Pausar uma em andamento pode sempre; começar ou pausar a que espera, não.
select is(testes.marcar('pessoa_p', testes.id('p_mapa'), 'feita') ->> 'estado', 'feita', 'Mapa feita');
select is(testes.marcar('pessoa_p', testes.id('p_plano'), 'andamento') ->> 'estado', 'andamento', 'Plano em andamento');
select is(testes.marcar('pessoa_p', testes.id('p_analise'), 'a_fazer') ->> 'estado', 'a_fazer',
  'a Análise é reaberta (o Plano fica em andamento esperando)');
select is(testes.marcar('pessoa_p', testes.id('p_plano'), 'pausada') ->> 'estado', 'pausada',
  'pausar a em andamento pode, mesmo esperando uma dependência');
select is(testes.marcar('pessoa_p', testes.id('p_plano'), 'andamento') ->> 'erro', 'P0001 tarefa_bloqueada',
  'retomar, não');
select is(testes.marcar('pessoa_p', testes.id('p_plano'), 'a_fazer') ->> 'estado', 'a_fazer', 'o Plano volta para a fazer');
select is(testes.marcar('pessoa_p', testes.id('p_plano'), 'pausada') ->> 'erro', 'P0001 tarefa_bloqueada',
  'e de a fazer para pausada pede as dependências, como Iniciar');
select is(testes.marcar('gestor_a', testes.id('p_analise'), 'pausada') ->> 'erro', 'P0001 so_o_consultor_marca',
  'só o consultor pausa');
select throws_ok(format($$update public.checklist_tarefas set estado = 'pausada', feita_em = now() where id = %L$$,
    testes.id('p_plano')), '23514', null, 'pausada não tem quem fechou nem quando: a tabela recusa');

-- Comentários: o consultor do cliente e a gestão comentam; a Central e o dono só leem.
select is((select r - 'id' - 'criado_em' - 'autor' || jsonb_build_object('autor', r #> '{autor,nome}')
    from testes.comentar('pessoa_p', testes.id('p_plano'), '  Falei com o contador  ') r),
  '{"texto": "Falei com o contador", "editado_em": null, "pode_editar": true, "pode_apagar": true, "autor": "Pessoa pessoa_p"}'::jsonb,
  'o consultor comenta (sem os espaços das pontas)');
select is(testes.comentar('gestor_a', testes.id('p_plano'), 'Combine a data') ->> 'texto', 'Combine a data', 'o gestor comenta');
select is(testes.comentar('admin_a', testes.id('p_plano'), 'Anotado') ->> 'texto', 'Anotado', 'o administrador comenta');
select is(testes.comentar('central1', testes.id('p_plano'), 'Oi') ->> 'erro', 'P0001 sem_permissao', 'a Central não comenta');
select is(testes.comentar('pessoa_a2', testes.id('p_plano'), 'Oi') ->> 'erro', 'P0001 sem_permissao',
  'nem outro consultor');
select is(testes.comentar('gestor_b', testes.id('p_plano'), 'Oi') ->> 'erro', 'P0001 sem_permissao', 'nem outra consultoria');
select is(testes.comentar('pessoa_p', testes.id('p_plano'), '   ') ->> 'erro', '22023 comentario_vazio',
  'comentário em branco: recusa');
select ok(testes.comentar('pessoa_p', testes.id('p_plano'), repeat('x', 2001)) ->> 'erro' like '23514 %',
  'comentário acima de 2.000 letras: recusa');
insert into testes.fx
select case autor_id when testes.id('pessoa_p') then 'com_p' when testes.id('gestor_a') then 'com_g' else 'com_adm' end, id
from public.checklist_comentarios where tarefa_id = testes.id('p_plano');

select is((select jsonb_build_object('pode', r -> 'pode_comentar', 'mais', r -> 'ha_mais',
      'itens', testes.permissoes(r), 'autor', (select i #> '{autor,nome}' from jsonb_array_elements(r -> 'itens') i
        where i ->> 'texto' = 'Combine a data'))
    from testes.comentarios('pessoa_p', testes.id('p_plano')) r),
  '{"pode": true, "mais": false, "itens": ["Anotado: false/false", "Combine a data: false/false", "Falei com o contador: true/true"],
    "autor": "Pessoa gestor_a"}'::jsonb,
  'o consultor lê os três; edita e apaga só o dele');
select is(testes.permissoes(testes.comentarios('gestor_a', testes.id('p_plano'))),
  array['Anotado: false/true', 'Combine a data: true/true', 'Falei com o contador: false/true'],
  'a gestão edita o dela e apaga qualquer um');
select is((select jsonb_build_object('pode', r -> 'pode_comentar', 'itens', testes.permissoes(r))
    from testes.comentarios('central1', testes.id('p_plano')) r),
  '{"pode": false, "itens": ["Anotado: false/false", "Combine a data: false/false", "Falei com o contador: false/false"]}'::jsonb,
  'a Central só lê');
select is(testes.comentarios('gestor_b', testes.id('p_plano')), null, 'outra consultoria não lê');
select is(testes.comentarios('pessoa_a2', testes.id('p_plano')), null, 'nem outro consultor');
select is(array[testes.contar('central1', format('select 1 from public.checklist_comentarios where tarefa_id = %L', testes.id('p_plano'))),
    testes.contar('pessoa_p', format('select 1 from public.checklist_comentarios where tarefa_id = %L', testes.id('p_plano'))),
    testes.contar('gestor_b', format('select 1 from public.checklist_comentarios where tarefa_id = %L', testes.id('p_plano'))),
    testes.contar('pessoa_a2', format('select 1 from public.checklist_comentarios where tarefa_id = %L', testes.id('p_plano'))),
    testes.contar('gestor_b', format('select 1 from public.checklist_tarefa_tempos where tarefa_id = %L', testes.id('p_analise'))),
    testes.contar('central1', format('select 1 from public.checklist_tarefa_tempos where tarefa_id = %L', testes.id('p_analise')))],
  array[3, 3, 0, 0, 0, 2], 'pela API, os comentários e os tempos seguem quem vê o check-list');
select is((select jsonb_build_object('n', jsonb_array_length(r -> 'itens'), 'mais', r -> 'ha_mais',
      'resto', jsonb_array_length(testes.chamar('pessoa_p', format('public.comentarios_da_tarefa(%L, %L)', testes.id('p_plano'),
        r #>> '{itens,1,id}')) -> 'itens'))
    from testes.chamar('pessoa_p', format('public.comentarios_da_tarefa(%L, null, 2)', testes.id('p_plano'))) r),
  '{"n": 2, "mais": true, "resto": 1}'::jsonb, 'de 2 em 2: "ver anteriores" traz o que falta');
select is((select jsonb_build_object('comentarios', t -> 'comentarios', 'pode', l -> 'pode_comentar')
    from (select testes.ler('pessoa_p', 'c_pausa') as l) x, testes.da_leitura(x.l, 'Plano de ação') t),
  '{"comentarios": 3, "pode": true}'::jsonb, 'a leitura do check-list traz quantos comentários e se dá para comentar');
select is(array[testes.ler('gestor_a', 'c_pausa') -> 'pode_comentar', testes.ler('central1', 'c_pausa') -> 'pode_comentar'],
  array['true'::jsonb, 'false'::jsonb], 'a gestão comenta; a Central, não');

-- Editar e apagar.
select is((select jsonb_build_object('texto', r -> 'texto', 'editado', r -> 'editado_em' = to_jsonb(now()))
    from testes.chamar('pessoa_p', format($$public.editar_comentario(%L, ' Falei com o contador ontem ')$$, testes.id('com_p'))) r),
  '{"texto": "Falei com o contador ontem", "editado": true}'::jsonb, 'o autor edita o dele (fica "editado")');
select is(testes.fazer('gestor_a', format($$public.editar_comentario(%L, 'Mudei')$$, testes.id('com_p'))), 'P0001 sem_permissao',
  'a gestão não edita o dos outros');
select is(testes.fazer('pessoa_p', format($$public.editar_comentario(%L, 'Mudei')$$, testes.id('com_g'))), 'P0001 sem_permissao',
  'nem o consultor');
select is(testes.fazer('pessoa_p', format($$public.editar_comentario(%L, '  ')$$, testes.id('com_p'))), '22023 comentario_vazio',
  'editar para em branco: recusa');
select is(testes.fazer('pessoa_p', format($$public.editar_comentario(%L, 'Mudei')$$, gen_random_uuid())),
  'P0001 comentario_nao_encontrado', 'comentário que não existe (ou foi apagado)');
select is(testes.fazer('pessoa_p', format('public.apagar_comentario(%L)', testes.id('com_g'))), 'P0001 sem_permissao',
  'o consultor não apaga o da gestão');
select is(testes.fazer('central1', format('public.apagar_comentario(%L)', testes.id('com_p'))), 'P0001 sem_permissao',
  'nem a Central apaga');
select is(testes.fazer('gestor_a', format('public.apagar_comentario(%L)', testes.id('com_p'))), 'ok',
  'a gestão apaga o do consultor');
select is(testes.fazer('admin_a', format('public.apagar_comentario(%L)', testes.id('com_adm'))), 'ok', 'cada um apaga o seu');
select is(testes.fazer('pessoa_p', format('public.apagar_comentario(%L)', testes.id('com_p'))),
  'P0001 comentario_nao_encontrado', 'apagar de novo: não existe mais');
select is((select array_agg(texto) from public.checklist_comentarios where tarefa_id = testes.id('p_plano')),
  array['Combine a data'], 'fica só o do gestor');
select testes.como('pessoa_p');
select throws_ok(format($$insert into public.checklist_comentarios (tarefa_id, autor_id, texto) values (%L, %L, 'Direto')$$,
    testes.id('p_plano'), testes.id('pessoa_p')), '42501', null, 'escrever direto na tabela de comentários é recusado');
reset role;
select testes.sistema();

-- Cliente arquivado: tudo só para ler.
update public.clientes set arquivado_em = now() where id = testes.id('c_pausa');
select is(array[testes.comentar('pessoa_p', testes.id('p_plano'), 'Oi') ->> 'erro',
    testes.fazer('gestor_a', format($$public.editar_comentario(%L, 'Mudei')$$, testes.id('com_g'))),
    testes.fazer('gestor_a', format('public.apagar_comentario(%L)', testes.id('com_g'))),
    testes.marcar('pessoa_p', testes.id('p_analise'), 'andamento') ->> 'erro',
    testes.trocar('pessoa_p', testes.id('p_analise'), 'Outro')],
  array['P0001 cliente_arquivado', 'P0001 cliente_arquivado', 'P0001 cliente_arquivado', 'P0001 cliente_arquivado',
    'P0001 cliente_arquivado'],
  'cliente arquivado: ninguém comenta, edita, apaga, inicia nem troca o motivo');
select is(testes.comentarios('gestor_a', testes.id('p_plano')) -> 'pode_comentar', 'false'::jsonb,
  'e a leitura diz que não dá para comentar');
update public.clientes set arquivado_em = null where id = testes.id('c_pausa');

-- Cliente movido: a consultoria nova não vê os comentários, o tempo, o histórico da tarefa nem o motivo trocado.
select testes.como('central1');
update public.clientes set consultoria_id = testes.id('B'), consultor_id = null where id = testes.id('c_pausa');
reset role;
select testes.sistema();
select is(array[testes.comentarios('gestor_b', testes.id('p_plano')),
    testes.chamar('gestor_b', format('public.historico_da_tarefa(%L)', testes.id('p_mapa')))],
  array[null::jsonb, null], 'a consultoria nova não lê os comentários nem o histórico da tarefa');
select is(testes.contar('gestor_b', format('select 1 from public.checklist_comentarios where tarefa_id = %L', testes.id('p_plano'))),
  0, 'nem pela API');
select is(testes.historico_do_tipo('gestor_b', 'c_pausa', 'motivo_trocado'), array['—: — (—)', '—: — (—)'],
  'e o Histórico não diz a tarefa, o motivo nem quem trocou');
select is(testes.comentar('gestor_a', testes.id('p_plano'), 'Oi') ->> 'erro', 'P0001 sem_permissao',
  'a consultoria antiga não comenta mais');

-- ── Nenhuma seta para a frente ───────────────────────────────────────────────

select is((select count(*)::int from public.checklist_dependencias d
    join public.checklist_tarefas t on t.id = d.tarefa_id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    where dt.posicao >= t.posicao or dt.checklist_id <> t.checklist_id or d.checklist_id <> t.checklist_id), 0,
  'toda dependência copiada aponta para tarefa anterior do mesmo check-list');

select * from finish();
rollback;
