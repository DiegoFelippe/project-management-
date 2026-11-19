-- Eventos do cliente (pedido do Diego, 17/11): embaixo da agenda do cliente, no lugar do detalhe do dia e dos próximos
-- 7 dias, uma tabela com todos os eventos daquele cliente, de todas as datas, 15 por página, do mais novo para o mais
-- antigo. Só uma função de leitura e um índice: nenhuma linha é alterada ou apagada.
--
-- 1. Índice (cliente_id, inicio desc, id desc): a página sai do índice já na ordem (sem ordenar a lista do cliente) e o
--    total conta só as linhas do cliente. Ele cobre o antigo (cliente_id), que sai: a chave estrangeira para clientes
--    (on delete set null) e os filtros por cliente da agenda e dos indicadores usam o novo do mesmo jeito.
-- 2. eventos_do_cliente(p_cliente, p_pagina): quem vê o quê é o mesmo da agenda do cliente (eventos_do_periodo com
--    p_cliente): consultor = os próprios + os convidados (na própria consultoria); gestão = a consultoria; central =
--    todas. Cada item sai de private.evento_em_json, igual ao da agenda (mesmos campos e nomes, nada a mais).

create index agenda_eventos_cliente_inicio_idx on public.agenda_eventos (cliente_id, inicio desc, id desc);
drop index public.agenda_eventos_cliente_idx;

-- { itens, total, proximo }: a página p_pagina (15 por página; 0, negativa ou nula = 1) dos eventos do cliente que quem
-- chama vê, por início do mais novo para o mais antigo (o futuro em cima); total = quantos são; proximo = o id do
-- primeiro que ainda não começou (nulo se não há). Página que passou do fim: itens vazio, com o total. Cliente nulo, que
-- não existe ou que a pessoa não alcança: lista vazia (nada diz que o cliente existe). Sessão que não está liberada
-- (ex.: aal1 de quem precisa do código): sem_permissao.
create function public.eventos_do_cliente(p_cliente uuid, p_pagina int default 1) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
  v_itens jsonb;
  v_proximo uuid;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if private.sou_central() then
    v_recorte := 'tudo';
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  else
    v_recorte := 'pessoa';
    v_consultoria := private.consultoria_atual();
  end if;
  if p_cliente is null then
    return jsonb_build_object('itens', '[]'::jsonb, 'total', 0, 'proximo', null);
  end if;

  -- Os eventos do cliente que a pessoa vê (as mesmas regras de eventos_do_periodo). Com o plano por chamada, o recorte
  -- vira constante e cada uso abaixo vai pelo índice do cliente: o total conta, a página lê 15 já na ordem e o próximo
  -- lê um só, do outro lado do índice.
  with visiveis as not materialized (
    select e.id, e.inicio from public.agenda_eventos e
    where e.cliente_id = p_cliente
      and (v_recorte = 'tudo'
        or (v_recorte = 'consultoria' and e.consultoria_id = v_consultoria)
        or (v_recorte = 'pessoa' and (
          e.consultor_id = v_eu
          or (e.consultoria_id = v_consultoria and exists (
            select 1 from public.agenda_participantes p where p.evento_id = e.id and p.perfil_id = v_eu))
        )))
  ), pagina as (
    select v.id from visiveis v
    order by v.inicio desc, v.id desc
    limit 15 offset (v_pagina - 1) * 15
  )
  select
    (select count(*)::int from visiveis),
    coalesce((
      select jsonb_agg(private.evento_em_json(e) order by e.inicio desc, e.id desc)
      from pagina pg join public.agenda_eventos e on e.id = pg.id
    ), '[]'::jsonb),
    (select v.id from visiveis v where v.inicio > now() order by v.inicio, v.id limit 1)
  into v_total, v_itens, v_proximo;

  return jsonb_build_object('itens', v_itens, 'total', v_total, 'proximo', v_proximo);
end $$;

revoke all on function public.eventos_do_cliente(uuid, int) from public, anon, service_role;
grant execute on function public.eventos_do_cliente(uuid, int) to authenticated;
