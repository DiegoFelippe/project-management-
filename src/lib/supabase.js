import { createClient } from '@supabase/supabase-js'

// Local: vem do .env.local (npm run env:local).
// Vercel: vem das variáveis de ambiente do projeto, com os dados do Supabase na nuvem.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigurado = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = supabaseConfigurado
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null

// Confere se o Supabase responde, sem depender de nenhuma tabela.
export async function verificarConexao() {
  if (!supabaseConfigurado) {
    return { ok: false, motivo: 'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY' }
  }
  try {
    const resposta = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabasePublishableKey },
    })
    if (!resposta.ok) return { ok: false, motivo: `O Supabase respondeu ${resposta.status}` }
    return { ok: true }
  } catch (erro) {
    return { ok: false, motivo: `Sem resposta de ${supabaseUrl} (${erro.message})` }
  }
}
