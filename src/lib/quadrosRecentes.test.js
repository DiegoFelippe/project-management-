import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RECENTES_GUARDADOS, esquecerQuadro, lembrarQuadro, lerMemoria } from './quadrosRecentes'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const q = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('memória dos quadros (último e recentes, só ids, por pessoa)', () => {
  it('começa vazia', () => {
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [] })
  })

  it('lembrar guarda o último e põe na frente dos recentes, sem repetir', () => {
    lembrarQuadro(ANA, q(1))
    lembrarQuadro(ANA, q(2))
    lembrarQuadro(ANA, q(1))
    expect(lerMemoria(ANA)).toEqual({ ultimo: q(1), recentes: [q(1), q(2)] })
    expect(JSON.parse(localStorage.getItem(`ixc.quadros.${ANA}`))).toEqual({ ultimo: q(1), recentes: [q(1), q(2)] })
  })

  it('cada pessoa tem a sua (mesmo navegador, outro login)', () => {
    lembrarQuadro(ANA, q(1))
    lembrarQuadro(BIA, q(2))
    expect(lerMemoria(ANA)).toEqual({ ultimo: q(1), recentes: [q(1)] })
    expect(lerMemoria(BIA)).toEqual({ ultimo: q(2), recentes: [q(2)] })
  })

  it(`guarda até ${RECENTES_GUARDADOS} recentes (os mais novos)`, () => {
    expect(RECENTES_GUARDADOS).toBe(8)
    for (let n = 1; n <= 10; n += 1) lembrarQuadro(ANA, q(n))
    expect(lerMemoria(ANA).recentes).toEqual([q(10), q(9), q(8), q(7), q(6), q(5), q(4), q(3)])
  })

  it('esquecer tira dos recentes e do último', () => {
    lembrarQuadro(ANA, q(1))
    lembrarQuadro(ANA, q(2))
    esquecerQuadro(ANA, q(2))
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [q(1)] })
    esquecerQuadro(ANA, q(1))
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [] })
  })

  it('esquecer um que não é o último mantém o último', () => {
    lembrarQuadro(ANA, q(1))
    lembrarQuadro(ANA, q(2))
    esquecerQuadro(ANA, q(1))
    expect(lerMemoria(ANA)).toEqual({ ultimo: q(2), recentes: [q(2)] })
  })

  it('só aceita uuid: o que não é uuid não entra nem sai do que foi guardado (nome de quadro, lixo, HTML)', () => {
    lembrarQuadro(ANA, 'Quadro secreto')
    lembrarQuadro(ANA, '<img src=x>')
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [] })
    expect(localStorage.getItem(`ixc.quadros.${ANA}`)).toBeNull()
    localStorage.setItem(`ixc.quadros.${ANA}`, JSON.stringify({
      ultimo: 'Quadro secreto', recentes: [q(1), 'nome', 42, null, q(1), q(2), { id: q(3) }],
    }))
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [q(1), q(2)] })
  })

  it('o que foi guardado estragado (não é JSON, não é objeto, mais de 8) volta limpo', () => {
    localStorage.setItem(`ixc.quadros.${ANA}`, '{não é json')
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [] })
    localStorage.setItem(`ixc.quadros.${ANA}`, JSON.stringify([q(1)]))
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [] })
    localStorage.setItem(`ixc.quadros.${ANA}`, JSON.stringify({ ultimo: q(1), recentes: Array.from({ length: 12 }, (_, i) => q(i + 1)) }))
    expect(lerMemoria(ANA).recentes).toHaveLength(8)
  })

  it('sem a pessoa (ou com id que não é uuid), não lê nem grava', () => {
    expect(lembrarQuadro(null, q(1))).toEqual({ ultimo: null, recentes: [] })
    expect(lembrarQuadro('x', q(1))).toEqual({ ultimo: null, recentes: [] })
    expect(localStorage.length).toBe(0)
    expect(lerMemoria(undefined)).toEqual({ ultimo: null, recentes: [] })
  })

  it('sem armazenamento (aba anônima, bloqueado), a memória fica vazia e nada quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    expect(lerMemoria(ANA)).toEqual({ ultimo: null, recentes: [] })
    expect(() => lembrarQuadro(ANA, q(1))).not.toThrow()
    expect(() => esquecerQuadro(ANA, q(1))).not.toThrow()
  })

  it('lembrar e esquecer devolvem a memória nova', () => {
    expect(lembrarQuadro(ANA, q(1))).toEqual({ ultimo: q(1), recentes: [q(1)] })
    expect(esquecerQuadro(ANA, q(1))).toEqual({ ultimo: null, recentes: [] })
  })
})
