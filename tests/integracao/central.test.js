import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  REDIRECT,
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  criarTimeDeTeste,
  emailDeTeste,
  entrarComo,
  limparTudo,
  registrarConsultoria,
  registrarEmail,
} from './ambiente.js'

const admin = clienteAdmin()
let A
let dono, central, outraCentral, adminA, adminMover, gestorComTime, pessoaMembro, timeA
let comoDono, comoCentral, comoAdminA

const acesso = (cliente, corpo) => chamarFuncao(cliente, 'gerenciar-acesso', corpo)
const consultoria = (cliente, corpo) => chamarFuncao(cliente, 'gerenciar-consultoria', corpo)
const perfil = async (id) => (await admin.from('perfis').select('*').eq('id', id).single()).data

async function criarAcesso(cliente, corpo) {
  const r = await chamarFuncao(cliente, 'criar-acesso', { redirectTo: REDIRECT, forma: 'convite', ...corpo })
  await registrarEmail(corpo.email.trim().toLowerCase())
  return r
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  dono = await criarPerfilDeTeste({ papel: 'dono' })
  central = await criarPerfilDeTeste({ papel: 'central' })
  outraCentral = await criarPerfilDeTeste({ papel: 'central' })
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  adminMover = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  gestorComTime = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  timeA = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestorComTime.id })
  pessoaMembro = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  await admin.from('time_membros').insert({ time_id: timeA, pessoa_id: pessoaMembro.id })
  comoDono = await entrarComo(dono)
  comoCentral = await entrarComo(central)
  comoAdminA = await entrarComo(adminA)
})

afterAll(limparTudo)

describe('central nas funções', () => {
  it('central cria consultoria com administrador', async () => {
    const email = emailDeTeste('adm')
    const r = await chamarFuncao(comoCentral, 'criar-consultoria', {
      nome: `Da Central ${Date.now()}`,
      redirectTo: REDIRECT,
      admin: { forma: 'convite', nome: 'Admin Novo', email },
    })
    registrarConsultoria(r.corpo.consultoria_id)
    await registrarEmail(email)
    expect(r.status).toBe(201)
    const { data } = await admin.from('consultorias').select('id').eq('id', r.corpo.consultoria_id).maybeSingle()
    expect(data).toBeTruthy()
  })

  it('central renomeia e arquiva consultoria', async () => {
    const nome = `Central Renomeou ${Date.now()}`
    expect((await consultoria(comoCentral, { acao: 'renomear', consultoria_id: A, nome })).status).toBe(200)
    expect((await consultoria(comoCentral, { acao: 'arquivar', consultoria_id: A })).status).toBe(200)
    expect((await consultoria(comoCentral, { acao: 'reativar', consultoria_id: A })).status).toBe(200)
  })

  it('central cria administrador numa consultoria; não cria gestor', async () => {
    const r = await criarAcesso(comoCentral, {
      nome: 'Admin Da Central',
      email: emailDeTeste('adm2'),
      papel: 'admin',
      consultoria_id: A,
    })
    expect(r.status).toBe(201)
    const g = await criarAcesso(comoCentral, {
      nome: 'Gestor Barrado',
      email: emailDeTeste('ges'),
      papel: 'gestor',
      consultoria_id: A,
    })
    expect(g.status).toBe(403)
  })

  it('dono e central não criam administrador em consultoria arquivada', async () => {
    const arquivada = await criarConsultoriaDeTeste()
    const { error } = await admin.from('consultorias').update({ arquivada_em: new Date().toISOString() }).eq('id', arquivada)
    expect(error).toBeNull()
    for (const cliente of [comoDono, comoCentral]) {
      const email = emailDeTeste('arq')
      const r = await criarAcesso(cliente, { nome: 'Admin Barrado', email, papel: 'admin', consultoria_id: arquivada })
      expect(r.status).toBe(409)
      expect(r.corpo.codigo).toBe('consultoria_arquivada')
      const { count } = await admin.from('perfis').select('*', { count: 'exact', head: true }).eq('email', email)
      expect(count).toBe(0)
    }
  })

  it('dono cria acesso de central', async () => {
    const r = await criarAcesso(comoDono, { nome: 'Central Nova', email: emailDeTeste('cen'), papel: 'central' })
    expect(r.status).toBe(201)
    expect(await perfil(r.corpo.pessoa_id)).toMatchObject({ papel: 'central', consultoria_id: null })
  })

  it('admin não cria central', async () => {
    const r = await criarAcesso(comoAdminA, { nome: 'Central Barrada', email: emailDeTeste('cen'), papel: 'central' })
    expect([400, 403]).toContain(r.status)
  })

  it('dono move admin para a central', async () => {
    const r = await acesso(comoDono, { acao: 'mover_para_central', pessoa_id: adminMover.id })
    expect(r.status).toBe(200)
    expect(await perfil(adminMover.id)).toMatchObject({ papel: 'central', consultoria_id: null })
  })

  it('mover para a central tira a pessoa dos times', async () => {
    const r = await acesso(comoDono, { acao: 'mover_para_central', pessoa_id: pessoaMembro.id })
    expect(r.status).toBe(200)
    expect(await perfil(pessoaMembro.id)).toMatchObject({ papel: 'central', consultoria_id: null })
    const { count } = await admin.from('time_membros').select('*', { count: 'exact', head: true }).eq('pessoa_id', pessoaMembro.id)
    expect(count).toBe(0)
  })

  it('dono não move gestor que gerencia time', async () => {
    const r = await acesso(comoDono, { acao: 'mover_para_central', pessoa_id: gestorComTime.id })
    expect(r.status).toBe(409)
    expect(r.corpo.codigo).toBe('gestor_com_times')
  })

  it('central não move ninguém para a central', async () => {
    const r = await acesso(comoCentral, { acao: 'mover_para_central', pessoa_id: adminA.id })
    expect(r.status).toBe(403)
  })

  it('central desativa administrador; não desativa outra central', async () => {
    expect((await acesso(comoCentral, { acao: 'desativar', pessoa_id: adminA.id })).status).toBe(200)
    expect((await acesso(comoCentral, { acao: 'desativar', pessoa_id: outraCentral.id })).status).toBe(403)
  })
})
