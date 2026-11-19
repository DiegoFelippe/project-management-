-- Depois da reunião, ajustes da revisão (a migração 20261117074858_reunioes_depois continua valendo; aqui só muda):
-- 1. Reunião sem cliente fica fora da rotina (nem pergunta ao Google, nem muda a situação). Se o cliente entrar depois,
--    a rotina a pega sozinha, desde que esteja a até 48 h do fim; depois disso, só pelo "Buscar agora".
-- 2. Espaçamento: até 2 h depois do fim, a reunião é olhada a cada rotina; depois, no máximo uma vez por hora até as
--    48 h. A Edge Function diz quando olhar de novo (reunioes_liberar, p_proxima_em) e a rotina só pega as que já
--    deram a hora (private.reunioes_na_rotina.proxima_em, com índice). A reunião olhada numa rotina não volta na mesma
--    rotina (rodada).
-- 3. Recorte por consultorias (p_consultorias): só os testes passam, para a rotina deles não mexer nas reuniões de
--    verdade do banco local. O pg_cron nunca passa.
-- Não apaga nem muda dado do Diego: só a tabela de reservas (criada hoje, vazia) ganha colunas.

alter table private.reunioes_na_rotina
  add column proxima_em timestamptz,
  add column rodada uuid;

-- Quem já estava reservado ou olhado e ainda espera: pode ser olhado já.
update private.reunioes_na_rotina r
set proxima_em = now()
from public.agenda_eventos e
where e.id = r.evento_id and e.reuniao in ('agendada', 'aguardando');

create index reunioes_na_rotina_proxima_idx on private.reunioes_na_rotina (proxima_em) where proxima_em is not null;

-- As reuniões que a rotina ainda não olhou: com Meet, com cliente, agendadas, pelo fim.
drop index public.agenda_eventos_reuniao_a_buscar_idx;
create index agenda_eventos_reuniao_nova_idx on public.agenda_eventos (fim)
  where reuniao = 'agendada' and meet_codigo is not null and cliente_id is not null;

-- ── Reservar ─────────────────────────────────────────────────────────────────

drop function public.reunioes_reservar(uuid, uuid, int, int);

-- Reserva reuniões para p_dono por p_minutos. Com p_evento: só ela, se ninguém está com ela (quem chama confere a
-- situação). Sem p_evento, até p_limite reuniões terminadas, com Meet e com cliente, nesta ordem:
--   1. agendadas que terminaram há até 48 h e a rotina ainda não olhou (as mais antigas primeiro);
--   2. as que a rotina já olhou e deram a hora de olhar de novo (proxima_em), fora as olhadas nesta mesma rotina
--      (rodada = p_dono); agendadas só até 48 h do fim, aguardando até a rotina fechar (48 h → sem_artefatos);
--   3. as que estão aguardando sem passar pela rotina (situação posta por fora dela).
-- p_consultorias (só os testes): só reuniões dessas consultorias.
create function public.reunioes_reservar(p_dono uuid, p_evento uuid default null, p_limite int default 5,
  p_minutos int default 5, p_consultorias uuid[] default null) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_ate timestamptz := now() + make_interval(mins => greatest(1, least(coalesce(p_minutos, 5), 30)));
  v_limite int := greatest(1, least(coalesce(p_limite, 5), 50));
  v_ids uuid[];
  v_mais uuid[];
