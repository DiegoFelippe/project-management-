-- Clientes (desenho em docs/superpowers/specs/2026-11-13-clientes-design.md).
-- O cliente é da plataforma: a central cadastra e manda para uma consultoria; o administrador ou um
-- gestor da consultoria escolhe o consultor (qualquer usuário ativo dela). Cada passo fica em
-- cliente_eventos, gravado pelos gatilhos; pela API o histórico só se lê.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ── Funções de apoio ─────────────────────────────────────────────────────────

-- CNPJ numérico ou alfanumérico (Receita): 12 letras/dígitos + 2 dígitos verificadores.
-- Valor de cada caractere = código ASCII − 48; resto < 2 → 0, senão 11 − resto.
create function private.cnpj_valido(p_cnpj text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_pesos1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_pesos2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_soma int := 0;
  v_resto int;
begin
  if p_cnpj is null or p_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' then
    return false;
  end if;

  for i in 1..12 loop
    v_soma := v_soma + (ascii(substr(p_cnpj, i, 1)) - 48) * v_pesos1[i];
  end loop;
  v_resto := v_soma % 11;
  if (case when v_resto < 2 then 0 else 11 - v_resto end) <> ascii(substr(p_cnpj, 13, 1)) - 48 then
    return false;
  end if;

  v_soma := 0;
  for i in 1..13 loop
    v_soma := v_soma + (ascii(substr(p_cnpj, i, 1)) - 48) * v_pesos2[i];
  end loop;
  v_resto := v_soma % 11;
  return (case when v_resto < 2 then 0 else 11 - v_resto end) = ascii(substr(p_cnpj, 14, 1)) - 48;
end $$;

-- Texto para a busca: sem acento e em minúsculas.
create function private.sem_acento(p_texto text) returns text
language sql immutable set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent', p_texto))
$$;

-- Cuida dos clientes da consultoria: administrador ou gestor dela (o gestor alcança a consultoria inteira).
create function private.gerencio_consultoria(p_consultoria uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
      and private.consultoria_atual() = p_consultoria
      and private.papel_atual() in ('admin', 'gestor'),
    false)
$$;

-- Vê o cliente: a central (e o dono), quem cuida da consultoria dele, ou o consultor dele.
create function private.vejo_cliente(p_consultoria uuid, p_consultor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.sou_central()
      or private.gerencio_consultoria(p_consultoria)
      or (private.liberado()
          and p_consultor = (select auth.uid())
          and p_consultoria = private.consultoria_atual()),
    false)
$$;

revoke all on function private.cnpj_valido(text), private.sem_acento(text),
  private.gerencio_consultoria(uuid), private.vejo_cliente(uuid, uuid) from public;
grant execute on function private.gerencio_consultoria(uuid), private.vejo_cliente(uuid, uuid) to authenticated;
-- A checagem do CNPJ e a coluna de busca rodam com o papel de quem grava.
grant execute on function private.cnpj_valido(text), private.sem_acento(text) to authenticated, service_role;

-- ── Tabelas ──────────────────────────────────────────────────────────────────

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  razao_social text check (razao_social is null or char_length(btrim(razao_social)) between 2 and 200),
  cnpj text check (cnpj is null or private.cnpj_valido(cnpj)),
  cidade text check (cidade is null or char_length(cidade) <= 120),
  uf text check (uf is null or uf in ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
    'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')),
  contato_nome text check (contato_nome is null or char_length(contato_nome) <= 120),
  contato_telefone text check (contato_telefone is null or char_length(contato_telefone) <= 30),
  contato_email text check (contato_email is null
    or (char_length(contato_email) <= 254 and contato_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  observacoes text check (observacoes is null or char_length(observacoes) <= 2000),
  horas_mes numeric(5, 1) not null check (horas_mes > 0 and horas_mes <= 744),
  consultoria_id uuid references public.consultorias on delete restrict,
  consultor_id uuid references public.perfis on delete set null,
  enviado_em timestamptz,
  consultor_desde timestamptz,
  arquivado_em timestamptz,
  arquivado boolean generated always as (arquivado_em is not null) stored,
  busca text generated always as (private.sem_acento(nome || ' ' || coalesce(razao_social, '') || ' ' ||
    coalesce(cidade, '') || ' ' || coalesce(cnpj, ''))) stored,
  criado_por uuid default auth.uid() references public.perfis on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (consultor_id is null or consultoria_id is not null)
);

create table public.cliente_eventos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete cascade,
  tipo text not null check (tipo in ('cadastrado', 'editado', 'enviado', 'movido', 'devolvido',
    'consultor_escolhido', 'consultor_trocado', 'consultor_removido', 'previsao_ajustada', 'arquivado', 'reativado')),
  de_consultoria uuid,
  para_consultoria uuid,
  de_consultor uuid,
  para_consultor uuid,
  de_horas numeric,
  para_horas numeric,
  autor uuid default auth.uid() references public.perfis on delete set null,
  em timestamptz not null default now()
);

