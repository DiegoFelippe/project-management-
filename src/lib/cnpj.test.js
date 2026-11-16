import { describe, expect, it } from 'vitest'
import { cnpjValido, formatarCnpj, normalizarCnpj } from './cnpj'

describe('cnpj', () => {
  it('valida com pontuação, e ignora espaços e minúsculas', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido(' 11222333000181 ')).toBe(true)
    expect(cnpjValido(' 11222333000182 ')).toBe(false)
    expect(cnpjValido('12.abc.345/01de-35')).toBe(true)
  })

  it('recusa tamanho errado, vazio e nulo', () => {
    expect(cnpjValido('')).toBe(false)
    expect(cnpjValido(null)).toBe(false)
    expect(cnpjValido('1122233300018')).toBe(false)
    expect(cnpjValido('11222333000181X')).toBe(false)
  })

  it('normaliza e formata', () => {
    expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35')
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })
})
