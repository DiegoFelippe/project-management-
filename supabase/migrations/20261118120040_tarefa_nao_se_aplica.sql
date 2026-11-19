-- Tarefa "Não se aplica" no check-list do cliente (desenho em
-- docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md, "Acréscimo de 18/11"; plano em
-- docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 8). O modelo foi aplicado, mas uma tarefa não foi
-- necessária naquele cliente: o consultor do cliente a fecha como "não se aplica", com o motivo (o que a auditoria lê).
-- Terceiro jeito de fechar uma tarefa, ao lado de "feita".
--
-- - checklist_tarefas: estado novo 'nao_se_aplica' e a coluna motivo (1 a 500 letras, sem contar os espaços das pontas),
--   só e sempre com 'nao_se_aplica'. O motivo fica à parte da nota (editar a nota depois nunca apaga o motivo). Quem marcou
--   e quando ficam em feita_por e feita_em, que passam a valer para as duas formas de fechar (feita e não se aplica).
-- - "Resolvida" = feita ou não se aplica; "pendente" = a fazer ou em andamento. A que não se aplica libera as que dependem
--   dela (como feita), conta como resolvida no progresso (à parte: cliente_checklists ganha o contador nao_se_aplica) e não
--   entra em atrasadas, "vencem em 7 dias", próximo vencimento nem vira a próxima tarefa. O índice das não feitas passa a
--   ser o das pendentes (mesmo nome e colunas), para as leituras continuarem só com as pendentes.
-- - marcar_tarefa ganha p_motivo (com padrão nulo: quem chama com dois argumentos continua funcionando). A assinatura
--   muda, então é drop + create, com as permissões de volta (só authenticated executa). 'nao_se_aplica' sem motivo, ou só
--   com espaços: motivo_obrigatorio (22023). Quem marca e as recusas são as de "feita" (só o consultor do cliente, com o
--   cliente e o check-list ativos; tarefa bloqueada não fecha). Voltar para a fazer limpa o motivo, quem e quando.
-- - Com o check-in aberto, a tarefa que fecha entra em checkin_tarefas com o estado e o motivo (o check-out mostra
--   "Não se aplica: <tarefa> (<motivo>)"); a que volta a ficar pendente sai dele.
-- - Histórico: cada "não se aplica" grava em cliente_eventos o tipo 'tarefa_nao_se_aplica' com a tarefa (o título) e o
--   motivo; historico_do_cliente devolve os dois só para quem vê o nome do modelo do check-list (a Central e a consultoria
--   do check-list), como o nome do modelo.
-- - checklist_do_cliente, andamento_dos_clientes e indicadores_de_checkins seguem a regra nova; private.recontar_checklist
--   conta à parte. Mesmas assinaturas (create or replace mantém as permissões).
--
-- Nenhuma linha é alterada ou apagada: as colunas novas entram nulas (motivo, tarefa) ou com o padrão que já vale para
-- todas as linhas de hoje (checkin_tarefas.estado = 'feita', cliente_checklists.nao_se_aplica = 0), e nenhuma tarefa de
-- hoje está como 'nao_se_aplica'.

-- ── Tabelas ──────────────────────────────────────────────────────────────────

alter table public.checklist_tarefas
  drop constraint checklist_tarefas_estado_check,
  add constraint checklist_tarefas_estado_check check (estado in ('a_fazer', 'andamento', 'feita', 'nao_se_aplica')),
  add column motivo text constraint checklist_tarefas_motivo_check check (char_length(btrim(motivo)) between 1 and 500),
  add constraint checklist_tarefas_motivo_do_estado_check check ((estado = 'nao_se_aplica') = (motivo is not null)),
  -- quem fechou e quando: nas duas formas de fechar
  drop constraint checklist_tarefas_check,
  add constraint checklist_tarefas_resolvida_check check ((estado in ('feita', 'nao_se_aplica')) = (feita_em is not null));

