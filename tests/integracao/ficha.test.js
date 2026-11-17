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
} from './ambiente.js'

const admin = clienteAdmin()
let A, adminA, gestor, pessoa, pessoa2
let comoAdminA, comoGestor, comoPessoa

const perfil = async (id) => (await admin.from('perfis').select('*').eq('id', id).single()).data
const acesso = (cliente, corpo) => chamarFuncao(cliente, 'gerenciar-acesso', corpo)
async function criar(cliente, corpo) {
  const r = await chamarFuncao(cliente, 'criar-acesso', { redirectTo: REDIRECT, ...corpo })
  if (corpo.email) await registrarEmail(corpo.email.trim().toLowerCase())
  return r
}
const amanha = () => {
  const d = new Date(Date.now() + 2 * 86400000)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  adminA = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A })
  gestor = await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A })
  pessoa = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  pessoa2 = await criarPerfilDeTeste({ papel: 'pessoa', consultoriaId: A })
  const t1 = await criarTimeDeTeste({ consultoriaId: A, gestorId: gestor.id })
  await admin.from('time_membros').insert({ time_id: t1, pessoa_id: pessoa.id })
  comoAdminA = await entrarComo(adminA)
  comoGestor = await entrarComo(gestor)
  comoPessoa = await entrarComo(pessoa)
})

afterAll(limparTudo)

