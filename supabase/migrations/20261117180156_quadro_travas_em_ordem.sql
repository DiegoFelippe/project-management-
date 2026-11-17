-- Quadro: travas sempre na mesma ordem (revisão final do Kanban).
--
-- Antes, mover_cartao travava só a coluna de destino e depois o cartão. Duas pessoas trocando cartões entre as mesmas
-- colunas (X de A para B e Y de B para A) podiam travar uma à outra quando as duas precisavam renumerar: a primeira
-- segura B e X e, ao renumerar B, espera Y; a segunda segura A e Y e, ao renumerar A, espera X (erro 40P01). Agora as
-- duas colunas, a de onde o cartão sai e a de destino, são travadas numa consulta só, em ordem de id, antes do cartão:
-- quem chega depois espera a primeira terminar.
--
-- apagar_coluna (que já trava o quadro) passa a travar a coluna que sai e a de destino na mesma ordem de id; sem isso,
-- apagar a coluna B mandando os cartões para A, junto com alguém movendo um cartão de B para A, travaria do mesmo jeito.
--
-- Mesmas assinaturas e permissões (create or replace mantém os grants; repetidos no fim para ficar explícito).

-- Corpo de 20261117112951_quadro.sql; muda só o começo (as travas). Se o cartão mudou de coluna entre a primeira leitura
-- e a trava (outra pessoa o moveu), devolve vizinho_invalido: a tela avisa que o quadro mudou e relê.
create or replace function public.mover_cartao(p_cartao uuid, p_coluna uuid, p_antes uuid default null, p_depois uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_quadro uuid;
  v_origem uuid;
  v_agora uuid;
  v_arquivado timestamptz;
  v_baixo numeric;
  v_alto numeric;
  v_ancora numeric;
  v_posicao numeric;
  v_renumerou boolean := false;
begin
  select k.quadro_id, k.coluna_id into v_quadro, v_origem from public.cartoes k where k.id = p_cartao;
  if v_quadro is null or not private.mexo_no_quadro(v_quadro) then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  -- As duas colunas em ordem de id (a mesma ordem para todo mundo), depois o cartão.
  perform 1 from public.quadro_colunas c
  where c.id in (v_origem, p_coluna) and c.quadro_id = v_quadro
  order by c.id for no key update;
  if not exists (select 1 from public.quadro_colunas c where c.id = p_coluna and c.quadro_id = v_quadro) then
    raise exception 'coluna_invalida' using errcode = 'P0001';
  end if;
  select k.arquivado_em, k.coluna_id into v_arquivado, v_agora from public.cartoes k where k.id = p_cartao for update;
  if not found then
    -- apagado enquanto esperava as colunas
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;
  if v_agora is distinct from v_origem then
    -- movido por outra pessoa enquanto esperava: a tela de quem arrastou está velha
    raise exception 'vizinho_invalido' using errcode = 'P0001';
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

-- Corpo de 20261117125011_quadro_anexos.sql; muda só a trava das colunas (a que sai e a de destino, em ordem de id,
-- como mover_cartao), logo depois da trava do quadro.
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

revoke all on function public.mover_cartao(uuid, uuid, uuid, uuid), public.apagar_coluna(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.mover_cartao(uuid, uuid, uuid, uuid), public.apagar_coluna(uuid, uuid, boolean)
  to authenticated;
