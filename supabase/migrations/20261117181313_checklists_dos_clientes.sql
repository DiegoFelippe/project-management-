-- Check-list do cliente e o novo check-in (desenho em docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md:
-- "Aplicar = copiar", "Marcar", "Quando alguém sai" e "O que muda no check-in de hoje"; plano em
-- docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 2). Cria tabelas, funções, regras e gatilhos e redefine
-- três leituras (modelos_da_lista, indicadores_de_modelos e historico_do_cliente). Nenhuma linha que já existe é
-- alterada ou apagada: cliente_eventos ganha uma coluna nula e três tipos novos.
--
-- - Aplicar copia o modelo para o cliente: etapas, tarefas (o prazo vira data: início + dias) e dependências. O check-list
--   nunca aponta para as tarefas do modelo (elas mudam de id a cada salvar_modelo), então editar, arquivar ou apagar o
--   modelo não mexe em quem já usa. A cópia só leva dependência para tarefa de posição menor (a ordem do modelo), e a
--   chave composta garante que as duas pontas são do mesmo check-list: nunca há ciclo nem seta para a frente.
-- - Um check-list ativo por cliente. Trocar encerra o ativo ('trocado') e começa outro do zero; tirar encerra sem pôr
--   outro ('tirado'); o cliente mudar de consultoria (ou voltar à Central, inclusive quando a consultoria é arquivada)
--   encerra o ativo ('cliente_movido'), na mesma transação. Encerrado vira histórico: nunca volta a ser ativo e nunca se
--   apaga (segura o cliente: cliente com check-list não se apaga, arquiva-se).
-- - Quem aplica, troca, tira e muda o início: a Central e o dono, e o administrador e o gestor da consultoria do
--   cliente, com o cliente ativo e numa consultoria. Quem marca e escreve a nota: só o consultor do cliente, com o
--   cliente ativo e o check-list ativo. Quem vê: a Central e o dono, todos; a gestão, os clientes da consultoria; o
--   consultor, os clientes dele (a regra de clientes). Uma consultoria nunca vê o check-list de outra.
-- - O que o consultor marca como feito com o check-in aberto neste cliente entra em checkin_tarefas (com o título
--   copiado, para o check-in contar a história mesmo para quem não vê mais o check-list); desmarcar com ele ainda aberto
--   tira de lá; depois do check-out o check-in não muda mais. Apagar o check-in não desmarca nada.
-- - Escrita nas tabelas novas só pelas funções do banco (security definer, search_path vazio, pelo liberado()).
-- - Travas, sempre na mesma ordem (o cliente, depois o check-list): aplicar trava o cliente (duas pessoas aplicando ao
--   mesmo tempo: a segunda espera e troca o da primeira) e o modelo (salvar_modelo e apagar esperam a cópia); marcar
--   trava o cliente só para ler (a troca de consultor espera, e quem deixou de ser o consultor deixa de marcar na hora) e
--   o check-list (marcar, trocar e tirar esperam um ao outro: marcar num check-list encerrado é recusado).

-- ── Tabelas ──────────────────────────────────────────────────────────────────

create table public.cliente_checklists (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete restrict,
  -- a consultoria do cliente ao aplicar
  consultoria_id uuid not null references public.consultorias on delete restrict,
  -- fica nulo se o modelo for apagado (o nome continua em modelo_nome)
  modelo_id uuid references public.modelos on delete set null,
  modelo_nome text not null check (char_length(btrim(modelo_nome)) between 1 and 80),
  inicio date not null,
  aplicado_por uuid references public.perfis on delete set null,
  aplicado_em timestamptz not null default now(),
  encerrado_em timestamptz,
  encerrado_por uuid references public.perfis on delete set null,
  motivo text check (motivo in ('trocado', 'tirado', 'cliente_movido')),
  -- contadores recontados a cada mudança (private.recontar_checklist), para o andamento não varrer tarefas
  tarefas smallint not null default 0 check (tarefas >= 0),
  feitas smallint not null default 0 check (feitas >= 0),
  obrigatorias smallint not null default 0 check (obrigatorias >= 0),
  obrigatorias_feitas smallint not null default 0 check (obrigatorias_feitas >= 0),
  -- a data mais cedo entre as tarefas não feitas
  proximo_vencimento date,
  modelo_busca text generated always as (private.sem_acento(modelo_nome)) stored,
  check ((encerrado_em is null) = (motivo is null))
);

-- No máximo um ativo por cliente (e o ativo do cliente sai por aqui).
create unique index cliente_checklists_um_ativo_idx on public.cliente_checklists (cliente_id) where encerrado_em is null;
-- O andamento da consultoria (ordem pelo próximo vencimento) e os números dela.
create index cliente_checklists_consultoria_idx on public.cliente_checklists (consultoria_id, proximo_vencimento)
  where encerrado_em is null;
-- "Clientes usando" um modelo (todos e por consultoria) e o gatilho que não deixa apagar modelo em uso.
create index cliente_checklists_modelo_idx on public.cliente_checklists (modelo_id, consultoria_id)
  where encerrado_em is null;
-- Os check-lists de um cliente (também a chave do cliente, restrict).
create index cliente_checklists_cliente_idx on public.cliente_checklists (cliente_id, aplicado_em desc);
create index cliente_checklists_busca_idx on public.cliente_checklists using gin (modelo_busca extensions.gin_trgm_ops);
-- Quem aplicou e quem encerrou (junção para o nome; apagar a pessoa deixa nulo).
create index cliente_checklists_aplicado_por_idx on public.cliente_checklists (aplicado_por);
create index cliente_checklists_encerrado_por_idx on public.cliente_checklists (encerrado_por)
  where encerrado_por is not null;

create table public.checklist_etapas (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.cliente_checklists on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  posicao smallint not null check (posicao >= 1),
  unique (checklist_id, posicao),
  -- alvo da chave das tarefas (check-list, etapa): a tarefa só fica numa etapa do check-list dela
  unique (checklist_id, id)
);

