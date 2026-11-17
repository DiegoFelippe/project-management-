-- Quadro em tempo real (plano docs/superpowers/plans/2026-11-17-kanban-do-cliente.md, Task 3; desenho em
-- docs/superpowers/specs/2026-11-17-kanban-do-cliente-design.md, "Decisões minhas", Tempo real). Só cria funções,
-- gatilhos e uma regra, redefine uma função e tira uma permissão: nenhuma linha que já existe é alterada ou apagada.
--
-- - Um canal privado do Supabase Realtime por quadro, tópico "quadro:<id>". Entra no canal quem vê o quadro
--   (private.vejo_quadro: a central e o dono; na consultoria que atende o cliente hoje, a gestão e o consultor dele). Quem
--   confere é o servidor do Realtime, com realtime.authorize (grava uma mensagem de prova no tópico e vê se a pessoa, com
--   o papel e o token dela, a enxerga pela regra abaixo) ao entrar no canal. Só os avisos (broadcast): presença fica de
--   fora. Ninguém manda mensagem no canal (não há regra de insert): quem avisa é o banco.
-- - Os gatilhos mandam um aviso por comando (não por linha) com realtime.send, evento "mudou", privado:
--   { tabela, operacao, cartoes, colunas } (ids dos cartões e das colunas que mudaram). Nunca título, descrição,
--   comentário, item, nome de coluna ou de arquivo: a tela relê pelas funções de leitura, que passam pelas regras de quem
--   vê. Mais de 50 cartões num comando (renumerar a coluna, apagar coluna com cartões, lote): cartoes = nulo, a tela relê
--   as colunas. Não usamos realtime.broadcast_changes porque ele manda a linha inteira (old_record e record, com o texto).
-- - O que sai junto com o cartão (checklist, comentários, responsáveis, anexos) não avisa de novo: o aviso do cartão
--   apagado basta (quando o gatilho das tabelas filhas roda, o cartão já não existe).
-- - Quando o acesso ao quadro muda (o cliente troca de consultor ou de consultoria, é arquivado ou reativado), o canal
--   avisa { tabela: 'clientes', operacao: 'update', acesso: true }: a tela relê e entra de novo no canal (o servidor
--   confere outra vez, e quem perdeu o acesso é recusado).
-- - realtime.send nunca derruba a gravação: se o aviso falhar, vira WARNING e a gravação segue (a tela tem o plano B,
--   src/data/quadroAoVivo.js).
-- - Sobras da Task 2: cartão só se apaga por apagar_cartao (sem delete direto na tabela para quem está logado: o app
--   precisa dos caminhos do Storage que a função devolve); objetos_para_tirar_do_quadro só para a central.

-- ── Quem entra no canal ──────────────────────────────────────────────────────

-- O tópico é exatamente "quadro:<id em minúsculas>" de um quadro que a pessoa vê. Outro texto: não (sem erro).
create function private.vejo_canal_do_quadro(p_topico text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topico is null
     or p_topico !~ '^quadro:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.vejo_quadro(substr(p_topico, 8)::uuid);
end $$;

revoke all on function private.vejo_canal_do_quadro(text) from public, anon;
grant execute on function private.vejo_canal_do_quadro(text) to authenticated;

-- realtime.topic() é o tópico que o servidor do Realtime põe na conexão ao conferir (uma vez por consulta, no select).
create policy "quadro: ouvir o canal" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and topic = (select realtime.topic())
    and (select private.vejo_canal_do_quadro(realtime.topic()))
  );

-- ── Os avisos ────────────────────────────────────────────────────────────────

