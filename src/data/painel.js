// Painel do Início: os números do mês ou de um período, já no recorte de quem chama (tudo, consultoria ou pessoa),
// numa chamada só.
import { supabase } from '@/lib/supabase'

// periodo: o mês 'AAAA-MM-01' (ou nulo para o mês atual) ou { de, ate } ('AAAA-MM-DD', dias de São Paulo, inclusive).
// Devolve o objeto do banco como está (a tela não recalcula nada): { recorte, mes, intervalo, de, ate, passado,
// indicadores, horas_por_mes, previsao_atual, ranking, esperando, extremos, meus_clientes }.
export async function painelDoInicio(periodo) {
  const argumentos = periodo?.de ? { p_de: periodo.de, p_ate: periodo.ate } : { p_mes: periodo ?? null }
  const { data, error } = await supabase.rpc('painel_do_inicio', argumentos)
  if (error) throw error
  return data
}
