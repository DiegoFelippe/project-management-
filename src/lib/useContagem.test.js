import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useContagem } from './useContagem'

const reduzirMovimento = () => vi.stubGlobal('matchMedia', vi.fn((consulta) => ({
  matches: consulta.includes('reduce'), media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn(),
})))
const avancar = (ms) => act(() => vi.advanceTimersByTime(ms))
const contar = (props) => renderHook(({ numero, chave, atraso }) => useContagem(numero, { chave, atraso }), { initialProps: props })

beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useContagem', () => {
  it('começa em 0 e corre até o número em 900 ms, rápido no começo (easeOutCubic)', () => {
    const { result } = contar({ numero: 1000, chave: '2026-11' })
    expect(result.current).toBe(0)
    avancar(450)
    // Na metade do tempo já passou bem da metade do caminho (1 − 0,5³ = 87,5%).
    expect(result.current).toBeGreaterThan(800)
    expect(result.current).toBeLessThan(950)
    avancar(500)
    expect(result.current).toBe(1000)
  })

  it('nulo (carregando) fica nulo; conta quando o número chega', () => {
    const { result, rerender } = contar({ numero: null, chave: '2026-11' })
    expect(result.current).toBeNull()
    rerender({ numero: 40, chave: '2026-11' })
    expect(result.current).toBe(0)
    avancar(1000)
    expect(result.current).toBe(40)
  })

  it('com a mesma chave (releitura do mesmo período) o número novo aparece direto, sem contar de novo', () => {
    const { result, rerender } = contar({ numero: 40, chave: '2026-11' })
    avancar(1000)
    rerender({ numero: 41, chave: '2026-11' })
    expect(result.current).toBe(41)
    avancar(16)
    expect(result.current).toBe(41)
  })

  it('chave nova (outro período) conta de novo do zero', () => {
    const { result, rerender } = contar({ numero: 40, chave: '2026-11' })
    avancar(1000)
    rerender({ numero: 25, chave: '2026-10' })
    expect(result.current).toBe(0)
    avancar(1000)
    expect(result.current).toBe(25)
  })

  it('atraso: fica em 0 até ele passar', () => {
    const { result } = contar({ numero: 100, chave: 'a', atraso: 240 })
    avancar(200)
    expect(result.current).toBe(0)
    avancar(300)
    expect(result.current).toBeGreaterThan(0)
    avancar(1000)
    expect(result.current).toBe(100)
  })

  it('"reduzir movimento": o número direto, sem contar', () => {
    reduzirMovimento()
    const { result } = contar({ numero: 1000, chave: '2026-11' })
    expect(result.current).toBe(1000)
  })
})
