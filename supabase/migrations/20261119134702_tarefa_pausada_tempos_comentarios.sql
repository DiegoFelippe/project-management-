-- A linha da tarefa e o formulário Editar: Pausada com o tempo de cada tarefa, comentários, trocar o motivo do "não se
-- aplica" e o histórico curto da tarefa (desenho em docs/superpowers/specs/2026-11-17-modelos-de-checkin-design.md,
-- "Acréscimo de 18/11 (2)"; plano em docs/superpowers/plans/2026-11-17-modelos-de-checkin.md, Task 10).
--
-- - checklist_tarefas: estado novo 'pausada'. Pendente = a fazer, em andamento ou pausada, em todo lugar: atrasadas,
--   vencem em 7 dias, próximo vencimento, a próxima, a cadeia do "não se aplica", o índice das pendentes, o Andamento, os
--   números e a faixa Hoje do cliente.
-- - checklist_tarefa_tempos: os trechos de tempo de cada tarefa (quem e de quando a quando), no máximo um aberto por
--   tarefa. marcar_tarefa abre um trecho ao pôr "em andamento" e fecha o aberto em qualquer outra situação; o tempo da
--   tarefa é a soma dos trechos (o aberto, até agora). Pausar a que está em andamento pode sempre (uma dependência
--   reaberta no meio não prende o relógio); começar e pausar a partir de outra situação pedem as dependências, como hoje.
-- - trocar_motivo: o consultor do cliente troca o motivo de uma tarefa que não se aplica (o Editar); o Histórico ganha
--   "Motivo trocado" (tipo 'motivo_trocado', com a tarefa e o motivo novo). Substitui "reabrir e marcar de novo".
-- - "Tarefa reaberta" só quando a que não se aplica volta para a fazer (para feita ou em andamento não grava).
-- - checklist_comentarios: os comentários da tarefa. Leitura pela regra do check-list; escrita só pelas funções
--   (comentar_tarefa, editar_comentario, apagar_comentario): comentam o consultor do cliente e a gestão da consultoria
--   do cliente, com o cliente e o check-list ativos; cada um edita o seu; apaga o autor ou a gestão (como no Quadro). A
--   Central e o dono só leem.
-- - cliente_eventos.tarefa_id: a tarefa da linha do Histórico, para historico_da_tarefa (as últimas 10 linhas dela, os
--   trechos de tempo e o total). As linhas "não se aplica" de antes ganham a tarefa quando o título dela é único no
--   check-list, ou quando a tarefa foi fechada no mesmo instante da linha (é a que está como não se aplica agora).
-- - checklist_do_cliente: pode_comentar e, por tarefa, tempo_segundos, trecho_aberto_desde e comentarios (quantos).
--
-- Nenhuma linha é apagada. Mudam só as linhas de cliente_eventos que ganham a tarefa (coluna nova); as tarefas que
-- estão em andamento hoje ficam sem trecho aberto (o relógio começa no próximo Iniciar ou Retomar).

-- ── Tabelas ──────────────────────────────────────────────────────────────────

alter table public.checklist_tarefas
  drop constraint checklist_tarefas_estado_check,
  add constraint checklist_tarefas_estado_check
    check (estado in ('a_fazer', 'andamento', 'pausada', 'feita', 'nao_se_aplica'));

-- As pendentes por data: o índice de 20261118120040_tarefa_nao_se_aplica.sql, agora com as pausadas.
drop index public.checklist_tarefas_vencimento_idx;
create index checklist_tarefas_vencimento_idx on public.checklist_tarefas (checklist_id, vence_em, posicao)
  where estado in ('a_fazer', 'andamento', 'pausada');

create table public.checklist_tarefa_tempos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.checklist_tarefas on delete cascade,
  -- quem iniciou ou retomou (apagar a pessoa deixa nulo)
  pessoa_id uuid references public.perfis on delete set null,
  inicio timestamptz not null default now(),
  fim timestamptz,
  check (fim >= inicio)
);

-- No máximo um trecho aberto por tarefa (e o aberto sai por aqui).
create unique index checklist_tarefa_tempos_aberto_idx on public.checklist_tarefa_tempos (tarefa_id) where fim is null;
create index checklist_tarefa_tempos_tarefa_idx on public.checklist_tarefa_tempos (tarefa_id, inicio desc);
create index checklist_tarefa_tempos_pessoa_idx on public.checklist_tarefa_tempos (pessoa_id);

