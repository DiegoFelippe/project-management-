-- Modelos de check-in (desenho em docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md, "Quem faz o quê" e
-- "Como funciona"; plano em docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 1): quem cria, edita,
-- arquiva, reativa e apaga cada modelo; quem vê o quê (uma consultoria nunca vê os modelos de outra nem os da Central só
-- para outra); as recusas de salvar_modelo (e o modelo intacto depois de um erro); regravar acerta posições e
-- contadores; a lista (15 por página, busca sem acento, tipo, Arquivados, consultoria da Central), os números e as
-- permissões da API. Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(156);

-- Ajudantes só do teste (somem no rollback do fim).
create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select, insert on testes.fx to authenticated, anon;
create table testes.retratos (nome text primary key, r jsonb not null);

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria Modelos ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@modelos.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@modelos.test', p_papel);
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

-- Chama como a pessoa e volta a ser o dono do banco (para comparar com consultas diretas).
create function testes.ver(p_quem text, p_chamada text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform testes.como(p_quem);
  execute 'select to_jsonb(' || p_chamada || ')' into v;
  reset role;
  perform testes.sistema();
  return v;
end $$;

-- O modelo padrão: "Diagnóstico" (Análise do DRE, dia 5, obrigatória; Mapa de custos, dia 10, opcional, depende da
-- Análise) e "Plano" (Plano de ação, dia 20, obrigatória, depende das duas): 2 etapas, 3 tarefas, 2 obrigatórias, maior
-- prazo 20, 3 dependências.
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

-- Um modelo com as etapas dadas (para as recusas).
create function testes.com_etapas(p_etapas jsonb, p_nome text default 'Zqx Recusado') returns jsonb language sql as $$
  select jsonb_build_object('nome', p_nome, 'para', 'todas', 'etapas', p_etapas)
$$;

-- Um modelo de uma etapa com uma tarefa só.
create function testes.uma_tarefa(p_tarefa jsonb) returns jsonb language sql as $$
  select testes.com_etapas(jsonb_build_array(jsonb_build_object('nome', 'E', 'tarefas', jsonb_build_array(p_tarefa))))
$$;

-- Cria como a pessoa e guarda o id com a chave.
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

-- Salva como a pessoa logada agora: 'ok' ou o código e a mensagem do erro. O erro desfaz só esta chamada, como uma
-- chamada da API.
create function testes.salvar(p_id uuid, p_dados jsonb) returns text language plpgsql as $$
begin
  perform public.salvar_modelo(p_id, p_dados);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- Escrita direta pela API, como a pessoa logada agora: quantas linhas a regra deixou mudar.
create function testes.arquivar(p_modelo uuid, p_quando timestamptz) returns int language plpgsql as $$
declare v int;
begin
  update public.modelos set arquivado_em = p_quando where id = p_modelo;
  get diagnostics v = row_count;
  return v;
end $$;

create function testes.apagar(p_modelo uuid) returns int language plpgsql as $$
declare v int;
begin
  delete from public.modelos where id = p_modelo;
  get diagnostics v = row_count;
  return v;
end $$;

-- O modelo inteiro, lido direto das tabelas (como o dono do banco), para comparar antes e depois.
create function testes.retrato(p_modelo uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'modelo', to_jsonb(m),
    'etapas', (select jsonb_agg(to_jsonb(e) order by e.posicao) from public.modelo_etapas e where e.modelo_id = m.id),
    'tarefas', (select jsonb_agg(to_jsonb(t) order by t.posicao) from public.modelo_tarefas t where t.modelo_id = m.id),
    'dependencias', (select jsonb_agg(to_jsonb(d) order by d.tarefa_id, d.depende_de)
      from public.modelo_dependencias d join public.modelo_tarefas t on t.id = d.tarefa_id where t.modelo_id = m.id))
  from public.modelos m where m.id = p_modelo
$$;

-- Os nomes (em ordem) de uma página da lista.
create function testes.nomes(p jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(i ->> 'nome' order by o), '{}') from jsonb_array_elements(p -> 'itens') with ordinality x(i, o)
$$;

-- O item da lista com aquele nome.
create function testes.item(p jsonb, p_nome text) returns jsonb language sql immutable as $$
  select i from jsonb_array_elements(p -> 'itens') i where i ->> 'nome' = p_nome
$$;

-- As tarefas do modelo em ordem: "posição da etapa.posição: título (prazo, obrigatória)".
create function testes.tarefas(p_modelo uuid) returns text[] language sql stable as $$
  select array_agg(e.posicao || '.' || t.posicao || ': ' || t.titulo || ' (' || t.prazo_dias || ', '
    || case when t.obrigatoria then 'obrig' else 'opc' end || ')' order by t.posicao)
  from public.modelo_tarefas t join public.modelo_etapas e on e.id = t.etapa_id
  where t.modelo_id = p_modelo
$$;

-- As dependências do modelo: "título -> título de que depende", em ordem.
create function testes.dependencias(p_modelo uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(t.titulo || ' -> ' || d2.titulo order by t.posicao, d2.posicao), '{}')
  from public.modelo_dependencias d
  join public.modelo_tarefas t on t.id = d.tarefa_id
  join public.modelo_tarefas d2 on d2.id = d.depende_de
  where t.modelo_id = p_modelo
$$;

-- Os números esperados, contados direto nas tabelas (o recorte de quem vê a consultoria p_consultoria; nula = todos).
create function testes.numeros_esperados(p_recorte text, p_consultoria uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'recorte', p_recorte,
    'ativos', count(*),
    'da_central', count(*) filter (where m.da_central),
    'da_consultoria', count(*) filter (where not m.da_central),
    'clientes_usando', 0)
  from public.modelos m
  where m.arquivado_em is null
    and (p_consultoria is null or m.consultoria_id = p_consultoria or m.consultoria_id is null)
$$;

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: administrador, gestor, consultor e um administrador que ainda precisa trocar a senha (sessão não
-- liberada). Consultoria B: gestor. Uma consultoria arquivada (Arq).
select testes.consultoria('A');
select testes.consultoria('B');
select testes.consultoria('Arq');
select testes.perfil('central1', 'central', null);
select testes.perfil('dono1', 'dono', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('a_senha', 'admin', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
update public.perfis set precisa_trocar_senha = true where id = testes.id('a_senha');
update public.consultorias set arquivada_em = now() where id = testes.id('Arq');

select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.modelos'::regclass, 'public.modelo_etapas'::regclass, 'public.modelo_tarefas'::regclass,
    'public.modelo_dependencias'::regclass)),
  'RLS ligado nas quatro tabelas dos modelos');

