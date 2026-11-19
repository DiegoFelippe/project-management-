-- Situação da reunião quando o evento muda (revisão final do Calendário). Não apaga nem muda dado do Diego: só regras
-- novas (um gatilho, uma função) e os indicadores redefinidos.
-- 1. Remarcar uma reunião que já passou para depois de agora: "aguardando", "sem_artefatos" ou "erro" voltam a
--    "agendada", sem o motivo, e a reunião sai de private.reunioes_na_rotina (quem não espera mais fica lá com
--    proxima_em nulo e nunca voltaria): depois do novo fim, a fila 1 da rotina a pega como reunião nova.
-- 2. A reunião que perde o cliente (cliente apagado ou movido para outra consultoria, ou tirado na edição) enquanto
--    espera a transcrição volta a "agendada": a rotina ignora reunião sem cliente, e ela ficaria "aguardando" para
--    sempre. Os indicadores contam "aguardando" só com cliente.
-- 3. reabrir_reunioes_do_google: ao conectar (ou reconectar) o Google, as reuniões do organizador que pararam em "erro"
--    por causa do Google (a Edge Function manda os motivos) e terminaram há menos de 48 h voltam a "aguardando", e a
--    rotina as olha já.

-- ── 1 e 2. Gatilho ───────────────────────────────────────────────────────────

create function private.reuniao_ao_mudar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.fim is distinct from old.fim and new.fim > now() and new.reuniao in ('aguardando', 'sem_artefatos', 'erro'))
     or (old.cliente_id is not null and new.cliente_id is null and new.reuniao = 'aguardando') then
    new.reuniao := 'agendada';
    new.reuniao_erro := null;
    delete from private.reunioes_na_rotina r where r.evento_id = new.id;
  end if;
  return new;
end $$;

revoke all on function private.reuniao_ao_mudar_evento() from public, anon, authenticated;

-- Vale para qualquer caminho: a Edge Function (gravar_evento), o "on delete set null" do cliente apagado e a limpeza
-- do cliente movido (limpar_agenda_do_cliente).
create trigger agenda_eventos_reuniao
  before update on public.agenda_eventos
  for each row
  when (old.fim is distinct from new.fim or old.cliente_id is distinct from new.cliente_id)
  execute function private.reuniao_ao_mudar_evento();

-- ── Indicadores: "aguardando" só com cliente ─────────────────────────────────

create or replace function public.indicadores_da_agenda(p_dia date) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_sem_ini timestamptz := (p_dia - extract(dow from p_dia)::int)::timestamp at time zone 'America/Sao_Paulo';
  v_sem_fim timestamptz := (p_dia - extract(dow from p_dia)::int + 7)::timestamp at time zone 'America/Sao_Paulo';
  v_mes_ini timestamptz := date_trunc('month', p_dia::timestamp) at time zone 'America/Sao_Paulo';
  v_mes_fim timestamptz := (date_trunc('month', p_dia::timestamp) + interval '1 month') at time zone 'America/Sao_Paulo';
  v_de timestamptz;
  v_ate timestamptz;
  v_semana int;
  v_mes int;
  v_pastas int;
  v_aguardando int;
begin
  if p_dia is null then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if private.sou_central() then
    v_recorte := 'tudo';
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() then
    v_recorte := 'pessoa';
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  v_de := least(v_sem_ini, v_mes_ini);
  v_ate := greatest(v_sem_fim, v_mes_fim);

  select
    count(*) filter (where (cliente_id is not null or com_meet) and inicio >= v_sem_ini and inicio < v_sem_fim),
    count(*) filter (where (cliente_id is not null or com_meet) and inicio >= v_mes_ini and inicio < v_mes_fim),
    count(*) filter (where pasta_id is not null and inicio >= v_mes_ini and inicio < v_mes_fim)
  into v_semana, v_mes, v_pastas
  from (
    select e.inicio, e.cliente_id, e.com_meet, e.pasta_id from public.agenda_eventos e
    where v_recorte = 'tudo' and e.inicio >= v_de and e.inicio < v_ate
    union all
    select e.inicio, e.cliente_id, e.com_meet, e.pasta_id from public.agenda_eventos e
    where v_recorte = 'consultoria' and e.consultoria_id = v_consultoria and e.inicio >= v_de and e.inicio < v_ate
    union all
    select e.inicio, e.cliente_id, e.com_meet, e.pasta_id from public.agenda_eventos e
    where v_recorte = 'pessoa' and e.consultor_id = v_eu and e.inicio >= v_de and e.inicio < v_ate
    union all
    select e.inicio, e.cliente_id, e.com_meet, e.pasta_id
    from public.agenda_participantes p join public.agenda_eventos e on e.id = p.evento_id
    where v_recorte = 'pessoa' and p.perfil_id = v_eu and e.consultor_id <> v_eu and e.consultoria_id = v_consultoria
      and e.inicio >= v_de and e.inicio < v_ate
  ) v;

  -- Só reunião com cliente espera a transcrição (a rotina ignora a sem cliente). Os índices parciais de "aguardando"
  -- (por consultoria e por consultor) continuam servindo: o cliente é conferido na linha.
  select count(*) into v_aguardando
  from (
    select 1 from public.agenda_eventos e
    where v_recorte = 'tudo' and e.reuniao = 'aguardando' and e.cliente_id is not null
    union all
    select 1 from public.agenda_eventos e
    where v_recorte = 'consultoria' and e.consultoria_id = v_consultoria and e.reuniao = 'aguardando'
      and e.cliente_id is not null
    union all
    select 1 from public.agenda_eventos e
    where v_recorte = 'pessoa' and e.consultor_id = v_eu and e.reuniao = 'aguardando' and e.cliente_id is not null
    union all
    select 1 from public.agenda_participantes p join public.agenda_eventos e on e.id = p.evento_id
    where v_recorte = 'pessoa' and p.perfil_id = v_eu and e.consultor_id <> v_eu and e.consultoria_id = v_consultoria
      and e.reuniao = 'aguardando' and e.cliente_id is not null
  ) a;

  return jsonb_build_object('semana', v_semana, 'mes', v_mes, 'aguardando', v_aguardando, 'pastas_no_mes', v_pastas);
end $$;

-- ── 3. Reconectar o Google reabre as reuniões paradas por causa dele ─────────

-- Reuniões do organizador p_perfil em "erro" com um dos motivos de p_motivos ("Conecte o Google…", "Reconecte o
-- Google…": a Edge Function manda os textos que ela mesma grava), terminadas há menos de 48 h: voltam a "aguardando",
-- sem o motivo, e a rotina as olha já (proxima_em = agora, fora da rodada anterior). Devolve quantas.
create function public.reabrir_reunioes_do_google(p_perfil uuid, p_motivos text[]) returns int
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