alter table public.clientes enable row level security;
alter table public.cliente_eventos enable row level security;

-- ── Índices ──────────────────────────────────────────────────────────────────

create unique index clientes_cnpj_unico on public.clientes (cnpj) where cnpj is not null;
create index clientes_central_idx on public.clientes (arquivado, (consultoria_id is null), nome, id);
create index clientes_consultoria_idx on public.clientes (consultoria_id, arquivado, nome, id);
create index clientes_consultor_idx on public.clientes (consultor_id, arquivado, nome, id);
create index clientes_busca_idx on public.clientes using gin (busca extensions.gin_trgm_ops);
create index clientes_criado_por_idx on public.clientes (criado_por);
create index cliente_eventos_cliente_idx on public.cliente_eventos (cliente_id, em desc);
create index cliente_eventos_autor_idx on public.cliente_eventos (autor);

-- ── Gatilhos ─────────────────────────────────────────────────────────────────

-- Regras do cliente antes de gravar:
-- - CNPJ colado com pontuação, espaços ou minúsculas fica só com letras maiúsculas e dígitos;
-- - quem não é da central (com usuário logado) só muda o consultor e a previsão de horas;
-- - consultoria arquivada não recebe cliente;
-- - mudou a consultoria: o consultor sai e o cliente volta a aguardar consultor;
-- - consultor é usuário ativo da consultoria do cliente (administrador, gestor ou pessoa).
create function private.validar_cliente() returns trigger
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

create trigger clientes_validar
  before insert or update on public.clientes
  for each row execute function private.validar_cliente();

-- Histórico: um evento por mudança. Ao mudar de consultoria, o evento (enviado, movido ou devolvido)
-- já leva o consultor que saiu; não há um "consultor_removido" separado.
create function private.registrar_historico_do_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_autor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.cliente_eventos (cliente_id, tipo, para_horas, autor)
    values (new.id, 'cadastrado', new.horas_mes, v_autor);
    if new.consultoria_id is not null then
      insert into public.cliente_eventos (cliente_id, tipo, para_consultoria, autor)
      values (new.id, 'enviado', new.consultoria_id, v_autor);
    end if;
    if new.consultor_id is not null then
      insert into public.cliente_eventos (cliente_id, tipo, para_consultor, autor)
      values (new.id, 'consultor_escolhido', new.consultor_id, v_autor);
    end if;
    if new.arquivado_em is not null then
      insert into public.cliente_eventos (cliente_id, tipo, autor) values (new.id, 'arquivado', v_autor);
    end if;
    return null;
  end if;

  if (new.nome, new.razao_social, new.cnpj, new.cidade, new.uf, new.contato_nome, new.contato_telefone,
      new.contato_email, new.observacoes)
     is distinct from
     (old.nome, old.razao_social, old.cnpj, old.cidade, old.uf, old.contato_nome, old.contato_telefone,
      old.contato_email, old.observacoes) then
    insert into public.cliente_eventos (cliente_id, tipo, autor) values (new.id, 'editado', v_autor);
  end if;

  if new.consultoria_id is distinct from old.consultoria_id then
    insert into public.cliente_eventos (cliente_id, tipo, de_consultoria, para_consultoria, de_consultor, para_consultor, autor)
    values (new.id,
      case when old.consultoria_id is null then 'enviado'
           when new.consultoria_id is null then 'devolvido'
           else 'movido' end,
      old.consultoria_id, new.consultoria_id, old.consultor_id, new.consultor_id, v_autor);
  elsif new.consultor_id is distinct from old.consultor_id then
    insert into public.cliente_eventos (cliente_id, tipo, de_consultor, para_consultor, autor)
    values (new.id,
      case when old.consultor_id is null then 'consultor_escolhido'
           when new.consultor_id is null then 'consultor_removido'
           else 'consultor_trocado' end,
      old.consultor_id, new.consultor_id, v_autor);
  end if;

  if new.horas_mes is distinct from old.horas_mes then
    insert into public.cliente_eventos (cliente_id, tipo, de_horas, para_horas, autor)
    values (new.id, 'previsao_ajustada', old.horas_mes, new.horas_mes, v_autor);
  end if;

  if (old.arquivado_em is null) <> (new.arquivado_em is null) then
    insert into public.cliente_eventos (cliente_id, tipo, autor)
    values (new.id, case when new.arquivado_em is not null then 'arquivado' else 'reativado' end, v_autor);
  end if;

  return null;
