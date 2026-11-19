-- "Não se aplica": a cadeia das dependências, a linha "tarefa reaberta" no Histórico e o motivo que não se troca por
-- cima (revisão da Task 8 e decisão do Diego, 18/11 09:56, "Pode, com cuidado"; desenho em
-- docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md, "Acréscimo de 18/11"). Muda só funções e a regra dos
-- tipos de cliente_eventos; nenhuma linha é alterada ou apagada.
--
-- - Bloqueada pode ser "não se aplica" (com motivo). Cuidado: a que não se aplica só libera as que dependem dela quando
--   as dependências dela também estão resolvidas, pela cadeia: uma dependência conta como resolvida se está feita, ou se
--   não se aplica e nenhuma pendente (a fazer ou em andamento) é alcançada pelas dependências dela atravessando outras
--   que não se aplicam. Ex.: C depende de B, B de A; B não se aplica com A pendente: C espera A. Feita continua contando
--   como resolvida sozinha (como antes: reabrir uma dependência não desfaz a feita).
-- - private.nao_se_aplica_espera(tarefa): a regra, numa função só (marcar_tarefa e andamento_dos_clientes; só é chamada
--   para dependência que não se aplica). checklist_do_cliente calcula a cadeia uma vez por leitura (CTE recursiva).
-- - marcar_tarefa: "não se aplica" não pede as dependências resolvidas (feita e em andamento continuam pedindo, pela
--   cadeia); liberadas olha as que dependem dela atravessando as que não se aplicam; marcar "não se aplica" de novo com
--   outro motivo é recusado (ja_nao_se_aplica: para trocar o motivo, reabre e marca de novo; o mesmo motivo não muda
--   nada); sair de "não se aplica" grava 'tarefa_reaberta' no Histórico (a tarefa e quem).
-- - historico_do_cliente: a tarefa da linha 'tarefa_reaberta' segue a mesma regra da 'tarefa_nao_se_aplica' (só para a
--   Central e a consultoria do check-list).

-- ── Histórico: tipo novo ─────────────────────────────────────────────────────

alter table public.cliente_eventos
  drop constraint cliente_eventos_tipo_check,
  add constraint cliente_eventos_tipo_check check (tipo in ('cadastrado', 'editado', 'enviado', 'movido', 'devolvido',
    'consultor_escolhido', 'consultor_trocado', 'consultor_removido', 'previsao_ajustada', 'arquivado', 'reativado',
    'reuniao_realizada', 'pasta_da_reuniao_criada', 'modelo_aplicado', 'modelo_trocado', 'modelo_tirado',
    'tarefa_nao_se_aplica', 'tarefa_reaberta'));

-- ── A cadeia ─────────────────────────────────────────────────────────────────

-- A tarefa (que não se aplica) ainda espera alguma pendente pela cadeia: uma dependência dela a fazer ou em andamento,
-- direta ou atrás de outras que não se aplicam. Feita interrompe a cadeia. Só as funções do banco chamam.
create function private.nao_se_aplica_espera(p_tarefa uuid) returns boolean
language sql stable set search_path = '' as $$
  with recursive cadeia(id, estado) as (
    select dt.id, dt.estado
    from public.checklist_dependencias d
    join public.checklist_tarefas dt on dt.id = d.depende_de
    where d.tarefa_id = p_tarefa
    union
    select dt.id, dt.estado
    from cadeia c
    join public.checklist_dependencias d on d.tarefa_id = c.id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    where c.estado = 'nao_se_aplica'
  )
  select exists (select 1 from cadeia c where c.estado in ('a_fazer', 'andamento'))
$$;

revoke all on function private.nao_se_aplica_espera(uuid) from public, anon, authenticated;

