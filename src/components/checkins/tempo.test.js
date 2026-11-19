import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { minutosFeitos, relogio, segundosDaTarefa, useAgora } from './tempo'

describe('tempo da tarefa', () => {
  it('relogio: "mm:ss" e, com hora, "h:mm:ss"', () => {
    expect(relogio(0)).toBe('00:00')
    expect(relogio(312)).toBe('05:12')
    expect(relogio(3 * 3600 + 5 * 60 + 9)).toBe('3:05:09')
  })

  it('minutosFeitos: "menos de 1 min", "12 min" e "1 h 05"', () => {
    expect(minutosFeitos(30)).toBe('menos de 1 min')
    expect(minutosFeitos(12 * 60 + 59)).toBe('12 min')
    expect(minutosFeitos(65 * 60)).toBe('1 h 05')
  })

  it('segundosDaTarefa: o que o banco contou e, com o trecho aberto, o que passou desde a leitura (no relógio daqui)', () => {
    const lido = Date.UTC(2026, 10, 18, 17, 0, 0)
    const correndo = { tempo_segundos: 600, trecho_aberto_desde: '2026-11-18T16:55:00Z', lido_em: lido }
    expect(segundosDaTarefa(correndo, lido + 12_500)).toBe(612)
    // Relógio daqui atrás do da leitura: nunca anda para trás.
    expect(segundosDaTarefa(correndo, lido - 5_000)).toBe(600)
    expect(segundosDaTarefa({ tempo_segundos: 720, trecho_aberto_desde: null }, lido + 60_000)).toBe(720)
    expect(segundosDaTarefa({}, lido)).toBe(0)
  })
})

describe('useAgora', () => {
  afterEach(() => vi.restoreAllMocks())

  it('um relógio só para a tela toda: vários relógios ligados usam um intervalo; o último a sair o desliga', () => {
    const liga = vi.spyOn(globalThis, 'setInterval')
    const desliga = vi.spyOn(globalThis, 'clearInterval')
    const a = renderHook(() => useAgora(true))
    const b = renderHook(() => useAgora(true))
    const parado = renderHook(() => useAgora(false))
    expect(liga).toHaveBeenCalledTimes(1)
    expect(typeof a.result.current).toBe('number')
    a.unmount()
    expect(desliga).not.toHaveBeenCalled()
    b.unmount()
    parado.unmount()
    expect(desliga).toHaveBeenCalledTimes(1)
  })
})