-- ── Criar ────────────────────────────────────────────────────────────────────

select testes.criar('central1', 'm_ct', testes.dados('Zqx Central todas', 'todas', 'gestao'));
select testes.criar('central1', 'm_ca', testes.dados('Zqx Central para A', testes.id('A')::text));
select testes.criar('central1', 'm_cb', testes.dados('Zqx Central para B', testes.id('B')::text));
select testes.criar('gestor_a', 'm_ga', testes.dados('Zqx Gestão A', 'todas'));
select testes.criar('admin_a', 'm_aa', testes.dados('Zqx Administrador A', testes.id('B')::text));
select testes.criar('gestor_b', 'm_gb', testes.dados('Zqx Gestão B'));
select testes.criar('dono1', 'm_dono', testes.dados('Zqx Dono'));

select is((select jsonb_build_object('da_central', da_central, 'consultoria', consultoria_id, 'criado_por', criado_por,
    'tipo', tipo, 'etapas', etapas, 'tarefas', tarefas, 'obrigatorias', obrigatorias, 'maior_prazo', maior_prazo,
    'descricao', descricao, 'arquivado_em', arquivado_em)
  from public.modelos where id = testes.id('m_ct')),
  jsonb_build_object('da_central', true, 'consultoria', null, 'criado_por', testes.id('central1'), 'tipo', 'gestao',
    'etapas', 2, 'tarefas', 3, 'obrigatorias', 2, 'maior_prazo', 20, 'descricao', 'Descrição de Zqx Central todas',
    'arquivado_em', null),
  'a Central cria para todas as consultorias: da Central, sem consultoria, com os contadores');
select is((select (da_central, consultoria_id)::text from public.modelos where id = testes.id('m_ca')),
  (true, testes.id('A'))::text, 'a Central cria para uma consultoria');
select is((select (da_central, consultoria_id)::text from public.modelos where id = testes.id('m_cb')),
  (true, testes.id('B'))::text, 'a Central cria para outra consultoria');
select is((select (da_central, consultoria_id, criado_por)::text from public.modelos where id = testes.id('m_ga')),
  (false, testes.id('A'), testes.id('gestor_a'))::text,
  'o gestor cria pedindo "todas" e o banco grava a consultoria dele (não é da Central)');
select is((select (da_central, consultoria_id)::text from public.modelos where id = testes.id('m_aa')),
  (false, testes.id('A'))::text,
  'o administrador cria pedindo outra consultoria e o banco grava a dele');
select is((select (da_central, consultoria_id)::text from public.modelos where id = testes.id('m_gb')),
  (false, testes.id('B'))::text, 'o gestor de B cria para B');
select is((select (da_central, consultoria_id)::text from public.modelos where id = testes.id('m_dono')),
  (true, null::uuid)::text, 'o dono também cria (é da Central)');

select testes.como('pessoa_a');
select is(testes.salvar(null, testes.dados('Zqx Recusado')), 'P0001 sem_permissao', 'o consultor não cria modelo');
reset role;
select testes.como('a_senha');
select is(testes.salvar(null, testes.dados('Zqx Recusado')), 'P0001 sem_permissao',
  'sessão que não está liberada (senha provisória) não cria modelo');
reset role;
select testes.como('central1');
select is(testes.salvar(null, testes.dados('Zqx Recusado') - 'para'), 'P0001 consultoria_invalida',
  'a Central precisa dizer para quem é o modelo');
select is(testes.salvar(null, testes.dados('Zqx Recusado', 'qualquer')), 'P0001 consultoria_invalida',
  'para quem: "todas" ou o id de uma consultoria');
select is(testes.salvar(null, testes.dados('Zqx Recusado', gen_random_uuid()::text)), 'P0001 consultoria_invalida',
  'consultoria que não existe');
select is(testes.salvar(null, testes.dados('Zqx Recusado', testes.id('Arq')::text)), 'P0001 consultoria_invalida',
  'consultoria arquivada não recebe modelo novo');
reset role;
select testes.sistema();
select is((select count(*)::int from public.modelos where nome like 'Zqx Recusado%'), 0,
  'nenhuma tentativa recusada deixou modelo para trás');

select is(testes.tarefas(testes.id('m_ct')),
  array['1.1: Análise do DRE (5, obrig)', '1.2: Mapa de custos (10, opc)', '2.3: Plano de ação (20, obrig)'],
  'etapas e tarefas em ordem: a posição da tarefa é a do modelo inteiro, seguindo as etapas');
select is((select array_agg(nome order by posicao) from public.modelo_etapas where modelo_id = testes.id('m_ct')),
  array['Diagnóstico', 'Plano'], 'as etapas na ordem em que vieram');
select is(testes.dependencias(testes.id('m_ct')),
  array['Mapa de custos -> Análise do DRE', 'Plano de ação -> Análise do DRE', 'Plano de ação -> Mapa de custos'],
  'as dependências apontam para as tarefas certas');

-- ── Editar ───────────────────────────────────────────────────────────────────

select testes.como('gestor_a');
select is(testes.salvar(testes.id('m_ga'), testes.dados('Zqx Gestão A editado')), 'ok', 'o gestor edita o modelo dele');
select is(testes.salvar(testes.id('m_ct'), testes.dados('Zqx Mexido')), 'P0001 sem_permissao',
  'o gestor não edita modelo da Central para todas');
