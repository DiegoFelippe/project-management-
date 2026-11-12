// Paginação no banco: 15 por página (regra "Escala" no CLAUDE.md). Nunca carregar tudo e fatiar na tela.
export const POR_PAGINA = 15

// Linhas [de, até] que o range() do Supabase pede para a página (começa em 1).
export function faixa(pagina, porPagina = POR_PAGINA) {
  const de = (pagina - 1) * porPagina
  return [de, de + porPagina - 1]
}

// Roda a consulta (feita com { count: 'exact' }) na página pedida e devolve { itens, total }.
// Página que deixou de existir (ex.: apagou o último item dela) volta com foraDaFaixa.
export async function buscarPagina(consulta, pagina) {
  const { data, error, count } = await consulta.range(...faixa(pagina))
  if (error?.code === 'PGRST103') return { itens: [], total: count ?? 0, foraDaFaixa: true }
  if (error) throw error
  return { itens: data, total: count ?? 0 }
}
