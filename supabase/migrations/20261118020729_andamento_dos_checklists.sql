-- Andamento dos clientes no check-list (desenho em docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md, "Aba
-- Andamento" e "Escala"; plano em docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 6): a tabela e os
-- cartões da aba Andamento de Check-ins, e três ajustes da revisão da Task 2 (20261117181313_checklists_dos_clientes.sql).
-- Nenhuma linha é alterada ou apagada.
--
-- - andamento_dos_clientes: os clientes ativos que estão numa consultoria, no recorte de quem vê (o consultor, os dele; a
--   gestão, os da consultoria; a Central, todos ou os da consultoria do filtro), 15 por página, com o check-list ativo de
--   cada um. Situação, busca, ordem e o progresso saem dos contadores do check-list (tarefas, feitas, próximo
--   vencimento) sem varrer tarefas; atrasadas e próxima tarefa, só para as 15 linhas da página.
-- - indicadores_de_checkins: os 4 cartões, no mesmo recorte e com os filtros de consultoria e consultor (a situação e a
--   busca não mudam os cartões). As tarefas que vencem (atrasadas e as dos próximos 7 dias) só são contadas nos
--   check-lists cujo próximo vencimento já cai nessa janela, uma busca no índice das não feitas por check-list.
-- - Ajustes da revisão da Task 2: índice comum em cliente_checklists (modelo_id) para a chave do modelo (on delete set
--   null também passa pelos encerrados); a trava do cliente em aplicar, mudar o início e tirar passa a ser "for no key
--   update" (a mesma fila entre quem aplica e quem marca, sem segurar a chave do cliente para quem grava check-ins,
--   eventos e outras tabelas que apontam para ele); uso_do_modelo conta só os clientes que quem chama vê ("uma
--   consultoria nunca vê clientes de outra" vale também para o número). modelos_da_lista e indicadores_de_modelos já
--   contavam "clientes usando" no recorte de quem vê (checklists.test.sql confere).

-- ── Ajustes da revisão da Task 2 ─────────────────────────────────────────────

-- Apagar um modelo põe modelo_id nulo em todos os check-lists dele, também nos encerrados: o índice parcial
-- (cliente_checklists_modelo_idx, só os ativos) não serve para achá-los.
create index cliente_checklists_modelo_id_idx on public.cliente_checklists (modelo_id);

-- travar_para_gerenciar (20261117181313_checklists_dos_clientes.sql) trava o cliente com "for no key update" em vez de
-- "for update": quem aplica, troca, tira ou muda o início continua esperando quem marca (for share) e vice-versa, mas
-- não segura mais a chave do cliente (inserir check-in, evento ou arquivo do cliente não espera). O resto é igual;
-- mesma assinatura (create or replace mantém as permissões: só as funções do banco chamam).
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
    if v_encerrado is not null then
      raise exception 'checklist_encerrado' using errcode = 'P0001';
    end if;
  end if;
  if v_arquivado then
    raise exception 'cliente_arquivado' using errcode = 'P0001';
  end if;
  return v_consultoria;
end $$;

revoke all on function private.travar_para_gerenciar(uuid, uuid) from public, anon, authenticated;

-- uso_do_modelo (20261117181313_checklists_dos_clientes.sql): clientes passa a contar só os check-lists ativos do modelo
-- que quem chama vê, no mesmo recorte dos nomes (a Central, todos; a gestão, os da consultoria; o consultor, os dele). A
-- tela já diz "N clientes que você vê usam". Apagar continua recusado pelo gatilho modelo_em_uso, que olha todos. O
-- resto é igual; mesma assinatura (create or replace mantém as permissões).
create or replace function public.uso_do_modelo(p_modelo uuid) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_central boolean;
  v_minha uuid;
  v_gestao boolean;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if not private.vejo_modelo(p_modelo) then
    return null;
  end if;
  v_central := private.sou_central();
  v_minha := private.consultoria_atual();
  v_gestao := not v_central and private.gerencio_consultoria(v_minha);

  return jsonb_build_object(
    'clientes', case when v_central then
        (select count(*) from public.cliente_checklists cl where cl.modelo_id = p_modelo and cl.encerrado_em is null)
      else
        (select count(*) from public.cliente_checklists cl
          join public.clientes c on c.id = cl.cliente_id
          where cl.modelo_id = p_modelo and cl.encerrado_em is null and cl.consultoria_id = v_minha
            and (v_gestao or c.consultor_id = v_eu))
      end,
    'nomes', coalesce((
      select jsonb_agg(x.nome order by x.nome, x.id)
      from (
        select c.id, c.nome
        from public.cliente_checklists cl
        join public.clientes c on c.id = cl.cliente_id
        where cl.modelo_id = p_modelo and cl.encerrado_em is null
          and (v_central
            or (v_gestao and cl.consultoria_id = v_minha)
            or (cl.consultoria_id = v_minha and c.consultor_id = v_eu))
        order by c.nome, c.id
        limit 5) x), '[]'::jsonb));
end $$;

-- ── Andamento ────────────────────────────────────────────────────────────────

-- A tabela "Andamento dos clientes": { itens: [{ cliente: { id, nome, cidade, uf }, consultor: { id, nome, foto, cor } |
-- null, consultoria: { id, nome } | null (só para a Central), pode_aplicar, checklist: null | { id, modelo_nome, tarefas,
-- feitas, pct, atrasadas, proxima: { titulo, vence_em } | null } }], total }.
-- - Quem: os clientes ativos que estão numa consultoria (a Central, todos ou os de p_consultoria; a gestão, os da
--   consultoria dela; o consultor, os dele). p_consultor filtra a Central e a gestão; o consultor não passa filtro de
--   outra pessoa nem de outra consultoria (os dois são ignorados).
-- - p_situacao: 'todos' (ou nula), 'com_atraso' (o check-list ativo tem o próximo vencimento antes de hoje) ou
--   'sem_modelo' (sem check-list ativo); outra: filtro_invalido (22023).
-- - p_busca: sem acento e sem maiúscula, no cliente (nome, razão social, cidade e CNPJ, a busca da lista de Clientes) e
--   no nome do modelo do check-list ativo.
-- - Ordem: o próximo vencimento (o mais antigo primeiro), os com check-list sem prazo pendente, os sem modelo; em cada
--   um, o nome. 15 por página (p_pagina a partir de 1; página que não existe volta vazia, com o total).
-- - pct: feitas ÷ tarefas, em %. Atrasadas: não feitas que venceram antes de hoje (mesmo bloqueadas). Próxima: a de data
--   mais cedo entre as não feitas e não bloqueadas (todas as dependências feitas), a mesma de checklist_do_cliente.
-- - pode_aplicar: a Central e a gestão (aplicar, trocar, tirar); o consultor só acompanha.
-- Sessão não liberada: sem_permissao. Nomes pela regra de private.nome_do_perfil_visivel.
create function public.andamento_dos_clientes(p_consultoria uuid default null, p_consultor uuid default null,
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
          'pct', case when cl.tarefas > 0 then round(cl.feitas * 100.0 / cl.tarefas)::int else 0 end,
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
          and t.checklist_id = cl.id and t.estado <> 'feita' and t.vence_em < v_hoje
      ) a
      left join lateral (
        select jsonb_build_object('titulo', t.titulo, 'vence_em', t.vence_em) as proxima
        from public.checklist_tarefas t
        where cl.proximo_vencimento is not null
          and t.checklist_id = cl.id and t.estado <> 'feita'
          and not exists (
            select 1 from public.checklist_dependencias d
            join public.checklist_tarefas dt on dt.id = d.depende_de
            where d.tarefa_id = t.id and dt.estado <> 'feita')
        order by t.vence_em, t.posicao
        limit 1
      ) pr on true
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Os cartões da aba Andamento: { recorte: 'tudo' | 'consultoria' | 'pessoa', clientes, com_modelo, progresso_medio,
-- atrasadas, vencem_7_dias }, no recorte e com os filtros de andamento_dos_clientes (consultoria e consultor; a
-- situação e a busca não entram).
-- - clientes: os clientes ativos numa consultoria; com_modelo: os que têm check-list ativo.
-- - progresso_medio: a média do progresso (feitas ÷ tarefas) dos check-lists, em % inteiro; nulo sem check-list.
-- - atrasadas: tarefas não feitas que venceram antes de hoje; vencem_7_dias: não feitas que vencem de hoje até daqui a 7
--   dias (as duas mesmo bloqueadas, como no resumo do check-list do cliente).
-- Sessão não liberada: sem_permissao.
create function public.indicadores_de_checkins(p_consultoria uuid default null, p_consultor uuid default null)
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
    select cl.id as checklist_id, cl.tarefas, cl.feitas, cl.proximo_vencimento
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
      where t.checklist_id = a.checklist_id and t.estado <> 'feita' and t.vence_em <= v_hoje + 7
    ) x
    where a.proximo_vencimento <= v_hoje + 7
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'clientes', (select count(*) from ativos),
    'com_modelo', (select count(a.checklist_id) from ativos a),
    'progresso_medio', (select round(avg(a.feitas * 100.0 / a.tarefas))::int from ativos a where a.tarefas > 0),
    'atrasadas', p.atrasadas,
    'vencem_7_dias', p.vencem)
  into v_resultado
  from prazos p;
  return v_resultado;
end $$;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on function public.andamento_dos_clientes(uuid, uuid, text, text, int),
  public.indicadores_de_checkins(uuid, uuid) from public, anon;
grant execute on function public.andamento_dos_clientes(uuid, uuid, text, text, int),
  public.indicadores_de_checkins(uuid, uuid) to authenticated;
