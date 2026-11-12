import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'

// Para o filtro do dono nas telas Times e Usuários.
export async function listarNomesDeConsultorias() {
  const { data, error } = await supabase.from('consultorias').select('id, nome').order('nome')
  if (error) throw error
  return data
}

// Tela Consultorias (só o dono enxerga todas).
export async function listarConsultorias() {
  const { data, error } = await supabase
    .from('consultorias')
    .select('id, nome, perfis(id, nome, email, papel, convite_pendente), times(id)')
    .order('nome')
  if (error) throw error
  return data.map((c) => ({
    id: c.id,
    nome: c.nome,
    admins: c.perfis.filter((p) => p.papel === 'admin'),
    pessoas: c.perfis.length,
    times: c.times.length,
  }))
}

export async function criarConsultoria({ nome, admin }) {
  const { status, corpo } = await chamarFuncao('criar-consultoria', {
    nome,
    admin,
    redirectTo: `${window.location.origin}/definir-senha`,
  })
  if (status === 201) return { consultoriaId: corpo.consultoria_id }
  return { codigo: corpo.codigo, erro: traduzirErroFuncao(corpo.codigo) }
}
