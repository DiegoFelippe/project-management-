// POST /functions/v1/integracoes — conexões da consultoria (IA, e-mail SMTP e Google).
// { acao: 'salvar', tipo, config, segredo? } cria ou edita (segredo em branco mantém o guardado) e já testa;
// { acao: 'testar', id }; { acao: 'desconectar', id }; { acao: 'google_iniciar', volta } devolve a URL do Google.
// Só o administrador da própria consultoria mexe. O dono só olha (pela tabela). O segredo nunca volta.
import { clienteAdmin, type Perfil, quemChama } from '../_shared/clientes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import {
  appDoGoogle,
  ESCOPOS_DO_GOOGLE,
  testarERegistrar,
  type Tipo,
  validarConfig,
} from '../_shared/integracoes.ts'
import { validarRedirect, validarUuid } from '../_shared/validar.ts'

function consultoriaDoAdmin(quem: Perfil): string {
  if (quem.papel !== 'admin' || !quem.consultoria_id) throw new Falha(403, 'sem_permissao')
  return quem.consultoria_id
}

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  const corpo = await lerJson(req)
  const consultoriaId = consultoriaDoAdmin(quem)

  // Integração existente, só da consultoria de quem chama (de outra, "não existe").
  const daConsultoria = async (id: unknown) => {
    const { data } = await admin.from('integracoes').select('id, consultoria_id, tipo').eq('id', validarUuid(id, 'id')).maybeSingle()
    if (!data || data.consultoria_id !== consultoriaId) throw new Falha(403, 'sem_permissao')
    return data
  }

  if (corpo.acao === 'salvar') {
    const tipo = corpo.tipo as Tipo
    if (tipo !== 'ia' && tipo !== 'smtp') throw new Falha(400, 'dados_invalidos', { campo: 'tipo' })
    const config = validarConfig(tipo, corpo.config)
    let segredo: string | null = null
    if (corpo.segredo != null && corpo.segredo !== '') {
      if (typeof corpo.segredo !== 'string' || corpo.segredo.length > 4000) throw new Falha(400, 'dados_invalidos', { campo: 'segredo' })
      segredo = corpo.segredo.trim()
    }
    if (tipo === 'ia' && !segredo) {
      const { data: existente } = await admin.from('integracoes').select('id').eq('consultoria_id', consultoriaId).eq('tipo', 'ia').maybeSingle()
      if (!existente) throw new Falha(400, 'dados_invalidos', { campo: 'segredo' })
    }
    const { data: id, error } = await admin.rpc('integracao_salvar', {
      p_consultoria: consultoriaId, p_tipo: tipo, p_config: config, p_segredo: segredo, p_quem: quem.id,
    })
    if (error) throw error
    return responder(200, await testarERegistrar(admin, id as string))
  }

  if (corpo.acao === 'testar') {
    const integracao = await daConsultoria(corpo.id)
    return responder(200, await testarERegistrar(admin, integracao.id))
  }

  if (corpo.acao === 'desconectar') {
    const integracao = await daConsultoria(corpo.id)
    const { error } = await admin.rpc('integracao_desconectar', { p_id: integracao.id })
    if (error) throw error
    return responder(200, { ok: true })
  }

  if (corpo.acao === 'google_iniciar') {
    const volta = validarRedirect(corpo.volta)
    const app = appDoGoogle()
    if (!app) throw new Falha(409, 'google_nao_configurado')
    const estado = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '')
    // estados velhos (mais de 10 minutos) saem antes de criar o novo
    await admin.from('oauth_estados').delete().lt('criado_em', new Date(Date.now() - 10 * 60_000).toISOString())
    const { error } = await admin.from('oauth_estados').insert({ estado, consultoria_id: consultoriaId, pessoa_id: quem.id, volta })
    if (error) throw error
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: app.id,
      redirect_uri: app.volta,
      response_type: 'code',
      scope: ESCOPOS_DO_GOOGLE.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: estado,
    }).toString()
    return responder(200, { url: url.toString() })
  }

  throw new Falha(400, 'dados_invalidos', { campo: 'acao' })
})