-- Manda o aviso no canal do quadro.
create function private.avisar_quadro(p_quadro uuid, p_aviso jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(p_aviso, 'mudou', 'quadro:' || p_quadro::text, true);
end $$;

-- O aviso de uma mudança nos cartões ou nas colunas (e nas tabelas do cartão). Até 50 cartões vão na lista; mais: nulo.
create function private.aviso_do_quadro(p_tabela text, p_operacao text, p_cartoes uuid[], p_colunas uuid[])
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'tabela', p_tabela,
    'operacao', lower(p_operacao),
    'cartoes', case when coalesce(cardinality(p_cartoes), 0) <= 50 then to_jsonb(coalesce(p_cartoes, '{}')) end,
    'colunas', to_jsonb(coalesce(p_colunas, '{}')))
$$;

-- Colunas (criar, renomear, cor, ordem, apagar): as colunas que mudaram, por quadro.
create function private.avisar_colunas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, '{}', x.colunas))
    from (select v.quadro_id, array_agg(distinct v.id) as colunas from velhos v group by v.quadro_id) x;
  else
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, '{}', x.colunas))
    from (select n.quadro_id, array_agg(distinct n.id) as colunas from novos n group by n.quadro_id) x;
  end if;
  return null;
end $$;

-- Cartões (criar, editar, mover, arquivar, restaurar, apagar): os cartões e as colunas deles, por quadro. Ao mover, a
-- coluna de onde saiu e a para onde foi.
create function private.avisar_cartoes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, x.cartoes, x.colunas))
    from (
      select n.quadro_id, array_agg(distinct n.id) as cartoes, array_agg(distinct n.coluna_id) as colunas
      from novos n group by n.quadro_id
    ) x;
  elsif tg_op = 'UPDATE' then
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, x.cartoes, x.colunas))
    from (
      select m.quadro_id, array_agg(distinct m.id) as cartoes, array_agg(distinct m.coluna_id) as colunas
      from (
        select n.quadro_id, n.id, n.coluna_id from novos n
        union all
        select v.quadro_id, v.id, v.coluna_id from velhos v
      ) m
      group by m.quadro_id
    ) x;
  else
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, x.cartoes, x.colunas))
    from (
      select v.quadro_id, array_agg(distinct v.id) as cartoes, array_agg(distinct v.coluna_id) as colunas
      from velhos v group by v.quadro_id
    ) x;
  end if;
  return null;
end $$;

-- Tabelas do cartão (responsáveis, checklist, comentários, anexos): o cartão e a coluna dele (a página da coluna mostra
-- as contagens). Cartão que já saiu (o que foi junto com ele): sem aviso.
create function private.avisar_coisas_do_cartao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, x.cartoes, x.colunas))
    from (
      select k.quadro_id, array_agg(distinct k.id) as cartoes, array_agg(distinct k.coluna_id) as colunas
      from public.cartoes k where k.id in (select n.cartao_id from novos n) group by k.quadro_id
    ) x;
  elsif tg_op = 'UPDATE' then
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, x.cartoes, x.colunas))
    from (
      select k.quadro_id, array_agg(distinct k.id) as cartoes, array_agg(distinct k.coluna_id) as colunas
      from public.cartoes k
      where k.id in (select n.cartao_id from novos n union select v.cartao_id from velhos v)
      group by k.quadro_id
    ) x;
  else
    perform private.avisar_quadro(x.quadro_id, private.aviso_do_quadro(tg_table_name, tg_op, x.cartoes, x.colunas))
    from (
      select k.quadro_id, array_agg(distinct k.id) as cartoes, array_agg(distinct k.coluna_id) as colunas
      from public.cartoes k where k.id in (select v.cartao_id from velhos v) group by k.quadro_id
    ) x;
  end if;
  return null;
end $$;

-- O acesso ao quadro do cliente mudou (consultor, consultoria, arquivamento): avisa em cada quadro dele.
create function private.avisar_acesso_ao_quadro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.avisar_quadro(q.id, jsonb_build_object('tabela', 'clientes', 'operacao', 'update', 'acesso', true))
  from public.quadros q where q.cliente_id = new.id;
  return null;
end $$;

