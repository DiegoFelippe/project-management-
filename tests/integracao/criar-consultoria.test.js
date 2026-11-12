import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  REDIRECT,
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  emailDeTeste,
  emailsPara,
  entrarComo,
  limparTudo,
  registrarConsultoria,
  registrarEmail,
} from './ambiente.js'

const admin = clienteAdmin()
let existente, comoDono, comoAdmin

async function criarConsultoria(cliente, corpo) {
  const r = await chamarFuncao(cliente, 'criar-consultoria', { redirectTo: REDIRECT, ...corpo })
  registrarConsultoria(r.corpo.consultoria_id)
  if (corpo.admin?.email) await registrarEmail(corpo.admin.email.trim().toLowerCase())
  return r
}

beforeAll(async () => {
  existente = await criarConsultoriaDeTeste()
  const dono = await criarPerfilDeTeste({ papel: 'dono' })
  const adminExistente = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: existente })
  comoDono = await entrarComo(dono)
  comoAdmin = await entrarComo(adminExistente)
})

afterAll(limparTudo)

describe('criar-consultoria', () => {
  it('dono cria consultoria com admin por convite', async () => {
    const email = emailDeTeste('rita')
    const r = await criarConsultoria(comoDono, {
      nome: 'Acme Consultoria',
      admin: { forma: 'convite', nome: 'Rita Alves', email },
    })
    expect(r.status).toBe(201)
    const { data: c } = await admin.from('consultorias').select('nome').eq('id', r.corpo.consultoria_id).single()
    expect(c.nome).toBe('Acme Consultoria')
    const { data: p } = await admin.from('perfis').select('*').eq('id', r.corpo.admin_id).single()
    expect(p).toMatchObject({ papel: 'admin', consultoria_id: r.corpo.consultoria_id, convite_pendente: true })
    await expect.poll(() => emailsPara(email).then((m) => m.length), { timeout: 5000 }).toBe(1)
  })

  it('admin não cria consultoria', async () => {
    const r = await criarConsultoria(comoAdmin, {
      nome: 'Outra',
      admin: { forma: 'convite', nome: 'Alguém Novo', email: emailDeTeste() },
    })
    expect(r.status).toBe(403)
  })

  it('nome da consultoria vazio', async () => {
    const r = await criarConsultoria(comoDono, {
      nome: '  ',
      admin: { forma: 'convite', nome: 'Alguém Novo', email: emailDeTeste() },
    })
    expect(r.status).toBe(400)
    expect(r.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'nome' })
  })

  it('dono cria outro admin numa consultoria existente pelo criar-acesso', async () => {
    const email = emailDeTeste('admin2')
    const r = await chamarFuncao(comoDono, 'criar-acesso', {
      forma: 'convite', nome: 'Segundo Admin', email, papel: 'admin', times: [], consultoria_id: existente, redirectTo: REDIRECT,
    })
    await registrarEmail(email)
    expect(r.status).toBe(201)
  })

  it('dono não cria pessoa', async () => {
    const r = await chamarFuncao(comoDono, 'criar-acesso', {
      forma: 'convite', nome: 'Pessoa Comum', email: emailDeTeste(), papel: 'pessoa', times: [], consultoria_id: existente, redirectTo: REDIRECT,
    })
    expect(r.status).toBe(403)
  })
})
