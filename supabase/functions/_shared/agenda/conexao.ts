// Conectar e desconectar o Google de cada pessoa (núcleo da Edge Function google-pessoa). Sem imports do Deno:
// recebe o cliente do Supabase (service_role), o app OAuth e o `fetch`, para os testes usarem o Google falso.
//
// Por que "concluir" é uma ação com login, e não a volta do Google direto numa função: a volta do Google chega sem
// o login do app, e aí não dá para saber quem está voltando. Quem conecta é sempre quem pediu: o Google volta para
// a tela /calendario (GOOGLE_PESSOA_REDIRECT_URI, endereço cadastrado no app do Google), e a tela manda o código
// e o estado para cá com o login da pessoa. O estado (aleatório, 10 minutos, uso único) só vale para quem o pediu;
// o PKCE prende o código ao estado que o pediu. Assim ninguém consegue pendurar o Google de outra pessoa na própria
// conta (nem mandando o link do Google para ela clicar), e o token nunca sai do servidor.
import {
  type AppDoGoogle,
  type Buscar,
  emailDoGoogle,
  revogarNoGoogle,
  type TokensDoGoogle,
  tokenDoGoogle,
} from '../google-oauth.ts'
import { Falha } from '../http.ts'
import { ESCOPOS_DA_PESSOA, escoposConcedidos, escoposQueFaltam } from './google.ts'
import { type Banco, gravarTokenDaPessoa, lerTokenDaPessoa } from './tokens.ts'

export const VALIDADE_DO_ESTADO_MS = 10 * 60_000

type Quem = { id: string; email?: string | null }

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const aleatorio = (bytes: number) => base64url(crypto.getRandomValues(new Uint8Array(bytes)))

async function desafioDoPkce(verificador: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))))
}

function conferirResposta({ error }: { error: unknown }) {
  if (error) throw error
}

// { url } do Google para a pessoa autorizar. Um pedido por pessoa: o anterior (e os vencidos de todos) saem antes.
export async function conectar({ banco, app, quem, agora = Date.now }: {
  banco: Banco
  app: AppDoGoogle | null
  quem: Quem
  agora?: () => number
}) {
  if (!app) throw new Falha(409, 'google_nao_configurado')
  const estado = aleatorio(32)
  const verificador = aleatorio(48)
  conferirResposta(await banco.from('google_estados').delete()
    .lt('criado_em', new Date(agora() - VALIDADE_DO_ESTADO_MS).toISOString()))
  conferirResposta(await banco.from('google_estados').delete().eq('perfil_id', quem.id))
  conferirResposta(await banco.from('google_estados').insert({ estado, perfil_id: quem.id, verificador }))

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: app.id,
    redirect_uri: app.volta,
    response_type: 'code',
    scope: ESCOPOS_DA_PESSOA.join(' '),
    // offline + consent: o Google devolve o token de renovação toda vez (a agenda usa o Google sem a pessoa na tela)
    access_type: 'offline',
    prompt: 'consent',
    state: estado,
    code_challenge: await desafioDoPkce(verificador),
    code_challenge_method: 'S256',
    ...(quem.email ? { login_hint: quem.email } : {}),
  }).toString()
  return { url: url.toString() }
}

// A volta do Google: confere o estado (de quem chama, dentro de 10 minutos, uma vez só), troca o código, confere os
// escopos e guarda o token no Vault. Devolve só o e-mail da conta.
export async function concluir({ banco, app, fetch: buscar, quem, estado, codigo, agora = Date.now }: {
  banco: Banco
  app: AppDoGoogle | null
  fetch: Buscar
  quem: Quem
  estado: unknown
  codigo: unknown
  agora?: () => number
}) {
  if (typeof estado !== 'string' || estado.length < 32 || estado.length > 200) {
    throw new Falha(400, 'dados_invalidos', { campo: 'estado' })
  }
  if (typeof codigo !== 'string' || !codigo || codigo.length > 2000) throw new Falha(400, 'dados_invalidos', { campo: 'codigo' })

  // Uso único: o pedido sai da tabela antes de tudo, seja de quem for (o de outra pessoa também é gasto).
  const { data: pedido, error } = await banco.from('google_estados').delete().eq('estado', estado)
    .select('perfil_id, verificador, criado_em').maybeSingle()
  if (error) throw error
  // Vencido, de outra pessoa ou que não existe: a mesma resposta (não diz qual).
  if (!pedido || pedido.perfil_id !== quem.id || agora() - Date.parse(pedido.criado_em) > VALIDADE_DO_ESTADO_MS) {
    throw new Falha(400, 'estado_invalido')
  }
  if (!app) throw new Falha(409, 'google_nao_configurado')

  let tokens: TokensDoGoogle
  try {
    tokens = await tokenDoGoogle({
      client_id: app.id,
      client_secret: app.segredo,
      code: codigo,
      redirect_uri: app.volta,
      grant_type: 'authorization_code',
      code_verifier: pedido.verificador,
    }, buscar)
  } catch {
    throw new Falha(502, 'google_recusou')
  }

  // Recusado aqui, o token que veio só é descartado (nunca foi guardado), sem revogar no Google: revogar derruba a
  // permissão do app inteira naquela conta, e o app é o mesmo das Integrações — a conexão da consultoria (ou a da
  // própria pessoa) feita com a mesma conta cairia junto.
  const escopos = escoposConcedidos(tokens.scope)
  const faltam = escoposQueFaltam(escopos)
  if (faltam.length) throw new Falha(400, 'google_sem_permissoes', { faltam })
  if (!tokens.refresh_token || !tokens.access_token) throw new Falha(502, 'google_recusou')

  let email: string
  try {
    email = (await emailDoGoogle(tokens.access_token, buscar)).trim().toLowerCase()
  } catch {
    throw new Falha(502, 'google_recusou')
  }

  await gravarTokenDaPessoa(banco, quem.id, {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expira_em: agora() + (tokens.expires_in ?? 3600) * 1000,
  }, { email, escopos: ESCOPOS_DA_PESSOA.filter((e) => escopos.includes(e)) })
  return { email }
}

// Revoga no Google e apaga a conexão (o gatilho do banco apaga o token do Vault). Se o Google não responder, apaga
// aqui mesmo assim: revogado false avisa a tela. revogado null: não havia conexão.
export async function desconectar({ banco, fetch: buscar, quem }: { banco: Banco; fetch: Buscar; quem: Quem }) {
  const token = await lerTokenDaPessoa(banco, quem.id)
  const revogado = token ? await revogarNoGoogle(token.refresh_token, buscar) : null
  conferirResposta(await banco.from('google_pessoas').delete().eq('perfil_id', quem.id))
  return { ok: true, revogado }
}
