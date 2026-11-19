-- Gravar um evento da agenda (Edge Function agenda; desenho: docs/superpowers/specs/2026-11-16-calendario-design.md,
-- "Janela de evento" e "Google — conta de cada consultor").
-- O evento e a lista inteira de participantes vão numa transação só. As regras de consistência são as dos gatilhos e
-- restrições que já existem (consultor, cliente e participantes da consultoria do evento; até 20 convidados de fora,
-- com e-mail válido e sem repetir; fim depois do início; até 31 dias): esta função não repete nenhuma delas.
-- - p_novo: cria com o id que a tela escolheu (dele sai o id do evento no Google, para uma nova tentativa não duplicar
--   o evento lá). Se o evento já existe com o mesmo consultor, é a mesma criação repetida (a resposta da anterior se
--   perdeu) e vira edição; com outro consultor, é recusada.
-- - Sem p_novo: edita, e o evento precisa existir com o mesmo consultor (não ressuscita evento apagado no meio do
--   caminho, e o consultor do evento não muda).
-- - p_ensaio: faz tudo e desfaz no fim. A Edge Function ensaia antes de mexer no Google: o que o banco recusaria
--   aparece antes, e o Google não fica com um evento que o app não tem.
-- Quem pode mexer em qual evento (consultor, gestão, central) a Edge Function confere antes, pelo papel de quem chama;
-- o navegador não executa esta função.

create function private.gravar_evento(p_evento jsonb, p_participantes uuid[], p_convidados text[], p_novo boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_evento ->> 'id')::uuid;
  v_consultor uuid := (p_evento ->> 'consultor_id')::uuid;
  v_editar boolean := not coalesce(p_novo, false);
  v_dono uuid;
begin
  if v_id is null or v_consultor is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;

  if not v_editar then
    insert into public.agenda_eventos (id, consultoria_id, consultor_id, cliente_id, titulo, descricao, inicio, fim,
      dia_inteiro, cor, com_meet, gravar, meet_link, meet_codigo, google_evento_id, criado_por)
    values (v_id, (p_evento ->> 'consultoria_id')::uuid, v_consultor, (p_evento ->> 'cliente_id')::uuid,
      p_evento ->> 'titulo', p_evento ->> 'descricao', (p_evento ->> 'inicio')::timestamptz,
      (p_evento ->> 'fim')::timestamptz, coalesce((p_evento ->> 'dia_inteiro')::boolean, false),
      coalesce((p_evento ->> 'cor')::smallint, 0), coalesce((p_evento ->> 'com_meet')::boolean, false),
      coalesce((p_evento ->> 'gravar')::boolean, false), p_evento ->> 'meet_link', p_evento ->> 'meet_codigo',
      p_evento ->> 'google_evento_id', (p_evento ->> 'criado_por')::uuid)
    on conflict (id) do nothing;
    if not found then
      select e.consultor_id into v_dono from public.agenda_eventos e where e.id = v_id;
      if v_dono is distinct from v_consultor then
        raise exception 'sem_permissao' using errcode = 'P0001';
      end if;
      v_editar := true;
    end if;
  end if;

  if v_editar then
    update public.agenda_eventos e set
      cliente_id = (p_evento ->> 'cliente_id')::uuid,
      titulo = p_evento ->> 'titulo',
      descricao = p_evento ->> 'descricao',
      inicio = (p_evento ->> 'inicio')::timestamptz,
      fim = (p_evento ->> 'fim')::timestamptz,
      dia_inteiro = coalesce((p_evento ->> 'dia_inteiro')::boolean, false),
      cor = coalesce((p_evento ->> 'cor')::smallint, 0),
      com_meet = coalesce((p_evento ->> 'com_meet')::boolean, false),
      gravar = coalesce((p_evento ->> 'gravar')::boolean, false),
      meet_link = p_evento ->> 'meet_link',
      meet_codigo = p_evento ->> 'meet_codigo',
      google_evento_id = p_evento ->> 'google_evento_id'
    where e.id = v_id and e.consultor_id = v_consultor;
    if not found then
      raise exception 'evento_nao_encontrado' using errcode = 'P0001';
    end if;
  end if;

  -- A lista inteira: sai quem não está mais; quem continua guarda a resposta; quem chegou entra pendente.
  delete from public.agenda_participantes pt
  where pt.evento_id = v_id
    and case
      when pt.perfil_id is not null then pt.perfil_id <> all (coalesce(p_participantes, '{}'))
      else lower(pt.email) <> all (array(select lower(btrim(x)) from unnest(coalesce(p_convidados, '{}')) x))
    end;

  insert into public.agenda_participantes (evento_id, perfil_id)
  select v_id, x from unnest(coalesce(p_participantes, '{}')) x
  on conflict (evento_id, perfil_id) do nothing;

  -- Repetido na mesma lista não é filtrado aqui: o índice único (sem diferenciar maiúsculas) recusa.
  insert into public.agenda_participantes (evento_id, email)
  select v_id, btrim(x) from unnest(coalesce(p_convidados, '{}')) x
  where not exists (
    select 1 from public.agenda_participantes pt where pt.evento_id = v_id and lower(pt.email) = lower(btrim(x))
  );

  return v_id;
end $$;

create function public.gravar_evento_da_agenda(p_evento jsonb, p_participantes uuid[] default '{}',
  p_convidados text[] default '{}', p_novo boolean default false, p_ensaio boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_json jsonb;
begin
  begin
    v_id := private.gravar_evento(p_evento, p_participantes, p_convidados, p_novo);
    if p_ensaio then
      raise exception 'ensaio_ok';
    end if;
  exception when raise_exception then
    -- O ensaio termina aqui: o bloco desfaz o que gravou. Os erros de verdade sobem como vieram (mesmo código).
    if sqlerrm = 'ensaio_ok' then
      return jsonb_build_object('ensaio', true);
    end if;
    raise;
  end;
  select private.evento_em_json(e) into v_json from public.agenda_eventos e where e.id = v_id;
  return v_json;
end $$;

revoke all on function private.gravar_evento(jsonb, uuid[], text[], boolean) from public, anon, authenticated;
revoke all on function public.gravar_evento_da_agenda(jsonb, uuid[], text[], boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.gravar_evento_da_agenda(jsonb, uuid[], text[], boolean, boolean) to service_role;
