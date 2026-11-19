-- Anexos e imagens da descrição dos cartões (plano docs/superpowers/plans/2026-11-17-kanban-do-cliente.md, Task 2;
-- desenho em docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md, "Decisões minhas"). Só cria e redefine
-- funções e regras: nenhuma linha que já existe é alterada ou apagada.
--
-- - Balde privado "quadros" (até 25 MB, qualquer tipo), na pasta do cliente e do cartão:
--     anexo                <cliente_id>/<cartao_id>/<uuid>-<nome>
--     imagem da descrição  <cliente_id>/<cartao_id>/imagens/<uuid>.<png|jpg|jpeg|gif|webp>
--   A linha do anexo fica em cartao_anexos; a imagem não tem linha: o caminho dela fica no nó "image" da descrição.
-- - Quem anexa e sobe imagem: quem mexe no quadro (consultor do cliente, administrador e gestor da consultoria, com o
--   cliente ativo). Quem vê e baixa (link assinado): quem vê o quadro, a central e o dono também. Quem apaga anexo: quem
--   enviou ou a gestão (e mexe no quadro). Anexo não se edita.
-- - Linha e objeto consistentes (molde: cliente_arquivos, 20261116181430 + 20261116181958 + 20261116183227): o app sobe o
--   objeto e depois grava a linha; para apagar, apaga a linha e depois o objeto. Enquanto está em uso (o anexo tem linha,
--   ou a imagem é de um cartão que existe), o objeto não sai do Storage, nem pela central. Sem uso, sai pelas mãos de quem
--   o subiu (enquanto mexe no cartão), de quem apagou a linha ou o cartão (por 1 dia, private.quadro_objetos_apagados) e
--   da central (a qualquer tempo).
-- - Apagar o cartão: apagar_cartao apaga a linha e devolve os caminhos dos objetos dele (anexos e imagens), que o app
--   tira em seguida. apagar_coluna com os cartões junto devolve também os caminhos. O quadro só sai junto com o cliente
--   quando não tem cartões (os cartões seguram o cliente, Task 1): o que sobrar na pasta do cliente (tirar falhou) a
--   central acha com objetos_para_tirar_do_quadro e tira logo depois de apagar o cliente.
-- - A descrição é conferida no banco: só o JSON do editor (nós e marcas conhecidos), link só http:, https: ou mailto:,
--   imagem só um caminho do balde na pasta de imagens deste cartão (nunca endereço de fora nem data:).
-- - Sem oráculo de existência: os gatilhos security definer da Task 1 (preparar_coluna, preparar_cartao,
--   validar_responsavel, preparar_item_do_checklist) e o novo preparar_anexo conferem no começo se quem está logado
--   mexe no quadro; se não, levantam 42501 antes de ler ou travar qualquer linha do quadro. O sistema (sem usuário
--   logado: service_role, migrações, testes) passa.
-- - cartoes_do_quadro e cartao_do_quadro passam a contar os anexos de cada cartão (mesma assinatura, uma versão só, as
--   mesmas proteções).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quadros', 'quadros', false, 26214400, null)
on conflict (id) do nothing;

-- ── Tabelas ──────────────────────────────────────────────────────────────────

