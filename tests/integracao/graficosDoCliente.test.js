// A faixa "Hoje" e as horas por dia/mês do cliente contra o Supabase local de verdade: roda src/data/clientes.js (as
// mesmas chamadas que a aba Geral faz) como cada tipo de usuário. Pega o que um mock esconde: nome de parâmetro errado,
// a gestão da B vendo o que o cliente teve na A, a reunião do convite sumindo para o consultor.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, entrarComo, limparTudo, registrarCliente } from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
  chamarFuncao: () => {
    throw new Error('a aba Geral não chama Edge Function')
  },
}))

const { checkinsPorSemana, hojeDoCliente, horasPorConsultor, horasPorDia, horasPorMes } = await import('../../src/data/clientes.js')
const { quadroDoCliente } = await import('../../src/data/quadro.js')

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
const confere = ({ data, error }) => {
  if (error) throw error
  return data
}

async function novoCliente(nome, consultoria, consultor) {
  const { id } = confere(await admin.from('clientes')
    .insert({ nome, horas_mes: 10, consultoria_id: consultoria, consultor_id: consultor }).select('id').single())
  registrarCliente(id)
  return id
}

// Evento de 1 h a `dias` dias de agora, na consultoria A.
async function novoEvento(titulo, consultor, cliente, dias) {
  const inicio = Date.now() + dias * DIA
  const { id } = confere(await admin.from('agenda_eventos').insert({
    consultoria_id: ids.A, consultor_id: consultor, cliente_id: cliente, titulo,
    inicio: new Date(inicio).toISOString(), fim: new Date(inicio + HORA).toISOString(),
  }).select('id').single())
  return id
}

beforeAll(async () => {
  ids.A = await criarConsultoriaDeTeste(`Hoje A ${marca}`)
  ids.B = await criarConsultoriaDeTeste(`Hoje B ${marca}`)
  const central = await criarPerfilDeTeste({ papel: 'central' })
  const adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: ids.A })
  const pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: ids.A })
  const colegaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: ids.A })
  const adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: ids.B })
  const pessoaB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: ids.B })
  Object.assign(ids, { pessoaA: pessoaA.id, colegaA: colegaA.id, pessoaB: pessoaB.id })
  sessoes = {
    central: await entrarComo(central),
    adminA: await entrarComo(adminA),
    pessoaA: await entrarComo(pessoaA),
    adminB: await entrarComo(adminB),
  }

  // O cliente que vai da A para a B: um check-in da pessoaA (de 3 h atrás a 2 h atrás), o quadro da A (criado pela
  // gestão, como a tela faz) e um check-list aberto na A.
  ids.muda = await novoCliente(`Muda ${marca}`, ids.A, pessoaA.id)
  ids.inicioDoCheckin = Date.now() - 3 * HORA
  confere(await sessoes.pessoaA.from('checkins').insert({
    cliente_id: ids.muda, inicio: new Date(ids.inicioDoCheckin).toISOString(),
    fim: new Date(ids.inicioDoCheckin + HORA).toISOString(), descricao: 'Faixa Hoje',
  }))
  entrar('adminA')
  ids.quadroA = (await quadroDoCliente(ids.muda)).id
  const { id: checklist } = confere(await admin.from('cliente_checklists').insert({
    cliente_id: ids.muda, consultoria_id: ids.A, modelo_nome: `Modelo da A ${marca}`, inicio: diaDeSaoPaulo(Date.now() - 10 * DIA),
  }).select('id').single())
  const { id: etapa } = confere(await admin.from('checklist_etapas')
    .insert({ checklist_id: checklist, nome: `Etapa da A ${marca}`, posicao: 1 }).select('id').single())
  confere(await admin.from('checklist_tarefas').insert({
    checklist_id: checklist, etapa_id: etapa, titulo: 'Tarefa da A', prazo_dias: 5, vence_em: diaDeSaoPaulo(Date.now() - 5 * DIA),
    posicao: 1,
  }))
  Object.assign(ids, { checklist, etapa })

  // O cliente da pessoaA com reuniões: uma amanhã do colega, sem convite; outra em 2 dias do colega, com ela convidada.
  ids.reunioes = await novoCliente(`Reuniões ${marca}`, ids.A, pessoaA.id)
  ids.doColega = await novoEvento('Do colega', colegaA.id, ids.reunioes, 1)
  ids.convite = await novoEvento('Com convite', colegaA.id, ids.reunioes, 2)
  confere(await admin.from('agenda_participantes').insert({ evento_id: ids.convite, perfil_id: pessoaA.id }))
})

afterAll(limparTudo)

