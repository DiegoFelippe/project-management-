-- Modelos de check-in (desenho em docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md; plano em
-- docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 1). Só cria tabelas, funções e regras: nenhuma linha que
-- já existe é alterada ou apagada.
--
-- - Um modelo tem etapas em ordem e tarefas em ordem; a posição da tarefa é a do modelo inteiro (1..n, etapa por etapa).
--   Cada tarefa tem prazo ("dia N" a partir do início, 0 a 365), é obrigatória ou opcional e pode depender de outras.
-- - Para quem: da Central para todas as consultorias (consultoria nula, inclusive as que entrarem depois), da Central
--   para uma consultoria, ou da consultoria (feito pela gestão dela, só para ela).
-- - Quem vê: a Central e o dono, todos; o administrador, o gestor e o consultor, os da Central para todas e para a
--   consultoria deles e os da própria consultoria. Uma consultoria nunca vê os de outra nem o da Central só para outra.
-- - Quem mexe (criar, editar, arquivar, reativar, apagar): a Central e o dono, todos; o administrador e o gestor, só os da
--   própria consultoria que não são da Central (os da Central eles duplicam); o consultor só lê.
-- - Escrita: criar e editar só por salvar_modelo, que regrava etapas, tarefas e dependências inteiras numa transação (o
--   editor manda tudo de uma vez) e grava os contadores (etapas, tarefas, obrigatórias e maior prazo, para a lista não
--   contar tarefa por tarefa). Direto pela API só arquivar/reativar (a coluna arquivado_em) e apagar, pela regra.
-- - Sem ciclo: a dependência só aponta para tarefa que vem antes na ordem do modelo (salvar_modelo confere), então toda
--   seta anda para trás. Limites: 50 etapas, 500 tarefas e 30 dependências por tarefa.
-- - "Clientes usando" é 0 aqui: o check-list do cliente (Task 2) redefine modelos_da_lista e indicadores_de_modelos.

-- ── Tabelas ──────────────────────────────────────────────────────────────────

create table public.modelos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  descricao text check (char_length(descricao) <= 400),
  -- um dos quatro tipos de consultoria das pessoas, ou nenhum
  tipo text check (tipo is null or private.tipos_de_consultoria_validos(array[tipo])),
  da_central boolean not null default false,
  -- nula = para todas as consultorias (só em modelo da Central)
  consultoria_id uuid references public.consultorias on delete restrict,
  criado_por uuid references public.perfis on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivado_em timestamptz,
  -- contadores gravados por salvar_modelo
  etapas smallint not null default 0 check (etapas >= 0),
  tarefas smallint not null default 0 check (tarefas >= 0),
  obrigatorias smallint not null default 0 check (obrigatorias >= 0),
  maior_prazo smallint not null default 0 check (maior_prazo >= 0),
  busca text generated always as (private.sem_acento(nome || ' ' || coalesce(descricao, ''))) stored,
  check (da_central or consultoria_id is not null)
);

-- A lista e os números de quem é de uma consultoria: os da consultoria (por ela) mais os da Central para todas (pelo
-- índice parcial), cada um já na aba (arquivado ou não).
create index modelos_consultoria_idx on public.modelos (consultoria_id, arquivado_em);
create index modelos_para_todas_idx on public.modelos (arquivado_em) where consultoria_id is null;
create index modelos_tipo_idx on public.modelos (tipo);
create index modelos_busca_idx on public.modelos using gin (busca extensions.gin_trgm_ops);
-- Quem criou (junção para o nome; apagar a pessoa deixa nulo).
create index modelos_criado_por_idx on public.modelos (criado_por);

create table public.modelo_etapas (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.modelos on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  posicao smallint not null check (posicao >= 1),
  unique (modelo_id, posicao),
  -- alvo da chave das tarefas (modelo, etapa): a tarefa só fica numa etapa do modelo dela
  unique (modelo_id, id)
);

