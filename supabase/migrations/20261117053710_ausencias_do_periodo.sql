-- Camada "Ausências" do calendário: as ausências do período com o nome de quem se ausenta, no recorte de quem chama
-- (a mesma regra de leitura da tabela ausencias: central e dono todas; admin e gestor as da consultoria; consultor as
-- próprias). Uma função do banco porque o gestor lê as ausências da consultoria mas nem sempre o perfil de cada
-- consultor (RLS de perfis): pela tabela, o nome viria nulo. Quem pode ver as linhas da tabela não muda.

-- Central lê o período por data; admin/gestor e consultor já usam (perfil_id, de).
create index ausencias_de_idx on public.ausencias (de);

-- { itens: [{ id, perfil_id, de, ate, motivo, pessoa: { id, nome, cor } }], ha_mais }. Ausência dura no máximo 366
-- dias (check da tabela), então de >= p_de - 366 limita a busca. p_limite (até 1000) corta a lista.
create function public.ausencias_do_periodo(
  p_de date, p_ate date, p_consultor uuid default null, p_consultoria uuid default null, p_limite int default 1000
) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 1000);
  v_itens jsonb;
  v_total int;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() then
    v_recorte := 'pessoa';
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null then
    return jsonb_build_object('itens', '[]'::jsonb, 'ha_mais', false);
  end if;

  with ids as (
    select t.id, t.de from (
      select a.id, a.de from public.ausencias a
      where v_recorte = 'tudo'
        and a.de >= p_de - 366 and a.de <= p_ate and a.ate >= p_de
        and (p_consultor is null or a.perfil_id = p_consultor)
        and (p_consultoria is null or a.perfil_id in (select p.id from public.perfis p where p.consultoria_id = p_consultoria))
      union all
      select a.id, a.de
      from public.perfis p join public.ausencias a on a.perfil_id = p.id
      where v_recorte = 'consultoria' and p.consultoria_id = v_consultoria
        and a.de >= p_de - 366 and a.de <= p_ate and a.ate >= p_de
        and (p_consultor is null or a.perfil_id = p_consultor)
        and (p_consultoria is null or p_consultoria = v_consultoria)
      union all
      select a.id, a.de from public.ausencias a
      where v_recorte = 'pessoa' and a.perfil_id = v_eu
        and a.de >= p_de - 366 and a.de <= p_ate and a.ate >= p_de
        and (p_consultor is null or p_consultor = v_eu)
    ) t
    order by t.de, t.id
    limit v_limite + 1
  ), lista as (
    select a.id, a.perfil_id, a.de, a.ate, a.motivo, pe.nome, pe.cor,
      row_number() over (order by a.de, a.id) as rn
    from ids
    join public.ausencias a on a.id = ids.id
    join public.perfis pe on pe.id = a.perfil_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'perfil_id', l.perfil_id, 'de', l.de, 'ate', l.ate,
           'motivo', l.motivo, 'pessoa', jsonb_build_object('id', l.perfil_id, 'nome', l.nome, 'cor', l.cor))
           order by l.rn) filter (where l.rn <= v_limite), '[]'::jsonb),
         count(*)
  into v_itens, v_total
  from lista l;

  return jsonb_build_object('itens', v_itens, 'ha_mais', v_total > v_limite);
end $$;

revoke all on function public.ausencias_do_periodo(date, date, uuid, uuid, int) from public, anon;
grant execute on function public.ausencias_do_periodo(date, date, uuid, uuid, int) to authenticated;
