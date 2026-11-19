-- Check-ins (desenho em docs/superpowers/specs/2026-11-13-clientes-design.md: "Check-ins", "De quem é cada
-- check-in", "Quando alguém sai" e "Meses").
-- O consultor do cliente registra o trabalho (início e fim). O check-in guarda quem trabalhou e por qual
-- consultoria, e não muda de dono quando o cliente troca de consultor ou de consultoria.
-- Quando alguém sai, os gatilhos daqui devolvem os clientes e fecham o check-in aberto com uma nota:
-- cliente com outro consultor, movido ou arquivado; consultor desativado, movido para a central ou para
-- outra consultoria; consultoria arquivada.

create extension if not exists btree_gist with schema extensions;

-- ── Tabela ───────────────────────────────────────────────────────────────────

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete restrict,
  consultor_id uuid not null default auth.uid() references public.perfis on delete cascade,
  -- A consultoria do cliente no momento do check-in (preenchida pelo gatilho).
  consultoria_id uuid not null references public.consultorias on delete restrict,
  inicio timestamptz not null default now(),
  fim timestamptz,
  descricao text check (descricao is null or char_length(descricao) <= 2000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim is null or (fim > inicio and fim - inicio <= interval '24 hours')),
  check (fim is null or char_length(btrim(coalesce(descricao, ''))) >= 2),
  -- Sem sobreposição entre os check-ins do mesmo consultor; o aberto vai até o infinito, então só um por vez.
  constraint checkins_sem_sobreposicao exclude using gist (
    consultor_id with =,
    tstzrange(inicio, coalesce(fim, 'infinity'), '[)') with &&
  )
);

alter table public.checkins enable row level security;

create index checkins_cliente_idx on public.checkins (cliente_id, inicio desc);
create index checkins_consultor_idx on public.checkins (consultor_id, inicio desc);
create index checkins_consultoria_idx on public.checkins (consultoria_id, inicio);

-- ── Regras do check-in ───────────────────────────────────────────────────────

-- - Criar: só o consultor do cliente ativo, para si mesmo; a consultoria vem do cliente.
-- - Reabrir (tirar o fim): só enquanto o cliente está ativo e ainda é dele (o aberto é sempre do consultor
--   atual; é o que permite fechá-lo quando alguém sai).
-- - Início e fim não ficam no futuro (1 minuto de folga para o relógio de quem usa). O fechamento
--   automático vem de outro gatilho (pg_trigger_depth() > 1) e não passa por aqui.
create function private.validar_checkin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select c.consultoria_id into new.consultoria_id
    from public.clientes c
    where c.id = new.cliente_id
      and not c.arquivado
      and c.consultor_id = new.consultor_id
      and c.consultor_id = (select auth.uid());
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

create trigger checkins_validar
  before insert or update on public.checkins
  for each row execute function private.validar_checkin();

-- Fecha os check-ins abertos do cliente ou do consultor: fim agora (pelo menos 1 segundo depois do início
-- e no máximo 24 horas, para um check-out esquecido não travar a mudança) e a nota, quando ainda não há
-- descrição.
create function private.fechar_checkins(p_cliente uuid, p_consultor uuid, p_nota text) returns void
language sql security definer set search_path = '' as $$
  update public.checkins k
  set fim = least(greatest(now(), k.inicio + interval '1 second'), k.inicio + interval '24 hours'),
      descricao = case when char_length(btrim(coalesce(k.descricao, ''))) >= 2 then k.descricao else p_nota end
  where k.fim is null
    and (k.cliente_id = p_cliente or k.consultor_id = p_consultor)
$$;

-- ── Quando alguém sai ────────────────────────────────────────────────────────

-- O cliente trocou de consultor, mudou de consultoria (ou voltou para a central) ou foi arquivado.
create function private.fechar_checkin_do_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.fechar_checkins(new.id, null,
    case
      when old.arquivado_em is null and new.arquivado_em is not null then 'Encerrado ao arquivar o cliente'
      when new.consultoria_id is distinct from old.consultoria_id then 'Encerrado ao mover o cliente'
      else 'Encerrado ao trocar o consultor'
    end);
  return null;
end $$;

create trigger clientes_fechar_checkin
  after update on public.clientes
  for each row
  when (old.consultor_id is distinct from new.consultor_id
     or old.consultoria_id is distinct from new.consultoria_id
     or (old.arquivado_em is null and new.arquivado_em is not null))
  execute function private.fechar_checkin_do_cliente();

-- A pessoa foi desativada, virou central/dono ou mudou de consultoria: os clientes ativos dela voltam a
-- aguardar consultor na mesma consultoria (cliente_eventos: consultor_removido; o gatilho dos clientes fecha
-- o check-in aberto neles) e algum check-in aberto que sobrar é fechado. Quem sai da consultoria também sai
-- dos times dela, na mesma transação. Desativar não mexe nos times (reativar devolve tudo como estava).
create function private.ao_sair() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.clientes set consultor_id = null
  where consultor_id = new.id and not arquivado;

  perform private.fechar_checkins(null, new.id, 'Encerrado ao trocar o consultor');

  if new.consultoria_id is distinct from old.consultoria_id or new.papel in ('central', 'dono') then
    delete from public.time_membros where pessoa_id = new.id;
  end if;
  return null;
end $$;

