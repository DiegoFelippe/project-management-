// GET /functions/v1/integracoes-google — volta do "Conectar com Google" (endereço cadastrado no app do
// Google como GOOGLE_OAUTH_REDIRECT_URI). Confere o estado (10 minutos), troca o código pelo token,
// guarda o token no Vault e devolve a pessoa para a tela de Integrações (?google=conectado ou =erro).
import { clienteAdmin } from '../_shared/clientes.ts'
import { appDoGoogle, emailDoGoogle, ESCOPOS_DO_GOOGLE, testarERegistrar, tokenDoGoogle } from '../_shared/integracoes.ts'

const voltarPara = (volta: string, resultado: 'conectado' | 'erro') => {
  const url = new URL(volta)
  url.searchParams.set('google', resultado)
  return Response.redirect(url.toString(), 302)
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response(null, { status: 405 })
  const parametros = new URL(req.url).searchParams
  const estado = parametros.get('state')
  if (!estado) return new Response('Pedido inválido.', { status: 400 })

  const admin = clienteAdmin()
  const { data: pedido } = await admin.from('oauth_estados').delete().eq('estado', estado).select('*').maybeSingle()
  if (!pedido) return new Response('Este link expirou. Volte à tela de Integrações e conecte de novo.', { status: 400 })
  const vencido = Date.now() - new Date(pedido.criado_em).getTime() > 10 * 60_000
  const codigo = parametros.get('code')
  const app = appDoGoogle()
  if (vencido || !codigo || parametros.get('error') || !app) return voltarPara(pedido.volta, 'erro')

  try {
    const tokens = await tokenDoGoogle({
      client_id: app.id, client_secret: app.segredo, code: codigo, redirect_uri: app.volta, grant_type: 'authorization_code',
    })
    if (!tokens.refresh_token) throw new Error('O Google não devolveu o token de acesso contínuo.')
    const email = await emailDoGoogle(tokens.access_token)
    const { data: id, error } = await admin.rpc('integracao_salvar', {
      p_consultoria: pedido.consultoria_id,
      p_tipo: 'google',
      p_config: { email, escopos: ESCOPOS_DO_GOOGLE },
      p_segredo: tokens.refresh_token,
      p_quem: pedido.pessoa_id,
    })
    if (error) throw error
    const resultado = await testarERegistrar(admin, id as string)
    return voltarPara(pedido.volta, resultado.situacao === 'conectada' ? 'conectado' : 'erro')
  } catch (erro) {
    console.error(erro)
    return voltarPara(pedido.volta, 'erro')
  }
})
