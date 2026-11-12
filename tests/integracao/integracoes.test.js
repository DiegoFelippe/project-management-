import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  entrarComo,
  limparTudo,
} from './ambiente.js'

const admin = clienteAdmin()
let A, B
let comoAdminA, comoAdminB, comoGestorA, comoDono

const integracoes = (cliente, corpo) => chamarFuncao(cliente, 'integracoes', corpo)
const linha = async (tipo, consultoria = A) =>
  (await admin.from('integracoes').select('*').eq('consultoria_id', consultoria).eq('tipo', tipo).maybeSingle()).data
const segredo = async (id) => (await admin.rpc('integracao_segredo', { p_id: id })).data

// O Mailpit do Supabase local fala SMTP dentro da rede do Docker.
const MAILPIT = { host: 'supabase_inbucket_consultoria', porta: 1025, seguranca: 'nenhuma', remetente: 'contato@a.test', nome_remetente: 'Consultoria A' }

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  comoAdminA = await entrarComo(await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A }))
  comoAdminB = await entrarComo(await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B }))
  comoGestorA = await entrarComo(await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A }))
  comoDono = await entrarComo(await criarPerfilDeTeste({ papel: 'dono' }))
})

afterAll(limparTudo)

describe('integracoes', () => {
  it('o administrador conecta o e-mail (SMTP) e a conexão fica conectada', async () => {
    const r = await integracoes(comoAdminA, { acao: 'salvar', tipo: 'smtp', config: MAILPIT })
    expect(r.status).toBe(200)
    expect(r.corpo).toMatchObject({ situacao: 'conectada' })
    expect(await linha('smtp')).toMatchObject({ situacao: 'conectada', ultimo_erro: null, config: expect.objectContaining({ host: MAILPIT.host }) })
  })

  it('chave de IA inválida não conecta, o erro fica registrado e a chave não volta na resposta', async () => {
    const r = await integracoes(comoAdminA, {
      acao: 'salvar', tipo: 'ia', config: { provedor: 'anthropic', modelo: 'claude-opus-5-5' }, segredo: 'sk-ant-chave-invalida',
    })
    expect(r.status).toBe(200)
    expect(r.corpo.situacao).toBe('com_erro')
    expect(r.corpo.ultimo_erro).toBeTruthy()
    expect(JSON.stringify(r.corpo)).not.toContain('sk-ant-chave-invalida')
    const ia = await linha('ia')
    expect(await segredo(ia.id)).toBe('sk-ant-chave-invalida')
    const { error } = await comoAdminA.from('integracoes').select('segredo_id').eq('id', ia.id)
    expect(error).not.toBeNull()
  })

  it('editar sem mandar a chave mantém a guardada; testar de novo usa a mesma', async () => {
    const ia = await linha('ia')
    const r = await integracoes(comoAdminA, { acao: 'salvar', tipo: 'ia', config: { provedor: 'anthropic', modelo: 'claude-sonnet-5-5' } })
    expect(r.status).toBe(200)
    expect(await segredo(ia.id)).toBe('sk-ant-chave-invalida')
    expect((await linha('ia')).config.modelo).toBe('claude-sonnet-5-5')
    const t = await integracoes(comoAdminA, { acao: 'testar', id: ia.id })
    expect(t.status).toBe(200)
    expect(t.corpo.situacao).toBe('com_erro')
  })

  it('a primeira conexão de IA exige a chave', async () => {
    const r = await integracoes(comoAdminB, { acao: 'salvar', tipo: 'ia', config: { provedor: 'openai', modelo: 'gpt' } })
    expect(r.status).toBe(400)
    expect(r.corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'segredo' })
  })

  it('só o administrador da própria consultoria mexe; o dono só olha', async () => {
    const smtp = await linha('smtp')
    expect((await integracoes(comoGestorA, { acao: 'salvar', tipo: 'smtp', config: MAILPIT })).status).toBe(403)
    expect((await integracoes(comoAdminB, { acao: 'testar', id: smtp.id })).status).toBe(403)
    expect((await integracoes(comoAdminB, { acao: 'desconectar', id: smtp.id })).status).toBe(403)
    expect((await integracoes(comoDono, { acao: 'salvar', tipo: 'smtp', config: MAILPIT })).status).toBe(403)
    const { data } = await comoDono.from('integracoes').select('id, tipo').eq('consultoria_id', A)
    expect(data.map((i) => i.tipo).sort()).toEqual(['ia', 'smtp'])
    const { data: doB } = await comoAdminB.from('integracoes').select('id').eq('consultoria_id', A)
    expect(doB).toEqual([])
  })

  it('dados inválidos são recusados', async () => {
    expect((await integracoes(comoAdminA, { acao: 'salvar', tipo: 'fax', config: {} })).status).toBe(400)
    expect((await integracoes(comoAdminA, { acao: 'salvar', tipo: 'smtp', config: { ...MAILPIT, host: '' } })).status).toBe(400)
    expect((await integracoes(comoAdminA, { acao: 'salvar', tipo: 'smtp', config: { ...MAILPIT, porta: 99999 } })).status).toBe(400)
    expect((await integracoes(comoAdminA, { acao: 'salvar', tipo: 'ia', config: { provedor: 'outro' }, segredo: 'x' })).status).toBe(400)
  })

  it('Google sem o app configurado na plataforma avisa', async () => {
    const r = await integracoes(comoAdminA, { acao: 'google_iniciar', volta: 'http://localhost:5173/integracoes' })
    expect(r.status).toBe(409)
    expect(r.corpo.codigo).toBe('google_nao_configurado')
  })

  it('desconectar apaga a conexão e o segredo', async () => {
    const ia = await linha('ia')
    const r = await integracoes(comoAdminA, { acao: 'desconectar', id: ia.id })
    expect(r.status).toBe(200)
    expect(await linha('ia')).toBeNull()
    expect(await segredo(ia.id)).toBeNull()
  })
})
