import { describe, expect, it } from 'vitest'
import { formatarHoras, formatarOcupacao, horasEntre } from './horas'

describe('horas', () => {
  it('formata horas', () => {
    expect(formatarHoras(12.5)).toBe('12,5 h')
    expect(formatarHoras(0)).toBe('0 h')
    expect(formatarHoras(8)).toBe('8 h')
    expect(formatarHoras(null)).toBe('—')
  })

  it('formata a ocupação', () => {
    expect(formatarOcupacao(0.4187)).toBe('42%')
    expect(formatarOcupacao(0)).toBe('0%')
    expect(formatarOcupacao(null)).toBe('—')
  })

  it('calcula as horas entre duas datas', () => {
    expect(horasEntre(new Date('2026-11-16T10:00:00Z'), new Date('2026-11-16T12:30:00Z'))).toBe(2.5)
  })
})
