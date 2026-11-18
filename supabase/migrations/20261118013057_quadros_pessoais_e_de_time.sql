-- Quadros pessoais e de time (desenho em docs/superpowers/specs/2026-11-17-quadros-pessoais-e-de-time-design.md; plano
-- em docs/superpowers/plans/2026-11-17-quadros-pessoais-e-de-time.md, Task 1). A tabela quadros ganha um tipo de dono:
-- além do quadro do cliente (igual a hoje), o quadro pessoal (de uma pessoa, só ela vê) e o quadro do time (os membros e
-- o gestor do time mexem; o administrador da consultoria também). Colunas, cartões, checklist, comentários, anexos,
-- Storage e tempo real continuam pendurados em quadro_id e passam pelas mesmas regras, agora com um ramo por tipo.
-- Nenhuma linha que já existe é alterada ou apagada: os quadros de hoje viram tipo 'cliente' pelo padrão da coluna.
--
-- - quadros: tipo ('cliente' | 'pessoa' | 'time'), pessoa_id, time_id, nome (1 a 80, sem espaços nas pontas),
--   nome_busca (sem acento e sem maiúscula), arquivado_em (hora do banco) e criado_por. Exatamente um dono, o do tipo
--   (quadros_um_dono). O nome não se repete entre os abertos de cada dono (pessoa + consultoria; time). O quadro segura o
--   time e a pessoa (on delete restrict): time com quadro (aberto ou arquivado) não se apaga.
-- - Quem vê, mexe, gere e administra (renomear, arquivar, restaurar, apagar o quadro):
--     pessoal: a pessoa, enquanto está na consultoria em que o quadro nasceu (central e dono: consultoria nula);
--     do time: membros e gestor do time veem e mexem; o administrador da consultoria do time vê, mexe, gere e
--       administra; o gestor do time gere e administra;
--     cliente: igual a hoje (o ramo do cliente tem o mesmo texto); ninguém o administra.
--   Quadro arquivado: só para ler (ninguém mexe nem gere); quem administra continua administrando (restaura ou apaga).
-- - Leitura direta pela API: a central lê só os quadros do cliente (antes, "a central lê tudo"); o resto pela lista
--   private.meus_quadros(), que inclui os pessoais da própria central. Renomear e arquivar: update direto em nome e
--   arquivado_em, pela regra administro_quadro. Criar e apagar continuam sem permissão na tabela (Task 2: funções).
-- - Responsáveis: no pessoal, só a pessoa; no do time, os membros e o gestor do time, ativos.
-- - Storage (balde quadros, o mesmo): a pasta dos quadros pessoais e de time é quadro/<quadro>/ (anexo em
--   quadro/<quadro>/<cartão>/<uuid>-<nome>, imagem em quadro/<quadro>/<cartão>/imagens/<uuid>.<ext>); a do cliente
--   continua <cliente>/. As duas formas nunca se confundem (uma começa com um uuid, a outra com "quadro/"), e o caminho
--   precisa estar na pasta do quadro do cartão, na forma do tipo dele. A central só tira (e vê) sobras na forma do
--   cliente; quem administra o quadro tira as sobras da pasta dele enquanto ele existe.
-- - Tempo real: o mesmo canal "quadro:<id>" e a mesma regra. Avisos de acesso novos ({ tabela, operacao, acesso: true })
--   quando alguém entra ou sai do time, quando o gestor do time é trocado (em cada quadro do time) e quando o quadro é
--   renomeado, arquivado, restaurado ou apagado (no canal dele).
-- - quadro_por_id: nos quadros pessoais e de time, também tipo, nome, time { id, nome }, arquivado_em e
--   pode_administrar. No quadro do cliente devolve exatamente o mesmo de antes (o mesmo que quadro_do_cliente, que não
--   muda; quadros_da_central.test.sql confere os dois iguais).

-- ── A tabela ─────────────────────────────────────────────────────────────────

alter table public.quadros
  add column tipo text not null default 'cliente' constraint quadros_tipo_check check (tipo in ('cliente', 'pessoa', 'time')),
  add column pessoa_id uuid references public.perfis on delete restrict,
  add column time_id uuid references public.times on delete restrict,
  add column nome text constraint quadros_nome_check check (nome is null or char_length(btrim(nome)) between 1 and 80),
  add column arquivado_em timestamptz,
  add column criado_por uuid references public.perfis on delete set null,
  alter column cliente_id drop not null,
  alter column consultoria_id drop not null;

