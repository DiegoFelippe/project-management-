-- pessoas_acima_de_100 (20261119150755_tirar_intocado_acima_de_100_e_desfazer.sql) com o recorte do cartão escrito como
-- em indicadores_de_usuarios (20261117134652_indicadores_das_telas.sql), em vez de private.vejo_perfil linha a linha: com
-- 3.000 consultores (ocupacao_volume.test.sql), a central esperava ~850 ms pelas 2.250 chamadas de vejo_perfil; o cartão,
-- ~120 ms. O recorte é o mesmo (é a regra de leitura de perfis): a central e o dono, todas ou as de p_consultoria; o
-- administrador, a consultoria dele; os outros, eles, quem criaram e quem está nos times deles. Nenhuma linha muda.

begin;

-- Mesmo corpo de 20261119150755_tirar_intocado_acima_de_100_e_desfazer.sql; muda só: o recorte (v_ids, como o cartão)
-- no lugar de vejo_perfil. Mesma assinatura.
-- As pessoas que passam de 100% de ocupação no mês p_mes (nulo = o atual; mês passado = utilização), pela conta e no
-- recorte do cartão "Acima de 100%". Devolve linhas de perfis: a tela pede as colunas, os embutidos, os filtros, a ordem e
-- a página pela API, como na lista. Sessão não liberada: sem_permissao.
create or replace function public.pessoas_acima_de_100(p_mes date default null, p_consultoria uuid default null)
returns setof public.perfis
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date,
    date_trunc('month', now() at time zone 'America/Sao_Paulo')::date);
  v_consultoria uuid;
  v_ids uuid[];
begin
  if private.sou_central() then
    v_consultoria := p_consultoria;
  elsif private.sou_admin() then
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() then
    v_consultoria := private.consultoria_atual();
    select coalesce(array_agg(p.id), '{}') into v_ids
    from public.perfis p
    where p.id = v_eu or (p.consultoria_id = v_consultoria and (p.criado_por = v_eu or exists (
      select 1 from public.time_membros m join public.times t on t.id = m.time_id
      where m.pessoa_id = p.id and t.gestor_id = v_eu)));
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  return query
  select p.*
  from private.ocupacao_dos_consultores(v_consultoria, v_inicio, v_ids) x
  join public.perfis p on p.id = x.id
  where x.taxa > 1;
end $$;

revoke all on function public.pessoas_acima_de_100(date, uuid) from public, anon;
grant execute on function public.pessoas_acima_de_100(date, uuid) to authenticated;

commit;
