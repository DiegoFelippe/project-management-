// A leitura da agenda contra o Supabase local de verdade: roda as funções de src/data/agenda.js (os mesmos
// textos de select e chamadas de função que o app usa) como cada tipo de usuário. Pega o que um mock esconde:
// relação ambígua no PostgREST (PGRST201), coluna que não existe, recorte errado por papel.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
  registrarCliente,
} from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
}))

const {
  ausenciasDoPeriodo,
  buscarEvento,
  eventosDoPeriodo,
  feriadosDoPeriodo,
  indicadoresDaAgenda,
  meuGoogle,
} = await import('../../src/data/agenda.js')

const admin = clienteAdmin()
const DE = '2026-11-01T00:00:00-03:00'
const ATE = '2026-12-01T00:00:00-03:00'

let A, B
let central, gestorA, pessoaA, pessoaA2, pessoaB
let sessoes = {}
let clienteA
const ev = {}

const entrar = (quem) => {
  atual.cliente = sessoes[quem]
}
const titulos = (r) => r.itens.map((e) => e.titulo).sort()

async function novoEvento(chave, consultoria, consultor, dia, extras = {}) {
  const { data, error } = await admin
    .from('agenda_eventos')
    .insert({
      consultoria_id: consultoria,
      consultor_id: consultor,
      titulo: `Integração ${chave}`,
      inicio: `2026-11-${dia}T13:00:00Z`,
      fim: `2026-11-${dia}T14:00:00Z`,
      ...extras,
    })
    .select('id')
    .single()
  if (error) throw error
  ev[chave] = data.id
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  central = await criarPerfilDeTeste({ papel: 'central' })
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoaA = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaA2 = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaB = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: B })
  sessoes = {
    central: await entrarComo(central),
    gestor: await entrarComo(gestorA),
    pessoa: await entrarComo(pessoaA),
    pessoaB: await entrarComo(pessoaB),
  }

  const cliente = await admin
    .from('clientes')
    .insert({ nome: 'Cliente agenda integração', horas_mes: 10, consultoria_id: A, consultor_id: pessoaA.id })
    .select('id')
    .single()
  if (cliente.error) throw cliente.error
  clienteA = cliente.data.id
  registrarCliente(clienteA)

  await novoEvento('proprio', A, pessoaA.id, '10', { cliente_id: clienteA, com_meet: true })
  await novoEvento('convidado', A, pessoaA2.id, '11')
  await novoEvento('colega', A, pessoaA2.id, '12')
  await novoEvento('deB', B, pessoaB.id, '13')
  const participantes = await admin.from('agenda_participantes').insert([
    { evento_id: ev.convidado, perfil_id: pessoaA.id },
    { evento_id: ev.convidado, email: 'fora@exemplo.com' },
  ])
  if (participantes.error) throw participantes.error
  const ausencia = await admin
    .from('ausencias')
    .insert({ perfil_id: pessoaA.id, de: '2026-11-16', ate: '2026-11-18', motivo: 'Férias' })
  if (ausencia.error) throw ausencia.error
})

afterAll(limparTudo)

describe('agenda: leituras contra o banco de verdade', () => {
  it('consultor: os próprios e o convidado, com participantes, cliente e nomes; o do colega não', async () => {
    entrar('pessoa')
    const r = await eventosDoPeriodo({ de: DE, ate: ATE })
    expect(titulos(r)).toEqual(['Integração convidado', 'Integração proprio'])
    expect(r.haMais).toBe(false)
    const proprio = r.itens.find((e) => e.id === ev.proprio)
    expect(proprio.cliente).toMatchObject({ id: clienteA, nome: 'Cliente agenda integração' })
    const convidado = r.itens.find((e) => e.id === ev.convidado)
    expect(convidado.consultor.id).toBe(pessoaA2.id)
    expect(convidado.consultor.nome).toBeTruthy()
    expect(convidado.participantes).toHaveLength(2)
    expect(convidado.participantes.find((p) => p.email === 'fora@exemplo.com').resposta).toBe('pendente')
    expect(convidado.participantes.find((p) => p.perfil_id === pessoaA.id).nome).toBeTruthy()
  })

  it('filtros de cliente e de consultor rodam no banco', async () => {
    entrar('pessoa')
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE, clienteId: clienteA }))).toEqual(['Integração proprio'])
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE, consultorId: pessoaA2.id }))).toEqual(['Integração convidado'])
  })

  it('gestor vê a consultoria toda; central vê tudo e filtra; outra consultoria não vê a A', async () => {
    entrar('gestor')
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE }))).toEqual([
      'Integração colega',
      'Integração convidado',
      'Integração proprio',
    ])
    entrar('central')
    const tudo = titulos(await eventosDoPeriodo({ de: DE, ate: ATE }))
    expect(tudo).toEqual(expect.arrayContaining(['Integração colega', 'Integração deB', 'Integração proprio']))
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE, consultoriaId: B }))).toEqual(['Integração deB'])
    entrar('pessoaB')
    expect(titulos(await eventosDoPeriodo({ de: DE, ate: ATE }))).toEqual(['Integração deB'])
  })

  it('buscarEvento devolve o evento visível e nulo para o que não se vê', async () => {
    entrar('pessoa')
    expect((await buscarEvento(ev.convidado)).participantes).toHaveLength(2)
    expect(await buscarEvento(ev.colega)).toBeNull()
  })

  it('indicadores, feriados e Google', async () => {
    entrar('pessoa')
    const i = await indicadoresDaAgenda('2026-11-10')
    expect(Object.keys(i).sort()).toEqual(['aguardando', 'mes', 'pastas_no_mes', 'semana'])
    expect(i.mes).toBe(1)
    expect(await feriadosDoPeriodo('2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-15', '2026-11-20'])
    expect(await meuGoogle()).toEqual({ conectado: false, email: null, erro: null })
  })

  it('ausências: sem filtro, por consultor e por consultoria (a relação não é ambígua)', async () => {
    entrar('gestor')
    const todas = await ausenciasDoPeriodo({ de: '2026-11-01', ate: '2026-11-30' })
    expect(todas.map((a) => a.motivo)).toContain('Férias')
    // O nome vem pela leitura de perfis (RLS): gestor sem time não lê o perfil do consultor, então pode vir nulo.
    expect(todas.find((a) => a.motivo === 'Férias').perfil_id).toBe(pessoaA.id)
    expect(await ausenciasDoPeriodo({ de: '2026-11-01', ate: '2026-11-30', consultorId: pessoaA.id })).toHaveLength(1)
    // O filtro por consultoria junta com perfis (inner) e, por isso, depende da leitura de perfis: a central lê todos.
    entrar('central')
    expect(await ausenciasDoPeriodo({ de: '2026-11-01', ate: '2026-11-30', consultoriaId: A })).toHaveLength(1)
    expect(await ausenciasDoPeriodo({ de: '2026-11-01', ate: '2026-11-30', consultoriaId: B })).toHaveLength(0)
    expect(await ausenciasDoPeriodo({ de: '2026-12-01', ate: '2026-12-31', consultoriaId: A })).toHaveLength(0)
  })
})
