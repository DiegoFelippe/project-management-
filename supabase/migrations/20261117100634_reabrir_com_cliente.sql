-- reabrir_reunioes_do_google (migração 20261117100513_reunioes_remarcar) só reabre as reuniões que a rotina olha: com
-- Meet e com cliente. A sem cliente voltaria a "aguardando" e ficaria assim para sempre (a rotina a ignora). Não muda
-- dado nenhum: só a função.

create or replace function public.reabrir_reunioes_do_google(p_perfil uuid, p_motivos text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  if p_perfil is null or coalesce(cardinality(p_motivos), 0) = 0 then
    return 0;
  end if;
  with reabertas as (
    update public.agenda_eventos e
    set reuniao = 'aguardando', reuniao_erro = null
    where e.consultor_id = p_perfil and e.reuniao = 'erro' and e.reuniao_erro = any (p_motivos)
      and e.meet_codigo is not null and e.cliente_id is not null
      and e.fim <= now() and e.fim > now() - interval '48 hours'
    returning e.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from reabertas;

  insert into private.reunioes_na_rotina as r (evento_id, proxima_em)
  select id, now() from unnest(v_ids) id
  on conflict (evento_id) do update set proxima_em = now(), rodada = null;
  return cardinality(v_ids);
end $$;

revoke all on function public.reabrir_reunioes_do_google(uuid, text[]) from public, anon, authenticated;
grant execute on function public.reabrir_reunioes_do_google(uuid, text[]) to service_role;
