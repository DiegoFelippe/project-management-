import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'
import { padraoParcial } from '@/lib/busca'
import { buscarPagina } from './paginar'

// Para o filtro de quem vê tudo nas listas (todas, inclusive as arquivadas) e, com { ativas: true }, para o seletor
// da ficha em Usuários (acesso novo só em consultoria ativa; a criar-acesso confere de novo).
export async function listarNomesDeConsultorias({ ativas = false } = {}) {
  let consulta = supabase.from('consultorias').select('id, nome')
  if (ativas) consulta = consulta.is('arquivada_em', null)
  const { data, error } = await consulta.order('nome')
  if (error) throw error
  return data
}

// Seletor de consultoria com busca no banco (acesso novo de administrador): só as ativas, pelo nome (ilike), no
// máximo `limite` por vez. Devolve { itens: [{ id, nome }], total } (total = quantas combinam, para "N de TOTAL").
export async function buscarConsultoriasAtivas(termo = '', limite = 20) {
  let consulta = supabase.from('consultorias').select('id, nome', { count: 'exact' }).is('arquivada_em', null).order('nome').limit(limite)
  const padrao = padraoParcial(termo)
  if (padrao) consulta = consulta.ilike('nome', padrao)
  const { data, error, count } = await consulta
  if (error) throw error
  return { itens: data, total: count ?? 0 }
}

// Tela Consultorias (só o dono enxerga todas): uma página, ativas ou arquivadas. Pessoas e times
// vêm contados no banco; da administração, só quem é admin.
export async function listarConsultorias({ arquivadas = false, pagina = 1 } = {}) {
  let consulta = supabase
    .from('consultorias')
    .select('id, nome, logo, arquivada_em, admins:perfis(id, nome, email, convite_pendente), pessoas:perfis(count), times(count)',
      { count: 'exact' })
    .eq('admins.papel', 'admin')
    .order('nome')
    .order('id')
  consulta = arquivadas ? consulta.not('arquivada_em', 'is', null) : consulta.is('arquivada_em', null)
  const resultado = await buscarPagina(consulta, pagina)
  const itens = resultado.itens.map((c) => ({
    id: c.id,
    nome: c.nome,
    logo: c.logo,
    arquivada: Boolean(c.arquivada_em),
    admins: c.admins ?? [],
    pessoas: c.pessoas?.[0]?.count ?? 0,
    times: c.times?.[0]?.count ?? 0,
  }))
  return { ...resultado, itens }
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

// renomear ({ nome }), arquivar ou reativar (Edge Function gerenciar-consultoria; só o dono).
export async function gerenciarConsultoria(acao, consultoriaId, extra = {}) {
  const { status, corpo } = await chamarFuncao('gerenciar-consultoria', { acao, consultoria_id: consultoriaId, ...extra })
  return { erro: status === 200 ? null : traduzirErroFuncao(corpo.codigo) }
}
