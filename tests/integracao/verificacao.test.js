// Verificação em duas etapas: exigir (exige_2fa), zerar (apaga os fatores pela API de admin) e a sessão aal1
// recusada pelo banco e pelas Edge Functions quando a pessoa tem o app ativo ou a verificação exigida.
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
  registrarEmail,
  SENHA_TESTE,
} from './ambiente.js'
import { ativarVerificacao, confirmarCodigo, nivelDaSessao } from './totp.js'

const admin = clienteAdmin()
let A, B
let adminA, gestor, pessoa, exigida, comApp, adminB
let comoAdminA, comoGestor, comoAdminB

const acesso = (cliente, corpo) => chamarFuncao(cliente, 'gerenciar-acesso', corpo)
const perfil = async (id) => (await admin.from('perfis').select('*').eq('id', id).single()).data
const fatores = async (id) => (await admin.auth.admin.mfa.listFactors({ userId: id })).data.factors

async function criar(cliente, corpo) {
  const r = await chamarFuncao(cliente, 'criar-acesso', { redirectTo: REDIRECT, ...corpo })
  await registrarEmail(corpo.email)
  return r
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  gestor = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  exigida = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  comApp = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B })
  const t1 = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestor.id })
  await admin.from('time_membros').insert([pessoa, exigida, comApp].map((p) => ({ time_id: t1, pessoa_id: p.id })))
  comoAdminA = await entrarComo(adminA)
  comoGestor = await entrarComo(gestor)
  comoAdminB = await entrarComo(adminB)
})

afterAll(limparTudo)

describe('exigir a verificação (gerenciar-acesso, editar exige_2fa)', () => {
  it('quem pode editar o acesso liga e desliga', async () => {
    expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa.id, exige_2fa: true })).status).toBe(200)
    expect(await perfil(pessoa.id)).toMatchObject({ exige_2fa: true })
    expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa.id, exige_2fa: false })).status).toBe(200)
    expect(await perfil(pessoa.id)).toMatchObject({ exige_2fa: false })
  })

  it('gestor (só muda o nome), outra consultoria e a própria pessoa não mexem', async () => {
    expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa.id, exige_2fa: true })).status).toBe(403)
    expect((await acesso(comoAdminB, { acao: 'editar', pessoa_id: pessoa.id, exige_2fa: true })).status).toBe(403)
    expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: adminA.id, exige_2fa: true })).status).toBe(403)
    expect(await perfil(pessoa.id)).toMatchObject({ exige_2fa: false })
    expect(await perfil(adminA.id)).toMatchObject({ exige_2fa: false })
  })

  it('valor que não é sim/não é recusado', async () => {
    const r = await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa.id, exige_2fa: 'sim' })
    expect(r.status).toBe(400)
    expect(r.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'exige_2fa' })
  })
})

describe('sessão aal1 de quem precisa do código', () => {
  it('exigida e sem o app: o banco esconde tudo menos o próprio perfil, e as funções recusam', async () => {
    expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: exigida.id, exige_2fa: true })).status).toBe(200)
    const sessao = await entrarComo(exigida)
    expect(await nivelDaSessao(sessao)).toBe('aal1')
    const { data: eu } = await sessao.from('perfis').select('id, exige_2fa, verificacao_desde').eq('id', exigida.id).single()
    expect(eu).toEqual({ id: exigida.id, exige_2fa: true, verificacao_desde: null })
    expect((await sessao.from('consultorias').select('id')).data).toEqual([])
    expect((await sessao.from('times').select('id')).data).toEqual([])
    const r = await acesso(sessao, { acao: 'editar', pessoa_id: exigida.id, nome: 'Sem Código' })
    expect(r).toMatchObject({ status: 403, corpo: { codigo: 'verificacao_pendente' } })

    // Configura o app (o cadastro funciona com aal1) e a mesma sessão vira aal2: tudo volta.
    await ativarVerificacao(sessao)
    expect(await nivelDaSessao(sessao)).toBe('aal2')
    expect((await sessao.from('consultorias').select('id')).data).toEqual([{ id: A }])
    expect((await acesso(sessao, { acao: 'editar', pessoa_id: exigida.id, nome: 'Com Código' })).status).toBe(200)
  })

  it('com o app ativo (sem exigência): entrar de novo pede o código; depois dele, tudo volta', async () => {
    const primeira = await entrarComo(comApp)
    const { fatorId, segredo } = await ativarVerificacao(primeira)
    const sessao = await entrarComo(comApp)
    expect(await nivelDaSessao(sessao)).toBe('aal1')
    expect((await sessao.from('times').select('id')).data).toEqual([])
    const { data: eu } = await sessao.from('perfis').select('verificacao_desde').eq('id', comApp.id).single()
    expect(eu.verificacao_desde).not.toBeNull()
    expect((await acesso(sessao, { acao: 'editar', pessoa_id: comApp.id, nome: 'Sem Código' })).corpo.codigo)
      .toBe('verificacao_pendente')
    await confirmarCodigo(sessao, fatorId, segredo)
    expect((await sessao.from('times').select('id')).data).toHaveLength(1)
    expect((await acesso(sessao, { acao: 'editar', pessoa_id: comApp.id, nome: 'Com Código' })).status).toBe(200)
  })

  it('quem não tem o app nem a exigência não percebe nada (aal1 serve)', async () => {
    expect(await nivelDaSessao(comoAdminA)).toBe('aal1')
    expect((await comoAdminA.from('consultorias').select('id')).data).toEqual([{ id: A }])
    expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa.id, nome: 'Pessoa Livre' })).status).toBe(200)
  })

  it('o administrador vê desde quando a pessoa tem o app ativo', async () => {
    const { data } = await comoAdminA.from('perfis').select('id, verificacao_desde').in('id', [comApp.id, pessoa.id]).order('id')
    const porId = Object.fromEntries(data.map((p) => [p.id, p.verificacao_desde]))
    expect(porId[comApp.id]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(porId[pessoa.id]).toBeNull()
  })
})

