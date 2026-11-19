-- O relógio da tarefa pára quando ninguém mais pode pausá-lo: check-list encerrado (tirar, trocar, cliente movido),
-- consultor trocado e cliente arquivado. O trecho aberto fecha e a tarefa em andamento vira pausada; mudar outra coisa
-- no cliente não mexe no relógio. (Migração 20261119153605_parar_relogios_das_tarefas.)
-- Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
select testes.modelo('m1', 'Zqr Primeiro');
select testes.modelo('m2', 'Zqr Segundo');

select testes.cliente(c, 'A', 'pessoa_a') from unnest(array['c_tirar', 'c_trocar', 'c_mover', 'c_consultor',
  'c_arquivar', 'c_outro']) c;
select testes.aplicar(c, 'm1', 'cl_' || substr(c, 3)) from unnest(array['c_tirar', 'c_trocar', 'c_mover', 'c_consultor',
  'c_arquivar', 'c_outro']) c;
select testes.marcar('cl_' || substr(c, 3), 'Análise do DRE', 'andamento') from unnest(array['c_tirar', 'c_trocar',
  'c_mover', 'c_consultor', 'c_arquivar', 'c_outro']) c;

-- O relógio da tarefa: 'parado' (sem trecho aberto e pausada), 'correndo' (trecho aberto e em andamento) ou o que for.
create function testes.relogio(p_checklist text) returns text language sql stable as $$
  select case
    when not exists (select 1 from public.checklist_tarefa_tempos tt where tt.tarefa_id = t.id and tt.fim is null)
      and t.estado = 'pausada' then 'parado'
    when exists (select 1 from public.checklist_tarefa_tempos tt where tt.tarefa_id = t.id and tt.fim is null)
      and t.estado = 'andamento' then 'correndo'
    else t.estado end
  from public.checklist_tarefas t where t.id = testes.tarefa(p_checklist, 'Análise do DRE')
$$;

select is(testes.relogio('cl_tirar'), 'correndo', 'antes: a tarefa iniciada está com o relógio correndo');

-- Tirar o modelo (check-list tocado: encerra).
select is(testes.fazer('gestor_a', format('public.tirar_modelo(%L::uuid)', testes.id('cl_tirar'))), 'encerrado',
  'tirar o modelo de um check-list tocado encerra');
select is(testes.relogio('cl_tirar'), 'parado', 'tirar o modelo pára o relógio da tarefa (trecho fechado, pausada)');
select is((select count(*)::int from public.checklist_tarefa_tempos where tarefa_id = testes.tarefa('cl_tirar', 'Análise do DRE')
    and fim is not null), 1, 'o tempo feito fica (o trecho fechado continua lá)');

-- Trocar o modelo.
select testes.aplicar('c_trocar', 'm2', 'cl_trocar_2');
select is(testes.relogio('cl_trocar'), 'parado', 'trocar o modelo pára o relógio do check-list antigo');

-- Mover o cliente para outra consultoria (a central).
select testes.como('central1');
update public.clientes set consultoria_id = testes.id('B') where id = testes.id('c_mover');
reset role;
select testes.sistema();
select is(testes.relogio('cl_mover'), 'parado', 'mover o cliente pára o relógio');

-- Trocar o consultor (a gestão): o check-list continua ativo e o consultor novo retoma.
select testes.como('gestor_a');
update public.clientes set consultor_id = testes.id('gestor_a') where id = testes.id('c_consultor');
reset role;
select testes.sistema();
select is(testes.relogio('cl_consultor'), 'parado', 'trocar o consultor pára o relógio do consultor antigo');
select is((select encerrado_em is null from public.cliente_checklists where id = testes.id('cl_consultor')), true,
  'o check-list continua ativo (o consultor novo retoma a tarefa pausada)');

-- Arquivar o cliente (a central).
select testes.como('central1');
update public.clientes set arquivado_em = now() where id = testes.id('c_arquivar');
reset role;
select testes.sistema();
select is(testes.relogio('cl_arquivar'), 'parado', 'arquivar o cliente pára o relógio');

-- Mudar outra coisa no cliente não mexe no relógio.
select testes.como('gestor_a');
update public.clientes set horas_mes = 20, nome = 'Cliente outro nome' where id = testes.id('c_outro');
reset role;
select testes.sistema();
select is(testes.relogio('cl_outro'), 'correndo', 'editar os dados ou a previsão não pára o relógio');

select is((select count(*)::int from public.checklist_tarefa_tempos tt join public.checklist_tarefas t on t.id = tt.tarefa_id
    join public.cliente_checklists cl on cl.id = t.checklist_id
    where cl.cliente_id in (select id from testes.fx) and tt.fim < tt.inicio), 0,
  'nenhum trecho fecha antes de começar');

select * from finish();
rollback;
