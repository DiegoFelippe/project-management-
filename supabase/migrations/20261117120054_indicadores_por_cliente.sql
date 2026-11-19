-- Indicadores da agenda recortados por cliente (pedido do Diego, 17/11): a aba Agenda do cliente é o calendário do menu
-- só com os compromissos daquele cliente, e os 4 números (reuniões na semana e no mês, aguardando transcrição, pastas
-- criadas no mês) contam só as reuniões dele.
--
-- indicadores_da_agenda ganha p_cliente (opcional, padrão nulo = como sempre foi). O filtro entra em todos os ramos de
-- papel, sem mudar quem vê o quê: consultor = os próprios + os convidados; gestão = a consultoria; central = todas.
-- Uma consultoria nunca conta o cliente de outra (o ramo dela já está preso à consultoria). Caminhos por índice: com o
-- plano por chamada (force_custom_plan), "p_cliente is null or e.cliente_id = p_cliente" vira "e.cliente_id = <id>"
-- e o banco pode ir pelo índice do cliente (agenda_eventos_cliente_idx) ou pelos de sempre (consultoria/consultor e
-- início; os parciais de "aguardando"), o que for mais estreito.
--
-- Mudar a lista de parâmetros cria outra função: a antiga sai (nada no banco depende dela) e a nova entra com o mesmo
-- corpo, as mesmas proteções (security definer, search_path vazio, force_custom_plan) e os mesmos grants. Fica uma
-- versão só: as chamadas de hoje (só com p_dia, por nome ou por posição) continuam iguais.

drop function public.indicadores_da_agenda(date);

-- { semana, mes, aguardando, pastas_no_mes } no recorte de quem chama, no dia p_dia (semana de domingo a sábado, mês
-- do dia, no fuso de São Paulo). "Reunião" = evento com cliente ou com Meet; "aguardando" = reunião com cliente
-- esperando a transcrição. p_cliente: só os eventos daquele cliente (nulo = todos).
create function public.indicadores_da_agenda(p_dia date, p_cliente uuid default null) returns jsonb
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
      and (p_cliente is null or e.cliente_id = p_cliente)
    union all
    select e.inicio, e.cliente_id, e.com_meet, e.pasta_id from public.agenda_eventos e
    where v_recorte = 'consultoria' and e.consultoria_id = v_consultoria and e.inicio >= v_de and e.inicio < v_ate
      and (p_cliente is null or e.cliente_id = p_cliente)
    union all
    select e.inicio, e.cliente_id, e.com_meet, e.pasta_id from public.agenda_eventos e
    where v_recorte = 'pessoa' and e.consultor_id = v_eu and e.inicio >= v_de and e.inicio < v_ate
      and (p_cliente is null or e.cliente_id = p_cliente)
    union all
    select e.inicio, e.cliente_id, e.com_meet, e.pasta_id
    from public.agenda_participantes p join public.agenda_eventos e on e.id = p.evento_id
    where v_recorte = 'pessoa' and p.perfil_id = v_eu and e.consultor_id <> v_eu and e.consultoria_id = v_consultoria
      and e.inicio >= v_de and e.inicio < v_ate
      and (p_cliente is null or e.cliente_id = p_cliente)
  ) v;

  -- Só reunião com cliente espera a transcrição (a rotina ignora a sem cliente). Os índices parciais de "aguardando"
  -- (por consultoria e por consultor) continuam servindo: o cliente é conferido na linha.
  select count(*) into v_aguardando
  from (
    select 1 from public.agenda_eventos e
    where v_recorte = 'tudo' and e.reuniao = 'aguardando' and e.cliente_id is not null
      and (p_cliente is null or e.cliente_id = p_cliente)
    union all
    select 1 from public.agenda_eventos e
    where v_recorte = 'consultoria' and e.consultoria_id = v_consultoria and e.reuniao = 'aguardando'
      and e.cliente_id is not null
      and (p_cliente is null or e.cliente_id = p_cliente)
    union all
    select 1 from public.agenda_eventos e
    where v_recorte = 'pessoa' and e.consultor_id = v_eu and e.reuniao = 'aguardando' and e.cliente_id is not null
      and (p_cliente is null or e.cliente_id = p_cliente)
    union all
    select 1 from public.agenda_participantes p join public.agenda_eventos e on e.id = p.evento_id
    where v_recorte = 'pessoa' and p.perfil_id = v_eu and e.consultor_id <> v_eu and e.consultoria_id = v_consultoria
      and e.reuniao = 'aguardando' and e.cliente_id is not null
      and (p_cliente is null or e.cliente_id = p_cliente)
  ) a;

  return jsonb_build_object('semana', v_semana, 'mes', v_mes, 'aguardando', v_aguardando, 'pastas_no_mes', v_pastas);
end $$;

revoke all on function public.indicadores_da_agenda(date, uuid) from public, anon;
grant execute on function public.indicadores_da_agenda(date, uuid) to authenticated, service_role;
