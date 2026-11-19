-- Arquivos do cliente (desenho em docs/superpowers/specs/2026-11-13-clientes-design.md, "Página do cliente em
-- abas", Arquivos). O arquivo fica no Storage, no bucket privado "arquivos", na pasta do cliente
-- (<cliente_id>/<uuid>-<nome>); a linha em cliente_arquivos guarda o nome, o tamanho, quem enviou e a consultoria
-- do envio (nula quando quem envia é a central).
-- - Quem envia: a central e, na consultoria que atende o cliente ativo, admin, gestor e o consultor do cliente.
-- - Quem vê: como os check-ins: a consultoria vê os arquivos enviados por ela e os da central; a central vê
--   todos. Uma consultoria nunca vê arquivos de outra, nem depois que o cliente muda de consultoria.
-- - Quem apaga: quem enviou, admin/gestor da consultoria do arquivo e a central. Arquivo não é editado.
-- O app (src/data/arquivos.js) sobe o objeto e depois grava a linha; para apagar, apaga a linha e depois o objeto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arquivos', 'arquivos', false, 26214400, null)
on conflict (id) do nothing;

-- ── Tabela ───────────────────────────────────────────────────────────────────

create table public.cliente_arquivos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete cascade,
  -- A consultoria do cliente no envio (preenchida pelo gatilho); nula quando quem envia é a central.
  consultoria_id uuid references public.consultorias on delete restrict,
  caminho text not null unique,
  nome text not null check (char_length(btrim(nome)) between 1 and 200),
  tamanho bigint not null check (tamanho between 1 and 26214400),
  tipo text check (tipo is null or char_length(tipo) <= 255),
  enviado_por uuid default auth.uid() references public.perfis on delete set null,
  enviado_em timestamptz not null default now(),
  -- O caminho começa com a pasta do cliente; o nome é o que o app limpa (src/lib/arquivos.js).
  check (caminho ~ ('^' || cliente_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$'))
);

alter table public.cliente_arquivos enable row level security;

create index cliente_arquivos_cliente_idx on public.cliente_arquivos (cliente_id, enviado_em desc);
create index cliente_arquivos_consultoria_idx on public.cliente_arquivos (consultoria_id);
create index cliente_arquivos_enviado_por_idx on public.cliente_arquivos (enviado_por);

-- Quem apagou cada linha, por 1 dia: deixa essa pessoa tirar o objeto do Storage logo depois de apagar a linha,
-- mesmo que não tenha sido ela quem o enviou (o gestor, o admin ou a central). Só as funções daqui leem.
create table private.arquivos_apagados (
  caminho text primary key,
  apagado_por uuid not null,
  apagado_em timestamptz not null default now()
);

create index arquivos_apagados_em_idx on private.arquivos_apagados (apagado_em);
alter table private.arquivos_apagados enable row level security;
revoke all on private.arquivos_apagados from public, anon, authenticated;

-- ── Regras ───────────────────────────────────────────────────────────────────

-- Envia arquivo ao cliente: a central; ou, com o cliente ativo na minha consultoria, quem cuida dela
-- (admin/gestor) ou o consultor do cliente. Cliente que não existe não recebe nada.
create function private.posso_enviar_arquivo(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.sou_central()
      or (not c.arquivado
          and c.consultoria_id = private.consultoria_atual()
          and (private.gerencio_consultoria(c.consultoria_id)
               or (c.consultor_id = (select auth.uid()) and private.liberado())))
    from public.clientes c
    where c.id = p_cliente
  ), false)
$$;

-- Vê o arquivo: a central; ou quem vê o cliente, quando o arquivo é da consultoria dele ou da central.
create function private.vejo_arquivo(p_consultoria uuid, p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.sou_central()
    or ((p_consultoria is null or p_consultoria = private.consultoria_atual())
        and exists (
          select 1 from public.clientes c
          where c.id = p_cliente and private.vejo_cliente(c.consultoria_id, c.consultor_id))),
    false)
$$;

-- Apaga o arquivo: a central; ou quem enviou e quem cuida da consultoria do arquivo, enquanto veem o arquivo
-- (a consultoria que perdeu o cliente, ou quem saiu dela, não apaga mais). O da central só a central apaga.
create function private.posso_apagar_arquivo(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.sou_central()
      or (a.consultoria_id = private.consultoria_atual()
          and private.vejo_arquivo(a.consultoria_id, a.cliente_id)
          and (a.enviado_por = (select auth.uid()) or private.gerencio_consultoria(a.consultoria_id)))
    from public.cliente_arquivos a
    where a.id = p_id
  ), false)
$$;

-- Objeto do bucket "arquivos" que não tem linha em cliente_arquivos (a linha ainda não foi gravada, não gravou
-- ou acabou de ser apagada): só quem o subiu, ou quem apagou a linha há menos de 1 dia, o enxerga e o tira.
-- Enquanto a linha existe, o objeto não sai do Storage: assim a lista nunca aponta para um objeto que sumiu.
create function private.posso_tirar_objeto_de_arquivo(p_caminho text, p_dono text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and not exists (select 1 from public.cliente_arquivos a where a.caminho = p_caminho)
    and (p_dono = (select auth.uid())::text
         or exists (
           select 1 from private.arquivos_apagados x
           where x.caminho = p_caminho
             and x.apagado_por = (select auth.uid())
             and x.apagado_em > now() - interval '1 day')),
    false)
