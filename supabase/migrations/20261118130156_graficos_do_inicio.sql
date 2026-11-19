-- Gráficos do Início, as funções (design 2026-11-17-graficos-do-inicio-e-do-cliente; plano, Task 2). Sobre a base da
-- 20261118113545_historia_e_resumos_dos_graficos.sql (história da situação dos clientes, resumos por cliente e por dia
-- e os ajudantes de recorte e período):
-- - painel_do_inicio refeito: capacidade de cada mês do gráfico (o mês em andamento até hoje), clientes e aguardando no
--   fim do período efetivo (pela história num período passado), ocupação por unidade com até 12 (6 + 6) e o resumo
--   contado sobre todos; saem esperando, extremos, meus_clientes, previsao_atual e clientes_ativos/clientes_novos.
-- - Novas: comparacao_do_inicio, fila_de_clientes, clientes_em_risco, horas_por_cliente e checkins_por_semana, todas
--   com private.recorte_do_inicio e private.periodo_do_inicio (o mesmo recorte e as mesmas recusas em todas).
-- - Ajudantes: private.capacidades_por_mes, private.segundos_do_periodo e private.risco_dos_clientes.
-- - Acréscimos da revisão da T1: índices parciais dos check-ins abertos e private.fechar_checkins com um update pelo
--   cliente e outro pelo consultor (fechar check-in rápido ao trocar consultor); índices dos trechos com entrou; o
--   comentário de private.situacoes_dos_clientes; o revoke repetido de checkins_resumir_horas e recalcular_horas_mes.
-- Só acrescenta: índices e funções. Nenhuma linha de tabela nenhuma muda.

begin;

-- ── Índices ──────────────────────────────────────────────────────────────────
-- Os check-ins abertos de um cliente e de um consultor (fechar ao trocar o consultor, mover, arquivar ou ao sair):
-- poucas linhas, achadas sem ler a tabela.
create index checkins_abertos_cliente_idx on public.checkins (cliente_id) where fim is null;
create index checkins_abertos_consultor_idx on public.checkins (consultor_id) where fim is null;
-- Quem ganhou consultor num período (fila: novos, receberam consultor e espera até ter consultor).
create index situacoes_dos_clientes_entrou_idx on private.situacoes_dos_clientes (de) where entrou;
create index situacoes_dos_clientes_entrou_consultoria_idx on private.situacoes_dos_clientes (consultoria_id, de) where entrou;

comment on table private.situacoes_dos_clientes is
  'História da situação de cada cliente: um trecho por período com a mesma consultoria, o mesmo consultor e a mesma '
  'previsão, sem estar arquivado (ate nulo = a situação de agora). Mantida pelo gatilho clientes_situacao e refeita por '
  'private.situacoes_pelos_eventos; os dois concordam por construção quando a ordem de "em" dos eventos é a ordem das '
  'travas em clientes (quem grava depois de outra transação que começou antes usa o instante mais novo do cliente). '
  'Trecho de duração zero (de = ate: duas mudanças no mesmo comando ou na mesma transação) nunca conta numa contagem '
  'num instante (private.situacao_no_instante), mas o entrou dele conta: novos em atendimento, receberam consultor e a '
  'espera até ter consultor contam as linhas com entrou em qualquer duração (escolher o consultor e mudar a previsão no '
  'mesmo Salvar grava um trecho zero com entrou).';