begin
  if p_dono is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  if p_evento is not null then
    select coalesce(array_agg(x.id), '{}') into v_ids from (
      select e.id
      from public.agenda_eventos e
      left join private.reunioes_na_rotina r on r.evento_id = e.id
      where e.id = p_evento and (r.reservada_ate is null or r.reservada_ate < now())
      for no key update of e skip locked
    ) x;
  else
    select coalesce(array_agg(x.id), '{}') into v_ids from (
      select e.id
      from public.agenda_eventos e
      where e.reuniao = 'agendada' and e.meet_codigo is not null and e.cliente_id is not null
        and e.fim <= now() and e.fim > now() - interval '48 hours'
        and (p_consultorias is null or e.consultoria_id = any (p_consultorias))
        and not exists (select 1 from private.reunioes_na_rotina r where r.evento_id = e.id)
      order by e.fim
      limit v_limite
      for no key update of e skip locked
    ) x;

    if cardinality(v_ids) < v_limite then
      select coalesce(array_agg(x.id), '{}') into v_mais from (
        select e.id
        from private.reunioes_na_rotina r
        join public.agenda_eventos e on e.id = r.evento_id
        where r.proxima_em <= now() and r.rodada is distinct from p_dono
          and (r.reservada_ate is null or r.reservada_ate < now())
          and e.reuniao in ('agendada', 'aguardando') and e.meet_codigo is not null and e.cliente_id is not null
          and e.fim <= now() and (e.reuniao = 'aguardando' or e.fim > now() - interval '48 hours')
          and (p_consultorias is null or e.consultoria_id = any (p_consultorias))
        order by r.proxima_em
        limit v_limite - cardinality(v_ids)
        for no key update of e skip locked
      ) x;
      v_ids := v_ids || v_mais;
    end if;

    if cardinality(v_ids) < v_limite then
      select coalesce(array_agg(x.id), '{}') into v_mais from (
        select e.id
        from public.agenda_eventos e
        where e.reuniao = 'aguardando' and e.meet_codigo is not null and e.cliente_id is not null and e.fim <= now()
          and (p_consultorias is null or e.consultoria_id = any (p_consultorias))
          and not exists (select 1 from private.reunioes_na_rotina r where r.evento_id = e.id)
        order by e.fim
        limit v_limite - cardinality(v_ids)
        for no key update of e skip locked
      ) x;
      v_ids := v_ids || v_mais;
    end if;
  end if;

  -- Reservada e nunca solta (a função parou no meio): proxima_em = agora, e a rotina a pega quando a reserva vencer.
  with reservadas as (
    insert into private.reunioes_na_rotina as r (evento_id, dono, reservada_ate, proxima_em)
    select id, p_dono, v_ate, now() from unnest(v_ids) id
    on conflict (evento_id) do update set dono = excluded.dono, reservada_ate = excluded.reservada_ate
      where r.reservada_ate is null or r.reservada_ate < now()
    returning r.evento_id
  )
  select coalesce(array_agg(evento_id), '{}') into v_ids from reservadas;
  return v_ids;
end $$;

-- ── Liberar ──────────────────────────────────────────────────────────────────

drop function public.reunioes_liberar(uuid, uuid);

-- Solta a reunião (só quem a reservou), anota que foi olhada nesta rotina e quando olhar de novo: p_proxima_em (a
-- Edge Function calcula pelo fim da reunião; padrão: daqui a 5 minutos, até no máximo 1 dia). Reunião que não espera
-- mais não volta para a rotina.
create function public.reunioes_liberar(p_evento uuid, p_dono uuid, p_proxima_em timestamptz default null)
returns void language sql security definer set search_path = '' as $$
  update private.reunioes_na_rotina r
  set dono = null, reservada_ate = null, buscada_em = now(), rodada = p_dono,
    proxima_em = case when e.reuniao in ('agendada', 'aguardando')
      then least(coalesce(p_proxima_em, now() + interval '5 minutes'), now() + interval '1 day') end
  from public.agenda_eventos e
  where r.evento_id = p_evento and r.dono = p_dono and e.id = r.evento_id
$$;

-- ── O que o pg_cron roda ─────────────────────────────────────────────────────

-- Só chama a função quando a rotina tem o que fazer (as mesmas três filas de reunioes_reservar).
create or replace function private.chamar_reunioes_depois() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_segredo text;
begin
  if not exists (
    select 1 from public.agenda_eventos e
    where e.reuniao = 'agendada' and e.meet_codigo is not null and e.cliente_id is not null
      and e.fim <= now() and e.fim > now() - interval '48 hours'
      and not exists (select 1 from private.reunioes_na_rotina r where r.evento_id = e.id)
  ) and not exists (
    select 1 from private.reunioes_na_rotina r
    join public.agenda_eventos e on e.id = r.evento_id
    where r.proxima_em <= now()
      and e.reuniao in ('agendada', 'aguardando') and e.meet_codigo is not null and e.cliente_id is not null
      and e.fim <= now() and (e.reuniao = 'aguardando' or e.fim > now() - interval '48 hours')
  ) and not exists (
    select 1 from public.agenda_eventos e
    where e.reuniao = 'aguardando' and e.meet_codigo is not null and e.cliente_id is not null and e.fim <= now()
      and not exists (select 1 from private.reunioes_na_rotina r where r.evento_id = e.id)
  ) then
    return null;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'reunioes_depois_url' limit 1;
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'reunioes_depois_segredo' limit 1;
  if v_url is null or v_segredo is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-rotina-segredo', v_segredo),
    timeout_milliseconds := 300000
  );
end $$;

-- ── Permissões ───────────────────────────────────────────────────────────────

revoke all on function public.reunioes_reservar(uuid, uuid, int, int, uuid[]),
  public.reunioes_liberar(uuid, uuid, timestamptz), private.chamar_reunioes_depois()
  from public, anon, authenticated;
grant execute on function public.reunioes_reservar(uuid, uuid, int, int, uuid[]),
  public.reunioes_liberar(uuid, uuid, timestamptz)
  to service_role;
