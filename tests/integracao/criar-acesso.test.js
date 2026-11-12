import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  REDIRECT,
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  criarTimeDeTeste,
  emailDeTeste,
  emailsPara,
  entrarComo,
  limparTudo,
  registrarEmail,
} from './ambiente.js'

const admin = clienteAdmin()
let A, B, t1, t2
let adminA, gestor, pessoa, adminB, pessoaA
let comoAdminA, comoGestor, comoPessoa, comoAdminB

async function criar(cliente, corpo) {
  const r = await chamarFuncao(cliente, 'criar-acesso', { redirectTo: REDIRECT, ...corpo })
  if (corpo.email) await registrarEmail(corpo.email.trim().toLowerCase())
  return r
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  gestor = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  const gestor2 = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoaA = pessoa
  adminB = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B })
  t1 = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestor.id })
  t2 = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestor2.id })
  comoAdminA = await entrarComo(adminA)
  comoGestor = await entrarComo(gestor)
  comoPessoa = await entrarComo(pessoa)
  comoAdminB = await entrarComo(adminB)
})

afterAll(limparTudo)

describe('criar-acesso', () => {
  it('gestor cria pessoa por convite nos times dele', async () => {
    const email = emailDeTeste('convite')
    const r = await criar(comoGestor, { forma: 'convite', nome: 'Joana Lima', email, papel: 'pessoa', times: [t1] })
    expect(r.status).toBe(201)
    const { data: p } = await admin.from('perfis').select('*').eq('id', r.corpo.pessoa_id).single()
    expect(p).toMatchObject({ papel: 'pessoa', consultoria_id: A, convite_pendente: true, precisa_trocar_senha: false })
    const { count } = await admin
      .from('time_membros')
      .select('*', { count: 'exact', head: true })
      .eq('time_id', t1)
      .eq('pessoa_id', p.id)
    expect(count).toBe(1)
    await expect.poll(() => emailsPara(email).then((m) => m.length), { timeout: 5000 }).toBe(1)
  })

  it('gestor cria pessoa com senha e ela entra e precisa trocar', async () => {
    const email = emailDeTeste('senha')
    const r = await criar(comoGestor, { forma: 'senha', nome: 'Davi Souza', email, papel: 'pessoa', times: [t1], senha: 'provisoria-1' })
    expect(r.status).toBe(201)
    const { data: p } = await admin.from('perfis').select('*').eq('id', r.corpo.pessoa_id).single()
    expect(p.precisa_trocar_senha).toBe(true)
    await expect(entrarComo({ email, senha: 'provisoria-1' })).resolves.toBeTruthy()
  })

  it('gestor não cria gestor', async () => {
    const r = await criar(comoGestor, { forma: 'convite', nome: 'Outro Gestor', email: emailDeTeste(), papel: 'gestor', times: [] })
    expect(r.status).toBe(403)
    expect(r.corpo.codigo).toBe('sem_permissao')
  })

  it('gestor não usa time de outro gestor', async () => {
    const r = await criar(comoGestor, { forma: 'convite', nome: 'Pessoa Errada', email: emailDeTeste(), papel: 'pessoa', times: [t2] })
    expect(r.status).toBe(403)
  })

  it('admin cria gestor', async () => {
    const r = await criar(comoAdminA, { forma: 'convite', nome: 'Gestora Nova', email: emailDeTeste(), papel: 'gestor', times: [] })
    expect(r.status).toBe(201)
    const { data: p } = await admin.from('perfis').select('papel').eq('id', r.corpo.pessoa_id).single()
    expect(p.papel).toBe('gestor')
  })

  it('admin não cria admin', async () => {
    const r = await criar(comoAdminA, { forma: 'convite', nome: 'Admin Novo', email: emailDeTeste(), papel: 'admin', times: [] })
    expect(r.status).toBe(403)
  })

  it('pessoa não cria ninguém', async () => {
    const r = await criar(comoPessoa, { forma: 'convite', nome: 'Alguém', email: emailDeTeste(), papel: 'pessoa', times: [] })
    expect(r.status).toBe(403)
  })

  it('sem login', async () => {
    const r = await criar(null, { forma: 'convite', nome: 'Alguém', email: emailDeTeste(), papel: 'pessoa', times: [] })
    expect(r.status).toBe(401)
    expect(r.corpo.codigo).toBe('nao_autenticado')
  })

  it('e-mail com maiúsculas e espaços bate com o que já existe', async () => {
    const base = emailDeTeste('ana')
    const primeiro = await criar(comoGestor, { forma: 'convite', nome: 'Ana Reis', email: base, papel: 'pessoa', times: [] })
    expect(primeiro.status).toBe(201)
    const r = await criar(comoGestor, { forma: 'convite', nome: 'Ana Reis', email: `  ${base.toUpperCase()}  `, papel: 'pessoa', times: [t1] })
    expect(r.status).toBe(409)
    expect(r.corpo.codigo).toBe('ja_na_consultoria')
    expect(r.corpo.pessoa.id).toBe(primeiro.corpo.pessoa_id)
  })

  it('e-mail de outra consultoria não diz onde está', async () => {
    const r = await criar(comoAdminB, { forma: 'convite', nome: 'Pessoa de A', email: pessoaA.email, papel: 'pessoa', times: [] })
    expect(r.status).toBe(409)
    expect(Object.keys(r.corpo).sort()).toEqual(['codigo'])
    expect(r.corpo.codigo).toBe('email_indisponivel')
  })

  it('senha curta', async () => {
    const r = await criar(comoGestor, { forma: 'senha', nome: 'Senha Curta', email: emailDeTeste(), papel: 'pessoa', times: [], senha: '1234567' })
    expect(r.status).toBe(400)
    expect(r.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'senha' })
  })

  it('dois pedidos iguais ao mesmo tempo criam um acesso só', async () => {
    const email = emailDeTeste('duplo')
    const corpo = { forma: 'convite', nome: 'Clique Duplo', email, papel: 'pessoa', times: [t1] }
    const respostas = await Promise.all([criar(comoGestor, corpo), criar(comoGestor, corpo)])
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 409])
    const { count } = await admin.from('perfis').select('*', { count: 'exact', head: true }).eq('email', email)
    expect(count).toBe(1)
  })
})
