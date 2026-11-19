-- Google de cada pessoa (desenho: docs/superpowers/specs/2026-11-16-calendario-design.md, "Google — conta de cada
-- consultor"). A Edge Function google-pessoa conecta, renova e desconecta; o navegador nunca vê o token.
-- 1. google_estados: o pedido de "Conectar Google" — uso único, 10 minutos, preso a quem pediu, com o verificador do
--    PKCE. Tabela própria, separada de oauth_estados (integração da consultoria): o estado de um fluxo nunca é aceito
--    pelo outro, e o da pessoa não tem consultoria nem endereço de volta (o Google volta sempre para
--    GOOGLE_PESSOA_REDIRECT_URI). Só a Edge Function (service_role) lê e grava.
-- 2. Token no Vault: private.gravar_token_da_pessoa / private.ler_token_da_pessoa. O schema private não está na API,
--    por isso a Edge Function chama os invólucros public.* de mesmo nome, que só a service_role executa.
-- 3. Reconectar e renovar trocam o token no mesmo segredo (vault.update_secret); e qualquer troca do segredo_id da
--    conexão apaga o segredo antigo (antes só o delete apagava): nada fica para trás no Vault.

-- ── Pedidos de "Conectar Google" ─────────────────────────────────────────────

create table public.google_estados (
  estado text primary key check (char_length(estado) between 32 and 200),
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  verificador text not null check (char_length(verificador) between 43 and 128),
  criado_em timestamptz not null default now()
);

alter table public.google_estados enable row level security;
revoke all on public.google_estados from public, anon, authenticated;
grant all on public.google_estados to service_role;

create index google_estados_perfil_idx on public.google_estados (perfil_id);
create index google_estados_criado_em_idx on public.google_estados (criado_em);

-- ── Token da pessoa no Vault ─────────────────────────────────────────────────

-- Com e-mail: conectar ou reconectar (conta, escopos e "quando conectou" novos). Sem e-mail: renovar (só o token).
-- Os dois limpam o erro ("Reconecte o Google"). Renovar quem desconectou no meio do caminho não recria nada (false).
create function private.gravar_token_da_pessoa(p_perfil uuid, p_segredo text, p_email text default null,
  p_escopos text[] default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_existe boolean;
  v_segredo uuid;
begin
  if p_perfil is null or coalesce(p_segredo, '') = '' then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  select true, segredo_id into v_existe, v_segredo
  from public.google_pessoas where perfil_id = p_perfil
  for update;

  if v_existe is null then
    if p_email is null then
      return false;
    end if;
    v_segredo := vault.create_secret(p_segredo,
      'google_pessoa_' || p_perfil::text || '_' || gen_random_uuid()::text, 'Token do Google da pessoa');
    -- Dois "conectar" ao mesmo tempo: o segundo troca o segredo_id e o gatilho apaga o segredo do primeiro.
    insert into public.google_pessoas (perfil_id, email, escopos, segredo_id)
    values (p_perfil, lower(btrim(p_email)), coalesce(p_escopos, '{}'), v_segredo)
    on conflict (perfil_id) do update
      set email = excluded.email, escopos = excluded.escopos, segredo_id = excluded.segredo_id,
          conectado_em = now(), erro = null;
    return true;
  end if;

  if v_segredo is null then
    v_segredo := vault.create_secret(p_segredo,
      'google_pessoa_' || p_perfil::text || '_' || gen_random_uuid()::text, 'Token do Google da pessoa');
  else
    perform vault.update_secret(v_segredo, p_segredo);
  end if;

  update public.google_pessoas
  set segredo_id = v_segredo,
      erro = null,
      email = coalesce(lower(btrim(p_email)), email),
      escopos = case when p_email is null then escopos else coalesce(p_escopos, escopos) end,
      conectado_em = case when p_email is null then conectado_em else now() end
  where perfil_id = p_perfil;
  return true;
end $$;

create function private.ler_token_da_pessoa(p_perfil uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
  from public.google_pessoas g
  join vault.decrypted_secrets s on s.id = g.segredo_id
  where g.perfil_id = p_perfil
$$;

create function public.gravar_token_da_pessoa(p_perfil uuid, p_segredo text, p_email text default null,
  p_escopos text[] default null)
returns boolean language sql security definer set search_path = '' as $$
  select private.gravar_token_da_pessoa(p_perfil, p_segredo, p_email, p_escopos)
$$;

create function public.ler_token_da_pessoa(p_perfil uuid) returns text
language sql stable security definer set search_path = '' as $$
  select private.ler_token_da_pessoa(p_perfil)
$$;

revoke all on function private.gravar_token_da_pessoa(uuid, text, text, text[]), private.ler_token_da_pessoa(uuid),
  public.gravar_token_da_pessoa(uuid, text, text, text[]), public.ler_token_da_pessoa(uuid)
  from public, anon, authenticated;
grant execute on function private.gravar_token_da_pessoa(uuid, text, text, text[]), private.ler_token_da_pessoa(uuid),
  public.gravar_token_da_pessoa(uuid, text, text, text[]), public.ler_token_da_pessoa(uuid)
  to service_role;

-- ── Nada fica para trás no Vault ─────────────────────────────────────────────

-- Apagar a conexão (ou a pessoa) e trocar o segredo_id apagam o segredo antigo.
create or replace function private.apagar_segredo_do_google() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antigo uuid;
begin
  if tg_op = 'DELETE' then
    v_antigo := old.segredo_id;
  elsif old.segredo_id is distinct from new.segredo_id then
    v_antigo := old.segredo_id;
  end if;
  if v_antigo is not null then
    delete from vault.secrets where id = v_antigo;
  end if;
  return null;
end $$;

create trigger google_pessoas_trocar_segredo
  after update of segredo_id on public.google_pessoas
  for each row execute function private.apagar_segredo_do_google();