alter table public.quadros
  add column nome_busca text generated always as (private.sem_acento(btrim(nome))) stored;

-- Exatamente um dono, o do tipo; nome só (e sempre) fora do cliente; o do cliente não se arquiva; consultoria sempre,
-- menos no pessoal da central e do dono.
alter table public.quadros add constraint quadros_um_dono check (
  num_nonnulls(cliente_id, pessoa_id, time_id) = 1
  and (tipo = 'cliente') = (cliente_id is not null)
  and (tipo = 'pessoa') = (pessoa_id is not null)
  and (tipo = 'time') = (time_id is not null)
  and (tipo = 'cliente') = (nome is null)
  and (tipo <> 'cliente' or arquivado_em is null)
  and (tipo = 'pessoa' or consultoria_id is not null)
);

-- O nome não se repete entre os abertos (sem acento e sem maiúscula: "Tarefas" e "tarefás" colidem): os pessoais por
-- pessoa e consultoria (a consultoria nula da central e do dono conta como igual), os do time por time. Arquivar libera.
create unique index quadros_nome_pessoal_unico on public.quadros (pessoa_id, consultoria_id, nome_busca) nulls not distinct
  where tipo = 'pessoa' and arquivado_em is null;
create unique index quadros_nome_do_time_unico on public.quadros (time_id, nome_busca)
  where tipo = 'time' and arquivado_em is null;

-- Um índice por caminho de leitura. Os de pessoa e time são parciais em "is not null" (as mesmas linhas de tipo =
-- 'pessoa' / 'time', pela regra de um dono só): assim servem também à conferência das chaves estrangeiras ao apagar uma
-- pessoa ou um time (o Postgres procura por pessoa_id = $1 e time_id = $1, sem saber o tipo).
create index quadros_pessoa_idx on public.quadros (pessoa_id, consultoria_id, arquivado_em) where pessoa_id is not null;
create index quadros_time_idx on public.quadros (time_id, arquivado_em) where time_id is not null;
-- Os quadros de time da consultoria (o administrador).
create index quadros_times_da_consultoria_idx on public.quadros (consultoria_id, arquivado_em) where tipo = 'time';
-- Busca pelo nome (sem acento) no seletor.
create index quadros_nome_busca_idx on public.quadros using gin (nome_busca extensions.gin_trgm_ops) where tipo <> 'cliente';
create index quadros_criado_por_idx on public.quadros (criado_por);

-- ── Ajudantes ────────────────────────────────────────────────────────────────

