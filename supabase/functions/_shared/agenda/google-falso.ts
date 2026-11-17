// Google em memória para os testes (o Vitest importa este arquivo no Node; nada de Deno aqui). Responde como
// oauth2.googleapis.com, openidconnect.googleapis.com, Calendar v3 e Meet REST v2, no formato das APIs de verdade,
// guarda cada pedido recebido (`pedidos`) e pode ser mandado falhar (`falhar`): 400 invalid_grant, 401, 403, 5xx
// ou queda de rede. Cada conta (e-mail) tem a própria agenda e os próprios espaços do Meet.

// O Google devolve alguns escopos pelo nome longo.
const NOME_LONGO: Record<string, string> = {
  email: 'https://www.googleapis.com/auth/userinfo.email',
  profile: 'https://www.googleapis.com/auth/userinfo.profile',
}
const CALENDARIO = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar']
const MEET_LER = [
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/meetings.space.settings',
  'https://www.googleapis.com/auth/meetings.space.created',
]
const MEET_CONFIGURAR = [
  'https://www.googleapis.com/auth/meetings.space.settings',
  'https://www.googleapis.com/auth/meetings.space.created',
]

export type PedidoAoGoogle = {
  metodo: string
  url: string
  host: string
  caminho: string
  busca: Record<string, string>
  corpo: any
  token: string | null
}

export type RegraDeFalha = {
  url: string | RegExp
  metodo?: string
  status?: number
  erro?: string
  rede?: boolean
  vezes?: number
}

export type ParticipanteFalso = { id: string; nome: string; tipo?: 'signedinUser' | 'anonymousUser' | 'phoneUser' }
export type FalaFalsa = { participante: string; inicio: string; texto: string }
export type ConferenciaFalsa = {
  inicio: string
  fim?: string | null
  participantes?: ParticipanteFalso[]
  gravacoes?: { estado: 'STARTED' | 'ENDED' | 'FILE_GENERATED'; inicio?: string; link?: string }[]
  transcricoes?: { estado: 'STARTED' | 'ENDED' | 'FILE_GENERATED'; inicio?: string; falas?: FalaFalsa[] }[]
}

type Concessao = { email: string; escopos: string[]; revogada: boolean }
type Codigo = { concessao: Concessao; redirect: string; desafio: string | null; semRefresh: boolean; usado: boolean }
type Espaco = { name: string; meetingCode: string; meetingUri: string; config: any; conferencias: any[] }
type Conta = { email: string; sub: string; eventos: Map<string, any>; espacos: Map<string, Espaco> }

const letras = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String.fromCharCode(97 + (b % 26))).join('')
const base32hex = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => '0123456789abcdefghijklmnopqrstuv'[b % 32]).join('')
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

function json(status: number, corpo: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const STATUS_DA_API: Record<number, string> = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  410: 'NOT_FOUND',
  429: 'RESOURCE_EXHAUSTED',
  500: 'INTERNAL',
  503: 'UNAVAILABLE',
}

function erroDaApi(status: number, mensagem: string, motivo?: string): Response {
  return json(status, {
    error: {
      code: status,
      message: mensagem,
      status: STATUS_DA_API[status] ?? 'UNKNOWN',
      ...(motivo ? { errors: [{ reason: motivo, message: mensagem }] } : {}),
    },
  })
}

function pagina<T>(lista: T[], busca: Record<string, string>, chave: string, tamanhoPadrao = 10) {
  const tamanho = Math.min(Number(busca.pageSize) || tamanhoPadrao, 100)
  const inicio = Number(busca.pageToken) || 0
  const itens = lista.slice(inicio, inicio + tamanho)
  const proxima = inicio + tamanho < lista.length ? String(inicio + tamanho) : undefined
  return { [chave]: itens, ...(proxima ? { nextPageToken: proxima } : {}) }
}