select is(testes.salvar(testes.id('m_ca'), testes.dados('Zqx Mexido')), 'P0001 sem_permissao',
  'o gestor não edita modelo da Central para a consultoria dele');
select is(testes.salvar(testes.id('m_gb'), testes.dados('Zqx Mexido')), 'P0001 sem_permissao',
  'o gestor não edita modelo de outra consultoria');
select is(testes.salvar(gen_random_uuid(), testes.dados('Zqx Mexido')), 'P0001 sem_permissao',
  'modelo que não existe: sem_permissao (nada diz se existe)');
reset role;
select testes.sistema();
select is((select nome from public.modelos where id = testes.id('m_ga')), 'Zqx Gestão A editado',
  'a edição do gestor ficou gravada');
select testes.como('admin_a');
select is(testes.salvar(testes.id('m_ga'), testes.dados('Zqx Gestão A')), 'ok',
  'o administrador edita o modelo de outra pessoa da consultoria');
reset role;
select testes.como('pessoa_a');
select is(testes.salvar(testes.id('m_ga'), testes.dados('Zqx Mexido')), 'P0001 sem_permissao',
  'o consultor não edita modelo');
reset role;
select testes.como('gestor_b');
select is(testes.salvar(testes.id('m_ga'), testes.dados('Zqx Mexido')), 'P0001 sem_permissao',
  'a gestão de B não edita modelo de A');
reset role;
select testes.como('central1');
select is(testes.salvar(testes.id('m_ga'), testes.dados('Zqx Gestão A', testes.id('A')::text)), 'ok',
  'a Central edita o modelo de uma consultoria');
select is(testes.salvar(testes.id('m_ga'), testes.dados('Zqx Mexido', 'todas')), 'P0001 consultoria_invalida',
  'modelo da consultoria continua dela: a Central não o muda para todas');
select is(testes.salvar(testes.id('m_ca'), testes.dados('Zqx Central para A', 'todas')), 'ok',
  'a Central muda o modelo dela de uma consultoria para todas');
reset role;
select testes.sistema();
select is((select (da_central, consultoria_id)::text from public.modelos where id = testes.id('m_ga')),
  (false, testes.id('A'))::text, 'editado pela Central, o modelo da consultoria continua dela');
select is((select consultoria_id from public.modelos where id = testes.id('m_ca')), null, 'agora é para todas');
select testes.como('central1');
select is(testes.salvar(testes.id('m_ca'), testes.dados('Zqx Central para A', testes.id('A')::text)), 'ok',
  'e volta a ser só para A');
reset role;
select testes.como('dono1');
select is(testes.salvar(testes.id('m_gb'), testes.dados('Zqx Gestão B', testes.id('B')::text)), 'ok',
  'o dono edita qualquer modelo (o de uma consultoria segue dela)');
reset role;
select testes.sistema();
select is((select consultoria_id from public.modelos where id = testes.id('m_ca')), testes.id('A'), 'de novo para A');

-- ── Quem vê ──────────────────────────────────────────────────────────────────

select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx')$$)),
  array['Zqx Administrador A', 'Zqx Central para A', 'Zqx Central todas', 'Zqx Dono', 'Zqx Gestão A'],
  'o gestor de A vê os da Central para todas e para A e os de A; nunca os de B nem o da Central só para B');
select is(testes.nomes(testes.ver('pessoa_a', $$public.modelos_da_lista('ativos', 'zqx')$$)),
  array['Zqx Administrador A', 'Zqx Central para A', 'Zqx Central todas', 'Zqx Dono', 'Zqx Gestão A'],
  'o consultor vê os mesmos (só para ler)');
select is(testes.nomes(testes.ver('admin_a', $$public.modelos_da_lista('ativos', 'zqx')$$)),
  array['Zqx Administrador A', 'Zqx Central para A', 'Zqx Central todas', 'Zqx Dono', 'Zqx Gestão A'],
  'o administrador vê os mesmos');
select is(testes.nomes(testes.ver('gestor_b', $$public.modelos_da_lista('ativos', 'zqx')$$)),
  array['Zqx Central para B', 'Zqx Central todas', 'Zqx Dono', 'Zqx Gestão B'],
  'a gestão de B vê os de B e os da Central para todas e para B');
select is(testes.nomes(testes.ver('central1', $$public.modelos_da_lista('ativos', 'zqx')$$)),
  array['Zqx Administrador A', 'Zqx Central para A', 'Zqx Central para B', 'Zqx Central todas', 'Zqx Dono',
    'Zqx Gestão A', 'Zqx Gestão B'],
  'a Central vê todos');
select is(testes.nomes(testes.ver('central1',
    format($$public.modelos_da_lista('ativos', 'zqx', null, %L)$$, testes.id('A')))),
  array['Zqx Administrador A', 'Zqx Central para A', 'Zqx Central todas', 'Zqx Dono', 'Zqx Gestão A'],
  'a Central filtra pela consultoria: os modelos que aquela consultoria vê');
select is(testes.nomes(testes.ver('gestor_a',
    format($$public.modelos_da_lista('ativos', 'zqx', null, %L)$$, testes.id('B')))),
  array['Zqx Administrador A', 'Zqx Central para A', 'Zqx Central todas', 'Zqx Dono', 'Zqx Gestão A'],
  'quem não é da Central e pede outra consultoria continua na dele');

select is(testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_gb'))), null::jsonb,
  'o gestor de A não abre modelo de B');
select is(testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_cb'))), null::jsonb,
  'o gestor de A não abre o modelo da Central só para B');
select is(testes.ver('gestor_a', format($$(select count(*) from public.modelos where id in (%L, %L))
    + (select count(*) from public.modelo_etapas where modelo_id in (%L, %L))
    + (select count(*) from public.modelo_tarefas where modelo_id in (%L, %L))
    + (select count(*) from public.modelo_dependencias d join public.modelo_tarefas t on t.id = d.depende_de
       where t.modelo_id in (%L, %L))$$,
    testes.id('m_gb'), testes.id('m_cb'), testes.id('m_gb'), testes.id('m_cb'), testes.id('m_gb'), testes.id('m_cb'),
    testes.id('m_gb'), testes.id('m_cb'))), '0'::jsonb,
  'pela API, o gestor de A não lê modelo, etapa, tarefa nem dependência dos modelos de B e da Central só para B');
