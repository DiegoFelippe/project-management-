// Pessoas com acesso, criação de acesso e reenvio de convite (as duas últimas pelas Edge Functions).
import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

const CAMPOS =
  'id, nome, email, foto, papel, consultoria_id, convite_pendente, precisa_trocar_senha, ativo, ' +
  'times:time_membros!time_membros_pessoa_id_fkey(time:times(id, nome))'

const redirectTo = () => `${window.location.origin}/definir-senha`

// Uma página de pessoas (ativas ou desativadas), filtrada e paginada no banco.
// Os times que quem olha não enxerga vêm nulos e ficam de fora.
export async function listarUsuarios({ consultoriaId, ativos = true, pagina = 1 } = {}) {
  let consulta = supabase
    .from('perfis')
    .select(CAMPOS, { count: 'exact' })
    .neq('papel', 'dono')
    .eq('ativo', ativos)
    .order('nome')
    .order('id')
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  const resultado = await buscarPagina(consulta, pagina)
  return { ...resultado, itens: resultado.itens.map((p) => ({ ...p, times: (p.times ?? []).map((m) => m.time).filter(Boolean) })) }
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

// editar ({ nome?, papel? }), desativar ou reativar (Edge Function gerenciar-acesso).
export async function gerenciarAcesso(acao, pessoaId, extra = {}) {
  const { status, corpo } = await chamarFuncao('gerenciar-acesso', { acao, pessoa_id: pessoaId, ...extra })
  return { erro: status === 200 ? null : traduzirErroFuncao(corpo.codigo) }
}