create table public.checklist_comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.checklist_tarefas on delete cascade,
  autor_id uuid references public.perfis on delete set null,
  texto text not null constraint checklist_comentarios_texto_check check (char_length(btrim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now(),
  editado_em timestamptz
);

create index checklist_comentarios_tarefa_idx on public.checklist_comentarios (tarefa_id, criado_em desc, id desc);
create index checklist_comentarios_autor_idx on public.checklist_comentarios (autor_id);

alter table public.checklist_tarefa_tempos enable row level security;
alter table public.checklist_comentarios enable row level security;

-- Os dois: quem vê a tarefa (a regra do check-list roda na subconsulta, como nas etapas e dependências).
create policy "ver tempos da tarefa" on public.checklist_tarefa_tempos
  for select to authenticated
  using (exists (select 1 from public.checklist_tarefas t where t.id = checklist_tarefa_tempos.tarefa_id));

create policy "ver comentários da tarefa" on public.checklist_comentarios
  for select to authenticated
  using (exists (select 1 from public.checklist_tarefas t where t.id = checklist_comentarios.tarefa_id));

revoke all on public.checklist_tarefa_tempos, public.checklist_comentarios from public, anon, authenticated;
grant select on public.checklist_tarefa_tempos, public.checklist_comentarios to authenticated;
grant all on public.checklist_tarefa_tempos, public.checklist_comentarios to service_role;

-- Histórico: "Motivo trocado" e a tarefa de cada linha do check-list.
alter table public.cliente_eventos
  add column tarefa_id uuid references public.checklist_tarefas on delete set null,
  drop constraint cliente_eventos_tipo_check,
  add constraint cliente_eventos_tipo_check check (tipo in ('cadastrado', 'editado', 'enviado', 'movido', 'devolvido',
    'consultor_escolhido', 'consultor_trocado', 'consultor_removido', 'previsao_ajustada', 'arquivado', 'reativado',
    'reuniao_realizada', 'pasta_da_reuniao_criada', 'modelo_aplicado', 'modelo_trocado', 'modelo_tirado',
    'tarefa_nao_se_aplica', 'tarefa_reaberta', 'motivo_trocado'));

create index cliente_eventos_tarefa_idx on public.cliente_eventos (tarefa_id, em desc) where tarefa_id is not null;

-- As linhas de antes (só tinham o título): a tarefa do mesmo check-list com esse título, quando ele é único ali, ou a
-- fechada no mesmo instante da linha. Título repetido sem essa marca fica sem tarefa (não dá para saber qual).
update public.cliente_eventos e
set tarefa_id = t.id
from public.checklist_tarefas t
where e.tipo in ('tarefa_nao_se_aplica', 'tarefa_reaberta') and e.tarefa_id is null
  and t.checklist_id = e.checklist_id and t.titulo = e.tarefa
  and (t.feita_em = e.em or not exists (
    select 1 from public.checklist_tarefas o
    where o.checklist_id = t.checklist_id and o.titulo = t.titulo and o.id <> t.id));

-- ── A cadeia e o recontar ────────────────────────────────────────────────────

-- Mesmo corpo de 20261118125931_nao_se_aplica_cadeia_e_reaberta.sql; muda só: pausada é pendente.
create or replace function private.nao_se_aplica_espera(p_tarefa uuid) returns boolean
language sql stable set search_path = '' as $$
  with recursive cadeia(id, estado) as (
    select dt.id, dt.estado
    from public.checklist_dependencias d
    join public.checklist_tarefas dt on dt.id = d.depende_de
    where d.tarefa_id = p_tarefa
    union
    select dt.id, dt.estado
    from cadeia c
    join public.checklist_dependencias d on d.tarefa_id = c.id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    where c.estado = 'nao_se_aplica'
  )
  select exists (select 1 from cadeia c where c.estado in ('a_fazer', 'andamento', 'pausada'))
$$;

revoke all on function private.nao_se_aplica_espera(uuid) from public, anon, authenticated;

-- Mesmo corpo de 20261118120040_tarefa_nao_se_aplica.sql; muda só: o próximo vencimento conta as pausadas.
create or replace function private.recontar_checklist(p_checklist uuid) returns void
language sql set search_path = '' as $$
  update public.cliente_checklists cl
  set tarefas = x.tarefas, feitas = x.feitas, nao_se_aplica = x.nao_se_aplica, obrigatorias = x.obrigatorias,
      obrigatorias_feitas = x.obrigatorias_feitas, proximo_vencimento = x.proximo
  from (
    select count(*) as tarefas,
      count(*) filter (where t.estado = 'feita') as feitas,
      count(*) filter (where t.estado = 'nao_se_aplica') as nao_se_aplica,
      count(*) filter (where t.obrigatoria) as obrigatorias,
      count(*) filter (where t.obrigatoria and t.estado = 'feita') as obrigatorias_feitas,
      min(t.vence_em) filter (where t.estado in ('a_fazer', 'andamento', 'pausada')) as proximo
    from public.checklist_tarefas t
    where t.checklist_id = p_checklist
  ) x
  where cl.id = p_checklist
$$;

revoke all on function private.recontar_checklist(uuid) from public, anon, authenticated;

-- ── Comentar: quem pode ──────────────────────────────────────────────────────

-- Comenta: o consultor do cliente (na consultoria em que ele está) ou a gestão da consultoria do cliente, com o cliente
-- ativo e o check-list ativo, da consultoria atual do cliente. A Central e o dono só leem.
create function private.comento_no_checklist(p_checklist uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.liberado() and exists (
    select 1 from public.cliente_checklists cl
    join public.clientes c on c.id = cl.cliente_id
    where cl.id = p_checklist
      and cl.encerrado_em is null
      and cl.consultoria_id = c.consultoria_id
      and not c.arquivado
      and (private.gerencio_consultoria(c.consultoria_id)
        or (c.consultor_id = (select auth.uid()) and c.consultoria_id = private.consultoria_atual()))
  ), false)
$$;

-- Para comentar, editar e apagar comentário: confere quem pode e trava na ordem de sempre (o cliente, depois o
-- check-list; só para ler: trocar e tirar o modelo esperam). Recusas: sem_permissao (não vê o check-list, ou não é o
-- consultor nem a gestão), checklist_encerrado, cliente_arquivado. Devolve o check-list e se quem chama é da gestão.
create function private.travar_para_comentar(p_tarefa uuid, out o_checklist uuid, out o_gestao boolean)
language plpgsql set search_path = '' as $$
declare
  v_cliente uuid;
  v_consultor uuid;
  v_consultoria uuid;
  v_arquivado boolean;
  v_encerrado timestamptz;
  v_do_checklist uuid;
begin
  select t.checklist_id, cl.cliente_id into o_checklist, v_cliente
  from public.checklist_tarefas t
  join public.cliente_checklists cl on cl.id = t.checklist_id
  where t.id = p_tarefa;
  if o_checklist is null or not private.vejo_checklist(o_checklist) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  select c.consultor_id, c.consultoria_id, c.arquivado into v_consultor, v_consultoria, v_arquivado
  from public.clientes c where c.id = v_cliente for share;
  select cl.encerrado_em, cl.consultoria_id into v_encerrado, v_do_checklist
  from public.cliente_checklists cl where cl.id = o_checklist for share;

  o_gestao := private.gerencio_consultoria(v_consultoria);
  if not (o_gestao or (private.liberado() and v_consultor = (select auth.uid())
      and v_consultoria = private.consultoria_atual())) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_encerrado is not null or v_do_checklist is distinct from v_consultoria then
    raise exception 'checklist_encerrado' using errcode = 'P0001';
  end if;
  if v_arquivado then
    raise exception 'cliente_arquivado' using errcode = 'P0001';
  end if;
end $$;

-- Um comentário como a tela recebe: { id, texto, criado_em, editado_em, autor: { nome, foto, cor }, pode_editar,
-- pode_apagar }. O nome pela regra de nome visível (foto e cor só com o nome); pode_editar: o autor, se ainda comenta;
-- pode_apagar: o autor ou a gestão, se ainda comentam.
create function private.comentario_json(p_comentario public.checklist_comentarios, p_comento boolean, p_gestao boolean)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', p_comentario.id, 'texto', p_comentario.texto, 'criado_em', p_comentario.criado_em,
    'editado_em', p_comentario.editado_em,
    'autor', jsonb_build_object('nome', x.nome, 'foto', case when x.nome is not null then p.foto end,
      'cor', case when x.nome is not null then p.cor end),
    'pode_editar', p_comento and p_comentario.autor_id = (select auth.uid()),
    'pode_apagar', p_comento and (p_gestao or p_comentario.autor_id = (select auth.uid())))
  from (select private.nome_do_perfil_visivel(p_comentario.autor_id) as nome) x
  left join public.perfis p on p.id = p_comentario.autor_id
$$;

revoke all on function private.travar_para_comentar(uuid), private.comentario_json(public.checklist_comentarios, boolean, boolean)
  from public, anon, authenticated;
