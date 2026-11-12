-- Consultorias, perfis, times e membros, com as regras de acesso de cada papel.
-- Papéis: dono (da plataforma, vê tudo e só olha), admin (da consultoria), gestor e pessoa.
-- Uma consultoria nunca vê nada de outra. Senha provisória bloqueia tudo até ser trocada.
-- Quem cria login e perfil são as Edge Functions (chave secreta); o navegador só lê e mexe em times.

-- ── Tabelas ──────────────────────────────────────────────────────────────────

create table public.consultorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  criado_em timestamptz not null default now()
);

create table public.perfis (
  id uuid primary key references auth.users on delete cascade,
  consultoria_id uuid references public.consultorias on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  email text not null unique,
  papel text not null check (papel in ('dono', 'admin', 'gestor', 'pessoa')),
  precisa_trocar_senha boolean not null default false,
  convite_pendente boolean not null default false,
  criado_por uuid references public.perfis on delete set null,
  criado_em timestamptz not null default now(),
  check ((papel = 'dono') = (consultoria_id is null))
);
create index perfis_consultoria_idx on public.perfis (consultoria_id);
create index perfis_criado_por_idx on public.perfis (criado_por);

create table public.times (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultorias on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  descricao text check (descricao is null or char_length(descricao) <= 500),
  gestor_id uuid not null references public.perfis on delete restrict,
  criado_por uuid default auth.uid() references public.perfis on delete set null,
  criado_em timestamptz not null default now(),
  unique (consultoria_id, nome)
);
create index times_gestor_idx on public.times (gestor_id);
create index times_criado_por_idx on public.times (criado_por);

create table public.time_membros (
  time_id uuid not null references public.times on delete cascade,
  pessoa_id uuid not null references public.perfis on delete cascade,
  adicionado_por uuid default auth.uid() references public.perfis on delete set null,
  adicionado_em timestamptz not null default now(),
  primary key (time_id, pessoa_id)
);
create index time_membros_pessoa_idx on public.time_membros (pessoa_id);
create index time_membros_adicionado_por_idx on public.time_membros (adicionado_por);

alter table public.consultorias enable row level security;
alter table public.perfis enable row level security;
alter table public.times enable row level security;
alter table public.time_membros enable row level security;

-- ── Funções das regras (schema privado, fora da API) ─────────────────────────

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.liberado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and not precisa_trocar_senha
  )
$$;

create function private.papel_atual() returns text
language sql stable security definer set search_path = '' as $$
  select papel from public.perfis where id = (select auth.uid())
$$;

create function private.consultoria_atual() returns uuid
language sql stable security definer set search_path = '' as $$
  select consultoria_id from public.perfis where id = (select auth.uid())
$$;

create function private.sou_dono() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and coalesce(private.papel_atual() = 'dono', false)
$$;

create function private.sou_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and coalesce(private.papel_atual() = 'admin', false)
$$;

