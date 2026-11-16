import { describe, expect, it } from 'vitest'
import { deslocarMes, formatarDia, hoje, mesAtual, rotuloDoMes } from './mes'

describe('mes', () => {
  it('desloca o mês atravessando o ano', () => {
    expect(deslocarMes('2026-12-01', 1)).toBe('2027-01-01')
    expect(deslocarMes('2027-01-01', -1)).toBe('2026-12-01')
    expect(deslocarMes('2026-01-01', -13)).toBe('2024-12-01')
  })

  it('o mês atual segue o fuso de São Paulo', () => {
    expect(mesAtual(new Date('2026-12-01T01:00:00Z'))).toBe('2026-11-01')
    expect(mesAtual(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12-01')
  })

  it('rótulos em português', () => {
    expect(rotuloDoMes('2026-11-01')).toBe('Novembro de 2026')
    expect(rotuloDoMes('2027-03-01')).toBe('Março de 2027')
    expect(formatarDia('2026-11-05')).toBe('05/11/2026')
  })

  it('hoje segue o fuso de São Paulo', () => {
    expect(hoje(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11-30')
    expect(hoje(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12-01')
  })
})
