-- Agenda, rodada da tela (Task 6). Só funções: nenhuma linha é alterada ou apagada.
-- 1. pessoas_para_convidar: a janela do evento busca quem convidar entre as pessoas da consultoria do evento. O
--    consultor não lê os colegas direto (private.vejo_perfil só lhe mostra a própria linha), então a busca é uma função
--    do banco, como as outras leituras de colegas: devolve só id, nome e cor.
-- 2. eventos_do_periodo ganha p_tipo (o "Mostrar" da tela no banco): 'reunioes' = eventos com cliente,
--    'compromissos' = sem cliente, nulo = todos. Vale em todos os ramos; os caminhos por índice continuam os mesmos (o
--    tipo é só mais uma condição sobre as linhas que o índice já trouxe). O parâmetro entra no fim, com padrão nulo:
--    as chamadas de hoje (por nome ou por posição, até p_limite) continuam iguais.

-- ── Quem convidar ────────────────────────────────────────────────────────────

-- Pessoas ativas (administrador, gestor e consultor) da consultoria p_consultoria, pelo nome sem acento e sem
-- maiúscula (perfis.nome_busca, com índice trigram), em ordem de nome, até p_limite (1 a 50): [{ id, nome, cor }].
-- Quem pode: quem é daquela consultoria (qualquer papel) e a central (e o dono); para os outros, lista vazia (nada
-- diz que a consultoria existe). Sessão que não está liberada (ex.: aal1 de quem precisa do código): sem_permissao.
create function public.pessoas_para_convidar(p_consultoria uuid, p_busca text default null, p_limite int default 20)
returns jsonb
language plpgsql stable security definer
set search_path = '' as $$
declare
  v_padrao text := private.padrao_de_busca(p_busca);
  v_limite int := least(greatest(coalesce(p_limite, 20), 1), 50);
begin
  if not private.liberado() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_consultoria is null
     or not (private.sou_central() or p_consultoria = private.consultoria_atual()) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'nome', l.nome, 'cor', l.cor) order by l.nome, l.id)
    from (
      select p.id, p.nome, p.cor
      from public.perfis p
      where p.consultoria_id = p_consultoria
        and p.ativo
        and p.papel in ('admin', 'gestor', 'pessoa')
        and (v_padrao is null or p.nome_busca like v_padrao escape '\')
      order by p.nome, p.id
      limit v_limite
    ) l
  ), '[]'::jsonb);
end $$;

revoke all on function public.pessoas_para_convidar(uuid, text, int) from public, anon;
grant execute on function public.pessoas_para_convidar(uuid, text, int) to authenticated;

-- ── Leitura do período com o tipo ────────────────────────────────────────────

-- Mudar a lista de parâmetros cria outra função: a antiga sai (nada no banco depende dela) e a nova entra com o mesmo
-- corpo, o mesmo recorte por papel e os mesmos grants.
drop function public.eventos_do_periodo(timestamptz, timestamptz, uuid, uuid, uuid, int);

-- Eventos que tocam o período [p_de, p_ate): { itens: [...], ha_mais }. Mesmas regras de visão do RLS, com um
-- caminho por índice para cada papel: consultor = próprios (consultor_id, inicio) + convidado (participantes por
-- perfil_id); admin e gestor = a consultoria (consultoria_id, inicio); central = índice por início. Evento dura no
-- máximo 31 dias, então inicio >= p_de - 31 dias limita a busca. p_limite (até 1000) corta a lista. p_tipo:
-- 'reunioes' (com cliente), 'compromissos' (sem cliente) ou nulo (todos); outro valor: tipo_invalido.
create function public.eventos_do_periodo(
  p_de timestamptz, p_ate timestamptz,
  p_consultor uuid default null, p_consultoria uuid default null, p_cliente uuid default null,
  p_limite int default 1000, p_tipo text default null
) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 1000);
  v_itens jsonb;
  v_total int;
begin
  if p_tipo is not null and p_tipo not in ('reunioes', 'compromissos') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if private.sou_central() then
    v_recorte := 'tudo';
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() then
    v_recorte := 'pessoa';
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if p_de is null or p_ate is null then
    return jsonb_build_object('itens', '[]'::jsonb, 'ha_mais', false);
  end if;

  with ids as (
    select t.id, t.inicio from (
      select e.id, e.inicio from public.agenda_eventos e
      where v_recorte = 'tudo'
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
        and (p_tipo is null or (p_tipo = 'reunioes') = (e.cliente_id is not null))
      union all
      select e.id, e.inicio from public.agenda_eventos e
      where v_recorte = 'consultoria' and e.consultoria_id = v_consultoria
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
        and (p_tipo is null or (p_tipo = 'reunioes') = (e.cliente_id is not null))
      union all
      select e.id, e.inicio from public.agenda_eventos e
      where v_recorte = 'pessoa' and e.consultor_id = v_eu
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
        and (p_tipo is null or (p_tipo = 'reunioes') = (e.cliente_id is not null))
      union all
      select e.id, e.inicio
      from public.agenda_participantes p
      join public.agenda_eventos e on e.id = p.evento_id
      where v_recorte = 'pessoa' and p.perfil_id = v_eu and e.consultor_id <> v_eu
        and e.consultoria_id = v_consultoria
        and e.inicio >= p_de - interval '31 days' and e.inicio < p_ate and e.fim > p_de
        and (p_consultor is null or e.consultor_id = p_consultor)
        and (p_consultoria is null or e.consultoria_id = p_consultoria)
        and (p_cliente is null or e.cliente_id = p_cliente)
        and (p_tipo is null or (p_tipo = 'reunioes') = (e.cliente_id is not null))
    ) t
    order by t.inicio, t.id
    limit v_limite + 1
  ), lista as (
    select e, row_number() over (order by e.inicio, e.id) as rn
    from ids join public.agenda_eventos e on e.id = ids.id
  )
  select coalesce(jsonb_agg(private.evento_em_json(l.e) order by l.rn) filter (where l.rn <= v_limite), '[]'::jsonb),
         count(*)
  into v_itens, v_total
  from lista l;

  return jsonb_build_object('itens', v_itens, 'ha_mais', v_total > v_limite);
end $$;

revoke all on function public.eventos_do_periodo(timestamptz, timestamptz, uuid, uuid, uuid, int, text) from public, anon;
grant execute on function public.eventos_do_periodo(timestamptz, timestamptz, uuid, uuid, uuid, int, text) to authenticated;
