-- Quadros do menu (desenho em docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md; plano em
-- docs/superpowers/plans/2026-11-17-quadros-pessoais-e-de-time.md, Task 2). O que se faz com os quadros pessoais e de
-- time da 20261118013057_quadros_pessoais_e_de_time.sql: criar, listar (seletor, recentes, arquivados), marcar como
-- favorito e apagar. Nenhuma linha que já existe é alterada ou apagada; o quadro do cliente não muda.
--
-- - quadro_favoritos (pessoa, quadro): cada um lê e desmarca os seus; marca só quadro pessoal ou de time que vê. Não há
--   o que editar (o CRUD dele é marcar, ver e desmarcar; aprovado pelo Diego em 17/11). Perder o acesso não apaga o
--   favorito: ele só deixa de aparecer, e volta se a pessoa voltar a ver o quadro.
-- - criar_quadro(nome, time): sem time, quadro pessoal (todos os papéis, na consultoria de quem cria); com time, quem
--   está no time (membro ou gestor) ou o administrador da consultoria do time. Nasce com "A fazer", "Em andamento" e
--   "Concluído". Time de outra consultoria, que não existe ou em que a pessoa não está: time_invalido (a mesma
--   resposta, sem dizer se o time existe); central e dono não têm quadro de time (sem_permissao).
-- - apagar_quadro(quadro): só quem administra (administro_quadro, vale arquivado). Apaga os cartões (os gatilhos
--   lembram quem apagou cada objeto e avisam o canal) e depois o quadro (colunas e favoritos saem junto); devolve todos
--   os objetos da pasta quadro/<id>/ no balde, que ficam com quem apagou para ele tirar (também as sobras de antes).
-- - quadros_para_escolher (o seletor: Favoritos, Meus, Dos times), quadros_por_ids (os Recentes guardados no
--   navegador), quadros_arquivados (15 por página) e times_para_novo_quadro: só o que a pessoa vê, busca sem acento no
--   banco, limite e total, cartões contados só dos itens devolvidos.
-- - quadro_por_id: nos quadros pessoais e de time, também "favorito" (no do cliente, o mesmo de antes: igual ao
--   quadro_do_cliente).
-- - Quadro arquivado é só para ler para todo mundo: o nome não muda (restaurar antes). Restaurar e apagar continuam com
--   quem administra.
-- - Tempo real: mudar a consultoria ou o papel de alguém avisa ({ tabela: 'perfis', operacao: 'update', acesso: true })
--   no canal dos quadros pessoais dela, dos quadros dos times que ela gere e, se ela é (ou era) administradora, de todos
--   os quadros de time da consultoria (a de antes e a de agora). A tela relê e entra de novo no canal.
-- - private.objetos_do_cartao(uuid, uuid) sai: nenhuma função a usa desde a 20261118013057 (objetos_no_balde).

-- ── Favoritos ────────────────────────────────────────────────────────────────

create table public.quadro_favoritos (
  perfil_id uuid not null default auth.uid() references public.perfis on delete cascade,
  quadro_id uuid not null references public.quadros on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, quadro_id)
);
-- O favorito sai junto com o quadro (a chave estrangeira procura por quadro_id).
create index quadro_favoritos_quadro_idx on public.quadro_favoritos (quadro_id);

alter table public.quadro_favoritos enable row level security;

-- Pode marcar como favorito: quadro pessoal ou de time que a pessoa vê (o do cliente fica na aba do cliente).
create function private.posso_favoritar(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.vejo_quadro(p_quadro)
    and exists (select 1 from public.quadros q where q.id = p_quadro and q.tipo <> 'cliente'),
    false)
$$;

create policy "ver os meus favoritos" on public.quadro_favoritos
  for select to authenticated
  using (perfil_id = (select auth.uid()));

create policy "marcar favorito" on public.quadro_favoritos
  for insert to authenticated
  with check (perfil_id = (select auth.uid()) and private.posso_favoritar(quadro_id));

create policy "desmarcar favorito" on public.quadro_favoritos
  for delete to authenticated
  using (perfil_id = (select auth.uid()));

