// Senha forte: as mesmas regras do servidor (política do Auth e Edge Functions). Só A-Z, a-z, 0-9 e os símbolos da
// lista valem para cada tipo: letra acentuada e espaço não contam.
// Lista exata do GoTrue (`lower_upper_letters_digits_symbols`): !@#$%^&*()_+-=[]{};'\:"|<>?,./`~
export const SIMBOLOS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~'
const MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz'
const MAIUSCULAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const NUMEROS = '0123456789'

export const TAMANHO_MINIMO = 10
// Limite do Auth (bcrypt): 72 bytes em UTF-8. Letra com acento ocupa dois.
export const TAMANHO_MAXIMO = 72
export const TAMANHO_GERADO = 16

const bytes = (s) => new TextEncoder().encode(s).length

const REGRAS = [
  {
    id: 'tamanho', texto: `De ${TAMANHO_MINIMO} a ${TAMANHO_MAXIMO} caracteres`, falta: `pelo menos ${TAMANHO_MINIMO} caracteres`,
    ok: (s) => s.length >= TAMANHO_MINIMO && bytes(s) <= TAMANHO_MAXIMO,
  },
  { id: 'maiuscula', falta: 'uma letra maiúscula', ok: (s) => /[A-Z]/.test(s) },
  { id: 'minuscula', falta: 'uma letra minúscula', ok: (s) => /[a-z]/.test(s) },
  { id: 'numero', falta: 'um número', ok: (s) => /[0-9]/.test(s) },
  { id: 'simbolo', falta: 'um símbolo', ok: (s) => [...s].some((c) => SIMBOLOS.includes(c)) },
]

const maiuscula1 = (t) => t[0].toUpperCase() + t.slice(1)
export const NOME_DAS_FORCAS = { fraca: 'Fraca', media: 'Média', forte: 'Forte' }

export function avaliarSenha(senha = '') {
  const regras = REGRAS.map((r) => ({ id: r.id, texto: r.texto ?? maiuscula1(r.falta), falta: r.falta, ok: r.ok(senha) }))
  const cumpridas = regras.filter((r) => r.ok).length
  const espacoNasPontas = senha !== senha.trim()
  const longaDemais = bytes(senha) > TAMANHO_MAXIMO
  const forte = cumpridas === regras.length && !espacoNasPontas
  const forca = forte ? 'forte' : cumpridas >= 4 ? 'media' : 'fraca'
  return { regras, cumpridas, espacoNasPontas, longaDemais, forte, forca }
}

function listar(itens) {
  return itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

// A regra numa frase ("pelo menos 10 caracteres, uma letra maiúscula, … e um símbolo"), para os textos das telas e
// das mensagens de erro.
export const REGRA_DA_SENHA = listar(REGRAS.map((r) => r.falta))

// Uma frase para o botão Validar: está forte, ou o que falta.
export function mensagemDeValidacao(senha = '') {
  if (!senha) return 'Digite uma senha para validar.'
  const a = avaliarSenha(senha)
  if (a.forte) return 'Senha forte. Pode salvar.'
  // Longa demais: o tamanho não "falta", sobra.
  const faltam = a.regras.filter((r) => !r.ok && !(r.id === 'tamanho' && a.longaDemais)).map((r) => r.falta)
  const nome = a.forca === 'fraca' ? 'fraca' : 'média'
  const partes = []
  if (a.longaDemais) partes.push(`Senha longa demais: passa de ${TAMANHO_MAXIMO} caracteres (letra com acento conta como duas).`)
  if (faltam.length) partes.push(`Senha ${nome}. Falta: ${listar(faltam)}.`)
  if (a.espacoNasPontas) partes.push('Tem espaço no começo ou no fim: tire o espaço.')
  return partes.join(' ')
}

// Sorteio sem viés (rejeição) com crypto.getRandomValues.
function sortear(limite) {
  const faixa = Math.floor(0x100000000 / limite) * limite
  const v = new Uint32Array(1)
  do crypto.getRandomValues(v)
  while (v[0] >= faixa)
  return v[0] % limite
}

const escolher = (alfabeto) => alfabeto[sortear(alfabeto.length)]

// 16 caracteres com pelo menos um de cada tipo, embaralhados.
export function gerarSenha(tamanho = TAMANHO_GERADO) {
  const todos = MINUSCULAS + MAIUSCULAS + NUMEROS + SIMBOLOS
  const letras = [escolher(MINUSCULAS), escolher(MAIUSCULAS), escolher(NUMEROS), escolher(SIMBOLOS)]
  while (letras.length < tamanho) letras.push(escolher(todos))
  for (let i = letras.length - 1; i > 0; i -= 1) {
    const j = sortear(i + 1)
    ;[letras[i], letras[j]] = [letras[j], letras[i]]
  }
  return letras.join('')
}