$$;

-- Vê o objeto (é o que o link assinado e a lista do Storage pedem): a regra da linha com esse caminho; sem
-- linha, a regra acima.
create function private.vejo_objeto_de_arquivo(p_caminho text, p_dono text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    exists (
      select 1 from public.cliente_arquivos a
      where a.caminho = p_caminho and private.vejo_arquivo(a.consultoria_id, a.cliente_id))
    or private.posso_tirar_objeto_de_arquivo(p_caminho, p_dono),
    false)
$$;

revoke all on function private.posso_enviar_arquivo(uuid), private.vejo_arquivo(uuid, uuid),
  private.posso_apagar_arquivo(uuid), private.posso_tirar_objeto_de_arquivo(text, text),
  private.vejo_objeto_de_arquivo(text, text) from public, anon;
grant execute on function private.posso_enviar_arquivo(uuid), private.vejo_arquivo(uuid, uuid),
  private.posso_apagar_arquivo(uuid), private.posso_tirar_objeto_de_arquivo(text, text),
  private.vejo_objeto_de_arquivo(text, text) to authenticated;

-- ── Gatilhos ─────────────────────────────────────────────────────────────────

-- Antes de gravar: o autor é quem está logado, a data é agora e a consultoria é a do cliente (nula quando quem
-- envia é a central). O que vier do app nesses campos é ignorado.
create function private.preparar_arquivo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.enviado_por := (select auth.uid());
  new.enviado_em := now();
  new.consultoria_id := case
    when private.sou_central() then null
    else (select c.consultoria_id from public.clientes c where c.id = new.cliente_id)
  end;
  return new;
end $$;

create trigger cliente_arquivos_preparar
  before insert on public.cliente_arquivos
  for each row execute function private.preparar_arquivo();

-- Depois de apagar (inclusive junto com o cliente): guarda quem apagou cada caminho e descarta o que passou
-- de 1 dia.
create function private.lembrar_quem_apagou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.arquivos_apagados where apagado_em < now() - interval '1 day';
  if (select auth.uid()) is not null then
    insert into private.arquivos_apagados (caminho, apagado_por)
    select caminho, (select auth.uid()) from apagados
    on conflict (caminho) do update set apagado_por = excluded.apagado_por, apagado_em = excluded.apagado_em;
  end if;
  return null;
end $$;

create trigger cliente_arquivos_lembrar_quem_apagou
  after delete on public.cliente_arquivos
  referencing old table as apagados
  for each statement execute function private.lembrar_quem_apagou();

revoke all on function private.preparar_arquivo(), private.lembrar_quem_apagou() from public;

-- ── Políticas ────────────────────────────────────────────────────────────────

create policy "ver arquivos conforme o papel" on public.cliente_arquivos
  for select to authenticated
  using ((select private.vejo_arquivo(consultoria_id, cliente_id)));

create policy "enviar arquivo ao cliente" on public.cliente_arquivos
  for insert to authenticated
  with check ((select private.posso_enviar_arquivo(cliente_id)));

create policy "apagar arquivo do cliente" on public.cliente_arquivos
  for delete to authenticated
  using ((select private.posso_apagar_arquivo(id)));

-- Storage: subir na pasta de um cliente que a pessoa pode receber arquivo; ver e baixar pela linha; tirar só
-- depois que a linha saiu. Sem política de update: objeto não é trocado nem movido.
create policy "arquivos: enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'arquivos'
    and owner_id = (select auth.uid())::text
    and (select private.posso_enviar_arquivo(private.id_da_pasta(name)))
  );

create policy "arquivos: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'arquivos' and (select private.vejo_objeto_de_arquivo(name, owner_id)));

create policy "arquivos: tirar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'arquivos' and (select private.posso_tirar_objeto_de_arquivo(name, owner_id)));

-- ── Autor do arquivo (relação calculada da API) ──────────────────────────────

-- select=...,autor:autor_do_arquivo(nome): o nome de quem enviou, no molde de consultor_do_checkin. O gestor vê
-- os arquivos da consultoria inteira, mas em perfis só enxerga quem ele criou e as pessoas dos times dele; e a
-- consultoria não enxerga a central. A função ignora os dados da linha recebida (que podem ser forjados), relê
-- o arquivo guardado com aquele id e devolve só o nome, para quem vê o arquivo: o arquivo da central aparece
-- como "Central" para a consultoria.
create function public.autor_do_arquivo(public.cliente_arquivos) returns setof public.perfis
language sql stable security definer rows 1 set search_path = '' as $$
  select r.*
  from public.cliente_arquivos a
  join public.perfis p on p.id = a.enviado_por
  cross join lateral jsonb_populate_record(null::public.perfis, jsonb_build_object('nome',
    case when a.consultoria_id is null and not private.sou_central() then 'Central' else p.nome end)) r
  where a.id = ($1).id
    and private.vejo_arquivo(a.consultoria_id, a.cliente_id)
$$;

revoke all on function public.autor_do_arquivo(public.cliente_arquivos) from public, anon;
grant execute on function public.autor_do_arquivo(public.cliente_arquivos) to authenticated;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.cliente_arquivos from anon, authenticated;
grant select, insert, delete on public.cliente_arquivos to authenticated;
grant all on public.cliente_arquivos to service_role;
