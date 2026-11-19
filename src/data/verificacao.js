// Verificação em duas etapas da própria pessoa, direto no Auth do Supabase (o segredo do app nunca passa pelo
// nosso banco). Todas devolvem { erro } (texto em português) e, no cadastro, o QR code, a chave e o endereço.
import { traduzirErroAuth } from '@/lib/erros'
import { supabase } from '@/lib/supabase'

const SEM_APP = 'Não achamos o app autenticador desta conta. Peça a quem administra o seu acesso para zerar a verificação.'

const comErro = (error) => ({ erro: traduzirErroAuth(error) })

async function listar() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data
}

// O app autenticador ativo (fator TOTP confirmado), ou null.
async function fatorAtivo() {
  return (await listar()).totp?.[0] ?? null
}

// Entrar: confirma o código do app (a sessão passa a aal2).
export async function confirmarCodigo(codigo) {
  try {
    const fator = await fatorAtivo()
    if (!fator) return { erro: SEM_APP }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo })
    return error ? comErro(error) : { erro: null }
  } catch (erro) {
    return comErro(erro)
  }
}

// Começa o cadastro do app: tira cadastros começados e não confirmados (o Auth não aceita dois com o mesmo nome e
// limita quantos ficam abertos) e devolve o QR code (imagem SVG pronta para <img>), a chave para digitar no app e o
// endereço otpauth://. Se um começado não sair, para aqui com o motivo (a pessoa tenta de novo).
export async function iniciarCadastro() {
  try {
    const { all = [] } = await listar()
    for (const fator of all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
      const { error: erroTirar } = await supabase.auth.mfa.unenroll({ factorId: fator.id })
      if (erroTirar) return comErro(erroTirar)
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'IXC Consult',
      friendlyName: `App autenticador ${new Date().toISOString()}`,
    })
    if (error) return comErro(error)
    return { erro: null, fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret, uri: data.totp.uri }
  } catch (erro) {
    return comErro(erro)
  }
}

// Termina o cadastro com o primeiro código do app (a sessão passa a aal2).
export async function concluirCadastro(fatorId, codigo) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo })
  return error ? comErro(error) : { erro: null }
}

// Desistiu no meio: o cadastro começado sai (se falhar, o próximo início limpa).
export async function cancelarCadastro(fatorId) {
  await supabase.auth.mfa.unenroll({ factorId: fatorId }).catch(() => {})
}

// Desativar (Meu perfil): confere um código atual e só então tira o app.
export async function desativarVerificacao(codigo) {
  try {
    const fator = await fatorAtivo()
    if (!fator) return { erro: SEM_APP }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo })
    if (error) return comErro(error)
    const { error: erroTirar } = await supabase.auth.mfa.unenroll({ factorId: fator.id })
    return erroTirar ? comErro(erroTirar) : { erro: null }
  } catch (erro) {
    return comErro(erro)
  }
}
