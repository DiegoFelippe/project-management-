// Conexões do Slack, do WhatsApp e a pergunta curta à IA (o "Testar" das Integrações), contra o Slack, a Meta e a IA
// falsos de conexoes-falsas.ts. Nenhum pedido sai para a internet. Roda no `npm test` (projeto unidade).
import { describe, expect, it } from 'vitest'
import { criarIaFalsa, criarSlackFalso, criarWhatsappFalso } from './conexoes-falsas.ts'
import {
  avisoParaDigitarDeNovo,
  MENSAGEM_DE_TESTE,
  perguntarAIa,
  testarSlack,
  testarWhatsapp,
  validarConfigSlack,
  validarConfigWhatsapp,
  validarNumeroDeTeste,
  validarSegredo,
  VERSAO_DA_GRAPH,
} from './conexoes.ts'

// A recusa de dado inválido: Falha 400 'dados_invalidos' com o campo (a Edge Function devolve como está).
const recusa = (campo) => expect.objectContaining({ status: 400, codigo: 'dados_invalidos', extra: { campo } })

describe('Slack: configuração', () => {
  it('o canal é opcional; sem ele a configuração fica vazia', () => {
    expect(validarConfigSlack({})).toEqual({})
    expect(validarConfigSlack({ canal: '' })).toEqual({})
    expect(validarConfigSlack(null)).toEqual({})
  })

  it('aceita o canal pelo nome (com ou sem #, em minúsculas) ou pelo ID', () => {
    expect(validarConfigSlack({ canal: '#geral' })).toEqual({ canal: '#geral' })
    expect(validarConfigSlack({ canal: ' Avisos-do_time ' })).toEqual({ canal: '#avisos-do_time' })
    expect(validarConfigSlack({ canal: 'C0123ABCD' })).toEqual({ canal: 'C0123ABCD' })
  })

  it('recusa canal com espaço ou caractere estranho', () => {
    expect(() => validarConfigSlack({ canal: '#com espaço' })).toThrow(recusa('canal'))
    expect(() => validarConfigSlack({ canal: '#a/b' })).toThrow(recusa('canal'))
    expect(() => validarConfigSlack({ canal: 42 })).toThrow(recusa('canal'))
  })

  it('o que vem do teste (workspace e bot) não entra pelo navegador', () => {
    expect(validarConfigSlack({ canal: '#geral', workspace: 'Outro', bot: 'falso' })).toEqual({ canal: '#geral' })
  })
})

describe('WhatsApp: configuração', () => {
  it('ID do número e ID da conta são números', () => {
    expect(validarConfigWhatsapp({ phone_number_id: ' 1234567890123 ', waba_id: '9876543210' }))
      .toEqual({ phone_number_id: '1234567890123', waba_id: '9876543210' })
  })

  it('recusa ID faltando, com letras ou com barra (não vira outro endereço da Graph)', () => {
    expect(() => validarConfigWhatsapp({ waba_id: '9876543210' })).toThrow(recusa('phone_number_id'))
    expect(() => validarConfigWhatsapp({ phone_number_id: '123/messages', waba_id: '9876543210' })).toThrow(recusa('phone_number_id'))
    expect(() => validarConfigWhatsapp({ phone_number_id: '1234567890123', waba_id: 'abc' })).toThrow(recusa('waba_id'))
  })

  it('o que vem do teste (número e nome verificado) não entra pelo navegador', () => {
    expect(validarConfigWhatsapp({ phone_number_id: '1234567890123', waba_id: '9876543210', numero: '+1', nome_verificado: 'X' }))
      .toEqual({ phone_number_id: '1234567890123', waba_id: '9876543210' })
  })
})

