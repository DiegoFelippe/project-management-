// Times e membros. O banco (RLS) decide o que cada papel vê e pode mexer.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

const GESTOR = 'gestor:perfis!times_gestor_id_fkey(id, nome, foto)'
const CAMPOS = `id, nome, descricao, consultoria_id, gestor_id, ${GESTOR}`
// Na lista: só os 4 primeiros rostos e o total de membros (contado no banco), nunca todos os membros.
const ROSTOS = 4
const CAMPOS_DA_LISTA =
  `${CAMPOS}, membros:time_membros(pessoa:perfis!time_membros_pessoa_id_fkey(id, nome, foto)), total:time_membros(count)`

// Uma página de times, paginada no banco. Membro que quem olha não pode ver vem nulo e fica de fora.
export async function listarTimes({ consultoriaId, pagina = 1 } = {}) {
  let consulta = supabase
    .from('times')
    .select(CAMPOS_DA_LISTA, { count: 'exact' })
    .order('nome')
    .order('id')
    .limit(ROSTOS, { referencedTable: 'membros' })
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  const resultado = await buscarPagina(consulta, pagina)
  const itens = resultado.itens.map(({ total, ...time }) => ({
    ...time,
    membros: (time.membros ?? []).map((m) => m.pessoa).filter(Boolean),
    totalMembros: total?.[0]?.count ?? 0,
  }))
  return { ...resultado, itens }
}

// Para escolher times num formulário: só id, nome e gestor.
export async function listarOpcoesDeTimes({ consultoriaId } = {}) {
  let consulta = supabase.from('times').select('id, nome, gestor_id').order('nome')
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  const { data, error } = await consulta
  if (error) throw error
  return data
}

export async function buscarTime(id) {
  const { data, error } = await supabase.from('times').select(CAMPOS).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// Uma página das pessoas do time, em ordem de nome.
export async function listarMembros(timeId, { pagina = 1 } = {}) {
  const consulta = supabase
    .from('time_membros')
    .select('pessoa:perfis!time_membros_pessoa_id_fkey(id, nome, email, foto, papel)', { count: 'exact' })
    .eq('time_id', timeId)
    .order('pessoa(nome)')
    .order('pessoa_id')
  const resultado = await buscarPagina(consulta, pagina)
  return { ...resultado, itens: resultado.itens.map((m) => m.pessoa).filter(Boolean) }
}

// Quem já está no time (só os ids), para não oferecer de novo no "Colocar pessoa".
export async function idsDosMembros(timeId) {
  const { data, error } = await supabase.from('time_membros').select('pessoa_id').eq('time_id', timeId)
  if (error) throw error
  return new Set(data.map((m) => m.pessoa_id))
}

export async function criarTime({ nome, descricao, gestorId, consultoriaId }) {
  const { data, error } = await supabase
    .from('times')
    .insert({ nome: nome.trim(), descricao: descricao?.trim() || null, gestor_id: gestorId, consultoria_id: consultoriaId })
    .select('id')
    .single()
  if (error) return { erro: traduzirErroBanco(error) }
  return { id: data.id }
}

export async function adicionarMembro(timeId, pessoaId) {
  const { error } = await supabase.from('time_membros').insert({ time_id: timeId, pessoa_id: pessoaId })
  if (!error || error.code === '23505') return { erro: null } // 23505: já estava no time
  return { erro: traduzirErroBanco(error) }
}

export async function removerMembro(timeId, pessoaId) {
  const { data, error } = await supabase
    .from('time_membros')
    .delete()
    .eq('time_id', timeId)
    .eq('pessoa_id', pessoaId)
    .select('pessoa_id')
  if (error) return { erro: traduzirErroBanco(error) }
  if (!data.length) return { erro: traduzirErroBanco({ code: '42501' }) }
  return { erro: null }
}

export async function editarTime(id, { nome, descricao, gestorId }) {
  const mudancas = { nome: nome.trim(), descricao: descricao?.trim() || null }
  if (gestorId) mudancas.gestor_id = gestorId
  const { data, error } = await supabase.from('times').update(mudancas).eq('id', id).select('id')
  if (error) return { erro: traduzirErroBanco(error) }
  if (!data.length) return { erro: traduzirErroBanco({ code: '42501' }) }
  return { erro: null }
}

// Apaga só o time: as pessoas continuam com acesso (saem só deste time).
export async function apagarTime(id) {
  const { data, error } = await supabase.from('times').delete().eq('id', id).select('id')
  if (error) return { erro: traduzirErroBanco(error) }
  if (!data.length) return { erro: traduzirErroBanco({ code: '42501' }) }
  return { erro: null }
}