create table public.checklist_tarefas (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.cliente_checklists on delete cascade,
  etapa_id uuid not null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 80),
  descricao text check (char_length(descricao) <= 160),
  obrigatoria boolean not null default true,
  prazo_dias smallint not null check (prazo_dias between 0 and 365),
  vence_em date not null,
  -- ordem no check-list inteiro (1..n, seguindo as etapas), a do modelo
  posicao smallint not null check (posicao >= 1),
  estado text not null default 'a_fazer' check (estado in ('a_fazer', 'andamento', 'feita')),
  nota text check (char_length(nota) <= 500),
  feita_em timestamptz,
  feita_por uuid references public.perfis on delete set null,
  -- a tarefa do modelo de onde veio (só para referência: as do modelo mudam de id a cada salvar)
  origem uuid,
  unique (checklist_id, posicao),
  -- alvo da chave das dependências (check-list, tarefa)
  unique (checklist_id, id),
  foreign key (checklist_id, etapa_id) references public.checklist_etapas (checklist_id, id) on delete cascade,
  check ((estado = 'feita') = (feita_em is not null))
);

-- As não feitas por data (recontar e o próximo vencimento) e quem fez (apagar a pessoa deixa nulo).
create index checklist_tarefas_vencimento_idx on public.checklist_tarefas (checklist_id, vence_em) where estado <> 'feita';
create index checklist_tarefas_feita_por_idx on public.checklist_tarefas (feita_por);

-- tarefa_id depende de depende_de: as duas do mesmo check-list (pelas chaves compostas) e depende_de com posição menor
-- (aplicar_modelo só copia assim).
create table public.checklist_dependencias (
  checklist_id uuid not null,
  tarefa_id uuid not null,
  depende_de uuid not null,
  primary key (tarefa_id, depende_de),
  check (tarefa_id <> depende_de),
  foreign key (checklist_id, tarefa_id) references public.checklist_tarefas (checklist_id, id) on delete cascade,
  foreign key (checklist_id, depende_de) references public.checklist_tarefas (checklist_id, id) on delete cascade
);

create index checklist_dependencias_depende_de_idx on public.checklist_dependencias (depende_de);

-- O que foi marcado como feito em cada check-in (o título copiado).
create table public.checkin_tarefas (
  checkin_id uuid not null references public.checkins on delete cascade,
  tarefa_id uuid not null references public.checklist_tarefas on delete cascade,
  titulo text not null,
  marcada_em timestamptz not null default now(),
  primary key (checkin_id, tarefa_id)
);

create index checkin_tarefas_tarefa_idx on public.checkin_tarefas (tarefa_id);

alter table public.cliente_checklists enable row level security;
alter table public.checklist_etapas enable row level security;
alter table public.checklist_tarefas enable row level security;
alter table public.checklist_dependencias enable row level security;
alter table public.checkin_tarefas enable row level security;

-- Histórico: "Modelo de check-in aplicado: X", "trocado para X" e "tirado: X", com o check-list (o nome do modelo vem
-- dele, só para quem pode ver).
alter table public.cliente_eventos
  add column checklist_id uuid references public.cliente_checklists on delete set null,
  drop constraint cliente_eventos_tipo_check,
  add constraint cliente_eventos_tipo_check check (tipo in ('cadastrado', 'editado', 'enviado', 'movido', 'devolvido',
    'consultor_escolhido', 'consultor_trocado', 'consultor_removido', 'previsao_ajustada', 'arquivado', 'reativado',
    'reuniao_realizada', 'pasta_da_reuniao_criada', 'modelo_aplicado', 'modelo_trocado', 'modelo_tirado'));

create index cliente_eventos_checklist_idx on public.cliente_eventos (checklist_id) where checklist_id is not null;

-- ── Ajudantes ────────────────────────────────────────────────────────────────

-- "Hoje" é o dia em São Paulo; prazo em dias corridos.
create function private.hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- O início dos prazos vai de 2 anos atrás a 1 ano à frente.
create function private.inicio_valido(p_inicio date) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_inicio between (private.hoje() - interval '2 years')::date and (private.hoje() + interval '1 year')::date,
    false)
$$;

-- Vê o check-list: a Central e o dono, todos; os outros, os da consultoria em que o cliente está agora, quando veem o
-- cliente (a gestão, os da consultoria; o consultor, os clientes dele).
create function private.vejo_checklist(p_checklist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.cliente_checklists cl
    join public.clientes c on c.id = cl.cliente_id
    where cl.id = p_checklist
      and (private.sou_central()
        or (cl.consultoria_id = c.consultoria_id and private.vejo_cliente(c.consultoria_id, c.consultor_id)))
  ), false)
$$;

-- Aplica, troca, tira e muda o início: a Central e o dono, ou o administrador e o gestor da consultoria do cliente;
-- cliente ativo e numa consultoria.
create function private.gerencio_checklist_do_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.clientes c
    where c.id = p_cliente and not c.arquivado and c.consultoria_id is not null
      and (private.sou_central() or private.gerencio_consultoria(c.consultoria_id))
  ), false)
$$;

-- Marca e escreve a nota: sou o consultor do cliente (na consultoria em que ele está), o cliente está ativo e o
-- check-list é o ativo, da consultoria atual do cliente.
create function private.marco_no_checklist(p_checklist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.liberado() and exists (
    select 1 from public.cliente_checklists cl
    join public.clientes c on c.id = cl.cliente_id
    where cl.id = p_checklist
      and cl.encerrado_em is null
      and cl.consultoria_id = c.consultoria_id
      and not c.arquivado
      and c.consultor_id = (select auth.uid())
      and c.consultoria_id = private.consultoria_atual()
  ), false)
$$;

