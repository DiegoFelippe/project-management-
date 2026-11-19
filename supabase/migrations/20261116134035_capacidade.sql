-- Capacidade: carga semanal de cada pessoa, ausências (dias inteiros) e feriados nacionais.
-- A capacidade do mês = dias úteis (segunda a sexta, sem feriado nacional e sem ausência) x carga / 5.

alter table public.perfis
  add column carga_semanal numeric(4,1) not null default 44 check (carga_semanal between 0 and 60);

-- Consultoria de uma pessoa (nula para dono e central).
create function private.consultoria_de(p_perfil uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select consultoria_id from public.perfis where id = p_perfil
$$;

revoke all on function private.consultoria_de(uuid) from public, anon;
grant execute on function private.consultoria_de(uuid) to authenticated;

-- Feriados nacionais do ano: fixos e a Sexta-feira Santa (Páscoa menos 2 dias, calendário gregoriano).
create function private.feriados_nacionais(p_ano int) returns setof date
language plpgsql immutable set search_path = '' as $$
declare
  a int := p_ano % 19;
  b int := p_ano / 100;
  c int := p_ano % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
  v_mes int := (h + l - 7 * m + 114) / 31;
  v_dia int := (h + l - 7 * m + 114) % 31 + 1;
  v_pascoa date := make_date(p_ano, v_mes, v_dia);
begin
  return query select unnest(array[
    make_date(p_ano, 1, 1), make_date(p_ano, 4, 21), make_date(p_ano, 5, 1), make_date(p_ano, 9, 7),
    make_date(p_ano, 10, 12), make_date(p_ano, 11, 2), make_date(p_ano, 11, 15), make_date(p_ano, 11, 20),
    make_date(p_ano, 12, 25), v_pascoa - 2
  ]);
end $$;

revoke all on function private.feriados_nacionais(int) from public, anon;
grant execute on function private.feriados_nacionais(int) to authenticated, service_role;

-- Ausências: dias inteiros em que a pessoa não atende clientes (férias, licença, atestado...).
create table public.ausencias (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  de date not null,
  ate date not null,
  motivo text not null check (char_length(btrim(motivo)) between 2 and 120),
  criado_por uuid default auth.uid() references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  check (ate >= de and ate - de <= 366)
);

create index ausencias_perfil_idx on public.ausencias (perfil_id, de);
create index ausencias_criado_por_idx on public.ausencias (criado_por);

alter table public.ausencias enable row level security;

create policy "ver ausências" on public.ausencias
  for select to authenticated
  using (
    (select private.sou_central())
    or (select private.gerencio_consultoria(private.consultoria_de(perfil_id)))
    or perfil_id = (select auth.uid())
  );

create policy "criar ausências" on public.ausencias
  for insert to authenticated
  with check (
    (select private.sou_central())
    or (select private.gerencio_consultoria(private.consultoria_de(perfil_id)))
  );

create policy "mudar ausências" on public.ausencias
  for update to authenticated
  using (
    (select private.sou_central())
    or (select private.gerencio_consultoria(private.consultoria_de(perfil_id)))
  )
  with check (
    (select private.sou_central())
    or (select private.gerencio_consultoria(private.consultoria_de(perfil_id)))
  );

create policy "apagar ausências" on public.ausencias
  for delete to authenticated
  using (
    (select private.sou_central())
    or (select private.gerencio_consultoria(private.consultoria_de(perfil_id)))
  );

revoke all on public.ausencias from anon, authenticated;
grant select, insert, update, delete on public.ausencias to authenticated;
grant all on public.ausencias to service_role;

-- Carga semanal: só por esta função (não há grant de update na coluna).
create function public.definir_carga(p_perfil uuid, p_horas numeric) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.perfis p
    where p.id = p_perfil
      and p.papel in ('admin', 'gestor', 'pessoa')
      and (private.sou_central() or private.gerencio_consultoria(p.consultoria_id))
  ) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  update public.perfis set carga_semanal = p_horas where id = p_perfil;
end $$;

revoke all on function public.definir_carga(uuid, numeric) from public, anon;
grant execute on function public.definir_carga(uuid, numeric) to authenticated;

-- Capacidade do mês em horas (1 casa). Nula para quem não pode ler. p_mes é qualquer data do mês.
create function public.capacidade_do_mes(p_perfil uuid, p_mes date) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_inicio date := date_trunc('month', p_mes)::date;
  v_carga numeric;
  v_dias int;
begin
  if not (
    private.sou_central()
    or private.gerencio_consultoria(private.consultoria_de(p_perfil))
    or (private.liberado() and p_perfil = (select auth.uid()))
  ) then
    return null;
  end if;

  select carga_semanal into v_carga from public.perfis where id = p_perfil;
  if v_carga is null then
    return null;
  end if;

  select count(*) into v_dias
  from generate_series(v_inicio, (v_inicio + interval '1 month - 1 day')::date, interval '1 day') g(dia)
  where extract(isodow from g.dia) < 6
    and g.dia::date not in (select private.feriados_nacionais(extract(year from v_inicio)::int))
    and not exists (
      select 1 from public.ausencias a
      where a.perfil_id = p_perfil and g.dia::date between a.de and a.ate
    );

  return round(v_dias * v_carga / 5, 1);
end $$;

revoke all on function public.capacidade_do_mes(uuid, date) from public, anon;
grant execute on function public.capacidade_do_mes(uuid, date) to authenticated;
