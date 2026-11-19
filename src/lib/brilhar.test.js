import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brilhar, brilharPorMarca } from './brilhar'

describe('brilhar', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('põe .mudou e tira depois de 1,6 s', () => {
    const el = document.createElement('div')
    brilhar(el)
    expect(el.classList.contains('mudou')).toBe(true)
    vi.advanceTimersByTime(1599)
    expect(el.classList.contains('mudou')).toBe(true)
    vi.advanceTimersByTime(2)
    expect(el.classList.contains('mudou')).toBe(false)
  })

  it('não faz nada com reduzir movimento nem sem elemento', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const el = document.createElement('div')
    brilhar(el)
    brilhar(null)
    expect(el.classList.contains('mudou')).toBe(false)
  })

  it('brilharPorMarca acha o elemento pelo data-brilho', () => {
    document.body.innerHTML = '<div data-brilho="a1"></div>'
    brilharPorMarca('a1')
    expect(document.querySelector('[data-brilho="a1"]').classList.contains('mudou')).toBe(true)
  })
})
