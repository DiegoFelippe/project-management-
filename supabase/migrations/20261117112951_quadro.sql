-- Quadro Kanban do cliente (desenho em docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md; plano em
-- docs/superpowers/plans/2026-11-17-kanban-do-cliente.md, Task 1). Só cria tabelas, funções e regras: nenhuma linha
-- que já existe é alterada ou apagada.
--
-- - Um quadro por cliente e consultoria (quadros, único por cliente_id + consultoria_id): o quadro é da consultoria que
--   atende o cliente. Ele nasce quando alguém dessa consultoria que mexe no quadro abre a aba (quadro_do_cliente), com
--   "A fazer", "Em andamento" e "Concluído" (de concluídos). Quando o cliente muda de consultoria, a antiga deixa de ver
--   o quadro dela (deixa de ver o cliente) e a nova começa um quadro novo; se o cliente volta, o quadro antigo dela
--   reaparece. A central e o dono leem todos.
-- - Quem vê: a central e o dono (só leem); na consultoria que atende o cliente hoje, o administrador, o gestor e o
--   consultor do cliente. Quem mexe: esses três, com o cliente ativo (cliente arquivado = só leitura para todos).
-- - Quem faz o quê (tabela do desenho): criar, editar, mover e arquivar cartão, colunas (criar, renomear, cor, ordem),
--   checklist, responsáveis e comentar: quem mexe. Apagar cartão: quem o criou ou a gestão. Apagar coluna: só a gestão.
--   Comentário: editar só o próprio; apagar o próprio, e a gestão apaga qualquer um.
-- - Escrita simples direto pela API (as regras abaixo). O que mexe em várias linhas ou precisa de conta é função do
--   banco: abrir o quadro, mover cartão e coluna, apagar coluna. As leituras do quadro também são funções (uma página de
--   50 cartões por coluna, com responsáveis, checklist e comentários contados na mesma consulta).
-- - Ordem por posição fracionária (numeric): mover põe o cartão no meio dos vizinhos; quando o espaço entre eles acaba,
--   a coluna é renumerada de 1024 em 1024. A coluna de destino fica travada durante a conta (dois movimentos para a
--   mesma coluna esperam um pelo outro), e o cartão novo também trava a coluna para ir para o fim dela.
-- - Descrição: o JSON do editor (TipTap), nunca HTML; descricao_texto (o texto puro, para a busca) sai do JSON num
--   gatilho. A busca (título e descrição) é sem acento e sem maiúscula, como as outras do app.
-- - Cartão segura o cliente: quadro sem cartões sai junto com o cliente; com cartões (mesmo arquivados), apagar o cliente
--   dá 23503 (o app pede para arquivar). Coluna com cartões também não se apaga direto: só por apagar_coluna, que
--   pergunta para onde os cartões vão.
-- - A contagem de anexos na página da coluna entra com os anexos (Task 2), que redefine cartoes_do_quadro.

-- ── Tabelas ──────────────────────────────────────────────────────────────────

create table public.quadros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete cascade,
  consultoria_id uuid not null references public.consultorias on delete restrict,
  criado_em timestamptz not null default now(),
  unique (cliente_id, consultoria_id)
);

create index quadros_consultoria_idx on public.quadros (consultoria_id);

create table public.quadro_colunas (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null references public.quadros on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  -- 10 cores; nula = automática pela posição (a tela escolhe)
  cor smallint check (cor between 0 and 9),
  -- coluna de concluídos: o prazo dos cartões dela não conta como atrasado nem como "vence em 7 dias"
  concluidos boolean not null default false,
  posicao numeric not null,
  -- alvo da chave dos cartões (quadro, coluna): o cartão só fica numa coluna do quadro dele
  unique (quadro_id, id)
);

create index quadro_colunas_quadro_idx on public.quadro_colunas (quadro_id, posicao, id);

create table public.cartoes (
  id uuid primary key default gen_random_uuid(),
  quadro_id uuid not null,
  coluna_id uuid not null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  -- documento do editor (TipTap); nunca HTML
  descricao jsonb check (descricao is null
    or (jsonb_typeof(descricao) = 'object' and octet_length(descricao::text) <= 200000)),
  -- texto puro da descrição (gatilho), para a busca
  descricao_texto text,
  prioridade text check (prioridade in ('baixa', 'media', 'alta')),
  prazo date,
  posicao numeric not null,
  arquivado_em timestamptz,
  criado_por uuid references public.perfis on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  busca text generated always as (private.sem_acento(titulo || ' ' || coalesce(descricao_texto, ''))) stored,
  -- a coluna é do mesmo quadro do cartão; coluna com cartões não se apaga direto (nem junto com o cliente)
  foreign key (quadro_id, coluna_id) references public.quadro_colunas (quadro_id, id) on delete restrict
);

-- Página da coluna (ordem), vizinhos ao mover, renumeração e a chave da coluna; arquivado_em junto para contar os
-- cartões de cada coluna sem ler a tabela.
create index cartoes_coluna_idx on public.cartoes (coluna_id, posicao, id) include (arquivado_em);
-- Números do topo (cartões do quadro, por prazo) e os arquivados (mais recentes primeiro).
create index cartoes_quadro_ativos_idx on public.cartoes (quadro_id, prazo) where arquivado_em is null;
create index cartoes_quadro_arquivados_idx on public.cartoes (quadro_id, arquivado_em desc, id) where arquivado_em is not null;
create index cartoes_criado_por_idx on public.cartoes (criado_por);
create index cartoes_busca_idx on public.cartoes using gin (busca extensions.gin_trgm_ops);

