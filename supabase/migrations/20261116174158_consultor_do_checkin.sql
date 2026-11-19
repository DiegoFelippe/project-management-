-- select=...,consultor:consultor_do_checkin(nome): o nome de quem fez o check-in, no molde de
-- public.consultor(clientes). O gestor vê os check-ins da consultoria inteira, mas em perfis só enxerga quem
-- ele criou e as pessoas dos times dele: pelo embutido comum (consultor:perfis) o nome vinha vazio ("—").
-- A função ignora os dados da linha recebida (que podem ser forjados), relê o check-in guardado com aquele
-- id e devolve o perfil só para quem enxerga o check-in: o próprio consultor, quem cuida da consultoria do
-- check-in ou a central.
create function public.consultor_do_checkin(public.checkins) returns setof public.perfis
language sql stable security definer rows 1 set search_path = '' as $$
  select p.*
  from public.checkins k
  join public.perfis p on p.id = k.consultor_id
  where k.id = ($1).id
    and (private.sou_central()
      or private.gerencio_consultoria(k.consultoria_id)
      or (k.consultor_id = (select auth.uid()) and private.liberado()))
$$;

revoke all on function public.consultor_do_checkin(public.checkins) from public, anon;
grant execute on function public.consultor_do_checkin(public.checkins) to authenticated;