revoke all on function private.comento_no_checklist(uuid) from public, anon;
grant execute on function private.comento_no_checklist(uuid) to authenticated;

-- ── Marcar ───────────────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118125931_nao_se_aplica_cadeia_e_reaberta.sql; muda só: (1) o estado 'pausada' (pendente; de em
-- andamento pode sempre; das outras situações pede as dependências, como em andamento); (2) os trechos de tempo: em
-- andamento abre um (se não há um aberto), qualquer outra situação fecha o aberto; (3) 'tarefa_reaberta' só quando a que
-- não se aplica volta para a fazer; (4) as linhas do Histórico levam a tarefa (tarefa_id); (5) devolve também
-- tempo_segundos (a soma dos trechos; o aberto, até agora) e trecho_aberto_desde. { estado, feita_em, liberadas: [{ id,
-- titulo }], na_sessao, tempo_segundos, trecho_aberto_desde }. Recusas: estado_invalido, motivo_obrigatorio,
-- sem_permissao, so_o_consultor_marca, checklist_encerrado, cliente_arquivado, tarefa_bloqueada, ja_nao_se_aplica; motivo
-- acima de 500 letras, a regra da coluna (23514). Mesma assinatura (create or replace mantém as permissões; repetidas).
create or replace function public.marcar_tarefa(p_tarefa uuid, p_estado text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_checklist uuid;
  v_cliente uuid;
  v_antes text;
  v_motivo_antes text;
  v_titulo text;
  v_feita_em timestamptz;
  v_checkin uuid;
  v_fecha boolean := p_estado in ('feita', 'nao_se_aplica');
  v_motivo text := case when p_estado = 'nao_se_aplica' then nullif(btrim(p_motivo), '') end;
  v_liberadas jsonb := '[]';
  v_tempo bigint;
  v_aberto timestamptz;
begin
  if p_estado is null or p_estado not in ('a_fazer', 'andamento', 'pausada', 'feita', 'nao_se_aplica') then
    raise exception 'estado_invalido' using errcode = 'P0001';
  end if;
  if p_estado = 'nao_se_aplica' and v_motivo is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  select o_checklist, o_cliente into v_checklist, v_cliente from private.travar_para_marcar(p_tarefa);

  select t.estado, t.motivo, t.titulo, t.feita_em into v_antes, v_motivo_antes, v_titulo, v_feita_em
  from public.checklist_tarefas t where t.id = p_tarefa;

  -- Já está como "não se aplica" com outro motivo (a tela estava velha): trocar o motivo é pelo trocar_motivo.
  if v_antes = 'nao_se_aplica' and p_estado = 'nao_se_aplica' and v_motivo is distinct from v_motivo_antes then
    raise exception 'ja_nao_se_aplica' using errcode = 'P0001';
  end if;

  -- O check-in aberto do consultor neste cliente (travado: o check-out espera, e depois dele o check-in não muda mais).
  select k.id into v_checkin from public.checkins k
  where k.consultor_id = v_eu and k.cliente_id = v_cliente and k.fim is null
  for update;

  if v_antes is distinct from p_estado then
    if (p_estado in ('feita', 'andamento') or (p_estado = 'pausada' and v_antes <> 'andamento')) and exists (
      select 1 from public.checklist_dependencias d
      join public.checklist_tarefas dt on dt.id = d.depende_de
      where d.tarefa_id = p_tarefa
        and (dt.estado in ('a_fazer', 'andamento', 'pausada')
          or (dt.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(dt.id)))) then
      raise exception 'tarefa_bloqueada' using errcode = 'P0001';
    end if;

    update public.checklist_tarefas
    set estado = p_estado,
        motivo = v_motivo,
        feita_em = case when v_fecha then now() end,
        feita_por = case when v_fecha then v_eu end
    where id = p_tarefa
    returning feita_em into v_feita_em;

    -- O relógio da tarefa.
    if p_estado = 'andamento' then
      insert into public.checklist_tarefa_tempos (tarefa_id, pessoa_id) values (p_tarefa, v_eu)
      on conflict (tarefa_id) where fim is null do nothing;
    else
      update public.checklist_tarefa_tempos set fim = now() where tarefa_id = p_tarefa and fim is null;
    end if;

    if v_checkin is not null then
      if v_fecha then
        insert into public.checkin_tarefas (checkin_id, tarefa_id, titulo, estado, motivo)
        values (v_checkin, p_tarefa, v_titulo, p_estado, v_motivo)
        on conflict (checkin_id, tarefa_id) do update
          set estado = excluded.estado, motivo = excluded.motivo, marcada_em = excluded.marcada_em;
      elsif v_antes in ('feita', 'nao_se_aplica') then
        delete from public.checkin_tarefas where checkin_id = v_checkin and tarefa_id = p_tarefa;
      end if;
    end if;

    if v_fecha then
      with recursive acima(id, estado) as (
        select t.id, t.estado
        from public.checklist_dependencias d
        join public.checklist_tarefas t on t.id = d.tarefa_id
        where d.depende_de = p_tarefa
        union
        select t.id, t.estado
        from acima a
        join public.checklist_dependencias d on d.depende_de = a.id
        join public.checklist_tarefas t on t.id = d.tarefa_id
        where a.estado = 'nao_se_aplica'
      )
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo) order by t.posicao), '[]')
      into v_liberadas
      from (select distinct a.id from acima a where a.estado in ('a_fazer', 'andamento', 'pausada')) x
      join public.checklist_tarefas t on t.id = x.id
      where not exists (
        select 1 from public.checklist_dependencias d2
        join public.checklist_tarefas t2 on t2.id = d2.depende_de
        where d2.tarefa_id = t.id
          and (t2.estado in ('a_fazer', 'andamento', 'pausada')
            or (t2.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(t2.id))));
    end if;

    if p_estado = 'nao_se_aplica' then
      insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa, motivo, tarefa_id)
      values (v_cliente, 'tarefa_nao_se_aplica', v_checklist, v_eu, v_titulo, v_motivo, p_tarefa);
    elsif v_antes = 'nao_se_aplica' and p_estado = 'a_fazer' then
      insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa, tarefa_id)
      values (v_cliente, 'tarefa_reaberta', v_checklist, v_eu, v_titulo, p_tarefa);
    end if;

    perform private.recontar_checklist(v_checklist);
  end if;

  select floor(coalesce(sum(extract(epoch from coalesce(tt.fim, now()) - tt.inicio)), 0))::bigint,
    max(tt.inicio) filter (where tt.fim is null)
  into v_tempo, v_aberto
  from public.checklist_tarefa_tempos tt where tt.tarefa_id = p_tarefa;

  return jsonb_build_object('estado', p_estado, 'feita_em', v_feita_em, 'liberadas', v_liberadas,
    'na_sessao', v_checkin is not null and exists (
      select 1 from public.checkin_tarefas ct where ct.checkin_id = v_checkin and ct.tarefa_id = p_tarefa),
    'tempo_segundos', v_tempo, 'trecho_aberto_desde', v_aberto);
