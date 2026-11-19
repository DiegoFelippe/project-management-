-- Andamento: a cadeia do "não se aplica" uma vez por linha (Task 10, medida com o volume novo). Com 15 linhas de 500
-- tarefas presas pela cadeia de uma que não se aplica, a próxima tarefa chamava private.nao_se_aplica_espera para cada
-- candidata (7.470 vezes por página: ~88 ms, igual no corpo anterior); agora as presas saem de uma CTE recursiva por
-- linha (~31 ms), como em checklist_do_cliente, e só no check-list que tem alguma que não se aplica. Só muda a função;
-- nenhuma linha muda.

-- Mesmo corpo de 20261119134702_tarefa_pausada_tempos_comentarios.sql; muda só: a próxima tarefa de cada linha olha as
-- presas pela cadeia numa CTE recursiva (uma vez por linha) em vez de chamar private.nao_se_aplica_espera por candidata.
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
          and t.checklist_id = cl.id and t.estado in ('a_fazer', 'andamento', 'pausada') and t.vence_em < v_hoje
      ) a
      left join lateral (
        -- As que não se aplicam e ainda esperam (presas pela cadeia), uma vez por linha e só no check-list que tem
        -- alguma que não se aplica: uma dependência pendente, ou outra presa.
        with recursive presas(id) as (
          select d.tarefa_id
          from public.checklist_tarefas n
          join public.checklist_dependencias d on d.tarefa_id = n.id
          join public.checklist_tarefas dp on dp.id = d.depende_de
          where cl.nao_se_aplica > 0 and n.checklist_id = cl.id and n.estado = 'nao_se_aplica'
            and dp.estado in ('a_fazer', 'andamento', 'pausada')
          union
          select d.tarefa_id
          from presas x
          join public.checklist_dependencias d on d.depende_de = x.id
          join public.checklist_tarefas n on n.id = d.tarefa_id
          where n.estado = 'nao_se_aplica'
        )
        select jsonb_build_object('titulo', t.titulo, 'vence_em', t.vence_em) as proxima
        from public.checklist_tarefas t
        where cl.proximo_vencimento is not null
          and t.checklist_id = cl.id and t.estado in ('a_fazer', 'andamento', 'pausada')
          and not exists (
            select 1 from public.checklist_dependencias d
            join public.checklist_tarefas dt on dt.id = d.depende_de
            where d.tarefa_id = t.id
              and (dt.estado in ('a_fazer', 'andamento', 'pausada') or dt.id in (select x.id from presas x)))
        order by t.vence_em, t.posicao
        limit 1
      ) pr on true
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

revoke all on function public.andamento_dos_clientes(uuid, uuid, text, text, int) from public, anon;
grant execute on function public.andamento_dos_clientes(uuid, uuid, text, text, int) to authenticated;
