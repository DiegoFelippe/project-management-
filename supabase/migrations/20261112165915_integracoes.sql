-- Integrações (desenho em docs/superpowers/specs/2026-11-12-integracoes-design.md).
-- Uma conexão por tipo por consultoria. A tabela guarda só a configuração sem segredo e o estado do
-- último teste; o segredo (chave de API, senha do SMTP, token do Google) fica cifrado no Vault.
-- O navegador só lê (admin da consultoria e dono); tudo que grava passa pela Edge Function `integracoes`.

create table public.integracoes (
  id uuid primary key default gen_random_uuid(),
  consultoria_id uuid not null references public.consultorias (id) on delete cascade,
  tipo text not null check (tipo in ('ia', 'smtp', 'google')),
  config jsonb not null default '{}'::jsonb,
  segredo_id uuid,
  situacao text not null default 'com_erro' check (situacao in ('conectada', 'com_erro')),
  ultimo_teste_em timestamptz,
  ultimo_erro text check (ultimo_erro is null or char_length(ultimo_erro) <= 500),
  conectada_por uuid references public.perfis (id) on delete set null,
  conectada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  unique (consultoria_id, tipo)
);

alter table public.integracoes enable row level security;

create policy "admin vê as da consultoria; dono vê todas" on public.integracoes
  for select to authenticated
  using (private.sou_dono() or (private.sou_admin() and consultoria_id = private.consultoria_atual()));

revoke all on public.integracoes from anon, authenticated;
grant select (id, consultoria_id, tipo, config, situacao, ultimo_teste_em, ultimo_erro, conectada_por, conectada_em, atualizada_em)
  on public.integracoes to authenticated;
grant all on public.integracoes to service_role;

create index integracoes_conectada_por_idx on public.integracoes (conectada_por);

-- Apagar a integração (desconectar ou apagar a consultoria) apaga o segredo junto.
create function private.apagar_segredo_da_integracao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.segredo_id is not null then
    delete from vault.secrets where id = old.segredo_id;
  end if;
  return old;
end $$;

create trigger integracoes_apagar_segredo
  after delete on public.integracoes
  for each row execute function private.apagar_segredo_da_integracao();

-- Salvar (criar ou editar): segredo nulo mantém o atual. Só a Edge Function (service_role) chama.
create function public.integracao_salvar(p_consultoria uuid, p_tipo text, p_config jsonb, p_segredo text, p_quem uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_segredo uuid;
begin
  select id, segredo_id into v_id, v_segredo
  from public.integracoes where consultoria_id = p_consultoria and tipo = p_tipo
  for update;

  if p_segredo is not null then
    if v_segredo is null then
      v_segredo := vault.create_secret(p_segredo,
        'integracao_' || p_tipo || '_' || p_consultoria::text || '_' || gen_random_uuid()::text,
        'Segredo da integração ' || p_tipo);
    else
      perform vault.update_secret(v_segredo, p_segredo);
    end if;
  end if;

  if v_id is null then
    insert into public.integracoes (consultoria_id, tipo, config, segredo_id, conectada_por)
    values (p_consultoria, p_tipo, coalesce(p_config, '{}'::jsonb), v_segredo, p_quem)
    returning id into v_id;
  else
    update public.integracoes
    set config = coalesce(p_config, config), segredo_id = v_segredo, conectada_por = p_quem, atualizada_em = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

-- Ler o segredo (para testar e para os outros lugares do sistema usarem a mesma conexão).
create function public.integracao_segredo(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
  from public.integracoes i
  join vault.decrypted_secrets s on s.id = i.segredo_id
  where i.id = p_id
$$;

create function public.integracao_desconectar(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.integracoes where id = p_id
$$;

revoke all on function public.integracao_salvar(uuid, text, jsonb, text, uuid), public.integracao_segredo(uuid),
  public.integracao_desconectar(uuid) from public, anon, authenticated;
grant execute on function public.integracao_salvar(uuid, text, jsonb, text, uuid), public.integracao_segredo(uuid),
  public.integracao_desconectar(uuid) to service_role;
revoke all on function private.apagar_segredo_da_integracao() from public;

-- "Conectar com Google": o estado do OAuth (vale 10 minutos) liga a volta do Google à consultoria
-- e a quem pediu. Só a Edge Function lê e grava.
create table public.oauth_estados (
  estado text primary key,
  consultoria_id uuid not null references public.consultorias (id) on delete cascade,
  pessoa_id uuid not null references public.perfis (id) on delete cascade,
  volta text not null,
  criado_em timestamptz not null default now()
);

alter table public.oauth_estados enable row level security;
revoke all on public.oauth_estados from anon, authenticated;
grant all on public.oauth_estados to service_role;
create index oauth_estados_consultoria_idx on public.oauth_estados (consultoria_id);
create index oauth_estados_pessoa_idx on public.oauth_estados (pessoa_id);
