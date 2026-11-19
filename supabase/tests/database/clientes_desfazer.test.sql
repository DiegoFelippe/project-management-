-- O "Desfazer" dos avisos de Mandar para consultoria (Central) e Escolher consultor (gestão): desfazer_envio e
-- desfazer_escolha só voltam atrás se o cliente ainda está exatamente como a ação deixou (na consultoria, sem consultor,
-- sem check-list e não arquivado; com aquele consultor, sem check-in aberto e não arquivado). Senão, cliente_mudou e nada
-- muda (a consultoria pode ter escolhido o consultor nos 10 s do aviso). As regras de sempre do banco continuam valendo
-- (security invoker: RLS e o gatilho de clientes). Roda com: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create schema testes;
grant usage on schema testes to authenticated, anon;
create table testes.fx (nome text primary key, id uuid not null);
grant select on testes.fx to authenticated, anon;

create function testes.id(p_nome text) returns uuid language sql stable as $$
  select id from testes.fx where nome = p_nome
$$;

create function testes.consultoria(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.consultorias (nome) values ('Consultoria Desfazer ' || p_nome) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

create function testes.perfil(p_nome text, p_papel text, p_consultoria text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_nome || '@desfazer.test', 'hash-inicial', now(), '{}', '{}', now(), now());
  insert into testes.fx values (p_nome, v);
  insert into public.perfis (id, consultoria_id, nome, email, papel)
  values (v, testes.id(p_consultoria), 'Pessoa ' || p_nome, p_nome || '@desfazer.test', p_papel);
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

-- Cliente na Central (sem consultoria), gravado direto.
create function testes.cliente(p_nome text) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform testes.sistema();
  insert into public.clientes (nome, horas_mes) values ('Cliente ' || p_nome, 10) returning id into v;
  insert into testes.fx values (p_nome, v);
  return v;
end $$;

-- Roda o comando como a pessoa: 'ok' ou "<código> <mensagem>" (o erro desfaz só o comando, como uma chamada da API).
create function testes.fazer(p_quem text, p_sql text) returns text language plpgsql as $$
declare v text := 'ok';
begin
  perform testes.como(p_quem);
  begin
    execute p_sql;
  exception when others then
    v := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  perform testes.sistema();
  return v;
end $$;

create function testes.mudar(p_quem text, p_cliente text, p_sql text) returns void language plpgsql as $$
declare v text := testes.fazer(p_quem, format('update public.clientes set %s where id = %L', p_sql, testes.id(p_cliente)));
begin
  if v <> 'ok' then
    raise exception 'cenário: %', v;
  end if;
end $$;

create function testes.envio(p_quem text, p_cliente text, p_consultoria text) returns text language sql as $$
  select testes.fazer(p_quem, format('select public.desfazer_envio(%L, %L)', testes.id(p_cliente), testes.id(p_consultoria)))
$$;

create function testes.escolha(p_quem text, p_cliente text, p_consultor text) returns text language sql as $$
  select testes.fazer(p_quem, format('select public.desfazer_escolha(%L, %L)', testes.id(p_cliente), testes.id(p_consultor)))
$$;

-- Como o cliente está (lido pelo dono do banco): "consultoria/consultor/arquivado".
create function testes.estado(p_cliente text) returns text language sql stable as $$
  select coalesce((select nome from testes.fx where id = c.consultoria_id), '-') || '/'
    || coalesce((select nome from testes.fx where id = c.consultor_id), '-') || '/' || c.arquivado
  from public.clientes c where c.id = testes.id(p_cliente)
$$;

-- ── Cenário ──────────────────────────────────────────────────────────────────

select testes.consultoria('A');
select testes.consultoria('B');
select testes.perfil('central1', 'central', null);
select testes.perfil('admin_a', 'admin', 'A');
select testes.perfil('gestor_a', 'gestor', 'A');
select testes.perfil('pessoa_a', 'pessoa', 'A');
select testes.perfil('pessoa_a2', 'pessoa', 'A');
select testes.perfil('gestor_b', 'gestor', 'B');

-- Todos mandados pela Central para a A.
select testes.cliente(c) from unnest(array['e_ok', 'e_escolhido', 'e_movido', 'e_arquivado', 'e_modelo', 'e_gestao',
  'k_ok', 'k_trocado', 'k_checkin', 'k_arquivado', 'k_outra']) c;
select testes.mudar('central1', c, format('consultoria_id = %L', testes.id('A'))) from unnest(array['e_ok', 'e_escolhido',
  'e_movido', 'e_arquivado', 'e_modelo', 'e_gestao', 'k_ok', 'k_trocado', 'k_checkin', 'k_arquivado', 'k_outra']) c;

-- Mexidas depois do envio (nos 10 s do aviso).
select testes.mudar('gestor_a', 'e_escolhido', format('consultor_id = %L', testes.id('pessoa_a')));
select testes.mudar('central1', 'e_movido', format('consultoria_id = %L', testes.id('B')));
select testes.mudar('central1', 'e_arquivado', 'arquivado_em = now()');
select set_config('request.jwt.claims', json_build_object('sub', testes.id('gestor_a'), 'role', 'authenticated')::text, true);
insert into testes.fx values ('m1', public.salvar_modelo(null, jsonb_build_object('nome', 'Zqd Modelo', 'tipo', null,
  'para', 'todas', 'etapas', jsonb_build_array(jsonb_build_object('nome', 'Etapa', 'tarefas', jsonb_build_array(
    jsonb_build_object('chave', 't1', 'titulo', 'Tarefa', 'obrigatoria', true, 'prazo_dias', 5, 'depende_de', '[]'::jsonb)))))));
select testes.sistema();
select is(testes.fazer('gestor_a', format('select public.aplicar_modelo(%L, %L, current_date)', testes.id('e_modelo'),
  testes.id('m1'))), 'ok', 'a gestão aplica um modelo logo depois do envio');

-- Escolhidos pela gestão; depois, as mexidas.
select testes.mudar('gestor_a', c, format('consultor_id = %L', testes.id('pessoa_a')))
from unnest(array['k_ok', 'k_trocado', 'k_checkin', 'k_arquivado', 'k_outra']) c;
select testes.mudar('admin_a', 'k_trocado', format('consultor_id = %L', testes.id('pessoa_a2')));
select testes.como('pessoa_a');
insert into public.checkins (cliente_id, inicio) values (testes.id('k_checkin'), now() - interval '1 minute');
reset role;
select testes.sistema();
select testes.mudar('central1', 'k_arquivado', 'arquivado_em = now()');

-- ── Acesso ───────────────────────────────────────────────────────────────────

select ok((select bool_and(has_function_privilege('authenticated', f, 'execute')
      and not has_function_privilege('anon', f, 'execute'))
    from unnest(array['public.desfazer_envio(uuid, uuid)', 'public.desfazer_escolha(uuid, uuid)']) f),
  'as duas: authenticated executa, anon não');
select is((select array_agg(p.proname || ':' || p.prosecdef || ':' || (p.proconfig @> array['search_path=""']) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('desfazer_envio', 'desfazer_escolha')),
  array['desfazer_envio:false:true', 'desfazer_escolha:false:true'],
  'as duas são security invoker (a RLS e o gatilho de clientes valem) com search_path vazio');

-- ── Desfazer o envio (Central) ───────────────────────────────────────────────

select is(testes.envio('central1', 'e_ok', 'A'), 'ok', 'ainda como o envio deixou: a Central desfaz');
select is(testes.estado('e_ok'), '-/-/false', 'o cliente volta para a Central');
select is((select array_agg(tipo order by em, tipo) from public.cliente_eventos where cliente_id = testes.id('e_ok')
    and tipo in ('enviado', 'devolvido')), array['devolvido', 'enviado'], 'o Histórico ganha "devolvido", como sempre');
select is(testes.envio('central1', 'e_escolhido', 'A'), 'P0001 cliente_mudou',
  'a consultoria escolheu o consultor no meio: cliente_mudou');
select is(testes.estado('e_escolhido'), 'A/pessoa_a/false', 'e o consultor escolhido continua');
select is(testes.envio('central1', 'e_movido', 'A'), 'P0001 cliente_mudou', 'foi para outra consultoria: cliente_mudou');
select is(testes.estado('e_movido'), 'B/-/false', 'e continua lá');
select is(testes.envio('central1', 'e_arquivado', 'A'), 'P0001 cliente_mudou', 'foi arquivado: cliente_mudou');
select is(testes.envio('central1', 'e_modelo', 'A'), 'P0001 cliente_mudou', 'ganhou check-list: cliente_mudou');
select is((select count(*)::int from public.cliente_checklists where cliente_id = testes.id('e_modelo') and encerrado_em is null),
  1, 'e o check-list continua ativo');
select is(testes.envio('central1', 'e_ok', 'A'), 'P0001 cliente_mudou', 'desfazer duas vezes: cliente_mudou');
select is(testes.envio('gestor_a', 'e_gestao', 'A'), 'P0001 so_central_muda', 'a gestão não devolve à Central');
select is(testes.envio('gestor_b', 'e_gestao', 'A'), 'P0001 sem_permissao', 'outra consultoria nem vê o cliente');
select is(testes.estado('e_gestao'), 'A/-/false', 'e nada muda');

-- ── Desfazer a escolha (gestão) ──────────────────────────────────────────────

select is(testes.escolha('gestor_a', 'k_ok', 'pessoa_a'), 'ok', 'ainda com aquele consultor: a gestão desfaz');
select is(testes.estado('k_ok'), 'A/-/false', 'o cliente volta a aguardar consultor');
select is((select count(*)::int from public.cliente_eventos where cliente_id = testes.id('k_ok') and tipo = 'consultor_removido'),
  1, 'o Histórico ganha "consultor removido", como sempre');
select is(testes.escolha('gestor_a', 'k_trocado', 'pessoa_a'), 'P0001 cliente_mudou',
  'o consultor foi trocado no meio: cliente_mudou');
select is(testes.estado('k_trocado'), 'A/pessoa_a2/false', 'e o novo consultor continua');
select is(testes.escolha('gestor_a', 'k_checkin', 'pessoa_a'), 'P0001 cliente_mudou',
  'o consultor já fez check-in: cliente_mudou (o check-in aberto não é fechado)');
select is(testes.escolha('gestor_a', 'k_arquivado', 'pessoa_a'), 'P0001 cliente_mudou', 'foi arquivado: cliente_mudou');
select is(testes.escolha('pessoa_a', 'k_outra', 'pessoa_a') || ' / ' || testes.escolha('gestor_b', 'k_outra', 'pessoa_a'),
  'P0001 sem_permissao / P0001 sem_permissao', 'o consultor e outra consultoria não desfazem');

select * from finish();
rollback;