create table public.modelo_tarefas (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references public.modelos on delete cascade,
  etapa_id uuid not null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 80),
  descricao text check (char_length(descricao) <= 160),
  obrigatoria boolean not null default true,
  prazo_dias smallint not null check (prazo_dias between 0 and 365),
  -- ordem no modelo inteiro (1..n, seguindo as etapas)
  posicao smallint not null check (posicao >= 1),
  unique (modelo_id, posicao),
  foreign key (modelo_id, etapa_id) references public.modelo_etapas (modelo_id, id) on delete cascade
);

create index modelo_tarefas_etapa_idx on public.modelo_tarefas (etapa_id, posicao);

-- tarefa_id depende de depende_de (as duas do mesmo modelo, depende_de com posição menor: salvar_modelo confere).
create table public.modelo_dependencias (
  tarefa_id uuid not null references public.modelo_tarefas on delete cascade,
  depende_de uuid not null references public.modelo_tarefas on delete cascade,
  primary key (tarefa_id, depende_de),
  check (tarefa_id <> depende_de)
);

create index modelo_dependencias_depende_de_idx on public.modelo_dependencias (depende_de);

alter table public.modelos enable row level security;
alter table public.modelo_etapas enable row level security;
alter table public.modelo_tarefas enable row level security;
alter table public.modelo_dependencias enable row level security;

-- ── Quem vê, quem mexe ───────────────────────────────────────────────────────

-- Vê o modelo: a Central e o dono, todos; os outros (sessão liberada), os da Central para todas (consultoria nula) ou
-- para a consultoria deles e os da própria consultoria.
create function private.vejo_modelo(p_modelo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and exists (
      select 1 from public.modelos m
      where m.id = p_modelo
        and (private.sou_central() or m.consultoria_id is null or m.consultoria_id = private.consultoria_atual())
    ),
    false)
$$;

-- Mexe no modelo (edita, arquiva, reativa, apaga): a Central e o dono, todos; o administrador e o gestor, os da própria
-- consultoria que não são da Central.
create function private.edito_modelo(p_modelo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    exists (
      select 1 from public.modelos m
      where m.id = p_modelo
        and (private.sou_central() or (not m.da_central and private.gerencio_consultoria(m.consultoria_id)))
    ),
    false)
$$;

revoke all on function private.vejo_modelo(uuid), private.edito_modelo(uuid) from public, anon;
grant execute on function private.vejo_modelo(uuid), private.edito_modelo(uuid) to authenticated;

-- ── Gatilho ──────────────────────────────────────────────────────────────────

-- Arquivar grava a hora do banco (não a que veio do app); a data de quem já está arquivado não muda; reativar limpa.
create function private.preparar_modelo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.arquivado_em is null and new.arquivado_em is not null then
    new.arquivado_em := now();
  elsif old.arquivado_em is not null and new.arquivado_em is not null then
    new.arquivado_em := old.arquivado_em;
  end if;
  return new;
end $$;

create trigger modelos_preparar
  before update of arquivado_em on public.modelos
  for each row execute function private.preparar_modelo();

revoke all on function private.preparar_modelo() from public;

-- ── Regras ───────────────────────────────────────────────────────────────────

-- Leitura: as chamadas das regras vão dentro de (select ...) para rodar uma vez por consulta e não uma vez por linha. As
-- tabelas filhas reaproveitam a regra dos modelos (a subconsulta passa pela regra de leitura de modelos).
create policy "ver modelos" on public.modelos
  for select to authenticated
  using ((select private.sou_central())
    or ((select private.liberado())
        and (consultoria_id is null or consultoria_id = (select private.consultoria_atual()))));

create policy "ver etapas" on public.modelo_etapas
  for select to authenticated
  using (exists (select 1 from public.modelos m where m.id = modelo_etapas.modelo_id));

create policy "ver tarefas" on public.modelo_tarefas
  for select to authenticated
  using (exists (select 1 from public.modelos m where m.id = modelo_tarefas.modelo_id));

create policy "ver dependências" on public.modelo_dependencias
  for select to authenticated
  using (exists (select 1 from public.modelo_tarefas t where t.id = modelo_dependencias.tarefa_id));