-- A pasta do quadro no balde: '<cliente_id>' no do cliente; 'quadro/<id>' nos outros. Nulo se o quadro não existe.
create function private.pasta_do_quadro(p_quadro uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when q.tipo = 'cliente' then q.cliente_id::text else 'quadro/' || q.id::text end
  from public.quadros q where q.id = p_quadro
$$;

-- O quadro de um caminho na forma quadro/<quadro>/...; nulo em qualquer outra forma (o uuid só é lido depois de a forma
-- ser conferida).
create function private.quadro_da_pasta(p_caminho text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when p_caminho ~ '^quadro/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
      then split_part(p_caminho, '/', 2)::uuid
  end
$$;

-- Os objetos do balde com o prefixo dado (terminado em '/'; sem a barra no fim, nenhum), pelo índice
-- (bucket_id, name collate "C"): de '<prefixo>' até '<prefixo sem a barra>0' ('0' vem logo depois de '/').
create function private.objetos_no_balde(p_prefixo text) returns setof text
language sql stable set search_path = '' as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'quadros'
    and right(p_prefixo, 1) = '/'
    and o.name collate "C" >= p_prefixo
    and o.name collate "C" < (left(p_prefixo, -1) || '0')
$$;

-- Está no time: membro ou gestor dele, na consultoria de quem pergunta, com a sessão liberada.
create function private.estou_no_time(p_time uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and exists (
      select 1
      from public.times t
      where t.id = p_time
        and t.consultoria_id = private.consultoria_atual()
        and (t.gestor_id = (select auth.uid())
             or exists (select 1 from public.time_membros m where m.time_id = t.id and m.pessoa_id = (select auth.uid())))
    ),
    false)
$$;

-- ── Quem vê, mexe, gere e administra ─────────────────────────────────────────
-- Mesmas assinaturas de 20261117112951_quadro.sql. O ramo do cliente é o mesmo texto; entra um ramo para os quadros
-- pessoais e de time. create or replace mantém os grants (repetidos no fim).

-- Mesmo corpo de 20261117112951_quadro.sql; muda só: os ramos dos quadros pessoais (os da pessoa, na consultoria de
-- agora) e de time (o administrador: os da consultoria; os outros: os dos times em que é membro ou gestor). Cada ramo
-- por índice. Um quadro pode vir duas vezes (gestor que também é membro): as regras usam "in".
create or replace function private.meus_quadros() returns setof uuid
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
  union all
  select q.id
  from public.quadros q
  where (select private.liberado())
    and q.pessoa_id = (select auth.uid())
    and q.tipo = 'pessoa'
    and q.consultoria_id is not distinct from (select private.consultoria_atual())
  union all
  select q.id
  from public.quadros q
  where (select private.papel_atual()) = 'admin'
    and (select private.liberado())
    and q.tipo = 'time'
    and q.consultoria_id = (select private.consultoria_atual())
  union all
  select q.id
  from public.time_membros m
  join public.times t on t.id = m.time_id
  join public.quadros q on q.time_id = t.id
  where (select private.papel_atual()) <> 'admin'
    and (select private.liberado())
    and m.pessoa_id = (select auth.uid())
    and t.consultoria_id = (select private.consultoria_atual())
  union all
  select q.id
  from public.times t
  join public.quadros q on q.time_id = t.id
  where (select private.papel_atual()) <> 'admin'
    and (select private.liberado())
    and t.gestor_id = (select auth.uid())
    and t.consultoria_id = (select private.consultoria_atual())
$$;

-- Mesmo corpo de 20261117112951_quadro.sql; muda só: o ramo dos quadros pessoais (a pessoa, na consultoria em que o
-- quadro nasceu) e de time (o administrador da consultoria do time, os membros e o gestor).
create or replace function private.vejo_quadro(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and (
      exists (
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
      )
      or exists (
        select 1
        from public.quadros q
        where q.id = p_quadro
          and ((q.tipo = 'pessoa'
                and q.pessoa_id = (select auth.uid())
                and q.consultoria_id is not distinct from private.consultoria_atual())
            or (q.tipo = 'time'
                and q.consultoria_id = private.consultoria_atual()
                and (private.papel_atual() = 'admin' or private.estou_no_time(q.time_id))))
      )
    ),
    false)
$$;

-- Mesmo corpo de 20261117112951_quadro.sql; muda só: o ramo dos quadros pessoais e de time (os mesmos que veem, com o
-- quadro aberto).
create or replace function private.mexo_no_quadro(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and (
      exists (
        select 1
        from public.quadros q
        join public.clientes c on c.id = q.cliente_id
        where q.id = p_quadro
          and not c.arquivado
          and q.consultoria_id = c.consultoria_id
          and q.consultoria_id = private.consultoria_atual()
          and (private.gerencio_consultoria(q.consultoria_id) or c.consultor_id = (select auth.uid()))
      )
      or exists (
        select 1
        from public.quadros q
        where q.id = p_quadro
          and q.arquivado_em is null
          and ((q.tipo = 'pessoa'
                and q.pessoa_id = (select auth.uid())
                and q.consultoria_id is not distinct from private.consultoria_atual())
            or (q.tipo = 'time'
                and q.consultoria_id = private.consultoria_atual()
                and (private.papel_atual() = 'admin' or private.estou_no_time(q.time_id))))
      )
    ),
    false)
$$;

-- Mesmo corpo de 20261117112951_quadro.sql; muda só: o ramo dos quadros pessoais (a pessoa) e de time (o
-- administrador da consultoria e o gestor do time), com o quadro aberto (arquivado: ninguém apaga coluna nem o que é
-- dos outros).
create or replace function private.gerencio_quadro(p_quadro uuid) returns boolean
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
    )
    or (private.liberado()
        and exists (
          select 1
          from public.quadros q
          where q.id = p_quadro
            and q.arquivado_em is null
            and ((q.tipo = 'pessoa'
                  and q.pessoa_id = (select auth.uid())
                  and q.consultoria_id is not distinct from private.consultoria_atual())
              or (q.tipo = 'time'
                  and q.consultoria_id = private.consultoria_atual()
                  and (private.papel_atual() = 'admin'
                       or exists (select 1 from public.times t where t.id = q.time_id and t.gestor_id = (select auth.uid())))))
        )),
    false)
