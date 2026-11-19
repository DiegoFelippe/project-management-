-- A gestão da consultoria (administrador e gestor) também edita os dados do cliente: nome, razão social, CNPJ, cidade,
-- UF, contato e observações (pedido do Diego, 19/11). A política de update já deixava ("a central ou quem cuida da
-- consultoria edita"); quem recusava era este gatilho (so_central_muda).
-- Continua só da central (e do dono): mandar, mover e devolver (consultoria_id) e arquivar/reativar (arquivado_em). Cliente
-- arquivado: a gestão não mexe nos dados (só lê, como no resto do app). O consultor não edita (a política nem alcança a linha).
-- Mesmo corpo de 20261116174404_reativar_cliente.sql; muda só o bloco do so_central_muda.

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
       and ((new.consultoria_id, new.arquivado_em) is distinct from (old.consultoria_id, old.arquivado_em)
         or ((new.nome, new.razao_social, new.cnpj, new.cidade, new.uf, new.contato_nome, new.contato_telefone,
              new.contato_email, new.observacoes)
             is distinct from
             (old.nome, old.razao_social, old.cnpj, old.cidade, old.uf, old.contato_nome, old.contato_telefone,
              old.contato_email, old.observacoes)
           and not (old.arquivado_em is null and private.gerencio_consultoria(old.consultoria_id)))) then
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
