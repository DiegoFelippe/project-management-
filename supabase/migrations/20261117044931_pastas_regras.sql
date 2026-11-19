-- Pastas do cliente, ajustes de regra:
-- 1. Apagar a pasta leva os arquivos dela por cascata, que não passa por private.posso_apagar_arquivo. Para a pasta
--    não apagar o que a pessoa não apagaria um a um, o apagar da pasta só vale quando ela pode apagar todos os
--    arquivos que estão dentro (a central sempre pode).
-- 2. A rotina da agenda (service role, sem usuário logado) grava arquivo em pasta do mesmo cliente e cria pasta com
--    evento_id. Pasta de outro cliente continua recusada para todos.

create function private.posso_apagar_pasta(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.posso_mudar_pasta(p_id)
    and not exists (
      select 1 from public.cliente_arquivos a
      where a.pasta_id = p_id and not private.posso_apagar_arquivo(a.id))
$$;

-- Quantos arquivos de cada pasta a pessoa vê e não poderia apagar (uma consulta para a página inteira).
create function public.arquivos_que_nao_apago(p_pastas uuid[]) returns table (pasta_id uuid, quantos bigint)
language sql stable security definer set search_path = '' as $$
  select a.pasta_id, count(*)
  from public.cliente_arquivos a
  where a.pasta_id = any (p_pastas)
    and private.vejo_arquivo(a.consultoria_id, a.cliente_id)
    and not private.posso_apagar_arquivo(a.id)
  group by a.pasta_id
$$;

revoke all on function private.posso_apagar_pasta(uuid), public.arquivos_que_nao_apago(uuid[]) from public, anon;
grant execute on function private.posso_apagar_pasta(uuid), public.arquivos_que_nao_apago(uuid[]) to authenticated;

drop policy "apagar pasta do cliente" on public.cliente_pastas;
create policy "apagar pasta do cliente" on public.cliente_pastas
  for delete to authenticated
  using ((select private.posso_apagar_pasta(id)));

-- Sem usuário logado (rotina do sistema): basta a pasta ser do mesmo cliente.
create or replace function private.conferir_pasta_do_arquivo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pasta_id is null then
    return new;
  end if;
  if (select auth.uid()) is null then
    if not exists (select 1 from public.cliente_pastas p where p.id = new.pasta_id and p.cliente_id = new.cliente_id) then
      raise exception 'pasta inválida para o arquivo' using errcode = '42501';
    end if;
  elsif not private.pasta_serve_ao_arquivo(new.pasta_id, new.cliente_id) then
    raise exception 'pasta inválida para o arquivo' using errcode = '42501';
  end if;
  return new;
end $$;