-- ── Fechar check-ins ─────────────────────────────────────────────────────────
-- Mesmo corpo de 20261116135529_checkins.sql; muda só: plpgsql com dois update separados (um pelo cliente, outro pelo
-- consultor), cada um pelo índice parcial dos abertos. Com o "ou" de antes e um dos dois nulo, a consulta lia a
-- tabela inteira de check-ins a cada troca de consultor.
create or replace function private.fechar_checkins(p_cliente uuid, p_consultor uuid, p_nota text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_cliente is not null then
    update public.checkins k
    set fim = least(greatest(now(), k.inicio + interval '1 second'), k.inicio + interval '24 hours'),
        descricao = case when char_length(btrim(coalesce(k.descricao, ''))) >= 2 then k.descricao else p_nota end
    where k.fim is null
      and k.cliente_id = p_cliente;
  end if;
  if p_consultor is not null then
    update public.checkins k
    set fim = least(greatest(now(), k.inicio + interval '1 second'), k.inicio + interval '24 hours'),
        descricao = case when char_length(btrim(coalesce(k.descricao, ''))) >= 2 then k.descricao else p_nota end
    where k.fim is null
      and k.consultor_id = p_consultor;
  end if;
end $$;

-- ── Ajudantes ────────────────────────────────────────────────────────────────
-- Capacidade de cada mês de p_de_mes a p_ate_mes: a soma das capacidades de cada consultor no mês, cada uma
-- arredondada como em private.capacidades_do_periodo (dias úteis sem feriado nacional e sem ausência x carga semanal /
-- 5, com 1 casa); o mês em andamento só até hoje. Os consultores de hoje (como todo o app). Sem regra de acesso: quem
-- usa confere quem pergunta.
create function private.capacidades_por_mes(p_consultoria uuid, p_ids uuid[], p_de_mes date, p_ate_mes date)
returns table (mes date, capacidade numeric)
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_de date := date_trunc('month', p_de_mes::timestamp)::date;
  v_ate_mes date := date_trunc('month', p_ate_mes::timestamp)::date;
  v_ate date := (date_trunc('month', p_ate_mes::timestamp) + interval '1 month - 1 day')::date;
begin
  return query
  with meses as (
    select g::date as mes,
      case when g::date = v_mes_atual then v_hoje else (g + interval '1 month - 1 day')::date end as ate
    from generate_series(v_de::timestamp, v_ate_mes::timestamp, interval '1 month') g
  ),
  feriados as (
    select f as dia
    from generate_series(extract(year from v_de)::int, extract(year from v_ate)::int) a
    cross join lateral private.feriados_nacionais(a) f
  ),
  dias as (
    select m.mes, d::date as dia
    from meses m
    cross join lateral generate_series(m.mes::timestamp, m.ate::timestamp, interval '1 day') d
    where extract(isodow from d) < 6
      and d::date not in (select f.dia from feriados f)
  ),
  uteis as (
    select d.mes, count(*) as n from dias d group by d.mes
  ),
  consultores as (
    select p.id, p.carga_semanal
    from public.perfis p
    join public.consultorias c on c.id = p.consultoria_id
    where p.ativo
      and p.papel in ('admin', 'gestor', 'pessoa')
      and c.arquivada_em is null
      and (p_consultoria is null or p.consultoria_id = p_consultoria)
      and (p_ids is null or p.id = any(p_ids))
  ),
  -- Ausências podem se sobrepor: cada dia útil conta uma vez.
  ausentes as (
    select a.perfil_id, d.mes, count(distinct d.dia) as dias
    from public.ausencias a
    join dias d on d.dia between a.de and a.ate
    where a.perfil_id in (select x.id from consultores x)
      and a.de <= v_ate
      and a.ate >= v_de
    group by a.perfil_id, d.mes
  )
  select m.mes,
    coalesce(sum(round((coalesce(u.n, 0) - coalesce(f.dias, 0)) * x.carga_semanal / 5, 1)), 0)
  from meses m
  left join uteis u on u.mes = m.mes
  left join consultores x on true
  left join ausentes f on f.perfil_id = x.id and f.mes = m.mes
  group by m.mes;
end $$;

-- Segundos fechados (check-ins que começam entre p_de e p_ate, dias de São Paulo) de uma consultoria ou, nula, de
-- todas as não arquivadas: a conta do realizado do painel num período. Meses inteiros pelo resumo por mês; as bordas
-- (pedaços de mês), direto dos check-ins, uma borda por vez (cada uma é uma faixa só do índice por data).
create function private.segundos_do_periodo(p_consultoria uuid, p_de date, p_ate date)
returns numeric
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_de timestamptz := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_ate timestamptz := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_cheio_de date := date_trunc('month', (p_de - 1) + interval '1 month')::date;
  v_cheio_ate date := date_trunc('month', (p_ate + 1)::timestamp)::date;
  v_borda1_ate timestamptz;
  v_borda2_de timestamptz;
  v_segundos numeric;
begin
  if v_cheio_de >= v_cheio_ate then
    v_cheio_de := p_ate + 1;
    v_cheio_ate := p_ate + 1;
    v_borda1_ate := v_ate;
    v_borda2_de := v_ate;
  else
    v_borda1_ate := v_cheio_de::timestamp at time zone 'America/Sao_Paulo';
    v_borda2_de := v_cheio_ate::timestamp at time zone 'America/Sao_Paulo';
  end if;

  select coalesce(sum(t.segundos), 0) into v_segundos
  from (
    select r.segundos
    from public.checkins_horas_mes r
    where r.mes >= v_cheio_de and r.mes < v_cheio_ate
      and (p_consultoria is null or r.consultoria_id = p_consultoria)
      and r.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    union all
    select extract(epoch from k.fim - k.inicio)
    from public.checkins k
    where k.fim is not null
      and k.inicio >= v_de and k.inicio < v_borda1_ate
      and (p_consultoria is null or k.consultoria_id = p_consultoria)
      and k.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    union all
    select extract(epoch from k.fim - k.inicio)
    from public.checkins k
    where k.fim is not null
      and k.inicio >= v_borda2_de and k.inicio < v_ate
      and (p_consultoria is null or k.consultoria_id = p_consultoria)
      and k.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
  ) t;
  return v_segundos;
end $$;

-- O risco de hoje de cada cliente com consultor e não arquivado (de uma consultoria, de um consultor ou um cliente só;
-- nulos = todos):
-- - sem_checkin: a regra de indicadores_de_clientes (consultor há mais de 30 dias, pelo consultor_desde ou o cadastro,
--   e nenhum check-in, de consultoria nenhuma, começado nos últimos 30 dias);
-- - horas_30 e ritmo: horas fechadas começadas nos últimos 30 dias na consultoria atual do cliente (de todos os
--   consultores dela) ÷ (previsão × 30 / 30,4); ritmo nulo com menos de 30 dias de consultor; acima = ritmo > 1,2;
-- - ultimo_checkin: o último check-in do cliente na consultoria atual (só a data); sem_checkin_dias: dias desde ele
--   (ou, sem nenhum, desde que ganhou o consultor);
-- - nota = o maior entre dias ÷ 30 e ritmo ÷ 1,2 (a ordem da lista).
-- Os check-ins dos últimos 30 dias são lidos uma vez (pelo índice da consultoria e início; de todos, pelo índice por
-- data; de um cliente, pelo índice do cliente). O último check-in mais antigo e a conferência em outra consultoria só
-- rodam para quem não teve check-in na consultoria nos 30 dias (cada um por uma busca no índice do cliente).
create function private.risco_dos_clientes(p_consultoria uuid, p_consultor uuid, p_cliente uuid)
returns table (cliente_id uuid, ultimo_checkin date, sem_checkin_dias int, horas_30 numeric, ritmo numeric,
  sem_checkin boolean, acima_do_ritmo boolean, nota numeric)
language plpgsql stable set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_30 timestamptz := now() - interval '30 days';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return query
  with alvo as (
    select c.id, c.consultoria_id, c.horas_mes, coalesce(c.consultor_desde, c.criado_em) as desde
    from public.clientes c
    where not c.arquivado
      and c.consultor_id is not null
      and (p_consultoria is null or c.consultoria_id = p_consultoria)
      and (p_consultor is null or c.consultor_id = p_consultor)
      and (p_cliente is null or c.id = p_cliente)
  ),
  recentes as (
    select k.cliente_id, max(k.inicio) as ultimo,
      coalesce(sum(extract(epoch from k.fim - k.inicio)) filter (where k.fim is not null), 0) as segundos
    from public.checkins k
    join alvo a on a.id = k.cliente_id and a.consultoria_id = k.consultoria_id
    where k.inicio >= v_30
      and (p_consultoria is null or k.consultoria_id = p_consultoria)
      and (p_cliente is null or k.cliente_id = p_cliente)
    group by k.cliente_id
  ),
  base as (
    select a.id, a.horas_mes, a.desde, a.desde < v_30 as antigo, coalesce(r.segundos, 0) as segundos,
      case when r.ultimo is not null then r.ultimo else (
        select k.inicio from public.checkins k
        where k.cliente_id = a.id and k.consultoria_id = a.consultoria_id
        order by k.inicio desc limit 1) end as ultimo,
      a.desde < v_30 and r.cliente_id is null
        and not exists (select 1 from public.checkins k where k.cliente_id = a.id and k.inicio >= v_30) as sem
    from alvo a
    left join recentes r on r.cliente_id = a.id
  ),
  calculo as (
    select b.id, (b.ultimo at time zone 'America/Sao_Paulo')::date as ultimo_dia,
      v_hoje - coalesce((b.ultimo at time zone 'America/Sao_Paulo')::date, (b.desde at time zone 'America/Sao_Paulo')::date) as dias,
      round(b.segundos / 3600, 1) as horas,
      case when b.antigo then round(b.segundos / 3600 / (b.horas_mes * 30 / 30.4), 4) end as ritmo,
      b.sem
    from base b
  )
  select c.id, c.ultimo_dia, c.dias, c.horas, c.ritmo, c.sem, coalesce(c.ritmo > 1.2, false),
    round(greatest(c.dias / 30.0, coalesce(c.ritmo, 0) / 1.2), 4)
  from calculo c;
end $$;

-- ── Painel do Início ─────────────────────────────────────────────────────────
-- Mesmo corpo de 20261117184913_painel_periodo_bordas_separadas.sql; muda só:
-- - recorte e período pelos ajudantes (private.recorte_do_inicio e private.periodo_do_inicio: as mesmas regras e
--   frases de antes, num lugar só) e ate_efetivo (o fim do período, nunca depois de hoje);
-- - horas_por_mes ganha capacidade (private.capacidades_por_mes: o mês em andamento só até hoje) e parcial (o mês em
--   andamento); indicadores ganham capacidade_ate_hoje, clientes_em_atendimento (com consultor) e checkins (consultor);
-- - clientes e aguardando no fim do período efetivo: agora, se ele vai até hoje; senão pela história
--   (private.situacao_no_instante);
-- - ranking com até 12 (com mais, os 6 mais ocupados e os 6 com mais folga), realizado, reservado e pessoas (central),
--   e ranking_resumo { total, acima, folga, no_meio } contado sobre todos;
-- - saem esperando (fila_de_clientes), extremos (ranking_resumo), meus_clientes (horas_por_cliente), previsao_atual (o
--   reservado continua em indicadores) e clientes_ativos/clientes_novos.
create or replace function public.painel_do_inicio(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
#variable_conflict use_column
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_intervalo boolean;
  v_inicio date;       -- mês do painel: o pedido (Mês) ou o do fim do período (links para Usuários e Consultorias)
  v_de_dia date;       -- primeiro dia do período (inclusive)
  v_ate_dia date;      -- último dia do período (inclusive)
  v_ate_efetivo date;  -- o fim, nunca depois de hoje (antes de v_de_dia: período efetivo vazio, um Mês futuro)
  v_de timestamptz;    -- [v_de, v_ate): o período em instantes de São Paulo
  v_ate timestamptz;
  v_cheio_de date;     -- meses inteiros dentro do período, [v_cheio_de, v_cheio_ate): saem do resumo por mês
  v_cheio_ate date;
  v_borda1_de timestamptz; -- bordas (pedaços de mês) lidas direto dos check-ins: [v_de, v_cheio_de) e [v_cheio_ate, v_ate)
  v_borda1_ate timestamptz;
  v_borda2_de timestamptz;
  v_borda2_ate timestamptz;
  v_graf_de date;      -- primeiro mês do gráfico (o último é v_inicio)
  v_passado boolean;   -- sem previsão: mês passado ou qualquer período
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_em_atendimento int; -- clientes no fim do período efetivo
  v_a_distribuir int;
  v_sem_consultor int;
  v_checkins int;       -- check-ins fechados do consultor no período efetivo (só no recorte pessoa)
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.mes, p.de, p.ate, p.ate_efetivo, p.intervalo, p.passado
  into v_inicio, v_de_dia, v_ate_dia, v_ate_efetivo, v_intervalo, v_passado
  from private.periodo_do_inicio(p_mes, p_de, p_ate) p;

  v_de := v_de_dia::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (v_ate_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
  -- Primeiro mês inteiro: o do início, se começa no dia 1, senão o seguinte; fim (exclusivo): o mês do fim, se acaba
  -- no último dia, senão o próprio mês do fim. Sem mês inteiro, o período todo é borda.
  v_cheio_de := date_trunc('month', (v_de_dia - 1) + interval '1 month')::date;
  v_cheio_ate := date_trunc('month', (v_ate_dia + 1)::timestamp)::date;
  if v_cheio_de >= v_cheio_ate then
    v_cheio_de := v_ate_dia + 1;
    v_cheio_ate := v_ate_dia + 1;
    v_borda1_de := v_de;
    v_borda1_ate := v_ate;
    v_borda2_de := v_ate;
    v_borda2_ate := v_ate;
  else
    v_borda1_de := v_de;
    v_borda1_ate := v_cheio_de::timestamp at time zone 'America/Sao_Paulo';
    v_borda2_de := v_cheio_ate::timestamp at time zone 'America/Sao_Paulo';
    v_borda2_ate := v_ate;
  end if;
  -- Gráfico: os meses tocados pelo período, no mínimo 6 e no máximo 24, terminando no mês do fim.
  v_graf_de := least((v_inicio - interval '5 months')::date,
    greatest(date_trunc('month', v_de_dia::timestamp)::date, (v_inicio - interval '23 months')::date));

  -- Clientes no fim do período efetivo: agora (a regra de indicadores_de_clientes), se ele vai até hoje; num período
  -- passado, pela história, no último instante do último dia.
  if v_ate_efetivo >= v_hoje then
    select count(*) filter (where c.consultor_id is not null),
      count(*) filter (where c.consultoria_id is null),
      count(*) filter (where c.consultoria_id is not null and c.consultor_id is null)
    into v_em_atendimento, v_a_distribuir, v_sem_consultor
    from public.clientes c
    where not c.arquivado
      and (v_recorte = 'tudo'
        or (v_recorte = 'consultoria' and c.consultoria_id = v_consultoria)
        or (v_recorte = 'pessoa' and c.consultoria_id = v_consultoria and c.consultor_id = v_eu));
  else
    select s.em_atendimento, s.a_distribuir, s.sem_consultor
    into v_em_atendimento, v_a_distribuir, v_sem_consultor
    from private.situacao_no_instante(v_recorte, v_consultoria, v_eu,
      (v_ate_efetivo + 1)::timestamp at time zone 'America/Sao_Paulo' - interval '1 microsecond') s;
  end if;

  if v_recorte = 'pessoa' then
    select count(*)::int into v_checkins
    from public.checkins k
    where k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_de and k.inicio < (v_ate_efetivo + 1)::timestamp at time zone 'America/Sao_Paulo';
  end if;

  with
  -- Consultores no recorte (todos da consultoria; só quem chama, no recorte pessoa), com os números do mês (Mês) ou
  -- do período (utilização, sem reservado; meses inteiros pelo resumo por consultor, capacidade até hoje). Só um dos
  -- dois lados roda: o outro tem o filtro sempre falso.
  quem as (
    select p.id, p.nome, p.consultoria_id, co.nome as consultoria_nome,
      x.capacidade, x.reservado, x.realizado, x.taxa
    from (
      -- Mês da central e da consultoria: como antes (a mesma conta de Usuários e Consultorias).
      select o.id, o.capacidade, o.reservado, o.realizado, o.taxa
      from private.ocupacao_dos_consultores(v_consultoria, v_inicio, null) o
      where not v_intervalo and v_recorte <> 'pessoa'
      union all
      -- Mês do consultor: a mesma conta, com o mês inteiro pelo resumo por consultor (sem ler check-ins) e o reservado
      -- da carteira dele na consultoria (taxa = reservado / capacidade; no mês passado, realizado / capacidade).
      select o.id, o.capacidade, coalesce(w.horas, 0), o.realizado,
        case when o.capacidade > 0 then (case when v_passado then o.realizado else coalesce(w.horas, 0) end) / o.capacidade end
      from private.ocupacao_do_periodo(v_consultoria, v_de_dia, v_ate_dia, array[v_eu]) o
      left join (
        select sum(c.horas_mes) as horas from public.clientes c
        where not c.arquivado and c.consultor_id = v_eu and c.consultoria_id = v_consultoria
      ) w on true
      where not v_intervalo and v_recorte = 'pessoa'
      union all
      -- Período: utilização, com a capacidade só até hoje (nada no futuro: o realizado também só vai até agora).
      select o.id, o.capacidade, 0::numeric, o.realizado, o.taxa
      from private.ocupacao_do_periodo(v_consultoria, v_de_dia, least(v_ate_dia, v_hoje),
        case when v_recorte = 'pessoa' then array[v_eu] end) o
      where v_intervalo
    ) x
    join public.perfis p on p.id = x.id
    left join public.consultorias co on co.id = p.consultoria_id
  ),
  -- Por consultoria (tudo e consultoria), como consultorias_por_ocupacao: reservado inclui quem espera consultor.
  -- Só no Mês (no período não há reservado).
  carteiras as (
    select c.consultoria_id, sum(c.horas_mes) as horas
    from public.clientes c
    where v_recorte <> 'pessoa'
      and not v_intervalo
      and not c.arquivado
      and c.consultoria_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
    group by c.consultoria_id
  ),
  -- Horas fechadas por consultoria e mês (tabela resumo, mantida por gatilho), lidas uma vez só nos meses do
  -- gráfico: delas saem as barras e os meses inteiros do realizado (que estão sempre entre os meses do gráfico,
  -- porque o período tem no máximo 2 anos).
  historico as (
    select r.consultoria_id, r.mes, r.segundos
    from public.checkins_horas_mes r
    where v_recorte <> 'pessoa'
      and r.mes >= v_graf_de and r.mes <= v_inicio
      and (v_consultoria is null or r.consultoria_id = v_consultoria)
  ),
  -- Realizado do período por consultoria: os meses inteiros vêm do resumo; as bordas (pedaços de mês), direto dos
  -- check-ins fechados. No Mês não há borda: é o resumo do mês, como antes.
  feitos as (
    select t.consultoria_id, sum(t.segundos) as segundos
    from (
      select h.consultoria_id, h.segundos
      from historico h
      where h.mes >= v_cheio_de and h.mes < v_cheio_ate
      union all
      -- Uma borda por vez: cada uma é uma faixa só do índice por data (juntas num "ou", o planejador lia a tabela toda).
      select k.consultoria_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where v_recorte <> 'pessoa'
        and k.fim is not null
        and k.inicio >= v_borda1_de and k.inicio < v_borda1_ate
        and (v_consultoria is null or k.consultoria_id = v_consultoria)
      union all
      select k.consultoria_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where v_recorte <> 'pessoa'
        and k.fim is not null
        and k.inicio >= v_borda2_de and k.inicio < v_borda2_ate
        and (v_consultoria is null or k.consultoria_id = v_consultoria)
    ) t
    group by t.consultoria_id
  ),
  equipes as (
    select q.consultoria_id, sum(q.capacidade) as capacidade, count(*) as pessoas from quem q group by q.consultoria_id
  ),
  cons as (
    select co.id, co.nome,
      coalesce(e.capacidade, 0) as capacidade,
      coalesce(e.pessoas, 0) as pessoas,
      coalesce(w.horas, 0) as reservado,
      coalesce(round(f.segundos / 3600, 1), 0) as realizado,
      coalesce(f.segundos, 0) as realizado_segundos
    from public.consultorias co
    left join equipes e on e.consultoria_id = co.id
    left join carteiras w on w.consultoria_id = co.id
    left join feitos f on f.consultoria_id = co.id
    where v_recorte <> 'pessoa'
      and co.arquivada_em is null
      and (v_consultoria is null or co.id = v_consultoria)
  ),
  cons_taxa as (
    select c.*, case when c.capacidade > 0 then
      (case when v_passado then c.realizado else c.reservado end) / c.capacidade end as taxa
    from cons c
  ),
  -- Realizado total: soma os SEGUNDOS e divide e arredonda uma vez só, no fim (a barra do mês no gráfico faz igual).
  -- Somar horas já divididas (ou arredondadas) por consultoria perde frações: 3 s + 3 s + 174 s dão 0,1 h, não 0,0.
  totais as (
    select coalesce(sum(t.capacidade), 0) as capacidade, coalesce(sum(t.reservado), 0) as reservado,
      round(coalesce(sum(t.segundos), 0) / 3600, 1) as realizado
    from (
      select capacidade, reservado, realizado_segundos as segundos from cons
      union all
      select capacidade, reservado, realizado * 3600 from quem where v_recorte = 'pessoa'
    ) t
  ),
  totais_taxa as (
    select t.*, case when t.capacidade > 0 then
      (case when v_passado then t.realizado else t.reservado end) / t.capacidade end as taxa
    from totais t
  ),
  -- Realizado de cada mês do gráfico (mês inteiro; tem histórico nos check-ins).
  meses as (
    select g::date as mes
    from generate_series(v_graf_de::timestamp, v_inicio::timestamp, interval '1 month') g
  ),
  horas as (
    select h.mes, round(sum(h.segundos) / 3600, 1) as horas
    from historico h
    where h.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by h.mes
    union all
    -- Consultor: os meses do gráfico pelo resumo por consultor (mês inteiro, como antes, sem ler check-ins).
    select r.mes, round(sum(r.segundos) / 3600, 1) as horas
    from private.checkins_horas_consultor_mes r
    where v_recorte = 'pessoa' and r.consultor_id = v_eu
      and r.mes >= v_graf_de and r.mes <= v_inicio
      and (v_consultoria is null or r.consultoria_id = v_consultoria)
      and r.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by r.mes
  ),
  -- Capacidade de cada mês do gráfico (a mesma conta de capacidades_do_periodo; o mês em andamento até hoje).
  capacidades as (
    select x.mes, x.capacidade
    from private.capacidades_por_mes(v_consultoria, case when v_recorte = 'pessoa' then array[v_eu] end, v_graf_de, v_inicio) x
  ),
  -- Ocupação por unidade: consultorias (central) ou consultores (gestão), do mais ao menos ocupado.
  unidades as (
    select c.id, c.nome, c.taxa, c.capacidade, c.realizado, c.reservado, c.pessoas
    from cons_taxa c where v_recorte = 'tudo'
    union all
    select q.id, q.nome, q.taxa, q.capacidade, q.realizado, q.reservado, null::bigint
    from quem q where v_recorte = 'consultoria'
  ),
  ordem as (
    select u.*, row_number() over (order by u.taxa desc nulls last, u.nome, u.id) as o, count(*) over () as total
    from unidades u
  ),
  -- Até 12, todos; com mais, os 6 mais ocupados e, dos outros, os 6 com mais folga (sem capacidade fica por último).
  mostradas as (
    select o.id from ordem o where o.total <= 12 or o.o <= 6
    union all
    select b.id
    from (
      select o.id, row_number() over (order by o.taxa asc nulls last, o.nome, o.id) as baixo
      from ordem o where o.total > 12 and o.o > 6
    ) b
    where b.baixo <= 6
  )
  select jsonb_build_object(
    'recorte', v_recorte,
    'mes', v_inicio,
    'intervalo', v_intervalo,
    'de', v_de_dia,
    'ate', v_ate_dia,
    'ate_efetivo', v_ate_efetivo,
    'passado', v_passado,
    -- No período, a capacidade conta só até hoje (dias que ainda não aconteceram não entram); no Mês, nulo.
    'capacidade_ate', case when v_intervalo then least(v_ate_dia, v_hoje) end,
    'indicadores', jsonb_build_object(
      'realizado', (select realizado from totais),
      'capacidade', (select capacidade from totais),
      -- A capacidade do período efetivo: no Mês atual, de 1º até hoje; no mês passado e no período, a capacidade; no
      -- Mês futuro (período efetivo vazio), 0.
      'capacidade_ate_hoje', case
        when v_ate_efetivo < v_de_dia then 0
        when not v_intervalo and v_inicio = v_mes_atual then
          (select coalesce(sum(c.capacidade), 0) from capacidades c where c.mes = v_mes_atual)
        else (select capacidade from totais) end,
      'reservado', (select case when not v_passado then reservado end from totais),
      'ocupacao', (select round(taxa, 4) from totais_taxa),
      'clientes_em_atendimento', v_em_atendimento,
      'aguardando', v_a_distribuir + v_sem_consultor,
      'a_distribuir', v_a_distribuir,
      'sem_consultor', v_sem_consultor,
      'checkins', v_checkins),
    'horas_por_mes', (
      select jsonb_agg(jsonb_build_object('mes', m.mes, 'realizado', coalesce(h.horas, 0),
        'capacidade', coalesce(c.capacidade, 0),
        'no_periodo', m.mes >= date_trunc('month', v_de_dia::timestamp)::date,
        'parcial', m.mes = v_mes_atual) order by m.mes)
      from meses m
      left join horas h on h.mes = m.mes
      left join capacidades c on c.mes = m.mes),
    'ranking', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'ocupacao', round(o.taxa, 4),
        'capacidade', o.capacidade, 'realizado', o.realizado,
        'reservado', case when not v_passado then o.reservado end)
        || case when v_recorte = 'tudo' then jsonb_build_object('pessoas', o.pessoas)
             else jsonb_build_object('visivel', private.vejo_perfil(o.id)) end
        order by o.o)
      from ordem o
      where o.id in (select m.id from mostradas m)), '[]'::jsonb),
    'ranking_resumo', (
      select jsonb_build_object('total', count(*),
        'acima', count(*) filter (where round(o.taxa, 4) > 1),
        'folga', count(*) filter (where round(o.taxa, 4) < 0.7),
        'no_meio', count(*) - (select count(*) from mostradas))
      from ordem o)
  ) into v_resultado;

  return v_resultado;
