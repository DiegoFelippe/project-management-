-- Agenda, rodada de correções:
-- 1. Consistência entre consultorias garantida pelo banco (gatilhos): consultor, cliente, pasta e participantes da
--    casa precisam ser da consultoria do evento. A leitura do convidado também confere a consultoria.
-- 2. Leitura do período por índice: evento dura no máximo 31 dias (então `inicio >= de - 31 dias` limita a busca),
--    e a leitura vira a função eventos_do_periodo, com um caminho indexável por papel. Os indicadores seguem o mesmo
--    desenho. Índice por início para a central.
-- 3. Participantes: a regra de leitura reaproveita a dos eventos (sem chamar vejo_evento por linha).
-- 4. Limite de 20 convidados de fora trava a linha do evento com FOR NO KEY UPDATE (não bloqueia a chave estrangeira).

-- ── Duração e índices ────────────────────────────────────────────────────────

alter table public.agenda_eventos
  add constraint agenda_eventos_duracao_max check (fim - inicio <= interval '31 days');

create index agenda_eventos_inicio_idx on public.agenda_eventos (inicio);
create index agenda_eventos_aguardando_consultoria_idx on public.agenda_eventos (consultoria_id) where reuniao = 'aguardando';
create index agenda_eventos_aguardando_consultor_idx on public.agenda_eventos (consultor_id) where reuniao = 'aguardando';

-- ── Consistência entre consultorias ──────────────────────────────────────────

create function private.validar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_insere boolean := tg_op = 'INSERT';
  v_mudou_consultoria boolean := v_insere or new.consultoria_id is distinct from old.consultoria_id;
begin
  if v_mudou_consultoria or new.consultor_id is distinct from old.consultor_id then
    if not exists (
      select 1 from public.perfis p
      where p.id = new.consultor_id
        and p.consultoria_id = new.consultoria_id
        and p.papel in ('admin', 'gestor', 'pessoa')
    ) then
      raise exception 'consultor_invalido' using errcode = 'P0001';
    end if;
  end if;

  if new.cliente_id is not null
     and (v_mudou_consultoria or new.cliente_id is distinct from old.cliente_id) then
    if not exists (
      select 1 from public.clientes c where c.id = new.cliente_id and c.consultoria_id = new.consultoria_id
    ) then
      raise exception 'cliente_invalido' using errcode = 'P0001';
    end if;
  end if;

  if new.pasta_id is not null
     and (v_insere or new.pasta_id is distinct from old.pasta_id or new.cliente_id is distinct from old.cliente_id) then
    if not exists (
      select 1 from public.cliente_pastas pa where pa.id = new.pasta_id and pa.cliente_id = new.cliente_id
    ) then
      raise exception 'pasta_invalida' using errcode = 'P0001';
    end if;
  end if;

  if not v_insere and v_mudou_consultoria and exists (
    select 1 from public.agenda_participantes pt
    join public.perfis p on p.id = pt.perfil_id
    where pt.evento_id = new.id and p.consultoria_id is distinct from new.consultoria_id
  ) then
    raise exception 'participante_invalido' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger agenda_eventos_validar
  before insert or update on public.agenda_eventos
  for each row execute function private.validar_evento();

-- Participante da casa: consultor da consultoria do evento (gente da central não entra: o convite é entre
-- consultores da consultoria; a central enxerga tudo sem ser convidada).
create function private.validar_participante() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.perfil_id is not null and not exists (
    select 1
    from public.agenda_eventos e
    join public.perfis p on p.id = new.perfil_id and p.consultoria_id = e.consultoria_id
    where e.id = new.evento_id
  ) then
    raise exception 'participante_invalido' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger agenda_participantes_validar
  before insert or update of perfil_id, evento_id on public.agenda_participantes
  for each row execute function private.validar_participante();

-- FOR NO KEY UPDATE serializa os convites do mesmo evento sem bloquear a chave estrangeira dos participantes.
create or replace function private.limitar_convidados_de_fora() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    return new;
  end if;
  perform 1 from public.agenda_eventos e where e.id = new.evento_id for no key update;
  if (select count(*) from public.agenda_participantes p
      where p.evento_id = new.evento_id and p.email is not null and p.id <> new.id) >= 20 then
    raise exception 'No máximo 20 convidados de fora por evento' using errcode = '23514';
  end if;
  return new;
end $$;

-- ── Quem vê (convidado só na própria consultoria; participantes pela regra dos eventos) ───────────────

create or replace function private.eventos_do_convidado() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.evento_id
  from public.agenda_participantes p
  join public.agenda_eventos e on e.id = p.evento_id
  where p.perfil_id = (select auth.uid())
    and e.consultoria_id = (select private.consultoria_atual())
    and (select private.liberado())
$$;

create or replace function private.vejo_evento(p_evento uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and exists (
      select 1 from public.agenda_eventos e
      where e.id = p_evento
        and (
          private.sou_central()
          or private.gerencio_consultoria(e.consultoria_id)
          or e.consultor_id = (select auth.uid())
          or (
            e.consultoria_id = private.consultoria_atual()
            and exists (
              select 1 from public.agenda_participantes p
              where p.evento_id = e.id and p.perfil_id = (select auth.uid())
            )
          )
        )
    ),
    false)
$$;

drop policy "ver participantes de quem vê o evento" on public.agenda_participantes;
create policy "ver participantes de quem vê o evento" on public.agenda_participantes
  for select to authenticated
  using (
    (select private.sou_central())
    or exists (select 1 from public.agenda_eventos e where e.id = agenda_participantes.evento_id)
  );

-- ── Leitura do período ───────────────────────────────────────────────────────