-- ── Marcar ───────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118120040_tarefa_nao_se_aplica.sql; muda só: (1) "não se aplica" vale também para a bloqueada;
-- feita e em andamento pedem as dependências resolvidas pela cadeia (a que não se aplica conta se não espera nenhuma
-- pendente); (2) liberadas: as pendentes que dependem desta, direto ou atrás de outras que não se aplicam, e agora estão
-- livres; (3) "não se aplica" de novo com outro motivo: ja_nao_se_aplica (o mesmo motivo não muda nada); (4) sair de
-- "não se aplica" grava 'tarefa_reaberta' no Histórico. Recusas: estado_invalido, motivo_obrigatorio, sem_permissao,
-- so_o_consultor_marca, checklist_encerrado, cliente_arquivado, tarefa_bloqueada, ja_nao_se_aplica; motivo acima de 500
-- letras, a regra da coluna (23514). Mesma assinatura (create or replace mantém as permissões; repetidas abaixo).
create or replace function public.marcar_tarefa(p_tarefa uuid, p_estado text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_checklist uuid;
  v_cliente uuid;
  v_antes text;
  v_motivo_antes text;
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

  select t.estado, t.motivo, t.titulo, t.feita_em into v_antes, v_motivo_antes, v_titulo, v_feita_em
  from public.checklist_tarefas t where t.id = p_tarefa;

  -- Já está como "não se aplica" com outro motivo (a tela estava velha): trocar o motivo é reabrir e marcar de novo.
  if v_antes = 'nao_se_aplica' and p_estado = 'nao_se_aplica' and v_motivo is distinct from v_motivo_antes then
    raise exception 'ja_nao_se_aplica' using errcode = 'P0001';
  end if;

  -- O check-in aberto do consultor neste cliente (travado: o check-out espera, e depois dele o check-in não muda mais).
  select k.id into v_checkin from public.checkins k
  where k.consultor_id = v_eu and k.cliente_id = v_cliente and k.fim is null
  for update;

  if v_antes is distinct from p_estado then
    if p_estado in ('feita', 'andamento') and exists (
      select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = p_tarefa
        and (dt.estado in ('a_fazer', 'andamento')
          or (dt.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(dt.id)))) then
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
      with recursive acima(id, estado) as (
        select t.id, t.estado
        from public.checklist_dependencias d
        join public.checklist_tarefas t on t.id = d.tarefa_id
        where d.depende_de = p_tarefa
        union
        select t.id, t.estado
        from acima a
        join public.checklist_dependencias d on d.depende_de = a.id
        join public.checklist_tarefas t on t.id = d.tarefa_id
        where a.estado = 'nao_se_aplica'
      )
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo) order by t.posicao), '[]')
      into v_liberadas
      from (select distinct a.id from acima a where a.estado in ('a_fazer', 'andamento')) x
      join public.checklist_tarefas t on t.id = x.id
      where not exists (
        select 1 from public.checklist_dependencias d2
        join public.checklist_tarefas t2 on t2.id = d2.depende_de
        where d2.tarefa_id = t.id
          and (t2.estado in ('a_fazer', 'andamento')
            or (t2.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(t2.id))));
    end if;

    if p_estado = 'nao_se_aplica' then
      insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa, motivo)
      values (v_cliente, 'tarefa_nao_se_aplica', v_checklist, v_eu, v_titulo, v_motivo);
    elsif v_antes = 'nao_se_aplica' then
      insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa)
      values (v_cliente, 'tarefa_reaberta', v_checklist, v_eu, v_titulo);
    end if;

    perform private.recontar_checklist(v_checklist);
  end if;

  return jsonb_build_object('estado', p_estado, 'feita_em', v_feita_em, 'liberadas', v_liberadas,
    'na_sessao', v_checkin is not null and exists (
      select 1 from public.checkin_tarefas ct where ct.checkin_id = v_checkin and ct.tarefa_id = p_tarefa));
end $$;

revoke all on function public.marcar_tarefa(uuid, text, text) from public, anon;
grant execute on function public.marcar_tarefa(uuid, text, text) to authenticated;

-- ── Ler ──────────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118120040_tarefa_nao_se_aplica.sql; muda só: a tarefa está livre (a "próxima") quando cada
-- dependência está feita, ou não se aplica sem esperar nenhuma pendente pela cadeia; as que não se aplicam e ainda
-- esperam (presas) saem de uma CTE recursiva, uma vez por leitura.
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

  with recursive tarefas as materialized (
    select t.id, t.etapa_id, t.posicao, t.titulo, t.descricao, t.obrigatoria, t.prazo_dias, t.vence_em, t.estado,
      t.nota, t.motivo, t.feita_em, t.feita_por, t.estado in ('a_fazer', 'andamento') as pendente
    from public.checklist_tarefas t
    where t.checklist_id = v_checklist
  ), presas(id) as (
    -- As que não se aplicam e ainda esperam: uma dependência pendente, ou outra presa.
    select d.tarefa_id
    from tarefas n
    join public.checklist_dependencias d on d.tarefa_id = n.id
    join tarefas p on p.id = d.depende_de
    where n.estado = 'nao_se_aplica' and p.pendente
    union
    select d.tarefa_id
    from presas pr
    join public.checklist_dependencias d on d.depende_de = pr.id
    join tarefas n on n.id = d.tarefa_id
    where n.estado = 'nao_se_aplica'
  ), dependencias as (
    select d.tarefa_id, jsonb_agg(d.depende_de order by dt.posicao) as ids,
      bool_and(dt.estado = 'feita' or (dt.estado = 'nao_se_aplica' and pr.id is null)) as livres
    from tarefas t
    join public.checklist_dependencias d on d.tarefa_id = t.id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    left join presas pr on pr.id = d.depende_de
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

revoke all on function public.checklist_do_cliente(uuid) from public, anon;
grant execute on function public.checklist_do_cliente(uuid) to authenticated;

-- ── Andamento ────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118120040_tarefa_nao_se_aplica.sql; muda só: a próxima tarefa de cada linha olha a cadeia (a
-- dependência que não se aplica só conta se não espera nenhuma pendente; a função só roda para essas).
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
            where d.tarefa_id = t.id
              and (dt.estado in ('a_fazer', 'andamento')
                or (dt.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(dt.id))))
        order by t.vence_em, t.posicao
        limit 1
      ) pr on true
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

revoke all on function public.andamento_dos_clientes(uuid, uuid, text, text, int) from public, anon;
grant execute on function public.andamento_dos_clientes(uuid, uuid, text, text, int) to authenticated;

-- ── Histórico ────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118120040_tarefa_nao_se_aplica.sql; muda só: a tarefa da linha 'tarefa_reaberta' segue a regra
-- da 'tarefa_nao_se_aplica' (só para quem vê o nome do modelo do check-list). Mesmas colunas (create or replace mantém
-- as permissões; repetidas abaixo).
create or replace function public.historico_do_cliente(p_cliente uuid, p_limite int default 15,
  p_deslocamento int default 0, p_de timestamptz default null, p_ate timestamptz default null)
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
    case when e.tipo in ('tarefa_nao_se_aplica', 'tarefa_reaberta')
        and private.nome_do_modelo_visivel(e.checklist_id) is not null
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
