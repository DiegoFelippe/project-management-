// A tabela "Eventos do cliente" (embaixo da agenda do cliente) contra o Supabase local de verdade: roda
// eventosDoCliente de src/data/agenda.js (a mesma chamada que o app faz) como cada tipo de usuário. Pega o que um mock
// esconde: nome de parâmetro errado, recorte errado por papel, paginação que não vem do banco.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, entrarComo, limparTudo, registrarCliente } from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
  chamarFuncao: () => {
    throw new Error('a lista do cliente não chama Edge Function')
  },
}))

const { eventosDoCliente, eventosDoPeriodo } = await import('../../src/data/agenda.js')

const admin = clienteAdmin()
const DIA = 86_400_000
let sessoes = {}
let clienteA, clienteB
const ids = {}

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}

async function novoCliente(nome, consultoria, consultor) {
  const { data, error } = await admin
    .from('clientes')
    .insert({ nome, horas_mes: 10, consultoria_id: consultoria, consultor_id: consultor })
    .select('id')
    .single()
  if (error) throw error
  registrarCliente(data.id)
  return data.id
}

// Eventos a `dias` dias de agora (negativo = passado), de 1 h.
async function novosEventos(lista) {
  const agora = Date.now()
  const { data, error } = await admin
    .from('agenda_eventos')
    .insert(lista.map(({ titulo, consultoria, consultor, cliente, dias }) => ({
      consultoria_id: consultoria,
      consultor_id: consultor,
      cliente_id: cliente,
      titulo,
      inicio: new Date(agora + dias * DIA).toISOString(),
      fim: new Date(agora + dias * DIA + 3_600_000).toISOString(),
    })))
    .select('id, titulo')
  if (error) throw error
  for (const e of data) ids[e.titulo] = e.id
}

beforeAll(async () => {
  const A = await criarConsultoriaDeTeste()
  const B = await criarConsultoriaDeTeste()
  const central = await criarPerfilDeTeste({ papel: 'central' })
  const gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  const pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  const pessoaA2 = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  const gestorB = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: B })
  sessoes = {
    central: await entrarComo(central),
    gestor: await entrarComo(gestorA),
    pessoa: await entrarComo(pessoaA),
    colega: await entrarComo(pessoaA2),
    gestorB: await entrarComo(gestorB),
  }
  clienteA = await novoCliente('Cliente eventos integração', A, pessoaA.id)
  clienteB = await novoCliente('Cliente eventos integração B', B, null)

  // 18 eventos do cliente da pessoa (3 futuros e 15 passados) e 1 do colega, sem convite; mais 1 sem cliente e 1 de B.
  await novosEventos([
    ...[3, 2, 1].map((d) => ({ titulo: `Futuro ${d}`, consultoria: A, consultor: pessoaA.id, cliente: clienteA, dias: d })),
    ...Array.from({ length: 15 }, (_, i) => ({
      titulo: `Passado ${String(i + 1).padStart(2, '0')}`, consultoria: A, consultor: pessoaA.id, cliente: clienteA, dias: -(i + 1),
    })),
    { titulo: 'Do colega', consultoria: A, consultor: pessoaA2.id, cliente: clienteA, dias: -30 },
    { titulo: 'Sem cliente', consultoria: A, consultor: pessoaA.id, cliente: null, dias: 1 },
    { titulo: 'De B', consultoria: B, consultor: gestorB.id, cliente: clienteB, dias: 1 },
  ])
})

afterAll(limparTudo)

const titulos = (r) => r.itens.map((e) => e.titulo)

describe('eventosDoCliente contra o banco de verdade', () => {
  it('gestão: todos os eventos do cliente, 15 por página, do mais novo para o mais antigo, com o total e o próximo', async () => {
    entrar('gestor')
    const pagina1 = await eventosDoCliente({ clienteId: clienteA, pagina: 1 })
    expect(pagina1.total).toBe(19)
    expect(titulos(pagina1)).toEqual([
      'Futuro 3', 'Futuro 2', 'Futuro 1',
      ...Array.from({ length: 12 }, (_, i) => `Passado ${String(i + 1).padStart(2, '0')}`),
    ])
    expect(pagina1.proximoId).toBe(ids['Futuro 1'])
    const pagina2 = await eventosDoCliente({ clienteId: clienteA, pagina: 2 })
    expect(titulos(pagina2)).toEqual(['Passado 13', 'Passado 14', 'Passado 15', 'Do colega'])
    expect(pagina2.total).toBe(19)
    expect(await eventosDoCliente({ clienteId: clienteA, pagina: 3 })).toEqual({ itens: [], total: 19, proximoId: ids['Futuro 1'], foraDaFaixa: true })
  })

  it('cada item é o mesmo da agenda (eventosDoPeriodo), com o organizador e o cliente', async () => {
    entrar('pessoa')
    const { itens } = await eventosDoCliente({ clienteId: clienteA })
    const daLista = itens.find((e) => e.id === ids['Futuro 1'])
    const periodo = await eventosDoPeriodo({
      de: new Date(Date.now() - 40 * DIA).toISOString(), ate: new Date(Date.now() + 40 * DIA).toISOString(), clienteId: clienteA,
    })
    expect(daLista).toEqual(periodo.itens.find((e) => e.id === ids['Futuro 1']))
    expect(daLista.consultor.nome).toBeTruthy()
    expect(daLista.cliente).toMatchObject({ id: clienteA, nome: 'Cliente eventos integração' })
  })

  it('consultor: os próprios; o do colega (sem convite) não. Colega: só o dele', async () => {
    entrar('pessoa')
    const pessoa = await eventosDoCliente({ clienteId: clienteA, pagina: 2 })
    expect(pessoa.total).toBe(18)
    expect(titulos(pessoa)).not.toContain('Do colega')
    entrar('colega')
    expect(titulos(await eventosDoCliente({ clienteId: clienteA }))).toEqual(['Do colega'])
  })

  it('outra consultoria não vê nada; a central vê tudo', async () => {
    entrar('gestorB')
    expect(await eventosDoCliente({ clienteId: clienteA })).toEqual({ itens: [], total: 0, proximoId: null })
    entrar('central')
    expect((await eventosDoCliente({ clienteId: clienteA })).total).toBe(19)
    expect(titulos(await eventosDoCliente({ clienteId: clienteB }))).toEqual(['De B'])
  })
})