describe('segredos e número do teste', () => {
  it('o Slack só aceita o token de bot (xoxb-)', () => {
    expect(() => validarSegredo('slack', 'xoxb-1-abc')).not.toThrow()
    expect(() => validarSegredo('slack', 'xoxp-1-abc')).toThrow(recusa('segredo'))
    expect(() => validarSegredo('slack', 'xoxb-com espaço')).toThrow(recusa('segredo'))
  })

  it('o token do WhatsApp não tem espaço; os outros tipos aceitam qualquer texto', () => {
    expect(() => validarSegredo('whatsapp', 'EAAG-token')).not.toThrow()
    expect(() => validarSegredo('whatsapp', 'EAAG token')).toThrow(recusa('segredo'))
    expect(() => validarSegredo('smtp', 'senha com espaço')).not.toThrow()
  })

  it('número do teste no formato internacional (+ e código do país), sem espaços e traços', () => {
    expect(validarNumeroDeTeste('+55 (11) 99999-8888')).toBe('+5511999998888')
    expect(validarNumeroDeTeste('')).toBeNull()
    expect(validarNumeroDeTeste(undefined)).toBeNull()
    expect(() => validarNumeroDeTeste('11999998888')).toThrow(recusa('numero_teste'))
    expect(() => validarNumeroDeTeste('+0123456789')).toThrow(recusa('numero_teste'))
    expect(() => validarNumeroDeTeste('+55119999988887777')).toThrow(recusa('numero_teste'))
  })
})

describe('Slack: testar', () => {
  it('token certo: auth.test com o token de bot e devolve o workspace e o bot, sem mandar mensagem', async () => {
    const slack = criarSlackFalso()
    const r = await testarSlack({ canal: '#geral' }, 'xoxb-1-bom', {}, slack.fetch)
    expect(r.dados).toEqual({ workspace: 'Acme', bot: 'ixc-consult' })
    expect(r.mensagem).toBe('Conectado ao workspace Acme como ixc-consult.')
    expect(slack.pedidos.map((p) => p.caminho)).toEqual(['/api/auth.test'])
    expect(slack.pedidos[0]).toMatchObject({ metodo: 'POST', host: 'slack.com', token: 'xoxb-1-bom' })
    expect(slack.mensagens).toEqual([])
  })

  it('token recusado avisa em português e não tenta mandar a mensagem', async () => {
    const slack = criarSlackFalso()
    const erro = await testarSlack({ canal: '#geral' }, 'xoxb-1-errado', { enviar: true }, slack.fetch).catch((e) => e)
    expect(erro.message).toBe('O Slack recusou o token.')
    expect(erro.message).not.toContain('xoxb')
    expect(slack.pedidos).toHaveLength(1)
  })

  it('com enviar e canal, manda a mensagem de teste no canal', async () => {
    const slack = criarSlackFalso()
    const r = await testarSlack({ canal: '#geral' }, 'xoxb-1-bom', { enviar: true }, slack.fetch)
    expect(slack.mensagens).toEqual([{ canal: '#geral', texto: MENSAGEM_DE_TESTE }])
    expect(MENSAGEM_DE_TESTE).toBe('Teste da IXC Consult: conexão funcionando.')
    expect(r.mensagem).toBe('Conectado ao workspace Acme como ixc-consult. Mensagem de teste enviada em #geral.')
    expect(slack.pedidos[1].cabecalhos['content-type']).toMatch(/application\/json/)
  })

  it('com enviar e sem canal, só confere o token', async () => {
    const slack = criarSlackFalso()
    await testarSlack({}, 'xoxb-1-bom', { enviar: true }, slack.fetch)
    expect(slack.pedidos).toHaveLength(1)
  })

  it('canal inexistente: diz qual canal e o que fazer', async () => {
    const slack = criarSlackFalso()
    await expect(testarSlack({ canal: '#nao-existe' }, 'xoxb-1-bom', { enviar: true }, slack.fetch))
      .rejects.toThrow('O Slack não achou o canal #nao-existe. Confira o nome (ou use o ID do canal) e, se for privado, convide o bot.')
  })

  it('bot fora do canal e escopo faltando têm o próprio aviso', async () => {
    const fora = criarSlackFalso({ canais: ['geral', 'diretoria'], canaisSemOBot: ['diretoria'] })
    await expect(testarSlack({ canal: '#diretoria' }, 'xoxb-1-bom', { enviar: true }, fora.fetch))
      .rejects.toThrow('O bot não está no canal #diretoria. Convide o bot no canal (/invite) ou dê ao app o escopo chat:write.public.')
    const semEscopo = criarSlackFalso({ escopos: [] })
    await expect(testarSlack({ canal: '#geral' }, 'xoxb-1-bom', { enviar: true }, semEscopo.fetch))
      .rejects.toThrow('Falta ao app do Slack o escopo chat:write.')
  })

  it('limite de pedidos, queda de rede e falta do token', async () => {
    const slack = criarSlackFalso()
    slack.falhar({ status: 429 })
    await expect(testarSlack({}, 'xoxb-1-bom', {}, slack.fetch)).rejects.toThrow('O Slack pediu para esperar um pouco. Tente de novo.')
    slack.falhar({ rede: true })
    await expect(testarSlack({}, 'xoxb-1-bom', {}, slack.fetch)).rejects.toThrow('Não foi possível falar com o Slack.')
    const pedidos = slack.pedidos.length
    await expect(testarSlack({}, null, {}, slack.fetch)).rejects.toThrow('Falta o token do bot.')
    expect(slack.pedidos).toHaveLength(pedidos)
  })
})

