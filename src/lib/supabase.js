import { createClient } from '@supabase/supabase-js'

// Local: vem do .env.local (npm run env:local).
// Vercel: vem das variáveis de ambiente do projeto, com os dados do Supabase na nuvem.
// Só a chave publicável vai para o navegador; a secreta nunca.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

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
  let corpoResposta = {}
  try {
    corpoResposta = await resposta.json()
  } catch {
    // resposta sem JSON
  }
  return { status: resposta.status, corpo: corpoResposta }
}