create table public.cartao_anexos (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.cartoes on delete cascade,
  caminho text not null unique,
  nome text not null check (char_length(btrim(nome)) between 1 and 200),
  tamanho bigint not null check (tamanho between 1 and 26214400),
  tipo text check (tipo is null or char_length(tipo) <= 255),
  enviado_por uuid default auth.uid() references public.perfis on delete set null,
  enviado_em timestamptz not null default now(),
  -- O caminho fica na pasta do cartão (a do cliente o gatilho confere); o nome é o que o app limpa (src/lib/arquivos.js).
  check (caminho ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || cartao_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$'))
);

alter table public.cartao_anexos enable row level security;

-- A lista do cartão (mais recentes primeiro) e a contagem por cartão na página da coluna.
create index cartao_anexos_cartao_idx on public.cartao_anexos (cartao_id, enviado_em desc, id desc);
create index cartao_anexos_enviado_por_idx on public.cartao_anexos (enviado_por);

-- Quem apagou cada objeto (a linha do anexo ou o cartão inteiro), por 1 dia: deixa essa pessoa tirar o objeto do
-- Storage logo depois, mesmo que não tenha sido ela quem o enviou. Só as funções daqui leem.
create table private.quadro_objetos_apagados (
  caminho text primary key,
  apagado_por uuid not null,
  apagado_em timestamptz not null default now()
);

create index quadro_objetos_apagados_em_idx on private.quadro_objetos_apagados (apagado_em);
alter table private.quadro_objetos_apagados enable row level security;
revoke all on private.quadro_objetos_apagados from public, anon, authenticated;

-- ── Caminhos no balde ────────────────────────────────────────────────────────

-- A forma do caminho: 'anexo', 'imagem' ou nulo (nenhuma das duas).
create function private.caminho_do_quadro(p_caminho text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_caminho ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$') then 'anexo'
    when p_caminho ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/imagens/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|gif|webp)$') then 'imagem'
  end
$$;

-- O cartão do caminho, quando o caminho tem uma das duas formas, o cartão existe e a pasta é a do cliente do quadro
-- dele; senão nulo. (plpgsql: os pedaços do caminho só viram uuid depois de a forma ser conferida.)
create function private.cartao_do_objeto(p_caminho text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cartao uuid;
begin
  if private.caminho_do_quadro(p_caminho) is null then
    return null;
  end if;
  select k.id into v_cartao
  from public.cartoes k
  join public.quadros q on q.id = k.quadro_id
  where k.id = split_part(p_caminho, '/', 2)::uuid
    and q.cliente_id = split_part(p_caminho, '/', 1)::uuid;
  return v_cartao;
end $$;

-- Os objetos do balde na pasta de um cartão (anexos e imagens), pelo índice (bucket_id, name collate "C").
create function private.objetos_do_cartao(p_cliente uuid, p_cartao uuid) returns setof text
language sql stable set search_path = '' as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'quadros'
    and o.name collate "C" >= (p_cliente::text || '/' || p_cartao::text || '/')
    and o.name collate "C" < (p_cliente::text || '/' || p_cartao::text || '0')
$$;

-- ── Quem sobe, vê e tira ─────────────────────────────────────────────────────

create function private.mexo_na_coluna(p_coluna uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.mexo_no_quadro(c.quadro_id) from public.quadro_colunas c where c.id = p_coluna), false)
$$;

-- Sobe objeto (anexo ou imagem) quem mexe no quadro do cartão da pasta.
create function private.posso_subir_no_quadro(p_caminho text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.mexo_no_cartao(private.cartao_do_objeto(p_caminho)), false)
$$;

-- Objeto em uso: o anexo que tem linha, ou a imagem de um cartão que existe. Em uso, só sai pela regra da linha ou do
-- cartão (primeiro a linha, depois o objeto).
create function private.objeto_do_quadro_em_uso(p_caminho text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cartao_anexos a where a.caminho = p_caminho)
    or (private.caminho_do_quadro(p_caminho) = 'imagem' and private.cartao_do_objeto(p_caminho) is not null)
$$;

-- Tira objeto sem uso: a central; quem o subiu, enquanto mexe no cartão (a linha não gravou); quem apagou a linha ou o
-- cartão, por 1 dia.
create function private.posso_tirar_objeto_do_quadro(p_caminho text, p_dono text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and not private.objeto_do_quadro_em_uso(p_caminho)
    and (private.sou_central()
         or (p_dono = (select auth.uid())::text and private.mexo_no_cartao(private.cartao_do_objeto(p_caminho)))
         or exists (
           select 1 from private.quadro_objetos_apagados x
           where x.caminho = p_caminho
             and x.apagado_por = (select auth.uid())
             and x.apagado_em > now() - interval '1 day')),
    false)
$$;

-- Vê o objeto (é o que o link assinado e a lista do Storage pedem): o anexo com linha e a imagem de um cartão que
-- existe, quem vê o quadro do cartão; sem uso, quem pode tirá-lo.
create function private.vejo_objeto_do_quadro(p_caminho text, p_dono text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    exists (
      select 1 from public.cartao_anexos a join public.cartoes k on k.id = a.cartao_id
      where a.caminho = p_caminho and private.vejo_quadro(k.quadro_id))
    or (private.caminho_do_quadro(p_caminho) = 'imagem'
        and private.vejo_quadro((select k.quadro_id from public.cartoes k where k.id = private.cartao_do_objeto(p_caminho))))
    or private.posso_tirar_objeto_do_quadro(p_caminho, p_dono),
    false)
$$;

revoke all on function private.caminho_do_quadro(text), private.cartao_do_objeto(text),
  private.objetos_do_cartao(uuid, uuid), private.mexo_na_coluna(uuid), private.objeto_do_quadro_em_uso(text)
  from public, anon, authenticated;
revoke all on function private.posso_subir_no_quadro(text), private.posso_tirar_objeto_do_quadro(text, text),
  private.vejo_objeto_do_quadro(text, text) from public, anon;
grant execute on function private.posso_subir_no_quadro(text), private.posso_tirar_objeto_do_quadro(text, text),
  private.vejo_objeto_do_quadro(text, text) to authenticated;

-- ── A descrição ──────────────────────────────────────────────────────────────

-- O que há de errado no documento do editor (TipTap), ou nulo: 'descricao_invalida' (não é um doc, nó ou marca que o
-- editor não tem, content/marks que não são lista, texto que não é texto), 'link_invalido' (marca link sem endereço
-- http:, https: ou mailto:) ou 'imagem_invalida' (nó image cujo src não é um caminho da pasta de imagens deste cartão:
-- p_pasta = '<cliente>/<cartao>/'). Os nós ficam só nas listas "content" e as marcas nas listas "marks" (é o que o
-- editor lê); o resto dos atributos o editor ignora.
create function private.erro_na_descricao(p_descricao jsonb, p_pasta text) returns text
language sql immutable set search_path = '' as $$
  with recursive nos(no, raiz) as (
    select p_descricao, true
    union all
    select f.no, false
    from nos
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(nos.no -> 'content') = 'array' then nos.no -> 'content' else '[]'::jsonb end) f(no)
  ), marcas as (
    select m.marca
    from nos
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(nos.no -> 'marks') = 'array' then nos.no -> 'marks' else '[]'::jsonb end) m(marca)
  )
  select case
    when p_descricao is null then null
    when exists (
      select 1 from nos
      where jsonb_typeof(no) is distinct from 'object'
         or jsonb_typeof(no -> 'type') is distinct from 'string'
         or (raiz and no ->> 'type' <> 'doc')
         or (not raiz and no ->> 'type' not in ('paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem',
               'blockquote', 'codeBlock', 'hardBreak', 'horizontalRule', 'image'))
         or (no ? 'content' and jsonb_typeof(no -> 'content') <> 'array')
         or (no ? 'marks' and jsonb_typeof(no -> 'marks') <> 'array')
         or (no ->> 'type' = 'text' and jsonb_typeof(no -> 'text') is distinct from 'string'))
      or exists (
      select 1 from marcas
      where jsonb_typeof(marca) is distinct from 'object'
         or jsonb_typeof(marca -> 'type') is distinct from 'string'
         or marca ->> 'type' not in ('bold', 'italic', 'underline', 'strike', 'code', 'link'))
      then 'descricao_invalida'
    when exists (
      select 1 from marcas
      where marca ->> 'type' = 'link'
        and not coalesce((marca -> 'attrs' ->> 'href') ~* '^(https?|mailto):', false))
      then 'link_invalido'
    when exists (
      select 1 from nos
      where no ->> 'type' = 'image'
        and not coalesce((no -> 'attrs' ->> 'src') ~ ('^' || p_pasta
          || 'imagens/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|gif|webp)$'), false))
      then 'imagem_invalida'
  end