create table public.cartao_responsaveis (
  cartao_id uuid not null references public.cartoes on delete cascade,
  perfil_id uuid not null references public.perfis on delete cascade,
  primary key (cartao_id, perfil_id)
);

create index cartao_responsaveis_perfil_idx on public.cartao_responsaveis (perfil_id);

create table public.cartao_checklist (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.cartoes on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 300),
  feito boolean not null default false,
  posicao numeric not null
);

create index cartao_checklist_cartao_idx on public.cartao_checklist (cartao_id, posicao, id);

create table public.cartao_comentarios (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid not null references public.cartoes on delete cascade,
  autor_id uuid references public.perfis on delete set null,
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now(),
  editado_em timestamptz
);

create index cartao_comentarios_cartao_idx on public.cartao_comentarios (cartao_id, criado_em desc, id desc);
create index cartao_comentarios_autor_idx on public.cartao_comentarios (autor_id);

alter table public.quadros enable row level security;
alter table public.quadro_colunas enable row level security;
alter table public.cartoes enable row level security;
alter table public.cartao_responsaveis enable row level security;
alter table public.cartao_checklist enable row level security;
alter table public.cartao_comentarios enable row level security;

-- ── Quem vê, quem mexe ───────────────────────────────────────────────────────

-- Quadros que a pessoa logada (fora da central) vê: os dos clientes que estão hoje na consultoria dela, quando ela cuida
-- da consultoria (administrador ou gestor) ou é o consultor do cliente. Um caminho por índice para cada papel: a gestão
-- pelos quadros da consultoria; o consultor pelos clientes dele. Usada nas regras de leitura, uma vez por consulta.
create function private.meus_quadros() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select q.id
  from public.quadros q
  join public.clientes c on c.id = q.cliente_id and c.consultoria_id = q.consultoria_id
  where (select private.gerencio_consultoria(private.consultoria_atual()))
    and q.consultoria_id = (select private.consultoria_atual())
  union all
  select q.id
  from public.clientes c
  join public.quadros q on q.cliente_id = c.id and q.consultoria_id = c.consultoria_id
  where not (select private.gerencio_consultoria(private.consultoria_atual()))
    and (select private.liberado())
    and c.consultor_id = (select auth.uid())
    and c.consultoria_id = (select private.consultoria_atual())
$$;

-- Vê o quadro: a central e o dono; ou, se o cliente está hoje na consultoria do quadro e ela é a de quem pergunta, quem
-- cuida dela ou o consultor do cliente.
create function private.vejo_quadro(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and exists (
      select 1
      from public.quadros q
      join public.clientes c on c.id = q.cliente_id
      where q.id = p_quadro
        and (
          private.sou_central()
          or (q.consultoria_id = c.consultoria_id
              and q.consultoria_id = private.consultoria_atual()
              and (private.gerencio_consultoria(q.consultoria_id) or c.consultor_id = (select auth.uid())))
        )
    ),
    false)
$$;

-- Mexe no quadro: como acima, sem a central e o dono, e com o cliente ativo.
create function private.mexo_no_quadro(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and exists (
      select 1
      from public.quadros q
      join public.clientes c on c.id = q.cliente_id
      where q.id = p_quadro
        and not c.arquivado
        and q.consultoria_id = c.consultoria_id
        and q.consultoria_id = private.consultoria_atual()
        and (private.gerencio_consultoria(q.consultoria_id) or c.consultor_id = (select auth.uid()))
    ),
    false)
$$;

-- Gere o quadro (apaga coluna, cartão e comentário de qualquer um): quem mexe e cuida da consultoria.
create function private.gerencio_quadro(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    exists (
      select 1
      from public.quadros q
      join public.clientes c on c.id = q.cliente_id
      where q.id = p_quadro
        and not c.arquivado
        and q.consultoria_id = c.consultoria_id
        and private.gerencio_consultoria(q.consultoria_id)
    ),
    false)
$$;

create function private.mexo_no_cartao(p_cartao uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.mexo_no_quadro(k.quadro_id) from public.cartoes k where k.id = p_cartao), false)
$$;

create function private.gerencio_cartao(p_cartao uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.gerencio_quadro(k.quadro_id) from public.cartoes k where k.id = p_cartao), false)
$$;

revoke all on function private.meus_quadros(), private.vejo_quadro(uuid), private.mexo_no_quadro(uuid),
  private.gerencio_quadro(uuid), private.mexo_no_cartao(uuid), private.gerencio_cartao(uuid) from public, anon;
grant execute on function private.meus_quadros(), private.vejo_quadro(uuid), private.mexo_no_quadro(uuid),
  private.gerencio_quadro(uuid), private.mexo_no_cartao(uuid), private.gerencio_cartao(uuid) to authenticated;

-- ── Apoio ────────────────────────────────────────────────────────────────────