select is(testes.ver('gestor_a', format($$jsonb_build_array(
    (select count(*) from public.modelos where id = %L),
    (select count(*) from public.modelo_etapas where modelo_id = %L),
    (select count(*) from public.modelo_tarefas where modelo_id = %L),
    (select count(*) from public.modelo_dependencias d join public.modelo_tarefas t on t.id = d.tarefa_id
     where t.modelo_id = %L))$$,
    testes.id('m_ct'), testes.id('m_ct'), testes.id('m_ct'), testes.id('m_ct'))), '[1, 2, 3, 3]'::jsonb,
  'pela API, o gestor de A lê o modelo da Central para todas inteiro');
select is(testes.ver('a_senha', format($$(select count(*) from public.modelos where id in (%L, %L, %L))$$,
    testes.id('m_ct'), testes.id('m_ca'), testes.id('m_ga'))), '0'::jsonb,
  'sessão não liberada não lê modelo nenhum pela API');
select testes.como('a_senha');
select throws_ok($$select public.modelos_da_lista()$$, 'P0001', 'sem_permissao', 'sessão não liberada: sem lista');
select throws_ok(format($$select public.modelo_completo(%L)$$, testes.id('m_ct')), 'P0001', 'sem_permissao',
  'sessão não liberada: sem modelo');
select throws_ok($$select public.indicadores_de_modelos()$$, 'P0001', 'sem_permissao', 'sessão não liberada: sem números');
reset role;

select is(testes.ver('gestor_a', format($$jsonb_build_array(private.vejo_modelo(%L), private.vejo_modelo(%L),
    private.vejo_modelo(%L), private.edito_modelo(%L), private.edito_modelo(%L), private.edito_modelo(%L))$$,
    testes.id('m_ct'), testes.id('m_ca'), testes.id('m_gb'), testes.id('m_ga'), testes.id('m_ct'), testes.id('m_gb'))),
  '[true, true, false, true, false, false]'::jsonb,
  'vejo_modelo e edito_modelo para o gestor: vê os da Central para ele, edita só os da consultoria');
select is(testes.ver('pessoa_a', format($$jsonb_build_array(private.vejo_modelo(%L), private.edito_modelo(%L))$$,
    testes.id('m_ga'), testes.id('m_ga'))), '[true, false]'::jsonb,
  'o consultor vê o modelo da consultoria e não edita');
select is(testes.ver('central1', format($$jsonb_build_array(private.vejo_modelo(%L), private.edito_modelo(%L),
    private.edito_modelo(%L))$$, testes.id('m_gb'), testes.id('m_gb'), testes.id('m_ct'))), '[true, true, true]'::jsonb,
  'a Central vê e edita todos');

-- ── O modelo inteiro (modelo_completo) ───────────────────────────────────────

select is(testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_ct')))
    - 'etapas' - 'criado_em' - 'atualizado_em',
  jsonb_build_object('id', testes.id('m_ct'), 'nome', 'Zqx Central todas', 'descricao', 'Descrição de Zqx Central todas',
    'tipo', 'gestao', 'da_central', true, 'consultoria', null, 'criado_por', jsonb_build_object('nome', 'Central'),
    'arquivado_em', null, 'pode_editar', false, 'pode_duplicar', true),
  'o gestor abre o modelo da Central: só duplica; o autor aparece como "Central"');
select is(jsonb_path_query_array(testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_ct'))),
    '$.etapas[*].tarefas[*].titulo'),
  '["Análise do DRE", "Mapa de custos", "Plano de ação"]'::jsonb, 'as tarefas vêm dentro das etapas, em ordem');
