// Slack, WhatsApp e a pergunta curta à IA: a configuração e os testes de conexão das Integrações que falam só por
// HTTP. Sem imports do Deno: recebe o `fetch` (os testes passam o Slack, a Meta e a IA falsos de conexoes-falsas.ts).
// Os testes lançam Error com a mensagem para a tela, em português; o token nunca entra numa mensagem.
// Por enquanto é só a conexão: para onde vão as mensagens do sistema fica para depois.
import { type Buscar, comLimite } from './google-oauth.ts'
import { Falha } from './http.ts'

// Versão da Graph API da Meta (WhatsApp Cloud API). Cada versão vale cerca de dois anos: suba esta quando a Meta
// avisar que ela vai vencer (https://developers.facebook.com/docs/graph-api/changelog/versions).
export const VERSAO_DA_GRAPH = 'v26.0'
export const MENSAGEM_DE_TESTE = 'Teste da IXC Consult: conexão funcionando.'
const MODELO_DO_WHATSAPP = { name: 'hello_world', language: { code: 'en_US' } }
const LIMITE_MS = 10_000

export type ConfigSlack = { canal?: string; workspace?: string; bot?: string }
export type ConfigWhatsapp = { phone_number_id: string; waba_id: string; numero?: string; nome_verificado?: string }
export type ConfigIa = { provedor: 'anthropic' | 'openai'; modelo: string }
export type ResultadoDoTeste = { mensagem: string; dados?: Record<string, string> }

function invalido(campo: string): never {
  throw new Falha(400, 'dados_invalidos', { campo })
}

