import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  chamarFuncao,
  clienteAdmin,
  criarConsultoriaDeTeste,
  criarPerfilDeTeste,
  emailsPara,
  entrarComo,
  limparTudo,
  MAILPIT_SMTP,
} from './ambiente.js'

const admin = clienteAdmin()
let A, B, C
let comoAdminA, comoAdminB, comoGestorA, comoDono, comoAdminC, adminC

const integracoes = (cliente, corpo) => chamarFuncao(cliente, 'integracoes', corpo)
const linha = async (tipo, consultoria = A) =>
  (await admin.from('integracoes').select('*').eq('consultoria_id', consultoria).eq('tipo', tipo).maybeSingle()).data
const segredo = async (id) => (await admin.rpc('integracao_segredo', { p_id: id })).data

// O Mailpit do Supabase local fala SMTP dentro da rede do Docker.
const MAILPIT = { host: MAILPIT_SMTP, porta: 1025, seguranca: 'nenhuma', remetente: 'contato@a.test', nome_remetente: 'Consultoria A' }

beforeAll(async () => {
  A = await criarConsultoriaDeTeste()
  B = await criarConsultoriaDeTeste()
  comoAdminA = await entrarComo(await criarPerfilDeTeste({ papel: 'admin', consultoriaId: A }))
  comoAdminB = await entrarComo(await criarPerfilDeTeste({ papel: 'admin', consultoriaId: B }))
  comoGestorA = await entrarComo(await criarPerfilDeTeste({ papel: 'gestor', consultoriaId: A }))
  comoDono = await entrarComo(await criarPerfilDeTeste({ papel: 'dono' }))
  C = await criarConsultoriaDeTeste()
  adminC = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: C })
  comoAdminC = await entrarComo(adminC)
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