-- Texto puro do documento do editor, para a busca: os pedaços de texto de cada bloco (parágrafo, título, item...) juntos
-- (um trecho em negrito no meio da palavra não a parte), os blocos separados por espaço, quebra de linha vira espaço,
-- espaços repetidos viram um; até 20.000 caracteres. Imagens e links não entram (só o texto).
create function private.texto_da_descricao(p_descricao jsonb) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(string_agg(b.texto, ' ' order by n.o), '\s+', ' ', 'g')), 20000), '')
  from jsonb_path_query(p_descricao, 'strict $.** ? (@.content.type() == "array")') with ordinality as n(no, o)
  cross join lateral (
    select string_agg(case f ->> 'type' when 'text' then f ->> 'text' when 'hardBreak' then ' ' end, '' order by fo) as texto
    from jsonb_array_elements(n.no -> 'content') with ordinality as x(f, fo)
  ) b
  where b.texto is not null
$$;

-- Filtros da tela: prioridade (baixa, media, alta), responsável ('sem' ou o id de uma pessoa) e prazo (atrasados,
-- proximos_7_dias, sem_prazo); nulo = sem filtro. Outro valor: filtro_invalido. Devolve o id do responsável filtrado.
create function private.conferir_filtros_do_quadro(p_prioridade text, p_responsavel text, p_prazo text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  if (p_prioridade is not null and p_prioridade not in ('baixa', 'media', 'alta'))
     or (p_prazo is not null and p_prazo not in ('atrasados', 'proximos_7_dias', 'sem_prazo'))
     or (p_responsavel is not null and p_responsavel <> 'sem'
         and p_responsavel !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then
    raise exception 'filtro_invalido' using errcode = '22023';
  end if;
  return case when p_responsavel <> 'sem' then p_responsavel::uuid end;
end $$;

revoke all on function private.texto_da_descricao(jsonb), private.conferir_filtros_do_quadro(text, text, text)
  from public, anon, authenticated;

-- ── Gatilhos ─────────────────────────────────────────────────────────────────

-- Coluna nova: vai para o fim do quadro (o quadro fica travado: duas colunas criadas juntas não ganham a mesma posição).
-- No máximo 50 colunas por quadro.
create function private.preparar_coluna() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.quadros q where q.id = new.quadro_id for no key update;
  if (select count(*) from public.quadro_colunas c where c.quadro_id = new.quadro_id) >= 50 then
    raise exception 'colunas_demais' using errcode = 'P0001';
  end if;
  if new.posicao is null then
    select coalesce(max(c.posicao), 0) + 1024 into new.posicao from public.quadro_colunas c where c.quadro_id = new.quadro_id;
  end if;
  return new;
end $$;

create trigger quadro_colunas_preparar
  before insert on public.quadro_colunas
  for each row execute function private.preparar_coluna();

-- Cartão, antes de gravar:
-- - novo: o quadro vem da coluna (o que vier do app é trocado); vai para o fim da coluna (que fica travada: dois cartões
--   novos juntos não ganham a mesma posição); o autor é quem está logado;
-- - atualizado_em muda quando muda o conteúdo, a coluna ou o arquivamento (não quando só a posição muda);
-- - arquivar grava a hora do banco; a data de quem já está arquivado não muda;
-- - descricao_texto sai da descrição.
-- O app não grava quadro, posição, autor, datas nem descricao_texto (as permissões por coluna, abaixo).
create function private.preparar_cartao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
begin
  if tg_op = 'INSERT' then
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
    return new;
  end if;

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
  return new;
end $$;

create trigger cartoes_preparar
  before insert or update on public.cartoes
  for each row execute function private.preparar_cartao();

-- Responsável: alguém que enxerga o cliente hoje, ativo: o consultor do cliente, ou o administrador ou um gestor da
-- consultoria do quadro (com o cliente nela). Quem deixou de enxergar continua nos cartões em que já estava.
create function private.validar_responsavel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
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

create trigger cartao_responsaveis_validar
  before insert or update on public.cartao_responsaveis
  for each row execute function private.validar_responsavel();

-- Item novo do checklist: vai para o fim (o cartão fica travado durante a conta). No máximo 200 itens por cartão.
create function private.preparar_item_do_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.cartoes k where k.id = new.cartao_id for no key update;
  if (select count(*) from public.cartao_checklist l where l.cartao_id = new.cartao_id) >= 200 then
    raise exception 'checklist_cheio' using errcode = 'P0001';
  end if;
  if new.posicao is null then
    select coalesce(max(l.posicao), 0) + 1024 into new.posicao from public.cartao_checklist l where l.cartao_id = new.cartao_id;
  end if;
  return new;
end $$;

create trigger cartao_checklist_preparar
  before insert on public.cartao_checklist
  for each row execute function private.preparar_item_do_checklist();

-- Comentário: o autor é quem está logado e a data é a do banco; mudar o texto marca "editado".
create function private.preparar_comentario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.autor_id := coalesce((select auth.uid()), new.autor_id);
    new.editado_em := null;
  elsif new.texto is distinct from old.texto then
    new.editado_em := now();
  end if;
  return new;
end $$;

create trigger cartao_comentarios_preparar
  before insert or update on public.cartao_comentarios
  for each row execute function private.preparar_comentario();

revoke all on function private.preparar_coluna(), private.preparar_cartao(), private.validar_responsavel(),
  private.preparar_item_do_checklist(), private.preparar_comentario() from public;

-- ── Regras ───────────────────────────────────────────────────────────────────

-- Leitura: as chamadas das regras vão dentro de (select ...) para rodar uma vez por consulta e não uma vez por linha.
-- As tabelas filhas reaproveitam a regra dos cartões.
create policy "ver quadros" on public.quadros
  for select to authenticated
  using ((select private.sou_central()) or id in (select private.meus_quadros()));

create policy "ver colunas" on public.quadro_colunas
  for select to authenticated
  using ((select private.sou_central()) or quadro_id in (select private.meus_quadros()));

create policy "ver cartões" on public.cartoes
  for select to authenticated
  using ((select private.sou_central()) or quadro_id in (select private.meus_quadros()));

create policy "ver responsáveis" on public.cartao_responsaveis
  for select to authenticated
  using (exists (select 1 from public.cartoes k where k.id = cartao_responsaveis.cartao_id));

create policy "ver checklist" on public.cartao_checklist
  for select to authenticated
  using (exists (select 1 from public.cartoes k where k.id = cartao_checklist.cartao_id));

create policy "ver comentários" on public.cartao_comentarios
  for select to authenticated
  using (exists (select 1 from public.cartoes k where k.id = cartao_comentarios.cartao_id));

-- Colunas: quem mexe cria e edita (nome, cor, concluídos). Ordem por mover_coluna; apagar por apagar_coluna.
create policy "criar coluna" on public.quadro_colunas
  for insert to authenticated
  with check (private.mexo_no_quadro(quadro_id));

create policy "editar coluna" on public.quadro_colunas
  for update to authenticated
  using (private.mexo_no_quadro(quadro_id))
  with check (private.mexo_no_quadro(quadro_id));

-- Cartões: quem mexe cria, edita, arquiva e restaura; apaga quem criou ou a gestão. Mover por mover_cartao.
create policy "criar cartão" on public.cartoes
  for insert to authenticated
  with check (private.mexo_no_quadro(quadro_id));

create policy "editar cartão" on public.cartoes
  for update to authenticated
  using (private.mexo_no_quadro(quadro_id))
  with check (private.mexo_no_quadro(quadro_id));

create policy "apagar cartão" on public.cartoes
  for delete to authenticated
  using (private.mexo_no_quadro(quadro_id)
    and (criado_por = (select auth.uid()) or private.gerencio_quadro(quadro_id)));

-- Responsáveis e checklist: quem mexe no quadro do cartão.
create policy "pôr responsável" on public.cartao_responsaveis
  for insert to authenticated
  with check (private.mexo_no_cartao(cartao_id));

create policy "tirar responsável" on public.cartao_responsaveis
  for delete to authenticated
  using (private.mexo_no_cartao(cartao_id));

create policy "criar item" on public.cartao_checklist
  for insert to authenticated
  with check (private.mexo_no_cartao(cartao_id));

create policy "editar item" on public.cartao_checklist
  for update to authenticated
  using (private.mexo_no_cartao(cartao_id))
  with check (private.mexo_no_cartao(cartao_id));

create policy "apagar item" on public.cartao_checklist
  for delete to authenticated
  using (private.mexo_no_cartao(cartao_id));

-- Comentários: quem mexe comenta; edita só o próprio; apaga o próprio, e a gestão apaga qualquer um.
create policy "comentar" on public.cartao_comentarios
  for insert to authenticated
  with check (private.mexo_no_cartao(cartao_id));

create policy "editar o próprio comentário" on public.cartao_comentarios
  for update to authenticated
  using (autor_id = (select auth.uid()) and private.mexo_no_cartao(cartao_id))
  with check (autor_id = (select auth.uid()) and private.mexo_no_cartao(cartao_id));

create policy "apagar comentário" on public.cartao_comentarios
  for delete to authenticated
  using (private.mexo_no_cartao(cartao_id)
    and (autor_id = (select auth.uid()) or private.gerencio_cartao(cartao_id)));

-- ── Abrir o quadro ───────────────────────────────────────────────────────────

-- O quadro do cliente na consultoria que o atende hoje: { id, cliente_id, consultoria_id, criado_em, pode_mexer,
-- pode_gerir, colunas: [{ id, nome, cor, concluidos, posicao, cartoes, arquivados }] } (colunas em ordem; cartoes e
-- arquivados = quantos cartões não arquivados e arquivados a coluna tem). Na primeira vez, quem mexe (consultor do
-- cliente, administrador ou gestor da consultoria, com o cliente ativo) cria o quadro com "A fazer", "Em andamento" e
-- "Concluído" (de concluídos); quem só lê (central, dono, cliente arquivado) recebe o quadro que existe ou nulo. Quem não
-- vê o cliente, ou cliente sem consultoria: nulo (nada diz que o quadro existe). Sessão não liberada: sem_permissao.
create function public.quadro_do_cliente(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente record;
  v_quadro uuid;
  v_mexo boolean;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select c.id, c.consultoria_id, c.consultor_id, c.arquivado into v_cliente
  from public.clientes c where c.id = p_cliente;
  if v_cliente.id is null or v_cliente.consultoria_id is null
     or not private.vejo_cliente(v_cliente.consultoria_id, v_cliente.consultor_id) then
    return null;
  end if;

  select q.id into v_quadro from public.quadros q
  where q.cliente_id = p_cliente and q.consultoria_id = v_cliente.consultoria_id;

  if v_quadro is null then
    v_mexo := not v_cliente.arquivado
      and v_cliente.consultoria_id = private.consultoria_atual()
      and (private.gerencio_consultoria(v_cliente.consultoria_id) or v_cliente.consultor_id = (select auth.uid()));
    if not coalesce(v_mexo, false) then
      return null;
    end if;
    -- Duas pessoas abrindo juntas: a segunda espera a primeira e usa o quadro dela.
    insert into public.quadros (cliente_id, consultoria_id) values (p_cliente, v_cliente.consultoria_id)
    on conflict (cliente_id, consultoria_id) do nothing
    returning id into v_quadro;
    if v_quadro is null then
      select q.id into v_quadro from public.quadros q
      where q.cliente_id = p_cliente and q.consultoria_id = v_cliente.consultoria_id;
    else
      insert into public.quadro_colunas (quadro_id, nome, concluidos) values (v_quadro, 'A fazer', false);
      insert into public.quadro_colunas (quadro_id, nome, concluidos) values (v_quadro, 'Em andamento', false);
      insert into public.quadro_colunas (quadro_id, nome, concluidos) values (v_quadro, 'Concluído', true);
    end if;
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
    from public.quadros q where q.id = v_quadro
  );
end $$;

-- ── Leituras do quadro ───────────────────────────────────────────────────────

-- Uma página (50) dos cartões não arquivados de uma coluna, em ordem: { itens, total }. Cada item: { id, coluna_id,
-- titulo, resumo (o começo do texto da descrição), prioridade, prazo, posicao, criado_por, criado_em, atualizado_em,
-- autor: { id, nome }, responsaveis: [{ id, nome, foto, cor }], checklist: { total, feitos }, comentarios }, tudo numa
-- consulta (nada por cartão). Filtros (no banco, sobre os cartões da coluna, que o índice já trouxe): busca no título e
-- na descrição (sem acento), prioridade, responsável ('sem' ou o id) e prazo (atrasados e próximos 7 dias deixam de
-- fora a coluna de concluídos; o sétimo dia entra). "Hoje" é o dia em São Paulo. Quem não vê o quadro: sem_permissao;
-- coluna de outro quadro: coluna_invalida.
create function public.cartoes_do_quadro(
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
        'comentarios', (select count(*) from public.cartao_comentarios m where m.cartao_id = k.id)
      ) order by k.posicao, k.id)
      from pagina pg join public.cartoes k on k.id = pg.id
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Os 4 números do topo, com os mesmos filtros da página (menos a coluna): { cartoes, atrasados, vencem_em_7_dias,
-- sem_responsavel }. Só cartões não arquivados; atrasados e "vencem em 7 dias" (hoje até hoje + 7) deixam de fora as
-- colunas de concluídos. Contagem no banco, pelo índice dos cartões do quadro.
create function public.indicadores_do_quadro(
  p_quadro uuid, p_busca text default null, p_prioridade text default null,
  p_responsavel text default null, p_prazo text default null
) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_responsavel uuid := private.conferir_filtros_do_quadro(p_prioridade, p_responsavel, p_prazo);
  v_sem boolean := coalesce(p_responsavel = 'sem', false);
  v_padrao text := private.padrao_de_busca(p_busca);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_json jsonb;
begin
  if not private.vejo_quadro(p_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'cartoes', count(*),
    'atrasados', count(*) filter (where not x.concluidos and x.prazo < v_hoje),
    'vencem_em_7_dias', count(*) filter (where not x.concluidos and x.prazo between v_hoje and v_hoje + 7),
    'sem_responsavel', count(*) filter (where not x.tem_responsavel))
  into v_json
  from (
    select k.prazo, c.concluidos,
      exists (select 1 from public.cartao_responsaveis r where r.cartao_id = k.id) as tem_responsavel
    from public.cartoes k
    join public.quadro_colunas c on c.id = k.coluna_id
    where k.quadro_id = p_quadro
      and k.arquivado_em is null
      and (v_padrao is null or k.busca like v_padrao escape '\')
      and (p_prioridade is null or k.prioridade = p_prioridade)
      and (v_responsavel is null or exists (
        select 1 from public.cartao_responsaveis r where r.cartao_id = k.id and r.perfil_id = v_responsavel))
      and (not v_sem or not exists (select 1 from public.cartao_responsaveis r where r.cartao_id = k.id))
      and (p_prazo is null
        or (p_prazo = 'atrasados' and not c.concluidos and k.prazo < v_hoje)
        or (p_prazo = 'proximos_7_dias' and not c.concluidos and k.prazo between v_hoje and v_hoje + 7)
        or (p_prazo = 'sem_prazo' and k.prazo is null))
  ) x;

  return v_json;
end $$;

-- Arquivados do quadro, dos mais recentes aos mais antigos, 15 por página (a janela Arquivados é uma Tabela), com
-- busca no título e na descrição: { itens: [{ id, titulo, prioridade, prazo, arquivado_em, criado_em,
-- coluna: { id, nome } }], total }.
create function public.cartoes_arquivados(p_quadro uuid, p_busca text default null, p_pagina int default 1) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_padrao text := private.padrao_de_busca(p_busca);
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_total int;
  v_itens jsonb;
begin
  if not private.vejo_quadro(p_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with filtrados as materialized (
    select k.id, k.arquivado_em
    from public.cartoes k
    where k.quadro_id = p_quadro
      and k.arquivado_em is not null
      and (v_padrao is null or k.busca like v_padrao escape '\')
  ), pagina as (
    select f.id from filtrados f order by f.arquivado_em desc, f.id limit 15 offset (v_pagina - 1) * 15
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'titulo', k.titulo, 'prioridade', k.prioridade, 'prazo', k.prazo,
        'arquivado_em', k.arquivado_em, 'criado_em', k.criado_em,
        'coluna', jsonb_build_object('id', c.id, 'nome', c.nome)
      ) order by k.arquivado_em desc, k.id)
      from pagina pg
      join public.cartoes k on k.id = pg.id
      join public.quadro_colunas c on c.id = k.coluna_id
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Quem pode ser responsável nos cartões do quadro, para o seletor e o filtro: as pessoas ativas que enxergam o cliente
-- hoje (o consultor dele, o administrador e os gestores da consultoria do quadro), pelo nome (sem acento), até
-- p_limite (1 a 100): [{ id, nome, foto, cor }]. Quadro de um cliente que saiu da consultoria: lista vazia.
create function public.pessoas_do_quadro(p_quadro uuid, p_busca text default null, p_limite int default 50)
returns jsonb
language plpgsql stable security definer
set search_path = '' as $$
declare
  v_padrao text := private.padrao_de_busca(p_busca);
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100);
begin
  if not private.vejo_quadro(p_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'foto', l.foto, 'cor', l.cor) order by l.nome, l.id)
    from (
      select p.id, p.nome, p.foto, p.cor
      from public.quadros q
      join public.clientes c on c.id = q.cliente_id and c.consultoria_id = q.consultoria_id
      join public.perfis p on p.ativo
        and (p.id = c.consultor_id or (p.consultoria_id = q.consultoria_id and p.papel in ('admin', 'gestor')))
      where q.id = p_quadro
        and (v_padrao is null or p.nome_busca like v_padrao escape '\')
      order by p.nome, p.id
      limit v_limite
    ) l
  ), '[]'::jsonb);
