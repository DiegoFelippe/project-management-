-- Cartões de números abaixo da barra de filtros (pedido do Diego, 17/11): toda tela do menu mostra, logo depois da barra
-- "Filtros", até 4 números relevantes. Os números são contados aqui, no banco, no recorte de quem vê (o mesmo da lista
-- da tela), nunca somados na tela. Uma função por tela, security definer, search_path vazio e plano por chamada
-- (force_custom_plan: "v_x is null or coluna = v_x" vira o filtro certo e vai pelo índice), sempre pelo liberado()
-- (sou_central, sou_dono, sou_admin e gerencio_consultoria já passam por ele):
--   indicadores_de_clientes, indicadores_de_times, indicadores_de_usuarios, indicadores_de_consultorias e
--   indicadores_de_integracoes. O Início e o Calendário já têm as delas (painel_do_inicio e indicadores_da_agenda).
-- Os filtros de consultoria e de consultor da barra valem para os números; os de situação/aba e a busca, não (os cartões
-- mostram justamente a divisão por situação). Quem não é da central e pede outra consultoria continua na dele: uma
-- consultoria nunca conta a outra.
--
-- E a busca de Times sem acento: times.nome_busca (coluna gerada, como clientes.busca, perfis.nome_busca e
-- consultorias.nome_busca) com índice trigram, para o ilike '%termo%' continuar rápido com milhares de times.
--
-- Só acrescenta: nenhuma linha muda (a coluna nova é calculada do nome, que fica como está) e nada é apagado. Os índices
-- de que os números precisam já existem: clientes por consultoria/consultor, checkins por cliente e por consultor (com
-- o início), times por consultoria e por gestor, time_membros por time e por pessoa, perfis por consultoria e
-- integracoes por consultoria.

-- ── Times: busca sem acento ─────────────────────────────────────────────────
alter table public.times
  add column nome_busca text generated always as (private.sem_acento(nome)) stored;
create index times_nome_busca_idx on public.times using gin (nome_busca extensions.gin_trgm_ops);
-- Ler, como o nome (o RLS de times recorta as linhas como antes). Ninguém grava nela: é gerada.
grant select (nome_busca) on public.times to authenticated;

