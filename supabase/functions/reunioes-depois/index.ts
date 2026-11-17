// POST /functions/v1/reunioes-depois — depois da reunião, a pasta no cliente com a transcrição e a documentação
// (desenho: docs/superpowers/specs/2026-11-16-calendario-design.md, "Depois da reunião: a pasta no cliente"). O núcleo
// fica em _shared/agenda/rotina.ts e _shared/agenda/reuniao.ts.
// - Rotina (pg_cron a cada 10 minutos, pelo pg_net): cabeçalho x-rotina-segredo com o segredo do Vault
//   (reunioes_depois_segredo) → { ocupada, processadas }. Segredo errado: 401.
// - Pela tela (com o login de quem edita o evento):
//   { acao: 'buscarAgora', id } e { acao: 'tentarDeNovo', id } → { reuniao: { reuniao, reuniao_erro, pasta_id,
//   gravacao_url } }.
// Erros: { codigo, erro } — erro já em português para a tela.
import { iaDaConsultoria } from '../_shared/agenda/ia.ts'
import { buscarAgora, rodarRotina, segredoDaRotinaConfere, tentarDeNovo } from '../_shared/agenda/rotina.ts'
import { criarGoogleDe } from '../_shared/agenda/tokens.ts'
import { clienteAdmin, quemChama } from '../_shared/clientes.ts'
import { appDoGoogle } from '../_shared/google-oauth.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'

servir(async (req) => {
  const admin = clienteAdmin()
  // O Google de cada organizador, com o token dele no Vault (renova com o app OAuth da plataforma).
  const googleDe = criarGoogleDe({ banco: admin, app: appDoGoogle('GOOGLE_PESSOA_REDIRECT_URI'), fetch })
  const iaDa = (consultoriaId: string) => iaDaConsultoria(admin, consultoriaId, fetch)

  const segredo = req.headers.get('x-rotina-segredo')
  if (segredo !== null) {
    if (!(await segredoDaRotinaConfere(admin, segredo))) throw new Falha(401, 'nao_autenticado')
    return responder(200, await rodarRotina({ db: admin, googleDe, iaDa }))
  }

  const quem = await quemChama(req, admin)
  const corpo = await lerJson(req)
  if (corpo.acao === 'buscarAgora') return responder(200, await buscarAgora(admin, googleDe, iaDa, quem, corpo.id))
  if (corpo.acao === 'tentarDeNovo') return responder(200, await tentarDeNovo(admin, googleDe, iaDa, quem, corpo.id))
  throw new Falha(400, 'dados_invalidos', { campo: 'acao' })
})