-- O nome do modelo de um check-list (o Histórico): só para a Central e para a consultoria do check-list.
create function private.nome_do_modelo_visivel(p_checklist uuid) returns text
language sql stable security definer set search_path = '' as $$
  select cl.modelo_nome from public.cliente_checklists cl
  where cl.id = p_checklist
    and (private.sou_central() or (private.liberado() and cl.consultoria_id = private.consultoria_atual()))
$$;

-- Recontar os contadores do check-list e o próximo vencimento (a data mais cedo entre as não feitas). Só as funções do
-- banco chamam (rodam como o dono das tabelas).
create function private.recontar_checklist(p_checklist uuid) returns void
language sql set search_path = '' as $$
  update public.cliente_checklists cl
  set tarefas = x.tarefas, feitas = x.feitas, obrigatorias = x.obrigatorias,
      obrigatorias_feitas = x.obrigatorias_feitas, proximo_vencimento = x.proximo
  from (
    select count(*) as tarefas,
      count(*) filter (where t.estado = 'feita') as feitas,
      count(*) filter (where t.obrigatoria) as obrigatorias,
      count(*) filter (where t.obrigatoria and t.estado = 'feita') as obrigatorias_feitas,
      min(t.vence_em) filter (where t.estado <> 'feita') as proximo
    from public.checklist_tarefas t
    where t.checklist_id = p_checklist
  ) x
  where cl.id = p_checklist
$$;

-- Para marcar e escrever a nota: confere quem pode e trava, na ordem de sempre (o cliente só para ler, depois o
-- check-list). Recusas: sem_permissao (não vê o check-list), so_o_consultor_marca, checklist_encerrado,
-- cliente_arquivado. Devolve o check-list e o cliente da tarefa.
create function private.travar_para_marcar(p_tarefa uuid, out o_checklist uuid, out o_cliente uuid)
language plpgsql set search_path = '' as $$
declare
  v_consultor uuid;
  v_consultoria uuid;
  v_arquivado boolean;
  v_encerrado timestamptz;
  v_do_checklist uuid;
begin
  select t.checklist_id, cl.cliente_id into o_checklist, o_cliente
  from public.checklist_tarefas t
  join public.cliente_checklists cl on cl.id = t.checklist_id
  where t.id = p_tarefa;
  if o_checklist is null or not private.vejo_checklist(o_checklist) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  select c.consultor_id, c.consultoria_id, c.arquivado into v_consultor, v_consultoria, v_arquivado
  from public.clientes c where c.id = o_cliente for share;
  select cl.encerrado_em, cl.consultoria_id into v_encerrado, v_do_checklist
  from public.cliente_checklists cl where cl.id = o_checklist for update;

  if v_consultor is distinct from (select auth.uid()) or v_consultoria is distinct from private.consultoria_atual()
     or not private.liberado() then
    raise exception 'so_o_consultor_marca' using errcode = 'P0001';
  end if;
  if v_encerrado is not null or v_do_checklist is distinct from v_consultoria then
    raise exception 'checklist_encerrado' using errcode = 'P0001';
  end if;
  if v_arquivado then
    raise exception 'cliente_arquivado' using errcode = 'P0001';
  end if;
end $$;

-- Para aplicar no cliente, mudar o início e tirar: quem pode (a Central e o dono, ou a gestão da consultoria do
-- cliente). Trava o cliente; com p_checklist, trava também o check-list e confere que ele ainda é o ativo. Recusas:
-- sem_permissao, checklist_encerrado, cliente_arquivado. Devolve a consultoria do cliente.
create function private.travar_para_gerenciar(p_cliente uuid, p_checklist uuid default null) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_consultoria uuid;
  v_arquivado boolean;
  v_encerrado timestamptz;
begin
  if not (private.sou_central() or exists (
    select 1 from public.clientes c where c.id = p_cliente and private.gerencio_consultoria(c.consultoria_id))) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select c.consultoria_id, c.arquivado into v_consultoria, v_arquivado
  from public.clientes c where c.id = p_cliente for update;
  -- o cliente pode ter mudado enquanto esperava a trava
  if not found or not (private.sou_central() or private.gerencio_consultoria(v_consultoria)) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_checklist is not null then
    select cl.encerrado_em into v_encerrado from public.cliente_checklists cl where cl.id = p_checklist for update;
    if v_encerrado is not null then
      raise exception 'checklist_encerrado' using errcode = 'P0001';
    end if;
  end if;
  if v_arquivado then
    raise exception 'cliente_arquivado' using errcode = 'P0001';
  end if;
  return v_consultoria;
end $$;

revoke all on function private.hoje(), private.inicio_valido(date), private.recontar_checklist(uuid),
  private.travar_para_marcar(uuid), private.travar_para_gerenciar(uuid, uuid) from public, anon, authenticated;
revoke all on function private.vejo_checklist(uuid), private.gerencio_checklist_do_cliente(uuid),
  private.marco_no_checklist(uuid), private.nome_do_modelo_visivel(uuid) from public, anon;
grant execute on function private.vejo_checklist(uuid), private.gerencio_checklist_do_cliente(uuid),
  private.marco_no_checklist(uuid), private.nome_do_modelo_visivel(uuid) to authenticated;

-- ── Gatilhos ─────────────────────────────────────────────────────────────────

-- O cliente mudou de consultoria (ou voltou à Central, inclusive quando a consultoria é arquivada): o check-list ativo
-- se encerra. A consultoria nova começa sem modelo; se o cliente voltar, o antigo não volta.
create function private.encerrar_checklist_do_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.cliente_checklists
  set encerrado_em = now(), encerrado_por = (select auth.uid()), motivo = 'cliente_movido'
  where cliente_id = new.id and encerrado_em is null;
  return null;
end $$;

create trigger clientes_encerrar_checklist
  after update of consultoria_id on public.clientes
  for each row
  when (old.consultoria_id is distinct from new.consultoria_id)
  execute function private.encerrar_checklist_do_cliente();

