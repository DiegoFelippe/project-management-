-- Lote C2 da auditoria, a parte do banco, e três acertos (plano docs/superpowers/plans/2026-11-17-auditoria-ux.md;
-- relatório .superpowers/sdd/2026-11-17-auditoria-ux/lote-c2-banco-report.md):
-- 1. U6 (pedido do Diego, 18/11, usabilidade): tirar ou trocar um check-list que ninguém tocou apaga em vez de encerrar.
--    Tocado (private.checklist_intocado): alguma tarefa fora de "a fazer", nota, trecho de tempo, comentário, linha em
--    check-in ou linha de tarefa no Histórico. O apagado sai com etapas, tarefas e dependências, e o cliente deixa de
--    ficar preso a ele (cliente com check-list não se apaga). O Histórico continua com as linhas do modelo (aplicado,
--    trocado, tirado): antes de apagar, o nome do modelo e a consultoria do check-list vão para cliente_eventos.modelo e
--    modelo_consultoria, e historico_do_cliente mostra o nome com a regra de sempre (a Central e a consultoria do
--    check-list). tirar_modelo passa a devolver 'apagado' ou 'encerrado' (sai e volta: drop + create);
--    checklist_do_cliente ganha checklist.intocado, para a confirmação dizer qual dos dois vai acontecer.
--    travar_para_gerenciar: o check-list que sumiu enquanto esperava a trava também é checklist_encerrado.
-- 2. U5 (Usuários, cartão "Acima de 100%"): pessoas_acima_de_100 devolve as linhas de perfis de quem passa de 100% no
--    mês, com a conta e o recorte do cartão (indicadores_de_usuarios); a tela pede colunas, ordem e página pela API.
-- 3. "Desfazer" dos avisos de Mandar para consultoria e Escolher consultor (U3): desfazer_envio e desfazer_escolha voltam
--    atrás só se o cliente está como a ação deixou; senão, cliente_mudou (P0001) e nada muda.
-- 4. O relógio da tarefa: marcar_tarefa fecha o trecho em greatest(now(), inicio). Duas chamadas quase juntas na mesma
--    tarefa (duas abas): a que começou antes e grava depois fechava com fim antes do início e caía na regra da coluna.
-- 5. horas_do_cliente_por_consultor e checkins_do_cliente_por_semana (o mês): os limites saem prontos de um CTE
--    materialized e entram como subconsultas escalares, como nas do período (20261119142801). Com o RLS de checkins, o
--    Postgres só leva ao índice uma comparação sem função que não seja leakproof, e as duas varriam a tabela.
-- Nenhuma linha muda; cliente_eventos ganha duas colunas nulas.

begin;

-- ── Histórico: o modelo do check-list apagado ────────────────────────────────
-- Preenchidas só quando o check-list da linha é apagado (o checklist_id fica nulo). Sem chave para consultorias, como
-- de_consultoria e para_consultoria (apagar uma consultoria não mexe na história).
alter table public.cliente_eventos
  add column modelo text,
  add column modelo_consultoria uuid;

-- ── Tirar e trocar: o intocado se apaga ──────────────────────────────────────

-- Ninguém tocou o check-list: toda tarefa a fazer e sem nota, nenhum trecho de tempo, comentário ou linha em check-in, e
-- nenhuma linha de tarefa no Histórico (uma tarefa que não se aplicou e foi reaberta deixa as duas linhas). Só as funções
-- do banco chamam, com o check-list travado.
create function private.checklist_intocado(p_checklist uuid) returns boolean
language sql stable set search_path = '' as $$
  select not exists (
      select 1 from public.checklist_tarefas t
      where t.checklist_id = p_checklist
        and (t.estado <> 'a_fazer' or t.nota is not null
          or exists (select 1 from public.checklist_tarefa_tempos tt where tt.tarefa_id = t.id)
          or exists (select 1 from public.checklist_comentarios m where m.tarefa_id = t.id)
          or exists (select 1 from public.checkin_tarefas ct where ct.tarefa_id = t.id)))
    and not exists (
      select 1 from public.cliente_eventos e
      where e.checklist_id = p_checklist and e.tipo in ('tarefa_nao_se_aplica', 'tarefa_reaberta', 'motivo_trocado'))
$$;

