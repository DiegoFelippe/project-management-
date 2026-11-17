import { createClient } from '@supabase/supabase-js'

// Local: vem do .env.local (npm run env:local).
// Vercel: vem das variáveis de ambiente do projeto, com os dados do Supabase na nuvem.
// Só a chave publicável vai para o navegador; a secreta nunca.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Recusa (401/403) do banco, do Storage, do Auth ou de uma Edge Function: pode ser a sessão antiga (aal1) de quem
// passou a precisar do código do app autenticador. O AuthProvider ouve este aviso e confere de novo (uma conferência
// por vez), e a tela do código aparece no lugar de um erro solto.
export const EVENTO_CONFERIR_ACESSO = 'consultoria:conferir-acesso'

export function avisarRecusa(status) {
  if (status === 401 || status === 403) window.dispatchEvent(new Event(EVENTO_CONFERIR_ACESSO))
}

async function buscarAvisando(...argumentos) {
  const resposta = await fetch(...argumentos)
  avisarRecusa(resposta.status)
  return resposta
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, { global: { fetch: buscarAvisando } })

// O Supabase responde com uma página de erro crua quando o provedor está desligado;
// por isso a tela pergunta antes de mandar a pessoa para o Google.
export async function provedorLigado(provedor) {
  try {
    const resposta = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabasePublishableKey },
    })
    if (!resposta.ok) return false
    const config = await resposta.json()
    return Boolean(config.external?.[provedor])
  } catch {
    return false
  }
}

// Chama uma Edge Function e devolve { status, corpo } (o corpo traz o "codigo" dos erros).
export async function chamarFuncao(nome, corpo) {
  const { data } = await supabase.auth.getSession()
  const resposta = await fetch(`${supabaseUrl}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: supabasePublishableKey,
      authorization: `Bearer ${data.session?.access_token ?? supabasePublishableKey}`,
    },
    body: JSON.stringify(corpo),
  })
  avisarRecusa(resposta.status)
  let corpoResposta = {}
  try {
    corpoResposta = await resposta.json()
  } catch {
    // resposta sem JSON
  }
  return { status: resposta.status, corpo: corpoResposta }
}
