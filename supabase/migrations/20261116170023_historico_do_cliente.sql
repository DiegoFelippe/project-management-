-- Histórico do cliente com nomes. cliente_eventos guarda só ids; quem lê é a consultoria, que nunca pode ver
-- o nome de outra. As funções de apoio devolvem o nome só para a central ou para a própria consultoria.

create function private.nome_da_consultoria_visivel(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select c.nome from public.consultorias c
  where c.id = p_id
    and (private.sou_central() or c.id = private.consultoria_atual())
$$;

-- Pessoa da própria consultoria: o nome. Pessoa da central vista por consultoria: "Central".
create function private.nome_do_perfil_visivel(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when private.sou_central() then p.nome
    when p.papel in ('central', 'dono') then 'Central'
    when p.consultoria_id = private.consultoria_atual() then p.nome
  end
  from public.perfis p
  where p.id = p_id
$$;

revoke all on function private.nome_da_consultoria_visivel(uuid), private.nome_do_perfil_visivel(uuid) from public, anon;
grant execute on function private.nome_da_consultoria_visivel(uuid), private.nome_do_perfil_visivel(uuid) to authenticated;

-- security invoker: a política de cliente_eventos decide quais eventos a pessoa lê.
create function public.historico_do_cliente(p_cliente uuid, p_limite int default 15, p_deslocamento int default 0)
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
  order by e.em desc, e.id
  limit greatest(1, least(coalesce(p_limite, 15), 50))
  offset greatest(0, coalesce(p_deslocamento, 0))
$$;

revoke all on function public.historico_do_cliente(uuid, int, int) from public, anon;
grant execute on function public.historico_do_cliente(uuid, int, int) to authenticated;