-- Apaga o check-list (etapas, tarefas e dependências vão junto). As linhas dele no Histórico ficam, com o nome do modelo
-- e a consultoria do check-list (o checklist_id delas fica nulo).
create function private.apagar_checklist(p_checklist uuid) returns void
language sql set search_path = '' as $$
  update public.cliente_eventos e set modelo = cl.modelo_nome, modelo_consultoria = cl.consultoria_id
  from public.cliente_checklists cl
  where cl.id = p_checklist and e.checklist_id = cl.id;
  delete from public.cliente_checklists where id = p_checklist;
$$;

revoke all on function private.checklist_intocado(uuid), private.apagar_checklist(uuid) from public, anon, authenticated;

-- Mesmo corpo de 20261118020729_andamento_dos_checklists.sql; muda só: o check-list que não existe mais (apagado por quem
-- tirou ou trocou antes, enquanto esta chamada esperava a trava) também é checklist_encerrado.
create or replace function private.travar_para_gerenciar(p_cliente uuid, p_checklist uuid default null) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_consultoria uuid;
  v_arquivado boolean;
  v_encerrado timestamptz;
begin
  if not (private.sou_central() or exists (
    select 1 from public.clientes c where c.id = p_cliente and private.gerencio_consultoria(c.consultoria_id))) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select c.consultoria_id, c.arquivado into v_consultoria, v_arquivado
  from public.clientes c where c.id = p_cliente for no key update;
  -- o cliente pode ter mudado enquanto esperava a trava
  if not found or not (private.sou_central() or private.gerencio_consultoria(v_consultoria)) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_checklist is not null then
    select cl.encerrado_em into v_encerrado from public.cliente_checklists cl where cl.id = p_checklist for update;
    if not found or v_encerrado is not null then
      raise exception 'checklist_encerrado' using errcode = 'P0001';
    end if;
  end if;
  if v_arquivado then
    raise exception 'cliente_arquivado' using errcode = 'P0001';
  end if;
  return v_consultoria;
end $$;

revoke all on function private.travar_para_gerenciar(uuid, uuid) from public, anon, authenticated;

-- Mesmo corpo de 20261117181313_checklists_dos_clientes.sql; muda só: o ativo intocado se apaga em vez de encerrar
-- ('trocado'). O Histórico registra modelo_trocado do mesmo jeito. Mesma assinatura.
create or replace function public.aplicar_modelo(p_cliente uuid, p_modelo uuid, p_inicio date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_consultoria uuid;
  v_modelo_nome text;
  v_anterior uuid;
  v_id uuid;
begin
  v_consultoria := private.travar_para_gerenciar(p_cliente);
  if v_consultoria is null then
    raise exception 'cliente_sem_consultoria' using errcode = 'P0001';
  end if;
  if not private.inicio_valido(p_inicio) then
    raise exception 'inicio_invalido' using errcode = 'P0001';
  end if;
  -- O modelo fica travado durante a cópia: salvar_modelo (que regrava tudo) e apagar esperam.
  select m.nome into v_modelo_nome
  from public.modelos m
  where m.id = p_modelo and m.arquivado_em is null and (m.consultoria_id is null or m.consultoria_id = v_consultoria)
  for share;
  if v_modelo_nome is null then
    raise exception 'modelo_indisponivel' using errcode = 'P0001';
  end if;

  select cl.id into v_anterior from public.cliente_checklists cl
  where cl.cliente_id = p_cliente and cl.encerrado_em is null;
  if v_anterior is not null and private.checklist_intocado(v_anterior) then
    perform private.apagar_checklist(v_anterior);
  else
    update public.cliente_checklists
    set encerrado_em = now(), encerrado_por = v_eu, motivo = 'trocado'
    where id = v_anterior;
  end if;

  insert into public.cliente_checklists (cliente_id, consultoria_id, modelo_id, modelo_nome, inicio, aplicado_por)
  values (p_cliente, v_consultoria, p_modelo, v_modelo_nome, p_inicio, v_eu)
  returning id into v_id;

  insert into public.checklist_etapas (checklist_id, nome, posicao)
  select v_id, e.nome, e.posicao from public.modelo_etapas e where e.modelo_id = p_modelo;

  insert into public.checklist_tarefas (checklist_id, etapa_id, titulo, descricao, obrigatoria, prazo_dias, vence_em,
    posicao, origem)
  select v_id, ce.id, t.titulo, t.descricao, t.obrigatoria, t.prazo_dias, p_inicio + t.prazo_dias, t.posicao, t.id
  from public.modelo_tarefas t
  join public.modelo_etapas e on e.id = t.etapa_id
  join public.checklist_etapas ce on ce.checklist_id = v_id and ce.posicao = e.posicao
  where t.modelo_id = p_modelo;

  -- Só dependência do mesmo modelo e para tarefa anterior: a ordem do check-list é a do modelo, e toda seta anda para
  -- trás (nunca há ciclo).
  insert into public.checklist_dependencias (checklist_id, tarefa_id, depende_de)
  select v_id, ct.id, cd.id
  from public.modelo_tarefas t
  join public.modelo_dependencias d on d.tarefa_id = t.id
  join public.modelo_tarefas dt on dt.id = d.depende_de and dt.modelo_id = p_modelo and dt.posicao < t.posicao
  join public.checklist_tarefas ct on ct.checklist_id = v_id and ct.posicao = t.posicao
  join public.checklist_tarefas cd on cd.checklist_id = v_id and cd.posicao = dt.posicao
  where t.modelo_id = p_modelo;

  perform private.recontar_checklist(v_id);

  insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor)
  values (p_cliente, case when v_anterior is null then 'modelo_aplicado' else 'modelo_trocado' end, v_id, v_eu);

  return v_id;