revoke all on public.quadro_favoritos from public, anon, authenticated;
grant select, insert (quadro_id), delete on public.quadro_favoritos to authenticated;
grant all on public.quadro_favoritos to service_role;

-- ── Ajudantes ────────────────────────────────────────────────────────────────

-- Os times da consultoria de agora em que quem está logado é membro ou gestor (os ids). Central e dono: nenhum.
create function private.meus_times() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(x.id), '{}')
  from (
    select m.time_id as id
    from public.time_membros m
    join public.times t on t.id = m.time_id
    where m.pessoa_id = (select auth.uid())
      and t.consultoria_id = (select private.consultoria_atual())
    union
    select t.id
    from public.times t
    where t.gestor_id = (select auth.uid())
      and t.consultoria_id = (select private.consultoria_atual())
  ) x
$$;

-- Um quadro como as listas mostram: { id, nome, tipo, time: { id, nome } | null, cartoes (os não arquivados, pelo
-- índice parcial dos ativos), favorito (de quem está logado) }. Quem chama já conferiu que a pessoa vê o quadro.
create function private.quadro_da_lista(p_quadro uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', q.id,
    'nome', q.nome,
    'tipo', q.tipo,
    'time', (select jsonb_build_object('id', t.id, 'nome', t.nome) from public.times t where t.id = q.time_id),
    'cartoes', (select count(*) from public.cartoes k where k.quadro_id = q.id and k.arquivado_em is null),
    'favorito', exists (
      select 1 from public.quadro_favoritos f where f.perfil_id = (select auth.uid()) and f.quadro_id = q.id))
  from public.quadros q
  where q.id = p_quadro
$$;

-- Os itens de uma lista de ids, na ordem dada.
create function private.quadros_da_lista(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.quadro_da_lista(i.id) order by i.n), '[]'::jsonb)
  from unnest(p_ids) with ordinality i(id, n)
$$;

-- ── Criar ────────────────────────────────────────────────────────────────────