-- Modelo com check-list ativo não se apaga (arquiva-se). Olha todos os check-lists, não só os que quem apaga enxerga.
create function private.modelo_em_uso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.cliente_checklists cl where cl.modelo_id = old.id and cl.encerrado_em is null) then
    raise exception 'modelo_em_uso' using errcode = 'P0001';
  end if;
  return old;
end $$;

create trigger modelos_em_uso
  before delete on public.modelos
  for each row execute function private.modelo_em_uso();

revoke all on function private.encerrar_checklist_do_cliente(), private.modelo_em_uso() from public, anon, authenticated;

-- ── Regras (só leitura; escrever é pelas funções) ────────────────────────────

-- O check-list: quem vê o cliente (a regra de clientes roda na subconsulta) e o check-list é da consultoria em que o
-- cliente está; a Central vê todos.
create policy "ver check-lists" on public.cliente_checklists
  for select to authenticated
  using ((select private.sou_central())
    or exists (select 1 from public.clientes c
      where c.id = cliente_checklists.cliente_id and c.consultoria_id = cliente_checklists.consultoria_id));

-- Etapas, tarefas e dependências: a regra do check-list (a subconsulta passa por ela).
create policy "ver etapas do check-list" on public.checklist_etapas
  for select to authenticated
  using (exists (select 1 from public.cliente_checklists cl where cl.id = checklist_etapas.checklist_id));

create policy "ver tarefas do check-list" on public.checklist_tarefas
  for select to authenticated
  using (exists (select 1 from public.cliente_checklists cl where cl.id = checklist_tarefas.checklist_id));

create policy "ver dependências do check-list" on public.checklist_dependencias
  for select to authenticated
  using (exists (select 1 from public.cliente_checklists cl where cl.id = checklist_dependencias.checklist_id));

-- As tarefas de um check-in: quem vê o check-in (a regra "ver check-ins conforme o papel" roda na subconsulta: a
-- Central, a gestão da consultoria do check-in e o próprio consultor, mesmo depois de mudar de consultoria).
create policy "ver tarefas do check-in" on public.checkin_tarefas
  for select to authenticated
  using (exists (select 1 from public.checkins k where k.id = checkin_tarefas.checkin_id));

-- ── Aplicar, mudar o início, tirar ───────────────────────────────────────────

-- Os modelos que dá para aplicar no cliente: os não arquivados que a consultoria dele vê (os dela e os da Central para
-- todas e para ela), com busca no nome e na descrição (sem acento), os do tipo de consultoria do consultor do cliente
-- primeiro, depois por nome; até p_limite (1 a 50). { itens: [{ id, nome, tipo, da_central, etapas, tarefas,
-- obrigatorias, maior_prazo, do_tipo_do_consultor }], total }. Quem não aplica no cliente: sem_permissao.
create function public.modelos_para_aplicar(p_cliente uuid, p_busca text default null, p_limite int default 20)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_consultoria uuid;
  v_tipos text[];
  v_padrao text := private.padrao_de_busca(p_busca);
  v_limite int := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_total int;
  v_itens jsonb;
begin
  if not private.gerencio_checklist_do_cliente(p_cliente) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select c.consultoria_id, coalesce(p.tipos_de_consultoria, '{}') into v_consultoria, v_tipos
  from public.clientes c left join public.perfis p on p.id = c.consultor_id
  where c.id = p_cliente;

  with filtrados as materialized (
    select m.id, m.nome, coalesce(m.tipo = any (v_tipos), false) as do_tipo
    from public.modelos m
    where m.arquivado_em is null
      and (m.consultoria_id = v_consultoria or m.consultoria_id is null)
      and (v_padrao is null or m.busca like v_padrao escape '\')
  ), primeiros as (
    select f.id, f.do_tipo, row_number() over (order by f.do_tipo desc, f.nome, f.id) as ordem
    from filtrados f order by f.do_tipo desc, f.nome, f.id limit v_limite
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'da_central', m.da_central, 'etapas', m.etapas,
        'tarefas', m.tarefas, 'obrigatorias', m.obrigatorias, 'maior_prazo', m.maior_prazo,
        'do_tipo_do_consultor', p.do_tipo) order by p.ordem)
      from primeiros p join public.modelos m on m.id = p.id
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