$$;

revoke all on function private.erro_na_descricao(jsonb, text) from public, anon, authenticated;

-- ── Gatilhos da Task 1, sem oráculo ──────────────────────────────────────────
-- Mesmo corpo de 20261117112951_quadro.sql, com a conferência de quem mexe no começo (quem não mexe recebe
-- sem_permissao/42501, exista ou não a coluna, o quadro ou o cartão, sem nada ser lido ou travado) e, no cartão, a
-- descrição conferida. No update, a regra da tabela já tirou as linhas de quem não mexe antes do gatilho (e as funções
-- de mover conferem antes): a conferência fica no insert.

create or replace function private.preparar_coluna() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.mexo_no_quadro(new.quadro_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform 1 from public.quadros q where q.id = new.quadro_id for no key update;
  if (select count(*) from public.quadro_colunas c where c.quadro_id = new.quadro_id) >= 50 then
    raise exception 'colunas_demais' using errcode = 'P0001';
  end if;
  if new.posicao is null then
    select coalesce(max(c.posicao), 0) + 1024 into new.posicao from public.quadro_colunas c where c.quadro_id = new.quadro_id;
  end if;
  return new;
end $$;

create or replace function private.preparar_cartao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_cliente uuid;
  v_erro text;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null and not private.mexo_na_coluna(new.coluna_id) then
      raise exception 'sem_permissao' using errcode = '42501';
    end if;
    select c.quadro_id into v_quadro from public.quadro_colunas c where c.id = new.coluna_id for no key update;
    if v_quadro is null then
      raise exception 'coluna_invalida' using errcode = 'P0001';
    end if;
    new.quadro_id := v_quadro;
    if new.posicao is null then
      select coalesce(max(k.posicao), 0) + 1024 into new.posicao from public.cartoes k where k.coluna_id = new.coluna_id;
    end if;
    new.criado_por := coalesce(new.criado_por, (select auth.uid()));
    new.atualizado_em := new.criado_em;
    new.descricao_texto := private.texto_da_descricao(new.descricao);
  else
    if (new.titulo, new.descricao, new.prioridade, new.prazo, new.coluna_id, new.arquivado_em)
       is distinct from (old.titulo, old.descricao, old.prioridade, old.prazo, old.coluna_id, old.arquivado_em) then
      new.atualizado_em := now();
    end if;
    if old.arquivado_em is null and new.arquivado_em is not null then
      new.arquivado_em := now();
    elsif old.arquivado_em is not null and new.arquivado_em is not null then
      new.arquivado_em := old.arquivado_em;
    end if;
    if new.descricao is distinct from old.descricao then
      new.descricao_texto := private.texto_da_descricao(new.descricao);
    end if;
  end if;

  -- A descrição nova (de quem for: a regra vale também para o sistema): imagem só na pasta deste cartão.
  if new.descricao is not null and (tg_op = 'INSERT' or new.descricao is distinct from old.descricao) then
    select q.cliente_id into v_cliente from public.quadros q where q.id = new.quadro_id;
    v_erro := private.erro_na_descricao(new.descricao, v_cliente::text || '/' || new.id::text || '/');
    if v_erro is not null then
      raise exception '%', v_erro using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create or replace function private.validar_responsavel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.mexo_no_cartao(new.cartao_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.cartoes k
    join public.quadros q on q.id = k.quadro_id
    join public.clientes c on c.id = q.cliente_id and c.consultoria_id = q.consultoria_id
    join public.perfis p on p.id = new.perfil_id
    where k.id = new.cartao_id
      and p.ativo
      and (p.id = c.consultor_id or (p.consultoria_id = q.consultoria_id and p.papel in ('admin', 'gestor')))
  ) then
    raise exception 'responsavel_invalido' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.preparar_item_do_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.mexo_no_cartao(new.cartao_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform 1 from public.cartoes k where k.id = new.cartao_id for no key update;
  if (select count(*) from public.cartao_checklist l where l.cartao_id = new.cartao_id) >= 200 then
    raise exception 'checklist_cheio' using errcode = 'P0001';
  end if;
  if new.posicao is null then
    select coalesce(max(l.posicao), 0) + 1024 into new.posicao from public.cartao_checklist l where l.cartao_id = new.cartao_id;
  end if;
  return new;
end $$;

-- ── Gatilhos dos anexos ──────────────────────────────────────────────────────

-- Antes de gravar o anexo: quem não mexe no cartão para aqui (42501); a pasta é a do cliente do quadro; a linha só
-- aponta para um objeto que a própria pessoa subiu; o autor é quem está logado e a data é a do banco.
create function private.preparar_anexo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente uuid;
begin
  if (select auth.uid()) is not null and not private.mexo_no_cartao(new.cartao_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select q.cliente_id into v_cliente
  from public.cartoes k join public.quadros q on q.id = k.quadro_id
  where k.id = new.cartao_id;
  if split_part(new.caminho, '/', 1) is distinct from v_cliente::text then
    raise exception 'caminho_invalido' using errcode = '23514';
  end if;
  if (select auth.uid()) is not null and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'quadros'
      and o.name collate "C" = new.caminho
      and o.owner_id is distinct from (select auth.uid())::text
  ) then
    raise exception 'objeto_de_outra_pessoa' using errcode = 'P0001';
  end if;
  new.enviado_por := coalesce((select auth.uid()), new.enviado_por);
  new.enviado_em := now();
  return new;
end $$;

create trigger cartao_anexos_preparar
  before insert on public.cartao_anexos
  for each row execute function private.preparar_anexo();

-- Depois de apagar anexos: guarda quem apagou cada caminho (e descarta o que passou de 1 dia).
create function private.lembrar_anexos_apagados() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.quadro_objetos_apagados where apagado_em < now() - interval '1 day';
  if (select auth.uid()) is not null then
    insert into private.quadro_objetos_apagados (caminho, apagado_por)
    select a.caminho, (select auth.uid()) from apagados a
    on conflict (caminho) do update set apagado_por = excluded.apagado_por, apagado_em = excluded.apagado_em;
  end if;
  return null;
end $$;

create trigger cartao_anexos_lembrar_quem_apagou
  after delete on public.cartao_anexos
  referencing old table as apagados
  for each statement execute function private.lembrar_anexos_apagados();

-- Depois de apagar cartões: guarda quem apagou cada objeto da pasta deles (anexos e imagens).
create function private.lembrar_objetos_dos_cartoes_apagados() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.quadro_objetos_apagados where apagado_em < now() - interval '1 day';
  if (select auth.uid()) is not null then
    insert into private.quadro_objetos_apagados (caminho, apagado_por)
    select o.caminho, (select auth.uid())
    from apagados k
    join public.quadros q on q.id = k.quadro_id
    cross join lateral private.objetos_do_cartao(q.cliente_id, k.id) o(caminho)
    on conflict (caminho) do update set apagado_por = excluded.apagado_por, apagado_em = excluded.apagado_em;
  end if;
  return null;
end $$;

create trigger cartoes_lembrar_objetos_apagados
  after delete on public.cartoes
  referencing old table as apagados
  for each statement execute function private.lembrar_objetos_dos_cartoes_apagados();

revoke all on function private.preparar_anexo(), private.lembrar_anexos_apagados(),
  private.lembrar_objetos_dos_cartoes_apagados() from public;

-- ── Regras ───────────────────────────────────────────────────────────────────

-- Vê quem vê o cartão (a regra dos cartões); anexa quem mexe; apaga quem enviou ou a gestão, enquanto mexe.
create policy "ver anexos" on public.cartao_anexos
  for select to authenticated
  using (exists (select 1 from public.cartoes k where k.id = cartao_anexos.cartao_id));

create policy "anexar" on public.cartao_anexos
  for insert to authenticated
  with check (private.mexo_no_cartao(cartao_id));

create policy "apagar anexo" on public.cartao_anexos
  for delete to authenticated
  using (private.mexo_no_cartao(cartao_id)
    and (enviado_por = (select auth.uid()) or private.gerencio_cartao(cartao_id)));

-- Storage: sobe quem mexe no cartão da pasta; vê pela linha ou pelo cartão (sem uso, quem pode tirar); tira só o que não
-- está em uso. Sem política de update: objeto não é trocado nem movido.
create policy "quadros: enviar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'quadros'
    and owner_id = (select auth.uid())::text
    and (select private.posso_subir_no_quadro(name))
  );

create policy "quadros: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'quadros' and (select private.vejo_objeto_do_quadro(name, owner_id)));

create policy "quadros: tirar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'quadros' and (select private.posso_tirar_objeto_do_quadro(name, owner_id)));

-- ── Leituras do quadro com os anexos ─────────────────────────────────────────

-- Mesmo corpo de 20261117112951_quadro.sql, com 'anexos' (quantos o cartão tem) em cada item. Mesma assinatura: fica
-- uma versão só, com os mesmos grants.
create or replace function public.cartoes_do_quadro(
  p_quadro uuid, p_coluna uuid, p_pagina int default 1, p_busca text default null,
  p_prioridade text default null, p_responsavel text default null, p_prazo text default null
) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_responsavel uuid := private.conferir_filtros_do_quadro(p_prioridade, p_responsavel, p_prazo);
  v_sem boolean := coalesce(p_responsavel = 'sem', false);
  v_padrao text := private.padrao_de_busca(p_busca);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_concluidos boolean;
  v_total int;
  v_itens jsonb;
begin
  if not private.vejo_quadro(p_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select c.concluidos into v_concluidos from public.quadro_colunas c where c.id = p_coluna and c.quadro_id = p_quadro;
  if v_concluidos is null then
    raise exception 'coluna_invalida' using errcode = 'P0001';
  end if;

  with filtrados as materialized (
    select k.id, k.posicao
    from public.cartoes k
    where k.coluna_id = p_coluna
      and k.arquivado_em is null
      and (v_padrao is null or k.busca like v_padrao escape '\')
      and (p_prioridade is null or k.prioridade = p_prioridade)
      and (v_responsavel is null or exists (
        select 1 from public.cartao_responsaveis r where r.cartao_id = k.id and r.perfil_id = v_responsavel))
      and (not v_sem or not exists (select 1 from public.cartao_responsaveis r where r.cartao_id = k.id))
      and (p_prazo is null
        or (p_prazo = 'atrasados' and not v_concluidos and k.prazo < v_hoje)
        or (p_prazo = 'proximos_7_dias' and not v_concluidos and k.prazo between v_hoje and v_hoje + 7)
        or (p_prazo = 'sem_prazo' and k.prazo is null))
  ), pagina as (
    select f.id from filtrados f order by f.posicao, f.id limit 50 offset (v_pagina - 1) * 50
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'coluna_id', k.coluna_id, 'titulo', k.titulo, 'resumo', left(k.descricao_texto, 200),
        'prioridade', k.prioridade, 'prazo', k.prazo, 'posicao', k.posicao, 'criado_por', k.criado_por,
        'criado_em', k.criado_em, 'atualizado_em', k.atualizado_em,
        'autor', (select jsonb_build_object('id', a.id, 'nome', a.nome) from public.perfis a where a.id = k.criado_por),
        'responsaveis', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'cor', p.cor) order by p.nome, p.id)
          from public.cartao_responsaveis r join public.perfis p on p.id = r.perfil_id
          where r.cartao_id = k.id), '[]'::jsonb),
        'checklist', (select jsonb_build_object('total', count(*), 'feitos', count(*) filter (where l.feito))
          from public.cartao_checklist l where l.cartao_id = k.id),
        'comentarios', (select count(*) from public.cartao_comentarios m where m.cartao_id = k.id),
        'anexos', (select count(*) from public.cartao_anexos x where x.cartao_id = k.id)
      ) order by k.posicao, k.id)
      from pagina pg join public.cartoes k on k.id = pg.id
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Mesmo corpo de 20261117112951_quadro.sql, com 'anexos' (quantos o cartão tem; a lista vem de anexos_do_cartao).
create or replace function public.cartao_do_quadro(p_cartao uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_json jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select k.quadro_id into v_quadro from public.cartoes k where k.id = p_cartao;
  if v_quadro is null or not private.vejo_quadro(v_quadro) then
    return null;
  end if;

  select jsonb_build_object(
    'id', k.id, 'quadro_id', k.quadro_id, 'coluna_id', k.coluna_id, 'titulo', k.titulo, 'descricao', k.descricao,
    'prioridade', k.prioridade, 'prazo', k.prazo, 'posicao', k.posicao, 'arquivado_em', k.arquivado_em,
    'criado_em', k.criado_em, 'atualizado_em', k.atualizado_em,
    'coluna', jsonb_build_object('id', c.id, 'nome', c.nome, 'concluidos', c.concluidos),
    'criado_por', (select jsonb_build_object('id', a.id, 'nome', a.nome, 'foto', a.foto, 'cor', a.cor)
                   from public.perfis a where a.id = k.criado_por),
    'responsaveis', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'cor', p.cor) order by p.nome, p.id)
      from public.cartao_responsaveis r join public.perfis p on p.id = r.perfil_id
      where r.cartao_id = k.id), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'texto', l.texto, 'feito', l.feito, 'posicao', l.posicao)
        order by l.posicao, l.id)
      from public.cartao_checklist l where l.cartao_id = k.id), '[]'::jsonb),
    'comentarios', (select count(*) from public.cartao_comentarios m where m.cartao_id = k.id),
    'anexos', (select count(*) from public.cartao_anexos x where x.cartao_id = k.id),
    'pode_mexer', private.mexo_no_quadro(k.quadro_id),
    'pode_apagar', coalesce(private.mexo_no_quadro(k.quadro_id)
      and (k.criado_por = (select auth.uid()) or private.gerencio_quadro(k.quadro_id)), false))
  into v_json
  from public.cartoes k
  join public.quadro_colunas c on c.id = k.coluna_id
  where k.id = p_cartao;

  return v_json;