$$;

-- Administra o quadro (renomear, arquivar, restaurar, apagar): no pessoal, a pessoa (na consultoria em que ele nasceu);
-- no do time, o administrador da consultoria e o gestor do time. Vale com o quadro arquivado. O do cliente: ninguém.
create function private.administro_quadro(p_quadro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and exists (
      select 1
      from public.quadros q
      where q.id = p_quadro
        and ((q.tipo = 'pessoa'
              and q.pessoa_id = (select auth.uid())
              and q.consultoria_id is not distinct from private.consultoria_atual())
          or (q.tipo = 'time'
              and q.consultoria_id = private.consultoria_atual()
              and (private.papel_atual() = 'admin'
                   or exists (select 1 from public.times t where t.id = q.time_id and t.gestor_id = (select auth.uid())))))
    ),
    false)
$$;

-- ── Regras ───────────────────────────────────────────────────────────────────
-- Mesmos nomes (o pgTAP do quadro confere): a central lê os quadros do cliente (antes, tudo); o resto pela lista.

alter policy "ver quadros" on public.quadros
  using (((select private.sou_central()) and tipo = 'cliente') or id in (select private.meus_quadros()));

alter policy "ver colunas" on public.quadro_colunas
  using (((select private.sou_central())
          and exists (select 1 from public.quadros q where q.id = quadro_colunas.quadro_id and q.tipo = 'cliente'))
    or quadro_id in (select private.meus_quadros()));

alter policy "ver cartões" on public.cartoes
  using (((select private.sou_central())
          and exists (select 1 from public.quadros q where q.id = cartoes.quadro_id and q.tipo = 'cliente'))
    or quadro_id in (select private.meus_quadros()));

-- Renomear, arquivar e restaurar: update direto em nome e arquivado_em, por quem administra.
create policy "renomear e arquivar quadro" on public.quadros
  for update to authenticated
  using (private.administro_quadro(id))
  with check (private.administro_quadro(id));

grant update (nome, arquivado_em) on public.quadros to authenticated;

-- ── O gatilho do quadro ──────────────────────────────────────────────────────

-- Antes de gravar: o nome sem os espaços das pontas; no insert, quem criou é quem está logado (o sistema pode mandar) e,
-- no do time, a consultoria é a do time (o que vier é trocado); arquivar grava a hora do banco e a data de quem já está
-- arquivado não muda.
create function private.preparar_quadro() returns trigger
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
  elsif old.arquivado_em is null and new.arquivado_em is not null then
    new.arquivado_em := now();
  elsif old.arquivado_em is not null and new.arquivado_em is not null then
    new.arquivado_em := old.arquivado_em;
  end if;
  return new;
end $$;

create trigger quadros_preparar
  before insert or update on public.quadros
  for each row execute function private.preparar_quadro();

-- ── Responsáveis ─────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: nos quadros pessoais, só a pessoa do quadro; nos de time,
-- os membros e o gestor do time (da consultoria do quadro); sempre ativos. Quem deixou de poder continua nos cartões em
-- que já estava.
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
  ) and not exists (
    select 1
    from public.cartoes k
    join public.quadros q on q.id = k.quadro_id
    join public.perfis p on p.id = new.perfil_id
    where k.id = new.cartao_id
      and p.ativo
      and ((q.tipo = 'pessoa' and p.id = q.pessoa_id)
        or (q.tipo = 'time'
            and p.consultoria_id = q.consultoria_id
            and (exists (select 1 from public.times t where t.id = q.time_id and t.gestor_id = p.id)
                 or exists (select 1 from public.time_membros m where m.time_id = q.time_id and m.pessoa_id = p.id))))
  ) then
    raise exception 'responsavel_invalido' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Mesmo corpo de 20261117112951_quadro.sql; muda só: as pessoas dos quadros pessoais (só a pessoa) e de time (os
-- membros e o gestor do time, da consultoria do quadro), ativas, com a mesma busca, ordem e limite.
create or replace function public.pessoas_do_quadro(p_quadro uuid, p_busca text default null, p_limite int default 50)
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
      select x.id, x.nome, x.foto, x.cor
      from (
        select p.id, p.nome, p.foto, p.cor
        from public.quadros q
        join public.clientes c on c.id = q.cliente_id and c.consultoria_id = q.consultoria_id
        join public.perfis p on p.ativo
          and (p.id = c.consultor_id or (p.consultoria_id = q.consultoria_id and p.papel in ('admin', 'gestor')))
        where q.id = p_quadro
          and (v_padrao is null or p.nome_busca like v_padrao escape '\')
        union all
        select p.id, p.nome, p.foto, p.cor
        from public.quadros q
        join public.perfis p on p.id = q.pessoa_id and p.ativo
        where q.id = p_quadro
          and q.tipo = 'pessoa'
          and (v_padrao is null or p.nome_busca like v_padrao escape '\')
        union all
        select p.id, p.nome, p.foto, p.cor
        from public.quadros q
        join public.times t on t.id = q.time_id
        cross join lateral (
          select t.gestor_id as id
          union
          select m.pessoa_id from public.time_membros m where m.time_id = t.id
        ) d
        join public.perfis p on p.id = d.id and p.ativo and p.consultoria_id = q.consultoria_id
        where q.id = p_quadro
          and q.tipo = 'time'
          and (v_padrao is null or p.nome_busca like v_padrao escape '\')
      ) x
      order by x.nome, x.id
      limit v_limite
    ) l
  ), '[]'::jsonb);
