// As funções dos gráficos do Início contra o Supabase local de verdade: roda src/data/painel.js (as mesmas chamadas que
// o Início faz) como cada tipo de usuário. Pega o que um mock esconde: nome de parâmetro errado, uma consultoria vendo
// a outra, a fila chegando ao consultor.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, entrarComo, limparTudo, registrarCliente } from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
  chamarFuncao: () => {
    throw new Error('o Início não chama Edge Function')
  },
}))

const { checkinsPorSemana, clientesEmRisco, comparacaoDoInicio, filaDeClientes, horasPorCliente, painelDoInicio } =
  await import('../../src/data/painel.js')

const admin = clienteAdmin()
const HORA = 3_600_000
const DIA = 24 * HORA
let sessoes = {}
const ids = {}
const marca = randomUUID().slice(0, 8)

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}

// O dia de São Paulo (AAAA-MM-DD) de um instante.
const diaDeSaoPaulo = (instante) => new Date(instante).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const ULTIMOS_30 = { de: diaDeSaoPaulo(Date.now() - 29 * DIA), ate: diaDeSaoPaulo(Date.now()) }

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

// Um check-in fechado de 1 h, de 3 h atrás a 2 h atrás, gravado pelo próprio consultor.
async function checkin(quem, cliente) {
  const agora = Date.now()
  const { error } = await sessoes[quem].from('checkins').insert({
    cliente_id: cliente,
    inicio: new Date(agora - 3 * HORA).toISOString(),
    fim: new Date(agora - 2 * HORA).toISOString(),
    descricao: 'Gráficos do Início',
  })
  if (error) throw error
}

// Tudo o que a gestão da A recebe, em todas as funções (Mês atual e últimos 30 dias).
async function tudoQueRecebe() {
  return JSON.stringify(await Promise.all([
    painelDoInicio(), painelDoInicio(ULTIMOS_30), comparacaoDoInicio(), comparacaoDoInicio(ULTIMOS_30),
    filaDeClientes(), filaDeClientes(ULTIMOS_30), clientesEmRisco(), horasPorCliente(ULTIMOS_30),
    horasPorCliente(ULTIMOS_30, 1), checkinsPorSemana(), checkinsPorSemana(ULTIMOS_30),
  ]))
}

beforeAll(async () => {
  ids.A = await criarConsultoriaDeTeste(`Gráficos A ${marca}`)
  ids.B = await criarConsultoriaDeTeste(`Gráficos B ${marca}`)
  const central = await criarPerfilDeTeste({ papel: 'central' })
  const adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: ids.A })
  const pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: ids.A })
  const adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: ids.B })
  const pessoaB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: ids.B })
  Object.assign(ids, { adminB: adminB.id, pessoaB: pessoaB.id })
  sessoes = {
    central: await entrarComo(central),
    adminA: await entrarComo(adminA),
    pessoaA: await entrarComo(pessoaA),
    pessoaB: await entrarComo(pessoaB),
  }
  ids.clienteA = await novoCliente(`Cliente A ${marca}`, ids.A, pessoaA.id)
  ids.esperaA = await novoCliente(`Espera A ${marca}`, ids.A, null)
  ids.clienteB = await novoCliente(`Cliente B ${marca}`, ids.B, pessoaB.id)
  ids.esperaB = await novoCliente(`Espera B ${marca}`, ids.B, null)
  await checkin('pessoaA', ids.clienteA)
  await checkin('pessoaB', ids.clienteB)
})

afterAll(limparTudo)

describe('gráficos do Início contra o banco de verdade', () => {
  it('o admin da A não recebe nada da B em nenhuma função', async () => {
    entrar('adminA')
    const texto = await tudoQueRecebe()
    for (const coisaDaB of [ids.B, `Gráficos B ${marca}`, ids.adminB, ids.pessoaB, ids.clienteB, `Cliente B ${marca}`,
      ids.esperaB, `Espera B ${marca}`]) {
      expect(texto).not.toContain(coisaDaB)
    }
    // E recebe o que é dele (a conferência acima não passa por estar vazia).
    expect(texto).toContain(ids.clienteA)
    expect(texto).toContain(ids.esperaA)
  })

  it('o consultor recebe sem_recorte na fila e as outras funções no recorte dele', async () => {
    entrar('pessoaA')
    await expect(filaDeClientes()).rejects.toMatchObject({ code: '42501', message: 'sem_recorte' })
    const horas = await horasPorCliente(ULTIMOS_30)
    expect(horas.itens.map((c) => c.id)).toEqual([ids.clienteA])
    expect(horas.itens[0]).toMatchObject({ horas: 1, sub: null })
    expect((await painelDoInicio()).recorte).toBe('pessoa')
  })

  it('a central recebe as duas consultorias', async () => {
    entrar('central')
    const fila = await filaDeClientes()
    const naFila = fila.pontos.map((p) => p.id)
    expect(fila.total_esperando).toBeGreaterThanOrEqual(2)
    expect(fila.pontos.length).toBeLessThanOrEqual(40)
    // Os dois que acabaram de chegar esperam há 0 dias: estão entre os 40 só se a fila de verdade for pequena; o total
    // das etapas conta os dois sempre.
    if (fila.total_esperando <= 40) expect(naFila).toEqual(expect.arrayContaining([ids.esperaA, ids.esperaB]))
    const horas = await horasPorCliente(ULTIMOS_30, 1)
    const todas = [horas]
    for (let pagina = 2; (pagina - 1) * 15 < horas.total; pagina += 1) todas.push(await horasPorCliente(ULTIMOS_30, pagina))
    const comHoras = todas.flatMap((p) => p.itens)
    expect(comHoras.find((c) => c.id === ids.clienteA)).toMatchObject({ horas: 1, sub: `Gráficos A ${marca}` })
    expect(comHoras.find((c) => c.id === ids.clienteB)).toMatchObject({ horas: 1, sub: `Gráficos B ${marca}` })
  })
})