-- Mexer no time: admin da consultoria do time, ou o gestor do time. O dono só olha.
create function private.gerencio_time(p_time uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and exists (
    select 1 from public.times t
    where t.id = p_time
      and t.consultoria_id = private.consultoria_atual()
      and (private.sou_admin() or t.gestor_id = (select auth.uid()))
  )
$$;

create function private.vejo_time(p_time uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and (
    private.sou_dono() or exists (
      select 1 from public.times t
      where t.id = p_time
        and t.consultoria_id = private.consultoria_atual()
        and (
          private.sou_admin()
          or t.gestor_id = (select auth.uid())
          or exists (
            select 1 from public.time_membros m
            where m.time_id = t.id and m.pessoa_id = (select auth.uid())
          )
        )
    )
  )
$$;

-- O próprio perfil sempre aparece (mesmo com senha provisória); o resto depende do papel.
create function private.vejo_perfil(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_id = (select auth.uid()) or (
    private.liberado() and (
      private.sou_dono() or exists (
        select 1 from public.perfis p
        where p.id = p_id
          and p.consultoria_id = private.consultoria_atual()
          and (
            private.sou_admin()
            or p.criado_por = (select auth.uid())
            or exists (
              select 1 from public.time_membros m
              join public.times t on t.id = m.time_id
              where m.pessoa_id = p.id and t.gestor_id = (select auth.uid())
            )
          )
      )
    )
  )
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.liberado(), private.papel_atual(), private.consultoria_atual(),
  private.sou_dono(), private.sou_admin(),
  private.gerencio_time(uuid), private.vejo_time(uuid), private.vejo_perfil(uuid)
to authenticated;

-- ── Gatilhos de consistência ─────────────────────────────────────────────────

-- O gestor do time é gestor ou admin da mesma consultoria.
create function private.validar_gestor_do_time() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.perfis p
    where p.id = new.gestor_id
      and p.consultoria_id = new.consultoria_id
      and p.papel in ('gestor', 'admin')
  ) then
    raise exception 'O gestor do time precisa ser gestor ou administrador da mesma consultoria'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger times_validar_gestor
  before insert or update of gestor_id, consultoria_id on public.times
  for each row execute function private.validar_gestor_do_time();

-- Membro do time é da mesma consultoria do time e não é o dono.
create function private.validar_membro_do_time() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.perfis p
    join public.times t on t.id = new.time_id
    where p.id = new.pessoa_id
      and p.consultoria_id = t.consultoria_id
      and p.papel <> 'dono'
  ) then
    raise exception 'Só entra no time quem é da mesma consultoria'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger time_membros_validar
  before insert on public.time_membros
  for each row execute function private.validar_membro_do_time();

-- Trocar a senha libera o acesso; confirmar o e-mail (aceitar o convite) tira o pendente.
create function private.ao_trocar_senha() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.perfis set precisa_trocar_senha = false
  where id = new.id and precisa_trocar_senha;
  return new;
end $$;

create trigger perfis_ao_trocar_senha
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function private.ao_trocar_senha();

create function private.ao_confirmar_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.perfis set convite_pendente = false
  where id = new.id and convite_pendente;
  return new;
end $$;

create trigger perfis_ao_confirmar_email
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.ao_confirmar_email();

-- ── Políticas ────────────────────────────────────────────────────────────────

create policy "ver a própria consultoria (dono vê todas)" on public.consultorias
  for select to authenticated
  using (private.sou_dono() or (id = private.consultoria_atual() and private.liberado()));

create policy "ver perfis conforme o papel" on public.perfis
  for select to authenticated
  using (private.vejo_perfil(id));

create policy "ver times conforme o papel" on public.times
  for select to authenticated
  using (private.vejo_time(id));

create policy "gestor cria o próprio time, admin cria na consultoria" on public.times
  for insert to authenticated
  with check (
    private.liberado()
    and consultoria_id = private.consultoria_atual()
    and (
      (private.papel_atual() = 'gestor' and gestor_id = (select auth.uid()))
      or private.sou_admin()
    )
  );

create policy "ver membros dos times visíveis" on public.time_membros
  for select to authenticated
  using (private.vejo_time(time_id));

create policy "quem gerencia o time coloca pessoas" on public.time_membros
  for insert to authenticated
  with check (private.gerencio_time(time_id) and adicionado_por = (select auth.uid()));

create policy "quem gerencia o time tira pessoas" on public.time_membros
  for delete to authenticated
  using (private.gerencio_time(time_id));

-- ── Permissões da API (tabelas novas não ficam expostas sozinhas) ────────────

revoke all on public.consultorias, public.perfis, public.times, public.time_membros from anon, authenticated;
grant select on public.consultorias, public.perfis to authenticated;
grant select, insert on public.times to authenticated;
grant select, insert, delete on public.time_membros to authenticated;
grant all on public.consultorias, public.perfis, public.times, public.time_membros to service_role;