end $$;

-- ── Storage ──────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: cada forma também com a pasta quadro/<quadro>/ no lugar
-- da pasta do cliente ('anexo', 'imagem' ou nulo).
create or replace function private.caminho_do_quadro(p_caminho text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_caminho ~ ('^(quadro/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$') then 'anexo'
    when p_caminho ~ ('^(quadro/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/imagens/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|gif|webp)$') then 'imagem'
  end
$$;

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: na forma quadro/<quadro>/<cartão>/..., o cartão precisa
-- ser daquele quadro e o quadro não pode ser de cliente; na forma do cliente, como antes (o cliente do quadro do
-- cartão, que só existe no quadro do cliente).
create or replace function private.cartao_do_objeto(p_caminho text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cartao uuid;
begin
  if private.caminho_do_quadro(p_caminho) is null then
    return null;
  end if;
  if split_part(p_caminho, '/', 1) = 'quadro' then
    select k.id into v_cartao
    from public.cartoes k
    join public.quadros q on q.id = k.quadro_id
    where k.id = split_part(p_caminho, '/', 3)::uuid
      and q.id = split_part(p_caminho, '/', 2)::uuid
      and q.tipo <> 'cliente';
  else
    select k.id into v_cartao
    from public.cartoes k
    join public.quadros q on q.id = k.quadro_id
    where k.id = split_part(p_caminho, '/', 2)::uuid
      and q.cliente_id = split_part(p_caminho, '/', 1)::uuid;
  end if;
  return v_cartao;
end $$;

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: a central tira sobras só na forma do cliente (nunca em
-- quadro/...), e quem administra o quadro tira as sobras da pasta quadro/<quadro>/ enquanto ele existe.
create or replace function private.posso_tirar_objeto_do_quadro(p_caminho text, p_dono text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    private.liberado()
    and not private.objeto_do_quadro_em_uso(p_caminho)
    and ((private.sou_central() and split_part(p_caminho, '/', 1) <> 'quadro')
         or (p_dono = (select auth.uid())::text and private.mexo_no_cartao(private.cartao_do_objeto(p_caminho)))
         or exists (
           select 1 from private.quadro_objetos_apagados x
           where x.caminho = p_caminho
             and x.apagado_por = (select auth.uid())
             and x.apagado_em > now() - interval '1 day')
         or private.administro_quadro(private.quadro_da_pasta(p_caminho))),
    false)
$$;

-- A regra de forma do caminho do anexo (criada sem nome em 20261117125011_quadro_anexos.sql; o nome é lido do banco)
-- passa a aceitar as duas formas, sempre com o id do cartão no lugar dele.
do $$
declare
  v_nomes text[];
begin
  select array_agg(c.conname) into v_nomes
  from pg_constraint c
  where c.conrelid = 'public.cartao_anexos'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%caminho%';
  if coalesce(cardinality(v_nomes), 0) <> 1 then
    raise exception 'esperava uma regra de caminho em cartao_anexos, achei %', coalesce(cardinality(v_nomes), 0);
  end if;
  execute format('alter table public.cartao_anexos drop constraint %I', v_nomes[1]);
end $$;

alter table public.cartao_anexos add constraint cartao_anexos_caminho_check check (
  caminho ~ ('^(quadro/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || cartao_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$'));

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: a pasta das imagens da descrição é a do quadro
-- (pasta_do_quadro) em vez da do cliente.
create or replace function private.preparar_cartao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_pasta text;
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
    v_pasta := private.pasta_do_quadro(new.quadro_id);
    v_erro := private.erro_na_descricao(new.descricao, v_pasta || '/' || new.id::text || '/');
    if v_erro is not null then
      raise exception '%', v_erro using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: a pasta conferida é a do quadro do cartão
-- (pasta_do_quadro), na forma do tipo dele.
create or replace function private.preparar_anexo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pasta text;
begin
  if (select auth.uid()) is not null and not private.mexo_no_cartao(new.cartao_id) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  select private.pasta_do_quadro(k.quadro_id) into v_pasta
  from public.cartoes k
  where k.id = new.cartao_id;
  if v_pasta is null or left(new.caminho, length(v_pasta) + 1) is distinct from v_pasta || '/' then
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

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: os objetos de cada cartão apagado vêm da pasta do quadro
-- dele (pasta_do_quadro + objetos_no_balde).
create or replace function private.lembrar_objetos_dos_cartoes_apagados() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.quadro_objetos_apagados where apagado_em < now() - interval '1 day';
  if (select auth.uid()) is not null then
    insert into private.quadro_objetos_apagados (caminho, apagado_por)
    select o.caminho, (select auth.uid())
    from apagados k
    cross join lateral private.objetos_no_balde(private.pasta_do_quadro(k.quadro_id) || '/' || k.id::text || '/') o(caminho)
    on conflict (caminho) do update set apagado_por = excluded.apagado_por, apagado_em = excluded.apagado_em;
  end if;
  return null;
end $$;

-- Mesmo corpo de 20261117125011_quadro_anexos.sql; muda só: os caminhos devolvidos vêm da pasta do quadro do cartão.
create or replace function public.apagar_cartao(p_cartao uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_criado_por uuid;
  v_pasta text;
begin
  select k.quadro_id, k.criado_por, private.pasta_do_quadro(k.quadro_id) into v_quadro, v_criado_por, v_pasta
  from public.cartoes k
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
    select jsonb_agg(o.caminho order by o.caminho)
    from private.objetos_no_balde(v_pasta || '/' || p_cartao::text || '/') o(caminho)
  ), '[]'::jsonb));
