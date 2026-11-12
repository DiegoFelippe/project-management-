// Times e membros. O banco (RLS) decide o que cada papel vê e pode mexer.
import { traduzirErroBanco } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const CAMPOS =
  'id, nome, descricao, consultoria_id, gestor_id, ' +
  'gestor:perfis!times_gestor_id_fkey(id, nome, foto), ' +
  'membros:time_membros(pessoa:perfis!time_membros_pessoa_id_fkey(id, nome, email, foto, papel))'

// Membro que quem olha não pode ver vem nulo: fica de fora da lista (mas conta no total do banco).
function normalizar(time) {
  return { ...time, membros: (time.membros ?? []).map((m) => m.pessoa).filter(Boolean) }
}

export async function listarTimes({ consultoriaId } = {}) {
  let consulta = supabase.from('times').select(CAMPOS).order('nome')
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  const { data, error } = await consulta
  if (error) throw error
  return data.map(normalizar)
}

export async function buscarTime(id) {
  const { data, error } = await supabase.from('times').select(CAMPOS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? normalizar(data) : null
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