-- As pendentes por data (recontar, atrasadas, vencem em 7 dias e a próxima, em ordem de vencimento e posição): o índice
-- de 20261118021312_andamento_indice_da_proxima.sql, agora sem as que não se aplicam.
drop index public.checklist_tarefas_vencimento_idx;
create index checklist_tarefas_vencimento_idx on public.checklist_tarefas (checklist_id, vence_em, posicao)
  where estado in ('a_fazer', 'andamento');

alter table public.cliente_checklists
  add column nao_se_aplica smallint not null default 0 check (nao_se_aplica >= 0);

alter table public.checkin_tarefas
  add column estado text not null default 'feita'
    constraint checkin_tarefas_estado_check check (estado in ('feita', 'nao_se_aplica')),
  add column motivo text constraint checkin_tarefas_motivo_check check (char_length(btrim(motivo)) between 1 and 500),
  add constraint checkin_tarefas_motivo_do_estado_check check ((estado = 'nao_se_aplica') = (motivo is not null));

-- Histórico: "Não se aplica: <tarefa>" com o motivo (o título e o motivo copiados, como estavam ao marcar).
alter table public.cliente_eventos
  add column tarefa text,
  add column motivo text,
  drop constraint cliente_eventos_tipo_check,
  add constraint cliente_eventos_tipo_check check (tipo in ('cadastrado', 'editado', 'enviado', 'movido', 'devolvido',
    'consultor_escolhido', 'consultor_trocado', 'consultor_removido', 'previsao_ajustada', 'arquivado', 'reativado',
    'reuniao_realizada', 'pasta_da_reuniao_criada', 'modelo_aplicado', 'modelo_trocado', 'modelo_tirado',
    'tarefa_nao_se_aplica'));

-- ── Recontar ─────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261117181313_checklists_dos_clientes.sql; muda só: conta as que não se aplicam à parte e o próximo
-- vencimento é o das pendentes.
create or replace function private.recontar_checklist(p_checklist uuid) returns void
language sql set search_path = '' as $$
  update public.cliente_checklists cl
  set tarefas = x.tarefas, feitas = x.feitas, nao_se_aplica = x.nao_se_aplica, obrigatorias = x.obrigatorias,
      obrigatorias_feitas = x.obrigatorias_feitas, proximo_vencimento = x.proximo
  from (
    select count(*) as tarefas,
      count(*) filter (where t.estado = 'feita') as feitas,
      count(*) filter (where t.estado = 'nao_se_aplica') as nao_se_aplica,
      count(*) filter (where t.obrigatoria) as obrigatorias,
      count(*) filter (where t.obrigatoria and t.estado = 'feita') as obrigatorias_feitas,
      min(t.vence_em) filter (where t.estado in ('a_fazer', 'andamento')) as proximo
    from public.checklist_tarefas t
    where t.checklist_id = p_checklist
  ) x
  where cl.id = p_checklist
$$;

