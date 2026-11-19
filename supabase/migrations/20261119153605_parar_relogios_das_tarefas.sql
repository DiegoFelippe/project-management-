-- O relógio da tarefa pára quando ninguém mais pode pausá-lo (achado da revisão do lote C2, 19/11): o check-list
-- encerrado (tirar ou trocar o modelo, cliente movido ou devolvido), o consultor trocado ou tirado e o cliente arquivado.
-- O trecho aberto fecha em greatest(now(), inicio) e a tarefa em andamento vira pausada (o tempo feito fica; o consultor
-- de agora retoma, se o check-list continua ativo). Sem isto, o trecho ficava aberto e o tempo da tarefa crescia para
-- sempre. Nenhuma linha é apagada.

-- Pára os relógios das tarefas destes check-lists.
create function private.parar_relogios(p_checklists uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  with fechados as (
    update public.checklist_tarefa_tempos tt
    set fim = greatest(now(), tt.inicio)
    from public.checklist_tarefas t
    where tt.tarefa_id = t.id and t.checklist_id = any(p_checklists) and tt.fim is null
    returning tt.tarefa_id
  )
  update public.checklist_tarefas t set estado = 'pausada'
  where t.id in (select tarefa_id from fechados) and t.estado = 'andamento';
end $$;

create function private.parar_relogios_do_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.parar_relogios(array(select cl.id from public.cliente_checklists cl where cl.cliente_id = new.id));
  return null;
end $$;

create function private.parar_relogios_do_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.parar_relogios(array[new.id]);
  return null;
end $$;

revoke all on function private.parar_relogios(uuid[]), private.parar_relogios_do_cliente(),
  private.parar_relogios_do_checklist() from public, anon, authenticated;

-- As mesmas mudanças que fecham o check-in aberto (clientes_fechar_checkin).
create trigger clientes_parar_relogios
  after update on public.clientes
  for each row
  when (old.consultor_id is distinct from new.consultor_id
    or old.consultoria_id is distinct from new.consultoria_id
    or (old.arquivado_em is null and new.arquivado_em is not null))
  execute function private.parar_relogios_do_cliente();

create trigger cliente_checklists_parar_relogios
  after update of encerrado_em on public.cliente_checklists
  for each row
  when (old.encerrado_em is null and new.encerrado_em is not null)
  execute function private.parar_relogios_do_checklist();
