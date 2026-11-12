// POST /functions/v1/gerenciar-consultoria — { acao: 'renomear' | 'arquivar' | 'reativar', consultoria_id, nome? }
// Só o dono. Arquivar bloqueia o login de quem está ativo nela; reativar desbloqueia só quem continua
// ativo (quem foi desativado individualmente segue desativado). Nada é apagado.
import { clienteAdmin, quemChama } from '../_shared/clientes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import { validarNome, validarUuid } from '../_shared/validar.ts'

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  if (quem.papel !== 'dono') throw new Falha(403, 'sem_permissao')

  const corpo = await lerJson(req)
  const acao = corpo.acao
  if (acao !== 'renomear' && acao !== 'arquivar' && acao !== 'reativar') {
    throw new Falha(400, 'dados_invalidos', { campo: 'acao' })
  }
  const consultoriaId = validarUuid(corpo.consultoria_id, 'consultoria_id')
  const { data: existe } = await admin.from('consultorias').select('id').eq('id', consultoriaId).maybeSingle()
  if (!existe) throw new Falha(400, 'dados_invalidos', { campo: 'consultoria_id' })

  if (acao === 'renomear') {
    const { error } = await admin.from('consultorias').update({ nome: validarNome(corpo.nome) }).eq('id', consultoriaId)
    if (error?.code === '23505') throw new Falha(409, 'nome_em_uso')
    if (error) throw error
    return responder(200, { ok: true })
  }

  const arquivar = acao === 'arquivar'
  const { error } = await admin
    .from('consultorias')
    .update({ arquivada_em: arquivar ? new Date().toISOString() : null })
    .eq('id', consultoriaId)
  if (error) throw error

  // O banco já corta quem é de consultoria arquivada; o bloqueio no Auth impede entrar de novo.
  const { data: ativos, error: erroLista } = await admin
    .from('perfis')
    .select('id')
    .eq('consultoria_id', consultoriaId)
    .eq('ativo', true)
  if (erroLista) throw erroLista
  let semBloqueio = 0
  for (const { id } of ativos ?? []) {
    const { error: erroAuth } = await admin.auth.admin.updateUserById(id, { ban_duration: arquivar ? '876000h' : 'none' })
    if (erroAuth) semBloqueio += 1
  }
  return responder(200, { ok: true, sem_bloqueio: semBloqueio })
})
