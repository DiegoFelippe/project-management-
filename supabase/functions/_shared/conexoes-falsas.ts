// Slack, WhatsApp (Graph API da Meta) e IA em memória, para os testes das conexões (o Vitest importa este arquivo no
// Node; nada de Deno aqui). Respondem no formato das APIs de verdade, guardam cada pedido recebido (`pedidos`) e podem
// ser mandados falhar (`falhar`): um status HTTP qualquer ou a queda da rede. Nenhum pedido sai para a internet.

export type PedidoFalso = {
  metodo: string
  host: string
  caminho: string
  busca: Record<string, string>
  corpo: any
  cabecalhos: Record<string, string>
  token: string | null
}

export type Falha = { status?: number; rede?: boolean } | null

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
}

function lerPedido(url: string, init: RequestInit = {}): PedidoFalso {
  const endereco = new URL(url)
  const cabecalhos = Object.fromEntries(new Headers(init.headers).entries())
  let corpo: any = null
  if (typeof init.body === 'string') {
    try {
      corpo = JSON.parse(init.body)
    } catch {
      corpo = init.body
    }
  }
  return {
    metodo: (init.method ?? 'GET').toUpperCase(),
    host: endereco.host,
    caminho: endereco.pathname,
    busca: Object.fromEntries(endereco.searchParams.entries()),
    corpo,
    cabecalhos,
    token: cabecalhos.authorization?.replace(/^Bearer\s+/i, '') ?? null,
  }
}

// ---------- Slack (Web API: auth.test e chat.postMessage) ----------

export type OpcoesDoSlack = {
  token?: string
  workspace?: string
  bot?: string
  // canais públicos existentes (pelo nome, sem #, ou pelo ID)
  canais?: string[]
  // canais que existem, mas em que o bot não está (e o app não tem chat:write.public)
  canaisSemOBot?: string[]
  escopos?: string[]
}