-- ── Ler ──────────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261117181313_checklists_dos_clientes.sql; muda só: cada tarefa traz o motivo; uma dependência que não
-- se aplica não bloqueia; as etapas contam nao_se_aplica; o resumo ganha nao_se_aplica e resolvidas (feitas + não se
-- aplica), e atrasadas, vencem em 7 dias e a próxima olham só as pendentes; as tarefas da sessão trazem estado e motivo.
-- { pode_aplicar, pode_marcar, consultor, checklist, etapas: [{ id, nome, posicao, tarefas, feitas, nao_se_aplica }],
-- tarefas: [{ ..., estado, nota, motivo, feita_em, feita_por, depende_de, na_sessao }], resumo: { tarefas, feitas,
-- nao_se_aplica, resolvidas, obrigatorias, obrigatorias_feitas, vencem_7_dias, atrasadas, proxima }, sessao: null | {
-- checkin_id, inicio, consultor, tarefas: [{ tarefa_id, titulo, estado, motivo }] }, ultimo_checkin }.
create or replace function public.checklist_do_cliente(p_cliente uuid) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_central boolean;
  v_minha uuid;
  v_gestao uuid;
  v_consultoria uuid;
  v_consultor uuid;
  v_checklist uuid;
  v_checkin uuid;
  v_hoje date := private.hoje();
  v_json jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select c.consultoria_id, c.consultor_id into v_consultoria, v_consultor from public.clientes c where c.id = p_cliente;
  if not found or not private.vejo_cliente(v_consultoria, v_consultor) then
    return null;
  end if;
  v_central := private.sou_central();
  v_minha := private.consultoria_atual();
  v_gestao := case when private.gerencio_consultoria(v_minha) then v_minha end;

  select cl.id into v_checklist from public.cliente_checklists cl
  where cl.cliente_id = p_cliente and cl.encerrado_em is null and cl.consultoria_id = v_consultoria;
  select k.id into v_checkin from public.checkins k
  where k.cliente_id = p_cliente and k.fim is null
    and (v_central or k.consultoria_id = v_gestao or k.consultor_id = v_eu)
  order by k.inicio desc limit 1;

  with tarefas as materialized (
    select t.id, t.etapa_id, t.posicao, t.titulo, t.descricao, t.obrigatoria, t.prazo_dias, t.vence_em, t.estado,
      t.nota, t.motivo, t.feita_em, t.feita_por, t.estado in ('a_fazer', 'andamento') as pendente
    from public.checklist_tarefas t
    where t.checklist_id = v_checklist
  ), dependencias as (
    select d.tarefa_id, jsonb_agg(d.depende_de order by dt.posicao) as ids,
      bool_and(dt.estado in ('feita', 'nao_se_aplica')) as livres
    from tarefas t
    join public.checklist_dependencias d on d.tarefa_id = t.id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    group by d.tarefa_id
  ), na_sessao as (
    select ct.tarefa_id from public.checkin_tarefas ct where ct.checkin_id = v_checkin
  ), nomes as (
    select x.id, private.nome_do_perfil_visivel(x.id) as nome
    from (select distinct t.feita_por as id from tarefas t where t.feita_por is not null) x
  ), completas as (
    select t.*, coalesce(d.ids, '[]'::jsonb) as depende_de, coalesce(d.livres, true) as livre,
      s.tarefa_id is not null as na_sessao, n.nome as feita_por_nome
    from tarefas t
    left join dependencias d on d.tarefa_id = t.id
    left join na_sessao s on s.tarefa_id = t.id
    left join nomes n on n.id = t.feita_por
  )
  select jsonb_build_object(
    'pode_aplicar', private.gerencio_checklist_do_cliente(p_cliente),
    'pode_marcar', v_checklist is not null and private.marco_no_checklist(v_checklist),
    'consultor', case when v_consultor is not null then
      jsonb_build_object('id', v_consultor, 'nome', private.nome_do_perfil_visivel(v_consultor)) end,
    'checklist', (
      select jsonb_build_object('id', cl.id, 'modelo_id', cl.modelo_id, 'modelo_nome', cl.modelo_nome,
        'inicio', cl.inicio, 'aplicado_em', cl.aplicado_em,
        'aplicado_por', jsonb_build_object('nome', private.nome_do_perfil_visivel(cl.aplicado_por)))
      from public.cliente_checklists cl where cl.id = v_checklist),
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'posicao', e.posicao,
        'tarefas', coalesce(x.tarefas, 0), 'feitas', coalesce(x.feitas, 0),
        'nao_se_aplica', coalesce(x.nao_se_aplica, 0)) order by e.posicao)
      from public.checklist_etapas e
      left join (select c.etapa_id, count(*) as tarefas, count(*) filter (where c.estado = 'feita') as feitas,
          count(*) filter (where c.estado = 'nao_se_aplica') as nao_se_aplica
        from completas c group by c.etapa_id) x on x.etapa_id = e.id
      where e.checklist_id = v_checklist), '[]'::jsonb),
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'etapa_id', c.etapa_id, 'posicao', c.posicao, 'titulo', c.titulo,
        'descricao', c.descricao, 'obrigatoria', c.obrigatoria, 'prazo_dias', c.prazo_dias, 'vence_em', c.vence_em,
        'estado', c.estado, 'nota', c.nota, 'motivo', c.motivo, 'feita_em', c.feita_em,
        'feita_por', case when c.feita_por is not null then jsonb_build_object('nome', c.feita_por_nome) end,
        'depende_de', c.depende_de, 'na_sessao', c.na_sessao) order by c.posicao)
      from completas c), '[]'::jsonb),
    'resumo', (
      select jsonb_build_object(
        'tarefas', count(*),
        'feitas', count(*) filter (where c.estado = 'feita'),
        'nao_se_aplica', count(*) filter (where c.estado = 'nao_se_aplica'),
        'resolvidas', count(*) filter (where not c.pendente),
        'obrigatorias', count(*) filter (where c.obrigatoria),
        'obrigatorias_feitas', count(*) filter (where c.obrigatoria and c.estado = 'feita'),
        'vencem_7_dias', count(*) filter (where c.pendente and c.vence_em between v_hoje and v_hoje + 7),
        'atrasadas', count(*) filter (where c.pendente and c.vence_em < v_hoje),
        'proxima', (
          select jsonb_build_object('id', p.id, 'titulo', p.titulo, 'vence_em', p.vence_em)
          from completas p where p.pendente and p.livre
          order by p.vence_em, p.posicao limit 1))
      from completas c),
    'sessao', (
      select jsonb_build_object('checkin_id', k.id, 'inicio', k.inicio,
        'consultor', jsonb_build_object('nome', private.nome_do_perfil_visivel(k.consultor_id)),
        'tarefas', coalesce((
          select jsonb_agg(jsonb_build_object('tarefa_id', ct.tarefa_id, 'titulo', ct.titulo, 'estado', ct.estado,
              'motivo', ct.motivo)
            order by ct.marcada_em, ct.titulo, ct.tarefa_id)
          from public.checkin_tarefas ct where ct.checkin_id = k.id), '[]'::jsonb))
      from public.checkins k where k.id = v_checkin),
    'ultimo_checkin', (
      select jsonb_build_object('inicio', k.inicio, 'fim', k.fim,
        'consultor', jsonb_build_object('nome', private.nome_do_perfil_visivel(k.consultor_id)))
      from public.checkins k
      where k.cliente_id = p_cliente and k.fim is not null
        and (v_central or k.consultoria_id = v_gestao or k.consultor_id = v_eu)
      order by k.inicio desc limit 1))
  into v_json;

  return v_json;