-- ── Clientes ────────────────────────────────────────────────────────────────
-- { recorte, ... } com os números do recorte de quem chama:
--   central e dono (recorte 'tudo', com p_consultoria): aguardando_consultoria, aguardando_consultor, em_atendimento e
--     arquivados;
--   administrador e gestor ('consultoria', sempre a dele): aguardando_consultor, em_atendimento, passaram_da_previsao e
--     sem_checkin_30_dias;
--   consultor ('pessoa', só os clientes dele; os filtros pedidos não valem): meus_clientes, passaram_da_previsao,
--     horas_no_mes e sem_checkin_30_dias.
-- p_consultor (uma pessoa) e p_sem_consultor (só quem está sem consultor) são o filtro Consultor da barra.
-- "Passaram da previsão no mês": ativos cujo realizado do mês (todos os check-ins fechados do cliente no mês, arredondado
-- a 0,1 h, como realizado_no_mes e o selo "Passou da previsão" da lista) passa das horas previstas.
-- "Sem check-in há 30 dias": ativos com consultor há mais de 30 dias e nenhum check-in (de ninguém) nesses 30 dias.
-- "Horas no mês": check-ins fechados do consultor no mês, na consultoria dele (o Realizado do Início).
create function public.indicadores_de_clientes(p_consultoria uuid default null, p_consultor uuid default null,
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

-- ── Times ───────────────────────────────────────────────────────────────────
-- { times, pessoas_em_times, pessoas_sem_time, times_sem_membros } no recorte da lista de Times (a regra de leitura de
-- times): central e dono, todos (ou os de p_consultoria); administrador, os da consultoria; gestor e consultor, os que
-- ele lidera ou dos quais é membro. Pessoas em times: pessoas ativas que são membro ou gestor de um desses times.
-- Pessoas sem time: pessoas ativas da consultoria (administrador, gestor e consultor) que quem chama vê (como em
-- Usuários: o gestor vê a si, quem ele criou e quem está nos times dele) e que não estão em time nenhum, nem como
-- gestor. Times sem membros: times com ninguém além do gestor (o gestor é obrigatório e não sai enquanto lidera).
create function public.indicadores_de_times(p_consultoria uuid default null) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_recorte text;
  v_consultoria uuid;
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
    v_consultoria := p_consultoria;
  elsif private.sou_admin() then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() then
    v_recorte := 'proprio';
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with vistos as (
    select t.id, t.gestor_id
    from public.times t
    where (v_consultoria is null or t.consultoria_id = v_consultoria)
      and (v_recorte <> 'proprio' or t.gestor_id = v_eu
        or exists (select 1 from public.time_membros m where m.time_id = t.id and m.pessoa_id = v_eu))
  ),
  nos_times as (
    select m.pessoa_id as id from public.time_membros m join vistos v on v.id = m.time_id
    union
    select v.gestor_id from vistos v
  ),
  pessoas as (
    select p.id
    from public.perfis p
    where p.ativo
      and p.papel in ('admin', 'gestor', 'pessoa')
      and (v_consultoria is null or p.consultoria_id = v_consultoria)
      and (v_recorte <> 'proprio' or p.id = v_eu or p.criado_por = v_eu or exists (
        select 1 from public.time_membros m join public.times t on t.id = m.time_id
        where m.pessoa_id = p.id and t.gestor_id = v_eu))
  )
  select jsonb_build_object(
    'times', (select count(*) from vistos),
    'pessoas_em_times', (select count(*) from nos_times n join public.perfis p on p.id = n.id where p.ativo),
    'pessoas_sem_time', (
      select count(*) from pessoas p
      where not exists (select 1 from public.time_membros m where m.pessoa_id = p.id)
        and not exists (select 1 from public.times t where t.gestor_id = p.id)),
    'times_sem_membros', (
      select count(*) from vistos v where not exists (select 1 from public.time_membros m where m.time_id = v.id)))
  into v_resultado;
  return v_resultado;
end $$;

-- ── Usuários ────────────────────────────────────────────────────────────────
-- { mes, passado, pessoas_ativas, ocupacao_media, acima_de_100, sem_tipo } no recorte da lista de Usuários (a regra de
-- leitura de perfis, sem o dono): central e dono, todas (ou as de p_consultoria); administrador, a consultoria; gestor,
-- ele, quem ele criou e quem está nos times dele. Ocupação no mês p_mes (nulo = o atual), pela mesma conta da coluna
-- Ocupação (ocupacao_dos_consultores; mês passado = utilização, passado true): ocupacao_media é a média da coluna entre
-- quem tem capacidade (arredondada como ela) e acima_de_100 conta quem passa de 100%. sem_tipo: pessoas ativas da
-- consultoria (administrador, gestor e consultor) sem tipo de consultoria.
create function public.indicadores_de_usuarios(p_mes date default null, p_consultoria uuid default null) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_eu uuid := (select auth.uid());
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
  v_recorte text;
  v_consultoria uuid;
  v_ids uuid[];
  v_resultado jsonb;
begin
  if private.sou_central() then
    v_recorte := 'tudo';
    v_consultoria := p_consultoria;
  elsif private.sou_admin() then
    v_recorte := 'consultoria';
    v_consultoria := private.consultoria_atual();
  elsif private.liberado() then
    v_recorte := 'proprio';
    v_consultoria := private.consultoria_atual();
    select coalesce(array_agg(p.id), '{}') into v_ids
    from public.perfis p
    where p.id = v_eu or (p.consultoria_id = v_consultoria and (p.criado_por = v_eu or exists (
      select 1 from public.time_membros m join public.times t on t.id = m.time_id
      where m.pessoa_id = p.id and t.gestor_id = v_eu)));
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with pessoas as (
    select p.ativo, p.papel, p.tipos_de_consultoria
    from public.perfis p
    where p.papel <> 'dono'
      and (v_consultoria is null or p.consultoria_id = v_consultoria)
      and (v_ids is null or p.id = any(v_ids))
  ),
  numeros as (
    select x.taxa, round(x.taxa, 4) as coluna
    from private.ocupacao_dos_consultores(v_consultoria, v_inicio, v_ids) x
  )
  select jsonb_build_object(
    'mes', v_inicio,
    'passado', v_inicio < v_mes_atual,
    'pessoas_ativas', (select count(*) from pessoas where ativo),
    'ocupacao_media', (select round(avg(coluna), 4) from numeros where coluna is not null),
    'acima_de_100', (select count(*) from numeros where taxa > 1),
    'sem_tipo', (select count(*) from pessoas
      where ativo and papel in ('admin', 'gestor', 'pessoa') and tipos_de_consultoria = '{}'))
  into v_resultado;
  return v_resultado;
end $$;

-- ── Consultorias (central e dono) ───────────────────────────────────────────
-- { mes, passado, consultorias_ativas, clientes_ativos, consultores, ocupacao_media } de toda a plataforma no mês p_mes
-- (nulo = o atual). clientes_ativos: todos os não arquivados (o mesmo número do Início da central). consultores e
-- ocupacao_media seguem a tabela "Ocupação do mês" (consultorias_por_ocupacao): consultores = soma da coluna
-- Consultores; ocupacao_media = média da coluna Ocupação entre as consultorias ativas com capacidade (mês passado:
-- utilização, pelo realizado).
create function public.indicadores_de_consultorias(p_mes date default null) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date := coalesce(date_trunc('month', p_mes::timestamp)::date, v_mes_atual);
  v_de timestamptz := v_inicio::timestamp at time zone 'America/Sao_Paulo';
  v_ate timestamptz := (v_inicio + interval '1 month') at time zone 'America/Sao_Paulo';
  v_passado boolean := v_inicio < v_mes_atual;
  v_resultado jsonb;
begin
  if not private.sou_central() then
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with equipes as (
    select x.consultoria_id, count(*) as pessoas, sum(x.capacidade) as capacidade
    from private.capacidades_do_mes(null, v_inicio) x
    group by x.consultoria_id
  ),
  carteiras as (
    select c.consultoria_id, sum(c.horas_mes) as horas
    from public.clientes c
    where not c.arquivado and c.consultoria_id is not null
    group by c.consultoria_id
  ),
  feitos as (
    select k.consultoria_id, sum(extract(epoch from k.fim - k.inicio)) as segundos
    from public.checkins k
    where k.fim is not null and k.inicio >= v_de and k.inicio < v_ate
    group by k.consultoria_id
  ),
  linhas as (
    select case when e.capacidade > 0 then
        (case when v_passado then coalesce(round(f.segundos / 3600, 1), 0) else coalesce(w.horas, 0) end) / e.capacidade
      end as taxa
    from public.consultorias co
    left join equipes e on e.consultoria_id = co.id
    left join carteiras w on w.consultoria_id = co.id
    left join feitos f on f.consultoria_id = co.id
    where co.arquivada_em is null
  )
  select jsonb_build_object(
    'mes', v_inicio,
    'passado', v_passado,
    'consultorias_ativas', (select count(*) from public.consultorias co where co.arquivada_em is null),
    'clientes_ativos', (select count(*) from public.clientes c where not c.arquivado),
    'consultores', (select coalesce(sum(e.pessoas), 0) from equipes e),
    'ocupacao_media', (select round(avg(round(l.taxa, 4)), 4) from linhas l where l.taxa is not null))
  into v_resultado;
  return v_resultado;
end $$;

-- ── Integrações (dono e administrador, como a leitura da tabela) ────────────
-- { conectadas, com_erro, nao_configuradas, ultimo_teste }: administrador, a consultoria dele; dono, a de p_consultoria
-- ou (sem ela) todas as consultorias ativas. O catálogo tem 3 integrações por consultoria (ia, smtp e google: a regra
-- da coluna tipo); não configurada = sem linha. ultimo_teste: o ultimo_teste_em mais recente (nulo se nunca testou).
create function public.indicadores_de_integracoes(p_consultoria uuid default null) returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_consultoria uuid;
  v_resultado jsonb;
begin
  if private.sou_dono() then
    v_consultoria := p_consultoria;
  elsif private.sou_admin() then
    v_consultoria := private.consultoria_atual();
  else
    raise exception 'sem_permissao' using errcode = 'P0001';
  end if;

  with cons as (
    select co.id
    from public.consultorias co
    where (v_consultoria is null and co.arquivada_em is null) or co.id = v_consultoria
  )
  select jsonb_build_object(
    'conectadas', count(*) filter (where i.situacao = 'conectada'),
    'com_erro', count(*) filter (where i.situacao = 'com_erro'),
    'nao_configuradas', 3 * (select count(*) from cons) - count(*),
    'ultimo_teste', max(i.ultimo_teste_em))
  into v_resultado
  from public.integracoes i
  join cons c on c.id = i.consultoria_id;
  return v_resultado;
end $$;

revoke all on function public.indicadores_de_clientes(uuid, uuid, boolean), public.indicadores_de_times(uuid),
  public.indicadores_de_usuarios(date, uuid), public.indicadores_de_consultorias(date),
  public.indicadores_de_integracoes(uuid) from public, anon;
grant execute on function public.indicadores_de_clientes(uuid, uuid, boolean), public.indicadores_de_times(uuid),
  public.indicadores_de_usuarios(date, uuid), public.indicadores_de_consultorias(date),
  public.indicadores_de_integracoes(uuid) to authenticated;