export function criarGoogleFalso({ cliente = { id: 'cliente-falso', segredo: 'segredo-falso' } } = {}) {
  let deslocamento = 0
  const agora = () => Date.now() + deslocamento
  const pedidos: PedidoAoGoogle[] = []
  const regras: (RegraDeFalha & { restantes: number })[] = []
  const contas = new Map<string, Conta>()
  const codigos = new Map<string, Codigo>()
  const renovacoes = new Map<string, Concessao>()
  const acessos = new Map<string, { concessao: Concessao; expira: number }>()

  function conta(email: string): Conta {
    const chave = email.toLowerCase()
    let achada = contas.get(chave)
    if (!achada) {
      achada = { email: chave, sub: base32hex(21), eventos: new Map(), espacos: new Map() }
      contas.set(chave, achada)
    }
    return achada
  }

  function espacoPeloCodigo(c: Conta, codigo: string): Espaco | undefined {
    return [...c.espacos.values()].find((e) => e.meetingCode === codigo)
  }

  function novoEspaco(c: Conta): Espaco {
    const meetingCode = `${letras(3)}-${letras(4)}-${letras(3)}`
    const espaco: Espaco = {
      name: `spaces/${base32hex(12)}`,
      meetingCode,
      meetingUri: `https://meet.google.com/${meetingCode}`,
      config: { accessType: 'TRUSTED', entryPointAccess: 'ALL' },
      conferencias: [],
    }
    c.espacos.set(espaco.name, espaco)
    return espaco
  }

  function emitirAcesso(concessao: Concessao) {
    const token = `ya29.falso-${base32hex(24)}`
    acessos.set(token, { concessao, expira: agora() + 3599_000 })
    return token
  }

  function escoposDevolvidos(concessao: Concessao) {
    return concessao.escopos.map((e) => NOME_LONGO[e] ?? e).join(' ')
  }

  // ── OAuth ──
  async function oauthToken(corpo: Record<string, string>): Promise<Response> {
    const recusa = (erro: string, descricao: string) => json(400, { error: erro, error_description: descricao })
    if (corpo.client_id !== cliente.id || corpo.client_secret !== cliente.segredo) {
      return json(401, { error: 'invalid_client', error_description: 'Unauthorized' })
    }
    if (corpo.grant_type === 'authorization_code') {
      const emitido = codigos.get(corpo.code ?? '')
      if (!emitido || emitido.usado) return recusa('invalid_grant', 'Malformed auth code.')
      emitido.usado = true
      if (corpo.redirect_uri !== emitido.redirect) return recusa('redirect_uri_mismatch', 'Bad Request')
      if (emitido.desafio) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(corpo.code_verifier ?? ''))
        if (base64url(new Uint8Array(hash)) !== emitido.desafio) return recusa('invalid_grant', 'Invalid code verifier.')
      }
      const renovacao = emitido.semRefresh ? undefined : `1//falso-${base32hex(32)}`
      if (renovacao) renovacoes.set(renovacao, emitido.concessao)
      return json(200, {
        access_token: emitirAcesso(emitido.concessao),
        expires_in: 3599,
        ...(renovacao ? { refresh_token: renovacao } : {}),
        scope: escoposDevolvidos(emitido.concessao),
        token_type: 'Bearer',
        id_token: 'falso',
      })
    }
    if (corpo.grant_type === 'refresh_token') {
      const concessao = renovacoes.get(corpo.refresh_token ?? '')
      if (!concessao || concessao.revogada) return recusa('invalid_grant', 'Token has been expired or revoked.')
      return json(200, {
        access_token: emitirAcesso(concessao),
        expires_in: 3599,
        scope: escoposDevolvidos(concessao),
        token_type: 'Bearer',
      })
    }
    return recusa('unsupported_grant_type', 'Invalid grant_type')
  }

  function revogar(token: string): Response {
    const concessao = renovacoes.get(token) ?? acessos.get(token)?.concessao
    if (!concessao || concessao.revogada) return json(400, { error: 'invalid_token', error_description: 'Token expired or revoked' })
    concessao.revogada = true
    return json(200, {})
  }

  // ── Agenda ──
  function meetDoEvento(c: Conta, evento: any, pedido: any) {
    const espaco = novoEspaco(c)
    evento.hangoutLink = espaco.meetingUri
    evento.conferenceData = {
      createRequest: { ...pedido, status: { statusCode: 'success' } },
      entryPoints: [{ entryPointType: 'video', uri: espaco.meetingUri, label: espaco.meetingUri.replace('https://', '') }],
      conferenceSolution: { key: { type: 'hangoutsMeet' }, name: 'Google Meet' },
      conferenceId: espaco.meetingCode,
    }
  }

  function calendario(c: Conta, metodo: string, partes: string[], busca: Record<string, string>, corpo: any): Response {
    // partes: ['calendars', 'primary', 'events', id?]
    if (partes[0] !== 'calendars' || partes[1] !== 'primary' || partes[2] !== 'events') return erroDaApi(404, 'Not Found', 'notFound')
    const id = partes[3]
    if (!id && metodo === 'POST') {
      const evento: any = {
        kind: 'calendar#event',
        id: base32hex(26),
        status: 'confirmed',
        htmlLink: `https://www.google.com/calendar/event?eid=${base32hex(20)}`,
        summary: corpo.summary,
        description: corpo.description,
        start: corpo.start,
        end: corpo.end,
        organizer: { email: c.email, self: true },
        attendees: (corpo.attendees ?? []).map((a: any) => ({ ...a, responseStatus: 'needsAction' })),
      }
      const pedidoMeet = corpo.conferenceData?.createRequest
      if (pedidoMeet && busca.conferenceDataVersion === '1' && pedidoMeet.conferenceSolutionKey?.type === 'hangoutsMeet') {
        meetDoEvento(c, evento, pedidoMeet)
      }
      c.eventos.set(evento.id, evento)
      return json(200, evento)
    }
    const evento = id ? c.eventos.get(id) : undefined
    if (!evento) return erroDaApi(404, 'Not Found', 'notFound')
    if (evento.status === 'cancelled') return erroDaApi(410, 'Resource has been deleted', 'deleted')
    if (metodo === 'GET') return json(200, evento)
    if (metodo === 'DELETE') {
      evento.status = 'cancelled'
      return json(204, null)
    }
    if (metodo === 'PATCH') {
      for (const campo of ['summary', 'description', 'start', 'end']) if (campo in corpo) evento[campo] = corpo[campo]
      if ('attendees' in corpo) {
        const antes = new Map((evento.attendees ?? []).map((a: any) => [a.email, a.responseStatus]))
        evento.attendees = (corpo.attendees ?? []).map((a: any) => ({ ...a, responseStatus: antes.get(a.email) ?? 'needsAction' }))
      }
      const pedidoMeet = corpo.conferenceData?.createRequest
      if (pedidoMeet && !evento.conferenceData && busca.conferenceDataVersion === '1') meetDoEvento(c, evento, pedidoMeet)
      return json(200, evento)
    }
    return erroDaApi(405, 'Method Not Allowed')
  }

  // ── Meet ──
  function conferenciaEmJson(conferencia: any) {
    return {
      name: conferencia.name,
      startTime: conferencia.startTime,
      ...(conferencia.endTime ? { endTime: conferencia.endTime } : {}),
      expireTime: new Date(Date.parse(conferencia.startTime) + 30 * 86_400_000).toISOString(),
      space: conferencia.space,
    }
  }

  function meet(c: Conta, metodo: string, partes: string[], busca: Record<string, string>, corpo: any, escopos: string[]): Response {
    const pode = (lista: string[]) => lista.some((e) => escopos.includes(e))
    const semEscopo = () =>
      erroDaApi(403, 'Request had insufficient authentication scopes.', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
    // partes: ['spaces', id|codigo] | ['conferenceRecords', ...]
    if (partes[0] === 'spaces' && partes.length === 2) {
      if (metodo === 'GET') {
        if (!pode(MEET_LER)) return semEscopo()
        const espaco = c.espacos.get(`spaces/${partes[1]}`) ?? espacoPeloCodigo(c, partes[1])
        if (!espaco) return erroDaApi(404, 'Requested entity was not found.')
        return json(200, { name: espaco.name, meetingUri: espaco.meetingUri, meetingCode: espaco.meetingCode, config: espaco.config })
      }
      if (metodo === 'PATCH') {
        if (!pode(MEET_CONFIGURAR)) return semEscopo()
        const espaco = c.espacos.get(`spaces/${partes[1]}`)
        if (!espaco) return erroDaApi(404, 'Requested entity was not found.')
        const mascara = (busca.updateMask ?? '').split(',').filter(Boolean)
        if (!mascara.length) return erroDaApi(400, 'updateMask is required.')
        for (const caminho of mascara) {
          const chaves = caminho.split('.')
          let origem: any = corpo
          for (const chave of chaves) origem = origem?.[chave]
          if (origem === undefined) return erroDaApi(400, `Field ${caminho} is missing from the body.`)
          let destino: any = espaco
          for (const chave of chaves.slice(0, -1)) destino = destino[chave] ??= {}
          destino[chaves.at(-1)!] = origem
        }
        return json(200, { name: espaco.name, meetingUri: espaco.meetingUri, meetingCode: espaco.meetingCode, config: espaco.config })
      }
    }
    if (partes[0] === 'conferenceRecords') {
      if (!pode(MEET_LER)) return semEscopo()
      const todas = [...c.espacos.values()].flatMap((e) => e.conferencias)
      if (partes.length === 1 && metodo === 'GET') {
        const filtro = /space\.meeting_code\s*=\s*"([^"]+)"/.exec(busca.filter ?? '')
        const espaco = filtro ? espacoPeloCodigo(c, filtro[1]) : undefined
        const lista = (filtro ? espaco?.conferencias ?? [] : todas)
          .slice()
          .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
          .map(conferenciaEmJson)
        return json(200, pagina(lista, busca, 'conferenceRecords', 25))
      }
      const conferencia = todas.find((x) => x.name === `conferenceRecords/${partes[1]}`)
      if (!conferencia || metodo !== 'GET') return erroDaApi(404, 'Requested entity was not found.')
      if (partes.length === 3 && partes[2] === 'participants') return json(200, pagina(conferencia.participants, busca, 'participants', 100))
      if (partes.length === 3 && partes[2] === 'recordings') return json(200, pagina(conferencia.recordings, busca, 'recordings', 10))
      if (partes.length === 3 && partes[2] === 'transcripts') {
        const semEntradas = conferencia.transcripts.map((t: any) => {
          const copia = { ...t }
          delete copia.entradas
          return copia
        })
        return json(200, pagina(semEntradas, busca, 'transcripts', 10))
      }
      if (partes.length === 5 && partes[2] === 'transcripts' && partes[4] === 'entries') {
        const transcricao = conferencia.transcripts.find((t: any) => t.name.endsWith(`/transcripts/${partes[3]}`))
        if (!transcricao) return erroDaApi(404, 'Requested entity was not found.')
        return json(200, pagina(transcricao.entradas, busca, 'transcriptEntries', 10))
      }
    }
    return erroDaApi(404, 'Not Found')
  }

  // ── Roteamento ──
  async function buscar(entrada: string | URL | Request, init: RequestInit = {}): Promise<Response> {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url)
    const metodo = (init.method ?? 'GET').toUpperCase()
    const cabecalhos = new Headers(init.headers)
    const token = cabecalhos.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
    let corpo: any = null
    if (init.body != null) {
      const texto = String(init.body)
      corpo = (cabecalhos.get('content-type') ?? '').includes('json')
        ? JSON.parse(texto)
        : Object.fromEntries(new URLSearchParams(texto))
    }
    const busca = Object.fromEntries(url.searchParams)
    pedidos.push({ metodo, url: url.href, host: url.host, caminho: url.pathname, busca, corpo, token })

    const regra = regras.find((r) =>
      r.restantes > 0 &&
      (!r.metodo || r.metodo.toUpperCase() === metodo) &&
      (typeof r.url === 'string' ? url.href.includes(r.url) : r.url.test(url.href)))
    if (regra) {
      regra.restantes -= 1
      if (regra.rede) throw new TypeError('fetch failed')
      const status = regra.status ?? 500
      if (url.host === 'oauth2.googleapis.com') return json(status, { error: regra.erro ?? 'server_error', error_description: 'Falha simulada' })
      return erroDaApi(status, 'Falha simulada', regra.erro)
    }

    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/token' && metodo === 'POST') return oauthToken(corpo ?? {})
    if (url.host === 'oauth2.googleapis.com' && url.pathname === '/revoke' && metodo === 'POST') return revogar(corpo?.token ?? '')

    const acesso = token ? acessos.get(token) : undefined
    if (!acesso || acesso.expira <= agora() || acesso.concessao.revogada) {
      return erroDaApi(401, 'Request had invalid authentication credentials.', 'authError')
    }
    const c = conta(acesso.concessao.email)
    const escopos = acesso.concessao.escopos.map((e) => NOME_LONGO[e] ?? e)

    if (url.host === 'openidconnect.googleapis.com' && url.pathname === '/v1/userinfo') {
      if (!escopos.includes(NOME_LONGO.email)) return erroDaApi(403, 'Insufficient scopes.')
      return json(200, { sub: c.sub, email: c.email, email_verified: true })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/calendar/v3/')) {
      if (!CALENDARIO.some((e) => escopos.includes(e))) {
        return erroDaApi(403, 'Request had insufficient authentication scopes.', 'insufficientPermissions')
      }
      const partes = url.pathname.slice('/calendar/v3/'.length).split('/').map(decodeURIComponent)
      return calendario(c, metodo, partes, busca, corpo ?? {})
    }
    if (url.host === 'meet.googleapis.com' && url.pathname.startsWith('/v2/')) {
      const partes = url.pathname.slice('/v2/'.length).split('/').map(decodeURIComponent)
      return meet(c, metodo, partes, busca, corpo ?? {}, escopos)
    }
    return erroDaApi(404, 'Not Found')
  }

  return {
    fetch: buscar,
    pedidos,
    cliente,
    agora,
    // O relógio do Google falso anda para a frente (tokens de acesso vencem em 1 hora).
    avancar(ms: number) {
      deslocamento += ms
    },
    // Pedidos cujo endereço contém o trecho (ou casa com a expressão).
    pedidosPara(trecho: string | RegExp) {
      return pedidos.filter((p) => (typeof trecho === 'string' ? p.url.includes(trecho) : trecho.test(p.url)))
    },
    // As próximas `vezes` chamadas que casam com a regra falham.
    falhar(regra: RegraDeFalha) {
      regras.push({ ...regra, restantes: regra.vezes ?? 1 })
    },
    // A pessoa autoriza no Google: lê o endereço que o app montou (client_id, redirect_uri, scope, code_challenge)
    // e devolve o código, como o Google faria na volta. `escopos` simula caixas desmarcadas.
    autorizar(endereco: string, { email, escopos, semRefresh = false }: { email: string; escopos?: string[]; semRefresh?: boolean }) {
      const url = new URL(endereco)
      if (url.searchParams.get('client_id') !== cliente.id) throw new Error('client_id diferente do app')
      const pedidosNoEndereco = (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean)
      const codigo = `4/falso-${base32hex(30)}`
      codigos.set(codigo, {
        concessao: { email: email.toLowerCase(), escopos: escopos ?? pedidosNoEndereco, revogada: false },
        redirect: url.searchParams.get('redirect_uri') ?? '',
        desafio: url.searchParams.get('code_challenge_method') === 'S256' ? url.searchParams.get('code_challenge') : null,
        semRefresh,
        usado: false,
      })
      conta(email)
      return { codigo, estado: url.searchParams.get('state') ?? '' }
    },
    // Um token de renovação válido sem passar pelo consentimento (para testar o cliente direto).
    concederRenovacao(email: string, escopos: string[]) {
      const token = `1//falso-${base32hex(32)}`
      renovacoes.set(token, { email: email.toLowerCase(), escopos, revogada: false })
      conta(email)
      return token
    },
    // A pessoa tirou o acesso do app na conta do Google: os tokens param de valer (invalid_grant / 401).
    revogarConta(email: string) {
      for (const concessao of [...renovacoes.values(), ...[...acessos.values()].map((a) => a.concessao)]) {
        if (concessao.email === email.toLowerCase()) concessao.revogada = true
      }
    },
    revogado(token: string) {
      return renovacoes.get(token)?.revogada ?? acessos.get(token)?.concessao.revogada ?? false
    },
    evento(email: string, id: string) {
      return conta(email).eventos.get(id)
    },
    espaco(email: string, codigo: string) {
      return espacoPeloCodigo(conta(email), codigo)
    },
    // Uma reunião aconteceu no espaço do Meet: participantes, gravações e transcrições como o Google guarda.
    registrarConferencia(email: string, codigo: string, dados: ConferenciaFalsa) {
      const espaco = espacoPeloCodigo(conta(email), codigo)
      if (!espaco) throw new Error(`espaço ${codigo} não existe`)
      const nome = `conferenceRecords/${base32hex(16)}`
      const participantes = (dados.participantes ?? []).map((p) => ({
        name: `${nome}/participants/${p.id}`,
        earliestStartTime: dados.inicio,
        ...(dados.fim ? { latestEndTime: dados.fim } : {}),
        [p.tipo ?? 'signedinUser']: p.tipo === 'phoneUser' || p.tipo === 'anonymousUser'
          ? { displayName: p.nome }
          : { user: `users/${p.id}`, displayName: p.nome },
      }))
      const conferencia = {
        name: nome,
        startTime: dados.inicio,
        endTime: dados.fim ?? undefined,
        space: espaco.name,
        participants: participantes,
        recordings: (dados.gravacoes ?? []).map((g, i) => ({
          name: `${nome}/recordings/r${i}`,
          state: g.estado,
          startTime: g.inicio ?? dados.inicio,
          ...(g.estado === 'FILE_GENERATED'
            ? { driveDestination: { file: `arquivo-${i}`, exportUri: g.link ?? `https://drive.google.com/file/d/arquivo-${i}/view` } }
            : {}),
        })),
        transcripts: (dados.transcricoes ?? []).map((t, i) => ({
          name: `${nome}/transcripts/t${i}`,
          state: t.estado,
          startTime: t.inicio ?? dados.inicio,
          ...(t.estado === 'FILE_GENERATED'
            ? { docsDestination: { document: `doc-${i}`, exportUri: `https://docs.google.com/document/d/doc-${i}/view` } }
            : {}),
          entradas: (t.falas ?? []).map((f, j) => ({
            name: `${nome}/transcripts/t${i}/entries/e${j}`,
            participant: `${nome}/participants/${f.participante}`,
            text: f.texto,
            languageCode: 'pt-BR',
            startTime: f.inicio,
            endTime: new Date(Date.parse(f.inicio) + 5_000).toISOString(),
          })),
        })),
      }
      espaco.conferencias.push(conferencia)
      return conferencia
    },
  }
}

export type GoogleFalso = ReturnType<typeof criarGoogleFalso>
