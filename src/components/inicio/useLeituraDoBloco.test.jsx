import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLeituraDoBloco } from './useLeituraDoBloco'

// Promessa que o teste resolve quando quer.
function pedido() {
  let resolver
  let rejeitar
  const promessa = new Promise((sim, nao) => {
    resolver = sim
    rejeitar = nao
  })
  return { promessa, resolver, rejeitar }
}

describe('useLeituraDoBloco', () => {
  it('carregando, depois os dados; ao trocar os parâmetros, os de antes ficam (atualizando) até chegar o novo', async () => {
    const primeiro = pedido()
    const segundo = pedido()
    const ler = vi.fn().mockReturnValueOnce(primeiro.promessa).mockReturnValueOnce(segundo.promessa)
    const { result, rerender } = renderHook(({ p }) => useLeituraDoBloco(ler, p), { initialProps: { p: { mes: 'out' } } })
    expect(result.current).toEqual({ carregando: true })
    primeiro.resolver({ n: 1 })
    await waitFor(() => expect(result.current).toEqual({ dados: { n: 1 } }))

    rerender({ p: { mes: 'nov' } })
    expect(result.current).toEqual({ dados: { n: 1 }, atualizando: true })
    segundo.resolver({ n: 2 })
    await waitFor(() => expect(result.current).toEqual({ dados: { n: 2 } }))
    expect(ler).toHaveBeenLastCalledWith({ mes: 'nov' })
  })

  it('erro: só o erro (nada dos dados de antes); parâmetros nulos não leem', async () => {
    const ler = vi.fn().mockResolvedValueOnce({ n: 1 }).mockRejectedValueOnce(new Error('x'))
    const { result, rerender } = renderHook(({ p }) => useLeituraDoBloco(ler, p), { initialProps: { p: { mes: 'out' } } })
    await waitFor(() => expect(result.current).toEqual({ dados: { n: 1 } }))
    rerender({ p: { mes: 'nov' } })
    await waitFor(() => expect(result.current).toEqual({ erro: true }))

    const nada = vi.fn()
    const { result: semLer } = renderHook(() => useLeituraDoBloco(nada, null))
    expect(semLer.current).toEqual({ carregando: false })
    expect(nada).not.toHaveBeenCalled()
  })
})