-- Arquivar e reativar (só a coluna arquivado_em tem permissão) e apagar: quem mexe no modelo. Etapas, tarefas e
-- dependências saem junto com o modelo.
create policy "arquivar e reativar modelo" on public.modelos
  for update to authenticated
  using (private.edito_modelo(id))
  with check (private.edito_modelo(id));

create policy "apagar modelo" on public.modelos
  for delete to authenticated
  using (private.edito_modelo(id));

-- ── Salvar ───────────────────────────────────────────────────────────────────

-- Cria (p_id nulo) ou regrava o modelo inteiro e devolve o id. p_dados = { nome, descricao, tipo, para: 'todas' |
-- <consultoria_id>, etapas: [{ nome, tarefas: [{ chave, titulo, descricao, obrigatoria, prazo_dias, depende_de: [chave]
-- }] }] }. A chave é do editor (só liga as dependências; não é gravada).
-- - Quem: a Central e o dono (qualquer modelo) e a gestão (administrador e gestor; os modelos da própria consultoria que
--   não são da Central). O consultor e a sessão não liberada: sem_permissao. Modelo arquivado: modelo_arquivado.
-- - Para quem: a gestão grava sempre a própria consultoria (o "para" que vier não vale). A Central escolhe "todas" ou uma
--   consultoria ativa (consultoria_invalida). O modelo feito por uma consultoria continua dela: a Central o edita, mas o
--   "para" dele só pode ser a própria consultoria (ou vir vazio).
-- - Conferido antes de gravar (P0001): modelo_nome_curto (menos de 2 letras), modelo_grande_demais (mais de 50 etapas,
--   500 tarefas ou 30 dependências numa tarefa), modelo_sem_tarefas, etapa_sem_nome, etapa_sem_tarefas,
--   tarefa_sem_titulo, prazo_invalido (número inteiro de 0 a 365) e dependencia_invalida (chave desconhecida, a própria
--   tarefa, tarefa que vem depois, ou duas tarefas com a mesma chave). Textos acima do tamanho são recusados pelas regras
--   das colunas ao gravar (23514).
-- - Regrava numa transação: apaga as etapas (as tarefas e as dependências saem junto) e grava tudo de novo com as
--   posições 1..n, sem os espaços das pontas; descrição em branco vira nula; obrigatória vem verdadeira se não vier.
--   Qualquer erro desfaz a chamada inteira: o modelo continua como estava. Duas pessoas salvando o mesmo modelo: a
--   segunda espera a primeira (o modelo fica travado).
create function public.salvar_modelo(p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_central boolean := private.sou_central();
  v_minha uuid := private.consultoria_atual();
  v_atual record;
  v_da_central boolean;
  v_consultoria uuid;
  v_para text := nullif(btrim(p_dados ->> 'para'), '');
  v_para_id uuid := case when v_para ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then v_para::uuid end;
  v_nome text := btrim(p_dados ->> 'nome');
  v_descricao text := nullif(btrim(p_dados ->> 'descricao'), '');
  v_tipo text := nullif(btrim(p_dados ->> 'tipo'), '');
  v_etapas jsonb := case when jsonb_typeof(p_dados -> 'etapas') = 'array' then p_dados -> 'etapas' else '[]' end;
  v_etapa jsonb;
  v_tarefa jsonb;
  v_dep jsonb;
  v_n_etapas int;
  v_total int;
  v_pos int := 0;
  v_alvo int;
  v_chave text;
  v_chaves jsonb := '{}';
  v_prazo numeric;
  v_e_ids uuid[] := '{}';
  v_e_nomes text[] := '{}';
  v_t_ids uuid[] := '{}';
  v_t_etapas int[] := '{}';
  v_t_titulos text[] := '{}';
  v_t_descricoes text[] := '{}';
  v_t_obrigatorias boolean[] := '{}';
  v_t_prazos smallint[] := '{}';
  v_d_de int[] := '{}';
  v_d_para int[] := '{}';
  v_obrigatorias int;
  v_maior_prazo int;
  v_id uuid;
  i int;
begin
  if not v_central and not private.gerencio_consultoria(v_minha) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  if p_id is not null then
    if not private.edito_modelo(p_id) then
      raise exception 'sem_permissao' using errcode = 'P0001';
    end if;
    select m.id, m.da_central, m.consultoria_id, m.arquivado_em into v_atual
    from public.modelos m where m.id = p_id for update;
    if v_atual.id is null then
      raise exception 'sem_permissao' using errcode = 'P0001';
    end if;
    if v_atual.arquivado_em is not null then
      raise exception 'modelo_arquivado' using errcode = 'P0001';
    end if;
  end if;

  -- Para quem.
  if not v_central then
    v_da_central := false;
    v_consultoria := v_minha;
  elsif p_id is not null and not v_atual.da_central then
    if v_para is not null and v_para_id is distinct from v_atual.consultoria_id then
      raise exception 'consultoria_invalida' using errcode = 'P0001';
    end if;
    v_da_central := false;
    v_consultoria := v_atual.consultoria_id;
  else
    v_da_central := true;
    if v_para = 'todas' then
      v_consultoria := null;
    elsif v_para_id is not null and exists (
      select 1 from public.consultorias c
      where c.id = v_para_id
        -- consultoria arquivada não recebe modelo; o que já era dela continua (salvar sem mudar o "para")
        and (c.arquivada_em is null or (p_id is not null and c.id = v_atual.consultoria_id))) then
      v_consultoria := v_para_id;
    else
      raise exception 'consultoria_invalida' using errcode = 'P0001';
    end if;
  end if;

  -- O que veio, antes de gravar qualquer coisa.
  if v_nome is null or char_length(v_nome) < 2 then
    raise exception 'modelo_nome_curto' using errcode = 'P0001';
  end if;
  v_n_etapas := jsonb_array_length(v_etapas);
  select coalesce(sum(case when jsonb_typeof(x -> 'tarefas') = 'array' then jsonb_array_length(x -> 'tarefas') end), 0)
  into v_total
  from jsonb_array_elements(v_etapas) x;
  if v_n_etapas > 50 or v_total > 500 then
    raise exception 'modelo_grande_demais' using errcode = 'P0001';
  end if;
  if v_total = 0 then
    raise exception 'modelo_sem_tarefas' using errcode = 'P0001';
  end if;

  for i in 1 .. v_n_etapas loop
    v_etapa := v_etapas -> (i - 1);
    if nullif(btrim(v_etapa ->> 'nome'), '') is null then
      raise exception 'etapa_sem_nome' using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_etapa -> 'tarefas') is distinct from 'array' or jsonb_array_length(v_etapa -> 'tarefas') = 0 then
      raise exception 'etapa_sem_tarefas' using errcode = 'P0001';
    end if;
    v_e_ids := v_e_ids || gen_random_uuid();
    v_e_nomes := v_e_nomes || btrim(v_etapa ->> 'nome');

    for v_tarefa in select x from jsonb_array_elements(v_etapa -> 'tarefas') x loop
      v_pos := v_pos + 1;
      if nullif(btrim(v_tarefa ->> 'titulo'), '') is null then
        raise exception 'tarefa_sem_titulo' using errcode = 'P0001';
      end if;
      if jsonb_typeof(v_tarefa -> 'prazo_dias') is distinct from 'number' then
        raise exception 'prazo_invalido' using errcode = 'P0001';
      end if;
      v_prazo := (v_tarefa ->> 'prazo_dias')::numeric;
      if v_prazo <> trunc(v_prazo) or v_prazo < 0 or v_prazo > 365 then
        raise exception 'prazo_invalido' using errcode = 'P0001';
      end if;

      -- Depende só de tarefa que já veio (posição menor): a própria e as de depois ainda não estão em v_chaves.
      if coalesce(jsonb_typeof(v_tarefa -> 'depende_de'), 'null') <> 'null' then
        if jsonb_typeof(v_tarefa -> 'depende_de') <> 'array' then
          raise exception 'dependencia_invalida' using errcode = 'P0001';
        end if;
        if jsonb_array_length(v_tarefa -> 'depende_de') > 30 then
          raise exception 'modelo_grande_demais' using errcode = 'P0001';
        end if;
        for v_dep in select x from jsonb_array_elements(v_tarefa -> 'depende_de') x loop
          v_alvo := (v_chaves ->> (v_dep #>> '{}'))::int;
          if v_alvo is null then
            raise exception 'dependencia_invalida' using errcode = 'P0001';
          end if;
          v_d_de := v_d_de || v_pos;
          v_d_para := v_d_para || v_alvo;
        end loop;
      end if;

      v_chave := v_tarefa ->> 'chave';
      if v_chave is not null then
        if v_chaves ? v_chave then
          raise exception 'dependencia_invalida' using errcode = 'P0001';
        end if;
        v_chaves := v_chaves || jsonb_build_object(v_chave, v_pos);
      end if;

      v_t_ids := v_t_ids || gen_random_uuid();
      v_t_etapas := v_t_etapas || i;
      v_t_titulos := v_t_titulos || btrim(v_tarefa ->> 'titulo');
      v_t_descricoes := v_t_descricoes || nullif(btrim(v_tarefa ->> 'descricao'), '');
      v_t_obrigatorias := v_t_obrigatorias
        || case when jsonb_typeof(v_tarefa -> 'obrigatoria') = 'boolean' then (v_tarefa ->> 'obrigatoria')::boolean
           else true end;
      v_t_prazos := v_t_prazos || v_prazo::smallint;
    end loop;
  end loop;

  -- Gravar, com os contadores.
  v_obrigatorias := (select count(*) from unnest(v_t_obrigatorias) o where o);
  v_maior_prazo := (select max(p) from unnest(v_t_prazos) p);
  if p_id is null then
    insert into public.modelos (nome, descricao, tipo, da_central, consultoria_id, criado_por, etapas, tarefas,
      obrigatorias, maior_prazo)
    values (v_nome, v_descricao, v_tipo, v_da_central, v_consultoria, (select auth.uid()), v_n_etapas, v_pos,
      v_obrigatorias, v_maior_prazo)
    returning id into v_id;
  else
    v_id := p_id;
    update public.modelos
    set nome = v_nome, descricao = v_descricao, tipo = v_tipo, consultoria_id = v_consultoria, atualizado_em = now(),
        etapas = v_n_etapas, tarefas = v_pos, obrigatorias = v_obrigatorias, maior_prazo = v_maior_prazo
    where id = v_id;
    delete from public.modelo_etapas where modelo_id = v_id;
  end if;

  insert into public.modelo_etapas (id, modelo_id, nome, posicao)
  select x.id, v_id, x.nome, x.posicao
  from unnest(v_e_ids, v_e_nomes) with ordinality as x(id, nome, posicao);

  insert into public.modelo_tarefas (id, modelo_id, etapa_id, titulo, descricao, obrigatoria, prazo_dias, posicao)
  select x.id, v_id, v_e_ids[x.etapa], x.titulo, x.descricao, x.obrigatoria, x.prazo, x.posicao
  from unnest(v_t_ids, v_t_etapas, v_t_titulos, v_t_descricoes, v_t_obrigatorias, v_t_prazos)
    with ordinality as x(id, etapa, titulo, descricao, obrigatoria, prazo, posicao);

  insert into public.modelo_dependencias (tarefa_id, depende_de)
  select distinct v_t_ids[x.de], v_t_ids[x.para]
  from unnest(v_d_de, v_d_para) as x(de, para);

  return v_id;
end $$;

-- ── Ler ──────────────────────────────────────────────────────────────────────

-- O modelo inteiro, para a janela (editar, duplicar, ver e o fluxograma): { id, nome, descricao, tipo, da_central,
-- consultoria: { id, nome } | null, criado_por: { nome }, criado_em, atualizado_em, arquivado_em, pode_editar,
-- pode_duplicar, etapas: [{ id, nome, posicao, tarefas: [{ id, titulo, descricao, obrigatoria, prazo_dias, posicao,
-- depende_de: [id] }] }] }, etapas e tarefas em ordem e "depende de" na ordem do modelo. O nome de quem criou segue a
-- regra de nome visível (private.nome_do_perfil_visivel: quem é da Central aparece como "Central" para as
-- consultorias). pode_editar: quem mexe no modelo (editar, arquivar, reativar e apagar; arquivado, a tela oferece só
-- reativar e apagar); pode_duplicar: a Central e a gestão. Quem não vê o modelo: nulo. Sessão não liberada: sem_permissao.
create function public.modelo_completo(p_modelo uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_json jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if not private.vejo_modelo(p_modelo) then
    return null;
  end if;

  with tarefas as (
    select t.etapa_id, t.posicao, jsonb_build_object(
      'id', t.id, 'titulo', t.titulo, 'descricao', t.descricao, 'obrigatoria', t.obrigatoria,
      'prazo_dias', t.prazo_dias, 'posicao', t.posicao,
      'depende_de', coalesce((
        select jsonb_agg(d.depende_de order by dt.posicao)
        from public.modelo_dependencias d
        join public.modelo_tarefas dt on dt.id = d.depende_de
        where d.tarefa_id = t.id), '[]'::jsonb)) as json
    from public.modelo_tarefas t
    where t.modelo_id = p_modelo
  ),
  por_etapa as (
    select x.etapa_id, jsonb_agg(x.json order by x.posicao) as tarefas from tarefas x group by x.etapa_id
  )
  select jsonb_build_object(
    'id', m.id, 'nome', m.nome, 'descricao', m.descricao, 'tipo', m.tipo, 'da_central', m.da_central,
    'consultoria', case when c.id is not null then jsonb_build_object('id', c.id, 'nome', c.nome) end,
    'criado_por', jsonb_build_object('nome', private.nome_do_perfil_visivel(m.criado_por)),
    'criado_em', m.criado_em, 'atualizado_em', m.atualizado_em, 'arquivado_em', m.arquivado_em,
    'pode_editar', private.edito_modelo(m.id),
    'pode_duplicar', private.sou_central() or private.gerencio_consultoria(private.consultoria_atual()),
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'posicao', e.posicao,
        'tarefas', coalesce(p.tarefas, '[]'::jsonb)) order by e.posicao)
      from public.modelo_etapas e
      left join por_etapa p on p.etapa_id = e.id
      where e.modelo_id = m.id), '[]'::jsonb))
  into v_json
  from public.modelos m
  left join public.consultorias c on c.id = m.consultoria_id
  where m.id = p_modelo;

  return v_json;