// "Testar" dentro da janela: testa o que foi digitado sem gravar nada. Slack e WhatsApp só nos caminhos que não saem
// para a internet (o resto, com o Slack e a Meta falsos, em supabase/functions/_shared/conexoes.test.js).
describe('integracoes: testar o rascunho (antes de salvar)', () => {
  const rascunho = (cliente, corpo) => integracoes(cliente, { acao: 'testar_rascunho', ...corpo })

  it('e-mail: manda a mensagem de teste para quem testa e não grava nada', async () => {
    const r = await rascunho(comoAdminC, { tipo: 'smtp', config: MAILPIT })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ funcionou: true, mensagem: `E-mail de teste enviado para ${adminC.email}.` })
    expect(await linha('smtp', C)).toBeNull()
    const [email] = await emailsPara(adminC.email)
    expect(email.Subject).toBe('Teste da IXC Consult')
    expect(email.From).toMatchObject({ Address: MAILPIT.remetente, Name: MAILPIT.nome_remetente })
  })

  it('servidor errado: devolve o erro, sem gravar, e a integração salva não muda', async () => {
    const antes = await linha('smtp')
    const r = await rascunho(comoAdminA, { tipo: 'smtp', config: { ...MAILPIT, porta: 1026 } })
    expect(r.status).toBe(200)
    expect(r.corpo).toEqual({ funcionou: false, erro: 'Não foi possível conectar ao servidor de e-mail.' })
    expect(await linha('smtp')).toEqual(antes)
  })

  it('IA, Slack e WhatsApp sem segredo (e sem um guardado) avisam o que falta, sem gravar', async () => {
    expect((await rascunho(comoAdminC, { tipo: 'ia', config: { provedor: 'anthropic', modelo: 'claude-opus-5-5' } })).corpo)
      .toEqual({ funcionou: false, erro: 'Falta a chave de API.' })
    expect((await rascunho(comoAdminC, { tipo: 'slack', config: { canal: '#geral' } })).corpo)
      .toEqual({ funcionou: false, erro: 'Falta o token do bot.' })
    expect((await rascunho(comoAdminC, { tipo: 'whatsapp', config: { phone_number_id: '1234567890123', waba_id: '9876543210' } })).corpo)
      .toEqual({ funcionou: false, erro: 'Falta o token de acesso.' })
    const { data } = await admin.from('integracoes').select('id').eq('consultoria_id', C)
    expect(data).toEqual([])
  })

  it('dados inválidos são recusados antes de testar', async () => {
    const recusa = async (corpo, campo) => {
      const r = await rascunho(comoAdminC, corpo)
      expect(r.status).toBe(400)
      expect(r.corpo).toMatchObject({ codigo: 'dados_invalidos', campo })
    }
    await recusa({ tipo: 'google', config: {} }, 'tipo')
    await recusa({ tipo: 'slack', config: { canal: '#com espaço' }, segredo: 'xoxb-1-a' }, 'canal')
    await recusa({ tipo: 'slack', config: {}, segredo: 'xoxp-token-de-usuario' }, 'segredo')
    await recusa({ tipo: 'whatsapp', config: { phone_number_id: '123/messages', waba_id: '9876543210' }, segredo: 'EAAG' }, 'phone_number_id')
    await recusa({ tipo: 'whatsapp', config: { phone_number_id: '1234567890123', waba_id: '9876543210' }, segredo: 'EAAG',
      numero_teste: '11999998888' }, 'numero_teste')
  })

  it('segredo em branco só vale para o mesmo destino: outro servidor ou provedor é recusado, o mesmo continua', async () => {
    const D = await criarConsultoriaDeTeste()
    const adminD = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: D })
    const comoAdminD = await entrarComo(adminD)
    const smtp = { ...MAILPIT, usuario: 'contato@d.test' }
    const ia = { provedor: 'anthropic', modelo: 'claude-opus-5-5' }
    const gravar = (tipo, config, segredo) => admin.rpc('integracao_salvar', {
      p_consultoria: D, p_tipo: tipo, p_config: config, p_segredo: segredo, p_quem: adminD.id,
    })
    await gravar('smtp', smtp, 'senha-guardada-d')
    await gravar('ia', ia, 'sk-ant-guardada-d')
    const antes = await admin.from('integracoes').select('*').eq('consultoria_id', D).order('tipo')

    const outroServidor = await rascunho(comoAdminD, { tipo: 'smtp', config: { ...smtp, host: 'smtp.outro.test' } })
    expect(outroServidor.status).toBe(400)
    expect(outroServidor.corpo).toEqual({ codigo: 'dados_invalidos', campo: 'segredo',
      mensagem: 'Digite a senha de novo: o servidor, a porta, a segurança ou o usuário mudou.' })
    expect((await rascunho(comoAdminD, { tipo: 'smtp', config: { ...smtp, porta: 2525 } })).status).toBe(400)
    const outroProvedor = await rascunho(comoAdminD, { tipo: 'ia', config: { provedor: 'openai', modelo: 'gpt-5' } })
    expect(outroProvedor.status).toBe(400)
    expect(outroProvedor.corpo.mensagem).toBe('Digite a chave de API de novo: o provedor mudou.')
    // Salvar tem a mesma regra (salvar também testa com o segredo guardado).
    const salvarOutro = await integracoes(comoAdminD, { acao: 'salvar', tipo: 'smtp', config: { ...smtp, host: 'smtp.outro.test' } })
    expect(salvarOutro.status).toBe(400)
    expect(salvarOutro.corpo.campo).toBe('segredo')
    const salvarOutroProvedor = await integracoes(comoAdminD, { acao: 'salvar', tipo: 'ia', config: { provedor: 'openai', modelo: 'gpt-5' } })
    expect(salvarOutroProvedor.status).toBe(400)
    expect(salvarOutroProvedor.corpo.mensagem).toBe('Digite a chave de API de novo: o provedor mudou.')
    // Sem usuário não há login: o Testar segue sem a senha guardada (o Mailpit aceita sem login).
    const semLogin = await rascunho(comoAdminD, { tipo: 'smtp', config: { ...smtp, usuario: '' } })
    expect(semLogin.corpo).toEqual({ funcionou: true, mensagem: `E-mail de teste enviado para ${adminD.email}.` })

    // Mesmo destino: usa o guardado e testa (o Mailpit não oferece login, então para aí; a IA chega à Anthropic).
    const mesmoServidor = await rascunho(comoAdminD, { tipo: 'smtp', config: { ...smtp, nome_remetente: 'Outro nome' } })
    expect(mesmoServidor.status).toBe(200)
    expect(mesmoServidor.corpo).toEqual({ funcionou: false, erro: 'O servidor não pede login; deixe o usuário em branco.' })
    const mesmoProvedor = await rascunho(comoAdminD, { tipo: 'ia', config: { ...ia, modelo: 'claude-sonnet-5-5' } })
    expect(mesmoProvedor.status).toBe(200)
    expect(mesmoProvedor.corpo.funcionou).toBe(false)
    expect(mesmoProvedor.corpo.erro).toMatch(/Anthropic/)
    expect(JSON.stringify(mesmoProvedor.corpo)).not.toContain('sk-ant-guardada-d')
    // Com o segredo digitado, outro destino pode.
    const digitado = await rascunho(comoAdminD, { tipo: 'smtp', config: { ...smtp, porta: 2525 }, segredo: 'outra-senha' })
    expect(digitado.status).toBe(200)

    expect((await admin.from('integracoes').select('*').eq('consultoria_id', D).order('tipo')).data).toEqual(antes.data)
  })

  it('o desvio em dois passos não leva a senha guardada para outro servidor', async () => {
    const E = await criarConsultoriaDeTeste()
    const adminE = await criarPerfilDeTeste({ papel: 'admin', consultoriaId: E })
    const comoAdminE = await entrarComo(adminE)
    const smtp = { ...MAILPIT, usuario: 'contato@e.test' }
    await admin.rpc('integracao_salvar', { p_consultoria: E, p_tipo: 'smtp', p_config: smtp, p_segredo: 'senha-antiga-e', p_quem: adminE.id })
    const { id } = await linha('smtp', E)
    expect(await segredo(id)).toBe('senha-antiga-e')

    // Passo 1: salvar outro servidor sem usuário, com a senha em branco. É aceito, e a senha antiga sai do Vault.
    const novo = { ...MAILPIT, porta: 2525, usuario: '' }
    const passo1 = await integracoes(comoAdminE, { acao: 'salvar', tipo: 'smtp', config: novo })
    expect(passo1.status).toBe(200)
    expect(await segredo(id)).toBeNull()
    expect((await linha('smtp', E)).config).toMatchObject({ porta: 2525 })

    // Passo 2: o mesmo servidor, agora com usuário e a senha em branco. Não há mais senha guardada para mandar.
    const comLogin = { ...novo, usuario: 'contato@e.test' }
    const testar = await rascunho(comoAdminE, { tipo: 'smtp', config: comLogin })
    expect(testar.status).toBe(200)
    expect(JSON.stringify(testar.corpo)).not.toContain('senha-antiga-e')
    const salvar = await integracoes(comoAdminE, { acao: 'salvar', tipo: 'smtp', config: comLogin })
    expect(salvar.status).toBe(200)
    expect(await segredo(id)).toBeNull()
  })

  it('só o administrador da consultoria testa', async () => {
    expect((await rascunho(comoGestorA, { tipo: 'smtp', config: MAILPIT })).status).toBe(403)
    expect((await rascunho(comoDono, { tipo: 'smtp', config: MAILPIT })).status).toBe(403)
  })
})