describe('faixa Hoje e horas do cliente contra o banco de verdade', () => {
  it('cliente que passou da A para a B: a gestão da B não vê check-in, quadro nem check-list da A', async () => {
    // Antes da mudança, a gestão da A vê os três (a conferência da B não passa por estar vazia).
    entrar('adminA')
    const daA = await hojeDoCliente(ids.muda)
    expect(daA.checkin.ultimo).toBe(diaDeSaoPaulo(ids.inicioDoCheckin))
    expect(daA.quadro.id).toBe(ids.quadroA)
    expect(daA.checklist).toMatchObject({ modelo_nome: `Modelo da A ${marca}`, tarefas: 1, atrasadas: 1 })

    // Como no app: vai para a B (sem consultor) e a gestão da B escolhe o consultor.
    confere(await admin.from('clientes').update({ consultoria_id: ids.B }).eq('id', ids.muda))
    confere(await admin.from('clientes').update({ consultor_id: ids.pessoaB }).eq('id', ids.muda))

    entrar('adminB')
    const daB = await hojeDoCliente(ids.muda)
    expect(daB.checkin).toEqual({ ultimo: null, dias_sem: null, situacao: 'em_dia', dias_com_checkin: [] })
    expect(daB.quadro).toBeNull()
    expect(daB.checklist).toBeNull()
    expect(daB.previsao.realizado).toBe(0)
    const texto = JSON.stringify(daB)
    for (const coisaDaA of [ids.A, ids.quadroA, ids.checklist, ids.etapa, `Modelo da A ${marca}`, `Etapa da A ${marca}`]) {
      expect(texto).not.toContain(coisaDaA)
    }
    // A gestão da A deixa de ver o cliente; a central continua vendo o último check-in (de qualquer consultoria).
    entrar('adminA')
    expect(await hojeDoCliente(ids.muda)).toBeNull()
    entrar('central')
    expect((await hojeDoCliente(ids.muda)).checkin.ultimo).toBe(diaDeSaoPaulo(ids.inicioDoCheckin))
  })

  it('o consultor vê a reunião em que foi convidado (a do colega sem convite, antes dela, não)', async () => {
    entrar('pessoaA')
    expect((await hojeDoCliente(ids.reunioes)).reuniao).toMatchObject({ id: ids.convite, titulo: 'Com convite', com_meet: false })
    entrar('adminA')
    expect((await hojeDoCliente(ids.reunioes)).reuniao.id).toBe(ids.doColega)
  })

  it('horasPorDia e horasPorMes(id, até) chegam ao banco com os nomes certos', async () => {
    entrar('central')
    const mes = await horasPorDia(ids.muda, null)
    expect(mes).toMatchObject({ realizado: (await hojeDoCliente(ids.muda)).previsao.realizado, previsao: 10 })
    expect(mes.dias.at(-1).dia).toBe(diaDeSaoPaulo(Date.now()))
    const ate = `${mes.mes.slice(0, 4) - 1}-${mes.mes.slice(5, 7)}-15`
    const meses = await horasPorMes(ids.muda, ate)
    expect(meses).toHaveLength(6)
    expect(meses.at(-1).mes).toBe(`${ate.slice(0, 7)}-01`)
    expect(await horasPorMes(ids.muda, ate, 13)).toHaveLength(13)
  })

  it('no período (filtro da aba Geral): as funções do período somam o que cada um vê e recusam o período inválido', async () => {
    // Cliente da pessoaA na A com 1 h há 2 dias; o período são os últimos 30 dias.
    const cliente = await novoCliente(`Período ${marca}`, ids.A, ids.pessoaA)
    const inicio = Date.now() - 2 * DIA
    confere(await sessoes.pessoaA.from('checkins').insert({
      cliente_id: cliente, inicio: new Date(inicio).toISOString(), fim: new Date(inicio + HORA).toISOString(), descricao: 'Período',
    }))
    const hoje = diaDeSaoPaulo(Date.now())
    const periodo = { de: diaDeSaoPaulo(Date.now() - 29 * DIA), ate: hoje }

    entrar('adminA')
    const dias = await horasPorDia(cliente, periodo)
    expect(dias).toMatchObject({ de: periodo.de, ate: hoje, ate_efetivo: hoje, realizado: 1, previsao_mes: 10 })
    expect(dias.dias).toHaveLength(30)
    expect(dias.previsao).toBeGreaterThan(9)
    expect(await horasPorConsultor(cliente, periodo)).toEqual([{ consultorId: ids.pessoaA, nome: expect.any(String), horas: 1 }])
    const semanas = await checkinsPorSemana(cliente, periodo)
    expect(semanas.reduce((soma, s) => soma + s.quantidade, 0)).toBe(1)

    // A gestão da B não soma nada do cliente da A nem vê a previsão.
    entrar('adminB')
    expect(await horasPorDia(cliente, periodo)).toMatchObject({ realizado: 0, previsao: null, previsao_mes: null })
    expect(await horasPorConsultor(cliente, periodo)).toEqual([])
    expect((await checkinsPorSemana(cliente, periodo)).every((s) => s.quantidade === 0)).toBe(true)

    // As mesmas recusas do Início.
    entrar('adminA')
    await expect(horasPorDia(cliente, { de: hoje, ate: periodo.de })).rejects
      .toMatchObject({ code: '22023', message: 'periodo_invalido', details: 'A data inicial vem depois da final.' })
  })
})