end $$;

revoke all on function public.marcar_tarefa(uuid, text, text) from public, anon;
grant execute on function public.marcar_tarefa(uuid, text, text) to authenticated;

-- Troca o motivo de uma tarefa que não se aplica (o Editar). Quem pode: o mesmo de marcar (só o consultor do cliente,
-- com o cliente e o check-list ativos). O motivo vai sem os espaços das pontas; o estado, quem e quando ficam. O
-- check-in aberto do consultor neste cliente leva o motivo novo (o check-out mostra o que vale); os fechados guardam o de
-- então. Grava 'motivo_trocado' no Histórico (a tarefa e o motivo novo); o mesmo motivo não muda nada. Recusas:
-- motivo_obrigatorio (22023), sem_permissao, so_o_consultor_marca, checklist_encerrado, cliente_arquivado,
-- so_em_nao_se_aplica (a tarefa não está como não se aplica); acima de 500 letras, a regra da coluna (23514).
create function public.trocar_motivo(p_tarefa uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_motivo text := nullif(btrim(p_motivo), '');
  v_checklist uuid;
  v_cliente uuid;
  v_estado text;
  v_antes text;
  v_titulo text;
  v_checkin uuid;
begin
  if v_motivo is null then
    raise exception 'motivo_obrigatorio' using errcode = '22023';
  end if;
  select o_checklist, o_cliente into v_checklist, v_cliente from private.travar_para_marcar(p_tarefa);

  select t.estado, t.motivo, t.titulo into v_estado, v_antes, v_titulo
  from public.checklist_tarefas t where t.id = p_tarefa;
  if v_estado <> 'nao_se_aplica' then
    raise exception 'so_em_nao_se_aplica' using errcode = 'P0001';
  end if;
  if v_motivo = v_antes then
    return;
  end if;

  update public.checklist_tarefas set motivo = v_motivo where id = p_tarefa;

  select k.id into v_checkin from public.checkins k
  where k.consultor_id = v_eu and k.cliente_id = v_cliente and k.fim is null
  for update;
  update public.checkin_tarefas set motivo = v_motivo where checkin_id = v_checkin and tarefa_id = p_tarefa;

  insert into public.cliente_eventos (cliente_id, tipo, checklist_id, autor, tarefa, motivo, tarefa_id)
  values (v_cliente, 'motivo_trocado', v_checklist, v_eu, v_titulo, v_motivo, p_tarefa);
end $$;

-- ── Comentários ──────────────────────────────────────────────────────────────

-- Comenta a tarefa (texto simples, 1 a 2000 letras sem os espaços das pontas) e devolve o comentário como a leitura.
-- Recusas: comentario_vazio (22023), sem_permissao, checklist_encerrado, cliente_arquivado; acima de 2000, a regra da
-- coluna (23514).
create function public.comentar_tarefa(p_tarefa uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_texto text := nullif(btrim(p_texto), '');
  v_gestao boolean;
  v_comentario public.checklist_comentarios;
begin
  if v_texto is null then
    raise exception 'comentario_vazio' using errcode = '22023';
  end if;
  select o_gestao into v_gestao from private.travar_para_comentar(p_tarefa);
  insert into public.checklist_comentarios (tarefa_id, autor_id, texto)
  values (p_tarefa, (select auth.uid()), v_texto)
  returning * into v_comentario;
  return private.comentario_json(v_comentario, true, v_gestao);
end $$;

-- Edita o próprio comentário (marca editado_em quando o texto muda) e devolve como a leitura. Recusas: comentario_vazio
-- (22023), comentario_nao_encontrado (não existe ou foi apagado), sem_permissao (não é o autor, ou não comenta mais),
-- checklist_encerrado, cliente_arquivado; acima de 2000, a regra da coluna (23514).
create function public.editar_comentario(p_comentario uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_texto text := nullif(btrim(p_texto), '');
  v_tarefa uuid;
  v_gestao boolean;
  v_comentario public.checklist_comentarios;
begin
  if v_texto is null then
    raise exception 'comentario_vazio' using errcode = '22023';
  end if;
  select m.tarefa_id into v_tarefa from public.checklist_comentarios m where m.id = p_comentario;
  if v_tarefa is null then
    raise exception 'comentario_nao_encontrado' using errcode = 'P0001';
  end if;
  select o_gestao into v_gestao from private.travar_para_comentar(v_tarefa);
  select * into v_comentario from public.checklist_comentarios m where m.id = p_comentario for update;
  if not found then
    raise exception 'comentario_nao_encontrado' using errcode = 'P0001';
  end if;
  if v_comentario.autor_id is distinct from (select auth.uid()) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_comentario.texto is distinct from v_texto then
    update public.checklist_comentarios set texto = v_texto, editado_em = now() where id = p_comentario
    returning * into v_comentario;
  end if;
  return private.comentario_json(v_comentario, true, v_gestao);
end $$;

-- Apaga o comentário: o autor, ou a gestão qualquer um. Recusas: comentario_nao_encontrado, sem_permissao,
-- checklist_encerrado, cliente_arquivado.
create function public.apagar_comentario(p_comentario uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_tarefa uuid;
  v_gestao boolean;
  v_autor uuid;
begin
  select m.tarefa_id into v_tarefa from public.checklist_comentarios m where m.id = p_comentario;
  if v_tarefa is null then
    raise exception 'comentario_nao_encontrado' using errcode = 'P0001';
  end if;
  select o_gestao into v_gestao from private.travar_para_comentar(v_tarefa);
  select m.autor_id into v_autor from public.checklist_comentarios m where m.id = p_comentario for update;
  if not found then
    raise exception 'comentario_nao_encontrado' using errcode = 'P0001';
  end if;
  if not (v_gestao or v_autor = (select auth.uid())) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  delete from public.checklist_comentarios where id = p_comentario;
end $$;

-- Os comentários da tarefa, mais recentes primeiro, p_limite por vez (1 a 100; 30 por padrão): { itens: [comentário
-- como em comentar_tarefa], ha_mais, pode_comentar }. "Ver anteriores": p_antes = o id do mais antigo já mostrado.
-- Quem não vê o check-list: nulo. Sessão não liberada: sem_permissao.
create function public.comentarios_da_tarefa(p_tarefa uuid, p_antes uuid default null, p_limite int default 30)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_checklist uuid;
  v_comento boolean;
  v_gestao boolean;
  v_limite int := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_antes_em timestamptz;
  v_itens jsonb;
  v_n int;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select t.checklist_id into v_checklist from public.checklist_tarefas t where t.id = p_tarefa;
  if v_checklist is null or not private.vejo_checklist(v_checklist) then
    return null;
  end if;
  v_comento := private.comento_no_checklist(v_checklist);
  v_gestao := v_comento and exists (
    select 1 from public.cliente_checklists cl where cl.id = v_checklist and private.gerencio_consultoria(cl.consultoria_id));
  if p_antes is not null then
    select m.criado_em into v_antes_em from public.checklist_comentarios m where m.id = p_antes and m.tarefa_id = p_tarefa;
    if v_antes_em is null then
      return jsonb_build_object('itens', '[]'::jsonb, 'ha_mais', false, 'pode_comentar', v_comento);
    end if;
  end if;

  with lista as (
    select m as c, m.criado_em, m.id
    from public.checklist_comentarios m
    where m.tarefa_id = p_tarefa
      and (p_antes is null or (m.criado_em, m.id) < (v_antes_em, p_antes))
    order by m.criado_em desc, m.id desc
    limit v_limite + 1
  ), numerada as (
    select l.c, row_number() over (order by l.criado_em desc, l.id desc) as rn from lista l
  )
  select coalesce(jsonb_agg(private.comentario_json(n.c, v_comento, v_gestao) order by n.rn)
      filter (where n.rn <= v_limite), '[]'::jsonb),
    count(*)
  into v_itens, v_n
  from numerada n;

  return jsonb_build_object('itens', v_itens, 'ha_mais', v_n > v_limite, 'pode_comentar', v_comento);
end $$;

-- ── O histórico curto da tarefa (o Editar) ───────────────────────────────────

-- { eventos: [{ id, tipo, em, autor, motivo }] (as últimas 10 linhas do Histórico desta tarefa: 'tarefa_nao_se_aplica',
-- 'tarefa_reaberta', 'motivo_trocado'), trechos: [{ inicio, fim, pessoa }] (os 10 últimos trechos de tempo; fim nulo é o
-- aberto), tempo_segundos (a soma de todos os trechos; o aberto, até agora) }. Nomes pela regra de nome visível. Quem
-- não vê o check-list da tarefa: nulo (quem vê o check-list vê o nome do modelo, então vê a tarefa e o motivo). Sessão
-- não liberada: sem_permissao.
create function public.historico_da_tarefa(p_tarefa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_checklist uuid;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select t.checklist_id into v_checklist from public.checklist_tarefas t where t.id = p_tarefa;
  if v_checklist is null or not private.vejo_checklist(v_checklist) then
    return null;
  end if;

  return jsonb_build_object(
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'em', e.em,
          'autor', private.nome_do_perfil_visivel(e.autor), 'motivo', e.motivo) order by e.em desc, e.id)
      from (select * from public.cliente_eventos e where e.tarefa_id = p_tarefa order by e.em desc, e.id limit 10) e
    ), '[]'::jsonb),
    'trechos', coalesce((
      select jsonb_agg(jsonb_build_object('inicio', tt.inicio, 'fim', tt.fim,
          'pessoa', private.nome_do_perfil_visivel(tt.pessoa_id)) order by tt.inicio desc, tt.id)
      from (select * from public.checklist_tarefa_tempos tt where tt.tarefa_id = p_tarefa
        order by tt.inicio desc, tt.id limit 10) tt
    ), '[]'::jsonb),
    'tempo_segundos', (
      select floor(coalesce(sum(extract(epoch from coalesce(tt.fim, now()) - tt.inicio)), 0))::bigint
      from public.checklist_tarefa_tempos tt where tt.tarefa_id = p_tarefa));
end $$;

revoke all on function public.trocar_motivo(uuid, text), public.comentar_tarefa(uuid, text),
  public.editar_comentario(uuid, text), public.apagar_comentario(uuid), public.comentarios_da_tarefa(uuid, uuid, int),
  public.historico_da_tarefa(uuid)
from public, anon;
grant execute on function public.trocar_motivo(uuid, text), public.comentar_tarefa(uuid, text),
  public.editar_comentario(uuid, text), public.apagar_comentario(uuid), public.comentarios_da_tarefa(uuid, uuid, int),
  public.historico_da_tarefa(uuid)
to authenticated;

-- ── Ler o check-list ─────────────────────────────────────────────────────────

-- Mesmo corpo de 20261118125931_nao_se_aplica_cadeia_e_reaberta.sql; muda só: pausada é pendente; pode_comentar; cada
-- tarefa traz tempo_segundos (a soma dos trechos; o aberto, até agora), trecho_aberto_desde (nulo sem trecho aberto) e
-- comentarios (quantos), somados uma vez por leitura.
create or replace function public.checklist_do_cliente(p_cliente uuid) returns jsonb
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

  with recursive tarefas as materialized (
    select t.id, t.etapa_id, t.posicao, t.titulo, t.descricao, t.obrigatoria, t.prazo_dias, t.vence_em, t.estado,
      t.nota, t.motivo, t.feita_em, t.feita_por, t.estado in ('a_fazer', 'andamento', 'pausada') as pendente
    from public.checklist_tarefas t
    where t.checklist_id = v_checklist
  ), presas(id) as (
    -- As que não se aplicam e ainda esperam: uma dependência pendente, ou outra presa.
    select d.tarefa_id
    from tarefas n
    join public.checklist_dependencias d on d.tarefa_id = n.id
    join tarefas p on p.id = d.depende_de
    where n.estado = 'nao_se_aplica' and p.pendente
    union
    select d.tarefa_id
    from presas pr
    join public.checklist_dependencias d on d.depende_de = pr.id
    join tarefas n on n.id = d.tarefa_id
    where n.estado = 'nao_se_aplica'
  ), dependencias as (
    select d.tarefa_id, jsonb_agg(d.depende_de order by dt.posicao) as ids,
      bool_and(dt.estado = 'feita' or (dt.estado = 'nao_se_aplica' and pr.id is null)) as livres
    from tarefas t
    join public.checklist_dependencias d on d.tarefa_id = t.id
    join public.checklist_tarefas dt on dt.id = d.depende_de
    left join presas pr on pr.id = d.depende_de
    group by d.tarefa_id
  ), tempos as (
    select tt.tarefa_id,
      floor(sum(extract(epoch from coalesce(tt.fim, now()) - tt.inicio)))::bigint as segundos,
      max(tt.inicio) filter (where tt.fim is null) as aberto_desde
    from tarefas t
    join public.checklist_tarefa_tempos tt on tt.tarefa_id = t.id
    group by tt.tarefa_id
  ), comentarios as (
    select m.tarefa_id, count(*) as n
    from tarefas t
    join public.checklist_comentarios m on m.tarefa_id = t.id
    group by m.tarefa_id
  ), na_sessao as (
    select ct.tarefa_id from public.checkin_tarefas ct where ct.checkin_id = v_checkin
  ), nomes as (
    select x.id, private.nome_do_perfil_visivel(x.id) as nome
    from (select distinct t.feita_por as id from tarefas t where t.feita_por is not null) x
  ), completas as (
    select t.*, coalesce(d.ids, '[]'::jsonb) as depende_de, coalesce(d.livres, true) as livre,
      s.tarefa_id is not null as na_sessao, n.nome as feita_por_nome,
      coalesce(tp.segundos, 0) as tempo_segundos, tp.aberto_desde, coalesce(cm.n, 0) as comentarios
    from tarefas t
    left join dependencias d on d.tarefa_id = t.id
    left join na_sessao s on s.tarefa_id = t.id
    left join nomes n on n.id = t.feita_por
    left join tempos tp on tp.tarefa_id = t.id
    left join comentarios cm on cm.tarefa_id = t.id
  )
  select jsonb_build_object(
    'pode_aplicar', private.gerencio_checklist_do_cliente(p_cliente),
    'pode_marcar', v_checklist is not null and private.marco_no_checklist(v_checklist),
    'pode_comentar', v_checklist is not null and private.comento_no_checklist(v_checklist),
    'consultor', case when v_consultor is not null then
      jsonb_build_object('id', v_consultor, 'nome', private.nome_do_perfil_visivel(v_consultor)) end,
    'checklist', (
      select jsonb_build_object('id', cl.id, 'modelo_id', cl.modelo_id, 'modelo_nome', cl.modelo_nome,
        'inicio', cl.inicio, 'aplicado_em', cl.aplicado_em,
        'aplicado_por', jsonb_build_object('nome', private.nome_do_perfil_visivel(cl.aplicado_por)))
      from public.cliente_checklists cl where cl.id = v_checklist),
    'etapas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'posicao', e.posicao,
        'tarefas', coalesce(x.tarefas, 0), 'feitas', coalesce(x.feitas, 0),
        'nao_se_aplica', coalesce(x.nao_se_aplica, 0)) order by e.posicao)
      from public.checklist_etapas e
      left join (select c.etapa_id, count(*) as tarefas, count(*) filter (where c.estado = 'feita') as feitas,
          count(*) filter (where c.estado = 'nao_se_aplica') as nao_se_aplica
        from completas c group by c.etapa_id) x on x.etapa_id = e.id
      where e.checklist_id = v_checklist), '[]'::jsonb),
    'tarefas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'etapa_id', c.etapa_id, 'posicao', c.posicao, 'titulo', c.titulo,
        'descricao', c.descricao, 'obrigatoria', c.obrigatoria, 'prazo_dias', c.prazo_dias, 'vence_em', c.vence_em,
        'estado', c.estado, 'nota', c.nota, 'motivo', c.motivo, 'feita_em', c.feita_em,
        'feita_por', case when c.feita_por is not null then jsonb_build_object('nome', c.feita_por_nome) end,
        'depende_de', c.depende_de, 'na_sessao', c.na_sessao, 'tempo_segundos', c.tempo_segundos,
        'trecho_aberto_desde', c.aberto_desde, 'comentarios', c.comentarios) order by c.posicao)
      from completas c), '[]'::jsonb),
    'resumo', (
      select jsonb_build_object(
        'tarefas', count(*),
        'feitas', count(*) filter (where c.estado = 'feita'),
        'nao_se_aplica', count(*) filter (where c.estado = 'nao_se_aplica'),
        'resolvidas', count(*) filter (where not c.pendente),
        'obrigatorias', count(*) filter (where c.obrigatoria),
        'obrigatorias_feitas', count(*) filter (where c.obrigatoria and c.estado = 'feita'),
        'vencem_7_dias', count(*) filter (where c.pendente and c.vence_em between v_hoje and v_hoje + 7),
        'atrasadas', count(*) filter (where c.pendente and c.vence_em < v_hoje),
        'proxima', (
          select jsonb_build_object('id', p.id, 'titulo', p.titulo, 'vence_em', p.vence_em)
          from completas p where p.pendente and p.livre
          order by p.vence_em, p.posicao limit 1))
      from completas c),
    'sessao', (
      select jsonb_build_object('checkin_id', k.id, 'inicio', k.inicio,
        'consultor', jsonb_build_object('nome', private.nome_do_perfil_visivel(k.consultor_id)),
        'tarefas', coalesce((
          select jsonb_agg(jsonb_build_object('tarefa_id', ct.tarefa_id, 'titulo', ct.titulo, 'estado', ct.estado,
              'motivo', ct.motivo)
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

revoke all on function public.checklist_do_cliente(uuid) from public, anon;
grant execute on function public.checklist_do_cliente(uuid) to authenticated;

-- ── Andamento, números e a faixa Hoje ────────────────────────────────────────

-- Mesmo corpo de 20261118125931_nao_se_aplica_cadeia_e_reaberta.sql; muda só: pausada é pendente (atrasadas, a próxima
-- e o que bloqueia).
create or replace function public.andamento_dos_clientes(p_consultoria uuid default null, p_consultor uuid default null,
  p_situacao text default 'todos', p_busca text default null, p_pagina int default 1) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_central boolean;
  v_gestao boolean := false;
  v_consultoria uuid;
  v_consultor uuid;
  v_situacao text := coalesce(p_situacao, 'todos');
  v_padrao text := private.padrao_de_busca(p_busca);
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_hoje date := private.hoje();
  v_total int;
  v_itens jsonb;
begin
  v_central := private.sou_central();
  if v_central then
    v_consultoria := p_consultoria;
    v_consultor := p_consultor;
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_gestao := true;
    v_consultoria := private.consultoria_atual();
    v_consultor := p_consultor;
  elsif private.liberado() then
    v_consultoria := private.consultoria_atual();
    v_consultor := v_eu;
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_situacao not in ('todos', 'com_atraso', 'sem_modelo') then
    raise exception 'filtro_invalido' using errcode = '22023';
  end if;

  with filtrados as materialized (
    select c.id, c.nome, cl.id as checklist_id, cl.proximo_vencimento
    from public.clientes c
    left join public.cliente_checklists cl
      on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
    where not c.arquivado
      and c.consultoria_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
      and (v_consultor is null or c.consultor_id = v_consultor)
      and (v_situacao = 'todos'
        or (v_situacao = 'com_atraso' and cl.proximo_vencimento < v_hoje)
        or (v_situacao = 'sem_modelo' and cl.id is null))
      and (v_padrao is null or c.busca like v_padrao escape '\' or cl.modelo_busca like v_padrao escape '\')
  ), pagina as (
    select f.id, f.nome, f.checklist_id, f.proximo_vencimento
    from filtrados f
    order by f.proximo_vencimento nulls last, f.checklist_id is null, f.nome, f.id
    limit 15 offset (v_pagina - 1) * 15
  )
  select
    (select count(*) from filtrados),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'cliente', jsonb_build_object('id', c.id, 'nome', c.nome, 'cidade', c.cidade, 'uf', c.uf),
        'consultor', case when p.id is not null then jsonb_build_object('id', p.id,
          'nome', private.nome_do_perfil_visivel(p.id), 'foto', p.foto, 'cor', p.cor) end,
        'consultoria', case when v_central then jsonb_build_object('id', co.id, 'nome', co.nome) end,
        'pode_aplicar', v_central or v_gestao,
        'checklist', case when cl.id is not null then jsonb_build_object(
          'id', cl.id, 'modelo_nome', cl.modelo_nome, 'tarefas', cl.tarefas, 'feitas', cl.feitas,
          'nao_se_aplica', cl.nao_se_aplica,
          'pct', case when cl.tarefas > 0
            then round((cl.feitas + cl.nao_se_aplica) * 100.0 / cl.tarefas)::int else 0 end,
          'atrasadas', a.atrasadas,
          'proxima', pr.proxima) end
      ) order by pg.proximo_vencimento nulls last, pg.checklist_id is null, pg.nome, pg.id)
      from pagina pg
      join public.clientes c on c.id = pg.id
      left join public.perfis p on p.id = c.consultor_id
      left join public.consultorias co on co.id = c.consultoria_id
      left join public.cliente_checklists cl on cl.id = pg.checklist_id
      -- Só os check-lists com o próximo vencimento antes de hoje têm atrasada; os outros nem olham as tarefas.
      cross join lateral (
        select count(*) as atrasadas
        from public.checklist_tarefas t
        where cl.proximo_vencimento < v_hoje
          and t.checklist_id = cl.id and t.estado in ('a_fazer', 'andamento', 'pausada') and t.vence_em < v_hoje
      ) a
      left join lateral (
        select jsonb_build_object('titulo', t.titulo, 'vence_em', t.vence_em) as proxima
        from public.checklist_tarefas t
        where cl.proximo_vencimento is not null
          and t.checklist_id = cl.id and t.estado in ('a_fazer', 'andamento', 'pausada')
          and not exists (
            select 1 from public.checklist_dependencias d
            join public.checklist_tarefas dt on dt.id = d.depende_de
            where d.tarefa_id = t.id
              and (dt.estado in ('a_fazer', 'andamento', 'pausada')
                or (dt.estado = 'nao_se_aplica' and private.nao_se_aplica_espera(dt.id))))
        order by t.vence_em, t.posicao
        limit 1
      ) pr on true
    ), '[]'::jsonb)
  into v_total, v_itens;

  return jsonb_build_object('itens', v_itens, 'total', v_total);
end $$;

revoke all on function public.andamento_dos_clientes(uuid, uuid, text, text, int) from public, anon;
grant execute on function public.andamento_dos_clientes(uuid, uuid, text, text, int) to authenticated;

-- Mesmo corpo de 20261118120040_tarefa_nao_se_aplica.sql; muda só: atrasadas e vencem em 7 dias contam as pausadas.
create or replace function public.indicadores_de_checkins(p_consultoria uuid default null, p_consultor uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_consultor uuid;
  v_hoje date := private.hoje();
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
    v_consultoria := p_consultoria;
    v_consultor := p_consultor;
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
    v_consultor := p_consultor;
  elsif private.liberado() then
    v_recorte := 'pessoa';
    v_consultoria := private.consultoria_atual();
    v_consultor := v_eu;
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with ativos as materialized (
    select cl.id as checklist_id, cl.tarefas, cl.feitas + cl.nao_se_aplica as resolvidas, cl.proximo_vencimento
    from public.clientes c
    left join public.cliente_checklists cl
      on cl.cliente_id = c.id and cl.encerrado_em is null and cl.consultoria_id = c.consultoria_id
    where not c.arquivado
      and c.consultoria_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
      and (v_consultor is null or c.consultor_id = v_consultor)
  ), prazos as (
    -- Só os check-lists com o próximo vencimento até daqui a 7 dias podem ter tarefa atrasada ou vencendo.
    select coalesce(sum(x.atrasadas), 0) as atrasadas, coalesce(sum(x.vencem), 0) as vencem
    from ativos a
    cross join lateral (
      select count(*) filter (where t.vence_em < v_hoje) as atrasadas,
        count(*) filter (where t.vence_em >= v_hoje) as vencem
      from public.checklist_tarefas t
      where t.checklist_id = a.checklist_id and t.estado in ('a_fazer', 'andamento', 'pausada')
        and t.vence_em <= v_hoje + 7
    ) x
    where a.proximo_vencimento <= v_hoje + 7
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'clientes', (select count(*) from ativos),
    'com_modelo', (select count(a.checklist_id) from ativos a),
    'progresso_medio', (select round(avg(a.resolvidas * 100.0 / a.tarefas))::int from ativos a where a.tarefas > 0),
    'atrasadas', p.atrasadas,
    'vencem_7_dias', p.vencem)
  into v_resultado
  from prazos p;
  return v_resultado;
end $$;

revoke all on function public.indicadores_de_checkins(uuid, uuid) from public, anon;
grant execute on function public.indicadores_de_checkins(uuid, uuid) to authenticated;

-- Mesmo corpo de 20261119115852_graficos_do_cliente_hoje.sql; muda só: as atrasadas por etapa contam as pausadas.
create or replace function public.hoje_do_cliente(p_cliente uuid)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid := (select auth.uid());
  v_hoje date := private.hoje();
  v_mes date := date_trunc('month', private.hoje()::timestamp)::date;
  v_dias_no_mes int := extract(day from date_trunc('month', private.hoje()::timestamp) + interval '1 month - 1 day')::int;
  v_cliente public.clientes;
  v_central boolean;
  v_gestao uuid;
  v_realizado numeric;
  v_projecao numeric;
  v_ultimo date;
  v_sem_checkin boolean;
  v_dias int;
  v_reuniao uuid;
  v_quadro uuid;
  v_lista jsonb;
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  select * into v_cliente from public.clientes c where c.id = p_cliente;
  if not found or not private.vejo_cliente(v_cliente.consultoria_id, v_cliente.consultor_id) then
    return null;
  end if;
  v_central := private.sou_central();
  v_gestao := case when private.gerencio_consultoria(private.consultoria_atual()) then private.consultoria_atual() end;

  -- O RLS de checkins (central: todos; gestão: os da consultoria dela; o consultor: os dele), aqui à mão (definer).
  select coalesce(round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1), 0) into v_realizado
  from public.checkins k
  where k.cliente_id = p_cliente
    and k.fim is not null
    and k.inicio >= v_mes::timestamp at time zone 'America/Sao_Paulo'
    and k.inicio < (v_mes + interval '1 month') at time zone 'America/Sao_Paulo'
    and (v_central or k.consultoria_id = v_gestao or k.consultor_id = v_eu);
  v_projecao := private.projecao_do_mes(v_realizado, extract(day from v_hoje)::int, v_dias_no_mes);

  select (k.inicio at time zone 'America/Sao_Paulo')::date into v_ultimo
  from public.checkins k
  where k.cliente_id = p_cliente and (v_central or k.consultoria_id = v_cliente.consultoria_id)
  order by k.inicio desc limit 1;

  select r.sem_checkin, r.sem_checkin_dias into v_sem_checkin, v_dias
  from private.risco_dos_clientes(null, null, p_cliente) r;

  v_reuniao := (public.eventos_do_cliente(p_cliente) ->> 'proximo')::uuid;

  select q.id into v_quadro from public.quadros q
  where q.cliente_id = p_cliente and q.consultoria_id = v_cliente.consultoria_id;
  if v_quadro is not null and not private.vejo_quadro(v_quadro) then
    v_quadro := null;
  end if;

  v_lista := public.checklist_do_cliente(p_cliente);

  return jsonb_build_object(
    'arquivado_em', v_cliente.arquivado_em,
    'previsao', jsonb_build_object('horas_mes', v_cliente.horas_mes, 'realizado', v_realizado,
      'dia', extract(day from v_hoje)::int, 'dias_no_mes', v_dias_no_mes, 'projecao', v_projecao,
      'ritmo', private.ritmo_do_mes(v_projecao, v_cliente.horas_mes)),
    'checkin', jsonb_build_object('ultimo', v_ultimo, 'dias_sem', v_hoje - v_ultimo,
      'situacao', case when v_sem_checkin then 'em_risco' when v_dias >= 14 then 'atencao'
        when v_dias is not null then 'em_dia' end,
      'dias_com_checkin', (
        select coalesce(jsonb_agg(x.dia order by x.dia), '[]'::jsonb)
        from (
          select distinct (k.inicio at time zone 'America/Sao_Paulo')::date as dia
          from public.checkins k
          where k.cliente_id = p_cliente
            and k.inicio >= (v_hoje - 29)::timestamp at time zone 'America/Sao_Paulo'
            and (v_central or k.consultoria_id = v_cliente.consultoria_id)
        ) x)),
    'reuniao', (
      select jsonb_build_object('id', e.id, 'inicio', e.inicio, 'titulo', e.titulo, 'com_meet', e.com_meet)
      from public.agenda_eventos e where e.id = v_reuniao),
    'quadro', case when v_quadro is not null then
      jsonb_build_object('id', v_quadro) || (public.indicadores_do_quadro(v_quadro) - 'vencem_em_7_dias') end,
    'checklist', case when jsonb_typeof(v_lista -> 'checklist') = 'object' then jsonb_build_object(
      'modelo_nome', v_lista #> '{checklist,modelo_nome}',
      'tarefas', v_lista #> '{resumo,tarefas}',
      'feitas', v_lista #> '{resumo,feitas}',
      'nao_se_aplica', v_lista #> '{resumo,nao_se_aplica}',
      'atrasadas', v_lista #> '{resumo,atrasadas}',
      'proxima', nullif(v_lista #> '{resumo,proxima}', 'null'::jsonb) - 'id',
      'etapas', (
        select coalesce(jsonb_agg((x.e - 'posicao') || jsonb_build_object('atrasadas', coalesce(a.n, 0)) order by x.o),
          '[]'::jsonb)
        from jsonb_array_elements(v_lista -> 'etapas') with ordinality x(e, o)
        left join (
          select t.etapa_id, count(*) as n
          from public.checklist_tarefas t
          where t.checklist_id = (v_lista #>> '{checklist,id}')::uuid
            and t.estado in ('a_fazer', 'andamento', 'pausada') and t.vence_em < v_hoje
          group by t.etapa_id
        ) a on a.etapa_id = (x.e ->> 'id')::uuid)) end);
end $$;

revoke all on function public.hoje_do_cliente(uuid) from public, anon;
grant execute on function public.hoje_do_cliente(uuid) to authenticated;

-- ── Histórico do cliente ─────────────────────────────────────────────────────

-- Mesmo corpo de 20261118125931_nao_se_aplica_cadeia_e_reaberta.sql; muda só: a linha 'motivo_trocado' traz a tarefa e
-- o motivo com a regra da 'tarefa_nao_se_aplica' (só para quem vê o nome do modelo do check-list). Mesmas colunas.
create or replace function public.historico_do_cliente(p_cliente uuid, p_limite int default 15,
  p_deslocamento int default 0, p_de timestamptz default null, p_ate timestamptz default null)
returns table (id uuid, tipo text, em timestamptz, de_horas numeric, para_horas numeric,
  de_consultoria text, para_consultoria text, de_consultor text, para_consultor text, autor text, modelo text,
  tarefa text, motivo text, total bigint)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.tipo, e.em, e.de_horas, e.para_horas,
    private.nome_da_consultoria_visivel(e.de_consultoria),
    private.nome_da_consultoria_visivel(e.para_consultoria),
    private.nome_do_perfil_visivel(e.de_consultor),
    private.nome_do_perfil_visivel(e.para_consultor),
    private.nome_do_perfil_visivel(e.autor),
    private.nome_do_modelo_visivel(e.checklist_id),
    case when e.tipo in ('tarefa_nao_se_aplica', 'tarefa_reaberta', 'motivo_trocado')
        and private.nome_do_modelo_visivel(e.checklist_id) is not null
      then e.tarefa end,
    case when e.tipo in ('tarefa_nao_se_aplica', 'motivo_trocado')
        and private.nome_do_modelo_visivel(e.checklist_id) is not null
      then e.motivo end,
    count(*) over ()
  from public.cliente_eventos e
  where e.cliente_id = p_cliente
    and (p_de is null or e.em >= p_de)
    and (p_ate is null or e.em < p_ate)
  order by e.em desc, e.id
  limit greatest(1, least(coalesce(p_limite, 15), 50))
  offset greatest(0, coalesce(p_deslocamento, 0))
$$;

revoke all on function public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz) from public, anon;
grant execute on function public.historico_do_cliente(uuid, int, int, timestamptz, timestamptz) to authenticated;