end $$;

-- Os anexos do cartão, dos mais recentes aos mais antigos, 15 por página: { itens: [{ id, nome, tamanho, tipo,
-- caminho, enviado_em, enviado_por: { id, nome, foto, cor }, pode_apagar }], total }. O nome de quem enviou vem daqui (o
-- consultor não lê o perfil do gestor). pode_apagar: quem enviou ou a gestão, enquanto mexe no quadro. Nulo quando a
-- pessoa não vê o cartão (ou ele não existe).
create function public.anexos_do_cartao(p_cartao uuid, p_pagina int default 1) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_quadro uuid;
  v_mexo boolean;
  v_gero boolean;
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
  v_itens jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select k.quadro_id into v_quadro from public.cartoes k where k.id = p_cartao;
  if v_quadro is null or not private.vejo_quadro(v_quadro) then
    return null;
  end if;
  v_mexo := private.mexo_no_quadro(v_quadro);
  v_gero := v_mexo and private.gerencio_quadro(v_quadro);

  select count(*) into v_total from public.cartao_anexos a where a.cartao_id = p_cartao;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'nome', a.nome, 'tamanho', a.tamanho, 'tipo', a.tipo, 'caminho', a.caminho, 'enviado_em', a.enviado_em,
      'enviado_por', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'cor', p.cor)
                      from public.perfis p where p.id = a.enviado_por),
      'pode_apagar', coalesce(v_mexo and (v_gero or a.enviado_por = (select auth.uid())), false)
    ) order by a.enviado_em desc, a.id desc), '[]'::jsonb)
  into v_itens
  from (
    select x.* from public.cartao_anexos x
    where x.cartao_id = p_cartao
    order by x.enviado_em desc, x.id desc
    limit 15 offset (v_pagina - 1) * 15
  ) a;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- ── Apagar: o banco devolve o que tirar do Storage ───────────────────────────

