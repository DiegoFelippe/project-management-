// Token do Google de cada pessoa. Fica só no Vault (um JSON com o token de renovação e o de acesso da vez, com
// o vencimento); quem lê e grava é a service_role, pelas funções do banco ler_token_da_pessoa e
// gravar_token_da_pessoa. Sem imports do Deno: recebe o cliente do Supabase e o `fetch` (os testes usam o
// Google falso e o banco local).
import { type AppDoGoogle, type Buscar, RecusaDoGoogle, tokenDoGoogle } from '../google-oauth.ts'
import { criarGoogle, ErroDoGoogle, MENSAGEM_RECONECTAR } from './google.ts'

// O pedaço do cliente do Supabase que usamos (serve o da Edge Function e o dos testes).
export type Banco = {
  rpc: (funcao: string, argumentos?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
  from: (tabela: string) => any
}

export type TokenGuardado = { refresh_token: string; access_token?: string; expira_em?: number }

// Renova quando faltar menos de 1 minuto para o token de acesso vencer.
const FOLGA_MS = 60_000

export async function lerTokenDaPessoa(banco: Banco, perfilId: string): Promise<TokenGuardado | null> {
  const { data, error } = await banco.rpc('ler_token_da_pessoa', { p_perfil: perfilId })
  if (error) throw error
  if (typeof data !== 'string' || !data) return null
  try {
    const token = JSON.parse(data)
    return typeof token?.refresh_token === 'string' && token.refresh_token ? token : null
  } catch {
    return null
  }
}

// Com `conta`: conectar ou reconectar (e-mail e escopos novos). Sem: renovar (false se a pessoa desconectou).
export async function gravarTokenDaPessoa(
  banco: Banco,
  perfilId: string,
  token: TokenGuardado,
  conta?: { email: string; escopos: string[] },
): Promise<boolean> {
  const { data, error } = await banco.rpc('gravar_token_da_pessoa', {
    p_perfil: perfilId,
    p_segredo: JSON.stringify(token),
    p_email: conta?.email ?? null,
    p_escopos: conta?.escopos ?? null,
  })
  if (error) throw error
  return data === true
}

// A tela mostra "Reconecte o Google" enquanto houver erro na conexão da pessoa.
export async function marcarErroDoGoogle(banco: Banco, perfilId: string, erro: string) {
  const { error } = await banco.from('google_pessoas').update({ erro: erro.slice(0, 500) }).eq('perfil_id', perfilId)
  if (error) throw error
}

type OpcoesDosTokens = {
  banco: Banco
  perfilId: string
  app: AppDoGoogle | null
  fetch: Buscar
  agora?: () => number
}

export function tokensDaPessoa({ banco, perfilId, app, fetch: buscar, agora = Date.now }: OpcoesDosTokens) {
  let atual: TokenGuardado | null = null
  // Pedidos ao mesmo tempo (o Meet lê gravações e transcrições em paralelo) dividem a mesma leitura e renovação.
  let lendo: Promise<TokenGuardado | null> | null = null
  let renovando: Promise<string> | null = null

  async function reconectar(): Promise<never> {
    try {
      await marcarErroDoGoogle(banco, perfilId, MENSAGEM_RECONECTAR)
    } catch {
      // marcar a pessoa é um extra: o erro que sobe é o do Google
    }
    throw new ErroDoGoogle('reconectar', MENSAGEM_RECONECTAR)
  }

  async function renovarAgora(guardado: TokenGuardado): Promise<string> {
    if (!app) throw new ErroDoGoogle('recusado', 'Falta configurar o app do Google na plataforma (veja o README).')
    let tokens
    try {
      tokens = await tokenDoGoogle({
        client_id: app.id,
        client_secret: app.segredo,
        refresh_token: guardado.refresh_token,
        grant_type: 'refresh_token',
      }, buscar)
    } catch (erro) {
      if (erro instanceof RecusaDoGoogle && erro.erro === 'invalid_grant') return reconectar()
      // Com o status do Google (5xx e 429 passam com o tempo; 400 de app errado, não) ou sem resposta (rede, tempo).
      const recusa = erro instanceof RecusaDoGoogle
      throw new ErroDoGoogle('recusado', 'Não foi possível falar com o Google. Tente de novo em alguns minutos.',
        recusa ? erro.status : null, !recusa)
    }
    atual = {
      refresh_token: tokens.refresh_token ?? guardado.refresh_token,
      access_token: tokens.access_token,
      expira_em: agora() + (tokens.expires_in ?? 3600) * 1000,
    }
    await gravarTokenDaPessoa(banco, perfilId, atual)
    return atual.access_token
  }

  return {
    // Token de acesso da pessoa: o guardado enquanto vale; senão (ou com `renovar`) troca o de renovação por um
    // novo e guarda no Vault. Token revogado ou vencido no Google (invalid_grant) → "reconectar" e marca a pessoa.
    async obterToken({ renovar = false } = {}): Promise<string> {
      lendo ??= lerTokenDaPessoa(banco, perfilId)
      atual ??= await lendo
      if (!atual) return reconectar()
      if (!renovar && !renovando && atual.access_token && (atual.expira_em ?? 0) - agora() > FOLGA_MS) {
        return atual.access_token
      }
      renovando ??= renovarAgora(atual).finally(() => {
        renovando = null
      })
      return renovando
    },
    marcarReconectar: (mensagem = MENSAGEM_RECONECTAR) => marcarErroDoGoogle(banco, perfilId, mensagem),
  }
}

// Para as Edge Functions da agenda: googleDe(perfilId) dá o cliente do Google daquela pessoa (o organizador), ou
// null quando ela não conectou.
export function criarGoogleDe({ banco, app, fetch: buscar, agora }: Omit<OpcoesDosTokens, 'perfilId'>) {
  return async (perfilId: string) => {
    const { data, error } = await banco.from('google_pessoas').select('perfil_id').eq('perfil_id', perfilId).maybeSingle()
    if (error) throw error
    if (!data) return null
    const tokens = tokensDaPessoa({ banco, perfilId, app, fetch: buscar, agora })
    return criarGoogle({ fetch: buscar, obterToken: tokens.obterToken, aoReconectar: tokens.marcarReconectar })
  }
}