select is((testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_ct')))
    #> '{etapas,0}') - 'id' - 'tarefas', '{"nome": "Diagnóstico", "posicao": 1}'::jsonb, 'cada etapa com nome e posição');
select is((testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_ct')))
    #> '{etapas,0,tarefas,1}') - 'id' - 'depende_de',
  '{"titulo": "Mapa de custos", "descricao": null, "obrigatoria": false, "prazo_dias": 10, "posicao": 2}'::jsonb,
  'cada tarefa com título, descrição, obrigatória, prazo e posição');
select is(testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_ct'))) #> '{etapas,1,tarefas,0,depende_de}',
  (select jsonb_agg(id order by posicao) from public.modelo_tarefas where modelo_id = testes.id('m_ct') and posicao < 3),
  '"depende de" traz os ids das tarefas, na ordem do modelo');
select is(testes.ver('central1', format('public.modelo_completo(%L)', testes.id('m_ga')))
    - 'id' - 'etapas' - 'criado_em' - 'atualizado_em' - 'nome' - 'descricao' - 'tipo' - 'arquivado_em',
  jsonb_build_object('da_central', false, 'consultoria', jsonb_build_object('id', testes.id('A'), 'nome',
    'Consultoria Modelos A'), 'criado_por', jsonb_build_object('nome', 'Pessoa gestor_a'), 'pode_editar', true,
    'pode_duplicar', true),
  'a Central abre o modelo de A: vê a consultoria e o nome de quem criou, edita e duplica');
select is(testes.ver('gestor_a', format('public.modelo_completo(%L)', testes.id('m_ga'))) - 'etapas'
    -> 'criado_por', '{"nome": "Pessoa gestor_a"}'::jsonb, 'na própria consultoria, o nome de quem criou aparece');
select is(testes.ver('gestor_a', format($$public.modelo_completo(%L) - 'etapas'$$, testes.id('m_ga')))
    - 'id' - 'nome' - 'descricao' - 'tipo' - 'da_central' - 'consultoria' - 'criado_por' - 'criado_em' - 'atualizado_em'
    - 'arquivado_em',
  '{"pode_editar": true, "pode_duplicar": true}'::jsonb, 'o gestor edita e duplica o modelo da consultoria');
select is(testes.ver('pessoa_a', format($$public.modelo_completo(%L) - 'etapas'$$, testes.id('m_ga')))
    - 'id' - 'nome' - 'descricao' - 'tipo' - 'da_central' - 'consultoria' - 'criado_por' - 'criado_em' - 'atualizado_em'
    - 'arquivado_em',
  '{"pode_editar": false, "pode_duplicar": false}'::jsonb, 'o consultor só lê');

-- ── Arquivar e reativar (direto pela API) ────────────────────────────────────

select testes.como('gestor_a');
select is(testes.arquivar(testes.id('m_ct'), now()), 0, 'o gestor não arquiva modelo da Central para todas');
select is(testes.arquivar(testes.id('m_ca'), now()), 0, 'o gestor não arquiva modelo da Central para a consultoria dele');
select is(testes.arquivar(testes.id('m_gb'), now()), 0, 'o gestor não arquiva modelo de outra consultoria');
reset role;
select testes.como('pessoa_a');
select is(testes.arquivar(testes.id('m_ga'), now()), 0, 'o consultor não arquiva');
reset role;
select testes.como('gestor_a');
select is(testes.arquivar(testes.id('m_aa'), '2020-01-01'), 1, 'o gestor arquiva o modelo da consultoria');
reset role;
select testes.sistema();
select is((select arquivado_em from public.modelos where id = testes.id('m_aa')), now(),
  'arquivar grava a hora do banco (não a que veio)');
select testes.como('admin_a');
select is(testes.arquivar(testes.id('m_aa'), '2021-01-01'), 1, 'arquivar de novo passa pela regra');
reset role;
select testes.sistema();
select is((select arquivado_em from public.modelos where id = testes.id('m_aa')), now(),
  'a data de quem já estava arquivado não muda');
select testes.como('gestor_a');
select is(testes.salvar(testes.id('m_aa'), testes.dados('Zqx Administrador A')), 'P0001 modelo_arquivado',
  'modelo arquivado não se edita (reativa antes)');
reset role;
select testes.como('central1');
select is(testes.salvar(testes.id('m_aa'), testes.dados('Zqx Administrador A', testes.id('A')::text)),
  'P0001 modelo_arquivado', 'nem pela Central');
reset role;
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('arquivados', 'zqx')$$)),
  array['Zqx Administrador A'], 'o arquivado aparece só na aba Arquivados');
select ok(not ('Zqx Administrador A' = any(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx')$$)))),
  'e sai da aba Ativos');
select testes.como('gestor_a');
select is(testes.arquivar(testes.id('m_aa'), null), 1, 'o gestor reativa');
reset role;
select testes.sistema();
select is((select arquivado_em from public.modelos where id = testes.id('m_aa')), null, 'reativado: sem data');
select testes.como('central1');
select is(testes.arquivar(testes.id('m_gb'), now()) + testes.arquivar(testes.id('m_gb'), null), 2,
  'a Central arquiva e reativa modelo de qualquer consultoria');
reset role;

-- ── Recusas de salvar_modelo (o modelo fica como estava) ─────────────────────

select testes.sistema();
insert into testes.retratos values ('m_ga', testes.retrato(testes.id('m_ga')));

select testes.como('gestor_a');
select is(testes.salvar(testes.id('m_ga'), testes.dados(' A ')), 'P0001 modelo_nome_curto', 'nome de uma letra');
select is(testes.salvar(testes.id('m_ga'), testes.dados(null)), 'P0001 modelo_nome_curto', 'sem nome');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas('[]')), 'P0001 modelo_sem_tarefas', 'sem etapas');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas('[]') - 'etapas'), 'P0001 modelo_sem_tarefas',
  'sem a lista de etapas');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas(
    '[{"nome": "  ", "tarefas": [{"titulo": "T", "prazo_dias": 1}]}]')), 'P0001 etapa_sem_nome', 'etapa sem nome');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas(
    '[{"nome": "E1", "tarefas": [{"titulo": "T", "prazo_dias": 1}]}, {"nome": "E2", "tarefas": []}]')),
  'P0001 etapa_sem_tarefas', 'etapa sem tarefas');
select is(testes.salvar(testes.id('m_ga'), testes.uma_tarefa('{"titulo": "   ", "prazo_dias": 1}')),
  'P0001 tarefa_sem_titulo', 'tarefa sem título');
select is(testes.salvar(testes.id('m_ga'), testes.uma_tarefa('{"titulo": "T", "prazo_dias": 366}')),
  'P0001 prazo_invalido', 'prazo depois do dia 365');
select is(testes.salvar(testes.id('m_ga'), testes.uma_tarefa('{"titulo": "T", "prazo_dias": -1}')),
  'P0001 prazo_invalido', 'prazo negativo');
select is(testes.salvar(testes.id('m_ga'), testes.uma_tarefa('{"titulo": "T", "prazo_dias": 2.5}')),
  'P0001 prazo_invalido', 'prazo quebrado');
select is(testes.salvar(testes.id('m_ga'), testes.uma_tarefa('{"titulo": "T", "prazo_dias": "10"}')),
  'P0001 prazo_invalido', 'prazo em texto');
