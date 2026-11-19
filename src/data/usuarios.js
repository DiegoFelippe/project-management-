// Pessoas com acesso, criação de acesso e reenvio de convite (as duas últimas pelas Edge Functions).
import { traduzirErroBanco, traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'
import { buscarPagina } from './paginar'

const CAMPOS =
  'id, nome, email, foto, cor, papel, consultoria_id, convite_pendente, precisa_trocar_senha, ativo, exige_2fa, verificacao_desde, ' +
  'telefone, cidade, uf, cargo, data_entrada, tipos_de_consultoria, carga_semanal, ' +
  'consultoria:consultorias(nome), ' +
  'times:time_membros!time_membros_pessoa_id_fkey(time:times(id, nome))'

const redirectTo = () => `${window.location.origin}/definir-senha`

// Uma página de pessoas (ativas ou desativadas), filtrada e paginada no banco.
// Os times que quem olha não enxerga vêm nulos e ficam de fora.
// `acima`: só quem passa de 100% de ocupação no mês `mes` (o cartão "Acima de 100%", usabilidade U5). As linhas vêm de
// pessoas_acima_de_100, com a conta e o recorte do cartão; colunas, filtros, ordem e página são os mesmos.
export async function listarUsuarios({ consultoriaId, ativos = true, pagina = 1, tipo, acima = false, mes } = {}) {
  let consulta = (acima
    ? supabase.rpc('pessoas_acima_de_100', { p_mes: mes ?? null, p_consultoria: consultoriaId || null }, { count: 'exact' })
      .select(CAMPOS)
    : supabase.from('perfis').select(CAMPOS, { count: 'exact' }))
    .neq('papel', 'dono')
    .eq('ativo', ativos)
    .order('nome')
    .order('id')
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  // Pessoas que têm aquele tipo de consultoria (a lista é de vários; índice GIN). 'sem': quem é de consultoria
  // (administrador, gestor ou consultor) e não tem nenhum, o recorte do cartão "Sem tipo de consultoria" (U5).
  if (tipo === 'sem') consulta = consulta.in('papel', ['admin', 'gestor', 'pessoa']).eq('tipos_de_consultoria', '{}')
  else if (tipo) consulta = consulta.contains('tipos_de_consultoria', [tipo])
  const resultado = await buscarPagina(consulta, pagina)
  return { ...resultado, itens: resultado.itens.map((p) => ({ ...p, times: (p.times ?? []).map((m) => m.time).filter(Boolean) })) }
}

// Uma pessoa por id, com os mesmos campos da lista. Quem o RLS não deixa ver volta como null.
export async function buscarUsuario(id) {
  const { data, error } = await supabase.from('perfis').select(CAMPOS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? { ...data, times: (data.times ?? []).map((m) => m.time).filter(Boolean) } : null
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

// editar ({ nome?, papel?, cargo?, telefone?, cidade?, uf?, data_entrada?, tipos_de_consultoria?, exige_2fa? }), desativar, reativar, mover_para_central ou
// zerar_2fa (apaga o app autenticador da pessoa) (Edge Function gerenciar-acesso).
export async function gerenciarAcesso(acao, pessoaId, extra = {}) {
  const { status, corpo } = await chamarFuncao('gerenciar-acesso', { acao, pessoa_id: pessoaId, ...extra })
  return { erro: status === 200 ? null : traduzirErroFuncao(corpo.codigo) }
}

// A pessoa que está usando muda o próprio contato (Meu perfil). Texto vazio limpa o campo.
export async function atualizarMeuContato({ telefone, cidade, uf }) {
  const { error } = await supabase.rpc('atualizar_meu_contato', { p_telefone: telefone, p_cidade: cidade, p_uf: uf })
  return { erro: error ? traduzirErroBanco(error) : null }
}
