import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  criarTimeDeTeste,
  entrarComo,
  limparTudo,
} from './ambiente.js'

const admin = clienteAdmin()
let A, B, D
let dono, adminA, adminA2, gestor, pessoa, pessoa2, adminB, adminD, pessoaD
let comoDono, comoAdminA, comoGestor, comoAdminB, comoAdminD

const acesso = (cliente, corpo) => chamarFuncao(cliente, 'gerenciar-acesso', corpo)
const consultoria = (cliente, corpo) => chamarFuncao(cliente, 'gerenciar-consultoria', corpo)
const perfil = async (id) => (await admin.from('perfis').select('*').eq('id', id).single()).data

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  D = await criarConsultoriaDeTeste()
  dono = await criarPerfilDeTeste({ papel: 'dono' })
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  adminA2 = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  gestor = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoa2 = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B })
  adminD = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: D })
  pessoaD = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: D })
  const t1 = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestor.id })
  await admin.from('time_membros').insert({ time_id: t1, pessoa_id: pessoa.id })
  comoDono = await entrarComo(dono)
  comoAdminA = await entrarComo(adminA)
  comoGestor = await entrarComo(gestor)
  comoAdminB = await entrarComo(adminB)
  comoAdminD = await entrarComo(adminD)
})

afterAll(limparTudo)

describe('gerenciar-acesso', () => {
  it('admin edita nome e papel de uma pessoa', async () => {
    const r = await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, nome: 'Nome Novo', papel: 'gestor' })
    expect(r.status).toBe(200)
    expect(await perfil(pessoa2.id)).toMatchObject({ nome: 'Nome Novo', papel: 'gestor' })
    await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, papel: 'pessoa' })
  })

  it('gestor edita só o nome de quem está no time dele', async () => {
    expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa.id, nome: 'Pelo Gestor' })).status).toBe(200)
    expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa.id, papel: 'gestor' })).status).toBe(403)
    expect((await acesso(comoGestor, { acao: 'desativar', pessoa_id: pessoa.id })).status).toBe(403)
  })

  it('gestor não edita quem não vê', async () => {
    expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa2.id, nome: 'Não Pode' })).status).toBe(403)
  })

  it('admin não mexe em si mesmo nem em outro admin; outra consultoria não mexe', async () => {
    expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: adminA.id, nome: 'Eu Mesmo' })).status).toBe(403)
    expect((await acesso(comoAdminA, { acao: 'desativar', pessoa_id: adminA2.id })).status).toBe(403)
    expect((await acesso(comoAdminB, { acao: 'desativar', pessoa_id: pessoa.id })).status).toBe(403)
  })

  it('desativar bloqueia o login e reativar devolve', async () => {
    expect((await acesso(comoAdminA, { acao: 'desativar', pessoa_id: pessoa2.id })).status).toBe(200)
    expect(await perfil(pessoa2.id)).toMatchObject({ ativo: false })
    await expect(entrarComo(pessoa2)).rejects.toMatchObject({ code: 'user_banned' })
    expect((await acesso(comoAdminA, { acao: 'reativar', pessoa_id: pessoa2.id })).status).toBe(200)
    await expect(entrarComo(pessoa2)).resolves.toBeTruthy()
  })

  it('gestor com times não é desativado', async () => {
    const r = await acesso(comoAdminA, { acao: 'desativar', pessoa_id: gestor.id })
    expect(r.status).toBe(409)
    expect(r.corpo.codigo).toBe('gestor_com_times')
  })

  it('dono desativa e reativa um administrador', async () => {
    expect((await acesso(comoDono, { acao: 'desativar', pessoa_id: adminA2.id })).status).toBe(200)
    expect((await acesso(comoDono, { acao: 'reativar', pessoa_id: adminA2.id })).status).toBe(200)
    expect((await acesso(comoDono, { acao: 'desativar', pessoa_id: pessoa.id })).status).toBe(403)
  })
})

describe('gerenciar-consultoria', () => {
  it('dono renomeia; nome repetido vira nome_em_uso', async () => {
    const nome = `Renomeada ${Date.now()}`
    expect((await consultoria(comoDono, { acao: 'renomear', consultoria_id: A, nome })).status).toBe(200)
    const r = await consultoria(comoDono, { acao: 'renomear', consultoria_id: B, nome: `  ${nome.toUpperCase()} ` })
    expect(r.status).toBe(409)
    expect(r.corpo.codigo).toBe('nome_em_uso')
  })

  it('administrador não arquiva', async () => {
    expect((await consultoria(comoAdminA, { acao: 'arquivar', consultoria_id: A })).status).toBe(403)
  })

  it('arquivar bloqueia todos; reativar não reativa quem foi desativado antes', async () => {
    expect((await acesso(comoAdminD, { acao: 'desativar', pessoa_id: pessoaD.id })).status).toBe(200)
    const r = await consultoria(comoDono, { acao: 'arquivar', consultoria_id: D })
    expect(r.status).toBe(200)
    expect(r.corpo.sem_bloqueio).toBe(0)
    await expect(entrarComo(adminD)).rejects.toMatchObject({ code: 'user_banned' })
    expect((await acesso(comoDono, { acao: 'reativar', pessoa_id: adminD.id })).corpo.codigo).toBe('consultoria_arquivada')
    expect((await consultoria(comoDono, { acao: 'reativar', consultoria_id: D })).status).toBe(200)
    await expect(entrarComo(adminD)).resolves.toBeTruthy()
    await expect(entrarComo(pessoaD)).rejects.toMatchObject({ code: 'user_banned' })
    expect(await perfil(pessoaD.id)).toMatchObject({ ativo: false })
  })
})