select is(testes.salvar(testes.id('m_ga'), testes.uma_tarefa('{"titulo": "T"}')), 'P0001 prazo_invalido', 'sem prazo');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas('[{"nome": "E", "tarefas": [
    {"chave": "a", "titulo": "A", "prazo_dias": 1},
    {"chave": "b", "titulo": "B", "prazo_dias": 1, "depende_de": ["x"]}]}]')),
  'P0001 dependencia_invalida', 'dependência de uma tarefa que não existe');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas('[{"nome": "E", "tarefas": [
    {"chave": "a", "titulo": "A", "prazo_dias": 1, "depende_de": ["a"]}]}]')),
  'P0001 dependencia_invalida', 'dependência da própria tarefa');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas('[{"nome": "E", "tarefas": [
    {"chave": "a", "titulo": "A", "prazo_dias": 1, "depende_de": ["b"]},
    {"chave": "b", "titulo": "B", "prazo_dias": 1}]}]')),
  'P0001 dependencia_invalida', 'dependência de uma tarefa que vem depois (mesma etapa): seria ciclo');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas('[
    {"nome": "E1", "tarefas": [{"chave": "a", "titulo": "A", "prazo_dias": 1, "depende_de": ["b"]}]},
    {"nome": "E2", "tarefas": [{"chave": "b", "titulo": "B", "prazo_dias": 1, "depende_de": ["a"]}]}]')),
  'P0001 dependencia_invalida', 'dependência de uma tarefa de uma etapa depois (o ciclo a -> b -> a)');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas('[{"nome": "E", "tarefas": [
    {"chave": "a", "titulo": "A", "prazo_dias": 1},
    {"chave": "a", "titulo": "B", "prazo_dias": 1},
    {"chave": "c", "titulo": "C", "prazo_dias": 1, "depende_de": ["a"]}]}]')),
  'P0001 dependencia_invalida', 'duas tarefas com a mesma chave: a dependência ficaria ambígua');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas((select jsonb_agg(jsonb_build_object('nome', 'E' || i,
    'tarefas', jsonb_build_array(jsonb_build_object('titulo', 'T', 'prazo_dias', 1)))) from generate_series(1, 51) i))),
  'P0001 modelo_grande_demais', 'mais de 50 etapas');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas(jsonb_build_array(jsonb_build_object('nome', 'E',
    'tarefas', (select jsonb_agg(jsonb_build_object('titulo', 'T' || i, 'prazo_dias', 1)) from generate_series(1, 501) i))))),
  'P0001 modelo_grande_demais', 'mais de 500 tarefas');
select is(testes.salvar(testes.id('m_ga'), testes.com_etapas(jsonb_build_array(jsonb_build_object('nome', 'E',
    'tarefas', (select jsonb_agg(jsonb_build_object('chave', 'k' || i, 'titulo', 'T' || i, 'prazo_dias', 1,
      'depende_de', case when i = 32 then (select jsonb_agg('k' || j) from generate_series(1, 31) j) else '[]' end)
      order by i) from generate_series(1, 32) i))))),
  'P0001 modelo_grande_demais', 'mais de 30 dependências numa tarefa');
select is(testes.salvar(testes.id('m_ga'), testes.uma_tarefa(jsonb_build_object('titulo', repeat('x', 81), 'prazo_dias', 1))),
  '23514 new row for relation "modelo_tarefas" violates check constraint "modelo_tarefas_titulo_check"',
  'título de mais de 80 letras: o banco recusa ao gravar');
reset role;
select testes.sistema();
select is(testes.retrato(testes.id('m_ga')), (select r from testes.retratos where nome = 'm_ga'),
  'depois de cada recusa, o modelo continua exatamente como antes (inclusive a que veio já gravando)');

-- No limite: 50 etapas, 500 tarefas (prazos de 0 a 365) e 30 dependências numa tarefa.
select testes.como('central1');
select is(testes.salvar(null, jsonb_build_object('nome', 'Zqx Grande', 'para', 'todas', 'etapas',
    (select jsonb_agg(jsonb_build_object('nome', 'Etapa ' || e, 'tarefas',
      (select jsonb_agg(jsonb_build_object('chave', 'k' || ((e - 1) * 10 + t), 'titulo', 'Tarefa ' || ((e - 1) * 10 + t),
        'obrigatoria', t % 2 = 0, 'prazo_dias', case when e = 50 and t = 10 then 365 when e = 1 and t = 1 then 0 else e end,
        'depende_de', case when e = 4 and t = 1 then (select jsonb_agg('k' || j) from generate_series(1, 30) j) else '[]' end)
        order by t) from generate_series(1, 10) t)) order by e) from generate_series(1, 50) e))), 'ok',
  'no limite (50 etapas, 500 tarefas, 30 dependências numa tarefa) salva');
reset role;
select testes.sistema();
select is((select (etapas, tarefas, obrigatorias, maior_prazo)::text from public.modelos where nome = 'Zqx Grande'),
  (50, 500, 250, 365)::text, 'os contadores do modelo grande');
select is((select count(*)::int from public.modelo_dependencias d join public.modelo_tarefas t on t.id = d.tarefa_id
  join public.modelos m on m.id = t.modelo_id where m.nome = 'Zqx Grande'), 30, 'com as 30 dependências');

-- ── Regravar ─────────────────────────────────────────────────────────────────

