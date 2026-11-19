-- Pastas nos Arquivos do cliente (desenho em docs/superpowers/specs/2026-11-16-calendario-design.md, "Pastas nos
-- Arquivos do cliente"). Uma pasta agrupa os arquivos de um cliente; o nome é único por cliente, sem diferenciar
-- maiúsculas. As regras são as de cliente_arquivos:
-- - Quem cria: quem pode enviar arquivo ao cliente (private.posso_enviar_arquivo).
-- - Quem vê: como o arquivo (private.vejo_arquivo): a consultoria vê as pastas criadas por ela e as da central; a
--   central vê todas. A consultoria da pasta é a do cliente na criação (nula quando quem cria é a central).
-- - Quem renomeia e apaga: a central, quem criou e admin/gestor da consultoria da pasta, enquanto veem a pasta.
-- - Apagar a pasta apaga as linhas dos arquivos dela (on delete cascade); o app tira os objetos do Storage em
--   seguida, pelo mesmo caminho de apagarArquivo (o gatilho de private.arquivos_apagados também vale na cascata).
-- evento_id é a reunião da agenda dona da pasta (criada pela rotina da agenda); a chave estrangeira entra
-- junto com a tabela de eventos.

create table public.cliente_pastas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete cascade,
  -- A consultoria do cliente na criação (preenchida pelo gatilho); nula quando quem cria é a central.
  consultoria_id uuid references public.consultorias on delete restrict,
  nome text not null check (char_length(btrim(nome)) between 1 and 120),
  evento_id uuid,
  criada_por uuid default auth.uid() references public.perfis on delete set null,
  criada_em timestamptz not null default now()
);

alter table public.cliente_pastas enable row level security;

create unique index cliente_pastas_nome_idx on public.cliente_pastas (cliente_id, lower(btrim(nome)));
create index cliente_pastas_cliente_idx on public.cliente_pastas (cliente_id, criada_em desc);
create index cliente_pastas_consultoria_idx on public.cliente_pastas (consultoria_id);
create index cliente_pastas_criada_por_idx on public.cliente_pastas (criada_por);
create index cliente_pastas_evento_idx on public.cliente_pastas (evento_id);

alter table public.cliente_arquivos
  add column pasta_id uuid references public.cliente_pastas on delete cascade;

create index cliente_arquivos_pasta_idx on public.cliente_arquivos (pasta_id, enviado_em desc);

-- ── Regras ───────────────────────────────────────────────────────────────────

-- Vê a pasta: como o arquivo.
create function private.vejo_pasta(p_consultoria uuid, p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.vejo_arquivo(p_consultoria, p_cliente)
$$;

-- Renomeia e apaga a pasta: a central; ou quem criou e quem cuida da consultoria da pasta, enquanto veem a pasta.
-- A pasta da central só a central muda.
create function private.posso_mudar_pasta(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.sou_central()
      or (p.consultoria_id = private.consultoria_atual()
          and private.vejo_pasta(p.consultoria_id, p.cliente_id)
          and (p.criada_por = (select auth.uid()) or private.gerencio_consultoria(p.consultoria_id)))
    from public.cliente_pastas p
    where p.id = p_id
  ), false)
$$;

-- O arquivo só entra numa pasta do mesmo cliente que a pessoa vê.
create function private.pasta_serve_ao_arquivo(p_pasta uuid, p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.cliente_id = p_cliente and private.vejo_pasta(p.consultoria_id, p.cliente_id)
    from public.cliente_pastas p
    where p.id = p_pasta
  ), false)
$$;

revoke all on function private.vejo_pasta(uuid, uuid), private.posso_mudar_pasta(uuid),
  private.pasta_serve_ao_arquivo(uuid, uuid) from public, anon;
grant execute on function private.vejo_pasta(uuid, uuid), private.posso_mudar_pasta(uuid),
  private.pasta_serve_ao_arquivo(uuid, uuid) to authenticated;

-- ── Gatilhos ─────────────────────────────────────────────────────────────────

-- Antes de criar: a autora é quem está logado, a data é agora, a consultoria é a do cliente (nula quando quem
-- cria é a central) e o evento só vem da rotina da agenda (sem usuário logado). O que vier do app é ignorado.
create function private.preparar_pasta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.criada_por := (select auth.uid());
  new.criada_em := now();
  new.consultoria_id := case
    when private.sou_central() then null
    else (select c.consultoria_id from public.clientes c where c.id = new.cliente_id)
  end;
  if (select auth.uid()) is not null then
    new.evento_id := null;
  end if;
  return new;
end $$;

create trigger cliente_pastas_preparar
  before insert on public.cliente_pastas
  for each row execute function private.preparar_pasta();

create function private.conferir_pasta_do_arquivo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.pasta_id is not null and not private.pasta_serve_ao_arquivo(new.pasta_id, new.cliente_id) then
    raise exception 'pasta inválida para o arquivo' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger cliente_arquivos_conferir_pasta
  before insert on public.cliente_arquivos
  for each row execute function private.conferir_pasta_do_arquivo();

revoke all on function private.preparar_pasta(), private.conferir_pasta_do_arquivo() from public;

-- ── Políticas ────────────────────────────────────────────────────────────────

create policy "ver pastas conforme o papel" on public.cliente_pastas
  for select to authenticated
  using ((select private.vejo_pasta(consultoria_id, cliente_id)));

create policy "criar pasta no cliente" on public.cliente_pastas
  for insert to authenticated
  with check ((select private.posso_enviar_arquivo(cliente_id)));

create policy "renomear pasta do cliente" on public.cliente_pastas
  for update to authenticated
  using ((select private.posso_mudar_pasta(id)))
  with check ((select private.posso_mudar_pasta(id)));

create policy "apagar pasta do cliente" on public.cliente_pastas
  for delete to authenticated
  using ((select private.posso_mudar_pasta(id)));

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.cliente_pastas from anon, authenticated;
grant select, insert, delete on public.cliente_pastas to authenticated;
grant update (nome) on public.cliente_pastas to authenticated;
grant all on public.cliente_pastas to service_role;
