-- Corrige salvar_modelo (20261117170204_modelos_de_checkin.sql) ao criar: o modelo atual ficava num record que só é
-- preenchido ao editar, e ler um campo dele ao criar (p_id nulo) dava "record v_atual is not assigned yet". Agora são
-- variáveis simples (nulas ao criar). Nada mais muda: mesma assinatura (create or replace mantém as permissões: só
-- authenticated executa), mesmas regras e mesmos erros. Nenhuma linha é alterada.

create or replace function public.salvar_modelo(p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_central boolean := private.sou_central();
  v_minha uuid := private.consultoria_atual();
  -- o modelo como está (só ao editar; nulos ao criar)
  v_atual_id uuid;
  v_atual_da_central boolean;
  v_atual_consultoria uuid;
  v_atual_arquivado timestamptz;
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
    select m.id, m.da_central, m.consultoria_id, m.arquivado_em
    into v_atual_id, v_atual_da_central, v_atual_consultoria, v_atual_arquivado
    from public.modelos m where m.id = p_id for update;
    if v_atual_id is null then
      raise exception 'sem_permissao' using errcode = 'P0001';
    end if;
    if v_atual_arquivado is not null then
      raise exception 'modelo_arquivado' using errcode = 'P0001';
    end if;
  end if;

  -- Para quem.
  if not v_central then
    v_da_central := false;
    v_consultoria := v_minha;
  elsif p_id is not null and not v_atual_da_central then
    if v_para is not null and v_para_id is distinct from v_atual_consultoria then
      raise exception 'consultoria_invalida' using errcode = 'P0001';
    end if;
    v_da_central := false;
    v_consultoria := v_atual_consultoria;
  else
    v_da_central := true;
    if v_para = 'todas' then
      v_consultoria := null;
    elsif v_para_id is not null and exists (
      select 1 from public.consultorias c
      where c.id = v_para_id
        -- consultoria arquivada não recebe modelo; o que já era dela continua (salvar sem mudar o "para")
        and (c.arquivada_em is null or c.id = v_atual_consultoria)) then
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