select testes.como('gestor_a');
select is(testes.salvar(testes.id('m_ga'), jsonb_build_object('nome', 'Zqx Gestão A', 'descricao', '  ', 'tipo', 'sucesso_do_cliente',
    'etapas', '[
      {"nome": " Início ", "tarefas": [
        {"chave": "a", "titulo": " Kickoff ", "obrigatoria": true, "prazo_dias": 0},
        {"chave": "b", "titulo": "Levantamento", "descricao": "Reunir os números", "obrigatoria": false, "prazo_dias": 7}]},
      {"nome": "Meio", "tarefas": [
        {"chave": "c", "titulo": "Diagnóstico", "obrigatoria": true, "prazo_dias": 30, "depende_de": ["a", "a"]},
        {"chave": "d", "titulo": "Revisão", "obrigatoria": false, "prazo_dias": 12, "depende_de": ["b"]}]},
      {"nome": "Fim", "tarefas": [
        {"chave": "e", "titulo": "Entrega", "obrigatoria": true, "prazo_dias": 45, "depende_de": ["c", "d"]}]}]'::jsonb)),
  'ok', 'regravar o modelo com outra estrutura');
reset role;
select testes.sistema();
select is((select (nome, descricao, tipo, etapas, tarefas, obrigatorias, maior_prazo)::text from public.modelos
  where id = testes.id('m_ga')), ('Zqx Gestão A', null::text, 'sucesso_do_cliente', 3, 5, 3, 45)::text,
  'os contadores acompanham (maior prazo incluso); descrição em branco vira nula');
select is((select array_agg(nome order by posicao) from public.modelo_etapas where modelo_id = testes.id('m_ga')),
  array['Início', 'Meio', 'Fim'], 'as etapas novas, sem os espaços das pontas; as antigas saíram');
select is(testes.tarefas(testes.id('m_ga')),
  array['1.1: Kickoff (0, obrig)', '1.2: Levantamento (7, opc)', '2.3: Diagnóstico (30, obrig)', '2.4: Revisão (12, opc)',
    '3.5: Entrega (45, obrig)'],
  'as tarefas com as posições de 1 a 5, seguindo as etapas');
select is(testes.dependencias(testes.id('m_ga')),
  array['Diagnóstico -> Kickoff', 'Revisão -> Levantamento', 'Entrega -> Diagnóstico', 'Entrega -> Revisão'],
  'as dependências novas (a repetida conta uma vez só)');
select is((select count(*)::int from public.modelo_etapas e
  where e.id in (select (x ->> 'id')::uuid from testes.retratos r, jsonb_array_elements(r.r -> 'etapas') x
    where r.nome = 'm_ga')), 0, 'nenhuma etapa antiga ficou');

-- ── A lista ──────────────────────────────────────────────────────────────────

select testes.como('gestor_a');
select public.salvar_modelo(null, testes.dados('Zqx Lote ' || lpad(i::text, 2, '0'))) from generate_series(1, 16) i;
select public.salvar_modelo(null, testes.dados('Zqx Análise financeira', 'todas', 'gestao'));
reset role;
select testes.sistema();

select is(jsonb_array_length(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx lote')$$) -> 'itens'), 15,
  '15 por página');
select is(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx lote')$$) -> 'total', '16'::jsonb,
  'com o total de todos os que passam no filtro');
select is((testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx lote')$$)))[1:15],
  (select array_agg('Zqx Lote ' || lpad(i::text, 2, '0') order by i) from generate_series(1, 15) i),
  'em ordem de nome');
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx lote', null, null, 2)$$)),
  array['Zqx Lote 16'], 'a página 2 vem do banco');
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx lote', null, null, 0)$$)),
  testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx lote')$$)),
  'página 0 vale como a 1');
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx analise')$$)),
  array['Zqx Análise financeira'], 'busca sem acento: "analise" acha "Análise"');
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', '  ZQX ANÁLISE ')$$)),
  array['Zqx Análise financeira'], 'busca sem maiúscula e sem os espaços das pontas');
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'descricao de zqx analise')$$)),
  array['Zqx Análise financeira'], 'a busca olha também a descrição');
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx_lote')$$)), '{}'::text[],
  'o _ da busca procura o próprio caractere');
