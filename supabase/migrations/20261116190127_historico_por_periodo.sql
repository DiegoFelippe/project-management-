-- Histórico do cliente por período (agenda do mês): p_de (inclusivo) e p_ate (exclusivo) opcionais.
-- Mesma regra de nomes visíveis da função anterior (mesmos auxiliares); quem chama com três argumentos continua igual.

drop function public.historico_do_cliente(uuid, int, int);

create function public.historico_do_cliente(p_cliente uuid, p_limite int default 15, p_deslocamento int default 0,
  p_de timestamptz default null, p_ate timestamptz default null)
returns table (id uuid, tipo text, em timestamptz, de_horas numeric, para_horas numeric,
  de_consultoria text, para_consultoria text, de_consultor text, para_consultor text, autor text, total bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.tipo, e.em, e.de_horas, e.para_horas,
    private.nome_da_consultoria_visivel(e.de_consultoria),
    private.nome_da_consultoria_visivel(e.para_consultoria),
    private.nome_do_perfil_visivel(e.de_consultor),
    private.nome_do_perfil_visivel(e.para_consultor),
    private.nome_do_perfil_visivel(e.autor),
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
