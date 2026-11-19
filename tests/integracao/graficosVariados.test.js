// Os gráficos variados do Início e a faixa Hoje ampliada contra o Supabase local de verdade: roda src/data/painel.js e
// src/data/clientes.js (as mesmas chamadas que o Início e a aba Geral fazem) como cada tipo de usuário. Pega o que um
// mock esconde: nome de parâmetro errado, uma consultoria vendo a outra, o consultor chamando o que é da gestão. O
// check-list vem pelo caminho do app (a central monta o modelo, a gestão aplica e o consultor marca).
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

const { checkinsPorDiaEHora, clientesPorCidade, horasDoPainelPorDia, horasPorUnidadePorSemana, tarefasPorSituacao } =
  await import('../../src/data/painel.js')
const { hojeDoCliente } = await import('../../src/data/clientes.js')
const { aplicarModelo, lerChecklist, marcarTarefa } = await import('../../src/data/checklists.js')
const { salvarModelo } = await import('../../src/data/modelos.js')

const admin = clienteAdmin()
const HORA = 3_600_000
const DIA = 24 * HORA
let sessoes = {}
const ids = {}
const marca = randomUUID().slice(0, 8)

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}
const confere = ({ data, error }) => {
  if (error) throw error
  return data
}

// O dia de São Paulo (AAAA-MM-DD) de um instante, e o dia da semana (domingo = 0) e a hora de lá.
const diaDeSaoPaulo = (instante) => new Date(instante).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const diaDaSemanaEmSaoPaulo = (instante) =>
  SEMANA.indexOf(new Date(instante).toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }))
const horaEmSaoPaulo = (instante) =>
  Number(new Date(instante).toLocaleTimeString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false })) % 24
const ULTIMOS_30 = { de: diaDeSaoPaulo(Date.now() - 29 * DIA), ate: diaDeSaoPaulo(Date.now()) }

async function novoCliente(nome, consultoria, consultor, cidade) {
  const { id } = confere(await admin.from('clientes')
    .insert({ nome, horas_mes: 10, consultoria_id: consultoria, consultor_id: consultor, cidade, uf: 'SC' }).select('id').single())
  registrarCliente(id)
  return id
}

// Um check-in fechado de 1 h, de 3 h atrás a 2 h atrás, gravado pelo próprio consultor.
async function checkin(quem, cliente) {
  confere(await sessoes[quem].from('checkins').insert({
    cliente_id: cliente, inicio: new Date(ids.inicio).toISOString(), fim: new Date(ids.inicio + HORA).toISOString(),
    descricao: 'Gráficos variados',
  }))
}

// Tudo o que a gestão recebe das cinco funções novas (Mês atual e últimos 30 dias).
async function tudoQueRecebe() {
  return JSON.stringify(await Promise.all([
    horasDoPainelPorDia(), horasDoPainelPorDia(ULTIMOS_30), horasPorUnidadePorSemana(), horasPorUnidadePorSemana(ULTIMOS_30),
    checkinsPorDiaEHora(), checkinsPorDiaEHora(ULTIMOS_30), tarefasPorSituacao(), clientesPorCidade(),
  ]))
}

beforeAll(async () => {
  ids.A = await criarConsultoriaDeTeste(`Variados A ${marca}`)
  ids.B = await criarConsultoriaDeTeste(`Variados B ${marca}`)
  const central = await criarPerfilDeTeste({ papel: 'central' })
  const adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: ids.A })
  const pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: ids.A })
  const adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: ids.B })
  const pessoaB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: ids.B })
  Object.assign(ids, { pessoaA: pessoaA.id, adminB: adminB.id, pessoaB: pessoaB.id })
  sessoes = {
    central: await entrarComo(central),
    adminA: await entrarComo(adminA),
    pessoaA: await entrarComo(pessoaA),
    adminB: await entrarComo(adminB),
    pessoaB: await entrarComo(pessoaB),
  }
  ids.clienteA = await novoCliente(`Cliente A ${marca}`, ids.A, pessoaA.id, `Cidade A ${marca}`)
  ids.clienteA2 = await novoCliente(`Cliente A2 ${marca}`, ids.A, pessoaA.id, `  Cidade A ${marca} `)
  ids.clienteB = await novoCliente(`Cliente B ${marca}`, ids.B, pessoaB.id, `Cidade B ${marca}`)
  ids.inicio = Date.now() - 3 * HORA
  await checkin('pessoaA', ids.clienteA)
  await checkin('pessoaB', ids.clienteB)

  // O check-list do clienteA: 3 tarefas no prazo; o consultor faz uma e começa outra (o relógio dela corre 10 min).
  entrar('central')
  const modelo = await salvarModelo(null, {
    nome: `Modelo variados ${marca}`, tipo: 'gestao', para: ids.A,
    etapas: [{ nome: `Etapa ${marca}`, tarefas: [
      { chave: 'a', titulo: 'Feita', obrigatoria: true, prazo_dias: 5, depende_de: [] },
      { chave: 'b', titulo: 'Em andamento', obrigatoria: true, prazo_dias: 10, depende_de: [] },
      { chave: 'c', titulo: 'A fazer', obrigatoria: true, prazo_dias: 20, depende_de: [] },
    ] }],
  })
  if (modelo.erro) throw new Error(modelo.erro)
  entrar('adminA')
  const aplicado = await aplicarModelo({ clienteId: ids.clienteA, modeloId: modelo.id, inicio: diaDeSaoPaulo(Date.now()) })
  if (aplicado.erro) throw new Error(aplicado.erro)
  entrar('pessoaA')
  const tarefa = Object.fromEntries((await lerChecklist(ids.clienteA)).tarefas.map((t) => [t.titulo, t.id]))
  expect((await marcarTarefa(tarefa.Feita, 'feita')).erro).toBeNull()
  expect((await marcarTarefa(tarefa['Em andamento'], 'andamento')).erro).toBeNull()
  confere(await admin.from('checklist_tarefa_tempos').update({ inicio: new Date(Date.now() - 600_000).toISOString() })
    .eq('tarefa_id', tarefa['Em andamento']).is('fim', null))
})

