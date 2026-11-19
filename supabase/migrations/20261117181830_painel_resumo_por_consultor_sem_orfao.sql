-- Resumo por consultor (private.checkins_horas_consultor_mes), rodada de correção 2 (revisão de 17/11).
-- 1. Apagar uma pessoa com check-ins voltava a falhar (23503, "Database error deleting user"): o perfil apagado leva
--    junto (cascata) os check-ins e as linhas do resumo dela; os gatilhos dos check-ins apagados (e o do cliente, que
--    fecha o check-in aberto quando o consultor sai) rodam depois e tentavam recriar a linha do resumo para um
--    consultor que não existe mais. Agora o resumo só ganha ou muda linha de quem ainda tem perfil: de quem foi apagado
--    não sobra nada (a cascata já levou as linhas dele). A chave para perfis continua.
-- 2. private.recalcular_horas_mes() (a ferramenta de conserto) refaz também o resumo por consultor. Ela não roda aqui.

create or replace function private.somar_horas_consultor_mes(p_consultor uuid, p_consultoria uuid, p_inicio timestamptz, p_segundos numeric)
returns void language sql security definer set search_path = '' as $$
  insert into private.checkins_horas_consultor_mes (consultor_id, consultoria_id, mes, segundos)
  select p_consultor, p_consultoria, date_trunc('month', p_inicio at time zone 'America/Sao_Paulo')::date, p_segundos
  where exists (select 1 from public.perfis p where p.id = p_consultor)
  on conflict (consultor_id, consultoria_id, mes)
    do update set segundos = private.checkins_horas_consultor_mes.segundos + excluded.segundos
$$;

-- Refaz os dois resumos a partir dos check-ins (mesma regra dos gatilhos: só fechados, mês do início em São Paulo),
-- com checkins travada (leituras seguem, escritas esperam). Só apaga e refaz as tabelas de resumo.
create or replace function private.recalcular_horas_mes() returns void
language plpgsql security definer set search_path = '' as $$
begin
  lock table public.checkins in share row exclusive mode;
  delete from public.checkins_horas_mes;
  insert into public.checkins_horas_mes (consultoria_id, mes, segundos)
  select k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
    sum(extract(epoch from k.fim - k.inicio))
  from public.checkins k
  where k.fim is not null
  group by 1, 2;
  delete from private.checkins_horas_consultor_mes;
  insert into private.checkins_horas_consultor_mes (consultor_id, consultoria_id, mes, segundos)
  select k.consultor_id, k.consultoria_id, date_trunc('month', k.inicio at time zone 'America/Sao_Paulo')::date,
    sum(extract(epoch from k.fim - k.inicio))
  from public.checkins k
  where k.fim is not null
  group by 1, 2, 3;
end $$;