end $$;

-- Um cartão inteiro, para a janela do cartão: os campos, a descrição (JSON), a coluna, quem criou, os responsáveis, o
-- checklist em ordem, quantos comentários, e o que quem pergunta pode fazer (pode_mexer, pode_apagar). Nulo quando o
-- cartão não existe ou a pessoa não vê o quadro.
create function public.cartao_do_quadro(p_cartao uuid) returns jsonb
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
    'pode_mexer', private.mexo_no_quadro(k.quadro_id),
    'pode_apagar', coalesce(private.mexo_no_quadro(k.quadro_id)
      and (k.criado_por = (select auth.uid()) or private.gerencio_quadro(k.quadro_id)), false))
  into v_json
  from public.cartoes k
  join public.quadro_colunas c on c.id = k.coluna_id
  where k.id = p_cartao;

  return v_json;
end $$;

-- Comentários do cartão, dos mais recentes aos mais antigos, p_limite por vez (1 a 100; padrão 30): { itens: [{ id,
-- texto, criado_em, editado_em, autor: { id, nome, foto, cor } }], ha_mais }. "Ver anteriores": p_antes = o id do mais
-- antigo já mostrado (comentário novo chegando não desloca a lista). Nulo quando a pessoa não vê o cartão.
create function public.comentarios_do_cartao(p_cartao uuid, p_antes uuid default null, p_limite int default 30)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_quadro uuid;
  v_limite int := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_antes_em timestamptz;
  v_itens jsonb;
  v_n int;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select k.quadro_id into v_quadro from public.cartoes k where k.id = p_cartao;
  if v_quadro is null or not private.vejo_quadro(v_quadro) then
    return null;
  end if;
  if p_antes is not null then
    select m.criado_em into v_antes_em from public.cartao_comentarios m where m.id = p_antes and m.cartao_id = p_cartao;
    if v_antes_em is null then
      return jsonb_build_object('itens', '[]'::jsonb, 'ha_mais', false);
    end if;
  end if;

  with lista as (
    select m.id, m.texto, m.criado_em, m.editado_em, m.autor_id
    from public.cartao_comentarios m
    where m.cartao_id = p_cartao
      and (p_antes is null or (m.criado_em, m.id) < (v_antes_em, p_antes))
    order by m.criado_em desc, m.id desc
    limit v_limite + 1
  ), numerada as (
    select l.*, row_number() over (order by l.criado_em desc, l.id desc) as rn from lista l
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'texto', n.texto, 'criado_em', n.criado_em, 'editado_em', n.editado_em,
      'autor', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto, 'cor', p.cor)
                from public.perfis p where p.id = n.autor_id)
    ) order by n.rn) filter (where n.rn <= v_limite), '[]'::jsonb),
    count(*)
  into v_itens, v_n
  from numerada n;

  return jsonb_build_object('itens', v_itens, 'ha_mais', v_n > v_limite);