-- O evento em JSON, como a tela usa: campos, consultor, cliente e participantes (com o nome de quem é da casa).
create function private.evento_em_json(e public.agenda_eventos) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'consultoria_id', e.consultoria_id, 'consultor_id', e.consultor_id, 'cliente_id', e.cliente_id,
    'titulo', e.titulo, 'descricao', e.descricao, 'inicio', e.inicio, 'fim', e.fim, 'dia_inteiro', e.dia_inteiro,
    'cor', e.cor, 'com_meet', e.com_meet, 'gravar', e.gravar, 'meet_link', e.meet_link, 'meet_codigo', e.meet_codigo,
    'google_evento_id', e.google_evento_id, 'reuniao', e.reuniao, 'reuniao_erro', e.reuniao_erro,
    'gravacao_url', e.gravacao_url, 'pasta_id', e.pasta_id, 'criado_por', e.criado_por,
    'criado_em', e.criado_em, 'atualizado_em', e.atualizado_em,
    'consultor', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'cor', p.cor)
                  from public.perfis p where p.id = e.consultor_id),
    'cliente', (select jsonb_build_object('id', c.id, 'nome', c.nome) from public.clientes c where c.id = e.cliente_id),
    'participantes', coalesce((
      select jsonb_agg(jsonb_build_object('id', pt.id, 'perfil_id', pt.perfil_id, 'email', pt.email,
        'resposta', pt.resposta, 'nome', pp.nome) order by pt.id)
      from public.agenda_participantes pt
      left join public.perfis pp on pp.id = pt.perfil_id
      where pt.evento_id = e.id
    ), '[]'::jsonb)
  )
$$;

revoke all on function private.evento_em_json(public.agenda_eventos) from public, anon, authenticated;

-- Eventos que tocam o período [p_de, p_ate): { itens: [...], ha_mais }. Mesmas regras de visão do RLS, com um
-- caminho por índice para cada papel: consultor = próprios (consultor_id, inicio) + convidado (participantes por
-- perfil_id); admin e gestor = a consultoria (consultoria_id, inicio); central = índice por início. Evento dura no
-- máximo 31 dias, então inicio >= p_de - 31 dias limita a busca. p_limite (até 1000) corta a lista.
create function public.eventos_do_periodo(
  p_de timestamptz, p_ate timestamptz,
  p_consultor uuid default null, p_consultoria uuid default null, p_cliente uuid default null,
  p_limite int default 1000
) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 1000);
  v_itens jsonb;
  v_total int;
begin
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
  if p_de is null or p_ate is null then
    return jsonb_build_object('itens', '[]'::jsonb, 'ha_mais', false);
  end if;

  with ids as (
    select t.id, t.inicio from (
      select e.id, e.inicio from public.agenda_eventos e
      where v_recorte = 'tudo'
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
      union all
      select e.id, e.inicio from public.agenda_eventos e
      where v_recorte = 'consultoria' and e.consultoria_id = v_consultoria
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
      union all
      select e.id, e.inicio from public.agenda_eventos e
      where v_recorte = 'pessoa' and e.consultor_id = v_eu
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
      union all
      select e.id, e.inicio
      from public.agenda_participantes p
      join public.agenda_eventos e on e.id = p.evento_id
      where v_recorte = 'pessoa' and p.perfil_id = v_eu and e.consultor_id <> v_eu
        and e.consultoria_id = v_consultoria
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
    ) t
    order by t.inicio, t.id
    limit v_limite + 1
  ), lista as (
    select e, row_number() over (order by e.inicio, e.id) as rn
    from ids join public.agenda_eventos e on e.id = ids.id
  )
  select coalesce(jsonb_agg(private.evento_em_json(l.e) order by l.rn) filter (where l.rn <= v_limite), '[]'::jsonb),
         count(*)
  into v_itens, v_total
  from lista l;

  return jsonb_build_object('itens', v_itens, 'ha_mais', v_total > v_limite);
end $$;

-- Um evento (mesmo formato dos itens acima); nulo quando não existe ou a pessoa não o vê.
create function public.evento_da_agenda(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_json jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select private.evento_em_json(e) into v_json
  from public.agenda_eventos e
  where e.id = p_id and private.vejo_evento(p_id);
  return v_json;
end $$;

-- Indicadores com o mesmo desenho por papel (o consultor soma os próprios e os convidados por índice).
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

  select count(*) into v_aguardando
  from (
    select 1 from public.agenda_eventos e where v_recorte = 'tudo' and e.reuniao = 'aguardando'
    union all
    select 1 from public.agenda_eventos e
    where v_recorte = 'consultoria' and e.consultoria_id = v_consultoria and e.reuniao = 'aguardando'
    union all
    select 1 from public.agenda_eventos e
    where v_recorte = 'pessoa' and e.consultor_id = v_eu and e.reuniao = 'aguardando'
    union all
    select 1 from public.agenda_participantes p join public.agenda_eventos e on e.id = p.evento_id
    where v_recorte = 'pessoa' and p.perfil_id = v_eu and e.consultor_id <> v_eu and e.consultoria_id = v_consultoria
      and e.reuniao = 'aguardando'
  ) a;

  return jsonb_build_object('semana', v_semana, 'mes', v_mes, 'aguardando', v_aguardando, 'pastas_no_mes', v_pastas);
end $$;

revoke all on function public.eventos_do_periodo(timestamptz, timestamptz, uuid, uuid, uuid, int),
  public.evento_da_agenda(uuid) from public, anon;
grant execute on function public.eventos_do_periodo(timestamptz, timestamptz, uuid, uuid, uuid, int),
  public.evento_da_agenda(uuid) to authenticated;
