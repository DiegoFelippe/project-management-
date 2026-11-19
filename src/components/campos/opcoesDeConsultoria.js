// Consultoria vira opção do Seletor: o nome (o id é o valor).
export const comoOpcaoDeConsultoria = (c) => ({ valor: c.id, rotulo: c.nome })

// Adapta uma busca de consultorias no banco ({ itens: [consultoria], total }) ao `buscar` do Seletor, como o
// buscarComoOpcoes das pessoas. Quem chama guarda o resultado (no módulo ou com useMemo): o Seletor só refaz a busca quando
// a função muda.
export const buscarConsultoriasComoOpcoes = (buscar) => async (termo) => {
  const { itens, total } = await buscar(termo)
  return { itens: itens.map(comoOpcaoDeConsultoria), total }
}
