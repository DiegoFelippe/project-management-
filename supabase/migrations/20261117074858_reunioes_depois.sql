-- Depois da reunião: a pasta no cliente com a transcrição e a documentação (desenho em
-- docs/superpowers/specs/2026-11-16-calendario-design.md, "Depois da reunião: a pasta no cliente").
-- A Edge Function reunioes-depois (service_role) faz o trabalho; este arquivo dá a ela:
-- 1. O histórico do cliente com "Reunião realizada" (reuniao_realizada) e "Pasta da reunião criada"
--    (pasta_da_reuniao_criada).
-- 2. Uma pasta por reunião (índice único em cliente_pastas.evento_id), criada por pasta_da_reuniao com o nome
--    "Reunião dd/MM/yyyy HH:mm — <título>"; nome repetido no cliente ganha " (2)", " (3)"...
-- 3. concluir_reuniao: "pasta_criada" e o histórico numa transação só, uma vez por reunião.
-- 4. Uma rotina por vez (reunioes_comecar_rotina/reunioes_terminar_rotina) e uma busca por reunião (reunioes_reservar/
--    reunioes_liberar, com "for update skip locked"): duas rotinas ao mesmo tempo, ou a rotina e o "Buscar agora" da
--    tela, nunca mexem na mesma reunião.
-- 5. O pg_cron chama a função a cada 10 minutos pelo pg_net, com o segredo do Vault (reunioes_depois_segredo) no
--    cabeçalho x-rotina-segredo e o endereço também no Vault (reunioes_depois_url; no local, o gateway do Docker; na
--    nuvem, troque pelo do projeto — README, "Publicar"). Sem reunião esperando, nem chama.
-- Nada disso apaga ou muda dado que já existe: a rotina só avança a situação das reuniões terminadas e cria pastas e
-- arquivos novos.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ── Histórico do cliente ─────────────────────────────────────────────────────

alter table public.cliente_eventos
  drop constraint cliente_eventos_tipo_check,
  add constraint cliente_eventos_tipo_check check (tipo in ('cadastrado', 'editado', 'enviado', 'movido', 'devolvido',
    'consultor_escolhido', 'consultor_trocado', 'consultor_removido', 'previsao_ajustada', 'arquivado', 'reativado',
    'reuniao_realizada', 'pasta_da_reuniao_criada'));

-- ── Índices ──────────────────────────────────────────────────────────────────

-- Uma pasta por reunião (também serve à chave estrangeira de evento_id, no lugar do índice comum).
create unique index cliente_pastas_uma_por_evento_idx on public.cliente_pastas (evento_id) where evento_id is not null;
drop index public.cliente_pastas_evento_idx;

-- As reuniões que a rotina procura: com Meet e ainda esperando, pelo fim.
create index agenda_eventos_reuniao_a_buscar_idx on public.agenda_eventos (fim)
  where reuniao in ('agendada', 'aguardando') and meet_codigo is not null;

-- ── Vez da rotina e reservas ─────────────────────────────────────────────────

create table private.rotina_das_reunioes (
  id boolean primary key default true check (id),
  dono uuid,
  rodando_ate timestamptz
);
insert into private.rotina_das_reunioes (id) values (true) on conflict (id) do nothing;

-- Cada reunião que a rotina (ou a tela) já olhou: quem está com ela agora (até quando) e quando foi olhada pela última
-- vez (a rotina olha primeiro as que há mais tempo não são olhadas, e deixa para a próxima as de menos de 5 minutos).
create table private.reunioes_na_rotina (
  evento_id uuid primary key references public.agenda_eventos (id) on delete cascade,
  dono uuid,
  reservada_ate timestamptz,
  buscada_em timestamptz
);

alter table private.rotina_das_reunioes enable row level security;
alter table private.reunioes_na_rotina enable row level security;
revoke all on private.rotina_das_reunioes, private.reunioes_na_rotina from public, anon, authenticated;

-- A vez da rotina, por até p_minutos: devolve o dono (para devolver a vez depois) ou null quando outra está rodando.
create function public.reunioes_comecar_rotina(p_minutos int default 9) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_dono uuid := gen_random_uuid();
begin
  update private.rotina_das_reunioes
  set dono = v_dono,
    rodando_ate = now() + make_interval(mins => greatest(1, least(coalesce(p_minutos, 9), 60)))
  where id and (rodando_ate is null or rodando_ate < now());
  return case when found then v_dono end;