end $$;

revoke all on function public.aplicar_modelo(uuid, uuid, date) from public, anon;
grant execute on function public.aplicar_modelo(uuid, uuid, date) to authenticated;

-- Mesmo corpo de 20261117181313_checklists_dos_clientes.sql; muda só: o intocado se apaga em vez de encerrar, e a função
-- devolve o que aconteceu: 'apagado' ou 'encerrado' (vira histórico, como antes). O Histórico ganha modelo_tirado nos
-- dois casos. Recusas: sem_permissao (também o check-list que não existe mais), checklist_encerrado, cliente_arquivado.
drop function public.tirar_modelo(uuid);
create function public.tirar_modelo(p_checklist uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente uuid;
begin
  select cl.cliente_id into v_cliente from public.cliente_checklists cl where cl.id = p_checklist;
  if v_cliente is null or not private.vejo_checklist(p_checklist) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform private.travar_para_gerenciar(v_cliente, p_checklist);

  insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor)
  values (v_cliente, 'modelo_tirado', p_checklist, (select auth.uid()));
  if private.checklist_intocado(p_checklist) then
    perform private.apagar_checklist(p_checklist);
    return 'apagado';
  end if;
  update public.cliente_checklists
  set encerrado_em = now(), encerrado_por = (select auth.uid()), motivo = 'tirado'
  where id = p_checklist;
  return 'encerrado';
end $$;

revoke all on function public.tirar_modelo(uuid) from public, anon;
grant execute on function public.tirar_modelo(uuid) to authenticated;

-- Mesmo corpo de 20261119134702_tarefa_pausada_tempos_comentarios.sql; muda só: checklist.intocado (tirar ou trocar
-- apaga). Mesmas colunas.
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
      t.nota, t.motivo, t.feita_em, t.feita_por, t.estado in ('a_fazer', 'andamento', 'pausada') as pendente
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
  ), tempos as (
    select tt.tarefa_id,
      floor(sum(extract(epoch from coalesce(tt.fim, now()) - tt.inicio)))::bigint as segundos,
      max(tt.inicio) filter (where tt.fim is null) as aberto_desde
    from tarefas t
    join public.checklist_tarefa_tempos tt on tt.tarefa_id = t.id
    group by tt.tarefa_id
  ), comentarios as (
    select m.tarefa_id, count(*) as n
    from tarefas t
    join public.checklist_comentarios m on m.tarefa_id = t.id
    group by m.tarefa_id
  ), na_sessao as (
    select ct.tarefa_id from public.checkin_tarefas ct where ct.checkin_id = v_checkin
  ), nomes as (
    select x.id, private.nome_do_perfil_visivel(x.id) as nome
    from (select distinct t.feita_por as id from tarefas t where t.feita_por is not null) x
  ), completas as (
    select t.*, coalesce(d.ids, '[]'::jsonb) as depende_de, coalesce(d.livres, true) as livre,
      s.tarefa_id is not null as na_sessao, n.nome as feita_por_nome,
      coalesce(tp.segundos, 0) as tempo_segundos, tp.aberto_desde, coalesce(cm.n, 0) as comentarios
    from tarefas t
    left join dependencias d on d.tarefa_id = t.id
    left join na_sessao s on s.tarefa_id = t.id
    left join nomes n on n.id = t.feita_por
    left join tempos tp on tp.tarefa_id = t.id
    left join comentarios cm on cm.tarefa_id = t.id
  )
  select jsonb_build_object(
    'pode_aplicar', private.gerencio_checklist_do_cliente(p_cliente),
    'pode_marcar', v_checklist is not null and private.marco_no_checklist(v_checklist),
    'pode_comentar', v_checklist is not null and private.comento_no_checklist(v_checklist),
    'consultor', case when v_consultor is not null then
      jsonb_build_object('id', v_consultor, 'nome', private.nome_do_perfil_visivel(v_consultor)) end,
    'checklist', (
      select jsonb_build_object('id', cl.id, 'modelo_id', cl.modelo_id, 'modelo_nome', cl.modelo_nome,
        'inicio', cl.inicio, 'aplicado_em', cl.aplicado_em,
        'aplicado_por', jsonb_build_object('nome', private.nome_do_perfil_visivel(cl.aplicado_por)),
        'intocado', private.checklist_intocado(cl.id))
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
        'depende_de', c.depende_de, 'na_sessao', c.na_sessao, 'tempo_segundos', c.tempo_segundos,
        'trecho_aberto_desde', c.aberto_desde, 'comentarios', c.comentarios) order by c.posicao)
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