-- Aplica (ou troca) o modelo no cliente e devolve o id do check-list novo. Trava o cliente e o modelo, encerra o ativo
-- ('trocado'), copia etapas, tarefas (vence_em = início + prazo) e dependências (só para tarefa anterior), reconta e
-- registra modelo_aplicado ou modelo_trocado no histórico. Recusas (P0001), nesta ordem: sem_permissao,
-- cliente_arquivado, cliente_sem_consultoria, inicio_invalido (nulo ou fora de 2 anos atrás a 1 ano à frente) e
-- modelo_indisponivel (não existe, arquivado ou não é para a consultoria do cliente). Qualquer recusa desfaz a chamada.
create function public.aplicar_modelo(p_cliente uuid, p_modelo uuid, p_inicio date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_consultoria uuid;
  v_modelo_nome text;
  v_anterior uuid;
  v_id uuid;
begin
  v_consultoria := private.travar_para_gerenciar(p_cliente);
  if v_consultoria is null then
    raise exception 'cliente_sem_consultoria' using errcode = 'P0001';
  end if;
  if not private.inicio_valido(p_inicio) then
    raise exception 'inicio_invalido' using errcode = 'P0001';
  end if;
  -- O modelo fica travado durante a cópia: salvar_modelo (que regrava tudo) e apagar esperam.
  select m.nome into v_modelo_nome
  from public.modelos m
  where m.id = p_modelo and m.arquivado_em is null and (m.consultoria_id is null or m.consultoria_id = v_consultoria)
  for share;
  if v_modelo_nome is null then
    raise exception 'modelo_indisponivel' using errcode = 'P0001';
  end if;

  update public.cliente_checklists
  set encerrado_em = now(), encerrado_por = v_eu, motivo = 'trocado'
  where cliente_id = p_cliente and encerrado_em is null
  returning id into v_anterior;

  insert into public.cliente_checklists (cliente_id, consultoria_id, modelo_id, modelo_nome, inicio, aplicado_por)
  values (p_cliente, v_consultoria, p_modelo, v_modelo_nome, p_inicio, v_eu)
  returning id into v_id;

  insert into public.checklist_etapas (checklist_id, nome, posicao)
  select v_id, e.nome, e.posicao from public.modelo_etapas e where e.modelo_id = p_modelo;

  insert into public.checklist_tarefas (checklist_id, etapa_id, titulo, descricao, obrigatoria, prazo_dias, vence_em,
    posicao, origem)
  select v_id, ce.id, t.titulo, t.descricao, t.obrigatoria, t.prazo_dias, p_inicio + t.prazo_dias, t.posicao, t.id
  from public.modelo_tarefas t
  join public.modelo_etapas e on e.id = t.etapa_id
  join public.checklist_etapas ce on ce.checklist_id = v_id and ce.posicao = e.posicao
  where t.modelo_id = p_modelo;

  -- Só dependência do mesmo modelo e para tarefa anterior: a ordem do check-list é a do modelo, e toda seta anda para
  -- trás (nunca há ciclo).
  insert into public.checklist_dependencias (checklist_id, tarefa_id, depende_de)
  select v_id, ct.id, cd.id
  from public.modelo_tarefas t
  join public.modelo_dependencias d on d.tarefa_id = t.id
  join public.modelo_tarefas dt on dt.id = d.depende_de and dt.modelo_id = p_modelo and dt.posicao < t.posicao
  join public.checklist_tarefas ct on ct.checklist_id = v_id and ct.posicao = t.posicao
  join public.checklist_tarefas cd on cd.checklist_id = v_id and cd.posicao = dt.posicao
  where t.modelo_id = p_modelo;

  perform private.recontar_checklist(v_id);

  insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor)
  values (p_cliente, case when v_anterior is null then 'modelo_aplicado' else 'modelo_trocado' end, v_id, v_eu);

  return v_id;
end $$;

