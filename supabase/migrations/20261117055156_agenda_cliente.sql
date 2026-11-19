-- Agenda e clientes:
-- 1. Apagar um cliente solta o evento (cliente_id = null, on delete set null) e não pode ser recusado pela conferência
--    da pasta: sem cliente, o evento também perde a pasta (a pasta do cliente some junto com ele).
-- 2. Cliente que muda de consultoria: os eventos da consultoria antiga perdem cliente e pasta (como o check-in fecha ao
--    mover o cliente), para o nome dele não ficar visível para quem já não cuida dele. Por garantia, o JSON do evento só
--    entrega o cliente quando ele é da consultoria do evento.

create or replace function private.validar_evento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_insere boolean := tg_op = 'INSERT';
  v_mudou_consultoria boolean := v_insere or new.consultoria_id is distinct from old.consultoria_id;
begin
  -- Sem cliente não há pasta de cliente: apagar o cliente (on delete set null) solta a pasta junto, sem recusar.
  if new.cliente_id is null then
    new.pasta_id := null;
  end if;

  if v_mudou_consultoria or new.consultor_id is distinct from old.consultor_id then
    if not exists (
      select 1 from public.perfis p
      where p.id = new.consultor_id
        and p.consultoria_id = new.consultoria_id
        and p.papel in ('admin', 'gestor', 'pessoa')
    ) then
      raise exception 'consultor_invalido' using errcode = 'P0001';
    end if;
  end if;

  if new.cliente_id is not null
     and (v_mudou_consultoria or new.cliente_id is distinct from old.cliente_id) then
    if not exists (
      select 1 from public.clientes c where c.id = new.cliente_id and c.consultoria_id = new.consultoria_id
    ) then
      raise exception 'cliente_invalido' using errcode = 'P0001';
    end if;
  end if;

  if new.pasta_id is not null
     and (v_insere or new.pasta_id is distinct from old.pasta_id or new.cliente_id is distinct from old.cliente_id) then
    if not exists (
      select 1 from public.cliente_pastas pa where pa.id = new.pasta_id and pa.cliente_id = new.cliente_id
    ) then
      raise exception 'pasta_invalida' using errcode = 'P0001';
    end if;
  end if;

  if not v_insere and v_mudou_consultoria and exists (
    select 1 from public.agenda_participantes pt
    join public.perfis p on p.id = pt.perfil_id
    where pt.evento_id = new.id and p.consultoria_id is distinct from new.consultoria_id
  ) then
    raise exception 'participante_invalido' using errcode = 'P0001';
  end if;

  return new;
end $$;


create function private.limpar_agenda_do_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.agenda_eventos
  set cliente_id = null, pasta_id = null
  where cliente_id = new.id and consultoria_id is distinct from new.consultoria_id;
  return new;
end $$;

create trigger clientes_limpar_agenda
  after update of consultoria_id on public.clientes
  for each row
  when (old.consultoria_id is distinct from new.consultoria_id)
  execute function private.limpar_agenda_do_cliente();

create or replace function private.evento_em_json(e public.agenda_eventos) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'consultoria_id', e.consultoria_id, 'consultor_id', e.consultor_id, 'cliente_id', e.cliente_id,
    'titulo', e.titulo, 'descricao', e.descricao, 'inicio', e.inicio, 'fim', e.fim, 'dia_inteiro', e.dia_inteiro,
    'cor', e.cor, 'com_meet', e.com_meet, 'gravar', e.gravar, 'meet_link', e.meet_link, 'meet_codigo', e.meet_codigo,
    'google_evento_id', e.google_evento_id, 'reuniao', e.reuniao, 'reuniao_erro', e.reuniao_erro,
    'gravacao_url', e.gravacao_url, 'pasta_id', e.pasta_id, 'criado_por', e.criado_por,
    'criado_em', e.criado_em, 'atualizado_em', e.atualizado_em,
    'consultor', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'cor', p.cor)
                  from public.perfis p where p.id = e.consultor_id),
    'cliente', (select jsonb_build_object('id', c.id, 'nome', c.nome) from public.clientes c
                  where c.id = e.cliente_id and c.consultoria_id = e.consultoria_id),
    'participantes', coalesce((
      select jsonb_agg(jsonb_build_object('id', pt.id, 'perfil_id', pt.perfil_id, 'email', pt.email,
        'resposta', pt.resposta, 'nome', pp.nome) order by pt.id)
      from public.agenda_participantes pt
      left join public.perfis pp on pp.id = pt.perfil_id
      where pt.evento_id = e.id
    ), '[]'::jsonb)
  )
$$;

