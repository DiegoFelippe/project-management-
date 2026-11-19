-- Quadros de consultorias anteriores para a central (plano docs/superpowers/plans/2026-11-17-kanban-do-cliente.md, Task 4;
-- desenho docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md, "Cliente muda de consultoria": a central vê os
-- quadros de todas as consultorias que atenderam o cliente, só para ler — mesmo molde de Arquivos e Check-ins). Só cria
-- duas funções de leitura, redefine uma (mesma assinatura) e tira uma regra que não valia mais: nenhuma linha que já
-- existe é alterada ou apagada.
--
-- - quadros_do_cliente(p_cliente): os quadros do cliente (um por consultoria que o atendeu), o da consultoria que atende
--   hoje primeiro, para o seletor "Consultoria" da barra do quadro. Só a central e o dono: quem é de consultoria veria
--   que outra consultoria atendeu o cliente.
-- - quadro_por_id(p_quadro): o mesmo que quadro_do_cliente devolve, mas pelo id do quadro (a central abre o quadro de uma
--   consultoria anterior). Passa pela mesma regra de quem vê o quadro (private.vejo_quadro): a consultoria só alcança o
--   quadro atual do cliente; o de outra consultoria (ou o próprio, depois que o cliente saiu dela) volta nulo. Nunca cria
--   quadro.
-- - cartoes_arquivados: cada item traz criado_por (a janela de arquivados mostra Apagar a quem criou e à gestão, a mesma
--   regra de apagar_cartao).
-- - Sobra da Task 3: a regra "apagar cartão" de public.cartoes não valia mais (o delete foi tirado de quem está logado em
--   20261117144310_quadro_ao_vivo.sql; cartão só se apaga por apagar_cartao, que confere quem criou ou a gestão).

-- ── Os quadros do cliente (central e dono) ──────────────────────────────────

-- [{ id, consultoria: { id, nome }, atual, criado_em }]: atual = o quadro da consultoria que atende o cliente hoje.
-- Ordem: o atual, depois os mais novos. Cliente sem quadro (ou que não existe): lista vazia. Quem não é da central (ou
-- sessão não liberada): sem_permissao. Pelo índice único (cliente_id, consultoria_id) dos quadros.
create function public.quadros_do_cliente(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.sou_central() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'consultoria', jsonb_build_object('id', s.id, 'nome', s.nome),
        'atual', q.consultoria_id is not distinct from c.consultoria_id,
        'criado_em', q.criado_em)
      order by (q.consultoria_id is not distinct from c.consultoria_id) desc, q.criado_em desc, q.id)
    from public.quadros q
    join public.clientes c on c.id = q.cliente_id
    join public.consultorias s on s.id = q.consultoria_id
    where q.cliente_id = p_cliente
  ), '[]'::jsonb);
end $$;

-- ── Um quadro pelo id ───────────────────────────────────────────────────────

-- Mesmo formato de quadro_do_cliente: { id, cliente_id, consultoria_id, criado_em, pode_mexer, pode_gerir, colunas: [{ id,
-- nome, cor, concluidos, posicao, cartoes, arquivados }] }. Nulo quando o quadro não existe ou a pessoa não o vê. Sessão
-- não liberada: sem_permissao.
create function public.quadro_por_id(p_quadro uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if not private.vejo_quadro(p_quadro) then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'id', q.id, 'cliente_id', q.cliente_id, 'consultoria_id', q.consultoria_id, 'criado_em', q.criado_em,
      'pode_mexer', private.mexo_no_quadro(q.id), 'pode_gerir', private.gerencio_quadro(q.id),
      'colunas', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'cor', c.cor, 'concluidos', c.concluidos,
          'posicao', c.posicao, 'cartoes', n.ativos, 'arquivados', n.arquivados) order by c.posicao, c.id)
        from public.quadro_colunas c
        cross join lateral (
          select count(*) filter (where k.arquivado_em is null) as ativos,
                 count(*) filter (where k.arquivado_em is not null) as arquivados
          from public.cartoes k where k.coluna_id = c.id
        ) n
        where c.quadro_id = q.id
      ), '[]'::jsonb))
    from public.quadros q where q.id = p_quadro
  );
end $$;

-- ── Arquivados com quem criou ───────────────────────────────────────────────

-- Mesmo corpo de 20261117112951_quadro.sql, com 'criado_por' em cada item. Mesma assinatura: fica com as permissões.
create or replace function public.cartoes_arquivados(p_quadro uuid, p_busca text default null, p_pagina int default 1)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_padrao text := private.padrao_de_busca(p_busca);
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
  v_itens jsonb;
begin
  if not private.vejo_quadro(p_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with filtrados as materialized (
    select k.id, k.arquivado_em
    from public.cartoes k
    where k.quadro_id = p_quadro
      and k.arquivado_em is not null
      and (v_padrao is null or k.busca like v_padrao escape '\')
  ), pagina as (
    select f.id from filtrados f order by f.arquivado_em desc, f.id limit 15 offset (v_pagina - 1) * 15
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'titulo', k.titulo, 'prioridade', k.prioridade, 'prazo', k.prazo,
        'arquivado_em', k.arquivado_em, 'criado_em', k.criado_em, 'criado_por', k.criado_por,
        'coluna', jsonb_build_object('id', c.id, 'nome', c.nome)
      ) order by k.arquivado_em desc, k.id)
      from pagina pg
      join public.cartoes k on k.id = pg.id
      join public.quadro_colunas c on c.id = k.coluna_id
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- ── A regra que não valia mais ──────────────────────────────────────────────

drop policy "apagar cartão" on public.cartoes;

-- ── Permissões da API ───────────────────────────────────────────────────────

revoke all on function public.quadros_do_cliente(uuid), public.quadro_por_id(uuid) from public, anon;
grant execute on function public.quadros_do_cliente(uuid), public.quadro_por_id(uuid) to authenticated;
