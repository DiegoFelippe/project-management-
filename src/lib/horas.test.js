import { describe, expect, it } from 'vitest'
import { formatarHoras, formatarOcupacao, horasEntre, formatarDuracao } from './horas'

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

describe('formatarDuracao', () => {
  it('mostra minutos abaixo de uma hora e "h mm" a partir dela', () => {
    expect(formatarDuracao(5 * 60_000)).toBe('5 min')
    expect(formatarDuracao(65 * 60_000)).toBe('1 h 05')
    expect(formatarDuracao(-1000)).toBe('0 min')
  })
})
