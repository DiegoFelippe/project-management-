// Confere e normaliza o que chega do navegador. Campo inválido → 400 dados_invalidos { campo }.
import { Falha } from './http.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAPEIS_CRIAVEIS = ['central', 'admin', 'gestor', 'pessoa'] as const

export type Forma = 'convite' | 'senha'

export type DadosAcesso = {
  forma: Forma
  nome: string
  email: string
  papel: (typeof PAPEIS_CRIAVEIS)[number]
  times: string[]
  senha?: string
  redirectTo: string
  consultoria_id?: string
  ficha: Ficha
}

export type Ficha = {
  telefone?: string | null
  cidade?: string | null
  uf?: string | null
  cargo?: string | null
  data_entrada?: string | null
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function invalido(campo: string): never {
  throw new Falha(400, 'dados_invalidos', { campo })
}

export function validarNome(valor: unknown, campo = 'nome'): string {
  const nome = typeof valor === 'string' ? valor.trim() : ''
  if (nome.length < 2 || nome.length > 120) invalido(campo)
  return nome
}

export function validarEmail(valor: unknown, campo = 'email'): string {
  const email = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 254) invalido(campo)
  return email
}

export function validarForma(valor: unknown, campo = 'forma'): Forma {
  if (valor !== 'convite' && valor !== 'senha') invalido(campo)
  return valor
}

export function validarSenha(forma: Forma, valor: unknown, campo = 'senha'): string | undefined {
  if (forma !== 'senha') return undefined
  if (typeof valor !== 'string' || valor.length < 8 || valor.length > 72) invalido(campo)
  return valor
}

export function validarRedirect(valor: unknown): string {
  if (typeof valor !== 'string') invalido('redirectTo')
  try {
    const url = new URL(valor)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') invalido('redirectTo')
  } catch {
    invalido('redirectTo')
  }
  return valor
}

export function validarUuid(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !UUID.test(valor)) invalido(campo)
  return valor
}

// Texto opcional: ausente ou vazio → null; passou do limite → 400.
function textoOpcional(valor: unknown, campo: string, max: number): string | null {
  if (valor == null) return null
  if (typeof valor !== 'string') invalido(campo)
  const texto = valor.trim()
  if (!texto) return null
  if (texto.length > max) invalido(campo)
  return texto
}

export function validarUf(valor: unknown, campo = 'uf'): string | null {
  const uf = textoOpcional(valor, campo, 2)?.toUpperCase() ?? null
  if (uf && !UFS.includes(uf)) invalido(campo)
  return uf
}

// Data AAAA-MM-DD, real e não futura (hoje em São Paulo).
export function validarDataEntrada(valor: unknown, campo = 'data_entrada'): string | null {
  const texto = textoOpcional(valor, campo, 10)
  if (texto === null) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  if (!m) invalido(campo)
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) invalido(campo)
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  if (texto > hoje) invalido(campo)
  return texto
}

// Só os campos que vieram no corpo entram (assim "editar" não apaga o que não foi enviado).
export function validarFicha(corpo: Record<string, unknown>): Ficha {
  const ficha: Ficha = {}
  if (corpo.telefone !== undefined) ficha.telefone = textoOpcional(corpo.telefone, 'telefone', 30)
  if (corpo.cidade !== undefined) ficha.cidade = textoOpcional(corpo.cidade, 'cidade', 120)
  if (corpo.uf !== undefined) ficha.uf = validarUf(corpo.uf)
  if (corpo.cargo !== undefined) ficha.cargo = textoOpcional(corpo.cargo, 'cargo', 80)
  if (corpo.data_entrada !== undefined) ficha.data_entrada = validarDataEntrada(corpo.data_entrada)
  return ficha
}

export function validarAcesso(corpo: Record<string, unknown>): DadosAcesso {
  const forma = validarForma(corpo.forma)
  const papel = corpo.papel
  if (typeof papel !== 'string' || !(PAPEIS_CRIAVEIS as readonly string[]).includes(papel)) invalido('papel')

  const times = corpo.times ?? []
  if (!Array.isArray(times) || times.length > 50) invalido('times')
  for (const id of times) validarUuid(id, 'times')
  if (new Set(times).size !== times.length) invalido('times')

  return {
    forma,
    nome: validarNome(corpo.nome),
    email: validarEmail(corpo.email),
    papel: papel as DadosAcesso['papel'],
    times: times as string[],
    senha: validarSenha(forma, corpo.senha),
    redirectTo: validarRedirect(corpo.redirectTo),
    consultoria_id: corpo.consultoria_id == null ? undefined : validarUuid(corpo.consultoria_id, 'consultoria_id'),
    ficha: validarFicha(corpo),
  }
}