-- Muda o início dos prazos: recalcula o vencimento de cada tarefa (início + prazo) sem mexer no que foi feito, e
-- reconta. Recusas: sem_permissao, checklist_encerrado, cliente_arquivado, inicio_invalido.
create function public.mudar_inicio_do_checklist(p_checklist uuid, p_inicio date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente uuid;
begin
  select cl.cliente_id into v_cliente from public.cliente_checklists cl where cl.id = p_checklist;
  if v_cliente is null or not private.vejo_checklist(p_checklist) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform private.travar_para_gerenciar(v_cliente, p_checklist);
  if not private.inicio_valido(p_inicio) then
    raise exception 'inicio_invalido' using errcode = 'P0001';
  end if;

  update public.cliente_checklists set inicio = p_inicio where id = p_checklist;
  update public.checklist_tarefas set vence_em = p_inicio + prazo_dias where checklist_id = p_checklist;
  perform private.recontar_checklist(p_checklist);
end $$;

-- Tira o modelo do cliente: o check-list se encerra ('tirado') e vira histórico, com o que foi feito; registra
-- modelo_tirado. Recusas: sem_permissao, checklist_encerrado, cliente_arquivado.
create function public.tirar_modelo(p_checklist uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cliente uuid;
begin
  select cl.cliente_id into v_cliente from public.cliente_checklists cl where cl.id = p_checklist;
  if v_cliente is null or not private.vejo_checklist(p_checklist) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  perform private.travar_para_gerenciar(v_cliente, p_checklist);

  update public.cliente_checklists
  set encerrado_em = now(), encerrado_por = (select auth.uid()), motivo = 'tirado'
  where id = p_checklist;
  insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor)
  values (v_cliente, 'modelo_tirado', p_checklist, (select auth.uid()));
end $$;

-- ── Ler ──────────────────────────────────────────────────────────────────────

-- A aba Check-ins do cliente numa leitura (a lista, o fluxograma, os números e a sessão; até 500 tarefas, o limite do
-- modelo): { pode_aplicar, pode_marcar, consultor: { id, nome } | null, checklist: null | { id, modelo_id, modelo_nome,
-- inicio, aplicado_em, aplicado_por: { nome } }, etapas: [{ id, nome, posicao, tarefas, feitas }], tarefas: [{ id,
-- etapa_id, posicao, titulo, descricao, obrigatoria, prazo_dias, vence_em, estado, nota, feita_em, feita_por: { nome } |
-- null, depende_de: [id], na_sessao }], resumo: { tarefas, feitas, obrigatorias, obrigatorias_feitas, vencem_7_dias,
-- atrasadas, proxima: { id, titulo, vence_em } | null }, sessao: null | { checkin_id, inicio, consultor: { nome },
-- tarefas: [{ tarefa_id, titulo }] }, ultimo_checkin: null | { inicio, fim, consultor: { nome } } }.
-- - Atrasada: não feita e venceu antes de hoje; vence em 7 dias: não feita, de hoje até daqui a 7 dias (as duas mesmo
--   bloqueadas). Próxima: a de data mais cedo entre as não feitas e não bloqueadas (todas as dependências feitas).
-- - A sessão é o check-in aberto neste cliente (do consultor dele), com o que foi marcado nela (pode ter tarefas de um
--   check-list trocado no meio da sessão); o último check-in é o fechado mais recente que quem lê enxerga.
-- - Nomes pela regra de private.nome_do_perfil_visivel. Quem não vê o cliente: nulo. Sessão não liberada: sem_permissao.
create function public.checklist_do_cliente(p_cliente uuid) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_central boolean;
  v_minha uuid;
  v_gestao uuid;
  v_consultoria uuid;
  v_consultor uuid;
  v_checklist uuid;
  v_checkin uuid;
  v_hoje date := private.hoje();
  v_json jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select c.consultoria_id, c.consultor_id into v_consultoria, v_consultor from public.clientes c where c.id = p_cliente;
  if not found or not private.vejo_cliente(v_consultoria, v_consultor) then
    return null;
  end if;
  v_central := private.sou_central();
  v_minha := private.consultoria_atual();
  v_gestao := case when private.gerencio_consultoria(v_minha) then v_minha end;

  select cl.id into v_checklist from public.cliente_checklists cl
  where cl.cliente_id = p_cliente and cl.encerrado_em is null and cl.consultoria_id = v_consultoria;
  select k.id into v_checkin from public.checkins k
  where k.cliente_id = p_cliente and k.fim is null
    and (v_central or k.consultoria_id = v_gestao or k.consultor_id = v_eu)
  order by k.inicio desc limit 1;

  with tarefas as materialized (
    select t.id, t.etapa_id, t.posicao, t.titulo, t.descricao, t.obrigatoria, t.prazo_dias, t.vence_em, t.estado,
      t.nota, t.feita_em, t.feita_por
    from public.checklist_tarefas t
    where t.checklist_id = v_checklist
  ), dependencias as (
    select d.tarefa_id, jsonb_agg(d.depende_de order by dt.posicao) as ids, bool_and(dt.estado = 'feita') as livres
    from tarefas t
    join public.checklist_dependencias d on d.tarefa_id = t.id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    group by d.tarefa_id
  ), na_sessao as (
    select ct.tarefa_id from public.checkin_tarefas ct where ct.checkin_id = v_checkin
  ), nomes as (
    select x.id, private.nome_do_perfil_visivel(x.id) as nome
    from (select distinct t.feita_por as id from tarefas t where t.feita_por is not null) x
  ), completas as (
    select t.*, coalesce(d.ids, '[]'::jsonb) as depende_de, coalesce(d.livres, true) as livre,
      s.tarefa_id is not null as na_sessao, n.nome as feita_por_nome
    from tarefas t
    left join dependencias d on d.tarefa_id = t.id
    left join na_sessao s on s.tarefa_id = t.id
    left join nomes n on n.id = t.feita_por
  )
  select jsonb_build_object(
    'pode_aplicar', private.gerencio_checklist_do_cliente(p_cliente),
    'pode_marcar', v_checklist is not null and private.marco_no_checklist(v_checklist),
    'consultor', case when v_consultor is not null then
      jsonb_build_object('id', v_consultor, 'nome', private.nome_do_perfil_visivel(v_consultor)) end,
    'checklist', (
      select jsonb_build_object('id', cl.id, 'modelo_id', cl.modelo_id, 'modelo_nome', cl.modelo_nome,
        'inicio', cl.inicio, 'aplicado_em', cl.aplicado_em,
        'aplicado_por', jsonb_build_object('nome', private.nome_do_perfil_visivel(cl.aplicado_por)))
      from public.cliente_checklists cl where cl.id = v_checklist),
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'posicao', e.posicao,
        'tarefas', coalesce(x.tarefas, 0), 'feitas', coalesce(x.feitas, 0)) order by e.posicao)
      from public.checklist_etapas e
      left join (select c.etapa_id, count(*) as tarefas, count(*) filter (where c.estado = 'feita') as feitas
        from completas c group by c.etapa_id) x on x.etapa_id = e.id
      where e.checklist_id = v_checklist), '[]'::jsonb),
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'etapa_id', c.etapa_id, 'posicao', c.posicao, 'titulo', c.titulo,
        'descricao', c.descricao, 'obrigatoria', c.obrigatoria, 'prazo_dias', c.prazo_dias, 'vence_em', c.vence_em,
        'estado', c.estado, 'nota', c.nota, 'feita_em', c.feita_em,
        'feita_por', case when c.feita_por is not null then jsonb_build_object('nome', c.feita_por_nome) end,
        'depende_de', c.depende_de, 'na_sessao', c.na_sessao) order by c.posicao)
      from completas c), '[]'::jsonb),
    'resumo', (
      select jsonb_build_object(
        'tarefas', count(*),
        'feitas', count(*) filter (where c.estado = 'feita'),
        'obrigatorias', count(*) filter (where c.obrigatoria),
        'obrigatorias_feitas', count(*) filter (where c.obrigatoria and c.estado = 'feita'),
        'vencem_7_dias', count(*) filter (where c.estado <> 'feita' and c.vence_em between v_hoje and v_hoje + 7),
        'atrasadas', count(*) filter (where c.estado <> 'feita' and c.vence_em < v_hoje),
        'proxima', (
          select jsonb_build_object('id', p.id, 'titulo', p.titulo, 'vence_em', p.vence_em)
          from completas p where p.estado <> 'feita' and p.livre
          order by p.vence_em, p.posicao limit 1))
      from completas c),
    'sessao', (
      select jsonb_build_object('checkin_id', k.id, 'inicio', k.inicio,
        'consultor', jsonb_build_object('nome', private.nome_do_perfil_visivel(k.consultor_id)),
        'tarefas', coalesce((
          select jsonb_agg(jsonb_build_object('tarefa_id', ct.tarefa_id, 'titulo', ct.titulo)
            order by ct.marcada_em, ct.titulo, ct.tarefa_id)
          from public.checkin_tarefas ct where ct.checkin_id = k.id), '[]'::jsonb))
      from public.checkins k where k.id = v_checkin),
    'ultimo_checkin', (
      select jsonb_build_object('inicio', k.inicio, 'fim', k.fim,
        'consultor', jsonb_build_object('nome', private.nome_do_perfil_visivel(k.consultor_id)))
      from public.checkins k
      where k.cliente_id = p_cliente and k.fim is not null
        and (v_central or k.consultoria_id = v_gestao or k.consultor_id = v_eu)
      order by k.inicio desc limit 1))
  into v_json;

  return v_json;