describe('WhatsApp: testar', () => {
  const CONFIG = { phone_number_id: '1234567890123', waba_id: '9876543210' }

  it('token e ID certos: lê o número e o nome verificado na versão fixa da Graph, sem mandar nada', async () => {
    const meta = criarWhatsappFalso()
    const r = await testarWhatsapp(CONFIG, 'EAAG-token-bom', {}, meta.fetch)
    expect(r.dados).toEqual({ numero: '+55 11 4000-0000', nome_verificado: 'Acme Ltda' })
    expect(r.mensagem).toBe('Conectado ao número +55 11 4000-0000 (Acme Ltda).')
    expect(meta.pedidos).toHaveLength(1)
    expect(meta.pedidos[0]).toMatchObject({
      metodo: 'GET', host: 'graph.facebook.com', caminho: `/${VERSAO_DA_GRAPH}/1234567890123`, token: 'EAAG-token-bom',
      busca: { fields: 'display_phone_number,verified_name' },
    })
    expect(meta.enviadas).toEqual([])
  })

  it('token recusado e ID errado avisam em português', async () => {
    const meta = criarWhatsappFalso()
    await expect(testarWhatsapp(CONFIG, 'EAAG-vencido', {}, meta.fetch)).rejects.toThrow('O WhatsApp recusou o token.')
    await expect(testarWhatsapp({ ...CONFIG, phone_number_id: '111' }, 'EAAG-token-bom', {}, meta.fetch))
      .rejects.toThrow('O WhatsApp recusou o token ou o ID do número.')
  })

  it('com o número do teste, manda o modelo hello_world (en_US) para ele', async () => {
    const meta = criarWhatsappFalso()
    const r = await testarWhatsapp(CONFIG, 'EAAG-token-bom', { numeroDeTeste: '+5511999998888' }, meta.fetch)
    expect(meta.enviadas).toEqual([{ de: '1234567890123', para: '5511999998888', modelo: 'hello_world', idioma: 'en_US' }])
    expect(meta.pedidos[1]).toMatchObject({ metodo: 'POST', caminho: `/${VERSAO_DA_GRAPH}/1234567890123/messages` })
    expect(meta.pedidos[1].corpo).toEqual({
      messaging_product: 'whatsapp', to: '5511999998888', type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    })
    expect(r.mensagem).toBe('Conectado ao número +55 11 4000-0000 (Acme Ltda). Modelo hello_world enviado para +5511999998888.')
  })

  it('número fora da lista liberada do app em desenvolvimento e modelo inexistente', async () => {
    const meta = criarWhatsappFalso()
    await expect(testarWhatsapp(CONFIG, 'EAAG-token-bom', { numeroDeTeste: '+5521988887777' }, meta.fetch))
      .rejects.toThrow('O número +5521988887777 não está liberado no app da Meta. Enquanto o app estiver em desenvolvimento, cadastre o número na lista de destinatários do WhatsApp.')
    const semModelo = criarWhatsappFalso({ modelos: [] })
    await expect(testarWhatsapp(CONFIG, 'EAAG-token-bom', { numeroDeTeste: '+5511999998888' }, semModelo.fetch))
      .rejects.toThrow('O modelo hello_world não existe nessa conta do WhatsApp Business.')
  })

  it('limite de pedidos, queda de rede e falta do token', async () => {
    const meta = criarWhatsappFalso()
    meta.falhar({ status: 429 })
    await expect(testarWhatsapp(CONFIG, 'EAAG-token-bom', {}, meta.fetch)).rejects.toThrow('O WhatsApp respondeu com erro 429.')
    meta.falhar({ rede: true })
    await expect(testarWhatsapp(CONFIG, 'EAAG-token-bom', {}, meta.fetch)).rejects.toThrow('Não foi possível falar com o WhatsApp.')
    const pedidos = meta.pedidos.length
    await expect(testarWhatsapp(CONFIG, '', {}, meta.fetch)).rejects.toThrow('Falta o token de acesso.')
    expect(meta.pedidos).toHaveLength(pedidos)
  })
})