afterAll(limparTudo)

describe('gráficos variados contra o banco de verdade', () => {
  it('a gestão da A recebe só o que é da A em todas as funções novas', async () => {
    entrar('adminA')
    const texto = await tudoQueRecebe()
    for (const coisaDaB of [ids.B, `Variados B ${marca}`, ids.adminB, ids.pessoaB, ids.clienteB, `Cidade B ${marca}`]) {
      expect(texto).not.toContain(coisaDaB)
    }
    expect(await tarefasPorSituacao()).toEqual({
      feitas: 1, nao_se_aplica: 0, andamento: 1, pausadas: 0, a_fazer: 1, atrasadas: 0, checklists: 1,
    })
    expect(await clientesPorCidade()).toEqual({
      cidades: [{ cidade: `Cidade A ${marca}`, uf: 'SC', clientes: 2 }], outras: 0, total: 2,
    })
    const porUnidade = await horasPorUnidadePorSemana(ULTIMOS_30)
    expect(porUnidade.recorte).toBe('consultoria')
    expect(porUnidade.series).toEqual([
      { id: ids.pessoaA, nome: 'Teste pessoa', horas: porUnidade.semanas.map((s) => (s === semanaDe(ids.inicio) ? 1 : 0)) },
    ])
  })

  it('o consultor recebe o dele e sem_recorte no que é só da central e da gestão', async () => {
    entrar('pessoaA')
    await expect(horasPorUnidadePorSemana()).rejects.toMatchObject({ code: '42501', message: 'sem_recorte' })
    await expect(clientesPorCidade()).rejects.toMatchObject({ code: '42501', message: 'sem_recorte' })
    const porDia = await horasDoPainelPorDia(ULTIMOS_30)
    expect(porDia.dias).toHaveLength(30)
    expect(porDia.dias.filter((d) => d.horas > 0)).toEqual([{ dia: diaDeSaoPaulo(ids.inicio), horas: 1 }])
    expect(porDia.hoje).toBe(diaDeSaoPaulo(Date.now()))
    expect(porDia.capacidade).toEqual(expect.any(Number))
    const calor = await checkinsPorDiaEHora(ULTIMOS_30)
    // 30 dias cabem nas 8 semanas: a janela é o período inteiro.
    expect(calor).toMatchObject({ de: ULTIMOS_30.de, ate: ULTIMOS_30.ate })
    expect(calor.celulas).toHaveLength(98)
    expect(calor.celulas.filter((c) => c.checkins > 0)).toEqual([{
      dia_semana: diaDaSemanaEmSaoPaulo(ids.inicio), hora: Math.min(Math.max(horaEmSaoPaulo(ids.inicio), 7), 20), checkins: 1,
    }])
    expect((await tarefasPorSituacao()).checklists).toBe(1)
  })

  it('a faixa Hoje traz andamento e pausadas por etapa e as tarefas com mais tempo', async () => {
    entrar('pessoaA')
    const { checklist } = await hojeDoCliente(ids.clienteA)
    expect(checklist.etapas).toEqual([expect.objectContaining({
      nome: `Etapa ${marca}`, tarefas: 3, feitas: 1, atrasadas: 0, andamento: 1, pausadas: 0,
    })])
    expect(checklist.mais_tempo).toHaveLength(1)
    expect(checklist.mais_tempo[0]).toMatchObject({ titulo: 'Em andamento' })
    expect(checklist.mais_tempo[0].segundos).toBeGreaterThanOrEqual(590)
  })

  it('a gestão da B não vê nada da A; a central vê as duas, por consultoria', async () => {
    entrar('adminB')
    const daB = await tudoQueRecebe()
    for (const coisaDaA of [ids.A, `Variados A ${marca}`, ids.pessoaA, ids.clienteA, `Cidade A ${marca}`]) {
      expect(daB).not.toContain(coisaDaA)
    }
    entrar('central')
    const porUnidade = await horasPorUnidadePorSemana(ULTIMOS_30)
    expect(porUnidade.recorte).toBe('tudo')
    expect(porUnidade.series.map((s) => s.id)).not.toContain(ids.pessoaA)
    // Os dados do banco local também entram: A e B (1 h cada) aparecem com a própria série ou, fora das 8 maiores,
    // dentro de "Outros".
    const soma = (serie) => serie.horas.reduce((total, h) => total + h, 0)
    const outros = porUnidade.series.find((s) => s.id === null)
    for (const consultoria of [ids.A, ids.B]) {
      const propria = porUnidade.series.find((s) => s.id === consultoria)
      if (propria) expect(soma(propria)).toBe(1)
      else expect(soma(outros)).toBeGreaterThanOrEqual(1)
    }
  })
})

// A segunda-feira (AAAA-MM-DD) da semana de São Paulo de um instante.
function semanaDe(instante) {
  const dia = new Date(`${diaDeSaoPaulo(instante)}T12:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7))
  return dia.toISOString().slice(0, 10)
}