-- Mesmo corpo de 20261119134702_tarefa_pausada_tempos_comentarios.sql; muda só: a coluna modelo também vem das linhas do
-- check-list apagado (cliente_eventos.modelo), para a Central e para a consultoria daquele check-list. Mesmas colunas.
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
    coalesce(private.nome_do_modelo_visivel(e.checklist_id),
      case when e.modelo is not null and (private.sou_central()
          or (private.liberado() and e.modelo_consultoria = private.consultoria_atual())) then e.modelo end),
    case when e.tipo in ('tarefa_nao_se_aplica', 'tarefa_reaberta', 'motivo_trocado')
        and private.nome_do_modelo_visivel(e.checklist_id) is not null
      then e.tarefa end,
    case when e.tipo in ('tarefa_nao_se_aplica', 'motivo_trocado')
        and private.nome_do_modelo_visivel(e.checklist_id) is not null
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

-- ── O relógio da tarefa ──────────────────────────────────────────────────────

-- Mesmo corpo de 20261119134702_tarefa_pausada_tempos_comentarios.sql; muda só: o trecho aberto fecha em
-- greatest(now(), inicio). Mesma assinatura.
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
  v_tempo bigint;
  v_aberto timestamptz;
begin
  if p_estado is null or p_estado not in ('a_fazer', 'andamento', 'pausada', 'feita', 'nao_se_aplica') then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;
  if p_estado = 'nao_se_aplica' and v_motivo is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  select o_checklist, o_cliente into v_checklist, v_cliente from private.travar_para_marcar(p_tarefa);

  select t.estado, t.motivo, t.titulo, t.feita_em into v_antes, v_motivo_antes, v_titulo, v_feita_em
  from public.checklist_tarefas t where t.id = p_tarefa;

  -- Já está como "não se aplica" com outro motivo (a tela estava velha): trocar o motivo é pelo trocar_motivo.
  if v_antes = 'nao_se_aplica' and p_estado = 'nao_se_aplica' and v_motivo is distinct from v_motivo_antes then
    raise exception 'ja_nao_se_aplica' using errcode = 'P0001';
  end if;

  -- O check-in aberto do consultor neste cliente (travado: o check-out espera, e depois dele o check-in não muda mais).
  select k.id into v_checkin from public.checkins k
  where k.consultor_id = v_eu and k.cliente_id = v_cliente and k.fim is null
  for update;

  if v_antes is distinct from p_estado then
    if (p_estado in ('feita', 'andamento') or (p_estado = 'pausada' and v_antes <> 'andamento')) and exists (
      select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = p_tarefa
        and (dt.estado in ('a_fazer', 'andamento', 'pausada')
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

    -- O relógio da tarefa.
    if p_estado = 'andamento' then
      insert into public.checklist_tarefa_tempos (tarefa_id, pessoa_id) values (p_tarefa, v_eu)
      on conflict (tarefa_id) where fim is null do nothing;
    else
      -- quem começou antes e grava depois (duas abas) não fecha o trecho antes do início dele
      update public.checklist_tarefa_tempos set fim = greatest(now(), inicio) where tarefa_id = p_tarefa and fim is null;
    end if;

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
      from (select distinct a.id from acima a where a.estado in ('a_fazer', 'andamento', 'pausada')) x
      join public.checklist_tarefas t on t.id = x.id
      where not exists (
        select 1 from public.checklist_dependencias d2
        join public.checklist_tarefas t2 on t2.id = d2.depende_de
        where d2.tarefa_id = t.id
          and (t2.estado in ('a_fazer', 'andamento', 'pausada')
            or (t2.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(t2.id))));
    end if;

    if p_estado = 'nao_se_aplica' then
      insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa, motivo, tarefa_id)
      values (v_cliente, 'tarefa_nao_se_aplica', v_checklist, v_eu, v_titulo, v_motivo, p_tarefa);
    elsif v_antes = 'nao_se_aplica' and p_estado = 'a_fazer' then
      insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa, tarefa_id)
      values (v_cliente, 'tarefa_reaberta', v_checklist, v_eu, v_titulo, p_tarefa);
    end if;

    perform private.recontar_checklist(v_checklist);
  end if;

  select floor(coalesce(sum(extract(epoch from coalesce(tt.fim, now()) - tt.inicio)), 0))::bigint,
    max(tt.inicio) filter (where tt.fim is null)
  into v_tempo, v_aberto
  from public.checklist_tarefa_tempos tt where tt.tarefa_id = p_tarefa;

  return jsonb_build_object('estado', p_estado, 'feita_em', v_feita_em, 'liberadas', v_liberadas,
    'na_sessao', v_checkin is not null and exists (
      select 1 from public.checkin_tarefas ct where ct.checkin_id = v_checkin and ct.tarefa_id = p_tarefa),
    'tempo_segundos', v_tempo, 'trecho_aberto_desde', v_aberto);
