import { describe, expect, it } from 'vitest'
import { deslocarMes, formatarDia, hoje, limitesDoMesEmSP, mesAtual, rotuloCurto, rotuloDoMes } from './mes'

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

  it('limites do mês: meia-noite do dia 1 em São Paulo, com o deslocamento do fuso', () => {
    expect(limitesDoMesEmSP('2026-11-01')).toEqual(['2026-11-01T00:00:00-03:00', '2026-12-01T00:00:00-03:00'])
    expect(limitesDoMesEmSP('2026-12-01')).toEqual(['2026-12-01T00:00:00-03:00', '2027-01-01T00:00:00-03:00'])
  })

  it('limites do mês: o deslocamento vem do fuso (horário de verão de 2018/2019), não fixo em -03:00', () => {
    expect(limitesDoMesEmSP('2018-10-01')).toEqual(['2018-10-01T00:00:00-03:00', '2018-11-01T00:00:00-03:00'])
    expect(limitesDoMesEmSP('2018-12-01')).toEqual(['2018-12-01T00:00:00-02:00', '2019-01-01T00:00:00-02:00'])
    expect(limitesDoMesEmSP('2019-02-01')).toEqual(['2019-02-01T00:00:00-02:00', '2019-03-01T00:00:00-03:00'])
  })

  it('limites do mês: o primeiro instante é do mês, o anterior é do mês passado', () => {
    for (const mes of ['2026-11-01', '2027-01-01', '2018-12-01', '2019-03-01']) {
      const [de, ate] = limitesDoMesEmSP(mes).map((t) => new Date(t).getTime())
      expect(mesAtual(new Date(de))).toBe(mes)
      expect(mesAtual(new Date(de - 1))).toBe(deslocarMes(mes, -1))
      expect(mesAtual(new Date(ate - 1))).toBe(mes)
      expect(mesAtual(new Date(ate))).toBe(deslocarMes(mes, 1))
    }
    expect(new Date(limitesDoMesEmSP('2026-12-01')[0]).toISOString()).toBe('2026-12-01T03:00:00.000Z')
  })

  it('hoje segue o fuso de São Paulo', () => {
    expect(hoje(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11-30')
    expect(hoje(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12-01')
  })
})

describe('rotuloCurto', () => {
  it('"2026-03-01" -> "mar/26"', () => {
    expect(rotuloCurto('2026-03-01')).toBe('mar/26')
    expect(rotuloCurto('2027-12-01')).toBe('dez/27')
  })
})
