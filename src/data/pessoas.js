import { padraoParcial } from '@/lib/busca'
import { supabase } from '@/lib/supabase'

// Quantos ids o not.in vai na URL do pedido; o que passar disso é tirado do resultado na tela.
const MAXIMO_DE_IDS_NA_BUSCA = 100

// Seletores de pessoa com busca no banco (nunca a lista inteira): pelo nome (ilike), em ordem de nome, `limite` por
// vez. `papeis` filtra o papel e `excluirIds` esconde quem não deve aparecer (ex.: quem já está no time).
// Devolve { itens: [{ id, nome, email, papel, foto }], total } (total = quantas combinam, para "N de TOTAL").
export async function buscarPessoas({ consultoriaId, papeis, termo = '', excluirIds = [], limite = 20 } = {}) {
  const ids = [...excluirIds]
  const noBanco = ids.slice(0, MAXIMO_DE_IDS_NA_BUSCA)
  let consulta = supabase.from('perfis').select('id, nome, email, papel, foto', { count: 'exact' }).order('nome').order('id').limit(limite)
  if (consultoriaId) consulta = consulta.eq('consultoria_id', consultoriaId)
  if (papeis) consulta = consulta.in('papel', papeis)
  if (noBanco.length) consulta = consulta.not('id', 'in', `(${noBanco.join(',')})`)
  const padrao = padraoParcial(termo)
  if (padrao) consulta = consulta.ilike('nome', padrao)
  const { data, error, count } = await consulta
  if (error) throw error
  const resto = new Set(ids.slice(MAXIMO_DE_IDS_NA_BUSCA))
  const itens = data.filter((p) => !resto.has(p.id))
  return { itens, total: (count ?? 0) - (data.length - itens.length) }
}