describe('IA: pergunta curta ao modelo', () => {
  it('Anthropic: pergunta ao modelo escolhido com a chave e diz quem respondeu', async () => {
    const ia = criarIaFalsa()
    const r = await perguntarAIa({ provedor: 'anthropic', modelo: 'claude-opus-5-5' }, 'sk-boa', ia.fetch)
    expect(r.mensagem).toBe('A Anthropic respondeu usando o modelo claude-opus-5-5.')
    expect(ia.pedidos[0]).toMatchObject({ metodo: 'POST', host: 'api.anthropic.com', caminho: '/v1/messages' })
    expect(ia.pedidos[0].cabecalhos['x-api-key']).toBe('sk-boa')
    expect(ia.pedidos[0].corpo).toMatchObject({ model: 'claude-opus-5-5', messages: [{ role: 'user' }] })
    expect(ia.pedidos[0].corpo.max_tokens).toBeLessThanOrEqual(20)
  })

  it('OpenAI: o mesmo pela Chat Completions', async () => {
    const ia = criarIaFalsa()
    const r = await perguntarAIa({ provedor: 'openai', modelo: 'gpt-5' }, 'sk-boa', ia.fetch)
    expect(r.mensagem).toBe('A OpenAI respondeu usando o modelo gpt-5.')
    expect(ia.pedidos[0]).toMatchObject({ host: 'api.openai.com', caminho: '/v1/chat/completions', token: 'sk-boa' })
    expect(ia.pedidos[0].corpo).toMatchObject({ model: 'gpt-5' })
  })

  it('chave recusada e modelo que não existe', async () => {
    const ia = criarIaFalsa()
    await expect(perguntarAIa({ provedor: 'anthropic', modelo: 'claude-opus-5-5' }, 'sk-ruim', ia.fetch))
      .rejects.toThrow('A Anthropic recusou a chave de API.')
    await expect(perguntarAIa({ provedor: 'openai', modelo: 'gpt-5' }, 'sk-ruim', ia.fetch)).rejects.toThrow('A OpenAI recusou a chave de API.')
    await expect(perguntarAIa({ provedor: 'anthropic', modelo: 'claude-que-nao-existe' }, 'sk-boa', ia.fetch))
      .rejects.toThrow('A Anthropic não achou o modelo claude-que-nao-existe.')
    await expect(perguntarAIa({ provedor: 'openai', modelo: 'gpt-0' }, 'sk-boa', ia.fetch)).rejects.toThrow('A OpenAI não achou o modelo gpt-0.')
  })

  it('outro erro, queda de rede e falta da chave', async () => {
    const ia = criarIaFalsa()
    ia.falhar({ status: 529 })
    await expect(perguntarAIa({ provedor: 'anthropic', modelo: 'claude-opus-5-5' }, 'sk-boa', ia.fetch))
      .rejects.toThrow('A Anthropic respondeu com erro 529.')
    ia.falhar({ rede: true })
    await expect(perguntarAIa({ provedor: 'openai', modelo: 'gpt-5' }, 'sk-boa', ia.fetch)).rejects.toThrow('Não foi possível falar com a OpenAI.')
    await expect(perguntarAIa({ provedor: 'anthropic', modelo: 'claude-opus-5-5' }, null, ia.fetch)).rejects.toThrow('Falta a chave de API.')
  })
})