end $$;

create trigger clientes_historico
  after insert or update on public.clientes
  for each row execute function private.registrar_historico_do_cliente();

revoke all on function private.validar_cliente(), private.registrar_historico_do_cliente() from public;

-- ── Políticas ────────────────────────────────────────────────────────────────

-- Ver: a mesma regra de private.vejo_cliente(consultoria_id, consultor_id), escrita para cada função
-- rodar uma vez por consulta e não uma vez por linha (com 50.000 clientes, a contagem do gestor cai de
-- ~500 ms para ~3 ms). O teste clientes.test.sql confere que as duas dão o mesmo resultado em todos os papéis.
create policy "ver clientes conforme o papel" on public.clientes
  for select to authenticated
  using (
    (select private.sou_central())
    or (
      consultoria_id = (select private.consultoria_atual())
      and (
        (select private.gerencio_consultoria(private.consultoria_atual()))
        or (consultor_id = (select auth.uid()) and (select private.liberado()))
      )
    )
  );

create policy "a central cadastra clientes" on public.clientes
  for insert to authenticated
  with check ((select private.sou_central()));

create policy "a central ou quem cuida da consultoria edita" on public.clientes
  for update to authenticated
  using ((select private.sou_central()) or (select private.gerencio_consultoria(consultoria_id)))
  with check ((select private.sou_central()) or (select private.gerencio_consultoria(consultoria_id)));

create policy "a central apaga clientes" on public.clientes
  for delete to authenticated
  using ((select private.sou_central()));

-- Histórico: a central vê tudo; a consultoria vê só o que aconteceu depois de o cliente chegar a ela.
create policy "ver o histórico dos clientes visíveis" on public.cliente_eventos
  for select to authenticated
  using (
    (select private.sou_central())
    or exists (
      select 1 from public.clientes c
      where c.id = cliente_id
        and em >= c.enviado_em
        and (select private.vejo_cliente(c.consultoria_id, c.consultor_id))
    )
  );

-- ── Consultor do cliente (relação calculada da API) ──────────────────────────

-- select=...,consultor(id,nome): o gestor só enxerga em perfis quem ele criou e as pessoas dos times dele,
-- mas vê o consultor de qualquer cliente da consultoria. A função ignora os dados da linha recebida
-- (que podem ser forjados) e usa o cliente guardado no banco com aquele id.
create function public.consultor(public.clientes) returns setof public.perfis
language sql stable security definer rows 1 set search_path = '' as $$
  select p.*
  from public.clientes c
  join public.perfis p on p.id = c.consultor_id
  where c.id = ($1).id
    and private.vejo_cliente(c.consultoria_id, c.consultor_id)
$$;

revoke all on function public.consultor(public.clientes) from public, anon;
grant execute on function public.consultor(public.clientes) to authenticated;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.clientes, public.cliente_eventos from anon, authenticated;
grant select, insert, delete on public.clientes to authenticated;
grant update (nome, razao_social, cnpj, cidade, uf, contato_nome, contato_telefone, contato_email,
  observacoes, horas_mes, consultoria_id, consultor_id, arquivado_em) on public.clientes to authenticated;
grant select on public.cliente_eventos to authenticated;
grant all on public.clientes, public.cliente_eventos to service_role;