end $$;

-- ── Marcar ───────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261117181313_checklists_dos_clientes.sql; muda só: o estado 'nao_se_aplica' com o motivo (p_motivo,
-- sem os espaços das pontas; vazio: motivo_obrigatorio, 22023; nos outros estados é ignorado). Feita e não se aplica
-- fecham a tarefa: gravam quem e quando, pedem as dependências resolvidas (tarefa_bloqueada), liberam as que dependem
-- dela e, com o check-in aberto, entram nele com o estado e o motivo. Voltar para pendente limpa o motivo, quem e quando
-- e tira do check-in aberto. "Não se aplica" grava a linha 'tarefa_nao_se_aplica' no histórico (tarefa e motivo).
-- Devolve { estado, feita_em, liberadas: [{ id, titulo }], na_sessao }. Mesmo estado: nada muda (nem o motivo).
-- Recusas: estado_invalido, motivo_obrigatorio, sem_permissao, so_o_consultor_marca, checklist_encerrado,
-- cliente_arquivado, tarefa_bloqueada; motivo acima de 500 letras, a regra da coluna (23514).
drop function public.marcar_tarefa(uuid, text);

create function public.marcar_tarefa(p_tarefa uuid, p_estado text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_checklist uuid;
  v_cliente uuid;
  v_antes text;
  v_titulo text;
  v_feita_em timestamptz;
  v_checkin uuid;
  v_fecha boolean := p_estado in ('feita', 'nao_se_aplica');
  v_motivo text := case when p_estado = 'nao_se_aplica' then nullif(btrim(p_motivo), '') end;
  v_liberadas jsonb := '[]';
begin
  if p_estado is null or p_estado not in ('a_fazer', 'andamento', 'feita', 'nao_se_aplica') then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;
  if p_estado = 'nao_se_aplica' and v_motivo is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  select o_checklist, o_cliente into v_checklist, v_cliente from private.travar_para_marcar(p_tarefa);

  select t.estado, t.titulo, t.feita_em into v_antes, v_titulo, v_feita_em
  from public.checklist_tarefas t where t.id = p_tarefa;

  -- O check-in aberto do consultor neste cliente (travado: o check-out espera, e depois dele o check-in não muda mais).
  select k.id into v_checkin from public.checkins k
  where k.consultor_id = v_eu and k.cliente_id = v_cliente and k.fim is null
  for update;

  if v_antes is distinct from p_estado then
    if p_estado in ('feita', 'andamento', 'nao_se_aplica') and exists (
      select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = p_tarefa and dt.estado in ('a_fazer', 'andamento')) then
      raise exception 'tarefa_bloqueada' using errcode = 'P0001';
    end if;

    update public.checklist_tarefas
    set estado = p_estado,
        motivo = v_motivo,
        feita_em = case when v_fecha then now() end,
        feita_por = case when v_fecha then v_eu end
    where id = p_tarefa
    returning feita_em into v_feita_em;

    if v_checkin is not null then
      if v_fecha then
        insert into public.checkin_tarefas (checkin_id, tarefa_id, titulo, estado, motivo)
        values (v_checkin, p_tarefa, v_titulo, p_estado, v_motivo)
        on conflict (checkin_id, tarefa_id) do update
          set estado = excluded.estado, motivo = excluded.motivo, marcada_em = excluded.marcada_em;
      elsif v_antes in ('feita', 'nao_se_aplica') then
        delete from public.checkin_tarefas where checkin_id = v_checkin and tarefa_id = p_tarefa;
      end if;
    end if;

    if v_fecha then
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo) order by t.posicao), '[]')
      into v_liberadas
      from public.checklist_dependencias d
      join public.checklist_tarefas t on t.id = d.tarefa_id
      where d.depende_de = p_tarefa and t.estado in ('a_fazer', 'andamento')
        and not exists (
          select 1 from public.checklist_dependencias d2
          join public.checklist_tarefas t2 on t2.id = d2.depende_de
          where d2.tarefa_id = t.id and t2.estado in ('a_fazer', 'andamento'));
    end if;

    if p_estado = 'nao_se_aplica' then
      insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa, motivo)
      values (v_cliente, 'tarefa_nao_se_aplica', v_checklist, v_eu, v_titulo, v_motivo);
    end if;

    perform private.recontar_checklist(v_checklist);
  end if;

  return jsonb_build_object('estado', p_estado, 'feita_em', v_feita_em, 'liberadas', v_liberadas,
    'na_sessao', v_checkin is not null and exists (
      select 1 from public.checkin_tarefas ct where ct.checkin_id = v_checkin and ct.tarefa_id = p_tarefa));
