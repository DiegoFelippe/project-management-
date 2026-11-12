// Criar o login (convite ou senha provisória), o perfil e os times de uma pessoa, sem deixar sobras.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { Falha } from './http.ts'
import type { Forma } from './validar.ts'

export type SituacaoEmail =
  | 'livre'
  | { codigo: 'ja_na_consultoria'; pessoa: { id: string; nome: string } }
  | { codigo: 'email_indisponivel' }

// Só olha os perfis. E-mail de outra consultoria (ou do dono) não diz onde está.
export async function situacaoDoEmail(
  admin: SupabaseClient,
  email: string,
  consultoriaId: string | null,
): Promise<SituacaoEmail> {
  const { data, error } = await admin
    .from('perfis')
    .select('id, nome, consultoria_id')
    .eq('email', email)
    .maybeSingle()
  if (error) throw error
  if (!data) return 'livre'
  if (consultoriaId && data.consultoria_id === consultoriaId) {
    return { codigo: 'ja_na_consultoria', pessoa: { id: data.id, nome: data.nome } }
  }
  return { codigo: 'email_indisponivel' }
}

function falhaDaSituacao(situacao: SituacaoEmail): Falha {
  if (situacao === 'livre') return new Falha(409, 'email_indisponivel')
  if (situacao.codigo === 'ja_na_consultoria') return new Falha(409, situacao.codigo, { pessoa: situacao.pessoa })
  return new Falha(409, situacao.codigo)
}

type ErroAuth = { code?: string; status?: number; message?: string; name?: string }

function emailRepetido(erro: ErroAuth): boolean {
  return erro.code === 'email_exists' || erro.code === 'user_already_exists' ||
    (erro.status === 422 && /already/i.test(erro.message ?? ''))
}

// Dois convites ao mesmo tempo: o Supabase recusa o segundo com "Database error saving new user"
// (500, sem código), porque o e-mail acabou de ser gravado pelo primeiro.
function erroTemporario(erro: ErroAuth): boolean {
  return erro.name === 'AuthRetryableFetchError' || (erro.status ?? 0) >= 500
}

const esperar = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms))

export async function criarLogin(
  admin: SupabaseClient,
  { forma, email, senha, nome, redirectTo }: { forma: Forma; email: string; senha?: string; nome: string; redirectTo: string },
): Promise<string> {
  if (forma === 'convite') {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { nome } })
    if (error) throw error
    return data.user.id
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (error) throw error
  return data.user.id
}

export type NovoAcesso = {
  forma: Forma
  nome: string
  email: string
  senha?: string
  redirectTo: string
  papel: 'admin' | 'gestor' | 'pessoa'
  consultoriaId: string
  criadoPor: string
  times: string[]
}

// Devolve o id da pessoa criada. E-mail já usado → Falha 409 (ja_na_consultoria ou email_indisponivel).
export async function criarAcessoCompleto(admin: SupabaseClient, novo: NovoAcesso): Promise<string> {
  const antes = await situacaoDoEmail(admin, novo.email, novo.consultoriaId)
  if (antes !== 'livre') throw falhaDaSituacao(antes)

  let pessoaId: string
  try {
    pessoaId = await criarLogin(admin, novo)
  } catch (erro) {
    // Clique duplo: o outro pedido criou o login primeiro.
    if (emailRepetido(erro as ErroAuth)) {
      throw falhaDaSituacao(await situacaoDoEmail(admin, novo.email, novo.consultoriaId))
    }
    if (!erroTemporario(erro as ErroAuth)) throw erro
    const depois = await situacaoDoEmail(admin, novo.email, novo.consultoriaId)
    if (depois !== 'livre') throw falhaDaSituacao(depois)
    await esperar(300)
    try {
      pessoaId = await criarLogin(admin, novo)
    } catch (deNovo) {
      if (emailRepetido(deNovo as ErroAuth)) {
        throw falhaDaSituacao(await situacaoDoEmail(admin, novo.email, novo.consultoriaId))
      }
      throw deNovo
    }
  }

  const { error: erroPerfil } = await admin.from('perfis').insert({
    id: pessoaId,
    consultoria_id: novo.consultoriaId,
    nome: novo.nome,
    email: novo.email,
    papel: novo.papel,
    precisa_trocar_senha: novo.forma === 'senha',
    convite_pendente: novo.forma === 'convite',
    criado_por: novo.criadoPor,
  })
  if (erroPerfil) {
    // O convite pode devolver o mesmo login ao outro pedido do clique duplo: esse login não é nosso para apagar.
    if (erroPerfil.code === '23505') {
      throw falhaDaSituacao(await situacaoDoEmail(admin, novo.email, novo.consultoriaId))
    }
    await admin.auth.admin.deleteUser(pessoaId)
    throw erroPerfil
  }

  if (novo.times.length) {
    const { error: erroMembros } = await admin.from('time_membros').insert(
      novo.times.map((timeId) => ({ time_id: timeId, pessoa_id: pessoaId, adicionado_por: novo.criadoPor })),
    )
    if (erroMembros) {
      await admin.auth.admin.deleteUser(pessoaId) // apaga o perfil junto
      throw erroMembros
    }
  }
  return pessoaId
}
