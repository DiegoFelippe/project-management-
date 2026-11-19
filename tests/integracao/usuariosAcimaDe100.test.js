// O cartão "Acima de 100%" de Usuários leva ao filtro da lista (usabilidade, U5) contra o Supabase local de verdade: roda
// listarUsuarios e indicadoresDeUsuarios de src/data (as mesmas chamadas que o app faz). Pega o que um mock esconde: a
// função que devolve linhas de perfis aceitar pela API as colunas embutidas, os filtros, a ordem, a página e a contagem.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, entrarComo, limparTudo, registrarCliente } from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, {
    get: (_, nome) => {
      const valor = atual.cliente[nome]
      return typeof valor === 'function' ? valor.bind(atual.cliente) : valor
    },
  }),
  chamarFuncao: () => {
    throw new Error('a lista de Usuários não chama Edge Function')
  },
}))

const { listarUsuarios } = await import('../../src/data/usuarios.js')
const { indicadoresDeUsuarios } = await import('../../src/data/indicadores.js')

const admin = clienteAdmin()
// O mês atual em São Paulo (aaaa-mm-01): a ocupação do mês atual conta o reservado (as horas previstas dos clientes).
const mes = `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)}-01`
let A, B, cheia, folgada, deB

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  const adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  cheia = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  folgada = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  deB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: B })
  await admin.from('perfis').update({ tipos_de_consultoria: ['gestao'] }).eq('id', cheia.id)
  // 300 h previstas passam de qualquer capacidade de 44 h por semana; 10 h ficam bem abaixo.
  for (const [pessoa, consultoria, horas] of [[cheia, A, 300], [folgada, A, 10], [deB, B, 300]]) {
    const { data, error } = await admin.from('clientes')
      .insert({ nome: `Acima de 100% ${horas}`, horas_mes: horas, consultoria_id: consultoria, consultor_id: pessoa.id })
      .select('id').single()
    if (error) throw error
    registrarCliente(data.id)
  }
  atual.cliente = await entrarComo(adminA)
})

afterAll(limparTudo)

describe('Usuários: o filtro do cartão "Acima de 100%" pela API', () => {
  it('a lista filtrada traz quem passa de 100% no mês, com as colunas da tabela, e tem o número do cartão', async () => {
    const { itens, total } = await listarUsuarios({ consultoriaId: A, acima: true, mes, pagina: 1 })
    expect(itens.map((p) => p.id)).toEqual([cheia.id])
    expect(total).toBe(1)
    expect(itens[0]).toMatchObject({ papel: 'pessoa', ativo: true, consultoria: { nome: expect.any(String) }, times: [] })
    expect((await indicadoresDeUsuarios({ consultoriaId: A, mes })).acima_de_100).toBe(1)
  })

  it('os filtros da barra valem junto (Tipo) e a outra consultoria nunca aparece', async () => {
    expect((await listarUsuarios({ consultoriaId: A, acima: true, mes, tipo: 'gestao', pagina: 1 })).total).toBe(1)
    expect((await listarUsuarios({ consultoriaId: A, acima: true, mes, tipo: 'sem', pagina: 1 })).total).toBe(0)
    const pedindoB = await listarUsuarios({ consultoriaId: B, acima: true, mes, pagina: 1 })
    expect(pedindoB.itens.map((p) => p.id)).not.toContain(deB.id)
  })

  it('sem o filtro, a lista continua com todos os ativos', async () => {
    const { itens } = await listarUsuarios({ consultoriaId: A, pagina: 1 })
    expect(itens.map((p) => p.id)).toEqual(expect.arrayContaining([cheia.id, folgada.id]))
  })
})
