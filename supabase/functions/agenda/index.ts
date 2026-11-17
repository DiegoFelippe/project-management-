// POST /functions/v1/agenda — eventos da agenda (desenho: docs/superpowers/specs/2026-11-16-calendario-design.md,
// "Janela de evento" e "Google — conta de cada consultor"). Grava no Google do organizador primeiro e depois no banco;
// o navegador só lê a agenda (RLS). O núcleo fica em _shared/agenda/eventos.ts.
// { acao: 'salvar', evento: { id?, novo?, consultor_id?, cliente_id?, titulo, descricao?, inicio, fim, dia_inteiro?, cor?,
//   com_meet?, gravar?, participantes?: [perfil_id], convidados?: [e-mail] } } → { evento, aviso? }
//   (novo: true cria com o id que a janela escolheu, e tentar de novo não duplica no Google; sem novo, edita o id)
// { acao: 'apagar', id } → { ok, aviso? }
// { acao: 'responder', id, resposta: 'confirmou' | 'recusou' } → { ok, resposta }
// Erros: { codigo, erro } — erro já em português para a tela (dados_invalidos traz o campo; google_recusou, o motivo).
import { apagarEvento, responder as responderAoConvite, salvarEvento } from '../_shared/agenda/eventos.ts'
import { criarGoogleDe } from '../_shared/agenda/tokens.ts'
import { clienteAdmin, quemChama } from '../_shared/clientes.ts'
import { appDoGoogle } from '../_shared/google-oauth.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  const corpo = await lerJson(req)
  // O Google de cada organizador, com o token dele no Vault (renova com o app OAuth da plataforma).
  const googleDe = criarGoogleDe({ banco: admin, app: appDoGoogle('GOOGLE_PESSOA_REDIRECT_URI'), fetch })

  if (corpo.acao === 'salvar') return responder(200, await salvarEvento(admin, googleDe, quem, corpo.evento))
  if (corpo.acao === 'apagar') return responder(200, await apagarEvento(admin, googleDe, quem, corpo.id))
  if (corpo.acao === 'responder') {
    return responder(200, await responderAoConvite(admin, quem, corpo.id, corpo.resposta))
  }
  throw new Falha(400, 'dados_invalidos', { campo: 'acao' })
})
