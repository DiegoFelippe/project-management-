-- Andamento dos clientes no check-list (desenho em docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md,
-- "Aba Andamento" e "Escala"; plano em docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 6): a tabela
-- (andamento_dos_clientes) e os cartões (indicadores_de_checkins) da aba Andamento de Check-ins. Quem vê o quê (o
-- consultor, os clientes dele; a gestão, os da consultoria; a Central, todos ou os da consultoria do filtro; outra
-- consultoria nunca), cada situação, a busca sem acento no cliente e no modelo, a ordem, a página de 15 com o total, a
-- próxima tarefa (a de data mais cedo entre as pendentes não bloqueadas), as atrasadas por linha e os números no recorte
-- e com os filtros. E os três ajustes da revisão da Task 2 que entram na mesma migração (índice comum em
-- cliente_checklists.modelo_id e a trava "for no key update" no cliente; "clientes usando" no recorte fica em
-- checklists.test.sql). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);

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
  insert into public.consultorias (nome) values ('Consultoria Andamento ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@andamento.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@andamento.test', p_papel);
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

-- Cliente gravado direto (sem usuário logado), com o nome dado, na consultoria e com o consultor, se vierem.
create function testes.cliente(p_chave text, p_nome text, p_consultoria text, p_consultor text,
  p_cidade text default null, p_uf text default null) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform testes.sistema();
  insert into public.clientes (nome, horas_mes, consultoria_id, consultor_id, cidade, uf)
  values (p_nome, 10, testes.id(p_consultoria), testes.id(p_consultor), p_cidade, p_uf) returning id into v;
  insert into testes.fx values (p_chave, v);
  return v;
end $$;

-- Chama como a pessoa e volta a ser o dono do banco: o resultado em JSON, ou { erro: "<código> <mensagem>" }.
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