end $$;

create function public.reunioes_terminar_rotina(p_dono uuid) returns void
language sql security definer set search_path = '' as $$
  update private.rotina_das_reunioes set dono = null, rodando_ate = null where id and dono = p_dono
$$;

-- Reserva reuniões para p_dono por p_minutos. Com p_evento: só ela, se ninguém está com ela (a situação, quem chama
-- confere). Sem p_evento: até p_limite reuniões terminadas, com Meet, ainda esperando, livres e não olhadas nos
-- últimos 5 minutos — as que há mais tempo não são olhadas primeiro.
create function public.reunioes_reservar(p_dono uuid, p_evento uuid default null, p_limite int default 3,
  p_minutos int default 5) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_ate timestamptz := now() + make_interval(mins => greatest(1, least(coalesce(p_minutos, 5), 30)));
  v_ids uuid[];
begin
  if p_dono is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  with candidatas as (
    select e.id
    from public.agenda_eventos e
    left join private.reunioes_na_rotina r on r.evento_id = e.id
    where p_evento is not null and e.id = p_evento
      and (r.reservada_ate is null or r.reservada_ate < now())
    for no key update of e skip locked
  ), da_rotina as (
    select e.id
    from public.agenda_eventos e
    left join private.reunioes_na_rotina r on r.evento_id = e.id
    where p_evento is null
      and e.reuniao in ('agendada', 'aguardando') and e.meet_codigo is not null and e.fim <= now()
      and (r.reservada_ate is null or r.reservada_ate < now())
      and (r.buscada_em is null or r.buscada_em < now() - interval '5 minutes')
    order by r.buscada_em nulls first, e.fim
    limit greatest(1, least(coalesce(p_limite, 3), 50))
    for no key update of e skip locked
  ), reservadas as (
    insert into private.reunioes_na_rotina as r (evento_id, dono, reservada_ate)
    select id, p_dono, v_ate from (select id from candidatas union all select id from da_rotina) c
    on conflict (evento_id) do update set dono = excluded.dono, reservada_ate = excluded.reservada_ate
      where r.reservada_ate is null or r.reservada_ate < now()
    returning r.evento_id
  )
  select coalesce(array_agg(evento_id), '{}') into v_ids from reservadas;
  return v_ids;
end $$;

-- Solta a reunião (só quem a reservou) e anota quando ela foi olhada.
create function public.reunioes_liberar(p_evento uuid, p_dono uuid) returns void
language sql security definer set search_path = '' as $$
  update private.reunioes_na_rotina
  set dono = null, reservada_ate = null, buscada_em = now()
  where evento_id = p_evento and dono = p_dono
$$;

-- ── Pasta da reunião ─────────────────────────────────────────────────────────

