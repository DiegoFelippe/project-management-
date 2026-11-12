// Confere e normaliza o que chega do navegador. Campo inválido → 400 dados_invalidos { campo }.
import { Falha } from './http.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PAPEIS_CRIAVEIS = ['admin', 'gestor', 'pessoa'] as const

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
}

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
  }
}
