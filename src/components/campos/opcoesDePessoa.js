// Pessoa vira opção do Seletor: nome, e-mail como detalhe e o rosto.
export const comoOpcaoDePessoa = (p) => ({ valor: p.id, rotulo: p.nome, detalhe: p.email, avatar: p })

// Adapta uma busca de pessoas no banco ({ itens: [pessoa], total }) ao `buscar` do Seletor. Quem chama guarda o
// resultado (useMemo/useCallback): o Seletor só refaz a busca quando a função muda.
export const buscarComoOpcoes = (buscar) => async (termo) => {
  const { itens, total } = await buscar(termo)
  return { itens: itens.map(comoOpcaoDePessoa), total }
}
