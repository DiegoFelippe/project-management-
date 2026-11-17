// Agenda (leituras). O banco (RLS) decide quem vê cada evento; quem grava é a Edge Function, que mexe no Google junto.
import { supabase } from '@/lib/supabase'

// Teto das ausências de um período.
const LIMITE_DO_PERIODO = 2000

// Eventos que tocam o período [de, ate) (ISO), com consultor, cliente e participantes (com nome) numa chamada só:
// { itens, haMais }. O banco decide quem vê o quê e usa índice por papel; consultorId, consultoriaId e clienteId são
// filtros opcionais rodados lá. haMais avisa que o período tem mais eventos do que o teto da chamada (1.000).
export async function eventosDoPeriodo({ de, ate, consultorId, consultoriaId, clienteId } = {}) {
  const { data, error } = await supabase.rpc('eventos_do_periodo', {
    p_de: de,
    p_ate: ate,
    p_consultor: consultorId ?? null,
    p_consultoria: consultoriaId ?? null,
    p_cliente: clienteId ?? null,
  })
  if (error) throw error
  return { itens: data?.itens ?? [], haMais: Boolean(data?.ha_mais) }
}

// Um evento no mesmo formato dos itens acima; null quando não existe ou a pessoa não pode vê-lo.
export async function buscarEvento(id) {
  const { data, error } = await supabase.rpc('evento_da_agenda', { p_id: id })
  if (error) throw error
  return data
}

// { semana, mes, aguardando, pastas_no_mes } no recorte de quem chama; dia: 'AAAA-MM-DD'.
export async function indicadoresDaAgenda(dia) {
  const { data, error } = await supabase.rpc('indicadores_da_agenda', { p_dia: dia })
  if (error) throw error
  return data
}

// Ausências (dias inteiros) que tocam o período (perfis!perfil_id: a tabela também aponta para perfis por
// criado_por); de e ate: 'AAAA-MM-DD' (inclusive).
export async function ausenciasDoPeriodo({ de, ate, consultorId, consultoriaId } = {}) {
  let consulta = supabase
    .from('ausencias')
    .select(
      consultoriaId
        ? 'id, perfil_id, de, ate, motivo, perfil:perfis!perfil_id!inner(id, nome, cor, consultoria_id)'
        : 'id, perfil_id, de, ate, motivo, perfil:perfis!perfil_id(id, nome, cor)',
    )
    .lte('de', ate)
    .gte('ate', de)
    .order('de', { ascending: true })
    .limit(LIMITE_DO_PERIODO)
  if (consultorId) consulta = consulta.eq('perfil_id', consultorId)
  if (consultoriaId) consulta = consulta.eq('perfil.consultoria_id', consultoriaId)
  const { data, error } = await consulta
  if (error) throw error
  return data ?? []
}

// Feriados nacionais entre duas datas ('AAAA-MM-DD', inclusive): lista de datas.
export async function feriadosDoPeriodo(de, ate) {
  const { data, error } = await supabase.rpc('feriados_do_periodo', { p_de: de, p_ate: ate })
  if (error) throw error
  return data ?? []
}

// O Google que eu conectei: { conectado, email, erro }. O banco só devolve e-mail, quando conectou e o erro
// (nunca o token), e só da minha linha.
export async function meuGoogle() {
  const { data, error } = await supabase.from('google_pessoas').select('email, conectado_em, erro').maybeSingle()
  if (error) throw error
  return { conectado: Boolean(data), email: data?.email ?? null, erro: data?.erro ?? null }
}
