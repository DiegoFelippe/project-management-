// Times com várias pessoas de uma vez (Novo time e "Colocar pessoas": usabilidade, U7) contra o Supabase local de
// verdade: roda criarTime e adicionarMembros de src/data/times.js (as mesmas chamadas do app) como o gestor. Pega o que o
// mock esconde: o upsert com "quem já está fica como está" sob o RLS de time_membros, e que o lote é tudo ou nada.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clienteAdmin, criarConsultoriaDeTeste, criarPerfilDeTeste, criarTimeDeTeste, entrarComo, limparTudo } from './ambiente.js'

const atual = vi.hoisted(() => ({ cliente: null }))
vi.mock('@/lib/supabase', () => ({
  supabase: new Proxy({}, { get: (_, nome) => (...args) => atual.cliente[nome](...args) }),
}))

const { adicionarMembros, criarTime } = await import('../../src/data/times.js')

const admin = clienteAdmin()
let A, gestorA, outroGestorA, pessoas, deFora, comoGestor, timeId

const membros = async (time) => {
  const { data, error } = await admin.from('time_membros').select('pessoa_id').eq('time_id', time)
  if (error) throw error
  return data.map((m) => m.pessoa_id).sort()
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  const B = await criarConsultoriaDeTeste()
  gestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  outroGestorA = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoas = []
  for (let i = 0; i < 4; i++) pessoas.push(await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A }))
  deFora = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: B })
  comoGestor = await entrarComo(gestorA)
  atual.cliente = comoGestor
})

afterAll(limparTudo)

describe('times com várias pessoas de uma vez', () => {
  it('o gestor cria o time e coloca duas pessoas numa chamada só', async () => {
    const criado = await criarTime({ nome: 'Time de integração U7', descricao: '', gestorId: gestorA.id, consultoriaId: A })
    expect(criado.erro).toBeUndefined()
    timeId = criado.id
    expect(await adicionarMembros(timeId, [pessoas[0].id, pessoas[1].id])).toEqual({ erro: null })
    expect(await membros(timeId)).toEqual([pessoas[0].id, pessoas[1].id].sort())
  })

  it('quem já está fica como está (sem erro) e a nova entra', async () => {
    expect(await adicionarMembros(timeId, [pessoas[0].id, pessoas[2].id])).toEqual({ erro: null })
    expect(await membros(timeId)).toEqual([pessoas[0].id, pessoas[1].id, pessoas[2].id].sort())
  })

  it('é tudo ou nada: alguém de outra consultoria barra o lote, e ninguém dele entra', async () => {
    const { erro } = await adicionarMembros(timeId, [pessoas[3].id, deFora.id])
    expect(erro).toEqual(expect.any(String))
    expect(await membros(timeId)).not.toContain(pessoas[3].id)
    expect(await membros(timeId)).not.toContain(deFora.id)
  })

  it('quem não gerencia o time não coloca ninguém (o RLS recusa)', async () => {
    const doOutro = await criarTimeDeTeste({ consultoriaId: A, gestorId: outroGestorA.id })
    const { erro } = await adicionarMembros(doOutro, [pessoas[3].id])
    expect(erro).toEqual(expect.any(String))
    expect(await membros(doOutro)).toEqual([])
  })
})
