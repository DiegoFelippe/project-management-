import { traduzirErroFuncao } from '@/lib/erros'
import { chamarFuncao, supabase } from '@/lib/supabase'
import { padraoDeBusca } from '@/lib/busca'
import { buscarPagina } from './paginar'

// Consultorias por nome sem acento (ilike em nome_busca), no máximo `limite` por vez, numa consulta só. Devolve { itens: [{ id, nome }], total }
// (total = quantas combinam, para o "N de TOTAL" do Seletor). `soAtivas` tira as arquivadas.
async function buscarPorNome(termo, limite, soAtivas) {
  let consulta = supabase.from('consultorias').select('id, nome', { count: 'exact' }).order('nome').limit(limite)
  if (soAtivas) consulta = consulta.is('arquivada_em', null)
  const padrao = padraoDeBusca(termo)
  if (padrao) consulta = consulta.ilike('nome_busca', padrao)
  const { data, error, count } = await consulta
  if (error) throw error
  return { itens: data, total: count ?? 0 }
}

// Filtro das listas de quem vê tudo: todas as consultorias, inclusive as arquivadas, buscadas no banco pelo nome.
export const buscarConsultorias = (termo = '', limite = 20) => buscarPorNome(termo, limite, false)

// Seletor de consultoria com busca no banco (acesso novo de administrador): só as ativas.
export const buscarConsultoriasAtivas = (termo = '', limite = 20) => buscarPorNome(termo, limite, true)

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
