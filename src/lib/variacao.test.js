import { describe, expect, it } from 'vitest'
import { variacao } from './variacao'

describe('variacao (a linha "▲ 12% vs out." dos cartões)', () => {
  it('Realizado +12%: em %, verde porque subir é bom', () => {
    expect(variacao(1120, 1000, { tipo: 'percentual', unidade: 'h' })).toEqual({ texto: '▲ 12%', tom: 'bom', paraLeitor: 'subiu 12%' })
    expect(variacao(880, 1000, { tipo: 'percentual', unidade: 'h' })).toEqual({ texto: '▼ 12%', tom: 'ruim', paraLeitor: 'caiu 12%' })
  })

  it('anterior 0: sem base para o %, mostra a diferença em horas (ou em check-ins)', () => {
    expect(variacao(42.5, 0, { tipo: 'percentual', unidade: 'h' })).toEqual({ texto: '▲ 42,5 h', tom: 'bom', paraLeitor: 'subiu 42,5 h' })
    expect(variacao(7, 0, { tipo: 'percentual' })).toEqual({ texto: '▲ 7', tom: 'bom', paraLeitor: 'subiu 7' })
    expect(variacao(0, 0, { tipo: 'percentual', unidade: 'h' })).toEqual({ texto: '= igual', tom: 'neutro', paraLeitor: 'igual' })
  })

  it('pontos: 61% → 65% = ▲ 4 p.p. bom; 105% → 110% é ruim (acima de 100% subir é ruim)', () => {
    expect(variacao(0.65, 0.61, { tipo: 'pontos', limiteDoBom: 1 })).toEqual({ texto: '▲ 4 p.p.', tom: 'bom', paraLeitor: 'subiu 4 pontos percentuais' })
    expect(variacao(1.1, 1.05, { tipo: 'pontos', limiteDoBom: 1 })).toMatchObject({ texto: '▲ 5 p.p.', tom: 'ruim' })
    expect(variacao(1.05, 1.1, { tipo: 'pontos', limiteDoBom: 1 })).toMatchObject({ texto: '▼ 5 p.p.', tom: 'bom' })
    expect(variacao(0.61, 0.65, { tipo: 'pontos', limiteDoBom: 1 })).toMatchObject({ texto: '▼ 4 p.p.', tom: 'ruim' })
    expect(variacao(0.6, 0.6, { tipo: 'pontos', limiteDoBom: 1 })).toMatchObject({ texto: '= igual', tom: 'neutro' })
  })

  it('Aguardando subir é ruim (subirEhBom: false)', () => {
    expect(variacao(4, 2, { tipo: 'quantidade', subirEhBom: false })).toMatchObject({ texto: '▲ 2', tom: 'ruim' })
    expect(variacao(2, 4, { tipo: 'quantidade', subirEhBom: false })).toMatchObject({ texto: '▼ 2', tom: 'bom' })
  })

  it('quantidade: a diferença, com o % só quando o anterior tem 5 ou mais', () => {
    expect(variacao(15, 12, { tipo: 'quantidade' })).toEqual({ texto: '▲ 3 · 25%', tom: 'bom', paraLeitor: 'subiu 3 (25%)' })
    expect(variacao(4, 3, { tipo: 'quantidade' })).toEqual({ texto: '▲ 1', tom: 'bom', paraLeitor: 'subiu 1' })
    expect(variacao(1240, 1200, { tipo: 'quantidade' })).toMatchObject({ texto: '▲ 40 · 3%' })
    expect(variacao(1300, 1000, { tipo: 'quantidade' })).toMatchObject({ texto: '▲ 300 · 30%' })
    expect(variacao(10000, 8000, { tipo: 'quantidade' })).toMatchObject({ texto: '▲ 2.000 · 25%' })
  })

  it('igual = neutro (cinza), em todos os tipos; % que arredonda para 0 também', () => {
    for (const tipo of ['percentual', 'pontos', 'quantidade']) {
      expect(variacao(10, 10, { tipo }), tipo).toEqual({ texto: '= igual', tom: 'neutro', paraLeitor: 'igual' })
    }
    expect(variacao(1001, 1000, { tipo: 'percentual' })).toMatchObject({ texto: '= igual', tom: 'neutro' })
  })

  it('paraLeitor diz o sentido em palavras ("subiu 12%"), sem a seta', () => {
    expect(variacao(112, 100, { tipo: 'percentual' }).paraLeitor).toBe('subiu 12%')
    expect(variacao(0.5, 0.62, { tipo: 'pontos' }).paraLeitor).toBe('caiu 12 pontos percentuais')
    expect(variacao(3, 4, { tipo: 'quantidade' }).paraLeitor).toBe('caiu 1')
  })

  // Nulo, no CartoesDeNumeros, é "a comparação ainda carrega" ("—" para sempre); sem número (ex.: ocupação nula com
  // capacidade 0) o cartão fica sem a linha: undefined.
  it('sem um dos números, não há variação (undefined: o cartão fica sem a linha)', () => {
    expect(variacao(null, 10, { tipo: 'percentual' })).toBeUndefined()
    expect(variacao(10, undefined, { tipo: 'quantidade' })).toBeUndefined()
    expect(variacao(0.7, null, { tipo: 'pontos', limiteDoBom: 1 })).toBeUndefined()
    expect(variacao(Number.NaN, 3, { tipo: 'quantidade' })).toBeUndefined()
  })

  it('arredonda o meio para longe do zero nos dois sentidos (Math.round(-1,5) daria -1)', () => {
    // (0,1 − 0,115) × 100 = −1,5 exatos no ponto flutuante.
    expect(variacao(0.1, 0.115, { tipo: 'pontos' })).toMatchObject({ texto: '▼ 2 p.p.', paraLeitor: 'caiu 2 pontos percentuais' })
    expect(variacao(0.115, 0.1, { tipo: 'pontos' })).toMatchObject({ texto: '▲ 2 p.p.' })
    // 39 contra 40: −2,5% → 3%.
    expect(variacao(39, 40, { tipo: 'percentual' })).toMatchObject({ texto: '▼ 3%' })
    expect(variacao(41, 40, { tipo: 'percentual' })).toMatchObject({ texto: '▲ 3%' })
  })

  it('quantidade: sem o "· 0%" quando o percentual arredonda para 0', () => {
    expect(variacao(1001, 1000, { tipo: 'quantidade' })).toEqual({ texto: '▲ 1', tom: 'bom', paraLeitor: 'subiu 1' })
    expect(variacao(999, 1000, { tipo: 'quantidade', subirEhBom: false })).toEqual({ texto: '▼ 1', tom: 'bom', paraLeitor: 'caiu 1' })
  })
})
