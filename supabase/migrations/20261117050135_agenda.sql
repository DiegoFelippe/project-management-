-- Agenda (desenho em docs/superpowers/specs/2026-11-16-calendario-design.md, "Banco (resumo)").
-- - google_pessoas: o Google que cada pessoa conectou. O token fica no Vault (segredo_id); o navegador lê só e-mail,
--   quando conectou e o erro, e só da própria linha. Quem grava é a Edge Function (service_role).
-- - agenda_eventos e agenda_participantes: só a Edge Function grava (ela mexe no Google junto). O navegador lê:
--   consultor os próprios eventos e aqueles em que foi convidado; admin e gestor os da consultoria; central e dono todos.
-- - indicadores_da_agenda e feriados_do_periodo: números do painel da agenda e feriados nacionais do período.

-- ── Google de cada pessoa ────────────────────────────────────────────────────

create table public.google_pessoas (
  perfil_id uuid primary key references public.perfis (id) on delete cascade,
  email text not null,
  escopos text[] not null default '{}',
  conectado_em timestamptz not null default now(),
  erro text,
  segredo_id uuid
);

alter table public.google_pessoas enable row level security;

create policy "ver o próprio Google" on public.google_pessoas
  for select to authenticated
  using (perfil_id = (select auth.uid()) and (select private.liberado()));

-- Colunas liberadas uma a uma: segredo_id e escopos nunca saem pelo navegador.
revoke all on public.google_pessoas from public, anon, authenticated;
grant select (perfil_id, email, conectado_em, erro) on public.google_pessoas to authenticated;
grant all on public.google_pessoas to service_role;

-- Apagar a conexão (ou a pessoa) apaga o token do Vault junto.
create function private.apagar_segredo_do_google() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.segredo_id is not null then
    delete from vault.secrets where id = old.segredo_id;
  end if;
  return old;
end $$;

create trigger google_pessoas_apagar_segredo
  after delete on public.google_pessoas
  for each row execute function private.apagar_segredo_do_google();

-- A gestão sabe se o consultor conectou o Google sem ver o e-mail dele: a própria pessoa, a central e quem cuida
-- da consultoria dele.
create function private.google_conectado(p_perfil uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and (
      p_perfil = (select auth.uid())
      or private.sou_central()
      or private.gerencio_consultoria(private.consultoria_de(p_perfil))
      or private.vejo_perfil(p_perfil)
    )
    and exists (select 1 from public.google_pessoas g where g.perfil_id = p_perfil),
    false)
$$;

revoke all on function private.google_conectado(uuid) from public, anon;
grant execute on function private.google_conectado(uuid) to authenticated;

-- ── Eventos ──────────────────────────────────────────────────────────────────

create table public.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultorias (id) on delete restrict,
  consultor_id uuid not null references public.perfis (id) on delete restrict,
  cliente_id uuid references public.clientes (id) on delete set null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  descricao text check (char_length(descricao) <= 5000),
  inicio timestamptz not null,
  fim timestamptz not null,
  dia_inteiro boolean not null default false,
  cor smallint not null default 0 check (cor between 0 and 7),
  com_meet boolean not null default false,
  gravar boolean not null default false,
  meet_link text,
  meet_codigo text,
  google_evento_id text,
  reuniao text not null default 'agendada'
    check (reuniao in ('agendada', 'aguardando', 'pasta_criada', 'sem_artefatos', 'erro')),
  reuniao_erro text,
  gravacao_url text,
  pasta_id uuid references public.cliente_pastas (id) on delete set null,
  criado_por uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio)
);

create index agenda_eventos_consultoria_idx on public.agenda_eventos (consultoria_id, inicio);
create index agenda_eventos_consultor_idx on public.agenda_eventos (consultor_id, inicio);
create index agenda_eventos_cliente_idx on public.agenda_eventos (cliente_id);
create index agenda_eventos_pasta_idx on public.agenda_eventos (pasta_id);
create index agenda_eventos_criado_por_idx on public.agenda_eventos (criado_por);
create index agenda_eventos_aguardando_idx on public.agenda_eventos (fim) where reuniao = 'aguardando';

create function private.agenda_eventos_tocar() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create trigger agenda_eventos_tocar
  before update on public.agenda_eventos
  for each row execute function private.agenda_eventos_tocar();

-- A pasta e o evento se soltam um do outro quando um deles é apagado (a pasta guarda os arquivos).
alter table public.cliente_pastas
  add constraint cliente_pastas_evento_fk foreign key (evento_id) references public.agenda_eventos (id) on delete set null;

-- ── Participantes ────────────────────────────────────────────────────────────

create table public.agenda_participantes (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.agenda_eventos (id) on delete cascade,
  perfil_id uuid references public.perfis (id) on delete cascade,
  email text check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  resposta text not null default 'pendente' check (resposta in ('pendente', 'confirmou', 'recusou')),
  -- exatamente um dos dois: gente da casa (perfil) ou convidado de fora (e-mail)
  check ((perfil_id is null) <> (email is null)),
  unique (evento_id, perfil_id)
);

create unique index agenda_participantes_email_idx on public.agenda_participantes (evento_id, lower(email));
create index agenda_participantes_perfil_idx on public.agenda_participantes (perfil_id);