describe('integracoes: Slack e WhatsApp (só a conexão)', () => {
  it('a primeira conexão exige o token; dados inválidos não gravam', async () => {
    const salvar = (corpo) => integracoes(comoAdminC, { acao: 'salvar', ...corpo })
    expect((await salvar({ tipo: 'slack', config: { canal: '#geral' } })).corpo).toMatchObject({ codigo: 'dados_invalidos', campo: 'segredo' })
    expect((await salvar({ tipo: 'whatsapp', config: { phone_number_id: '1234567890123', waba_id: '9876543210' } })).corpo)
      .toMatchObject({ codigo: 'dados_invalidos', campo: 'segredo' })
    expect((await salvar({ tipo: 'slack', config: {}, segredo: 'xoxp-token-de-usuario' })).corpo).toMatchObject({ campo: 'segredo' })
    expect((await salvar({ tipo: 'whatsapp', config: { phone_number_id: 'abc', waba_id: '9876543210' }, segredo: 'EAAG' })).corpo)
      .toMatchObject({ campo: 'phone_number_id' })
    const { data } = await admin.from('integracoes').select('id').eq('consultoria_id', C)
    expect(data).toEqual([])
  })

  it('Testar na linha sem token guardado registra o erro de cada uma (sem sair para a internet)', async () => {
    const gravar = async (tipo, config) => (await admin.rpc('integracao_salvar', {
      p_consultoria: C, p_tipo: tipo, p_config: config, p_segredo: null, p_quem: adminC.id,
    })).data
    const slack = await gravar('slack', { canal: '#geral' })
    const whatsapp = await gravar('whatsapp', { phone_number_id: '1234567890123', waba_id: '9876543210' })
    const rs = await integracoes(comoAdminC, { acao: 'testar', id: slack })
    expect(rs.corpo).toMatchObject({ situacao: 'com_erro', ultimo_erro: 'Falta o token do bot.' })
    const rw = await integracoes(comoAdminC, { acao: 'testar', id: whatsapp })
    expect(rw.corpo).toMatchObject({ situacao: 'com_erro', ultimo_erro: 'Falta o token de acesso.' })
    expect(await linha('whatsapp', C)).toMatchObject({
      situacao: 'com_erro', config: { phone_number_id: '1234567890123', waba_id: '9876543210' },
    })
    expect((await integracoes(comoAdminC, { acao: 'desconectar', id: slack })).status).toBe(200)
    expect(await linha('slack', C)).toBeNull()
  })
})
