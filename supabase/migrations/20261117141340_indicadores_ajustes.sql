-- Ajuste dos cartões de Clientes (revisão de 17/11): "Passaram da previsão no mês" somava TODOS os check-ins do mês do
-- cliente (a função é security definer), mas o selo "Passou da previsão" da lista usa realizado_no_mes com o RLS de quem
-- olha: a gestão vê os check-ins da consultoria (e os próprios) e o consultor, os próprios. Um cliente que passou da A
-- para a B no meio do mês fazia a B contar as horas da A. Agora a soma usa só os check-ins que quem chama enxerga, a
-- mesma regra de "ver check-ins conforme o papel" (a central não tem esse cartão).
--
-- Mesma assinatura: create or replace mantém os grants (authenticated executa; public e anon não) e as proteções.
-- Nenhum dado muda.

create or replace function public.indicadores_de_clientes(p_consultoria uuid default null, p_consultor uuid default null,
  p_sem_consultor boolean default false) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_de timestamptz := v_mes::timestamp at time zone 'America/Sao_Paulo';
  v_ate timestamptz := (v_mes + interval '1 month') at time zone 'America/Sao_Paulo';
  v_30 timestamptz := now() - interval '30 days';
  v_recorte text;
  v_consultoria uuid;
  v_consultor uuid := p_consultor;
  v_sem boolean := coalesce(p_sem_consultor, false);
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
    v_consultoria := p_consultoria;
  elsif private.gerencio_consultoria(private.consultoria_atual()) then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() then
    v_recorte := 'pessoa';
    v_consultoria := private.consultoria_atual();
    v_consultor := v_eu;
    v_sem := false;
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  if v_recorte = 'tudo' then
    select jsonb_build_object(
      'recorte', v_recorte,
      'aguardando_consultoria', count(*) filter (where not c.arquivado and c.consultoria_id is null),
      'aguardando_consultor', count(*) filter (where not c.arquivado and c.consultoria_id is not null and c.consultor_id is null),
      'em_atendimento', count(*) filter (where not c.arquivado and c.consultor_id is not null),
      'arquivados', count(*) filter (where c.arquivado))
    into v_resultado
    from public.clientes c
    where (v_consultoria is null or c.consultoria_id = v_consultoria)
      and (v_consultor is null or c.consultor_id = v_consultor)
      and (not v_sem or c.consultor_id is null);
    return v_resultado;
  end if;

  with ativos as (
    select c.id, c.consultor_id, c.horas_mes, c.consultor_desde, c.criado_em
    from public.clientes c
    where not c.arquivado
      and c.consultoria_id = v_consultoria
      and (v_consultor is null or c.consultor_id = v_consultor)
      and (not v_sem or c.consultor_id is null)
  ),
  feitos as (
    select k.cliente_id, round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1) as horas
    from public.checkins k
    join ativos a on a.id = k.cliente_id
    where k.fim is not null and k.inicio >= v_de and k.inicio < v_ate
      -- Só os check-ins que quem chama enxerga (a regra de leitura deles), como o selo da lista: a gestão, os da
      -- consultoria e os próprios; o consultor, os próprios.
      and (v_recorte <> 'consultoria' or k.consultoria_id = v_consultoria or k.consultor_id = v_eu)
      and (v_recorte <> 'pessoa' or k.consultor_id = v_eu)
    group by k.cliente_id
  ),
  numeros as (
    select
      count(*) as quantos,
      count(*) filter (where a.consultor_id is null) as sem_consultor,
      count(*) filter (where a.consultor_id is not null) as com_consultor,
      count(*) filter (where a.consultor_id is not null
        and coalesce(a.consultor_desde, a.criado_em) < v_30
        and not exists (select 1 from public.checkins k where k.cliente_id = a.id and k.inicio >= v_30)) as parados,
      (select count(*) from feitos f join ativos b on b.id = f.cliente_id where f.horas > b.horas_mes) as passaram
    from ativos a
  )
  select case when v_recorte = 'consultoria' then
      jsonb_build_object('recorte', v_recorte, 'aguardando_consultor', n.sem_consultor, 'em_atendimento', n.com_consultor,
        'passaram_da_previsao', n.passaram, 'sem_checkin_30_dias', n.parados)
    else
      jsonb_build_object('recorte', v_recorte, 'meus_clientes', n.quantos, 'passaram_da_previsao', n.passaram,
        'horas_no_mes', (
          select coalesce(round(sum(extract(epoch from k.fim - k.inicio)) / 3600, 1), 0)
          from public.checkins k
          where k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
            and k.inicio >= v_de and k.inicio < v_ate),
        'sem_checkin_30_dias', n.parados)
    end
  into v_resultado
  from numeros n;
  return v_resultado;
end $$;
