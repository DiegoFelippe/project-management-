-- O calor do Início ("Quando os check-ins acontecem") cobre só as últimas 8 semanas do período, como no protótipo aprovado
-- ("Dia da semana × hora de início, nas últimas 8 semanas"): num período longo a central não lê todos os check-ins dele
-- (revisão da Task 2 do plano 2026-11-19-graficos-variados-e-paleta). Só muda a função.

begin;

-- Mesmo corpo de 20261119175136_graficos_variados.sql; muda só:
-- - a janela: as últimas 8 semanas do período (de max(de, ate - 55) a ate, dias de São Paulo); período mais curto, ele
--   inteiro. As recusas do período continuam as de private.periodo_do_inicio (periodo_invalido);
-- - a saída ganha de e ate (a janela usada), para a tela dizer qual é.
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
  contas as (
    select extract(dow from l.local)::int as dia_semana,
      least(greatest(extract(hour from l.local)::int, 7), 20) as hora, count(*) as n
    from (select i.inicio at time zone 'America/Sao_Paulo' as local from inicios i) l
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