-- Quadro novo: sem time, pessoal (de quem cria, na consultoria dela; nula na central e no dono); com time, do time
-- (quem está nele ou o administrador da consultoria dele). Nasce com as três colunas de sempre. { id }.
-- Nome em branco ou com mais de 80 letras: 23514; nome em uso entre os abertos do mesmo dono: 23505.
create function public.criar_quadro(p_nome text, p_time uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_papel text := private.papel_atual();
  v_consultoria uuid := private.consultoria_atual();
  v_quadro uuid;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_time is null then
    insert into public.quadros (tipo, pessoa_id, consultoria_id, nome)
    values ('pessoa', (select auth.uid()), v_consultoria, p_nome)
    returning id into v_quadro;
  else
    if v_papel in ('central', 'dono') then
      raise exception 'sem_permissao' using errcode = 'P0001';
    end if;
    if not (private.estou_no_time(p_time)
            or (v_papel = 'admin'
                and exists (select 1 from public.times t where t.id = p_time and t.consultoria_id = v_consultoria))) then
      raise exception 'time_invalido' using errcode = 'P0001';
    end if;
    insert into public.quadros (tipo, time_id, nome)
    values ('time', p_time, p_nome)
    returning id into v_quadro;
  end if;
  insert into public.quadro_colunas (quadro_id, nome, concluidos) values (v_quadro, 'A fazer', false);
  insert into public.quadro_colunas (quadro_id, nome, concluidos) values (v_quadro, 'Em andamento', false);
  insert into public.quadro_colunas (quadro_id, nome, concluidos) values (v_quadro, 'Concluído', true);
  return jsonb_build_object('id', v_quadro);
end $$;

-- ── Apagar ───────────────────────────────────────────────────────────────────

-- Apaga o quadro (quem administra; arquivado também): trava o quadro e as colunas (na ordem de id, como apagar_coluna:
-- ninguém cria coluna ou cartão no meio), apaga os cartões (checklist, comentários, responsáveis e anexos saem junto;
-- os gatilhos lembram quem apagou os objetos de cada um e avisam o canal) e depois o quadro (as colunas e os favoritos
-- saem junto; o gatilho avisa o canal). Devolve { caminhos }: todos os objetos da pasta quadro/<id>/ no balde, que
-- ficam lembrados como apagados por quem apagou (também as sobras de antes), para o app tirá-los em seguida.
create function public.apagar_quadro(p_quadro uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pasta text;
  v_caminhos text[];
begin
  if not private.administro_quadro(p_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform 1 from public.quadros q where q.id = p_quadro for update;
  if not found then
    -- apagado por outra pessoa ao mesmo tempo
    return jsonb_build_object('caminhos', '[]'::jsonb);
  end if;
  -- quem esperou a trava confere de novo (o gestor do time pode ter sido trocado no meio)
  if not private.administro_quadro(p_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform 1 from public.quadro_colunas c where c.quadro_id = p_quadro order by c.id for update;

  v_pasta := private.pasta_do_quadro(p_quadro);
  delete from public.cartoes k where k.quadro_id = p_quadro;

  select coalesce(array_agg(o.caminho order by o.caminho), '{}') into v_caminhos
  from private.objetos_no_balde(v_pasta || '/') o(caminho);
  insert into private.quadro_objetos_apagados (caminho, apagado_por)
  select c.caminho, (select auth.uid()) from unnest(v_caminhos) c(caminho)
  on conflict (caminho) do update set apagado_por = excluded.apagado_por, apagado_em = excluded.apagado_em;

  delete from public.quadros where id = p_quadro;
  return jsonb_build_object('caminhos', to_jsonb(v_caminhos));
end $$;

-- ── Listas ───────────────────────────────────────────────────────────────────
-- Só quadros pessoais e de time (o do cliente fica na aba do cliente). Quem vê, como em private.vejo_quadro: o pessoal,
-- a pessoa na consultoria em que ele nasceu; o do time, o administrador da consultoria do time e quem está no time.

-- O seletor: { favoritos, meus, dos_times }, cada um { itens, total }, só com os quadros abertos. Favoritos e Meus pelo
-- nome; Dos times pelo nome do time e depois do quadro (o administrador vê os de todos os times da consultoria; central
-- e dono não estão em times). Busca sem acento e sem maiúscula no nome; p_limite (1 a 50) por grupo; o total é o de
-- todos os que casam.
create function public.quadros_para_escolher(p_busca text default null, p_limite int default 20) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_consultoria uuid;
  v_papel text;
  v_times uuid[];
  v_padrao text := private.padrao_de_busca(p_busca);
  v_limite int := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_total int;
  v_ids uuid[];
  v_favoritos jsonb;
  v_meus jsonb;
  v_dos_times jsonb := jsonb_build_object('itens', '[]'::jsonb, 'total', 0);
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select p.consultoria_id, p.papel into v_consultoria, v_papel from public.perfis p where p.id = v_eu;
  v_times := private.meus_times();

  -- Favoritos: os abertos que a pessoa ainda vê (os outros ficam guardados e voltam quando ela voltar a ver).
  with filtrados as materialized (
    select q.id, q.nome_busca
    from public.quadro_favoritos f
    join public.quadros q on q.id = f.quadro_id
    where f.perfil_id = v_eu
      and q.arquivado_em is null
      and ((q.tipo = 'pessoa' and q.pessoa_id = v_eu and q.consultoria_id is not distinct from v_consultoria)
        or (q.tipo = 'time' and q.consultoria_id = v_consultoria
            and (v_papel = 'admin' or q.time_id = any(v_times))))
      and (v_padrao is null or q.nome_busca like v_padrao escape '\')
  )
  select (select count(*) from filtrados),
         array(select f.id from filtrados f order by f.nome_busca, f.id limit v_limite)
  into v_total, v_ids;
  v_favoritos := jsonb_build_object('itens', private.quadros_da_lista(v_ids), 'total', v_total);

  -- Meus: os pessoais abertos, na consultoria de agora.
  with filtrados as materialized (
    select q.id, q.nome_busca
    from public.quadros q
    where q.pessoa_id = v_eu
      and q.tipo = 'pessoa'
      and q.arquivado_em is null
      and q.consultoria_id is not distinct from v_consultoria
      and (v_padrao is null or q.nome_busca like v_padrao escape '\')
  )
  select (select count(*) from filtrados),
         array(select f.id from filtrados f order by f.nome_busca, f.id limit v_limite)
  into v_total, v_ids;
  v_meus := jsonb_build_object('itens', private.quadros_da_lista(v_ids), 'total', v_total);

  -- Dos times.
  if v_papel = 'admin' then
    with filtrados as materialized (
      select q.id, q.time_id, q.nome_busca
      from public.quadros q
      where q.tipo = 'time'
        and q.consultoria_id = v_consultoria
        and q.arquivado_em is null
        and (v_padrao is null or q.nome_busca like v_padrao escape '\')
    )
    select (select count(*) from filtrados),
           array(select f.id from filtrados f join public.times t on t.id = f.time_id
                 order by t.nome_busca, t.id, f.nome_busca, f.id limit v_limite)
    into v_total, v_ids;
    v_dos_times := jsonb_build_object('itens', private.quadros_da_lista(v_ids), 'total', v_total);
  elsif cardinality(v_times) > 0 then
    with filtrados as materialized (
      select q.id, q.time_id, q.nome_busca
      from public.quadros q
      where q.time_id = any(v_times)
        and q.arquivado_em is null
        and (v_padrao is null or q.nome_busca like v_padrao escape '\')
    )
    select (select count(*) from filtrados),
           array(select f.id from filtrados f join public.times t on t.id = f.time_id
                 order by t.nome_busca, t.id, f.nome_busca, f.id limit v_limite)
    into v_total, v_ids;
    v_dos_times := jsonb_build_object('itens', private.quadros_da_lista(v_ids), 'total', v_total);
  end if;

  return jsonb_build_object('favoritos', v_favoritos, 'meus', v_meus, 'dos_times', v_dos_times);
end $$;

-- Os Recentes (ids guardados no navegador): os itens dos quadros pessoais e de time abertos que a pessoa vê, na ordem
-- dos ids (até 20, sem repetir). O resto (sumiu, arquivado, de cliente, de outra pessoa) some sem erro.
create function public.quadros_por_ids(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x.id order by x.n), '{}') into v_ids
  from (
    select distinct on (i.id) i.id, i.n
    from unnest(p_ids[1:20]) with ordinality i(id, n)
    where i.id is not null
    order by i.id, i.n
  ) x
  join public.quadros q on q.id = x.id
  where q.tipo <> 'cliente'
    and q.arquivado_em is null
    and private.vejo_quadro(q.id);
  return private.quadros_da_lista(v_ids);
end $$;

-- Os arquivados que a pessoa vê (pessoais e dos times; p_tipo 'pessoa' | 'time' | nulo = os dois; outro:
-- filtro_invalido), os mais recentes primeiro, 15 por página: { itens: [item + arquivado_em, pode_administrar], total }.
create function public.quadros_arquivados(p_busca text default null, p_tipo text default null, p_pagina int default 1)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_consultoria uuid;
  v_papel text;
  v_times uuid[];
  v_padrao text := private.padrao_de_busca(p_busca);
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
  v_itens jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_tipo is not null and p_tipo not in ('pessoa', 'time') then
    raise exception 'filtro_invalido' using errcode = '22023';
  end if;
  select p.consultoria_id, p.papel into v_consultoria, v_papel from public.perfis p where p.id = v_eu;
  v_times := private.meus_times();

  with filtrados as materialized (
    select q.id, q.arquivado_em
    from public.quadros q
    where coalesce(p_tipo, 'pessoa') = 'pessoa'
      and q.pessoa_id = v_eu
      and q.tipo = 'pessoa'
      and q.arquivado_em is not null
      and q.consultoria_id is not distinct from v_consultoria
      and (v_padrao is null or q.nome_busca like v_padrao escape '\')
    union all
    select q.id, q.arquivado_em
    from public.quadros q
    where coalesce(p_tipo, 'time') = 'time'
      and v_papel = 'admin'
      and q.tipo = 'time'
      and q.consultoria_id = v_consultoria
      and q.arquivado_em is not null
      and (v_padrao is null or q.nome_busca like v_padrao escape '\')
    union all
    select q.id, q.arquivado_em
    from public.quadros q
    where coalesce(p_tipo, 'time') = 'time'
      and v_papel <> 'admin'
      and q.time_id = any(v_times)
      and q.arquivado_em is not null
      and (v_padrao is null or q.nome_busca like v_padrao escape '\')
  ), pagina as (
    select f.id, f.arquivado_em
    from filtrados f
    order by f.arquivado_em desc, f.id
    limit 15 offset (v_pagina - 1) * 15
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(private.quadro_da_lista(p.id)
          || jsonb_build_object('arquivado_em', p.arquivado_em, 'pode_administrar', private.administro_quadro(p.id))
        order by p.arquivado_em desc, p.id)
      from pagina p
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Os times em que a pessoa pode criar quadro (o "Um time" do Novo quadro): os times da consultoria em que ela está
-- (membro ou gestor); o administrador, todos os da consultoria. { itens: [{ id, nome }], total }, pelo nome, com busca
-- sem acento e p_limite de 1 a 50. Central e dono: nenhum.
create function public.times_para_novo_quadro(p_busca text default null, p_limite int default 50) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_consultoria uuid := private.consultoria_atual();
  v_admin boolean := coalesce(private.papel_atual() = 'admin', false);
  v_times uuid[] := '{}';
  v_padrao text := private.padrao_de_busca(p_busca);
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 50);
  v_total int;
  v_itens jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if not v_admin then
    v_times := private.meus_times();
  end if;

  with filtrados as materialized (
    select t.id, t.nome, t.nome_busca
    from public.times t
    where t.consultoria_id = v_consultoria
      and (v_admin or t.id = any(v_times))
      and (v_padrao is null or t.nome_busca like v_padrao escape '\')
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome_busca, p.id)
      from (select f.id, f.nome, f.nome_busca from filtrados f order by f.nome_busca, f.id limit v_limite) p
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- ── Um quadro pelo id ────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118013057_quadros_pessoais_e_de_time.sql; muda só: nos quadros pessoais e de time, também
-- "favorito" (de quem está logado). No quadro do cliente, o mesmo de antes (igual ao quadro_do_cliente).
create or replace function public.quadro_por_id(p_quadro uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if not private.vejo_quadro(p_quadro) then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'id', q.id, 'cliente_id', q.cliente_id, 'consultoria_id', q.consultoria_id, 'criado_em', q.criado_em,
      'pode_mexer', private.mexo_no_quadro(q.id), 'pode_gerir', private.gerencio_quadro(q.id),
      'colunas', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'cor', c.cor, 'concluidos', c.concluidos,
          'posicao', c.posicao, 'cartoes', n.ativos, 'arquivados', n.arquivados) order by c.posicao, c.id)
        from public.quadro_colunas c
        cross join lateral (
          select count(*) filter (where k.arquivado_em is null) as ativos,
                 count(*) filter (where k.arquivado_em is not null) as arquivados
          from public.cartoes k where k.coluna_id = c.id
        ) n
        where c.quadro_id = q.id
      ), '[]'::jsonb))
      || case when q.tipo = 'cliente' then '{}'::jsonb else jsonb_build_object(
        'tipo', q.tipo,
        'nome', q.nome,
        'time', (select jsonb_build_object('id', t.id, 'nome', t.nome) from public.times t where t.id = q.time_id),
        'arquivado_em', q.arquivado_em,
        'pode_administrar', private.administro_quadro(q.id),
        'favorito', exists (
          select 1 from public.quadro_favoritos f where f.perfil_id = (select auth.uid()) and f.quadro_id = q.id)) end
    from public.quadros q where q.id = p_quadro
  );
end $$;

-- ── Quadro arquivado: o nome não muda ────────────────────────────────────────

-- Mesmo corpo de 20261118013057_quadros_pessoais_e_de_time.sql; muda só: renomear um quadro arquivado (que continua
-- arquivado) é recusado (quadro_arquivado), para todo mundo. Restaurar (e renomear junto), arquivar de novo e arquivar
-- e renomear juntos um quadro aberto continuam.
create or replace function private.preparar_quadro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.nome := btrim(new.nome);
  if tg_op = 'INSERT' then
    new.criado_por := coalesce((select auth.uid()), new.criado_por);
    if new.tipo = 'time' then
      new.consultoria_id := (select t.consultoria_id from public.times t where t.id = new.time_id);
    end if;
    if new.arquivado_em is not null then
      new.arquivado_em := now();
    end if;
  elsif old.arquivado_em is not null and new.arquivado_em is not null and new.nome is distinct from old.nome then
    raise exception 'quadro_arquivado' using errcode = 'P0001';
  elsif old.arquivado_em is null and new.arquivado_em is not null then
    new.arquivado_em := now();
  elsif old.arquivado_em is not null and new.arquivado_em is not null then
    new.arquivado_em := old.arquivado_em;
  end if;
  return new;
end $$;

-- ── Tempo real: a consultoria ou o papel de alguém mudou ─────────────────────

-- Avisa { tabela: 'perfis', operacao: 'update', acesso: true } no canal dos quadros cujo acesso pode ter mudado: os
-- pessoais da pessoa (de qualquer consultoria: o de antes some, o de agora pode voltar), os dos times que ela gere
-- (gestor que muda de consultoria deixa de vê-los) e, se ela era ou passou a ser administradora, todos os quadros de
-- time da consultoria de antes e da de agora. A saída dos times (quem muda de consultoria) já avisa pelo gatilho de
-- time_membros.
create function private.avisar_acesso_da_pessoa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.avisar_quadro(x.id, jsonb_build_object('tabela', 'perfis', 'operacao', 'update', 'acesso', true))
  from (
    select q.id from public.quadros q where q.pessoa_id = new.id
    union
    select q.id from public.times t join public.quadros q on q.time_id = t.id where t.gestor_id = new.id
    union
    select q.id from public.quadros q
    where old.papel = 'admin' and q.tipo = 'time' and q.consultoria_id = old.consultoria_id
    union
    select q.id from public.quadros q
    where new.papel = 'admin' and q.tipo = 'time' and q.consultoria_id = new.consultoria_id
  ) x;
  return null;
end $$;

create trigger perfis_avisar_quadros
  after update of consultoria_id, papel on public.perfis
  for each row
  when (old.consultoria_id is distinct from new.consultoria_id or old.papel is distinct from new.papel)
  execute function private.avisar_acesso_da_pessoa();

-- ── Sem uso ──────────────────────────────────────────────────────────────────

drop function private.objetos_do_cartao(uuid, uuid);

-- ── Permissões ───────────────────────────────────────────────────────────────

-- posso_favoritar roda na regra de insert (com o papel de quem marca).
revoke all on function private.posso_favoritar(uuid) from public, anon;
grant execute on function private.posso_favoritar(uuid) to authenticated;

-- Só as funções do banco usam.
revoke all on function private.meus_times(), private.quadro_da_lista(uuid), private.quadros_da_lista(uuid[]),
  private.avisar_acesso_da_pessoa() from public, anon, authenticated;

revoke all on function public.criar_quadro(text, uuid), public.apagar_quadro(uuid),
  public.quadros_para_escolher(text, int), public.quadros_por_ids(uuid[]), public.quadros_arquivados(text, text, int),
  public.times_para_novo_quadro(text, int) from public, anon;
grant execute on function public.criar_quadro(text, uuid), public.apagar_quadro(uuid),
  public.quadros_para_escolher(text, int), public.quadros_por_ids(uuid[]), public.quadros_arquivados(text, text, int),
  public.times_para_novo_quadro(text, int) to authenticated;

-- As redefinidas mantêm os grants (create or replace); repetidos aqui para ficar explícito.
revoke all on function public.quadro_por_id(uuid) from public, anon;
grant execute on function public.quadro_por_id(uuid) to authenticated;
revoke all on function private.preparar_quadro() from public, anon, authenticated;
