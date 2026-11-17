// POST /functions/v1/integracoes — conexões da consultoria (IA, e-mail SMTP, Google, Slack e WhatsApp).
// { acao: 'salvar', tipo, config, segredo? } cria ou edita (segredo em branco mantém o guardado) e já testa;
// { acao: 'testar_rascunho', tipo, config, segredo?, numero_teste? } testa o que foi digitado na janela, sem gravar
// nada (segredo em branco usa o guardado; numero_teste: quem recebe o modelo do WhatsApp, nunca é guardado);
// { acao: 'testar', id }; { acao: 'desconectar', id }; { acao: 'google_iniciar', volta } devolve a URL do Google.
// Só o administrador da própria consultoria mexe. O dono só olha (pela tabela). O segredo nunca volta nem vai para log.
import { clienteAdmin, type Perfil, quemChama } from '../_shared/clientes.ts'
import { validarNumeroDeTeste, validarSegredo } from '../_shared/conexoes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import {
  appDoGoogle,
  conexaoDa,
  ESCOPOS_DO_GOOGLE,
  testarERegistrar,
  testarRascunho,
  type Tipo,
  validarConfig,
} from '../_shared/integracoes.ts'
import { validarRedirect, validarUuid } from '../_shared/validar.ts'

// Os tipos com janela (o Google conecta pelo OAuth) e os que não funcionam sem o segredo.
const TIPOS_COM_JANELA: Tipo[] = ['ia', 'smtp', 'slack', 'whatsapp']
const SEGREDO_OBRIGATORIO: Tipo[] = ['ia', 'slack', 'whatsapp']

function consultoriaDoAdmin(quem: Perfil): string {
  if (quem.papel !== 'admin' || !quem.consultoria_id) throw new Falha(403, 'sem_permissao')
  return quem.consultoria_id
}

function tipoComJanela(valor: unknown): Tipo {
  if (!TIPOS_COM_JANELA.includes(valor as Tipo)) throw new Falha(400, 'dados_invalidos', { campo: 'tipo' })
  return valor as Tipo
}

// O segredo digitado (null quando veio em branco: vale o guardado), no formato do tipo.
function segredoDoCorpo(tipo: Tipo, valor: unknown): string | null {
  if (valor == null || valor === '') return null
  if (typeof valor !== 'string' || valor.length > 4000) throw new Falha(400, 'dados_invalidos', { campo: 'segredo' })
  const segredo = valor.trim()
  if (!segredo) return null
  validarSegredo(tipo, segredo)
  return segredo
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
    const tipo = tipoComJanela(corpo.tipo)
    const config = validarConfig(tipo, corpo.config)
    const segredo = segredoDoCorpo(tipo, corpo.segredo)
    if (SEGREDO_OBRIGATORIO.includes(tipo) && !segredo) {
      const { data: existente } = await admin.from('integracoes').select('id').eq('consultoria_id', consultoriaId).eq('tipo', tipo).maybeSingle()
      if (!existente) throw new Falha(400, 'dados_invalidos', { campo: 'segredo' })
    }
    const { data: id, error } = await admin.rpc('integracao_salvar', {
      p_consultoria: consultoriaId, p_tipo: tipo, p_config: config, p_segredo: segredo, p_quem: quem.id,
    })
    if (error) throw error
    return responder(200, await testarERegistrar(admin, id as string))
  }

  if (corpo.acao === 'testar_rascunho') {
    const tipo = tipoComJanela(corpo.tipo)
    const config = validarConfig(tipo, corpo.config)
    const numeroDeTeste = tipo === 'whatsapp' ? validarNumeroDeTeste(corpo.numero_teste) : null
    const segredo = segredoDoCorpo(tipo, corpo.segredo) ?? (await conexaoDa(admin, consultoriaId, tipo))?.segredo ?? null
    return responder(200, await testarRascunho(tipo, config, segredo, { destinatario: quem.email, numeroDeTeste }))
  }

  if (corpo.acao === 'testar') {
    const integracao = await daConsultoria(corpo.id)
    return responder(200, await testarERegistrar(admin, integracao.id, { enviar: true }))
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