end $$;

-- ── Marcar ───────────────────────────────────────────────────────────────────

-- Muda a situação da tarefa: 'a_fazer' | 'andamento' | 'feita' e devolve { estado, feita_em, liberadas: [{ id, titulo
-- }], na_sessao }. Só o consultor do cliente, com o cliente e o check-list ativos. "Feita" e "em andamento" pedem as
-- dependências feitas (tarefa_bloqueada); voltar para a fazer pode sempre (as que dependem dela e já estão feitas
-- continuam feitas). Feita grava quem e quando; sair de feita limpa. Com o check-in aberto do consultor neste cliente,
-- a tarefa feita entra nele (com o título) e a que sai de feita sai dele; sem check-in aberto (ou aberto em outro
-- cliente) fica fora de uma sessão. liberadas: as que esperavam por esta e agora estão livres. Mesmo estado: nada muda.
-- Recusas: estado_invalido, sem_permissao, so_o_consultor_marca, checklist_encerrado, cliente_arquivado,
-- tarefa_bloqueada.
create function public.marcar_tarefa(p_tarefa uuid, p_estado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_checklist uuid;
  v_cliente uuid;
  v_antes text;
  v_titulo text;
  v_feita_em timestamptz;
  v_checkin uuid;
  v_liberadas jsonb := '[]';
begin
  if p_estado is null or p_estado not in ('a_fazer', 'andamento', 'feita') then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;
  select o_checklist, o_cliente into v_checklist, v_cliente from private.travar_para_marcar(p_tarefa);

  select t.estado, t.titulo, t.feita_em into v_antes, v_titulo, v_feita_em
  from public.checklist_tarefas t where t.id = p_tarefa;

  -- O check-in aberto do consultor neste cliente (travado: o check-out espera, e depois dele o check-in não muda mais).
  select k.id into v_checkin from public.checkins k
  where k.consultor_id = v_eu and k.cliente_id = v_cliente and k.fim is null
  for update;

  if v_antes is distinct from p_estado then
    if p_estado in ('feita', 'andamento') and exists (
      select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = p_tarefa and dt.estado <> 'feita') then
      raise exception 'tarefa_bloqueada' using errcode = 'P0001';
    end if;

    update public.checklist_tarefas
    set estado = p_estado,
        feita_em = case when p_estado = 'feita' then now() end,
        feita_por = case when p_estado = 'feita' then v_eu end
    where id = p_tarefa
    returning feita_em into v_feita_em;

    if v_checkin is not null then
      if p_estado = 'feita' then
        insert into public.checkin_tarefas (checkin_id, tarefa_id, titulo)
        values (v_checkin, p_tarefa, v_titulo)
        on conflict (checkin_id, tarefa_id) do nothing;
      elsif v_antes = 'feita' then
        delete from public.checkin_tarefas where checkin_id = v_checkin and tarefa_id = p_tarefa;
      end if;
    end if;

    if p_estado = 'feita' then
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo) order by t.posicao), '[]')
      into v_liberadas
      from public.checklist_dependencias d
      join public.checklist_tarefas t on t.id = d.tarefa_id
      where d.depende_de = p_tarefa and t.estado <> 'feita'
        and not exists (
          select 1 from public.checklist_dependencias d2
          join public.checklist_tarefas t2 on t2.id = d2.depende_de
          where d2.tarefa_id = t.id and t2.estado <> 'feita');
    end if;

    perform private.recontar_checklist(v_checklist);
  end if;

  return jsonb_build_object('estado', p_estado, 'feita_em', v_feita_em, 'liberadas', v_liberadas,
    'na_sessao', v_checkin is not null and exists (
      select 1 from public.checkin_tarefas ct where ct.checkin_id = v_checkin and ct.tarefa_id = p_tarefa));
end $$;

