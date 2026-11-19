-- O calor do Início na densidade de painel_volume (≈ 100.000 check-ins por mês: ~180.000 nas 8 semanas da central):
-- revisão da Task 2 do plano 2026-11-19-graficos-variados-e-paleta.
-- - Índice dos check-ins fechados por início, com a consultoria: a central lê a janela só pelo índice (sem ele, a janela
--   inteira ia para Seq Scan).
-- - checkins_por_dia_e_hora soma primeiro por hora absoluta e só converte para São Paulo as horas (umas 1.300 em 8
--   semanas), não cada check-in. Mesmo resultado.
-- Só acrescenta um índice e muda uma função. Nenhuma linha muda.

begin;

create index checkins_fechados_inicio_idx on public.checkins (inicio) include (consultoria_id) where fim is not null;

-- Mesmo corpo de 20261119181004_calor_ultimas_8_semanas.sql; muda só: a conta agrupa os check-ins pela hora absoluta
-- (date_bin, que não depende do fuso da sessão) e converte cada hora para São Paulo depois. Dá o mesmo dia da semana e a
-- mesma hora porque todo deslocamento de America/Sao_Paulo é de horas inteiras.
create or replace function public.checkins_por_dia_e_hora(p_mes date default null, p_de date default null, p_ate date default null)
returns jsonb
language plpgsql stable security definer
set search_path = '' set plan_cache_mode = force_custom_plan as $$
declare
  v_eu uuid;
  v_recorte text;
  v_consultoria uuid;
  v_janela_de date;
  v_janela_ate date;
  v_de timestamptz;
  v_ate timestamptz;
  v_resultado jsonb;
begin
  select r.recorte, r.consultoria, r.eu into v_recorte, v_consultoria, v_eu from private.recorte_do_inicio() r;
  select greatest(p.de, p.ate - 55), p.ate into v_janela_de, v_janela_ate
  from private.periodo_do_inicio(p_mes, p_de, p_ate) p;
  v_de := v_janela_de::timestamp at time zone 'America/Sao_Paulo';
  v_ate := (v_janela_ate + 1)::timestamp at time zone 'America/Sao_Paulo';

  -- Um ramo por recorte: cada um é uma faixa só do índice (por data, pela consultoria ou pelo consultor).
  with inicios as (
    select k.inicio from public.checkins k
    where v_recorte = 'tudo' and k.fim is not null and k.inicio >= v_de and k.inicio < v_ate
      and k.consultoria_id in (select co.id from public.consultorias co where co.arquivada_em is null)
    union all
    select k.inicio from public.checkins k
    where v_recorte = 'consultoria' and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_de and k.inicio < v_ate
    union all
    select k.inicio from public.checkins k
    where v_recorte = 'pessoa' and k.consultor_id = v_eu and k.consultoria_id = v_consultoria and k.fim is not null
      and k.inicio >= v_de and k.inicio < v_ate
  ),
  horas as (
    select date_bin('1 hour', i.inicio, timestamptz '2000-01-01 00:00+00') as hora, count(*) as n
    from inicios i
    group by 1
  ),
  contas as (
    select extract(dow from l.local)::int as dia_semana,
      least(greatest(extract(hour from l.local)::int, 7), 20) as hora, sum(l.n) as n
    from (select h.hora at time zone 'America/Sao_Paulo' as local, h.n from horas h) l
    group by 1, 2
  )
  select jsonb_build_object('de', v_janela_de, 'ate', v_janela_ate, 'celulas', jsonb_agg(
      jsonb_build_object('dia_semana', d, 'hora', h, 'checkins', coalesce(c.n, 0)) order by d, h))
  from generate_series(0, 6) d
  cross join generate_series(7, 20) h
  left join contas c on c.dia_semana = d and c.hora = h
  into v_resultado;

  return v_resultado;
end $$;

revoke all on function public.checkins_por_dia_e_hora(date, date, date) from public, anon, service_role;
grant execute on function public.checkins_por_dia_e_hora(date, date, date) to authenticated;

commit;
