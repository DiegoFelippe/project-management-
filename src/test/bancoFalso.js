// supabase-js falso para os testes dos módulos de dados (src/data). Cada from() devolve um construtor de
// consulta que registra as chamadas ([método, ...argumentos]) e responde com `banco.resposta` no range()
// ou no await (ex.: contagem com head: true).
// Uso: vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } })) e, no beforeEach,
// vi.mocked(supabase.from).mockImplementation(banco.from).
export function criarBancoFalso() {
  const banco = {
    chamadas: [],
    resposta: { data: [], error: null, count: 0 },
    from(tabela) {
      banco.chamadas.push(['from', tabela])
      const consulta = new Proxy({}, {
        get(_alvo, metodo) {
          if (metodo === 'then') {
            return (resolver, rejeitar) => Promise.resolve(banco.resposta).then(resolver, rejeitar)
          }
          return (...argumentos) => {
            banco.chamadas.push([metodo, ...argumentos])
            return metodo === 'range' ? Promise.resolve(banco.resposta) : consulta
          }
        },
      })
      return consulta
    },
    // A consulta recebeu exatamente esta chamada?
    chamou(...chamada) {
      return banco.chamadas.some((c) => JSON.stringify(c) === JSON.stringify(chamada))
    },
  }
  return banco
}