export function criarSlackFalso({
  token = 'xoxb-1-bom',
  workspace = 'Acme',
  bot = 'ixc-consult',
  canais = ['geral', 'C0123ABCD'],
  canaisSemOBot = [],
  escopos = ['chat:write'],
}: OpcoesDoSlack = {}) {
  const pedidos: PedidoFalso[] = []
  const mensagens: { canal: string; texto: string }[] = []
  let falha: Falha = null

  async function buscar(url: string, init?: RequestInit): Promise<Response> {
    const pedido = lerPedido(url, init)
    pedidos.push(pedido)
    if (falha?.rede) throw new TypeError('fetch failed')
    if (falha?.status) return json(falha.status, { ok: false, error: 'ratelimited' })
    if (pedido.host !== 'slack.com') return json(404, { ok: false, error: 'not_found' })
    if (!pedido.token) return json(200, { ok: false, error: 'not_authed' })
    if (pedido.token !== token) return json(200, { ok: false, error: 'invalid_auth' })
    if (pedido.caminho === '/api/auth.test') {
      return json(200, {
        ok: true, url: 'https://acme.slack.com/', team: workspace, user: bot, team_id: 'T0001', user_id: 'U0001', bot_id: 'B0001',
      })
    }
    if (pedido.caminho === '/api/chat.postMessage') {
      if (!escopos.includes('chat:write')) {
        return json(200, { ok: false, error: 'missing_scope', needed: 'chat:write', provided: escopos.join(',') })
      }
      const canal = String(pedido.corpo?.channel ?? '').replace(/^#/, '')
      if (canaisSemOBot.includes(canal)) return json(200, { ok: false, error: 'not_in_channel' })
      if (!canais.includes(canal)) return json(200, { ok: false, error: 'channel_not_found' })
      mensagens.push({ canal: pedido.corpo.channel, texto: pedido.corpo.text })
      return json(200, { ok: true, channel: 'C0123ABCD', ts: '1700000000.000100', message: { text: pedido.corpo.text } })
    }
    return json(200, { ok: false, error: 'unknown_method' })
  }

  return {
    fetch: buscar,
    pedidos,
    mensagens,
    falhar: (nova: Falha) => {
      falha = nova
    },
  }
}

// ---------- WhatsApp (Cloud API da Meta, pela Graph API) ----------

export type NumeroFalso = { display_phone_number: string; verified_name: string }
export type OpcoesDoWhatsapp = {
  token?: string
  // phone_number_id → dados do número
  numeros?: Record<string, NumeroFalso>
  // números (E.164, sem o +) liberados para receber mensagens enquanto o app está em desenvolvimento
  liberados?: string[]
  modelos?: string[]
}

function erroDaGraph(status: number, code: number, message: string, extra: Record<string, unknown> = {}) {
  return json(status, { error: { message, type: code === 190 ? 'OAuthException' : 'GraphMethodException', code, fbtrace_id: 'Afalso', ...extra } })
}

export function criarWhatsappFalso({
  token = 'EAAG-token-bom',
  numeros = { '1234567890123': { display_phone_number: '+55 11 4000-0000', verified_name: 'Acme Ltda' } },
  liberados = ['5511999998888'],
  modelos = ['hello_world'],
}: OpcoesDoWhatsapp = {}) {
  const pedidos: PedidoFalso[] = []
  const enviadas: { de: string; para: string; modelo: string; idioma: string }[] = []
  let falha: Falha = null

  async function buscar(url: string, init?: RequestInit): Promise<Response> {
    const pedido = lerPedido(url, init)
    pedidos.push(pedido)
    if (falha?.rede) throw new TypeError('fetch failed')
    if (falha?.status) return erroDaGraph(falha.status, 4, 'Application request limit reached')
    if (pedido.host !== 'graph.facebook.com') return json(404, {})
    if (pedido.token !== token) return erroDaGraph(401, 190, 'Invalid OAuth access token - Cannot parse access token')
    const [, versao, id, aresta] = pedido.caminho.split('/')
    if (!/^v\d+\.\d+$/.test(versao ?? '')) return erroDaGraph(400, 2635, 'Unknown version')
    const numero = numeros[id ?? '']
    if (!numero) {
      return erroDaGraph(400, 100, `Unsupported get request. Object with ID '${id}' does not exist`, { error_subcode: 33 })
    }
    if (pedido.metodo === 'GET' && !aresta) {
      const campos = (pedido.busca.fields ?? 'id').split(',')
      return json(200, { id, ...Object.fromEntries(campos.filter((c) => c in numero).map((c) => [c, numero[c as keyof NumeroFalso]])) })
    }
    if (pedido.metodo === 'POST' && aresta === 'messages') {
      const corpo = pedido.corpo ?? {}
      if (corpo.messaging_product !== 'whatsapp' || corpo.type !== 'template') return erroDaGraph(400, 100, 'Invalid parameter')
      const para = String(corpo.to ?? '').replace(/^\+/, '')
      if (!modelos.includes(corpo.template?.name)) {
        return erroDaGraph(404, 132001, 'Template name does not exist in the translation')
      }
      if (!liberados.includes(para)) return erroDaGraph(400, 131030, 'Recipient phone number not in allowed list')
      enviadas.push({ de: id!, para, modelo: corpo.template.name, idioma: corpo.template.language?.code })
      return json(200, { messaging_product: 'whatsapp', contacts: [{ input: corpo.to, wa_id: para }], messages: [{ id: 'wamid.falso' }] })
    }
    return erroDaGraph(400, 100, 'Unsupported request')
  }

  return {
    fetch: buscar,
    pedidos,
    enviadas,
    falhar: (nova: Falha) => {
      falha = nova
    },
  }
}

// ---------- IA (Anthropic Messages e OpenAI Chat Completions) ----------

export function criarIaFalsa({ chave = 'sk-boa', modelos = ['claude-opus-5-5', 'gpt-5'] }: { chave?: string; modelos?: string[] } = {}) {
  const pedidos: PedidoFalso[] = []
  let falha: Falha = null

  async function buscar(url: string, init?: RequestInit): Promise<Response> {
    const pedido = lerPedido(url, init)
    pedidos.push(pedido)
    if (falha?.rede) throw new TypeError('fetch failed')
    if (falha?.status) return json(falha.status, { error: { type: 'rate_limit_error', message: 'limite' } })
    const anthropic = pedido.host === 'api.anthropic.com'
    const chaveRecebida = anthropic ? pedido.cabecalhos['x-api-key'] : pedido.token
    if (chaveRecebida !== chave) {
      return json(401, anthropic
        ? { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }
        : { error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } })
    }
    if (!modelos.includes(pedido.corpo?.model)) {
      return json(404, anthropic
        ? { type: 'error', error: { type: 'not_found_error', message: `model: ${pedido.corpo?.model}` } }
        : { error: { message: 'The model does not exist', type: 'invalid_request_error', code: 'model_not_found' } })
    }
    if (anthropic) return json(200, { id: 'msg_falsa', type: 'message', content: [{ type: 'text', text: 'ok' }] })
    return json(200, { id: 'chatcmpl-falsa', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }] })
  }

  return {
    fetch: buscar,
    pedidos,
    falhar: (nova: Falha) => {
      falha = nova
    },
  }
}
