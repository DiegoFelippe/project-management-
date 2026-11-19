// Cliente com a chave secreta (passa por cima das regras do banco) e quem está chamando a função.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { Falha } from './http.ts'

export type Papel = 'dono' | 'central' | 'admin' | 'gestor' | 'pessoa'

export type Perfil = {
  id: string
  consultoria_id: string | null
  nome: string
  email: string
  papel: Papel
  precisa_trocar_senha: boolean
  convite_pendente: boolean
  criado_por: string | null
  ativo: boolean
  exige_2fa: boolean
}

function chaveSecreta(): string {
  const chaves = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (chaves) {
    try {
      const lidas = JSON.parse(chaves)
      if (typeof lidas.default === 'string' && lidas.default) return lidas.default
    } catch {
      // tenta a chave antiga abaixo
    }
  }
  const antiga = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (antiga) return antiga
  throw new Error('A chave secreta do Supabase não chegou à função')
}

export function clienteAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, chaveSecreta(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Nível da sessão no token ('aal1' ou 'aal2'). Só é lido depois que o Auth validou o token (getUser).
function nivelDoToken(token: string): string {
  try {
    const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const carga = JSON.parse(atob(parte.padEnd(parte.length + ((4 - (parte.length % 4)) % 4), '=')))
    return typeof carga.aal === 'string' ? carga.aal : 'aal1'
  } catch {
    return 'aal1'
  }
}

// Valida o token de quem chama e carrega o perfil. Senha provisória não trocada não faz nada, nem perfil
// desativado: o token de quem já estava logado continua valendo até expirar, mas a pessoa saiu.
// Quem tem o app autenticador ativo ou a verificação exigida só age com a sessão confirmada pelo código (aal2),
// a mesma regra do banco (private.liberado): sem ele, 403 verificacao_pendente (a tela pede o código).
export async function quemChama(req: Request, admin: SupabaseClient): Promise<Perfil> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Falha(401, 'nao_autenticado')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Falha(401, 'nao_autenticado')
  const { data: perfil } = await admin.from('perfis').select('*').eq('id', data.user.id).maybeSingle()
  if (!perfil || perfil.precisa_trocar_senha || perfil.ativo === false) throw new Falha(403, 'sem_permissao')
  const temApp = (data.user.factors ?? []).some((f) => f.status === 'verified')
  if ((temApp || perfil.exige_2fa) && nivelDoToken(token) !== 'aal2') throw new Falha(403, 'verificacao_pendente')
  return perfil as Perfil
}
