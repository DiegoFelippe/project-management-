-- A central escolhe só a consultoria; o consultor é escolhido sempre pelo administrador ou por um gestor
-- da consultoria (decisão 4 do desenho). Vale também para o dono. Com usuário logado, pôr um consultor
-- (no cadastro ou depois) exige gerencio_consultoria; tirar o consultor (nulo) continua livre, porque
-- mover, devolver, a saída da pessoa e o "on delete set null" fazem isso. Sem usuário logado (sementes,
-- chave secreta) segue como antes.

create or replace function private.validar_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_mudou_consultoria boolean;
  v_mudou_consultor boolean;
begin
  new.cnpj := nullif(upper(regexp_replace(new.cnpj, '[^0-9A-Za-z]', '', 'g')), '');

  if tg_op = 'UPDATE' then
    if (select auth.uid()) is not null
       and not private.sou_central()
       and (new.nome, new.razao_social, new.cnpj, new.cidade, new.uf, new.contato_nome, new.contato_telefone,
            new.contato_email, new.observacoes, new.consultoria_id, new.arquivado_em)
           is distinct from
           (old.nome, old.razao_social, old.cnpj, old.cidade, old.uf, old.contato_nome, old.contato_telefone,
            old.contato_email, old.observacoes, old.consultoria_id, old.arquivado_em) then
      raise exception 'so_central_muda' using errcode = 'P0001';
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