end $$;

-- Mesmo corpo de 20261117180156_quadro_travas_em_ordem.sql; muda só: os caminhos dos cartões apagados junto vêm da
-- pasta do quadro (pasta_do_quadro + objetos_no_balde).
create or replace function public.apagar_coluna(p_coluna uuid, p_destino uuid default null, p_apagar_cartoes boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_pasta text;
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
  perform 1 from public.quadro_colunas c
  where c.id in (p_coluna, p_destino) and c.quadro_id = v_quadro
  order by c.id for no key update;
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
      v_pasta := private.pasta_do_quadro(v_quadro);
      select coalesce(jsonb_agg(o.caminho order by o.caminho), '[]'::jsonb) into v_caminhos
      from unnest(v_ids) i(id)
      cross join lateral private.objetos_no_balde(v_pasta || '/' || i.id::text || '/') o(caminho);
    else
      raise exception 'coluna_com_cartoes' using errcode = 'P0001';
    end if;
  end if;

  delete from public.quadro_colunas where id = p_coluna;
  return jsonb_build_object('movidos', v_movidos, 'apagados', cardinality(v_ids), 'ids_apagados', to_jsonb(v_ids),
    'caminhos', v_caminhos);
end $$;

-- ── Tempo real: avisos de acesso ─────────────────────────────────────────────

-- Alguém entrou ou saiu do time (time_membros, por comando) ou o gestor do time foi trocado (times, por linha): avisa
-- { tabela, operacao, acesso: true } no canal de cada quadro do time. A tela relê e entra de novo no canal (o servidor
-- confere outra vez, e quem saiu é recusado).
create function private.avisar_acesso_aos_quadros_do_time() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'times' then
    perform private.avisar_quadro(q.id, jsonb_build_object('tabela', 'times', 'operacao', 'update', 'acesso', true))
    from public.quadros q where q.time_id = new.id;
  elsif tg_op = 'INSERT' then
    perform private.avisar_quadro(q.id,
      jsonb_build_object('tabela', 'time_membros', 'operacao', 'insert', 'acesso', true))
    from public.quadros q where q.time_id in (select distinct n.time_id from novos n);
  else
    perform private.avisar_quadro(q.id,
      jsonb_build_object('tabela', 'time_membros', 'operacao', 'delete', 'acesso', true))
    from public.quadros q where q.time_id in (select distinct v.time_id from velhos v);
  end if;
  return null;
end $$;

-- O quadro foi renomeado, arquivado, restaurado ou apagado: o mesmo aviso no canal dele.
create function private.avisar_quadro_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.avisar_quadro(old.id, jsonb_build_object('tabela', 'quadros', 'operacao', 'delete', 'acesso', true));
  else
    perform private.avisar_quadro(new.id, jsonb_build_object('tabela', 'quadros', 'operacao', 'update', 'acesso', true));
  end if;
  return null;
end $$;

create trigger time_membros_avisar_quadros_insert after insert on public.time_membros
  referencing new table as novos for each statement execute function private.avisar_acesso_aos_quadros_do_time();
create trigger time_membros_avisar_quadros_delete after delete on public.time_membros
  referencing old table as velhos for each statement execute function private.avisar_acesso_aos_quadros_do_time();
create trigger times_avisar_quadros
  after update of gestor_id on public.times
  for each row
  when (old.gestor_id is distinct from new.gestor_id)
  execute function private.avisar_acesso_aos_quadros_do_time();

create trigger quadros_avisar_update
  after update of nome, arquivado_em on public.quadros
  for each row
  when (old.nome is distinct from new.nome or old.arquivado_em is distinct from new.arquivado_em)
  execute function private.avisar_quadro_mudou();
-- O quadro do cliente sai junto com o cliente (sem cartões), como antes: sem aviso novo.
create trigger quadros_avisar_delete
  after delete on public.quadros
  for each row
  when (old.tipo <> 'cliente')
  execute function private.avisar_quadro_mudou();

-- ── Um quadro pelo id ────────────────────────────────────────────────────────

-- Mesmo corpo de 20261117153048_quadros_da_central.sql; muda só: nos quadros pessoais e de time, também { tipo, nome,
-- time: { id, nome } | null, arquivado_em, pode_administrar }. No quadro do cliente, o mesmo de antes (igual ao
-- quadro_do_cliente).
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
        'pode_administrar', private.administro_quadro(q.id)) end
    from public.quadros q where q.id = p_quadro
  );