end $$;

-- A tabela "Modelos de check-in", 15 por página, em ordem de nome: { itens: [{ id, nome, descricao, tipo, da_central,
-- consultoria: { id, nome } | null, criado_por: { nome }, criado_em, etapas, tarefas, obrigatorias, maior_prazo,
-- clientes_usando, arquivado_em, pode_editar, pode_duplicar }], total }. Os modelos que quem chama vê (a regra de
-- private.vejo_modelo), na aba ('ativos' | 'arquivados'), com busca no nome e na descrição (sem acento e sem maiúscula)
-- e tipo. p_consultoria só vale para a Central: os modelos que aquela consultoria vê (os dela e os da Central para todas
-- e para ela); quem não é da Central fica sempre na dele. Aba ou tipo que não existe: filtro_invalido.
-- pode_editar e pode_duplicar seguem private.edito_modelo e modelo_completo, calculados uma vez por chamada.
create function public.modelos_da_lista(p_aba text default 'ativos', p_busca text default null, p_tipo text default null,
  p_consultoria uuid default null, p_pagina int default 1) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_central boolean;
  v_gestao boolean;
  v_minha uuid;
  v_consultoria uuid;
  v_todas boolean;
  v_arquivados boolean := coalesce(p_aba, 'ativos') = 'arquivados';
  v_padrao text := private.padrao_de_busca(p_busca);
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
  v_itens jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if coalesce(p_aba, 'ativos') not in ('ativos', 'arquivados')
     or (p_tipo is not null and not private.tipos_de_consultoria_validos(array[p_tipo])) then
    raise exception 'filtro_invalido' using errcode = '22023';
  end if;
  v_central := private.sou_central();
  v_minha := private.consultoria_atual();
  v_gestao := not v_central and private.gerencio_consultoria(v_minha);
  v_consultoria := case when v_central then p_consultoria else v_minha end;
  v_todas := v_central and p_consultoria is null;

  with filtrados as materialized (
    select m.id, m.nome
    from public.modelos m
    where ((v_arquivados and m.arquivado_em is not null) or (not v_arquivados and m.arquivado_em is null))
      and (v_todas or m.consultoria_id = v_consultoria or m.consultoria_id is null)
      and (p_tipo is null or m.tipo = p_tipo)
      and (v_padrao is null or m.busca like v_padrao escape '\')
  ), pagina as (
    select f.id from filtrados f order by f.nome, f.id limit 15 offset (v_pagina - 1) * 15
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'descricao', m.descricao, 'tipo', m.tipo, 'da_central', m.da_central,
        'consultoria', case when c.id is not null then jsonb_build_object('id', c.id, 'nome', c.nome) end,
        'criado_por', jsonb_build_object('nome', private.nome_do_perfil_visivel(m.criado_por)),
        'criado_em', m.criado_em, 'etapas', m.etapas, 'tarefas', m.tarefas, 'obrigatorias', m.obrigatorias,
        'maior_prazo', m.maior_prazo, 'clientes_usando', 0, 'arquivado_em', m.arquivado_em,
        'pode_editar', v_central or (v_gestao and not m.da_central and m.consultoria_id = v_minha),
        'pode_duplicar', v_central or v_gestao
      ) order by m.nome, m.id)
      from pagina pg
      join public.modelos m on m.id = pg.id
      left join public.consultorias c on c.id = m.consultoria_id
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Cartões de números da aba Modelos, no molde de indicadores_de_times: { recorte, ativos, da_central, da_consultoria,
-- clientes_usando }, só os não arquivados que quem chama vê. A Central e o dono (recorte 'tudo'): todos, ou os que
-- p_consultoria vê; os outros ('consultoria', o administrador, o gestor e o consultor veem os mesmos): os da consultoria
-- e os da Central para todas e para ela (p_consultoria não vale). da_consultoria: os feitos pelas consultorias (para a
-- Central, "Das consultorias"). clientes_usando: 0 até o check-list do cliente (Task 2).
create function public.indicadores_de_modelos(p_consultoria uuid default null) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_recorte text;
  v_consultoria uuid;
  v_todas boolean;
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
    v_consultoria := p_consultoria;
  elsif private.liberado() then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  v_todas := v_recorte = 'tudo' and v_consultoria is null;

  select jsonb_build_object(
    'recorte', v_recorte,
    'ativos', count(*),
    'da_central', count(*) filter (where m.da_central),
    'da_consultoria', count(*) filter (where not m.da_central),
    'clientes_usando', 0)
  into v_resultado
  from public.modelos m
  where m.arquivado_em is null
    and (v_todas or m.consultoria_id = v_consultoria or m.consultoria_id is null);
  return v_resultado;
end $$;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.modelos, public.modelo_etapas, public.modelo_tarefas, public.modelo_dependencias
  from public, anon, authenticated;
grant select on public.modelos, public.modelo_etapas, public.modelo_tarefas, public.modelo_dependencias to authenticated;
grant update (arquivado_em), delete on public.modelos to authenticated;
grant all on public.modelos, public.modelo_etapas, public.modelo_tarefas, public.modelo_dependencias to service_role;

revoke all on function public.salvar_modelo(uuid, jsonb), public.modelo_completo(uuid),
  public.modelos_da_lista(text, text, text, uuid, int), public.indicadores_de_modelos(uuid) from public, anon;
grant execute on function public.salvar_modelo(uuid, jsonb), public.modelo_completo(uuid),
  public.modelos_da_lista(text, text, text, uuid, int), public.indicadores_de_modelos(uuid) to authenticated;
