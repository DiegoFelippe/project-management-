// POST /functions/v1/reenviar-convite — manda o convite de novo para quem ainda não aceitou.
// Pode quem cuida da pessoa: admin da consultoria dela, o gestor que a criou ou que é gestor
// de um time dela, e o dono (só para administradores). Para os outros, a pessoa "não existe".
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { clienteAdmin, type Perfil, quemChama } from '../_shared/clientes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import { validarRedirect, validarUuid } from '../_shared/validar.ts'

async function cuidoDaPessoa(admin: SupabaseClient, quem: Perfil, alvo: Perfil): Promise<boolean> {
  if (quem.papel === 'dono') return alvo.papel === 'admin'
  if (!quem.consultoria_id || alvo.consultoria_id !== quem.consultoria_id) return false
  if (quem.papel === 'admin') return true
  if (quem.papel !== 'gestor') return false
  if (alvo.criado_por === quem.id) return true
  const { data, error } = await admin
    .from('time_membros')
    .select('time_id, times!inner(gestor_id)')
    .eq('pessoa_id', alvo.id)
    .eq('times.gestor_id', quem.id)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  const corpo = await lerJson(req)
  const pessoaId = validarUuid(corpo.pessoa_id, 'pessoa_id')
  const redirectTo = validarRedirect(corpo.redirectTo)

  const { data: alvo } = await admin.from('perfis').select('*').eq('id', pessoaId).maybeSingle()
  if (!alvo || !(await cuidoDaPessoa(admin, quem, alvo as Perfil))) throw new Falha(403, 'sem_permissao')
  if (!alvo.convite_pendente) throw new Falha(409, 'convite_ja_aceito')

  const { error } = await admin.auth.admin.inviteUserByEmail(alvo.email, { redirectTo, data: { nome: alvo.nome } })
  if (error) {
    // Se o Supabase não convidar de novo, o e-mail de criar senha leva ao mesmo lugar.
    const { error: erroRecuperacao } = await admin.auth.resetPasswordForEmail(alvo.email, { redirectTo })
    if (erroRecuperacao) throw erroRecuperacao
  }
  return responder(200, { ok: true })
})