create trigger perfis_ao_sair
  after update of ativo, papel, consultoria_id on public.perfis
  for each row
  when ((old.ativo and not new.ativo)
     or old.consultoria_id is distinct from new.consultoria_id
     or (new.papel in ('central', 'dono') and old.papel not in ('central', 'dono')))
  execute function private.ao_sair();

-- Consultoria arquivada: os clientes ativos dela voltam para a central, "a distribuir"
-- (cliente_eventos: devolvido; o gatilho dos clientes fecha os check-ins abertos). Os arquivados ficam.
create function private.ao_arquivar_consultoria() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.clientes set consultoria_id = null
  where consultoria_id = new.id and not arquivado;
  return null;
end $$;

create trigger consultorias_ao_arquivar
  after update of arquivada_em on public.consultorias
  for each row
  when (old.arquivada_em is null and new.arquivada_em is not null)
  execute function private.ao_arquivar_consultoria();

-- validar_cliente: o que vem de outro gatilho (pg_trigger_depth() > 1: a saída de alguém, a consultoria
-- arquivada) é do sistema e não passa por "só a central muda", mesmo com alguém logado na transação.
-- O resto é igual à versão de 20261116133818_clientes_consultor_pela_consultoria.sql.
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

revoke all on function private.validar_checkin(), private.fechar_checkins(uuid, uuid, text),
  private.fechar_checkin_do_cliente(), private.ao_sair(), private.ao_arquivar_consultoria() from public;

-- ── Políticas ────────────────────────────────────────────────────────────────

-- "Cuida da consultoria do check-in" = gerencio_consultoria(consultoria_id), escrito como nos clientes para
-- as funções rodarem uma vez por consulta, e não uma vez por linha.
create policy "ver check-ins conforme o papel" on public.checkins
  for select to authenticated
  using (
    (select private.sou_central())
    or (consultoria_id = (select private.consultoria_atual())
        and (select private.gerencio_consultoria(private.consultoria_atual())))
    or (consultor_id = (select auth.uid()) and (select private.liberado()))
  );

-- O resto da regra (consultor do cliente ativo) está no gatilho checkins_validar.
create policy "o consultor faz o próprio check-in" on public.checkins
  for insert to authenticated
  with check (consultor_id = (select auth.uid()) and (select private.liberado()));

create policy "o consultor ou quem cuida da consultoria corrige" on public.checkins
  for update to authenticated
  using (
    (consultor_id = (select auth.uid()) and (select private.liberado()))
    or (consultoria_id = (select private.consultoria_atual())
        and (select private.gerencio_consultoria(private.consultoria_atual())))
  )
  with check (
    (consultor_id = (select auth.uid()) and (select private.liberado()))
    or (consultoria_id = (select private.consultoria_atual())
        and (select private.gerencio_consultoria(private.consultoria_atual())))
  );

create policy "o consultor ou quem cuida da consultoria apaga" on public.checkins
  for delete to authenticated
  using (
    (consultor_id = (select auth.uid()) and (select private.liberado()))
    or (consultoria_id = (select private.consultoria_atual())
        and (select private.gerencio_consultoria(private.consultoria_atual())))
  );

-- ── Campos e relações calculados da API ──────────────────────────────────────

-- select=...,realizado_no_mes: horas dos check-ins fechados do cliente que começaram no mês atual (horário
-- de São Paulo), com 1 casa. Roda com as permissões de quem pergunta: cada um soma só os check-ins que
-- enxerga (a consultoria, os da equipe dela; a central, todos).
create function public.realizado_no_mes(public.clientes) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1), 0)
  from public.checkins k
  cross join (select date_trunc('month', now() at time zone 'America/Sao_Paulo') as inicio) mes
  where k.cliente_id = ($1).id
    and k.fim is not null
    and k.inicio >= mes.inicio at time zone 'America/Sao_Paulo'
    and k.inicio < (mes.inicio + interval '1 month') at time zone 'America/Sao_Paulo'
$$;

-- select=...,cliente:cliente_do_checkin(id,nome): o nome do cliente no check-in, para o consultor ver os
-- dele depois que o cliente saiu dele (ele não enxerga mais o cliente em clientes). A API só embute
-- relação calculada que devolve uma tabela (returns table/tipo composto não servem), por isso o retorno é
-- "clientes", mas só com id e nome preenchidos. A função ignora os dados da linha recebida (que podem ser
-- forjados) e usa o check-in guardado no banco com aquele id.
create function public.cliente_do_checkin(public.checkins) returns setof public.clientes
language sql stable security definer rows 1 set search_path = '' as $$
  select r.*
  from public.checkins k
  join public.clientes c on c.id = k.cliente_id
  cross join lateral jsonb_populate_record(null::public.clientes, jsonb_build_object('id', c.id, 'nome', c.nome)) r
  where k.id = ($1).id
    and (private.sou_central()
      or private.gerencio_consultoria(k.consultoria_id)
      or (k.consultor_id = (select auth.uid()) and private.liberado()))
$$;

revoke all on function public.realizado_no_mes(public.clientes), public.cliente_do_checkin(public.checkins)
  from public, anon;
grant execute on function public.realizado_no_mes(public.clientes), public.cliente_do_checkin(public.checkins)
  to authenticated;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.checkins from anon, authenticated;
grant select, insert, delete on public.checkins to authenticated;
grant update (inicio, fim, descricao) on public.checkins to authenticated;
grant all on public.checkins to service_role;