end $$;

revoke all on function public.marcar_tarefa(uuid, text, text) from public, anon;
grant execute on function public.marcar_tarefa(uuid, text, text) to authenticated;

-- ── Usuários: o filtro do cartão "Acima de 100%" ─────────────────────────────

-- As pessoas que passam de 100% de ocupação no mês p_mes (nulo = o atual; mês passado = utilização), pela conta do
-- cartão (private.ocupacao_dos_consultores, taxa > 1) e no recorte dele: a central e o dono, todas ou as de
-- p_consultoria; os outros, a consultoria deles e só quem a regra de leitura de perfis deixa ver (vejo_perfil: o
-- administrador, a consultoria; o gestor, ele, quem ele criou e quem está nos times dele). Devolve linhas de perfis: a tela
-- pede as colunas, os embutidos, os filtros, a ordem e a página pela API, como na lista. Sessão não liberada: sem_permissao.
create function public.pessoas_acima_de_100(p_mes date default null, p_consultoria uuid default null)
returns setof public.perfis
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date,
    date_trunc('month', now() at time zone 'America/Sao_Paulo')::date);
  v_consultoria uuid;
begin
  if private.sou_central() then
    v_consultoria := p_consultoria;
  elsif private.liberado() then
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  return query
  select p.*
  from private.ocupacao_dos_consultores(v_consultoria, v_inicio, null) x
  join public.perfis p on p.id = x.id
  where x.taxa > 1 and private.vejo_perfil(p.id);
end $$;

revoke all on function public.pessoas_acima_de_100(date, uuid) from public, anon;
grant execute on function public.pessoas_acima_de_100(date, uuid) to authenticated;

-- ── Desfazer (avisos de Mandar e Escolher) ───────────────────────────────────
-- security invoker: a escrita é a de sempre (a RLS e o gatilho de clientes decidem quem pode). Travam o cliente antes de
-- conferir: quem mexe nele ao mesmo tempo espera, e a conferência vê o que ficou. Quem não alcança o cliente para mudar:
-- sem_permissao.