-- A nota da tarefa (até 500 letras; sem os espaços das pontas; em branco vira nula). Quem pode: o mesmo de marcar (a
-- tarefa bloqueada também recebe nota). Recusas: sem_permissao, so_o_consultor_marca, checklist_encerrado,
-- cliente_arquivado; nota grande demais, a regra da coluna (23514).
create function public.anotar_tarefa(p_tarefa uuid, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.travar_para_marcar(p_tarefa);
  update public.checklist_tarefas set nota = nullif(btrim(p_nota), '') where id = p_tarefa;
end $$;

-- ── Modelos: uso e "clientes usando" ─────────────────────────────────────────

-- Antes de apagar ou arquivar um modelo: { clientes, nomes } — clientes conta todos os check-lists ativos dele (é o que
-- impede apagar); nomes, até 5 clientes que quem chama vê (a Central, todos; a gestão, os da consultoria; o consultor,
-- os dele), em ordem de nome. Quem não vê o modelo: nulo. Sessão não liberada: sem_permissao.
create function public.uso_do_modelo(p_modelo uuid) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_central boolean;
  v_minha uuid;
  v_gestao boolean;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if not private.vejo_modelo(p_modelo) then
    return null;
  end if;
  v_central := private.sou_central();
  v_minha := private.consultoria_atual();
  v_gestao := not v_central and private.gerencio_consultoria(v_minha);

  return jsonb_build_object(
    'clientes', (select count(*) from public.cliente_checklists cl
      where cl.modelo_id = p_modelo and cl.encerrado_em is null),
    'nomes', coalesce((
      select jsonb_agg(x.nome order by x.nome, x.id)
      from (
        select c.id, c.nome
        from public.cliente_checklists cl
        join public.clientes c on c.id = cl.cliente_id
        where cl.modelo_id = p_modelo and cl.encerrado_em is null
          and (v_central
            or (v_gestao and cl.consultoria_id = v_minha)
            or (cl.consultoria_id = v_minha and c.consultor_id = v_eu))
        order by c.nome, c.id
        limit 5) x), '[]'::jsonb));
end $$;

-- modelos_da_lista (20261117170204_modelos_de_checkin.sql) passa a contar clientes_usando: os clientes com check-list
-- ativo do modelo, no recorte de quem vê (a Central, todos ou os da consultoria do filtro; a gestão, os da consultoria;
-- o consultor, os clientes dele), só para as 15 linhas da página. O resto é igual.
create or replace function public.modelos_da_lista(p_aba text default 'ativos', p_busca text default null,
  p_tipo text default null, p_consultoria uuid default null, p_pagina int default 1) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_central boolean;
  v_gestao boolean;
  v_minha uuid;
  v_consultoria uuid;
  v_todas boolean;
  v_arquivados boolean := coalesce(p_aba, 'ativos') = 'arquivados';
  v_padrao text := private.padrao_de_busca(p_busca);
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_so_os_meus boolean;
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
  v_so_os_meus := not v_central and not v_gestao;

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
        'maior_prazo', m.maior_prazo,
        'clientes_usando', (
          select count(*) from public.cliente_checklists cl
          where cl.modelo_id = m.id and cl.encerrado_em is null
            and (v_todas or cl.consultoria_id = v_consultoria)
            and (not v_so_os_meus or exists (
              select 1 from public.clientes cc where cc.id = cl.cliente_id and cc.consultor_id = v_eu))),
        'arquivado_em', m.arquivado_em,
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

-- indicadores_de_modelos (mesma migração) passa a contar clientes_usando: os clientes com check-list ativo no recorte
-- de quem vê (a Central, todos ou os da consultoria do filtro; a gestão, os da consultoria; o consultor, os clientes
-- dele). O resto é igual.
create or replace function public.indicadores_de_modelos(p_consultoria uuid default null) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_todas boolean;
  v_so_os_meus boolean := false;
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
    v_consultoria := p_consultoria;
  elsif private.liberado() then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
    v_so_os_meus := not private.gerencio_consultoria(v_consultoria);
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  v_todas := v_recorte = 'tudo' and v_consultoria is null;

  select jsonb_build_object(
    'recorte', v_recorte,
    'ativos', count(*),
    'da_central', count(*) filter (where m.da_central),
    'da_consultoria', count(*) filter (where not m.da_central),
    'clientes_usando', (
      select count(*) from public.cliente_checklists cl
      where cl.encerrado_em is null
        and (v_todas or cl.consultoria_id = v_consultoria)
        and (not v_so_os_meus or exists (
          select 1 from public.clientes c where c.id = cl.cliente_id and c.consultor_id = v_eu))))
  into v_resultado
  from public.modelos m
  where m.arquivado_em is null
    and (v_todas or m.consultoria_id = v_consultoria or m.consultoria_id is null);
  return v_resultado;
end $$;

-- ── Histórico do cliente com o nome do modelo ────────────────────────────────

-- historico_do_cliente (20261116190127_historico_por_periodo.sql) ganha a coluna modelo: o nome do modelo do check-list
-- do evento (aplicado, trocado para, tirado), só para a Central e para a consultoria do check-list. O resto é igual.
drop function public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz);

create function public.historico_do_cliente(p_cliente uuid, p_limite int default 15, p_deslocamento int default 0,
  p_de timestamptz default null, p_ate timestamptz default null)
returns table (id uuid, tipo text, em timestamptz, de_horas numeric, para_horas numeric,
  de_consultoria text, para_consultoria text, de_consultor text, para_consultor text, autor text, modelo text,
  total bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.tipo, e.em, e.de_horas, e.para_horas,
    private.nome_da_consultoria_visivel(e.de_consultoria),
    private.nome_da_consultoria_visivel(e.para_consultoria),
    private.nome_do_perfil_visivel(e.de_consultor),
    private.nome_do_perfil_visivel(e.para_consultor),
    private.nome_do_perfil_visivel(e.autor),
    private.nome_do_modelo_visivel(e.checklist_id),
    count(*) over ()
  from public.cliente_eventos e
  where e.cliente_id = p_cliente
    and (p_de is null or e.em >= p_de)
    and (p_ate is null or e.em < p_ate)
  order by e.em desc, e.id
  limit greatest(1, least(coalesce(p_limite, 15), 50))
  offset greatest(0, coalesce(p_deslocamento, 0))
$$;

-- ── Permissões da API ────────────────────────────────────────────────────────

revoke all on public.cliente_checklists, public.checklist_etapas, public.checklist_tarefas,
  public.checklist_dependencias, public.checkin_tarefas from public, anon, authenticated;
grant select on public.cliente_checklists, public.checklist_etapas, public.checklist_tarefas,
  public.checklist_dependencias, public.checkin_tarefas to authenticated;
grant all on public.cliente_checklists, public.checklist_etapas, public.checklist_tarefas,
  public.checklist_dependencias, public.checkin_tarefas to service_role;

revoke all on function public.modelos_para_aplicar(uuid, text, int), public.aplicar_modelo(uuid, uuid, date),
  public.mudar_inicio_do_checklist(uuid, date), public.tirar_modelo(uuid), public.checklist_do_cliente(uuid),
  public.marcar_tarefa(uuid, text), public.anotar_tarefa(uuid, text), public.uso_do_modelo(uuid),
  public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz) from public, anon;
grant execute on function public.modelos_para_aplicar(uuid, text, int), public.aplicar_modelo(uuid, uuid, date),
  public.mudar_inicio_do_checklist(uuid, date), public.tirar_modelo(uuid), public.checklist_do_cliente(uuid),
  public.marcar_tarefa(uuid, text), public.anotar_tarefa(uuid, text), public.uso_do_modelo(uuid),
  public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz) to authenticated;
