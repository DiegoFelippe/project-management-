// Conferência de formato na tela (usabilidade, U2): o banco continua com as regras dele. Cada função devolve a
// mensagem que vai embaixo do campo, ou null. Vazio passa (o campo é opcional), a não ser com `obrigatorio`.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MENSAGEM_DE_EMAIL = 'Digite um e-mail válido, como nome@empresa.com.br.'
export const MENSAGEM_DE_TELEFONE = 'Digite o telefone com DDD: 10 ou 11 números, como (49) 99988-7766.'

export function erroDeEmail(texto, { obrigatorio = false } = {}) {
  const limpo = String(texto ?? '').trim()
  if (!limpo) return obrigatorio ? MENSAGEM_DE_EMAIL : null
  return EMAIL.test(limpo) ? null : MENSAGEM_DE_EMAIL
}

// Telefone do Brasil com DDD: 10 números (fixo) ou 11 (celular), com ou sem parênteses, espaço e traço.
export function erroDeTelefone(texto) {
  const limpo = String(texto ?? '').trim()
  if (!limpo) return null
  if (/[^\d\s().-]/.test(limpo)) return MENSAGEM_DE_TELEFONE
  const numeros = limpo.replace(/\D/g, '').length
  return numeros === 10 || numeros === 11 ? null : MENSAGEM_DE_TELEFONE
}