end $$;

-- ── Comparação com o período anterior ────────────────────────────────────────
-- Os números dos cartões no período anterior ao efetivo (private.periodo_anterior: os mesmos dias do mês anterior, as
-- mesmas datas do ano anterior ou os N dias logo antes), com a conta do painel:
-- - realizado: check-ins fechados que começam no anterior (meses inteiros pelo resumo, bordas direto);
-- - ocupação: no Mês atual, o reservado no fim do anterior (história) ÷ a capacidade do mês anterior inteiro (como o
--   painel: reservado ÷ capacidade do mês); senão, a utilização (realizado ÷ capacidade do anterior);
-- - clientes em atendimento e aguardando no fim do anterior, pela história; check-ins fechados do consultor.
-- Período efetivo vazio (Mês futuro, Personalizado que começa depois de hoje): tudo nulo (a tela esconde a variação).
create function public.comparacao_do_inicio(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_mes_atual date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_mes date;
  v_de date;
  v_ate_efetivo date;
  v_intervalo boolean;
  v_ant_de date;
  v_ant_ate date;
  v_forma text;
  v_capacidade numeric;
  v_capacidade_mes numeric;
  v_realizado numeric;
  v_ocupacao numeric;
  v_checkins int;
  v_em int;
  v_dist int;
  v_sem int;
  v_reservado numeric;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.mes, p.de, p.ate_efetivo, p.intervalo into v_mes, v_de, v_ate_efetivo, v_intervalo
  from private.periodo_do_inicio(p_mes, p_de, p_ate) p;
  select a.de, a.ate, a.forma into v_ant_de, v_ant_ate, v_forma
  from private.periodo_anterior(v_de, v_ate_efetivo, not v_intervalo) a;
  if v_forma is null then
    return jsonb_build_object('de', null, 'ate', null, 'forma', null, 'indicadores', null);
  end if;

  if v_recorte = 'pessoa' then
    select o.capacidade, o.realizado into v_capacidade, v_realizado
    from private.ocupacao_do_periodo(v_consultoria, v_ant_de, v_ant_ate, array[v_eu]) o;
    select count(*)::int into v_checkins
    from public.checkins k
    where k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_ant_de::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (v_ant_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
  else
    v_realizado := round(private.segundos_do_periodo(v_consultoria, v_ant_de, v_ant_ate) / 3600, 1);
    select sum(x.capacidade) into v_capacidade
    from private.capacidades_do_periodo(v_consultoria, v_ant_de, v_ant_ate, null) x;
  end if;
  v_capacidade := coalesce(v_capacidade, 0);
  v_realizado := coalesce(v_realizado, 0);

  -- Uma leitura da história só: o último instante do último dia do anterior.
  select s.em_atendimento, s.a_distribuir, s.sem_consultor, s.reservado
  into v_em, v_dist, v_sem, v_reservado
  from private.situacao_no_instante(v_recorte, v_consultoria, v_eu,
    (v_ant_ate + 1)::timestamp at time zone 'America/Sao_Paulo' - interval '1 microsecond') s;

  if not v_intervalo and v_mes = v_mes_atual then
    if v_forma = 'mes' then
      v_capacidade_mes := v_capacidade;
    else
      select coalesce(sum(x.capacidade), 0) into v_capacidade_mes
      from private.capacidades_do_periodo(v_consultoria, date_trunc('month', v_ant_de::timestamp)::date,
        (date_trunc('month', v_ant_de::timestamp) + interval '1 month - 1 day')::date,
        case when v_recorte = 'pessoa' then array[v_eu] end) x;
    end if;
    v_ocupacao := case when v_capacidade_mes > 0 then round(v_reservado / v_capacidade_mes, 4) end;
  else
    v_ocupacao := case when v_capacidade > 0 then round(v_realizado / v_capacidade, 4) end;
  end if;

  return jsonb_build_object('de', v_ant_de, 'ate', v_ant_ate, 'forma', v_forma,
    'indicadores', jsonb_build_object(
      'realizado', v_realizado,
      'ocupacao', v_ocupacao,
      'clientes_em_atendimento', v_em,
      'aguardando', v_dist + v_sem,
      'checkins', v_checkins));
end $$;

-- ── Fila de clientes ─────────────────────────────────────────────────────────
-- Central e gestão (o consultor recebe sem_recorte). A situação de hoje (vale também num mês passado): quem aguarda
-- consultoria (central; desde o cadastro) e consultor (desde que chegou à consultoria), com total, média e maior espera
-- em dias de calendário de São Paulo, e os 40 que esperam há mais tempo (os pontos); os em atendimento hoje. Do
-- período efetivo, pela história: novos em atendimento (trechos com entrou, em qualquer duração), quantos receberam
-- consultor depois de esperar e a média dessa espera (da chegada à consultoria até o consultor).
create function public.fila_de_clientes(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_de date;
  v_ate_efetivo date;
  v_periodo_de timestamptz;
  v_periodo_ate timestamptz; -- vazio (antes de v_periodo_de) quando o período efetivo é vazio
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  if v_recorte = 'pessoa' then
    raise exception 'sem_recorte' using errcode = '42501';
  end if;
  select p.de, p.ate_efetivo into v_de, v_ate_efetivo from private.periodo_do_inicio(p_mes, p_de, p_ate) p;
  v_periodo_de := v_de::timestamp at time zone 'America/Sao_Paulo';
  v_periodo_ate := (v_ate_efetivo + 1)::timestamp at time zone 'America/Sao_Paulo';

  with esperando as (
    select c.id, c.nome, 'a_distribuir'::text as situacao, c.criado_em as desde, null::uuid as consultoria_id
    from public.clientes c
    where v_recorte = 'tudo' and not c.arquivado and c.consultoria_id is null
    union all
    select c.id, c.nome, 'sem_consultor'::text, coalesce(c.enviado_em, c.criado_em), c.consultoria_id
    from public.clientes c
    where not c.arquivado and c.consultoria_id is not null and c.consultor_id is null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
  ),
  com_dias as (
    select e.*, v_hoje - (e.desde at time zone 'America/Sao_Paulo')::date as dias from esperando e
  ),
  etapas as (
    select
      count(*) filter (where d.situacao = 'a_distribuir') as dist_total,
      round(avg(d.dias) filter (where d.situacao = 'a_distribuir'), 1) as dist_media,
      max(d.dias) filter (where d.situacao = 'a_distribuir') as dist_maior,
      count(*) filter (where d.situacao = 'sem_consultor') as sem_total,
      round(avg(d.dias) filter (where d.situacao = 'sem_consultor'), 1) as sem_media,
      max(d.dias) filter (where d.situacao = 'sem_consultor') as sem_maior
    from com_dias d
  ),
  pontos as (
    select d.* from com_dias d order by d.desde, d.id limit 40
  ),
  atendidos as (
    select count(*) as total
    from public.clientes c
    where not c.arquivado and c.consultor_id is not null
      and (v_consultoria is null or c.consultoria_id = v_consultoria)
  ),
  entradas as (
    select count(*) as novos,
      count(*) filter (where s.espera_desde is not null) as receberam,
      round(avg((s.de at time zone 'America/Sao_Paulo')::date - (s.espera_desde at time zone 'America/Sao_Paulo')::date)
        filter (where s.espera_desde is not null), 1) as espera
    from private.situacoes_dos_clientes s
    where s.entrou
      and s.de >= v_periodo_de and s.de < v_periodo_ate
      and (v_consultoria is null or s.consultoria_id = v_consultoria)
  )
  select jsonb_build_object(
    'a_distribuir', case when v_recorte = 'tudo' then
      jsonb_build_object('total', e.dist_total, 'media_dias', e.dist_media, 'maior_dias', e.dist_maior) end,
    'sem_consultor', jsonb_build_object('total', e.sem_total, 'media_dias', e.sem_media, 'maior_dias', e.sem_maior),
    'em_atendimento', jsonb_build_object('total', (select a.total from atendidos a), 'novos_no_periodo', n.novos),
    'receberam_consultor', n.receberam,
    'espera_media_dias', n.espera,
    'pontos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'situacao', p.situacao, 'dias', p.dias,
        'consultoria_nome', co.nome) order by p.desde, p.id)
      from pontos p left join public.consultorias co on co.id = p.consultoria_id), '[]'::jsonb),
    'total_esperando', e.dist_total + e.sem_total)
  into v_resultado
  from etapas e, entradas n;

  return v_resultado;
