-- Reativar cliente sem nova conferência (revisão final de feat/clientes).
-- O cliente arquivado guarda a consultoria e o consultor de quando foi arquivado: quem sai depois (pessoa
-- desativada, movida para a central ou para outra consultoria; consultoria arquivada) não mexe nele. Ao
-- reativar, o que não vale mais sai:
-- - consultoria arquivada → o cliente volta para a central, "a distribuir" (cliente_eventos: devolvido);
-- - consultor que não é mais usuário ativo da consultoria do cliente (administrador, gestor ou pessoa) →
--   o cliente fica aguardando consultor (cliente_eventos: consultor_removido).
-- Se quem reativa já escolhe outra consultoria ou outro consultor na mesma gravação, valem as regras de
-- sempre (consultoria arquivada e consultor inválido são recusados).
-- O resto de validar_cliente é igual à versão de 20261116135529_checkins.sql.

create or replace function private.validar_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_mudou_consultoria boolean;
  v_mudou_consultor boolean;
begin
  new.cnpj := nullif(upper(regexp_replace(new.cnpj, '[^0-9A-Za-z]', '', 'g')), '');

  if tg_op = 'UPDATE' then
    if (select auth.uid()) is not null
       and pg_trigger_depth() = 1
       and not private.sou_central()
       and (new.nome, new.razao_social, new.cnpj, new.cidade, new.uf, new.contato_nome, new.contato_telefone,
            new.contato_email, new.observacoes, new.consultoria_id, new.arquivado_em)
           is distinct from
           (old.nome, old.razao_social, old.cnpj, old.cidade, old.uf, old.contato_nome, old.contato_telefone,
            old.contato_email, old.observacoes, old.consultoria_id, old.arquivado_em) then
      raise exception 'so_central_muda' using errcode = 'P0001';
    end if;

    if old.arquivado_em is not null and new.arquivado_em is null then
      if new.consultoria_id is not distinct from old.consultoria_id and exists (
        select 1 from public.consultorias
        where id = new.consultoria_id and arquivada_em is not null
      ) then
        new.consultoria_id := null;
      elsif new.consultor_id is not null
        and new.consultor_id is not distinct from old.consultor_id
        and new.consultoria_id is not distinct from old.consultoria_id
        and not exists (
          select 1 from public.perfis p
          where p.id = new.consultor_id
            and p.ativo
            and p.consultoria_id = new.consultoria_id
            and p.papel in ('admin', 'gestor', 'pessoa')
        ) then
        new.consultor_id := null;
      end if;
    end if;

    v_mudou_consultoria := new.consultoria_id is distinct from old.consultoria_id;
  else
    v_mudou_consultoria := new.consultoria_id is not null;
  end if;

  if v_mudou_consultoria and exists (
    select 1 from public.consultorias
    where id = new.consultoria_id and arquivada_em is not null
  ) then
    raise exception 'consultoria_arquivada' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.enviado_em := case when new.consultoria_id is not null then now() end;
    v_mudou_consultor := new.consultor_id is not null;
    new.consultor_desde := null;
  else
    if v_mudou_consultoria then
      new.consultor_id := null;
      new.enviado_em := now();
      new.consultor_desde := null;
    end if;
    v_mudou_consultor := new.consultor_id is distinct from old.consultor_id;
    new.atualizado_em := now();
  end if;

  if v_mudou_consultor then
    if new.consultor_id is not null
       and (select auth.uid()) is not null
       and not private.gerencio_consultoria(new.consultoria_id) then
      raise exception 'consultoria_escolhe_consultor' using errcode = 'P0001';
    end if;
    if new.consultor_id is not null and not exists (
      select 1 from public.perfis p
      where p.id = new.consultor_id
        and p.ativo
        and p.consultoria_id = new.consultoria_id
        and p.papel in ('admin', 'gestor', 'pessoa')
    ) then
      raise exception 'consultor_invalido' using errcode = 'P0001';
    end if;
    new.consultor_desde := case when new.consultor_id is not null then now() end;
  end if;

  return new;
end $$;

-- Check-in: além de ser o consultor do cliente ativo, o cliente precisa estar na consultoria atual de quem
-- faz o check-in (o check-in guarda a consultoria do cliente, e uma consultoria nunca vê as horas de outra).
-- O resto é igual à versão de 20261116135529_checkins.sql.
create or replace function private.validar_checkin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select c.consultoria_id into new.consultoria_id
    from public.clientes c
    where c.id = new.cliente_id
      and not c.arquivado
      and c.consultor_id = new.consultor_id
      and c.consultor_id = (select auth.uid())
      and c.consultoria_id = private.consultoria_atual();
    if not found then
      raise exception 'checkin_sem_cliente' using errcode = 'P0001';
    end if;
    new.criado_em := now();
  elsif old.fim is not null and new.fim is null and not exists (
    select 1 from public.clientes c
    where c.id = new.cliente_id and not c.arquivado and c.consultor_id = new.consultor_id
  ) then
    raise exception 'checkin_sem_cliente' using errcode = 'P0001';
  end if;

  if pg_trigger_depth() = 1
     and (new.inicio > now() + interval '1 minute' or new.fim > now() + interval '1 minute') then
    raise exception 'checkin_no_futuro' using errcode = 'P0001';
  end if;

  new.atualizado_em := now();
  return new;
end $$;