-- A pasta da reunião no cliente do evento: a que já existe para a reunião ou uma nova, com o nome pedido (até 120
-- caracteres); nome que já existe no cliente (sem diferenciar maiúsculas) ganha " (2)", " (3)"... A pasta nasce com a
-- consultoria do cliente e sem autor (a rotina não é uma pessoa; gatilho preparar_pasta).
create function public.pasta_da_reuniao(p_evento uuid, p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente uuid;
  v_pasta uuid;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_sufixo text;
  v_n int := 1;
begin
  select e.cliente_id into v_cliente from public.agenda_eventos e where e.id = p_evento;
  if v_cliente is null then
    raise exception 'reuniao_sem_cliente' using errcode = 'P0001';
  end if;
  if v_nome = '' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  loop
    select p.id into v_pasta from public.cliente_pastas p where p.evento_id = p_evento and p.cliente_id = v_cliente;
    if v_pasta is not null then
      return v_pasta;
    end if;
    v_sufixo := case when v_n = 1 then '' else ' (' || v_n || ')' end;
    begin
      insert into public.cliente_pastas (cliente_id, nome, evento_id)
      values (v_cliente, rtrim(left(v_nome, 120 - char_length(v_sufixo))) || v_sufixo, p_evento)
      returning id into v_pasta;
      return v_pasta;
    exception when unique_violation then
      -- Outra rotina criou a pasta desta reunião agora (o laço a devolve) ou o nome já existe no cliente (o próximo).
      if exists (select 1 from public.cliente_pastas p where p.evento_id = p_evento and p.cliente_id <> v_cliente) then
        raise exception 'pasta_de_outro_cliente' using errcode = 'P0001';
      end if;
      v_n := v_n + 1;
      if v_n > 100 then
        raise;
      end if;
    end;
  end loop;
end $$;

-- A pasta está pronta: "pasta_criada", a pasta e a gravação na reunião, e o histórico do cliente ("Reunião realizada"
-- no fim da reunião, pelo organizador; "Pasta da reunião criada" agora, pela rotina). Uma vez só: false quando a
-- reunião já estava com a pasta (ou não tem mais cliente).
create function public.concluir_reuniao(p_evento uuid, p_pasta uuid, p_gravacao text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente uuid;
  v_fim timestamptz;
  v_organizador uuid;
begin
  update public.agenda_eventos e
  set reuniao = 'pasta_criada', reuniao_erro = null, pasta_id = p_pasta,
    gravacao_url = coalesce(p_gravacao, e.gravacao_url)
  where e.id = p_evento and e.reuniao <> 'pasta_criada' and e.cliente_id is not null
  returning e.cliente_id, e.fim, e.consultor_id into v_cliente, v_fim, v_organizador;
  if not found then
    return false;
  end if;
  insert into public.cliente_eventos (cliente_id, tipo, autor, em) values
    (v_cliente, 'reuniao_realizada', v_organizador, least(v_fim, now())),
    (v_cliente, 'pasta_da_reuniao_criada', null, now());
  return true;
end $$;

-- ── Segredo e pg_cron ────────────────────────────────────────────────────────

-- O segredo nasce aqui, aleatório, e só existe no Vault (nunca no git). O endereço da função também fica no Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'reunioes_depois_segredo') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'reunioes_depois_segredo',
      'Segredo que o pg_cron manda para a Edge Function reunioes-depois (cabeçalho x-rotina-segredo)');
  end if;
  if not exists (select 1 from vault.secrets where name = 'reunioes_depois_url') then
    perform vault.create_secret('http://kong:8000/functions/v1/reunioes-depois', 'reunioes_depois_url',
      'Endereço da Edge Function reunioes-depois para o pg_cron (na nuvem: https://<ref>.supabase.co/functions/v1/reunioes-depois)');
  end if;
end $$;

-- Só a Edge Function lê o segredo, para conferir quem a chama.
create function public.segredo_da_rotina_das_reunioes() returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'reunioes_depois_segredo' limit 1
$$;

-- O que o pg_cron roda: se há reunião terminada esperando, chama a função (o pg_net manda o pedido em segundo plano e
-- guarda a resposta em net._http_response). Devolve o id do pedido, ou null quando não chamou.
create function private.chamar_reunioes_depois() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_segredo text;
begin
  if not exists (
    select 1 from public.agenda_eventos e
    where e.reuniao in ('agendada', 'aguardando') and e.meet_codigo is not null and e.fim <= now()
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

-- A cada 10 minutos. cron.schedule com o mesmo nome troca o agendamento (não duplica); o job fica no banco e
-- continua depois de reiniciar.
select cron.schedule('reunioes-depois', '*/10 * * * *', 'select private.chamar_reunioes_depois()');

-- ── Permissões ───────────────────────────────────────────────────────────────

revoke all on function public.reunioes_comecar_rotina(int), public.reunioes_terminar_rotina(uuid),
  public.reunioes_reservar(uuid, uuid, int, int), public.reunioes_liberar(uuid, uuid),
  public.pasta_da_reuniao(uuid, text), public.concluir_reuniao(uuid, uuid, text),
  public.segredo_da_rotina_das_reunioes(), private.chamar_reunioes_depois()
  from public, anon, authenticated;
grant execute on function public.reunioes_comecar_rotina(int), public.reunioes_terminar_rotina(uuid),
  public.reunioes_reservar(uuid, uuid, int, int), public.reunioes_liberar(uuid, uuid),
  public.pasta_da_reuniao(uuid, text), public.concluir_reuniao(uuid, uuid, text),
  public.segredo_da_rotina_das_reunioes()
  to service_role;
