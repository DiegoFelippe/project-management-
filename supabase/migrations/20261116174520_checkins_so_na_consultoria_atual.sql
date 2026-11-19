-- O consultor corrige e apaga os próprios check-ins só enquanto estiver na consultoria deles. Quem saiu da
-- consultoria (foi para outra ou para a central) continua vendo os check-ins antigos, mas não edita nem
-- apaga: as horas são da consultoria em que foram feitas. O ramo de quem cuida da consultoria não muda.

drop policy "o consultor ou quem cuida da consultoria corrige" on public.checkins;
create policy "o consultor ou quem cuida da consultoria corrige" on public.checkins
  for update to authenticated
  using (
    (consultor_id = (select auth.uid())
      and consultoria_id = (select private.consultoria_atual())
      and (select private.liberado()))
    or (consultoria_id = (select private.consultoria_atual())
        and (select private.gerencio_consultoria(private.consultoria_atual())))
  )
  with check (
    (consultor_id = (select auth.uid())
      and consultoria_id = (select private.consultoria_atual())
      and (select private.liberado()))
    or (consultoria_id = (select private.consultoria_atual())
        and (select private.gerencio_consultoria(private.consultoria_atual())))
  );

drop policy "o consultor ou quem cuida da consultoria apaga" on public.checkins;
create policy "o consultor ou quem cuida da consultoria apaga" on public.checkins
  for delete to authenticated
  using (
    (consultor_id = (select auth.uid())
      and consultoria_id = (select private.consultoria_atual())
      and (select private.liberado()))
    or (consultoria_id = (select private.consultoria_atual())
        and (select private.gerencio_consultoria(private.consultoria_atual())))
  );
