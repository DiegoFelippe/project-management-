// Cartões de números das telas do menu (abaixo da barra de filtros): uma chamada ao banco por tela, já contada lá, no
// recorte de quem vê. Devolvem o objeto do banco como está (a tela não recalcula nada). O Início e o Calendário têm as
// deles (painelDoInicio e indicadoresDaAgenda).
import { supabase } from '@/lib/supabase'

async function ler(funcao, argumentos) {
  const { data, error } = await supabase.rpc(funcao, argumentos)
  if (error) throw error
  return data
}

// consultorId: '' (todos), 'sem' (Sem consultor) ou o id, como no filtro Consultor da lista.
// { recorte: 'tudo' | 'consultoria' | 'pessoa', ...os números daquele recorte }.
export const indicadoresDeClientes = ({ consultoriaId, consultorId } = {}) => ler('indicadores_de_clientes', {
  p_consultoria: consultoriaId || null,
  p_consultor: consultorId && consultorId !== 'sem' ? consultorId : null,
  p_sem_consultor: consultorId === 'sem',
})

// { times, pessoas_em_times, pessoas_sem_time, times_sem_membros }.
export const indicadoresDeTimes = ({ consultoriaId } = {}) =>
  ler('indicadores_de_times', { p_consultoria: consultoriaId || null })

// mes: 'AAAA-MM-01' (nulo = o atual). { mes, passado, pessoas_ativas, ocupacao_media, acima_de_100, sem_tipo }.
export const indicadoresDeUsuarios = ({ consultoriaId, mes } = {}) =>
  ler('indicadores_de_usuarios', { p_mes: mes ?? null, p_consultoria: consultoriaId || null })

// { mes, passado, consultorias_ativas, clientes_ativos, consultores, ocupacao_media }.
export const indicadoresDeConsultorias = ({ mes } = {}) => ler('indicadores_de_consultorias', { p_mes: mes ?? null })

// Aba Modelos de Check-ins: { recorte: 'tudo' | 'consultoria', ativos, da_central, da_consultoria, clientes_usando }.
export const indicadoresDeModelos = ({ consultoriaId } = {}) =>
  ler('indicadores_de_modelos', { p_consultoria: consultoriaId || null })

// Aba Andamento de Check-ins: { recorte: 'tudo' | 'consultoria' | 'pessoa', clientes, com_modelo, progresso_medio (% ou
// null sem check-list), atrasadas, vencem_7_dias }. Seguem a consultoria (Central) e o consultor do filtro; o consultor
// sempre vê os dele (o banco ignora o filtro).
export const indicadoresDeCheckins = ({ consultoriaId, consultorId } = {}) =>
  ler('indicadores_de_checkins', { p_consultoria: consultoriaId || null, p_consultor: consultorId || null })

// { conectadas, com_erro, nao_configuradas, ultimo_teste }.
export const indicadoresDeIntegracoes = ({ consultoriaId } = {}) =>
  ler('indicadores_de_integracoes', { p_consultoria: consultoriaId || null })
