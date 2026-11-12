// POST /functions/v1/gerenciar-acesso — { acao: 'editar' | 'desativar' | 'reativar', pessoa_id, nome?, papel? }
// Dono cuida dos administradores; administrador, de gestores e pessoas da consultoria dele;
// gestor só muda o nome das pessoas que vê. Em si mesmo ("Meu perfil"), cada um muda só o próprio nome:
// não troca o próprio papel nem se desativa. E-mail não muda.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { clienteAdmin, type Perfil, quemChama } from '../_shared/clientes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import { validarNome, validarUuid } from '../_shared/validar.ts'

type Poder = 'tudo' | 'nome' | null

async function gestorVePessoa(admin: SupabaseClient, gestorId: string, pessoaId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('time_membros')
    .select('time_id, times!inner(gestor_id)')
    .eq('pessoa_id', pessoaId)
    .eq('times.gestor_id', gestorId)
    .limit(1)
  if (error) throw error
  return (data?.length ?? 0) > 0
}

async function poderSobre(admin: SupabaseClient, quem: Perfil, alvo: Perfil): Promise<Poder> {
  if (quem.papel === 'dono') return alvo.papel === 'admin' ? 'tudo' : null
  if (!quem.consultoria_id || alvo.consultoria_id !== quem.consultoria_id) return null
  if (quem.papel === 'admin') return alvo.papel === 'gestor' || alvo.papel === 'pessoa' ? 'tudo' : null
  if (quem.papel === 'gestor' && alvo.papel === 'pessoa') {
    if (alvo.criado_por === quem.id || (await gestorVePessoa(admin, quem.id, alvo.id))) return 'nome'
  }
  return null
}

function erroDoBanco(erro: { message?: string }) {
  if (erro.message?.includes('gestor_com_times')) return new Falha(409, 'gestor_com_times')
  return erro
}

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  const corpo = await lerJson(req)
  const acao = corpo.acao
  if (acao !== 'editar' && acao !== 'desativar' && acao !== 'reativar') {
    throw new Falha(400, 'dados_invalidos', { campo: 'acao' })
  }
  const pessoaId = validarUuid(corpo.pessoa_id, 'pessoa_id')
  const euMesmo = pessoaId === quem.id
  if (euMesmo && acao !== 'editar') throw new Falha(403, 'sem_permissao')

  const { data: alvo } = await admin.from('perfis').select('*').eq('id', pessoaId).maybeSingle()
  const poder: Poder = euMesmo ? 'nome' : alvo ? await poderSobre(admin, quem, alvo as Perfil) : null
  if (!poder) throw new Falha(403, 'sem_permissao')

  if (acao === 'editar') {
    const mudancas: Record<string, string> = {}
    if (corpo.nome !== undefined) mudancas.nome = validarNome(corpo.nome)
    if (corpo.papel !== undefined) {
      if (poder !== 'tudo' || quem.papel !== 'admin') throw new Falha(403, 'sem_permissao')
      if (corpo.papel !== 'pessoa' && corpo.papel !== 'gestor') throw new Falha(400, 'dados_invalidos', { campo: 'papel' })
      mudancas.papel = corpo.papel
    }
    if (!Object.keys(mudancas).length) throw new Falha(400, 'dados_invalidos', { campo: 'nome' })
    const { error } = await admin.from('perfis').update(mudancas).eq('id', pessoaId)
    if (error) throw erroDoBanco(error)
    return responder(200, { ok: true })
  }

  if (poder !== 'tudo') throw new Falha(403, 'sem_permissao')

  if (acao === 'desativar') {
    const { error } = await admin.from('perfis').update({ ativo: false, desativado_em: new Date().toISOString() }).eq('id', pessoaId)
    if (error) throw erroDoBanco(error)
    const { error: erroAuth } = await admin.auth.admin.updateUserById(pessoaId, { ban_duration: '876000h' })
    if (erroAuth) throw erroAuth
    return responder(200, { ok: true })
  }

  // reativar: volta como estava (convite pendente e senha provisória não mudam)
  if (alvo!.consultoria_id) {
    const { data: c } = await admin.from('consultorias').select('arquivada_em').eq('id', alvo!.consultoria_id).single()
    if (c?.arquivada_em) throw new Falha(409, 'consultoria_arquivada')
  }
  const { error } = await admin.from('perfis').update({ ativo: true, desativado_em: null }).eq('id', pessoaId)
  if (error) throw error
  const { error: erroAuth } = await admin.auth.admin.updateUserById(pessoaId, { ban_duration: 'none' })
  if (erroAuth) throw erroAuth
  return responder(200, { ok: true })
})