-- No máximo 20 convidados de fora por evento. Trava a linha do evento para duas gravações juntas não passarem do limite.
create function private.limitar_convidados_de_fora() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then
    return new;
  end if;
  perform 1 from public.agenda_eventos e where e.id = new.evento_id for update;
  if (select count(*) from public.agenda_participantes p
      where p.evento_id = new.evento_id and p.email is not null and p.id <> new.id) >= 20 then
    raise exception 'No máximo 20 convidados de fora por evento' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger agenda_participantes_limite
  before insert or update of email, evento_id on public.agenda_participantes
  for each row execute function private.limitar_convidados_de_fora();

-- ── Quem vê ──────────────────────────────────────────────────────────────────

-- Eventos em que a pessoa logada foi convidada (lê os participantes sem passar pela regra deles, que olha os eventos).
create function private.eventos_do_convidado() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.evento_id from public.agenda_participantes p
  where p.perfil_id = (select auth.uid()) and (select private.liberado())
$$;

-- Vê o evento: central e dono; quem cuida da consultoria dele; o consultor dele; o convidado.
create function private.vejo_evento(p_evento uuid) returns boolean
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
          or exists (
            select 1 from public.agenda_participantes p
            where p.evento_id = e.id and p.perfil_id = (select auth.uid())
          )
        )
    ),
    false)
$$;

revoke all on function private.eventos_do_convidado(), private.vejo_evento(uuid) from public, anon;
grant execute on function private.eventos_do_convidado(), private.vejo_evento(uuid) to authenticated;

alter table public.agenda_eventos enable row level security;
alter table public.agenda_participantes enable row level security;

-- As chamadas das regras vão dentro de (select ...) para rodar uma vez por consulta e não uma vez por linha.
create policy "ver eventos conforme o papel" on public.agenda_eventos
  for select to authenticated
  using (
    (select private.sou_central())
    or (
      consultoria_id = (select private.consultoria_atual())
      and (select private.gerencio_consultoria(private.consultoria_atual()))
    )
    or (consultor_id = (select auth.uid()) and (select private.liberado()))
    or id in (select private.eventos_do_convidado())
  );

create policy "ver participantes de quem vê o evento" on public.agenda_participantes
  for select to authenticated
  using ((select private.sou_central()) or private.vejo_evento(evento_id));

-- Só a Edge Function grava (ela mexe no Google junto): o navegador só lê.
revoke all on public.agenda_eventos, public.agenda_participantes from public, anon, authenticated;
grant select on public.agenda_eventos, public.agenda_participantes to authenticated;
grant all on public.agenda_eventos, public.agenda_participantes to service_role;

-- ── Indicadores e feriados ───────────────────────────────────────────────────

-- Reuniões (evento com cliente ou com Meet) da semana (domingo a sábado) e do mês de p_dia; reuniões aguardando a
-- transcrição; pastas criadas (eventos do mês com pasta). No recorte de quem chama: central tudo, admin e gestor a
-- consultoria, consultor os próprios e os que foi convidado.
create function public.indicadores_da_agenda(p_dia date) returns jsonb
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
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  select
    count(*) filter (where (cliente_id is not null or com_meet) and inicio >= v_sem_ini and inicio < v_sem_fim),
    count(*) filter (where (cliente_id is not null or com_meet) and inicio >= v_mes_ini and inicio < v_mes_fim),
    count(*) filter (where pasta_id is not null and inicio >= v_mes_ini and inicio < v_mes_fim)
  into v_semana, v_mes, v_pastas
  from public.agenda_eventos e
  where e.inicio >= least(v_sem_ini, v_mes_ini) and e.inicio < greatest(v_sem_fim, v_mes_fim)
    and (
      v_recorte = 'tudo'
      or (v_recorte = 'consultoria' and e.consultoria_id = v_consultoria)
      or (v_recorte = 'pessoa' and (
        e.consultor_id = v_eu
        or e.id in (select p.evento_id from public.agenda_participantes p where p.perfil_id = v_eu)
      ))
    );

  select count(*) into v_aguardando
  from public.agenda_eventos e
  where e.reuniao = 'aguardando'
    and (
      v_recorte = 'tudo'
      or (v_recorte = 'consultoria' and e.consultoria_id = v_consultoria)
      or (v_recorte = 'pessoa' and (
        e.consultor_id = v_eu
        or e.id in (select p.evento_id from public.agenda_participantes p where p.perfil_id = v_eu)
      ))
    );

  return jsonb_build_object('semana', v_semana, 'mes', v_mes, 'aguardando', v_aguardando, 'pastas_no_mes', v_pastas);
end $$;

-- Feriados nacionais entre duas datas (inclusive), em ordem. Período de até 10 anos.
create function public.feriados_do_periodo(p_de date, p_ate date) returns setof date
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 3660 then
    return;
  end if;
  return query
    select d from generate_series(extract(year from p_de)::int, extract(year from p_ate)::int) a(ano),
      lateral private.feriados_nacionais(a.ano) d
    where d between p_de and p_ate
    order by d;
end $$;

revoke all on function public.indicadores_da_agenda(date), public.feriados_do_periodo(date, date) from public, anon;
grant execute on function public.indicadores_da_agenda(date), public.feriados_do_periodo(date, date) to authenticated;