end $$;

-- ── Clientes em risco ────────────────────────────────────────────────────────
-- A situação de hoje (não depende do período), 15 por página, pela nota, nome e id: quem está sem check-in há 30 dias
-- ou mais (a regra do cartão de Clientes) ou acima de 120% do ritmo (private.risco_dos_clientes). Embaixo do nome: o
-- consultor (gestão, se ela o vê, pela regra de vejo_perfil), a consultoria (central) ou nada (consultor).
create function public.clientes_em_risco(p_pagina int default 1)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_pagina int := greatest(coalesce(p_pagina, 1), 1);
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;

  with risco as (
    select x.*
    from private.risco_dos_clientes(case when v_recorte <> 'tudo' then v_consultoria end,
      case when v_recorte = 'pessoa' then v_eu end, null) x
    where x.sem_checkin or x.acima_do_ritmo
  ),
  pagina as (
    select r.*, c.nome, c.horas_mes, c.consultor_id, c.consultoria_id
    from risco r
    join public.clientes c on c.id = r.cliente_id
    order by r.nota desc, c.nome, c.id
    limit 15 offset (v_pagina - 1) * 15
  )
  select jsonb_build_object(
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.cliente_id, 'nome', p.nome, 'ultimo_checkin', p.ultimo_checkin,
          'sem_checkin_dias', p.sem_checkin_dias, 'ritmo', p.ritmo, 'horas_30', p.horas_30, 'horas_mes', p.horas_mes,
          'sem_checkin', p.sem_checkin, 'acima_do_ritmo', p.acima_do_ritmo)
        || case v_recorte
             when 'consultoria' then jsonb_build_object('consultor_nome',
               case when private.vejo_perfil(p.consultor_id) then pe.nome end)
             when 'tudo' then jsonb_build_object('consultoria_nome', co.nome)
             else '{}'::jsonb end
        order by p.nota desc, p.nome, p.cliente_id)
      from pagina p
      left join public.perfis pe on pe.id = p.consultor_id
      left join public.consultorias co on co.id = p.consultoria_id), '[]'::jsonb),
    'total', (select count(*) from risco),
    'sem_checkin', (select count(*) filter (where r.sem_checkin) from risco r),
    'acima_do_ritmo', (select count(*) filter (where r.acima_do_ritmo) from risco r))
  into v_resultado;

  return v_resultado;
