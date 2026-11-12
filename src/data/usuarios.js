// Pessoas com acesso, criação de acesso e reenvio de convite (as duas últimas pelas Edge Functions).
import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'

const CAMPOS =
  'id, nome, email, papel, consultoria_id, convite_pendente, precisa_trocar_senha, ' +
  'times:time_membros!time_membros_pessoa_id_fkey(time:times(id, nome))'

const redirectTo = () => `${window.location.origin}/definir-senha`

// Os times que quem olha não enxerga vêm nulos e ficam de fora.
export async function listarUsuarios({ consultoriaId } = {}) {
  let consulta = supabase.from('perfis').select(CAMPOS).neq('papel', 'dono').order('nome')
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  const { data, error } = await consulta
  if (error) throw error
  return data.map((p) => ({ ...p, times: (p.times ?? []).map((m) => m.time).filter(Boolean) }))
}

export async function criarAcesso(dados) {
  const { status, corpo } = await chamarFuncao('criar-acesso', { ...dados, redirectTo: redirectTo() })
  if (status === 201) return { pessoaId: corpo.pessoa_id }
  return { codigo: corpo.codigo, erro: traduzirErroFuncao(corpo.codigo), pessoa: corpo.pessoa }
}

export async function reenviarConvite(pessoaId) {
  const { status, corpo } = await chamarFuncao('reenviar-convite', { pessoa_id: pessoaId, redirectTo: redirectTo() })
  return { erro: status === 200 ? null : traduzirErroFuncao(corpo.codigo) }
}
