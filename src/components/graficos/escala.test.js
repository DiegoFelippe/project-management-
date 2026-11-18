import { describe, expect, it } from 'vitest'
import { escalaBonita, formatarEixo, passoDosRotulos } from './escala'

describe('escala dos gráficos', () => {
  it('marcas redondas (0/500/1.000…), com o topo cobrindo o máximo', () => {
    expect(escalaBonita(1800)).toEqual({ topo: 2000, marcas: [0, 500, 1000, 1500, 2000] })
    expect(escalaBonita(1020 * 1.08)).toEqual({ topo: 1500, marcas: [0, 500, 1000, 1500] })
    expect(escalaBonita(480)).toEqual({ topo: 600, marcas: [0, 200, 400, 600] })
    expect(escalaBonita(34)).toEqual({ topo: 40, marcas: [0, 10, 20, 30, 40] })
    expect(escalaBonita(0.3).marcas).toEqual([0, 0.1, 0.2, 0.3])
    // Contagem (check-ins): passo inteiro.
    expect(escalaBonita(3, 4, true)).toEqual({ topo: 3, marcas: [0, 1, 2, 3] })
    // Tudo zero: uma marca acima do zero.
    expect(escalaBonita(0, 4, true).topo).toBeGreaterThan(0)
  })

  it('passo dos rótulos deixa 44 px entre eles (sempre cabe pelo menos um)', () => {
    for (const [n, largura] of [[24, 256], [24, 588], [105, 300], [6, 300], [31, 640]]) {
      const passo = passoDosRotulos(n, largura)
      expect(passo, `${n} em ${largura}`).toBeGreaterThanOrEqual(1)
      if (passo > 1) expect((largura / n) * passo, `${n} em ${largura}`).toBeGreaterThanOrEqual(44)
    }
    expect(passoDosRotulos(6, 600)).toBe(1)
    expect(passoDosRotulos(24, 256)).toBe(5)
    expect(passoDosRotulos(24, 256, 60)).toBe(6)
  })

  it('eixo: número em pt-BR com a unidade; "10 mil" a partir de 10.000', () => {
    expect(formatarEixo(0, 'h')).toBe('0 h')
    expect(formatarEixo(1500, 'h')).toBe('1.500 h')
    expect(formatarEixo(10000, 'h')).toBe('10 mil h')
    expect(formatarEixo(12500, '')).toBe('12,5 mil')
    expect(formatarEixo(2.5)).toBe('2,5')
  })
})