end $$;

-- ── Permissões ───────────────────────────────────────────────────────────────

-- As regras rodam com o papel de quem pergunta (administro_quadro está na regra de update; estou_no_time, nas outras).
revoke all on function private.administro_quadro(uuid), private.estou_no_time(uuid) from public, anon;
grant execute on function private.administro_quadro(uuid), private.estou_no_time(uuid) to authenticated;

-- Só as funções do banco usam.
revoke all on function private.pasta_do_quadro(uuid), private.quadro_da_pasta(text), private.objetos_no_balde(text),
  private.preparar_quadro(), private.avisar_acesso_aos_quadros_do_time(), private.avisar_quadro_mudou()
  from public, anon, authenticated;

-- As redefinidas mantêm os grants (create or replace); repetidos aqui para ficar explícito.
revoke all on function private.meus_quadros(), private.vejo_quadro(uuid), private.mexo_no_quadro(uuid),
  private.gerencio_quadro(uuid), private.posso_tirar_objeto_do_quadro(text, text) from public, anon;
grant execute on function private.meus_quadros(), private.vejo_quadro(uuid), private.mexo_no_quadro(uuid),
  private.gerencio_quadro(uuid), private.posso_tirar_objeto_do_quadro(text, text) to authenticated;
revoke all on function private.caminho_do_quadro(text), private.cartao_do_objeto(text) from public, anon, authenticated;
revoke all on function private.preparar_cartao(), private.validar_responsavel(), private.preparar_anexo(),
  private.lembrar_objetos_dos_cartoes_apagados() from public;
revoke all on function public.pessoas_do_quadro(uuid, text, int), public.quadro_por_id(uuid), public.apagar_cartao(uuid),
  public.apagar_coluna(uuid, uuid, boolean) from public, anon;
grant execute on function public.pessoas_do_quadro(uuid, text, int), public.quadro_por_id(uuid), public.apagar_cartao(uuid),
  public.apagar_coluna(uuid, uuid, boolean) to authenticated;