end $$;

-- ── Horas por cliente ────────────────────────────────────────────────────────
-- Central e gestão: os clientes com horas no período (check-ins fechados que começam nele: meses inteiros pelo resumo
-- por cliente, bordas direto), a central de todas as consultorias ativas e a gestão só das horas feitas na consultoria,
-- nos clientes que hoje são dela (um cliente que foi para outra consultoria é dela agora); embaixo do nome, a
-- consultoria (central) ou o consultor que a gestão vê. Consultor: todos os clientes não arquivados dele, com 0 h
-- inclusive, só com as horas dele. Ordem: horas, previsão, nome e id. previsto = a previsão do mês (Mês) ou
-- proporcional aos dias do período efetivo (previsão x dias / 30,4).
-- Sem página: os 10 maiores, o resto (clientes e horas), os totais e a participação dos 3 e dos 10 maiores (fração de
-- 0 a 1). Com página: 15 por página e o total.
create function public.horas_por_cliente(p_mes date default null, p_de date default null, p_ate date default null,
  p_pagina int default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_de_dia date;
  v_ate_dia date;
  v_ate_efetivo date;
  v_intervalo boolean;
  v_dias int;
  v_de timestamptz;
  v_ate timestamptz;
  v_cheio_de date;
  v_cheio_ate date;
  v_borda1_ate timestamptz;
  v_borda2_de timestamptz;
  v_pagina int := greatest(p_pagina, 1);
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.de, p.ate, p.ate_efetivo, p.intervalo into v_de_dia, v_ate_dia, v_ate_efetivo, v_intervalo
  from private.periodo_do_inicio(p_mes, p_de, p_ate) p;

  if v_ate_efetivo < v_de_dia then
    return case when p_pagina is null then
      jsonb_build_object('itens', '[]'::jsonb, 'resto', jsonb_build_object('clientes', 0, 'horas', 0),
        'total_horas', 0, 'total_clientes', 0, 'participacao_3', null, 'participacao_10', null)
    else jsonb_build_object('itens', '[]'::jsonb, 'total', 0) end;
  end if;
  v_dias := v_ate_efetivo - v_de_dia + 1;

  -- As horas do período (como o realizado do painel: até o fim pedido; nada começa no futuro).
  v_de := v_de_dia::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (v_ate_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_cheio_de := date_trunc('month', (v_de_dia - 1) + interval '1 month')::date;
  v_cheio_ate := date_trunc('month', (v_ate_dia + 1)::timestamp)::date;
  if v_cheio_de >= v_cheio_ate then
    v_cheio_de := v_ate_dia + 1;
    v_cheio_ate := v_ate_dia + 1;
    v_borda1_ate := v_ate;
    v_borda2_de := v_ate;
  else
    v_borda1_ate := v_cheio_de::timestamp at time zone 'America/Sao_Paulo';
    v_borda2_de := v_cheio_ate::timestamp at time zone 'America/Sao_Paulo';
  end if;

  with horas as (
    select t.cliente_id, sum(t.segundos) as segundos
    from (
      select r.cliente_id, r.segundos
      from private.checkins_horas_cliente_mes r
      where v_recorte <> 'pessoa'
        and r.mes >= v_cheio_de and r.mes < v_cheio_ate
        and (v_consultoria is null or r.consultoria_id = v_consultoria)
        and r.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
      union all
      select k.cliente_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where v_recorte <> 'pessoa' and k.fim is not null
        and k.inicio >= v_de and k.inicio < v_borda1_ate
        and (v_consultoria is null or k.consultoria_id = v_consultoria)
        and k.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
      union all
      select k.cliente_id, extract(epoch from k.fim - k.inicio)
      from public.checkins k
      where v_recorte <> 'pessoa' and k.fim is not null
        and k.inicio >= v_borda2_de and k.inicio < v_ate
        and (v_consultoria is null or k.consultoria_id = v_consultoria)
        and k.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    ) t
    group by t.cliente_id
  ),
  lista as (
    select c.id, c.nome, c.horas_mes, c.consultoria_id, c.consultor_id, h.segundos
    from horas h
    join public.clientes c on c.id = h.cliente_id
    where h.segundos > 0
      and (v_recorte = 'tudo' or c.consultoria_id = v_consultoria)
    union all
    -- Consultor: cada cliente dele lê só os check-ins dele (índice por cliente), nunca o período inteiro de todos.
    select c.id, c.nome, c.horas_mes, c.consultoria_id, c.consultor_id, coalesce(f.segundos, 0)
    from public.clientes c
    left join lateral (
      select sum(extract(epoch from k.fim - k.inicio)) as segundos
      from public.checkins k
      where k.cliente_id = c.id and k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
        and k.inicio >= v_de and k.inicio < v_ate
    ) f on true
    where v_recorte = 'pessoa' and c.consultor_id = v_eu and c.consultoria_id = v_consultoria and not c.arquivado
  ),
  ordem as (
    select c.*, row_number() over (order by c.segundos desc, c.horas_mes desc, c.nome, c.id) as o
    from lista c
  ),
  -- O que aparece (os 10, ou a página), com o nome embaixo e o previsto.
  itens as (
    select o.o, jsonb_build_object('id', o.id, 'nome', o.nome,
      'sub', case v_recorte
        when 'tudo' then co.nome
        when 'consultoria' then case when private.vejo_perfil(o.consultor_id) then pe.nome end
      end,
      'horas', round(o.segundos / 3600, 1),
      'previsto', case when v_intervalo then round(o.horas_mes * v_dias / 30.4, 1) else o.horas_mes end) as item
    from ordem o
    left join public.consultorias co on co.id = o.consultoria_id
    left join public.perfis pe on pe.id = o.consultor_id
    where (p_pagina is null and o.o <= 10)
       or (p_pagina is not null and o.o > (v_pagina - 1) * 15 and o.o <= v_pagina * 15)
  ),
  totais as (
    select count(*) as clientes, coalesce(sum(o.segundos), 0) as segundos,
      coalesce(sum(o.segundos) filter (where o.o <= 3), 0) as s3,
      coalesce(sum(o.segundos) filter (where o.o <= 10), 0) as s10,
      count(*) filter (where o.o > 10) as resto_clientes,
      coalesce(sum(o.segundos) filter (where o.o > 10), 0) as resto_segundos
    from ordem o
  )
  select case when p_pagina is null then
      jsonb_build_object(
        'itens', coalesce((select jsonb_agg(i.item order by i.o) from itens i), '[]'::jsonb),
        'resto', jsonb_build_object('clientes', t.resto_clientes, 'horas', round(t.resto_segundos / 3600, 1)),
        'total_horas', round(t.segundos / 3600, 1),
        'total_clientes', t.clientes,
        'participacao_3', case when t.segundos > 0 then round(t.s3 / t.segundos, 4) end,
        'participacao_10', case when t.segundos > 0 then round(t.s10 / t.segundos, 4) end)
    else
      jsonb_build_object(
        'itens', coalesce((select jsonb_agg(i.item order by i.o) from itens i), '[]'::jsonb),
        'total', t.clientes)
    end
  into v_resultado
  from totais t;

  return v_resultado;
end $$;

-- ── Check-ins por semana ─────────────────────────────────────────────────────
-- As semanas (segunda a domingo) que tocam o período efetivo, no mínimo 8 (começa antes se faltar), cada uma com os
-- check-ins fechados que começam nela e as horas; no_periodo (toca o período), parcial (a semana de hoje). media: só
-- das semanas inteiras dentro do período (e já terminadas); pico: a semana do período com mais check-ins (a primeira,
-- no empate). Central e gestão pelo resumo por dia; o consultor, pelos check-ins dele.
create function public.checkins_por_semana(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_de date;
  v_ate_efetivo date;
  v_ini date;
  v_fim date;
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select p.de, p.ate_efetivo into v_de, v_ate_efetivo from private.periodo_do_inicio(p_mes, p_de, p_ate) p;
  if v_ate_efetivo < v_de then
    return jsonb_build_object('semanas', '[]'::jsonb, 'media', null, 'pico', null);
  end if;

  v_ini := date_trunc('week', v_de::timestamp)::date;
  v_fim := date_trunc('week', v_ate_efetivo::timestamp)::date;
  if v_fim - v_ini < 7 * 7 then
    v_ini := v_fim - 7 * 7;
  end if;

  with semanas as (
    select g::date as semana
    from generate_series(v_ini::timestamp, v_fim::timestamp, interval '1 week') g
  ),
  feitos as (
    select date_trunc('week', d.dia::timestamp)::date as semana, sum(d.quantidade) as quantidade, sum(d.segundos) as segundos
    from private.checkins_por_dia d
    where v_recorte <> 'pessoa'
      and d.dia >= v_ini and d.dia < v_fim + 7
      and (v_consultoria is null or d.consultoria_id = v_consultoria)
      and d.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    group by 1
    union all
    select date_trunc('week', k.inicio at time zone 'America/Sao_Paulo')::date, count(*), sum(extract(epoch from k.fim - k.inicio))
    from public.checkins k
    where v_recorte = 'pessoa' and k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_ini::timestamp at time zone 'America/Sao_Paulo'
      and k.inicio < (v_fim + 7)::timestamp at time zone 'America/Sao_Paulo'
    group by 1
  ),
  linhas as (
    select s.semana, coalesce(f.quantidade, 0)::int as checkins, round(coalesce(f.segundos, 0) / 3600, 1) as horas,
      s.semana + 6 >= v_de and s.semana <= v_ate_efetivo as no_periodo,
      v_hoje between s.semana and s.semana + 6 as parcial,
      s.semana >= v_de and s.semana + 6 <= v_ate_efetivo and s.semana + 6 < v_hoje as inteira
    from semanas s
    left join feitos f on f.semana = s.semana
  )
  select jsonb_build_object(
    'semanas', (select jsonb_agg(jsonb_build_object('semana', l.semana, 'checkins', l.checkins, 'horas', l.horas,
      'no_periodo', l.no_periodo, 'parcial', l.parcial) order by l.semana) from linhas l),
    'media', (select round(avg(l.checkins), 1) from linhas l where l.inteira),
    'pico', (select jsonb_build_object('semana', l.semana, 'checkins', l.checkins) from linhas l
      where l.no_periodo and l.checkins > 0 order by l.checkins desc, l.semana limit 1))
  into v_resultado;

  return v_resultado;
end $$;

-- ── Acesso ───────────────────────────────────────────────────────────────────
-- As do Início: só quem está logado (e cada uma confere o recorte).
revoke all on function public.painel_do_inicio(date, date, date), public.comparacao_do_inicio(date, date, date),
  public.fila_de_clientes(date, date, date), public.clientes_em_risco(int),
  public.horas_por_cliente(date, date, date, int), public.checkins_por_semana(date, date, date)
from public, anon, service_role;
grant execute on function public.painel_do_inicio(date, date, date), public.comparacao_do_inicio(date, date, date),
  public.fila_de_clientes(date, date, date), public.clientes_em_risco(int),
  public.horas_por_cliente(date, date, date, int), public.checkins_por_semana(date, date, date)
to authenticated;

-- Internas: só as funções do banco (como owner) chamam. As duas de 20261118113545 repetem o revoke (faltou lá; o ACL
-- já estava certo).
revoke all on function
  private.fechar_checkins(uuid, uuid, text),
  private.capacidades_por_mes(uuid, uuid[], date, date),
  private.segundos_do_periodo(uuid, date, date),
  private.risco_dos_clientes(uuid, uuid, uuid),
  private.checkins_resumir_horas(),
  private.recalcular_horas_mes()
from public, anon, authenticated, service_role;

commit;
