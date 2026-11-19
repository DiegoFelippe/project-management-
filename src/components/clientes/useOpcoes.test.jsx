import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpcoes } from './useOpcoes'

const it_ = (id) => ({ id, nome: id, ocupacao: 0.1 })
function adiavel() {
  let resolver
  const promessa = new Promise((r) => { resolver = r })
  return { promessa, resolver }
}
afterEach(() => vi.useRealTimers())

describe('useOpcoes', () => {
  it('digitar durante um "Mostrar mais" em andamento não mistura resultados', async () => {
    vi.useFakeTimers()
    const pendente = adiavel()
    const carregar = vi.fn(async ({ busca, deslocamento }) => {
      if (deslocamento > 0) return pendente.promessa
      return busca ? { itens: [it_('novo')], total: 1 } : { itens: [it_('a'), it_('b')], total: 10 }
    })
    const { result } = renderHook(() => useOpcoes(carregar))
    await act(async () => {})
    act(() => { result.current.mostrarMais() })
    expect(result.current.carregandoMais).toBe(true)
    act(() => result.current.setBusca('x'))
    await act(async () => { vi.advanceTimersByTime(301) })
    expect(result.current.carregandoMais).toBe(false)
    expect(result.current.itens.map((i) => i.id)).toEqual(['novo'])
    await act(async () => { pendente.resolver({ itens: [it_('velho')], total: 10 }) })
    expect(result.current.itens.map((i) => i.id)).toEqual(['novo'])
    expect(result.current.total).toBe(1)
    expect(result.current.carregandoMais).toBe(false)
  })

  it('não repete ids ao juntar a próxima página e pede o deslocamento da lista atual', async () => {
    const carregar = vi.fn(async ({ deslocamento }) =>
      deslocamento === 0 ? { itens: [it_('a'), it_('b')], total: 4 } : { itens: [it_('b'), it_('c')], total: 4 })
    const { result } = renderHook(() => useOpcoes(carregar))
    await act(async () => {})
    await act(async () => { await result.current.mostrarMais() })
    expect(carregar).toHaveBeenLastCalledWith(expect.objectContaining({ deslocamento: 2 }))
    expect(result.current.itens.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})