-- Apaga o cartão (quem o criou ou a gestão, com o cliente ativo; a mesma regra de "apagar cartão"): checklist,
-- comentários, responsáveis e anexos saem junto. Devolve { caminhos } = os objetos da pasta do cartão no balde (anexos
-- e imagens da descrição), que o app tira logo depois (quem apagou pode tirá-los por 1 dia). Quem não pode, ou cartão
-- que não existe: sem_permissao.
create function public.apagar_cartao(p_cartao uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_criado_por uuid;
  v_cliente uuid;
begin
  select k.quadro_id, k.criado_por, q.cliente_id into v_quadro, v_criado_por, v_cliente
  from public.cartoes k join public.quadros q on q.id = k.quadro_id
  where k.id = p_cartao;
  if v_quadro is null or not private.mexo_no_quadro(v_quadro)
     or not (coalesce(v_criado_por = (select auth.uid()), false) or private.gerencio_quadro(v_quadro)) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  delete from public.cartoes where id = p_cartao;
  if not found then
    -- apagado por outra pessoa ao mesmo tempo: os objetos ficam com quem apagou
    return jsonb_build_object('caminhos', '[]'::jsonb);
  end if;
  return jsonb_build_object('caminhos', coalesce((
    select jsonb_agg(o.caminho order by o.caminho) from private.objetos_do_cartao(v_cliente, p_cartao) o(caminho)
  ), '[]'::jsonb));
end $$;

-- Mesmo corpo de 20261117112951_quadro.sql; com os cartões junto, devolve também { caminhos } (os objetos das pastas
-- deles no balde, que o app tira logo depois).
create or replace function public.apagar_coluna(p_coluna uuid, p_destino uuid default null, p_apagar_cartoes boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_cliente uuid;
  v_cartoes int;
  v_fim numeric;
  v_movidos int := 0;
  v_ids uuid[] := '{}';
  v_caminhos jsonb := '[]'::jsonb;
begin
  select c.quadro_id into v_quadro from public.quadro_colunas c where c.id = p_coluna;
  if v_quadro is null or not private.gerencio_quadro(v_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform 1 from public.quadros q where q.id = v_quadro for no key update;
  perform 1 from public.quadro_colunas c where c.id = p_coluna for update;
  if not found then
    raise exception 'coluna_invalida' using errcode = 'P0001';
  end if;
  if (select count(*) from public.quadro_colunas c where c.quadro_id = v_quadro) <= 1 then
    raise exception 'ultima_coluna' using errcode = 'P0001';
  end if;

  select count(*) into v_cartoes from public.cartoes k where k.coluna_id = p_coluna;
  if v_cartoes > 0 then
    if p_destino is not null then
      perform 1 from public.quadro_colunas c
      where c.id = p_destino and c.quadro_id = v_quadro and c.id <> p_coluna
      for no key update;
      if not found then
        raise exception 'coluna_invalida' using errcode = 'P0001';
      end if;
      select coalesce(max(k.posicao), 0) into v_fim from public.cartoes k where k.coluna_id = p_destino;
      update public.cartoes k set coluna_id = p_destino, posicao = v_fim + o.n * 1024
      from (
        select x.id, row_number() over (order by x.posicao, x.id) as n
        from public.cartoes x where x.coluna_id = p_coluna
      ) o
      where k.id = o.id and k.coluna_id = p_coluna;
      get diagnostics v_movidos = row_count;
    elsif coalesce(p_apagar_cartoes, false) then
      with apagados as (delete from public.cartoes k where k.coluna_id = p_coluna returning k.id)
      select coalesce(array_agg(a.id), '{}') into v_ids from apagados a;
      select q.cliente_id into v_cliente from public.quadros q where q.id = v_quadro;
      select coalesce(jsonb_agg(o.caminho order by o.caminho), '[]'::jsonb) into v_caminhos
      from unnest(v_ids) i(id)
      cross join lateral private.objetos_do_cartao(v_cliente, i.id) o(caminho);
    else
      raise exception 'coluna_com_cartoes' using errcode = 'P0001';
    end if;
  end if;

  delete from public.quadro_colunas where id = p_coluna;
  return jsonb_build_object('movidos', v_movidos, 'apagados', cardinality(v_ids), 'ids_apagados', to_jsonb(v_ids),
    'caminhos', v_caminhos);
end $$;

-- O que quem pergunta pode tirar agora do balde na pasta do cliente (até 1000 por vez, chame de novo até vir vazio):
-- os objetos sem uso que a pessoa subiu, ou que apagou há menos de 1 dia; para a central, todos os sem uso. É o que o
-- app tira logo depois de apagar o cliente (o quadro vazio sai junto e o que sobrou de cartões apagados antes, quando
-- tirar falhou, fica sem dono) ou para tentar de novo.
create function public.objetos_para_tirar_do_quadro(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(l.name order by l.name)
    from (
      select o.name
      from storage.objects o
      where o.bucket_id = 'quadros'
        and o.name collate "C" >= (p_cliente::text || '/')
        and o.name collate "C" < (p_cliente::text || '0')
        and private.posso_tirar_objeto_do_quadro(o.name, o.owner_id)
      order by o.name collate "C"
      limit 1000
    ) l
  ), '[]'::jsonb);
end $$;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.cartao_anexos from public, anon, authenticated;
grant select, delete on public.cartao_anexos to authenticated;
grant insert (cartao_id, caminho, nome, tamanho, tipo) on public.cartao_anexos to authenticated;
grant all on public.cartao_anexos to service_role;

revoke all on function public.anexos_do_cartao(uuid, int), public.apagar_cartao(uuid),
  public.objetos_para_tirar_do_quadro(uuid) from public, anon;
grant execute on function public.anexos_do_cartao(uuid, int), public.apagar_cartao(uuid),
  public.objetos_para_tirar_do_quadro(uuid) to authenticated;

-- As redefinidas mantêm os grants (create or replace); repetidos aqui para ficar explícito.
revoke all on function public.cartoes_do_quadro(uuid, uuid, int, text, text, text, text), public.cartao_do_quadro(uuid),
  public.apagar_coluna(uuid, uuid, boolean) from public, anon;
grant execute on function public.cartoes_do_quadro(uuid, uuid, int, text, text, text, text), public.cartao_do_quadro(uuid),
  public.apagar_coluna(uuid, uuid, boolean) to authenticated;
