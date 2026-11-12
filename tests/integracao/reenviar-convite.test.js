import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  REDIRECT,
  chamarFuncao,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  emailDeTeste,
  emailsPara,
  entrarComo,
  limparTudo,
  registrarEmail,
} from './ambiente.js'

let A, ativa, comoAdmin, comoGestor

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  const adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  const gestor = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  ativa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  comoAdmin = await entrarComo(adminA)
  comoGestor = await entrarComo(gestor)
})

afterAll(limparTudo)

async function convidar(email) {
  const r = await chamarFuncao(comoAdmin, 'criar-acesso', {
    forma: 'convite', nome: 'Convidada Nova', email, papel: 'pessoa', times: [], redirectTo: REDIRECT,
  })
  await registrarEmail(email)
  expect(r.status).toBe(201)
  return r.corpo.pessoa_id
}

describe('reenviar-convite', () => {
  it('admin reenvia convite pendente', async () => {
    const email = emailDeTeste('reenvio')
    const pessoaId = await convidar(email)
    await expect.poll(() => emailsPara(email).then((m) => m.length), { timeout: 5000 }).toBe(1)
    const r = await chamarFuncao(comoAdmin, 'reenviar-convite', { pessoa_id: pessoaId, redirectTo: REDIRECT })
    expect(r.status).toBe(200)
    await expect.poll(() => emailsPara(email).then((m) => m.length), { timeout: 5000 }).toBe(2)
  })

  it('não reenvia para quem já aceitou', async () => {
    const r = await chamarFuncao(comoAdmin, 'reenviar-convite', { pessoa_id: ativa.id, redirectTo: REDIRECT })
    expect(r.status).toBe(409)
    expect(r.corpo.codigo).toBe('convite_ja_aceito')
  })

  it('gestor não reenvia para pessoa que não vê', async () => {
    const pessoaId = await convidar(emailDeTeste('alheia'))
    const r = await chamarFuncao(comoGestor, 'reenviar-convite', { pessoa_id: pessoaId, redirectTo: REDIRECT })
    expect(r.status).toBe(403)
  })
})
