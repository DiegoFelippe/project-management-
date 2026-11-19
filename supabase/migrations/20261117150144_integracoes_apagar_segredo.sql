-- Integrações: apagar só o segredo guardado, sem apagar a conexão. A Edge Function `integracoes` usa quando o e-mail
-- (SMTP) é salvo num servidor novo sem usuário e com a senha em branco: o servidor novo não tem login, e a senha "de
-- antes" não pode ficar guardada para outro servidor (senão um segundo passo, com usuário, a mandaria para ele).
-- Só a Edge Function (service_role) chama. Não apaga a conexão nem outros dados.

create function public.integracao_apagar_segredo(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_segredo uuid;
begin
  select segredo_id into v_segredo from public.integracoes where id = p_id for update;
  if v_segredo is null then
    return;
  end if;
  update public.integracoes set segredo_id = null, atualizada_em = now() where id = p_id;
  delete from vault.secrets where id = v_segredo;
end $$;

revoke all on function public.integracao_apagar_segredo(uuid) from public, anon, authenticated;
grant execute on function public.integracao_apagar_segredo(uuid) to service_role;
