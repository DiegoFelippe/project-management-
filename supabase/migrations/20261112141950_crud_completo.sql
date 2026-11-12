-- CRUD completo: desativar pessoas, arquivar consultorias, editar e apagar times.
-- Desativar e arquivar não apagam nada: o acesso fica bloqueado (aqui e no Auth, pelas Edge Functions).

alter table public.perfis
  add column ativo boolean not null default true,
  add column desativado_em timestamptz;

alter table public.consultorias add column arquivada_em timestamptz;

-- Nome de consultoria não se repete (sem diferenciar maiúsculas e espaços nas pontas).
create unique index consultorias_nome_unico on public.consultorias (lower(btrim(nome)));

-- Liberado = perfil ativo, senha provisória já trocada e consultoria não arquivada (o dono não tem consultoria).
create or replace function private.liberado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis p
    left join public.consultorias c on c.id = p.consultoria_id
    where p.id = (select auth.uid())
      and p.ativo
      and not p.precisa_trocar_senha
      and c.arquivada_em is null
  )
$$;

-- Editar e apagar times: quem gerencia o time (admin da consultoria ou o gestor do time).
grant update (nome, descricao, gestor_id) on public.times to authenticated;
grant delete on public.times to authenticated;

create policy "quem gerencia o time edita" on public.times
  for update to authenticated
  using (private.gerencio_time(id))
  with check (private.gerencio_time(id));

create policy "quem gerencia o time apaga" on public.times
  for delete to authenticated
  using (private.gerencio_time(id));

-- Trocar o gestor do time: só o administrador.
create function private.so_admin_troca_gestor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.gestor_id is distinct from old.gestor_id
     and (select auth.uid()) is not null
     and not private.sou_admin() then
    raise exception 'Só o administrador troca o gestor do time' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger times_so_admin_troca_gestor
  before update of gestor_id on public.times
  for each row execute function private.so_admin_troca_gestor();

-- Quem ainda é gestor de algum time não é desativado nem deixa de ser gestor/admin.
create function private.gestor_com_times() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.times where gestor_id = new.id)
     and ((old.ativo and not new.ativo) or new.papel not in ('gestor', 'admin')) then
    raise exception 'gestor_com_times' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger perfis_gestor_com_times
  before update of ativo, papel on public.perfis
  for each row execute function private.gestor_com_times();
