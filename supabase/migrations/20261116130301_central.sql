-- Papel "central": a IXCSoft, que enxerga todas as consultorias e não pertence a nenhuma.
-- O dono da plataforma tem todos os poderes da central. sou_dono() continua sendo só o dono.

alter table public.perfis drop constraint perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('dono', 'central', 'admin', 'gestor', 'pessoa'));

alter table public.perfis drop constraint perfis_check;
alter table public.perfis add constraint perfis_check
  check ((papel in ('dono', 'central')) = (consultoria_id is null));

create function private.sou_central() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and coalesce(private.papel_atual() in ('dono', 'central'), false)
$$;

revoke all on function private.sou_central() from public;
grant execute on function private.sou_central() to authenticated;

-- Regras de leitura: a central vê o que o dono vê.
create or replace function private.vejo_time(p_time uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and (
    private.sou_central() or exists (
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

create or replace function private.vejo_perfil(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_id = (select auth.uid()) or (
    private.liberado() and (
      private.sou_central() or exists (
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

drop policy "ver a própria consultoria (dono vê todas)" on public.consultorias;
create policy "ver a própria consultoria (dono vê todas)" on public.consultorias
  for select to authenticated
  using ((select private.sou_central()) or (id = private.consultoria_atual() and private.liberado()));

drop policy "ver times conforme o papel" on public.times;
create policy "ver times conforme o papel" on public.times
  for select to authenticated
  using (
    private.liberado() and (
      (select private.sou_central()) or (
        consultoria_id = private.consultoria_atual()
        and (private.sou_admin() or gestor_id = (select auth.uid()) or private.sou_membro(id))
      )
    )
  );

-- Fotos e logos: a central muda o logo das consultorias e a foto dos administradores;
-- o dono também muda a foto da central.
create or replace function private.posso_mudar_foto(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.liberado() and (
    p_id = (select auth.uid())
    or exists (
      select 1 from public.perfis p
      where p.id = p_id
        and (
          (private.sou_central() and p.papel = 'admin')
          or (private.sou_dono() and p.papel = 'central')
          or (
            p.consultoria_id = private.consultoria_atual()
            and (
              (private.sou_admin() and p.papel in ('gestor', 'pessoa'))
              or (
                private.papel_atual() = 'gestor' and p.papel = 'pessoa'
                and (
                  p.criado_por = (select auth.uid())
                  or exists (
                    select 1 from public.time_membros m
                    join public.times t on t.id = m.time_id
                    where m.pessoa_id = p.id and t.gestor_id = (select auth.uid())
                  )
                )
              )
            )
          )
        )
    )
  )
$$;

create or replace function private.posso_mudar_logo(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.sou_central() and exists (select 1 from public.consultorias where id = p_id)
$$;