describe('segredo guardado: só vale para o mesmo destino', () => {
  const SMTP = { host: 'smtp.acme.test', porta: 587, seguranca: 'starttls', usuario: 'contato@acme.test', remetente: 'contato@acme.test' }

  it('SMTP: outro servidor, porta, segurança ou usuário pede a senha de novo', () => {
    const aviso = 'Digite a senha de novo: o servidor, a porta, a segurança ou o usuário mudou.'
    expect(avisoParaDigitarDeNovo('smtp', { ...SMTP, host: 'smtp.outro.test' }, SMTP)).toBe(aviso)
    expect(avisoParaDigitarDeNovo('smtp', { ...SMTP, porta: 465 }, SMTP)).toBe(aviso)
    expect(avisoParaDigitarDeNovo('smtp', { ...SMTP, seguranca: 'nenhuma' }, SMTP)).toBe(aviso)
    expect(avisoParaDigitarDeNovo('smtp', { ...SMTP, usuario: 'outro@acme.test' }, SMTP)).toBe(aviso)
  })

  it('SMTP: o mesmo destino (mudando só o remetente) usa a guardada; sem usuário a senha nem é enviada', () => {
    expect(avisoParaDigitarDeNovo('smtp', { ...SMTP, remetente: 'avisos@acme.test', nome_remetente: 'Acme' }, SMTP)).toBeNull()
    expect(avisoParaDigitarDeNovo('smtp', { ...SMTP, host: 'smtp.outro.test', usuario: undefined }, SMTP)).toBeNull()
  })

  it('IA: outro provedor pede a chave de novo; outro modelo no mesmo provedor, não', () => {
    const ia = { provedor: 'anthropic', modelo: 'claude-opus-5-5' }
    expect(avisoParaDigitarDeNovo('ia', { provedor: 'openai', modelo: 'gpt-5' }, ia)).toBe('Digite a chave de API de novo: o provedor mudou.')
    expect(avisoParaDigitarDeNovo('ia', { provedor: 'anthropic', modelo: 'claude-sonnet-5-5' }, ia)).toBeNull()
  })

  it('WhatsApp: outro ID do número pede o token de novo; Slack: o token é o próprio destino', () => {
    const w = { phone_number_id: '1234567890123', waba_id: '9876543210' }
    expect(avisoParaDigitarDeNovo('whatsapp', { ...w, phone_number_id: '1112223334445' }, w))
      .toBe('Digite o token de acesso de novo: o ID do número mudou.')
    expect(avisoParaDigitarDeNovo('whatsapp', { ...w, waba_id: '5556667778' }, w)).toBeNull()
    expect(avisoParaDigitarDeNovo('slack', { canal: '#outro' }, { canal: '#geral' })).toBeNull()
  })
})