-- Aplica como a pessoa e guarda o id do check-list com a chave; 'ok' ou o erro.
create function testes.aplicar(p_quem text, p_cliente text, p_modelo text, p_inicio date, p_chave text)
returns text language plpgsql as $$
declare v jsonb;
begin
  v := testes.chamar(p_quem, format('public.aplicar_modelo(%L::uuid, %L::uuid, %L::date)', testes.id(p_cliente),
    testes.id(p_modelo), p_inicio));
  if jsonb_typeof(v) = 'string' then
    insert into testes.fx values (p_chave, (v #>> '{}')::uuid);
    return 'ok';
  end if;
  return v ->> 'erro';
end $$;

-- Marca a tarefa (pelo título) do check-list como feita, como o consultor.
create function testes.feita(p_quem text, p_checklist text, p_titulo text) returns text language sql as $$
  select coalesce(testes.chamar(p_quem, format($f$public.marcar_tarefa(%L::uuid, 'feita')$f$,
    (select id from public.checklist_tarefas where checklist_id = testes.id(p_checklist) and titulo = p_titulo))) ->> 'erro',
    'ok')
$$;

-- Para o cenário: pára o teste se o passo não deu certo (e não imprime "ok", que o TAP leria como teste).
create function testes.exigir(p_resultado text) returns void language plpgsql as $$
begin
  if p_resultado is distinct from 'ok' then
    raise exception 'cenário: %', p_resultado;
  end if;
end $$;

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

-- O andamento como a pessoa (argumentos nomeados, ex.: $$p_situacao => 'sem_modelo'$$).
create function testes.andamento(p_quem text, p_args text default '') returns jsonb language sql as $$
  select testes.chamar(p_quem, 'public.andamento_dos_clientes(' || p_args || ')')
$$;

create function testes.numeros(p_quem text, p_args text default '') returns jsonb language sql as $$
  select testes.chamar(p_quem, 'public.indicadores_de_checkins(' || p_args || ')')
$$;

-- Os nomes dos clientes da página, em ordem.
create function testes.nomes(p jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(i #>> '{cliente,nome}' order by o), '{}')
  from jsonb_array_elements(p -> 'itens') with ordinality x(i, o)
$$;

-- A linha do cliente (pelo nome) na página.
create function testes.linha(p jsonb, p_nome text) returns jsonb language sql immutable as $$
  select i from jsonb_array_elements(p -> 'itens') i where i #>> '{cliente,nome}' = p_nome
$$;

-- ── Cenário ──────────────────────────────────────────────────────────────────
-- Consultoria A: gestor, administrador, os consultores pessoa_a e pessoa_a2, e um administrador que ainda precisa
-- trocar a senha (sessão não liberada). B: gestor e consultor. Os prazos contam de "hoje" (São Paulo).
-- Modelos: "Zqm Central todas" (Análise do DRE, dia 5; Mapa de custos, dia 10, depende da Análise; Plano de ação, dia
-- 20, depende das duas) e "Zqm Rápido" da A (Base, dia 30; Rápida, dia 2, depende da Base; Livre, dia 10): em Rápido a
-- tarefa de data mais cedo está bloqueada.
select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('a_senha', 'admin', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');
select testes.perfil('pessoa_b', 'pessoa', 'B');
update public.perfis set precisa_trocar_senha = true where id = testes.id('a_senha');

select testes.criar('central1', 'm_todas', jsonb_build_object('nome', 'Zqm Central todas', 'para', 'todas',
  'etapas', jsonb_build_array(
    jsonb_build_object('nome', 'Diagnóstico', 'tarefas', jsonb_build_array(
      jsonb_build_object('chave', 't1', 'titulo', 'Análise do DRE', 'prazo_dias', 5),
      jsonb_build_object('chave', 't2', 'titulo', 'Mapa de custos', 'obrigatoria', false, 'prazo_dias', 10,
        'depende_de', jsonb_build_array('t1')))),
    jsonb_build_object('nome', 'Plano', 'tarefas', jsonb_build_array(
      jsonb_build_object('chave', 't3', 'titulo', 'Plano de ação', 'prazo_dias', 20,
        'depende_de', jsonb_build_array('t1', 't2')))))));
select testes.criar('gestor_a', 'm_rapido', jsonb_build_object('nome', 'Zqm Rápido', 'etapas', jsonb_build_array(
  jsonb_build_object('nome', 'Única', 'tarefas', jsonb_build_array(
    jsonb_build_object('chave', 'b', 'titulo', 'Base', 'prazo_dias', 30),
    jsonb_build_object('chave', 'r', 'titulo', 'Rápida', 'prazo_dias', 2, 'depende_de', jsonb_build_array('b')),
    jsonb_build_object('chave', 'l', 'titulo', 'Livre', 'prazo_dias', 10))))));

-- Clientes da A (o nome dá a ordem quando o próximo vencimento empata ou falta).
select testes.cliente('a_atraso', 'Zqa Atraso', 'A', 'pessoa_a', 'Chapecó', 'SC');
select testes.cliente('a_aguarda', 'Zqa Aguarda', 'A', null);
select testes.cliente('a_rapida', 'Zqa Rápida', 'A', 'pessoa_a');
select testes.cliente('a_em_dia', 'Zqa Em dia', 'A', 'pessoa_a2');
select testes.cliente('a_completo', 'Zzz Completo', 'A', 'pessoa_a');
select testes.cliente('a_arvore', 'Zqx Árvore', 'A', 'pessoa_a');
select testes.cliente('a_encerrado', 'Zqy Encerrado', 'A', 'pessoa_a');
select testes.cliente('a_sem', 'Zqz Sem modelo', 'A', 'pessoa_a');
select testes.cliente('a_arq', 'Zqa Arquivado', 'A', 'pessoa_a');
-- B: um cliente com modelo e 17 sem (aguardando consultor), para a página 2.
select testes.cliente('b1', 'Bq Um', 'B', 'pessoa_b');
select testes.cliente('b_lote_' || lpad(n::text, 2, '0'), 'Lote ' || lpad(n::text, 2, '0'), 'B', null)
from generate_series(0, 16) n;
-- Um cliente da Central (sem consultoria): nunca está no andamento.
select testes.cliente('c_central', 'Zqa Central sem consultoria', null, null);

-- a_atraso: Análise (hoje - 10) e Mapa (hoje - 5) atrasadas; Plano (hoje + 5) vence em 7 dias.
select testes.exigir(testes.aplicar('gestor_a', 'a_atraso', 'm_todas', testes.hoje() - 15, 'cl_atraso'));
-- a_aguarda (sem consultor): Análise (hoje + 2) e Mapa (hoje + 7) vencem em 7 dias; empata com a_rapida no próximo.
select testes.exigir(testes.aplicar('gestor_a', 'a_aguarda', 'm_todas', testes.hoje() - 3, 'cl_aguarda'));
-- a_rapida: a mais cedo é Rápida (hoje + 2, bloqueada pela Base); a próxima livre é Livre (hoje + 10).
select testes.exigir(testes.aplicar('admin_a', 'a_rapida', 'm_rapido', testes.hoje(), 'cl_rapida'));
-- a_em_dia: Análise feita; próxima, Mapa (hoje + 10).
select testes.exigir(testes.aplicar('central1', 'a_em_dia', 'm_todas', testes.hoje(), 'cl_em_dia'));
select testes.exigir(testes.feita('pessoa_a2', 'cl_em_dia', 'Análise do DRE'));
-- a_completo: tudo feito (sem próximo vencimento).
select testes.exigir(testes.aplicar('gestor_a', 'a_completo', 'm_rapido', testes.hoje() - 20, 'cl_completo'));
select testes.exigir(testes.feita('pessoa_a', 'cl_completo', 'Base'));
select testes.exigir(testes.feita('pessoa_a', 'cl_completo', 'Rápida'));
select testes.exigir(testes.feita('pessoa_a', 'cl_completo', 'Livre'));
-- a_encerrado: o modelo foi tirado (o check-list encerrado não conta).
select testes.exigir(testes.aplicar('gestor_a', 'a_encerrado', 'm_todas', testes.hoje() - 30, 'cl_encerrado'));
select testes.exigir(coalesce(testes.chamar('gestor_a', format('public.tirar_modelo(%L::uuid)', testes.id('cl_encerrado'))) ->> 'erro', 'ok'));
-- a_arq: com modelo atrasado, mas arquivado.
select testes.exigir(testes.aplicar('gestor_a', 'a_arq', 'm_todas', testes.hoje() - 30, 'cl_arq'));
update public.clientes set arquivado_em = now() where id = testes.id('a_arq');
-- b1: Análise (hoje + 5) vence em 7 dias.
select testes.exigir(testes.aplicar('gestor_b', 'b1', 'm_todas', testes.hoje(), 'cl_b1'));

select is((select count(*)::int from testes.fx where nome like 'cl\_%'), 8, 'o cenário: os 8 check-lists foram aplicados');

-- ── Estrutura, permissões e os ajustes da revisão da Task 2 ──────────────────

select ok((select bool_and(has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
    from unnest(array['public.andamento_dos_clientes(uuid, uuid, text, text, int)',
      'public.indicadores_de_checkins(uuid, uuid)']) f),
  'as duas funções novas: authenticated executa, anon não');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('andamento_dos_clientes', 'indicadores_de_checkins'))
  and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('andamento_dos_clientes', 'indicadores_de_checkins')) = 2,
  'as duas são security definer com search_path vazio');
select is((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'cliente_checklists_modelo_id_idx'),
  'CREATE INDEX cliente_checklists_modelo_id_idx ON public.cliente_checklists USING btree (modelo_id)',
  'índice comum em cliente_checklists (modelo_id): apagar o modelo (on delete set null) acha os check-lists dele, também os encerrados');
select ok(pg_get_functiondef('private.travar_para_gerenciar(uuid, uuid)'::regprocedure)
    ~ 'from public\.clientes c where c\.id = p_cliente for no key update'
  and pg_get_functiondef('private.travar_para_gerenciar(uuid, uuid)'::regprocedure) !~ 'p_cliente for update',
  'aplicar, mudar o início e tirar travam o cliente com "for no key update" (não seguram a chave do cliente)');
select ok(not has_function_privilege('authenticated', 'private.travar_para_gerenciar(uuid, uuid)', 'execute'),
  'a trava continua só das funções do banco');

-- ── Quem vê o quê ────────────────────────────────────────────────────────────

select is(testes.nomes(testes.andamento('gestor_a')),
  array['Zqa Atraso', 'Zqa Aguarda', 'Zqa Rápida', 'Zqa Em dia', 'Zzz Completo', 'Zqx Árvore', 'Zqy Encerrado',
    'Zqz Sem modelo'],
  'a gestão: os clientes ativos da consultoria, do próximo vencimento mais antigo ao mais novo (empate: o nome), os '
  || 'com check-list sem prazo pendente e, no fim, os sem modelo por nome; arquivado e outra consultoria não aparecem');
select is(testes.andamento('gestor_a') -> 'total', '8'::jsonb, 'com o total');
select is(testes.nomes(testes.andamento('admin_a')), testes.nomes(testes.andamento('gestor_a')), 'o administrador vê o mesmo');
select is(testes.nomes(testes.andamento('gestor_a', format('p_consultoria => %L', testes.id('B')))),
  testes.nomes(testes.andamento('gestor_a')), 'a gestão não troca de consultoria pelo filtro');
select is(testes.nomes(testes.andamento('gestor_a', format('p_consultor => %L', testes.id('pessoa_a2')))),
  array['Zqa Em dia'], 'a gestão filtra pelo consultor');
select is(testes.andamento('gestor_a', format('p_consultor => %L', testes.id('pessoa_b'))),
  '{"itens": [], "total": 0}'::jsonb, 'consultor de outra consultoria: nada');
select is(testes.nomes(testes.andamento('pessoa_a')),
  array['Zqa Atraso', 'Zqa Rápida', 'Zzz Completo', 'Zqx Árvore', 'Zqy Encerrado', 'Zqz Sem modelo'],
  'o consultor: só os clientes dele');
select is(testes.nomes(testes.andamento('pessoa_a', format('p_consultor => %L, p_consultoria => %L',
    testes.id('pessoa_a2'), testes.id('B')))),
  testes.nomes(testes.andamento('pessoa_a')), 'o consultor não passa filtro de outra pessoa nem de outra consultoria');
select is(testes.nomes(testes.andamento('pessoa_a2')), array['Zqa Em dia'], 'o outro consultor, os dele');
select is(testes.andamento('gestor_b') -> 'total', '18'::jsonb, 'a gestão de B: os 18 dela');
select ok(not exists (select 1 from unnest(testes.nomes(testes.andamento('gestor_b'))) n where n like 'Z%'),
  'e nenhum da A');
select is(testes.nomes(testes.andamento('central1', format('p_consultoria => %L', testes.id('A')))),
  testes.nomes(testes.andamento('gestor_a')), 'a Central filtrada pela A vê o mesmo que a gestão da A');
select is(testes.nomes(testes.andamento('central1', format('p_consultor => %L', testes.id('pessoa_b')))),
  array['Bq Um'], 'a Central filtra pelo consultor de qualquer consultoria');
select is(testes.andamento('central1') -> 'total',
  to_jsonb((select count(*) from public.clientes where not arquivado and consultoria_id is not null)),
  'a Central sem filtro: todos os clientes ativos que estão numa consultoria');
select is(testes.andamento('central1', $$p_busca => 'zqa central sem'$$), '{"itens": [], "total": 0}'::jsonb,
  'cliente sem consultoria (na Central) não entra no andamento');
select is(testes.andamento('a_senha') ->> 'erro', 'P0001 sem_permissao', 'sessão não liberada: sem_permissao');
select is(testes.andamento('gestor_a', $$p_situacao => 'atrasados'$$) ->> 'erro', '22023 filtro_invalido',
  'situação que não existe: filtro_invalido');

-- ── Cada linha ───────────────────────────────────────────────────────────────

select is(testes.linha(testes.andamento('gestor_a'), 'Zqa Atraso'),
  jsonb_build_object(
    'cliente', jsonb_build_object('id', testes.id('a_atraso'), 'nome', 'Zqa Atraso', 'cidade', 'Chapecó', 'uf', 'SC'),
    'consultor', jsonb_build_object('id', testes.id('pessoa_a'), 'nome', 'Pessoa pessoa_a', 'foto', null, 'cor', null),
    'consultoria', null, 'pode_aplicar', true,
    'checklist', jsonb_build_object('id', testes.id('cl_atraso'), 'modelo_nome', 'Zqm Central todas', 'tarefas', 3,
      'feitas', 0, 'pct', 0, 'atrasadas', 2,
      'proxima', jsonb_build_object('titulo', 'Análise do DRE', 'vence_em', testes.hoje() - 10))),
  'a linha: o cliente, o consultor (rosto e nome), quem aplica, o modelo, o progresso, as atrasadas (mesmo bloqueadas) '
  || 'e a próxima tarefa');
select is(testes.linha(testes.andamento('gestor_a'), 'Zqa Rápida') -> 'checklist',
  jsonb_build_object('id', testes.id('cl_rapida'), 'modelo_nome', 'Zqm Rápido', 'tarefas', 3, 'feitas', 0, 'pct', 0,
    'atrasadas', 0, 'proxima', jsonb_build_object('titulo', 'Livre', 'vence_em', testes.hoje() + 10)),
  'a próxima é a de data mais cedo entre as pendentes NÃO bloqueadas (Rápida vence antes, mas espera a Base)');
select is(testes.linha(testes.andamento('gestor_a'), 'Zqa Em dia') -> 'checklist',
  jsonb_build_object('id', testes.id('cl_em_dia'), 'modelo_nome', 'Zqm Central todas', 'tarefas', 3, 'feitas', 1,
    'pct', 33, 'atrasadas', 0, 'proxima', jsonb_build_object('titulo', 'Mapa de custos', 'vence_em', testes.hoje() + 10)),
  'feita a Análise: 33%, e a próxima é o Mapa (liberado)');
select is(testes.linha(testes.andamento('gestor_a'), 'Zzz Completo') -> 'checklist',
  jsonb_build_object('id', testes.id('cl_completo'), 'modelo_nome', 'Zqm Rápido', 'tarefas', 3, 'feitas', 3, 'pct', 100,
    'atrasadas', 0, 'proxima', null),
  'tudo feito: 100%, nenhuma atrasada e sem próxima');
select is((select jsonb_build_object('consultor', l -> 'consultor', 'proxima', l #> '{checklist,proxima}')
    from testes.linha(testes.andamento('gestor_a'), 'Zqa Aguarda') l),
  jsonb_build_object('consultor', null, 'proxima', jsonb_build_object('titulo', 'Análise do DRE',
    'vence_em', testes.hoje() + 2)),
  'cliente aguardando consultor: sem consultor, com o check-list');
select is((select jsonb_build_object('checklist', l -> 'checklist', 'aplicar', l -> 'pode_aplicar')
    from testes.linha(testes.andamento('gestor_a'), 'Zqy Encerrado') l),
  '{"checklist": null, "aplicar": true}'::jsonb, 'modelo tirado: a linha fica sem check-list (o encerrado não conta)');
select is((select jsonb_build_object('consultoria', l -> 'consultoria', 'aplicar', l -> 'pode_aplicar')
    from testes.linha(testes.andamento('pessoa_a'), 'Zqa Atraso') l),
  '{"consultoria": null, "aplicar": false}'::jsonb, 'o consultor não aplica e não recebe a consultoria');
select is((select jsonb_build_object('consultoria', l -> 'consultoria', 'aplicar', l -> 'pode_aplicar',
      'consultor', l #>> '{consultor,nome}')
    from testes.linha(testes.andamento('central1', format('p_consultoria => %L', testes.id('A'))), 'Zqa Atraso') l),
  jsonb_build_object('consultoria', jsonb_build_object('id', testes.id('A'), 'nome', 'Consultoria Andamento A'),
    'aplicar', true, 'consultor', 'Pessoa pessoa_a'),
  'a Central vê também a consultoria e aplica');
select is(testes.linha(testes.andamento('gestor_a'), 'Zqa Atraso') -> 'checklist',
  testes.linha(testes.andamento('pessoa_a'), 'Zqa Atraso') -> 'checklist', 'o check-list da linha é o mesmo para o consultor');

-- ── Situações ────────────────────────────────────────────────────────────────

select is(testes.andamento('gestor_a', $$p_situacao => 'com_atraso'$$) - 'itens', '{"total": 1}'::jsonb,
  'com atraso: o total');
select is(testes.nomes(testes.andamento('gestor_a', $$p_situacao => 'com_atraso'$$)), array['Zqa Atraso'],
  'com atraso: só quem tem o próximo vencimento antes de hoje');
select is(testes.nomes(testes.andamento('gestor_a', $$p_situacao => 'sem_modelo'$$)),
  array['Zqx Árvore', 'Zqy Encerrado', 'Zqz Sem modelo'], 'sem modelo: os sem check-list ativo, por nome');
select is(testes.nomes(testes.andamento('gestor_a', $$p_situacao => 'todos'$$)), testes.nomes(testes.andamento('gestor_a')),
  'todos é o padrão');
select is(testes.nomes(testes.andamento('gestor_a', $$p_situacao => null$$)), testes.nomes(testes.andamento('gestor_a')),
  'situação nula: todos');
select is(testes.andamento('pessoa_a2', $$p_situacao => 'com_atraso'$$), '{"itens": [], "total": 0}'::jsonb,
  'o consultor sem atraso: nada');
select is((testes.nomes(testes.andamento('gestor_b', $$p_situacao => 'sem_modelo'$$)))[1:2], array['Lote 00', 'Lote 01'],
  'sem modelo na B: os do lote');

-- ── Busca ────────────────────────────────────────────────────────────────────

select is(testes.nomes(testes.andamento('gestor_a', $$p_busca => 'ARVORE'$$)), array['Zqx Árvore'],
  'busca no nome do cliente, sem acento e sem maiúscula');
select is(testes.nomes(testes.andamento('gestor_a', $$p_busca => 'rapido'$$)), array['Zqa Rápida', 'Zzz Completo'],
  'busca no nome do modelo (sem acento): os clientes com check-list ativo dele');
select is(testes.nomes(testes.andamento('gestor_a', $$p_busca => 'zqm central'$$)),
  array['Zqa Atraso', 'Zqa Aguarda', 'Zqa Em dia'], 'o modelo tirado não entra na busca pelo modelo');
select is(testes.nomes(testes.andamento('gestor_a', $$p_busca => 'chapeco'$$)), array['Zqa Atraso'],
  'a busca no cliente é a da lista de Clientes (nome, razão social, cidade e CNPJ)');
select is(testes.nomes(testes.andamento('gestor_a', $$p_busca => 'zqm central', p_situacao => 'com_atraso'$$)),
  array['Zqa Atraso'], 'busca e situação juntas');
select is(testes.andamento('gestor_a', $$p_busca => '%'$$), '{"itens": [], "total": 0}'::jsonb,
  'o % da busca é letra, não curinga');
select is(testes.nomes(testes.andamento('gestor_a', $$p_busca => '   '$$)), testes.nomes(testes.andamento('gestor_a')),
  'busca em branco: sem busca');
select is(testes.andamento('gestor_b', $$p_busca => 'zqa'$$), '{"itens": [], "total": 0}'::jsonb,
  'a busca não alcança outra consultoria');

-- ── Página de 15 ─────────────────────────────────────────────────────────────

select is(jsonb_array_length(testes.andamento('gestor_b') -> 'itens'), 15, 'página 1: 15 linhas');
select is((testes.nomes(testes.andamento('gestor_b')))[1:3], array['Bq Um', 'Lote 00', 'Lote 01'],
  'o com modelo primeiro, depois os sem modelo por nome');
select is(testes.nomes(testes.andamento('gestor_b', 'p_pagina => 2')), array['Lote 14', 'Lote 15', 'Lote 16'],
  'página 2: o resto');
select is(testes.andamento('gestor_b', 'p_pagina => 2') -> 'total', '18'::jsonb, 'com o mesmo total');
select is(testes.andamento('gestor_b', 'p_pagina => 3'), '{"itens": [], "total": 18}'::jsonb,
  'página que não existe: vazia, com o total');
select is(testes.nomes(testes.andamento('gestor_b', 'p_pagina => 0')), testes.nomes(testes.andamento('gestor_b')),
  'página 0 ou nula: a primeira');
select is(testes.andamento('gestor_b', $$p_situacao => 'sem_modelo', p_pagina => 2$$) - 'itens', '{"total": 17}'::jsonb,
  'o total segue a situação');

-- ── Os números (cartões) ─────────────────────────────────────────────────────
-- A: 8 clientes, 5 com modelo (0%, 0%, 0%, 33% e 100%: média 27%); atrasadas: as 2 de a_atraso; vencem em 7 dias:
-- Plano de a_atraso, Análise e Mapa de a_aguarda (o dia 7 conta) e Rápida de a_rapida (mesmo bloqueada).

select is(testes.numeros('gestor_a'),
  '{"recorte": "consultoria", "clientes": 8, "com_modelo": 5, "progresso_medio": 27, "atrasadas": 2, "vencem_7_dias": 4}'::jsonb,
  'a gestão: os números da consultoria');
select is(testes.numeros('gestor_a', format('p_consultor => %L', testes.id('pessoa_a2'))),
  '{"recorte": "consultoria", "clientes": 1, "com_modelo": 1, "progresso_medio": 33, "atrasadas": 0, "vencem_7_dias": 0}'::jsonb,
  'filtrados pelo consultor');
select is(testes.numeros('gestor_a', format('p_consultor => %L', testes.id('pessoa_b'))),
  '{"recorte": "consultoria", "clientes": 0, "com_modelo": 0, "progresso_medio": null, "atrasadas": 0, "vencem_7_dias": 0}'::jsonb,
  'consultor de outra consultoria: zerados (sem progresso médio)');
select is(testes.numeros('gestor_a', format('p_consultoria => %L', testes.id('B'))), testes.numeros('gestor_a'),
  'a gestão não troca de consultoria pelo filtro');
select is(testes.numeros('pessoa_a'),
  '{"recorte": "pessoa", "clientes": 6, "com_modelo": 3, "progresso_medio": 33, "atrasadas": 2, "vencem_7_dias": 2}'::jsonb,
  'o consultor: os clientes dele');
select is(testes.numeros('pessoa_a', format('p_consultor => %L, p_consultoria => %L', testes.id('pessoa_a2'), testes.id('B'))),
  testes.numeros('pessoa_a'), 'o consultor não passa filtro de outra pessoa');
select is(testes.numeros('gestor_b'),
  '{"recorte": "consultoria", "clientes": 18, "com_modelo": 1, "progresso_medio": 0, "atrasadas": 0, "vencem_7_dias": 1}'::jsonb,
  'a gestão de B: só os dela');
select is(testes.numeros('central1', format('p_consultoria => %L', testes.id('A'))),
  testes.numeros('gestor_a') || '{"recorte": "tudo"}'::jsonb, 'a Central filtrada pela A: os números da A');
select is(testes.numeros('central1', format('p_consultor => %L', testes.id('pessoa_b'))) - 'recorte',
  '{"clientes": 1, "com_modelo": 1, "progresso_medio": 0, "atrasadas": 0, "vencem_7_dias": 1}'::jsonb,
  'a Central filtrada pelo consultor');
select is(testes.numeros('central1') - 'recorte' - 'progresso_medio',
  (select jsonb_build_object(
      'clientes', count(*),
      'com_modelo', count(cl.id),
      'atrasadas', coalesce(sum((select count(*) from public.checklist_tarefas t
        where t.checklist_id = cl.id and t.estado <> 'feita' and t.vence_em < testes.hoje())), 0),
      'vencem_7_dias', coalesce(sum((select count(*) from public.checklist_tarefas t
        where t.checklist_id = cl.id and t.estado <> 'feita' and t.vence_em between testes.hoje() and testes.hoje() + 7)), 0))
    from public.clientes c
    left join public.cliente_checklists cl on cl.cliente_id = c.id and cl.encerrado_em is null
    where not c.arquivado and c.consultoria_id is not null),
  'a Central sem filtro: todos os clientes ativos numa consultoria, contados direto das tarefas');
select is(testes.numeros('a_senha') ->> 'erro', 'P0001 sem_permissao', 'sessão não liberada: sem_permissao');

-- O andamento acompanha o que o consultor marca.
select is(testes.feita('pessoa_a', 'cl_atraso', 'Análise do DRE'), 'ok', 'o consultor marca a Análise atrasada');
select is(testes.linha(testes.andamento('gestor_a'), 'Zqa Atraso') -> 'checklist',
  jsonb_build_object('id', testes.id('cl_atraso'), 'modelo_nome', 'Zqm Central todas', 'tarefas', 3, 'feitas', 1,
    'pct', 33, 'atrasadas', 1, 'proxima', jsonb_build_object('titulo', 'Mapa de custos', 'vence_em', testes.hoje() - 5)),
  'a linha acompanha: 33%, uma atrasada e a próxima é o Mapa');
select is((testes.nomes(testes.andamento('gestor_a')))[1:2], array['Zqa Atraso', 'Zqa Aguarda'],
  'continua a mais atrasada (o Mapa venceu há 5 dias)');
select is(testes.numeros('gestor_a') -> 'atrasadas', '1'::jsonb, 'e os números também');
select is(testes.feita('pessoa_a', 'cl_atraso', 'Mapa de custos'), 'ok', 'marca o Mapa');
select is(testes.nomes(testes.andamento('gestor_a', $$p_situacao => 'com_atraso'$$)), '{}'::text[],
  'sem atrasada, sai de "com atraso"');
select is((testes.nomes(testes.andamento('gestor_a')))[1:3], array['Zqa Aguarda', 'Zqa Rápida', 'Zqa Atraso'],
  'e vai para depois dos que vencem antes (Plano de ação vence em 5 dias)');

-- ── Nada de outra consultoria nos números da Central filtrada ────────────────

select is(testes.numeros('central1', format('p_consultoria => %L', testes.id('B'))) -> 'clientes', '18'::jsonb,
  'a Central filtrada pela B: os 18 da B');

select * from finish();
rollback;
