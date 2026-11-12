// Cliente com a chave secreta (passa por cima das regras do banco) e quem está chamando a função.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { Falha } from './http.ts'

export type Papel = 'dono' | 'admin' | 'gestor' | 'pessoa'

export type Perfil = {
  id: string
  consultoria_id: string | null
  nome: string
  email: string
  papel: Papel
  precisa_trocar_senha: boolean
  convite_pendente: boolean
  criado_por: string | null
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

// Valida o token de quem chama e carrega o perfil. Senha provisória não trocada não faz nada.
export async function quemChama(req: Request, admin: SupabaseClient): Promise<Perfil> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Falha(401, 'nao_autenticado')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Falha(401, 'nao_autenticado')
  const { data: perfil } = await admin.from('perfis').select('*').eq('id', data.user.id).maybeSingle()
  if (!perfil || perfil.precisa_trocar_senha) throw new Falha(403, 'sem_permissao')
  return perfil as Perfil
}
