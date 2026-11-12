-- Criar um time pela tela pede o id de volta (insert ... returning). A regra de leitura antiga
-- procurava o próprio time na tabela, e a linha recém-criada ainda não aparece para essa busca:
-- o banco recusava a criação. A regra nova olha as colunas da própria linha.

create function private.sou_membro(p_time uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.time_membros
    where time_id = p_time and pessoa_id = (select auth.uid())
  )
$$;

revoke all on function private.sou_membro(uuid) from public;
grant execute on function private.sou_membro(uuid) to authenticated;

drop policy "ver times conforme o papel" on public.times;

create policy "ver times conforme o papel" on public.times
  for select to authenticated
  using (
    private.liberado() and (
      private.sou_dono() or (
        consultoria_id = private.consultoria_atual()
        and (private.sou_admin() or gestor_id = (select auth.uid()) or private.sou_membro(id))
      )
    )
  );