describe('zerar a verificação (gerenciar-acesso, zerar_2fa)', () => {
  it('gestor, outra consultoria e a própria pessoa não zeram', async () => {
    expect((await fatores(comApp.id)).length).toBeGreaterThan(0)
    expect((await acesso(comoGestor, { acao: 'zerar_2fa', pessoa_id: comApp.id })).status).toBe(403)
    expect((await acesso(comoAdminB, { acao: 'zerar_2fa', pessoa_id: comApp.id })).status).toBe(403)
    const sessao = await entrarComo(comApp)
    // Mesmo sem o código, a própria pessoa não usa esse caminho (e aal1 nem passa).
    expect((await acesso(sessao, { acao: 'zerar_2fa', pessoa_id: comApp.id })).status).toBe(403)
    expect((await fatores(comApp.id)).length).toBeGreaterThan(0)
  })

  it('quem pode editar o acesso zera: os fatores somem e a pessoa entra sem código', async () => {
    const r = await acesso(comoAdminA, { acao: 'zerar_2fa', pessoa_id: comApp.id })
    expect(r.status).toBe(200)
    expect(await fatores(comApp.id)).toEqual([])
    const sessao = await entrarComo(comApp)
    expect(await nivelDaSessao(sessao)).toBe('aal1')
    expect((await sessao.from('times').select('id')).data).toHaveLength(1)
    expect((await acesso(sessao, { acao: 'editar', pessoa_id: comApp.id, nome: 'Depois de Zerar' })).status).toBe(200)
  })

  it('o Zerar tira a pessoa de todos os aparelhos: o token antigo não serve mais e não renova', async () => {
    const alvo = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
    const celular = await entrarComo(alvo)
    const { fatorId, segredo } = await ativarVerificacao(celular)
    const computador = await entrarComo(alvo)
    await confirmarCodigo(computador, fatorId, segredo)
    for (const sessao of [celular, computador]) {
      expect((await sessao.from('consultorias').select('id')).data).toEqual([{ id: A }])
    }

    expect((await acesso(comoAdminA, { acao: 'zerar_2fa', pessoa_id: alvo.id })).status).toBe(200)
    expect(await fatores(alvo.id)).toEqual([])
    for (const sessao of [celular, computador]) {
      // O token ainda não venceu, mas a sessão dele acabou: o banco não entrega nada e as funções recusam.
      expect((await sessao.from('consultorias').select('id')).data).toEqual([])
      expect((await sessao.from('perfis').select('id').neq('id', alvo.id)).data).toEqual([])
      const r = await acesso(sessao, { acao: 'editar', pessoa_id: alvo.id, nome: 'Depois do Zerar' })
      expect(r).toMatchObject({ status: 401, corpo: { codigo: 'nao_autenticado' } })
      const { error } = await sessao.auth.refreshSession()
      expect(error).toBeTruthy()
    }
    // Entrando de novo (só com a senha: o app foi zerado), tudo volta.
    const depois = await entrarComo(alvo)
    expect((await depois.from('consultorias').select('id')).data).toEqual([{ id: A }])
  })

  it('zerar quem tem a verificação exigida: no próximo acesso ela configura de novo', async () => {
    expect((await acesso(comoAdminA, { acao: 'zerar_2fa', pessoa_id: exigida.id })).status).toBe(200)
    expect(await fatores(exigida.id)).toEqual([])
    const sessao = await entrarComo(exigida)
    const { data: eu } = await sessao.from('perfis').select('exige_2fa, verificacao_desde').eq('id', exigida.id).single()
    expect(eu).toEqual({ exige_2fa: true, verificacao_desde: null })
    expect((await sessao.from('times').select('id')).data).toEqual([])
  })

  it('administrador com o app ativo e sessão aal1 não zera ninguém', async () => {
    const adminComApp = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
    const { fatorId, segredo } = await ativarVerificacao(await entrarComo(adminComApp))
    const sessao = await entrarComo(adminComApp)
    const r = await acesso(sessao, { acao: 'zerar_2fa', pessoa_id: exigida.id })
    expect(r).toMatchObject({ status: 403, corpo: { codigo: 'verificacao_pendente' } })
    await confirmarCodigo(sessao, fatorId, segredo)
    expect((await acesso(sessao, { acao: 'zerar_2fa', pessoa_id: exigida.id })).status).toBe(200)
  })
})