const objeto = (bruto: unknown) =>
  (bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>

// ---------- Configuração (o que chega do navegador; o segredo vem à parte) ----------

// Canal do teste (opcional): o ID (C… ou G…, em maiúsculas) ou o nome, gravado como "#nome" em minúsculas.
export function validarConfigSlack(bruto: unknown): ConfigSlack {
  const { canal } = objeto(bruto)
  if (canal == null || canal === '') return {}
  if (typeof canal !== 'string') invalido('canal')
  const limpo = canal.trim()
  if (/^[CG][A-Z0-9]{8,12}$/.test(limpo)) return { canal: limpo }
  const nome = limpo.replace(/^#/, '').toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(nome)) invalido('canal')
  return { canal: `#${nome}` }
}

const ID_DA_META = /^\d{5,25}$/

export function validarConfigWhatsapp(bruto: unknown): ConfigWhatsapp {
  const config = objeto(bruto)
  const id = (campo: string) => {
    const valor = typeof config[campo] === 'string' ? (config[campo] as string).trim() : ''
    if (!ID_DA_META.test(valor)) invalido(campo)
    return valor
  }
  return { phone_number_id: id('phone_number_id'), waba_id: id('waba_id') }
}

// Formato do segredo por tipo: o Slack só com token de bot; o token da Meta não tem espaço.
export function validarSegredo(tipo: string, segredo: string) {
  if (tipo === 'slack' && !/^xoxb-[A-Za-z0-9-]+$/.test(segredo)) invalido('segredo')
  if (tipo === 'whatsapp' && /\s/.test(segredo)) invalido('segredo')
}

// Número que recebe o modelo de teste do WhatsApp: formato internacional (+ e código do país). Só vale para o teste e
// não é guardado. null quando não veio.
export function validarNumeroDeTeste(bruto: unknown): string | null {
  if (bruto == null || bruto === '') return null
  if (typeof bruto !== 'string') invalido('numero_teste')
  const numero = bruto.replace(/[\s().-]/g, '')
  if (!/^\+[1-9]\d{7,14}$/.test(numero)) invalido('numero_teste')
  return numero
}

// O segredo guardado só vale para o mesmo destino. Com o segredo em branco e outro destino (SMTP: host, porta,
// segurança ou usuário, e usuário vazio também conta; IA: provedor; WhatsApp: ID do número), a senha, a chave ou o token
// da consultoria iria para um lugar que alguém só digitou. Então: no mesmo destino, `usar` o guardado; SMTP sem usuário
// (servidor sem login) num destino novo, `descartar` (quem grava apaga a senha guardada, para não sobrar senha "de
// antes" para outro servidor); nos outros casos, o `aviso` para a pessoa digitar de novo. No Slack o token é o próprio
// destino (sempre slack.com).
export type DecisaoDoGuardado = { usar: true } | { descartar: true } | { aviso: string }

function mesmoDestino(tipo: string, nova: Record<string, any>, antes: Record<string, any>): boolean {
  if (tipo === 'smtp') {
    return nova.host === antes.host && Number(nova.porta) === Number(antes.porta) && nova.seguranca === antes.seguranca &&
      (nova.usuario ?? '') === (antes.usuario ?? '')
  }
  if (tipo === 'ia') return nova.provedor === antes.provedor
  if (tipo === 'whatsapp') return nova.phone_number_id === antes.phone_number_id
  return true
}

const DIGITE_DE_NOVO: Record<string, string> = {
  smtp: 'Digite a senha de novo: o servidor, a porta, a segurança ou o usuário mudou.',
  ia: 'Digite a chave de API de novo: o provedor mudou.',
  whatsapp: 'Digite o token de acesso de novo: o ID do número mudou.',
}

export function decidirSegredoGuardado(tipo: string, nova: Record<string, any>, guardada: Record<string, any> | null):
DecisaoDoGuardado {
  if (mesmoDestino(tipo, nova, guardada ?? {})) return { usar: true }
  if (tipo === 'smtp' && !nova.usuario) return { descartar: true }
  return { aviso: DIGITE_DE_NOVO[tipo] }
}

// ---------- Pedidos ----------

// Um pedido com tempo máximo; a queda da rede (ou o tempo estourado) vira a mensagem `semResposta`.
async function pedir(buscar: Buscar, url: string, init: RequestInit, semResposta: string) {
  const controle = new AbortController()
  try {
    return await comLimite((async () => {
      const resposta = await buscar(url, { ...init, signal: controle.signal })
      return { resposta, dados: await resposta.json().catch(() => null) }
    })(), () => controle.abort(), LIMITE_MS)
  } catch {
    throw new Error(semResposta)
  }
}

// ---------- Slack ----------

const SLACK_RECUSOU = ['invalid_auth', 'not_authed', 'account_inactive', 'token_revoked', 'token_expired', 'not_allowed_token_type']

async function chamarSlack(buscar: Buscar, metodo: string, token: string, corpo?: Record<string, unknown>) {
  const { resposta, dados } = await pedir(buscar, `https://slack.com/api/${metodo}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(corpo ?? {}),
  }, 'Não foi possível falar com o Slack.')
  if (resposta.status === 429) throw new Error('O Slack pediu para esperar um pouco. Tente de novo.')
  if (!resposta.ok || !dados) throw new Error(`O Slack respondeu com erro ${resposta.status}.`)
  if (dados.ok) return dados
  const erro = typeof dados.error === 'string' ? dados.error : ''
  if (SLACK_RECUSOU.includes(erro)) throw new Error('O Slack recusou o token.')
  if (erro === 'missing_scope') throw new Error(`Falta ao app do Slack o escopo ${dados.needed ?? 'chat:write'}.`)
  if (erro === 'ratelimited') throw new Error('O Slack pediu para esperar um pouco. Tente de novo.')
  return dados
}

// Confere o token (auth.test) e devolve o workspace e o nome do bot. Com `enviar` e um canal na configuração, manda a
// mensagem de teste no canal (chat.postMessage).
export async function testarSlack(config: ConfigSlack, token: string | null, { enviar = false } = {}, buscar: Buscar = fetch):
Promise<ResultadoDoTeste> {
  if (!token) throw new Error('Falta o token do bot.')
  const quem = await chamarSlack(buscar, 'auth.test', token)
  if (!quem.ok) throw new Error('O Slack recusou o token.')
  const dados = { workspace: String(quem.team ?? ''), bot: String(quem.user ?? '') }
  let mensagem = `Conectado ao workspace ${dados.workspace} como ${dados.bot}.`
  if (enviar && config.canal) {
    const envio = await chamarSlack(buscar, 'chat.postMessage', token, { channel: config.canal, text: MENSAGEM_DE_TESTE })
    if (!envio.ok) {
      if (envio.error === 'channel_not_found') {
        throw new Error(`O Slack não achou o canal ${config.canal}. Confira o nome (ou use o ID do canal) e, se for privado, convide o bot.`)
      }
      if (envio.error === 'not_in_channel') {
        throw new Error(`O bot não está no canal ${config.canal}. Convide o bot no canal (/invite) ou dê ao app o escopo chat:write.public.`)
      }
      if (envio.error === 'is_archived') throw new Error(`O canal ${config.canal} está arquivado.`)
      throw new Error(`O Slack não aceitou a mensagem (${String(envio.error).slice(0, 60)}).`)
    }
    mensagem += ` Mensagem de teste enviada em ${config.canal}.`
  }
  return { mensagem, dados }
}

// ---------- WhatsApp (Cloud API da Meta) ----------

async function chamarGraph(buscar: Buscar, caminho: string, token: string, corpo?: Record<string, unknown>) {
  const { resposta, dados } = await pedir(buscar, `https://graph.facebook.com/${VERSAO_DA_GRAPH}/${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  }, 'Não foi possível falar com o WhatsApp.')
  const codigo = Number(dados?.error?.code)
  return { ok: resposta.ok && !dados?.error, status: resposta.status, codigo, dados }
}

// Confere o token e o ID do número (lê o número e o nome verificado). Com o número do teste, manda para ele o modelo
// hello_world, que toda conta do WhatsApp Business já tem.
export async function testarWhatsapp(config: ConfigWhatsapp, token: string | null, { numeroDeTeste = null as string | null } = {},
  buscar: Buscar = fetch): Promise<ResultadoDoTeste> {
  if (!token) throw new Error('Falta o token de acesso.')
  const numero = await chamarGraph(buscar, `${config.phone_number_id}?fields=display_phone_number,verified_name`, token)
  if (!numero.ok) {
    if (numero.codigo === 190) throw new Error('O WhatsApp recusou o token.')
    if (numero.status >= 400 && numero.status < 429) throw new Error('O WhatsApp recusou o token ou o ID do número.')
    throw new Error(`O WhatsApp respondeu com erro ${numero.status}.`)
  }
  const dados = { numero: String(numero.dados?.display_phone_number ?? ''), nome_verificado: String(numero.dados?.verified_name ?? '') }
  let mensagem = `Conectado ao número ${dados.numero}${dados.nome_verificado ? ` (${dados.nome_verificado})` : ''}.`
  if (numeroDeTeste) {
    const envio = await chamarGraph(buscar, `${config.phone_number_id}/messages`, token, {
      messaging_product: 'whatsapp', to: numeroDeTeste.replace(/^\+/, ''), type: 'template', template: MODELO_DO_WHATSAPP,
    })
    if (!envio.ok) {
      if (envio.codigo === 131030) {
        throw new Error(`O número ${numeroDeTeste} não está liberado no app da Meta. Enquanto o app estiver em desenvolvimento, ` +
          'cadastre o número na lista de destinatários do WhatsApp.')
      }
      if (envio.codigo === 132001) throw new Error('O modelo hello_world não existe nessa conta do WhatsApp Business.')
      if (envio.codigo === 190) throw new Error('O WhatsApp recusou o token.')
      throw new Error(`O WhatsApp não mandou a mensagem de teste (erro ${envio.codigo || envio.status}).`)
    }
    mensagem += ` Modelo hello_world enviado para ${numeroDeTeste}.`
  }
  return { mensagem, dados }
}

// ---------- IA: uma pergunta curta ao modelo escolhido (confere a chave e o nome do modelo) ----------

const PERGUNTA = 'Responda só com a palavra: ok'

export async function perguntarAIa(config: ConfigIa, chave: string | null, buscar: Buscar = fetch): Promise<ResultadoDoTeste> {
  if (!chave) throw new Error('Falta a chave de API.')
  const anthropic = config.provedor === 'anthropic'
  const nome = anthropic ? 'Anthropic' : 'OpenAI'
  const { resposta } = anthropic
    ? await pedir(buscar, 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.modelo, max_tokens: 16, messages: [{ role: 'user', content: PERGUNTA }] }),
    }, 'Não foi possível falar com a Anthropic.')
    : await pedir(buscar, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.modelo, max_completion_tokens: 16, messages: [{ role: 'user', content: PERGUNTA }] }),
    }, 'Não foi possível falar com a OpenAI.')
  if (resposta.status === 401) throw new Error(`A ${nome} recusou a chave de API.`)
  if (resposta.status === 403) throw new Error('A chave não tem permissão para usar a API.')
  if (resposta.status === 404) throw new Error(`A ${nome} não achou o modelo ${config.modelo}.`)
  if (!resposta.ok) throw new Error(`A ${nome} respondeu com erro ${resposta.status}.`)
  return { mensagem: `A ${nome} respondeu usando o modelo ${config.modelo}.` }
}
