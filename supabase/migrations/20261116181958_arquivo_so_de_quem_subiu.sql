-- Arquivos do cliente: a linha só aponta para um objeto que a própria pessoa subiu. Um objeto sem linha (o que
-- sobrou quando tirar o objeto falhou depois de apagar a linha) só é visto por quem o subiu ou por quem apagou a
-- linha; se outra pessoa que pode enviar ao cliente gravasse uma linha com esse caminho, passaria a enxergá-lo
-- (por exemplo, a consultoria nova de um cliente que foi movido). O resto é igual a 20261116181430.

create or replace function private.preparar_arquivo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'arquivos'
      and o.name = new.caminho
      and o.owner_id is distinct from (select auth.uid())::text
  ) then
    raise exception 'objeto_de_outra_pessoa' using errcode = 'P0001';
  end if;

  new.enviado_por := (select auth.uid());
  new.enviado_em := now();
  new.consultoria_id := case
    when private.sou_central() then null
    else (select c.consultoria_id from public.clientes c where c.id = new.cliente_id)
  end;
  return new;
end $$;

revoke all on function private.preparar_arquivo() from public;