end $$;

revoke all on function public.marcar_tarefa(uuid, text, text) from public, anon;
grant execute on function public.marcar_tarefa(uuid, text, text) to authenticated;

-- ── Andamento ────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118020729_andamento_dos_checklists.sql; muda só: o check-list da linha traz nao_se_aplica; pct é
-- (feitas + não se aplica) ÷ tarefas; atrasadas e a próxima olham só as pendentes, e uma dependência que não se aplica
-- não bloqueia. { itens: [{ ..., checklist: null | { id, modelo_nome, tarefas, feitas, nao_se_aplica, pct, atrasadas,
-- proxima } }], total }.
create or replace function public.andamento_dos_clientes(p_consultoria uuid default null, p_consultor uuid default null,
  p_situacao text default 'todos', p_busca text default null, p_pagina int default 1) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_central boolean;
  v_gestao boolean := false;
  v_consultoria uuid;
  v_consultor uuid;
  v_situacao text := coalesce(p_situacao, 'todos');
  v_padrao text := private.padrao_de_busca(p_busca);
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_hoje date := private.hoje();
  v_total int;
  v_itens jsonb;
begin
  v_central := private.sou_central();
  if v_central then
    v_consultoria := p_consultoria;
    v_consultor := p_consultor;
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_gestao := true;
    v_consultoria := private.consultoria_atual();
    v_consultor := p_consultor;
  elsif private.liberado() then
    v_consultoria := private.consultoria_atual();
    v_consultor := v_eu;
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_situacao not in ('todos', 'com_atraso', 'sem_modelo') then
    raise exception 'filtro_invalido' using errcode = '22023';
  end if;

  with filtrados as materialized (
    select c.id, c.nome, cl.id as checklist_id, cl.proximo_vencimento
    from public.clientes c
    left join public.cliente_checklists cl
      on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
    where not c.arquivado
      and c.consultoria_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
      and (v_consultor is null or c.consultor_id = v_consultor)
      and (v_situacao = 'todos'
        or (v_situacao = 'com_atraso' and cl.proximo_vencimento < v_hoje)
        or (v_situacao = 'sem_modelo' and cl.id is null))
      and (v_padrao is null or c.busca like v_padrao escape '\' or cl.modelo_busca like v_padrao escape '\')
  ), pagina as (
    select f.id, f.nome, f.checklist_id, f.proximo_vencimento
    from filtrados f
    order by f.proximo_vencimento nulls last, f.checklist_id is null, f.nome, f.id
    limit 15 offset (v_pagina - 1) * 15
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente', jsonb_build_object('id', c.id, 'nome', c.nome, 'cidade', c.cidade, 'uf', c.uf),
        'consultor', case when p.id is not null then jsonb_build_object('id', p.id,
          'nome', private.nome_do_perfil_visivel(p.id), 'foto', p.foto, 'cor', p.cor) end,
        'consultoria', case when v_central then jsonb_build_object('id', co.id, 'nome', co.nome) end,
        'pode_aplicar', v_central or v_gestao,
        'checklist', case when cl.id is not null then jsonb_build_object(
          'id', cl.id, 'modelo_nome', cl.modelo_nome, 'tarefas', cl.tarefas, 'feitas', cl.feitas,
          'nao_se_aplica', cl.nao_se_aplica,
          'pct', case when cl.tarefas > 0
            then round((cl.feitas + cl.nao_se_aplica) * 100.0 / cl.tarefas)::int else 0 end,
          'atrasadas', a.atrasadas,
          'proxima', pr.proxima) end
      ) order by pg.proximo_vencimento nulls last, pg.checklist_id is null, pg.nome, pg.id)
      from pagina pg
      join public.clientes c on c.id = pg.id
      left join public.perfis p on p.id = c.consultor_id
      left join public.consultorias co on co.id = c.consultoria_id
      left join public.cliente_checklists cl on cl.id = pg.checklist_id
      -- Só os check-lists com o próximo vencimento antes de hoje têm atrasada; os outros nem olham as tarefas.
      cross join lateral (
        select count(*) as atrasadas
        from public.checklist_tarefas t
        where cl.proximo_vencimento < v_hoje
          and t.checklist_id = cl.id and t.estado in ('a_fazer', 'andamento') and t.vence_em < v_hoje
      ) a
      left join lateral (
        select jsonb_build_object('titulo', t.titulo, 'vence_em', t.vence_em) as proxima
        from public.checklist_tarefas t
        where cl.proximo_vencimento is not null
          and t.checklist_id = cl.id and t.estado in ('a_fazer', 'andamento')
          and not exists (
            select 1 from public.checklist_dependencias d
            join public.checklist_tarefas dt on dt.id = d.depende_de
            where d.tarefa_id = t.id and dt.estado in ('a_fazer', 'andamento'))
        order by t.vence_em, t.posicao
        limit 1
      ) pr on true
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Mesmo corpo de 20261118020729_andamento_dos_checklists.sql; muda só: progresso_medio conta as resolvidas (feitas + não
-- se aplica) e atrasadas e vencem em 7 dias olham só as pendentes.
create or replace function public.indicadores_de_checkins(p_consultoria uuid default null, p_consultor uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_consultor uuid;
  v_hoje date := private.hoje();
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
    v_consultoria := p_consultoria;
    v_consultor := p_consultor;
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
    v_consultor := p_consultor;
  elsif private.liberado() then
    v_recorte := 'pessoa';
    v_consultoria := private.consultoria_atual();
    v_consultor := v_eu;
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with ativos as materialized (
    select cl.id as checklist_id, cl.tarefas, cl.feitas + cl.nao_se_aplica as resolvidas, cl.proximo_vencimento
    from public.clientes c
    left join public.cliente_checklists cl
      on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
    where not c.arquivado
      and c.consultoria_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
      and (v_consultor is null or c.consultor_id = v_consultor)
  ), prazos as (
    -- Só os check-lists com o próximo vencimento até daqui a 7 dias podem ter tarefa atrasada ou vencendo.
    select coalesce(sum(x.atrasadas), 0) as atrasadas, coalesce(sum(x.vencem), 0) as vencem
    from ativos a
    cross join lateral (
      select count(*) filter (where t.vence_em < v_hoje) as atrasadas,
        count(*) filter (where t.vence_em >= v_hoje) as vencem
      from public.checklist_tarefas t
      where t.checklist_id = a.checklist_id and t.estado in ('a_fazer', 'andamento') and t.vence_em <= v_hoje + 7
    ) x
    where a.proximo_vencimento <= v_hoje + 7
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'clientes', (select count(*) from ativos),
    'com_modelo', (select count(a.checklist_id) from ativos a),
    'progresso_medio', (select round(avg(a.resolvidas * 100.0 / a.tarefas))::int from ativos a where a.tarefas > 0),
    'atrasadas', p.atrasadas,
    'vencem_7_dias', p.vencem)
  into v_resultado
  from prazos p;
  return v_resultado;
end $$;

-- ── Histórico ────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261117181313_checklists_dos_clientes.sql; muda só: as colunas tarefa e motivo (da linha "não se
-- aplica"), só para quem vê o nome do modelo do check-list (a Central e a consultoria do check-list). A lista de colunas
-- muda: drop + create, com as permissões de volta.
drop function public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz);

create function public.historico_do_cliente(p_cliente uuid, p_limite int default 15, p_deslocamento int default 0,
  p_de timestamptz default null, p_ate timestamptz default null)
returns table (id uuid, tipo text, em timestamptz, de_horas numeric, para_horas numeric,
  de_consultoria text, para_consultoria text, de_consultor text, para_consultor text, autor text, modelo text,
  tarefa text, motivo text, total bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.tipo, e.em, e.de_horas, e.para_horas,
    private.nome_da_consultoria_visivel(e.de_consultoria),
    private.nome_da_consultoria_visivel(e.para_consultoria),
    private.nome_do_perfil_visivel(e.de_consultor),
    private.nome_do_perfil_visivel(e.para_consultor),
    private.nome_do_perfil_visivel(e.autor),
    private.nome_do_modelo_visivel(e.checklist_id),
    case when e.tipo = 'tarefa_nao_se_aplica' and private.nome_do_modelo_visivel(e.checklist_id) is not null
      then e.tarefa end,
    case when e.tipo = 'tarefa_nao_se_aplica' and private.nome_do_modelo_visivel(e.checklist_id) is not null
      then e.motivo end,
    count(*) over ()
  from public.cliente_eventos e
  where e.cliente_id = p_cliente
    and (p_de is null or e.em >= p_de)
    and (p_ate is null or e.em < p_ate)
  order by e.em desc, e.id
  limit greatest(1, least(coalesce(p_limite, 15), 50))
  offset greatest(0, coalesce(p_deslocamento, 0))
$$;

revoke all on function public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz) from public, anon;
grant execute on function public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz) to authenticated;