end $$;

-- ── Mover e apagar ───────────────────────────────────────────────────────────

-- Põe o cartão na coluna p_coluna (do mesmo quadro), logo depois de p_antes, ou logo antes de p_depois quando p_antes é
-- nulo; sem os dois, no fim da coluna. A posição é o meio entre os vizinhos que estão no banco (o de cima é p_antes e o
-- de baixo é o cartão que vem logo depois dele, mesmo que a tela de quem arrastou esteja velha). Os arquivados da coluna
-- contam como vizinhos (eles voltam ao mesmo lugar ao restaurar). Quando o espaço entre os vizinhos fica menor que
-- 0,0001 (ou há empate), renumera a coluna de 1024 em 1024 e refaz a conta. A coluna de destino fica travada do começo
-- ao fim: dois movimentos para a mesma coluna esperam um pelo outro. Devolve { id, coluna_id, posicao, renumerou }
-- (renumerou: a tela recarrega a coluna). Erros: sem_permissao (quem não mexe, cliente arquivado), coluna_invalida
-- (coluna de outro quadro ou que sumiu), vizinho_invalido (vizinho fora da coluna, ou o próprio cartão),
-- cartao_arquivado.
create function public.mover_cartao(p_cartao uuid, p_coluna uuid, p_antes uuid default null, p_depois uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_arquivado timestamptz;
  v_baixo numeric;
  v_alto numeric;
  v_ancora numeric;
  v_posicao numeric;
  v_renumerou boolean := false;
begin
  select k.quadro_id into v_quadro from public.cartoes k where k.id = p_cartao;
  if v_quadro is null or not private.mexo_no_quadro(v_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform 1 from public.quadro_colunas c where c.id = p_coluna and c.quadro_id = v_quadro for no key update;
  if not found then
    raise exception 'coluna_invalida' using errcode = 'P0001';
  end if;
  select k.arquivado_em into v_arquivado from public.cartoes k where k.id = p_cartao for update;
  if not found then
    -- apagado enquanto esperava a coluna
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_arquivado is not null then
    raise exception 'cartao_arquivado' using errcode = 'P0001';
  end if;
  if p_antes = p_cartao or p_depois = p_cartao then
    raise exception 'vizinho_invalido' using errcode = 'P0001';
  end if;

  for v_volta in 1..2 loop
    v_baixo := null;
    v_alto := null;
    if p_antes is not null then
      select k.posicao into v_ancora from public.cartoes k where k.id = p_antes and k.coluna_id = p_coluna;
      if v_ancora is null then
        raise exception 'vizinho_invalido' using errcode = 'P0001';
      end if;
      v_baixo := v_ancora;
      select k.posicao into v_alto from public.cartoes k
      where k.coluna_id = p_coluna and k.id <> p_cartao and (k.posicao, k.id) > (v_ancora, p_antes)
      order by k.posicao, k.id limit 1;
    elsif p_depois is not null then
      select k.posicao into v_ancora from public.cartoes k where k.id = p_depois and k.coluna_id = p_coluna;
      if v_ancora is null then
        raise exception 'vizinho_invalido' using errcode = 'P0001';
      end if;
      v_alto := v_ancora;
      select k.posicao into v_baixo from public.cartoes k
      where k.coluna_id = p_coluna and k.id <> p_cartao and (k.posicao, k.id) < (v_ancora, p_depois)
      order by k.posicao desc, k.id desc limit 1;
    else
      select max(k.posicao) into v_baixo from public.cartoes k where k.coluna_id = p_coluna and k.id <> p_cartao;
    end if;

    exit when v_baixo is null or v_alto is null or v_alto - v_baixo >= 0.0001;

    -- Sem espaço: renumera os outros cartões da coluna (arquivados também), na ordem em que estão.
    update public.cartoes k set posicao = o.n * 1024
    from (
      select x.id, row_number() over (order by x.posicao, x.id) as n
      from public.cartoes x where x.coluna_id = p_coluna and x.id <> p_cartao
    ) o
    where k.id = o.id and k.coluna_id = p_coluna;
    v_renumerou := true;
  end loop;

  v_posicao := case
    when v_baixo is null and v_alto is null then 1024
    when v_baixo is null then v_alto - 1024
    when v_alto is null then v_baixo + 1024
    else round((v_baixo + v_alto) / 2, 6)
  end;
  update public.cartoes set coluna_id = p_coluna, posicao = v_posicao where id = p_cartao;

  return jsonb_build_object('id', p_cartao, 'coluna_id', p_coluna, 'posicao', v_posicao, 'renumerou', v_renumerou);
end $$;

-- Reordena as colunas do quadro, com a mesma conta de mover_cartao (o quadro fica travado): p_antes = a coluna que fica
-- à esquerda, p_depois = a que fica à direita; sem as duas, vai para o fim. Devolve { id, posicao, renumerou }.
create function public.mover_coluna(p_coluna uuid, p_antes uuid default null, p_depois uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_baixo numeric;
  v_alto numeric;
  v_ancora numeric;
  v_posicao numeric;
  v_renumerou boolean := false;
begin
  select c.quadro_id into v_quadro from public.quadro_colunas c where c.id = p_coluna;
  if v_quadro is null or not private.mexo_no_quadro(v_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform 1 from public.quadros q where q.id = v_quadro for no key update;
  if not exists (select 1 from public.quadro_colunas c where c.id = p_coluna) then
    -- apagada enquanto esperava o quadro
    raise exception 'coluna_invalida' using errcode = 'P0001';
  end if;
  if p_antes = p_coluna or p_depois = p_coluna then
    raise exception 'vizinho_invalido' using errcode = 'P0001';
  end if;

  for v_volta in 1..2 loop
    v_baixo := null;
    v_alto := null;
    if p_antes is not null then
      select c.posicao into v_ancora from public.quadro_colunas c where c.id = p_antes and c.quadro_id = v_quadro;
      if v_ancora is null then
        raise exception 'vizinho_invalido' using errcode = 'P0001';
      end if;
      v_baixo := v_ancora;
      select c.posicao into v_alto from public.quadro_colunas c
      where c.quadro_id = v_quadro and c.id <> p_coluna and (c.posicao, c.id) > (v_ancora, p_antes)
      order by c.posicao, c.id limit 1;
    elsif p_depois is not null then
      select c.posicao into v_ancora from public.quadro_colunas c where c.id = p_depois and c.quadro_id = v_quadro;
      if v_ancora is null then
        raise exception 'vizinho_invalido' using errcode = 'P0001';
      end if;
      v_alto := v_ancora;
      select c.posicao into v_baixo from public.quadro_colunas c
      where c.quadro_id = v_quadro and c.id <> p_coluna and (c.posicao, c.id) < (v_ancora, p_depois)
      order by c.posicao desc, c.id desc limit 1;
    else
      select max(c.posicao) into v_baixo from public.quadro_colunas c where c.quadro_id = v_quadro and c.id <> p_coluna;
    end if;

    exit when v_baixo is null or v_alto is null or v_alto - v_baixo >= 0.0001;

    update public.quadro_colunas c set posicao = o.n * 1024
    from (
      select x.id, row_number() over (order by x.posicao, x.id) as n
      from public.quadro_colunas x where x.quadro_id = v_quadro and x.id <> p_coluna
    ) o
    where c.id = o.id;
    v_renumerou := true;
  end loop;

  v_posicao := case
    when v_baixo is null and v_alto is null then 1024
    when v_baixo is null then v_alto - 1024
    when v_alto is null then v_baixo + 1024
    else round((v_baixo + v_alto) / 2, 6)
  end;
  update public.quadro_colunas set posicao = v_posicao where id = p_coluna;

  return jsonb_build_object('id', p_coluna, 'posicao', v_posicao, 'renumerou', v_renumerou);
end $$;

-- Apaga a coluna (só a gestão, com o cliente ativo). Coluna com cartões (arquivados também) precisa de uma escolha
-- explícita: p_destino (outra coluna do mesmo quadro: os cartões vão para o fim dela, na mesma ordem) ou
-- p_apagar_cartoes (os cartões somem junto, com checklist, comentários e responsáveis); sem nenhum dos dois:
-- coluna_com_cartoes. A última coluna do quadro não se apaga (ultima_coluna). Devolve { movidos, apagados,
-- ids_apagados } (os ids servem para o app tirar do Storage os anexos dos cartões apagados).
create function public.apagar_coluna(p_coluna uuid, p_destino uuid default null, p_apagar_cartoes boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_cartoes int;
  v_fim numeric;
  v_movidos int := 0;
  v_ids uuid[] := '{}';
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
    else
      raise exception 'coluna_com_cartoes' using errcode = 'P0001';
    end if;
  end if;

  delete from public.quadro_colunas where id = p_coluna;
  return jsonb_build_object('movidos', v_movidos, 'apagados', cardinality(v_ids), 'ids_apagados', to_jsonb(v_ids));
end $$;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.quadros, public.quadro_colunas, public.cartoes, public.cartao_responsaveis,
  public.cartao_checklist, public.cartao_comentarios from public, anon, authenticated;

grant select on public.quadros, public.quadro_colunas, public.cartoes, public.cartao_responsaveis,
  public.cartao_checklist, public.cartao_comentarios to authenticated;
grant insert (quadro_id, nome, cor, concluidos), update (nome, cor, concluidos) on public.quadro_colunas to authenticated;
grant insert (coluna_id, titulo, descricao, prioridade, prazo),
  update (titulo, descricao, prioridade, prazo, arquivado_em), delete on public.cartoes to authenticated;
grant insert (cartao_id, perfil_id), delete on public.cartao_responsaveis to authenticated;
grant insert (cartao_id, texto, feito), update (texto, feito), delete on public.cartao_checklist to authenticated;
grant insert (cartao_id, texto), update (texto), delete on public.cartao_comentarios to authenticated;

grant all on public.quadros, public.quadro_colunas, public.cartoes, public.cartao_responsaveis,
  public.cartao_checklist, public.cartao_comentarios to service_role;

revoke all on function public.quadro_do_cliente(uuid),
  public.cartoes_do_quadro(uuid, uuid, int, text, text, text, text),
  public.indicadores_do_quadro(uuid, text, text, text, text),
  public.cartoes_arquivados(uuid, text, int),
  public.pessoas_do_quadro(uuid, text, int),
  public.cartao_do_quadro(uuid),
  public.comentarios_do_cartao(uuid, uuid, int),
  public.mover_cartao(uuid, uuid, uuid, uuid),
  public.mover_coluna(uuid, uuid, uuid),
  public.apagar_coluna(uuid, uuid, boolean) from public, anon;
grant execute on function public.quadro_do_cliente(uuid),
  public.cartoes_do_quadro(uuid, uuid, int, text, text, text, text),
  public.indicadores_do_quadro(uuid, text, text, text, text),
  public.cartoes_arquivados(uuid, text, int),
  public.pessoas_do_quadro(uuid, text, int),
  public.cartao_do_quadro(uuid),
  public.comentarios_do_cartao(uuid, uuid, int),
  public.mover_cartao(uuid, uuid, uuid, uuid),
  public.mover_coluna(uuid, uuid, uuid),
  public.apagar_coluna(uuid, uuid, boolean) to authenticated;
