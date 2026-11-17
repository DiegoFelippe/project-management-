// POST /functions/v1/google-pessoa — o Google de cada pessoa, para a agenda (desenho:
// docs/superpowers/specs/2026-11-16-calendario-design.md, "Google — conta de cada consultor").
// { acao: 'conectar' } → { url } do Google (estado de uso único, 10 minutos, preso a quem pediu, com PKCE);
// { acao: 'concluir', estado, codigo } → o Google volta para a tela /calendario (GOOGLE_PESSOA_REDIRECT_URI) com
//   ?code&state, e a tela manda aqui com o login da pessoa: troca o código, confere os escopos e guarda o token no
//   Vault → { email };
// { acao: 'desconectar' } → revoga no Google e apaga a conexão e o token → { ok, revogado }.
// Cada pessoa mexe só no próprio Google; o token nunca sai desta função. O núcleo fica em _shared/agenda/conexao.ts.
import { concluir, conectar, desconectar } from '../_shared/agenda/conexao.ts'
import { clienteAdmin, quemChama } from '../_shared/clientes.ts'
import { appDoGoogle } from '../_shared/google-oauth.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  const corpo = await lerJson(req)
  const app = appDoGoogle('GOOGLE_PESSOA_REDIRECT_URI')

  if (corpo.acao === 'conectar') return responder(200, await conectar({ banco: admin, app, quem }))
  if (corpo.acao === 'concluir') {
    return responder(200, await concluir({ banco: admin, app, fetch, quem, estado: corpo.estado, codigo: corpo.codigo }))
  }
  if (corpo.acao === 'desconectar') return responder(200, await desconectar({ banco: admin, fetch, quem }))
  throw new Falha(400, 'dados_invalidos', { campo: 'acao' })
})
