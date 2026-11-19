-- Cor do avatar também em consultores_por_ocupacao: o seletor de consultor (filtro e janela "escolher o consultor")
-- desenha o Avatar de cada linha, que usa a cor escolhida pela pessoa (perfis.cor; nula = cor automática).
-- A coluna entra no fim da tabela devolvida; o resto (regra de quem vê, ordem, busca, paginação) não muda.
-- Mudar o tipo de retorno exige recriar a função: ela é descartada e criada de novo, com as mesmas permissões.

drop function public.consultores_por_ocupacao(uuid, text, int, int, date);

create function public.consultores_por_ocupacao(
  p_consultoria uuid default null,
  p_busca text default null,
  p_limite int default 8,
  p_deslocamento int default 0,
  p_mes date default null)
returns table (id uuid, nome text, email text, foto text, papel text, consultoria_id uuid,
  consultoria_nome text, carga_semanal numeric, capacidade numeric, reservado numeric, realizado numeric,
  ocupacao numeric, clientes int, total bigint, cor text)
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
  v_passado boolean := v_inicio < v_mes_atual;
  v_padrao text := private.padrao_de_busca(p_busca);
begin
  if not (private.sou_central() or private.gerencio_consultoria(p_consultoria)) then
    return;
  end if;

  return query
  with linhas as (
    select p.id, p.nome, p.email, p.foto, p.papel, p.consultoria_id, co.nome as consultoria_nome,
      p.carga_semanal, x.capacidade, x.reservado, x.realizado, x.quantos, x.taxa, p.cor
    from private.ocupacao_dos_consultores(p_consultoria, v_inicio, null) x
    join public.perfis p on p.id = x.id
    join public.consultorias co on co.id = p.consultoria_id
    where (p_consultoria is null or p.consultoria_id = p_consultoria)
      and (v_padrao is null or private.sem_acento(p.nome || ' ' || p.email) like v_padrao escape '\')
  )
  select l.id, l.nome, l.email, l.foto, l.papel, l.consultoria_id, l.consultoria_nome,
    l.carga_semanal::numeric, l.capacidade,
    case when not v_passado then l.reservado end,
    l.realizado, round(l.taxa, 4), l.quantos::int, count(*) over (), l.cor
  from linhas l
  order by l.capacidade = 0, l.taxa, l.nome, l.id
  limit least(greatest(coalesce(p_limite, 8), 1), 50)
  offset greatest(coalesce(p_deslocamento, 0), 0);
end $$;

revoke all on function public.consultores_por_ocupacao(uuid, text, int, int, date) from public, anon, service_role;
grant execute on function public.consultores_por_ocupacao(uuid, text, int, int, date) to authenticated;