// O Auth do Supabase (GoTrue) é quem guarda o app autenticador: com a sessão só da senha (aal1), quem tem o app
// ativo não cadastra outro, não tira o app nem troca a senha. A tela conta com isso (Meu perfil pede o código).
describe('o Auth recusa mexer no app e na senha com a sessão aal1 de quem tem o app', () => {
  it('cadastrar outro app, tirar o app e trocar a senha: recusados; com o código (aal2), desativar funciona', async () => {
    const alvo = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
    const { fatorId, segredo } = await ativarVerificacao(await entrarComo(alvo))
    const sessao = await entrarComo(alvo)
    expect(await nivelDaSessao(sessao)).toBe('aal1')

    const cadastro = await sessao.auth.mfa.enroll({ factorType: 'totp', issuer: 'IXC Consult', friendlyName: 'Outro celular' })
    expect(cadastro.error?.code).toBe('insufficient_aal')
    const tirar = await sessao.auth.mfa.unenroll({ factorId: fatorId })
    expect(tirar.error?.code).toBe('insufficient_aal')
    const senha = await sessao.auth.updateUser({ password: 'Outra-Senha-123!' })
    expect(senha.error?.code).toBe('insufficient_aal')
    expect((await fatores(alvo.id)).map((f) => [f.id, f.status])).toEqual([[fatorId, 'verified']])
    await expect(entrarComo(alvo)).resolves.toBeTruthy() // a senha continua a mesma

    // Desativar (Meu perfil): o código atual leva a sessão a aal2 e então o app sai.
    await confirmarCodigo(sessao, fatorId, segredo)
    expect(await nivelDaSessao(sessao)).toBe('aal2')
    expect((await sessao.auth.mfa.unenroll({ factorId: fatorId })).error).toBeNull()
    expect(await fatores(alvo.id)).toEqual([])
  })
})

describe('criar-acesso com exige_2fa', () => {
  it('administrador cria a pessoa já com a verificação exigida', async () => {
    const email = emailDeTeste('exigida')
    const r = await criar(comoAdminA, { forma: 'senha', senha: SENHA_TESTE, nome: 'Nova Exigida', email, papel: 'pessoa', exige_2fa: true })
    expect(r.status).toBe(201)
    expect(await perfil(r.corpo.pessoa_id)).toMatchObject({ exige_2fa: true })
  })

  it('sem o campo, começa desligada', async () => {
    const email = emailDeTeste('livre')
    const r = await criar(comoAdminA, { forma: 'senha', senha: SENHA_TESTE, nome: 'Nova Livre', email, papel: 'pessoa' })
    expect(r.status).toBe(201)
    expect(await perfil(r.corpo.pessoa_id)).toMatchObject({ exige_2fa: false })
  })

  it('gestor (que não edita o acesso depois) não exige; valor inválido é recusado; nada é criado', async () => {
    const email = emailDeTeste('gestor-exige')
    const r = await criar(comoGestor, { forma: 'senha', senha: SENHA_TESTE, nome: 'Pelo Gestor', email, papel: 'pessoa', exige_2fa: true })
    expect(r.status).toBe(403)
    const invalido = await criar(comoAdminA, { forma: 'senha', senha: SENHA_TESTE, nome: 'Inválida', email, papel: 'pessoa', exige_2fa: 1 })
    expect(invalido).toMatchObject({ status: 400, corpo: { campo: 'exige_2fa' } })
    expect((await admin.from('perfis').select('id').eq('email', email)).data).toEqual([])
  })
})
