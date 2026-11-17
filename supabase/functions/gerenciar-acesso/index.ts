// POST /functions/v1/gerenciar-acesso — { acao: 'editar' | 'desativar' | 'reativar' | 'mover_para_central' | 'zerar_2fa', pessoa_id, nome?, papel?, telefone?, cidade?, uf?, cargo?, data_entrada?, exige_2fa? }
// Dono cuida dos administradores e da central; a central, dos administradores; só o dono move alguém para a central; administrador, de gestores e pessoas da consultoria dele;
// gestor só muda o nome e a ficha (telefone, cidade, uf, cargo, data_entrada) das pessoas que vê. Em si mesmo ("Meu perfil"), cada um muda só o próprio nome:
// não troca o próprio papel nem se desativa. E-mail não muda.
// Verificação em duas etapas: exigir (editar com exige_2fa) e zerar (apaga os fatores do app autenticador, para quem
// perdeu o celular) são de quem pode editar o acesso da pessoa (poder 'tudo'); nunca em si mesmo por aqui.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { clienteAdmin, type Perfil, quemChama } from '../_shared/clientes.ts'
import { Falha, lerJson, responder, servir } from '../_shared/http.ts'
import { validarFicha, validarNome, validarSimNao, validarUuid } from '../_shared/validar.ts'

const CAMPOS_DA_FICHA = ['telefone', 'cidade', 'uf', 'cargo', 'data_entrada']

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
  if (quem.papel === 'dono') return alvo.papel === 'admin' || alvo.papel === 'central' ? 'tudo' : null
  if (quem.papel === 'central') return alvo.papel === 'admin' ? 'tudo' : null
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

// Só o dono. O alvo precisa estar ativo e ser admin, gestor ou pessoa; vira central, sem consultoria.
async function moverParaCentral(admin: SupabaseClient, quem: Perfil, pessoaId: string) {
  if (quem.papel !== 'dono' || pessoaId === quem.id) throw new Falha(403, 'sem_permissao')
  const { data: alvo } = await admin.from('perfis').select('papel, ativo').eq('id', pessoaId).maybeSingle()
  if (!alvo || !alvo.ativo || !['admin', 'gestor', 'pessoa'].includes(alvo.papel)) {
    throw new Falha(403, 'sem_permissao')
  }
  const { error } = await admin.from('perfis').update({ papel: 'central', consultoria_id: null }).eq('id', pessoaId)
  if (error) throw erroDoBanco(error)
  // Quem é da central não é membro de time de consultoria.
  const { error: erroTimes } = await admin.from('time_membros').delete().eq('pessoa_id', pessoaId)
  if (erroTimes) throw erroTimes
  return responder(200, { ok: true })
}

// Apaga todos os fatores da pessoa (confirmados ou não) pela API de admin do Auth. Se a verificação for exigida,
// ela configura de novo no próximo acesso; as sessões dela caem para aal1 ao renovar o token.
async function zerarVerificacao(admin: SupabaseClient, pessoaId: string) {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: pessoaId })
  if (error) throw error
  for (const fator of data.factors ?? []) {
    const { error: erroApagar } = await admin.auth.admin.mfa.deleteFactor({ userId: pessoaId, id: fator.id })
    if (erroApagar) throw erroApagar
  }
  return responder(200, { ok: true })
}

servir(async (req) => {
  const admin = clienteAdmin()
  const quem = await quemChama(req, admin)
  const corpo = await lerJson(req)
  const acao = corpo.acao
  if (!['editar', 'desativar', 'reativar', 'mover_para_central', 'zerar_2fa'].includes(acao as string)) {
    throw new Falha(400, 'dados_invalidos', { campo: 'acao' })
  }
  const pessoaId = validarUuid(corpo.pessoa_id, 'pessoa_id')
  if (acao === 'mover_para_central') return await moverParaCentral(admin, quem, pessoaId)
  const euMesmo = pessoaId === quem.id
  if (euMesmo && acao !== 'editar') throw new Falha(403, 'sem_permissao')

  const { data: alvo } = await admin.from('perfis').select('*').eq('id', pessoaId).maybeSingle()
  const poder: Poder = euMesmo ? 'nome' : alvo ? await poderSobre(admin, quem, alvo as Perfil) : null
  if (!poder) throw new Falha(403, 'sem_permissao')

  if (acao === 'editar') {
    const mudancas: Record<string, string | boolean | null> = {}
    if (corpo.nome !== undefined) mudancas.nome = validarNome(corpo.nome)
    if (euMesmo) {
      // Em si mesmo só o nome; o contato vai por atualizar_meu_contato. Confere antes de validar.
      if (CAMPOS_DA_FICHA.some((c) => corpo[c] !== undefined)) throw new Falha(403, 'sem_permissao')
    } else {
      Object.assign(mudancas, validarFicha(corpo))
    }
    if (corpo.papel !== undefined) {
      if (poder !== 'tudo' || quem.papel !== 'admin') throw new Falha(403, 'sem_permissao')
      if (corpo.papel !== 'pessoa' && corpo.papel !== 'gestor') throw new Falha(400, 'dados_invalidos', { campo: 'papel' })
      mudancas.papel = corpo.papel
    }
    if (corpo.exige_2fa !== undefined) {
      if (poder !== 'tudo' || euMesmo) throw new Falha(403, 'sem_permissao')
      mudancas.exige_2fa = validarSimNao(corpo.exige_2fa, 'exige_2fa')
    }
    if (!Object.keys(mudancas).length) throw new Falha(400, 'dados_invalidos', { campo: 'nome' })
    const { error } = await admin.from('perfis').update(mudancas).eq('id', pessoaId)
    if (error) throw erroDoBanco(error)
    return responder(200, { ok: true })
  }

  if (poder !== 'tudo') throw new Falha(403, 'sem_permissao')

  if (acao === 'zerar_2fa') return await zerarVerificacao(admin, pessoaId)

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
