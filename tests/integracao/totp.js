// Código do app autenticador (TOTP, RFC 6238: HMAC-SHA1, 30 s, 6 dígitos) calculado a partir do segredo que o
// Auth devolve ao cadastrar. Só para os testes de integração fazerem o papel do celular.
import { createHmac } from 'node:crypto'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function deBase32(texto) {
  let bits = ''
  for (const c of texto.replace(/=+$/, '').toUpperCase()) {
    const valor = BASE32.indexOf(c)
    if (valor < 0) throw new Error(`Segredo TOTP inválido: ${c}`)
    bits += valor.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function codigoTotp(segredo, agora = Date.now()) {
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(Math.floor(agora / 1000 / 30)))
  const hmac = createHmac('sha1', deBase32(segredo)).update(contador).digest()
  const inicio = hmac[hmac.length - 1] & 0xf
  return String((hmac.readUInt32BE(inicio) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

// Cadastra o app autenticador na sessão do cliente e confirma com o código (a sessão vira aal2).
export async function ativarVerificacao(cliente) {
  const { data, error } = await cliente.auth.mfa.enroll({ factorType: 'totp', issuer: 'IXC Consult' })
  if (error) throw error
  await confirmarCodigo(cliente, data.id, data.totp.secret)
  return { fatorId: data.id, segredo: data.totp.secret }
}

// Confirma o código numa sessão aal1 de quem já tem o app (a sessão vira aal2).
export async function confirmarCodigo(cliente, fatorId, segredo) {
  const { error } = await cliente.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigoTotp(segredo) })
  if (error) throw error
}

export async function nivelDaSessao(cliente) {
  const { data } = await cliente.auth.getSession()
  return JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url')).aal
}