describe('ficha do consultor', () => {
  it('criar acesso grava os campos novos (uf em maiúsculas, vazio vira nulo)', async () => {
    const r = await criar(comoAdminA, {
      forma: 'senha', senha: 'Senha-1234!x', nome: 'Ana Ficha', email: emailDeTeste('ficha'), papel: 'pessoa',
      telefone: ' (11) 98888-7777 ', cidade: 'Campinas', uf: 'sp', cargo: 'Analista', data_entrada: '2024-05-10',
    })
    expect(r.status).toBe(201)
    expect(await perfil(r.corpo.pessoa_id)).toMatchObject({
      telefone: '(11) 98888-7777', cidade: 'Campinas', uf: 'SP', cargo: 'Analista', data_entrada: '2024-05-10',
    })
    const v = await criar(comoAdminA, {
      forma: 'senha', senha: 'Senha-1234!x', nome: 'Vazio Ficha', email: emailDeTeste('vazio'), papel: 'pessoa',
      telefone: '', cidade: '  ', uf: '', cargo: '', data_entrada: '',
    })
    expect(v.status).toBe(201)
    expect(await perfil(v.corpo.pessoa_id)).toMatchObject({ telefone: null, cidade: null, uf: null, cargo: null, data_entrada: null })
  })

  it('criar acesso recusa uf inválida e data no futuro', async () => {
    const base = { forma: 'senha', senha: 'Senha-1234!x', nome: 'Erro Ficha', papel: 'pessoa' }
    const a = await criar(comoAdminA, { ...base, email: emailDeTeste('uf'), uf: 'XX' })
    expect(a.status).toBe(400)
    expect(a.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'uf' })
    const b = await criar(comoAdminA, { ...base, email: emailDeTeste('data'), data_entrada: amanha() })
    expect(b.status).toBe(400)
    expect(b.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'data_entrada' })
  })

  it('admin edita os campos novos', async () => {
    const r = await acesso(comoAdminA, {
      acao: 'editar', pessoa_id: pessoa2.id, telefone: '123', cidade: 'Recife', uf: 'pe', cargo: 'Sênior', data_entrada: '2023-01-02',
    })
    expect(r.status).toBe(200)
    expect(await perfil(pessoa2.id)).toMatchObject({ telefone: '123', cidade: 'Recife', uf: 'PE', cargo: 'Sênior', data_entrada: '2023-01-02' })
    await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, cargo: '' })
    expect((await perfil(pessoa2.id)).cargo).toBeNull()
  })

  it('gestor edita os campos de quem vê, não de quem não vê', async () => {
    expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa.id, cargo: 'Pelo Gestor', cidade: 'Natal', uf: 'RN' })).status).toBe(200)
    expect(await perfil(pessoa.id)).toMatchObject({ cargo: 'Pelo Gestor', cidade: 'Natal', uf: 'RN' })
    expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa2.id, cargo: 'Não' })).status).toBe(403)
  })

  it('pessoa não edita outra; em si mesma só o nome', async () => {
    expect((await acesso(comoPessoa, { acao: 'editar', pessoa_id: pessoa2.id, cargo: 'Não' })).status).toBe(403)
    expect((await acesso(comoPessoa, { acao: 'editar', pessoa_id: pessoa.id, cargo: 'Chefe' })).status).toBe(403)
    expect((await acesso(comoPessoa, { acao: 'editar', pessoa_id: pessoa.id, uf: 'XX' })).status).toBe(403)
    expect((await acesso(comoPessoa, { acao: 'editar', pessoa_id: pessoa.id, nome: 'Meu Nome Novo' })).status).toBe(200)
  })

  it('editar recusa uf inválida e data no futuro', async () => {
    const a = await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, uf: 'XX' })
    expect(a.status).toBe(400)
    expect(a.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'uf' })
    const b = await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, data_entrada: amanha() })
    expect(b.status).toBe(400)
    expect(b.corpo).toMatchObject({ campo: 'data_entrada' })
  })

  it('atualizar_meu_contato muda só o próprio contato', async () => {
    const { error } = await comoPessoa.rpc('atualizar_meu_contato', { p_telefone: '999', p_cidade: 'Natal', p_uf: 'rn' })
    expect(error).toBeNull()
    expect(await perfil(pessoa.id)).toMatchObject({ telefone: '999', cidade: 'Natal', uf: 'RN' })
  })

  describe('tipos de consultoria', () => {
    it('criar acesso grava os tipos (sem repetir) e sem tipos fica vazio', async () => {
      const r = await criar(comoAdminA, {
        forma: 'senha', senha: 'Senha-1234!x', nome: 'Com Tipos', email: emailDeTeste('tipos'), papel: 'pessoa',
        tipos_de_consultoria: ['gestao', 'assessoria_juridica'],
      })
      expect(r.status).toBe(201)
      expect((await perfil(r.corpo.pessoa_id)).tipos_de_consultoria).toEqual(['gestao', 'assessoria_juridica'])
      const v = await criar(comoAdminA, { forma: 'senha', senha: 'Senha-1234!x', nome: 'Sem Tipos', email: emailDeTeste('semtipos'), papel: 'pessoa' })
      expect(v.status).toBe(201)
      expect((await perfil(v.corpo.pessoa_id)).tipos_de_consultoria).toEqual([])
    })

    it('criar recusa tipo fora da lista, repetido ou que não é lista', async () => {
      const base = { forma: 'senha', senha: 'Senha-1234!x', nome: 'Erro Tipos', papel: 'pessoa' }
      for (const [n, tipos] of [['a', ['financeiro']], ['b', ['gestao', 'gestao']], ['c', 'gestao']]) {
        const r = await criar(comoAdminA, { ...base, email: emailDeTeste(`tipo${n}`), tipos_de_consultoria: tipos })
        expect(r.status).toBe(400)
        expect(r.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'tipos_de_consultoria' })
      }
    })

    it('admin edita e desmarca; gestor edita de quem vê; a pessoa não muda os próprios', async () => {
      expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, tipos_de_consultoria: ['sucesso_do_cliente', 'gestao_de_pessoas'] })).status).toBe(200)
      expect((await perfil(pessoa2.id)).tipos_de_consultoria).toEqual(['sucesso_do_cliente', 'gestao_de_pessoas'])
      expect((await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, tipos_de_consultoria: [] })).status).toBe(200)
      expect((await perfil(pessoa2.id)).tipos_de_consultoria).toEqual([])
      expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa.id, tipos_de_consultoria: ['gestao'] })).status).toBe(200)
      expect((await perfil(pessoa.id)).tipos_de_consultoria).toEqual(['gestao'])
      expect((await acesso(comoGestor, { acao: 'editar', pessoa_id: pessoa2.id, tipos_de_consultoria: ['gestao'] })).status).toBe(403)
      expect((await acesso(comoPessoa, { acao: 'editar', pessoa_id: pessoa.id, tipos_de_consultoria: ['gestao_de_pessoas'] })).status).toBe(403)
      expect((await perfil(pessoa.id)).tipos_de_consultoria).toEqual(['gestao'])
    })

    it('editar recusa valor inválido', async () => {
      const r = await acesso(comoAdminA, { acao: 'editar', pessoa_id: pessoa2.id, tipos_de_consultoria: ['outro'] })
      expect(r.status).toBe(400)
      expect(r.corpo).toMatchObject({ campo: 'tipos_de_consultoria' })
    })
  })
})