select is(testes.nomes(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx', 'gestao')$$)),
  array['Zqx Análise financeira', 'Zqx Central todas'], 'filtro por tipo');
select is(testes.nomes(testes.ver('central1',
    format($$public.modelos_da_lista('ativos', 'zqx', null, %L)$$, testes.id('B')))),
  array['Zqx Central para B', 'Zqx Central todas', 'Zqx Dono', 'Zqx Gestão B', 'Zqx Grande'],
  'a Central filtra por B: os da Central para todas e para B, e os de B');

select is(testes.item(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx')$$), 'Zqx Central todas')
    - 'id' - 'criado_em',
  jsonb_build_object('nome', 'Zqx Central todas', 'descricao', 'Descrição de Zqx Central todas', 'tipo', 'gestao',
    'da_central', true, 'consultoria', null, 'criado_por', jsonb_build_object('nome', 'Central'), 'etapas', 2,
    'tarefas', 3, 'obrigatorias', 2, 'maior_prazo', 20, 'clientes_usando', 0, 'arquivado_em', null,
    'pode_editar', false, 'pode_duplicar', true),
  'cada linha traz o que a tabela mostra; o gestor só duplica o da Central');
select is(testes.item(testes.ver('central1', $$public.modelos_da_lista('ativos', 'zqx')$$), 'Zqx Gestão A')
    - 'id' - 'criado_em' - 'descricao' - 'tipo' - 'arquivado_em',
  jsonb_build_object('nome', 'Zqx Gestão A', 'da_central', false,
    'consultoria', jsonb_build_object('id', testes.id('A'), 'nome', 'Consultoria Modelos A'),
    'criado_por', jsonb_build_object('nome', 'Pessoa gestor_a'), 'etapas', 3, 'tarefas', 5, 'obrigatorias', 3,
    'maior_prazo', 45, 'clientes_usando', 0, 'pode_editar', true, 'pode_duplicar', true),
  'a Central vê a consultoria e o nome de quem criou, e edita');
select is(testes.item(testes.ver('gestor_a', $$public.modelos_da_lista('ativos', 'zqx')$$), 'Zqx Gestão A')
    -> 'pode_editar', 'true'::jsonb, 'o gestor edita o da consultoria');
select is(testes.item(testes.ver('pessoa_a', $$public.modelos_da_lista('ativos', 'zqx')$$), 'Zqx Gestão A')
    - 'id' - 'criado_em' - 'nome' - 'descricao' - 'tipo' - 'da_central' - 'consultoria' - 'criado_por' - 'etapas'
    - 'tarefas' - 'obrigatorias' - 'maior_prazo' - 'clientes_usando' - 'arquivado_em',
  '{"pode_editar": false, "pode_duplicar": false}'::jsonb, 'o consultor só vê');

select testes.como('gestor_a');
select throws_ok($$select public.modelos_da_lista('todos')$$, '22023', 'filtro_invalido', 'aba que não existe');
select throws_ok($$select public.modelos_da_lista('ativos', null, 'outro')$$, '22023', 'filtro_invalido',
  'tipo que não existe');
reset role;

-- ── Números (indicadores_de_modelos) ─────────────────────────────────────────

select testes.sistema();
select is(testes.ver('gestor_a', 'public.indicadores_de_modelos()'), testes.numeros_esperados('consultoria', testes.id('A')),
  'gestão: os números da consultoria (os dela e os da Central para ela)');
select is(testes.ver('pessoa_a', 'public.indicadores_de_modelos()'), testes.numeros_esperados('consultoria', testes.id('A')),
  'o consultor vê os mesmos números');
select is(testes.ver('gestor_a', format('public.indicadores_de_modelos(%L)', testes.id('B'))),
  testes.numeros_esperados('consultoria', testes.id('A')),
  'quem não é da Central e pede outra consultoria continua na dele');
select is(testes.ver('central1', 'public.indicadores_de_modelos()'), testes.numeros_esperados('tudo', null),
  'a Central conta todos');
select is(testes.ver('central1', format('public.indicadores_de_modelos(%L)', testes.id('A'))),
  testes.numeros_esperados('tudo', testes.id('A')), 'a Central filtra pela consultoria');
select testes.como('gestor_a');
select testes.arquivar(id, now()) from public.modelos where nome = 'Zqx Lote 16';
reset role;
select is(testes.ver('gestor_a', 'public.indicadores_de_modelos()'),
  testes.numeros_esperados('consultoria', testes.id('A')), 'o arquivado não conta');
select is((testes.ver('gestor_a', 'public.indicadores_de_modelos()') ->> 'da_consultoria')::int,
  (select count(*)::int from public.modelos where consultoria_id = testes.id('A') and not da_central
    and arquivado_em is null), 'da consultoria: os modelos ativos feitos por ela');

-- ── Apagar (direto pela API) ─────────────────────────────────────────────────

select testes.como('gestor_a');
select is(testes.apagar(testes.id('m_ct')), 0, 'o gestor não apaga modelo da Central');
select is(testes.apagar(testes.id('m_gb')), 0, 'o gestor não apaga modelo de outra consultoria');
reset role;
select testes.como('pessoa_a');
select is(testes.apagar(testes.id('m_ga')), 0, 'o consultor não apaga');
reset role;
select testes.sistema();
insert into testes.fx select 'tarefa_ga', id from public.modelo_tarefas where modelo_id = testes.id('m_ga') and posicao = 5;
select testes.como('gestor_a');
select is(testes.apagar(testes.id('m_ga')), 1, 'o gestor apaga o modelo da consultoria');
reset role;
select testes.sistema();
select is((select count(*)::int from public.modelo_etapas where modelo_id = testes.id('m_ga'))
  + (select count(*)::int from public.modelo_tarefas where modelo_id = testes.id('m_ga'))
  + (select count(*)::int from public.modelo_dependencias where tarefa_id = testes.id('tarefa_ga')), 0,
  'etapas, tarefas e dependências somem junto');
select testes.como('central1');
select is(testes.apagar(testes.id('m_gb')), 1, 'a Central apaga modelo de qualquer consultoria');
reset role;

-- ── Permissões da API ────────────────────────────────────────────────────────

select testes.como('gestor_a');
select throws_ok($$insert into public.modelos (nome, da_central, consultoria_id) values ('Zqx Direto', false, testes.id('A'))$$,
  '42501', null, 'ninguém insere modelo direto (só por salvar_modelo)');
select throws_ok(format($$insert into public.modelo_etapas (modelo_id, nome, posicao) values (%L, 'X', 9)$$,
  testes.id('m_aa')), '42501', null, 'nem etapa');
select throws_ok(format($$insert into public.modelo_tarefas (modelo_id, etapa_id, titulo, prazo_dias, posicao)
  select modelo_id, id, 'X', 1, 9 from public.modelo_etapas where modelo_id = %L limit 1$$, testes.id('m_aa')),
  '42501', null, 'nem tarefa');
select throws_ok(format($$insert into public.modelo_dependencias (tarefa_id, depende_de)
  select a.id, b.id from public.modelo_tarefas a, public.modelo_tarefas b
  where a.modelo_id = %L and b.modelo_id = a.modelo_id and a.posicao = 2 and b.posicao = 3$$, testes.id('m_aa')),
  '42501', null, 'nem dependência');
select throws_ok(format($$update public.modelos set nome = 'X' where id = %L$$, testes.id('m_aa')), '42501', null,
  'o nome só muda por salvar_modelo');
select throws_ok(format($$update public.modelos set consultoria_id = null, da_central = true where id = %L$$,
  testes.id('m_aa')), '42501', null, 'para quem e da Central não mudam direto');
select throws_ok(format($$update public.modelo_etapas set nome = 'X' where modelo_id = %L$$, testes.id('m_aa')),
  '42501', null, 'etapa não muda direto');
select throws_ok(format($$update public.modelo_tarefas set titulo = 'X' where modelo_id = %L$$, testes.id('m_aa')),
  '42501', null, 'tarefa não muda direto');
select throws_ok(format($$delete from public.modelo_etapas where modelo_id = %L$$, testes.id('m_aa')),
  '42501', null, 'etapa não sai direto');
select throws_ok(format($$delete from public.modelo_tarefas where modelo_id = %L$$, testes.id('m_aa')),
  '42501', null, 'tarefa não sai direto');
select throws_ok($$delete from public.modelo_dependencias$$, '42501', null, 'dependência não sai direto');
reset role;
select testes.como('central1');
select throws_ok(format($$update public.modelos set nome = 'X' where id = %L$$, testes.id('m_ct')), '42501', null,
  'nem a Central muda o nome direto');
reset role;

select testes.sistema();
set local role anon;
select throws_ok($$select count(*) from public.modelos$$, '42501', null, 'sem login não se lê modelo');
select throws_ok($$select count(*) from public.modelo_tarefas$$, '42501', null, 'sem login não se lê tarefa');
select throws_ok($$select public.modelos_da_lista()$$, '42501', null, 'sem login não se lista');
select throws_ok($$select public.salvar_modelo(null, '{}')$$, '42501', null, 'sem login não se salva');
select throws_ok(format($$select public.modelo_completo(%L)$$, testes.id('m_ct')), '42501', null,
  'sem login não se abre modelo');
select throws_ok($$select public.indicadores_de_modelos()$$, '42501', null, 'sem login não há números');
reset role;

select * from finish();
rollback;
