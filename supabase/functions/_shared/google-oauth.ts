// OAuth do Google, usado pela integração da consultoria (`integracoes.ts`) e pelo Google de cada pessoa
// (`agenda/`). Sem imports: os testes de integração (Vitest, no Node) importam este arquivo direto, com um
// Google falso no lugar do `fetch`. Só `appDoGoogle` lê o ambiente do Deno, e só quando é chamada.

export type AppDoGoogle = { id: string; segredo: string; volta: string }
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>

const LIMITE_MS = 10_000

// O app OAuth da plataforma. A volta muda por fluxo: a integração da consultoria usa GOOGLE_OAUTH_REDIRECT_URI e
// o Google de cada pessoa usa GOOGLE_PESSOA_REDIRECT_URI (o mesmo app, outro endereço de retorno cadastrado).
export function appDoGoogle(variavelDaVolta = 'GOOGLE_OAUTH_REDIRECT_URI'): AppDoGoogle | null {
  const id = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
  const segredo = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
  const volta = Deno.env.get(variavelDaVolta)
  return id && segredo && volta ? { id, segredo, volta } : null
}

export async function comLimite<T>(promessa: Promise<T>, aoEstourar?: () => void, limiteMs = LIMITE_MS): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const limite = new Promise<never>((_, falhar) => {
    relogio = setTimeout(() => {
      aoEstourar?.()
      falhar(new Error('O serviço demorou demais para responder.'))
    }, limiteMs)
  })
  try {
    return await Promise.race([promessa, limite])
  } finally {
    clearTimeout(relogio)
  }
}

// O Google recusou o pedido de token: `erro` é o código do Google (ex.: 'invalid_grant' para token revogado ou
// vencido), `status` o HTTP. A mensagem já vem em português para a tela.
export class RecusaDoGoogle extends Error {
  erro: string | undefined
  status: number

  constructor(mensagem: string, erro: string | undefined, status: number) {
    super(mensagem)
    this.erro = erro
    this.status = status
  }
}

export type TokensDoGoogle = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

export async function tokenDoGoogle(corpo: Record<string, string>, buscar: Buscar = fetch): Promise<TokensDoGoogle> {
  const resposta = await comLimite(buscar('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo),
  }))
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok) {
    throw new RecusaDoGoogle(
      dados.error === 'invalid_grant' ? 'O Google não aceita mais esta conexão. Conecte de novo.' : 'O Google recusou a conexão.',
      typeof dados.error === 'string' ? dados.error : undefined,
      resposta.status,
    )
  }
  return dados as TokensDoGoogle
}

export async function emailDoGoogle(tokenDeAcesso: string, buscar: Buscar = fetch): Promise<string> {
  const resposta = await comLimite(buscar('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${tokenDeAcesso}` },
  }))
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok || typeof dados.email !== 'string') throw new Error('Não foi possível ler a conta do Google.')
  return dados.email
}

// Revoga o token no Google (o de renovação derruba a permissão inteira do app naquela conta). true quando o Google
// confirmou ou o token já não valia; false quando não deu para falar com o Google.
export async function revogarNoGoogle(token: string, buscar: Buscar = fetch): Promise<boolean> {
  try {
    const resposta = await comLimite(buscar('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    }))
    if (resposta.ok) {
      await resposta.body?.cancel()
      return true
    }
    const dados = await resposta.json().catch(() => ({}))
    return resposta.status === 400 && dados.error === 'invalid_token'
  } catch {
    return false
  }
}