revoke all on function private.avisar_quadro(uuid, jsonb), private.aviso_do_quadro(text, text, uuid[], uuid[]),
  private.avisar_colunas(), private.avisar_cartoes(), private.avisar_coisas_do_cartao(),
  private.avisar_acesso_ao_quadro() from public, anon, authenticated;

-- Um gatilho por operação (o Postgres não junta tabelas de transição de operações diferentes num gatilho só).
create trigger quadro_colunas_avisar_insert after insert on public.quadro_colunas
  referencing new table as novos for each statement execute function private.avisar_colunas();
create trigger quadro_colunas_avisar_update after update on public.quadro_colunas
  referencing old table as velhos new table as novos for each statement execute function private.avisar_colunas();
create trigger quadro_colunas_avisar_delete after delete on public.quadro_colunas
  referencing old table as velhos for each statement execute function private.avisar_colunas();

create trigger cartoes_avisar_insert after insert on public.cartoes
  referencing new table as novos for each statement execute function private.avisar_cartoes();
create trigger cartoes_avisar_update after update on public.cartoes
  referencing old table as velhos new table as novos for each statement execute function private.avisar_cartoes();
create trigger cartoes_avisar_delete after delete on public.cartoes
  referencing old table as velhos for each statement execute function private.avisar_cartoes();

create trigger cartao_responsaveis_avisar_insert after insert on public.cartao_responsaveis
  referencing new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_responsaveis_avisar_update after update on public.cartao_responsaveis
  referencing old table as velhos new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_responsaveis_avisar_delete after delete on public.cartao_responsaveis
  referencing old table as velhos for each statement execute function private.avisar_coisas_do_cartao();

create trigger cartao_checklist_avisar_insert after insert on public.cartao_checklist
  referencing new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_checklist_avisar_update after update on public.cartao_checklist
  referencing old table as velhos new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_checklist_avisar_delete after delete on public.cartao_checklist
  referencing old table as velhos for each statement execute function private.avisar_coisas_do_cartao();

create trigger cartao_comentarios_avisar_insert after insert on public.cartao_comentarios
  referencing new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_comentarios_avisar_update after update on public.cartao_comentarios
  referencing old table as velhos new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_comentarios_avisar_delete after delete on public.cartao_comentarios
  referencing old table as velhos for each statement execute function private.avisar_coisas_do_cartao();

create trigger cartao_anexos_avisar_insert after insert on public.cartao_anexos
  referencing new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_anexos_avisar_update after update on public.cartao_anexos
  referencing old table as velhos new table as novos for each statement execute function private.avisar_coisas_do_cartao();
create trigger cartao_anexos_avisar_delete after delete on public.cartao_anexos
  referencing old table as velhos for each statement execute function private.avisar_coisas_do_cartao();

create trigger clientes_avisar_quadros
  after update on public.clientes
  for each row
  when (old.consultor_id is distinct from new.consultor_id
    or old.consultoria_id is distinct from new.consultoria_id
    or old.arquivado_em is distinct from new.arquivado_em)
  execute function private.avisar_acesso_ao_quadro();

-- ── Sobras da Task 2 ─────────────────────────────────────────────────────────

-- Cartão só se apaga por apagar_cartao (e apagar_coluna com os cartões junto), que devolvem os caminhos do Storage que o
-- app tira em seguida; o delete direto deixava os objetos para trás sem ninguém saber. A regra "apagar cartão" fica como
-- segunda trava.
revoke delete on public.cartoes from authenticated;

-- Mesmo corpo de 20261117125011_quadro_anexos.sql, agora só para a central (é ela quem apaga o cliente, e quem tira as
-- sobras): os outros param antes de olhar o balde.
create or replace function public.objetos_para_tirar_do_quadro(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.sou_central() then
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

revoke all on function public.objetos_para_tirar_do_quadro(uuid) from public, anon;
grant execute on function public.objetos_para_tirar_do_quadro(uuid) to authenticated;