-- Mandar para consultoria (a Central): devolve o cliente à Central só se ele está como o envio deixou, na consultoria
-- p_consultoria, sem consultor, sem check-list ativo e não arquivado. Senão, cliente_mudou (a consultoria pode ter
-- escolhido o consultor nos 10 s do aviso) e nada muda.
create function public.desfazer_envio(p_cliente uuid, p_consultoria uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_consultoria uuid;
  v_consultor uuid;
  v_arquivado boolean;
begin
  select c.consultoria_id, c.consultor_id, c.arquivado into v_consultoria, v_consultor, v_arquivado
  from public.clientes c where c.id = p_cliente for update;
  if not found then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_consultoria is distinct from p_consultoria or v_consultor is not null or v_arquivado or exists (
    select 1 from public.cliente_checklists cl where cl.cliente_id = p_cliente and cl.encerrado_em is null) then
    raise exception 'cliente_mudou' using errcode = 'P0001';
  end if;
  update public.clientes set consultoria_id = null where id = p_cliente;
end $$;

-- Escolher consultor (a gestão): o cliente volta a aguardar consultor só se o consultor ainda é p_consultor, sem
-- check-in aberto no cliente (tirar o consultor fecharia o check-in) e o cliente não foi arquivado. Senão, cliente_mudou.
create function public.desfazer_escolha(p_cliente uuid, p_consultor uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_consultor uuid;
  v_arquivado boolean;
begin
  select c.consultor_id, c.arquivado into v_consultor, v_arquivado
  from public.clientes c where c.id = p_cliente for update;
  if not found then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_consultor is distinct from p_consultor or v_arquivado or exists (
    select 1 from public.checkins k where k.cliente_id = p_cliente and k.fim is null) then
    raise exception 'cliente_mudou' using errcode = 'P0001';
  end if;
  update public.clientes set consultor_id = null where id = p_cliente;
end $$;

revoke all on function public.desfazer_envio(uuid, uuid), public.desfazer_escolha(uuid, uuid) from public, anon;
grant execute on function public.desfazer_envio(uuid, uuid), public.desfazer_escolha(uuid, uuid) to authenticated;

-- ── Gráficos do cliente no mês ───────────────────────────────────────────────

-- Mesmo corpo de 20261116184025_graficos_do_cliente.sql; muda só: o começo e o fim do mês saem prontos de mes
-- (materialized) e entram na leitura de checkins como subconsultas escalares. Mesmas colunas.
create or replace function public.horas_do_cliente_por_consultor(p_cliente uuid, p_mes date default null)
returns table (consultor_id uuid, nome text, horas numeric)
language sql stable security invoker set search_path = '' as $$
  with mes as materialized (
    select x.dia::timestamp at time zone 'America/Sao_Paulo' as de, (x.dia + interval '1 month') at time zone 'America/Sao_Paulo' as ate
    from (select date_trunc('month', coalesce(p_mes::timestamp, now() at time zone 'America/Sao_Paulo'))::date as dia) x
  ), somas as (
    select k.consultor_id, round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) as horas
    from public.checkins k
    where k.cliente_id = p_cliente
      and k.fim is not null
      and k.inicio >= (select mes.de from mes)
      and k.inicio < (select mes.ate from mes)
    group by k.consultor_id
  )
  select s.consultor_id, private.nome_do_perfil_visivel(s.consultor_id), s.horas
  from somas s
  order by s.horas desc, private.nome_do_perfil_visivel(s.consultor_id) nulls last, s.consultor_id
$$;

-- Mesmo corpo de 20261116184025_graficos_do_cliente.sql; muda só: o começo e o fim do mês saem prontos de mes
-- (materialized) e entram na leitura de checkins como subconsultas escalares. Mesmas colunas.
create or replace function public.checkins_do_cliente_por_semana(p_cliente uuid, p_mes date default null)
returns table (semana date, quantidade int, horas numeric)
language sql stable security invoker set search_path = '' as $$
  with mes as materialized (
    select x.dia, x.dia::timestamp at time zone 'America/Sao_Paulo' as de,
      (x.dia + interval '1 month') at time zone 'America/Sao_Paulo' as ate
    from (select date_trunc('month', coalesce(p_mes::timestamp, now() at time zone 'America/Sao_Paulo'))::date as dia) x
  ), semanas as (
    select s::date as semana
    from mes, generate_series(date_trunc('week', mes.dia::timestamp),
      (mes.dia + interval '1 month' - interval '1 day')::date, interval '7 days') s
  ), dentro as (
    select date_trunc('week', k.inicio at time zone 'America/Sao_Paulo')::date as semana,
      extract(epoch from k.fim - k.inicio) as segundos
    from public.checkins k
    where k.cliente_id = p_cliente
      and k.fim is not null
      and k.inicio >= (select mes.de from mes)
      and k.inicio < (select mes.ate from mes)
  )
  select s.semana, count(d.semana)::int, coalesce(round(sum(d.segundos) / 3600, 1), 0)
  from semanas s
  left join dentro d on d.semana = s.semana
  group by s.semana
  order by s.semana
$$;

revoke all on function public.horas_do_cliente_por_consultor(uuid, date), public.checkins_do_cliente_por_semana(uuid, date)
  from public, anon;
grant execute on function public.horas_do_cliente_por_consultor(uuid, date), public.checkins_do_cliente_por_semana(uuid, date)
  to authenticated;

commit;
