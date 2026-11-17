// Painel do Início: os números do mês, já no recorte de quem chama (tudo, consultoria ou pessoa), numa chamada só.
import { supabase } from '@/lib/supabase'

// mes: 'AAAA-MM-01' (ou nulo para o mês atual). Devolve o objeto do banco como está (a tela não recalcula nada):
// { recorte, mes, passado, indicadores, horas_por_mes, previsao_atual, ranking, esperando, extremos, meus_clientes }.
export async function painelDoInicio(mes) {
  const { data, error } = await supabase.rpc('painel_do_inicio', { p_mes: mes ?? null })
  if (error) throw error
  return data
}
