import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useListaPaginada } from './useListaPaginada'

const pagina = (itens, total = itens.length) => ({ itens, total })
// Promessa que a gente resolve na hora que quiser (resposta que chega fora de ordem).
function adiada() {
  let resolver
  const promessa = new Promise((r) => { resolver = r })
  return { promessa, resolver }
}

describe('useListaPaginada (lista paginada no banco)', () => {
  it('lê a página 1 com os parâmetros e devolve itens, total e a paginação da Tabela', async () => {
    const ler = vi.fn().mockResolvedValue(pagina(['a', 'b'], 31))
    const { result } = renderHook(() => useListaPaginada(ler, { busca: 'x' }))
    expect(result.current.resultado).toBeNull()
    await waitFor(() => expect(result.current.itens).toEqual(['a', 'b']))
    expect(ler).toHaveBeenCalledWith({ busca: 'x', pagina: 1 })
    expect(result.current.total).toBe(31)
    expect(result.current.paginacao).toMatchObject({ pagina: 1, total: 31 })
  })

  it('a paginação pede a página 2 ao banco', async () => {
    const ler = vi.fn().mockResolvedValue(pagina(['a'], 31))
    const { result } = renderHook(() => useListaPaginada(ler, { busca: '' }))
    await waitFor(() => expect(result.current.itens).toEqual(['a']))
    act(() => result.current.paginacao.aoMudar(2))
    await waitFor(() => expect(ler).toHaveBeenLastCalledWith({ busca: '', pagina: 2 }))
    expect(result.current.pagina).toBe(2)
  })

  it('mudou um filtro, volta para a página 1 (uma leitura só, já na página 1)', async () => {
    const ler = vi.fn().mockResolvedValue(pagina(['a'], 31))
    const { result, rerender } = renderHook(({ busca }) => useListaPaginada(ler, { busca }), { initialProps: { busca: '' } })
    await waitFor(() => expect(result.current.itens).toEqual(['a']))
    act(() => result.current.paginacao.aoMudar(3))
    await waitFor(() => expect(ler).toHaveBeenLastCalledWith({ busca: '', pagina: 3 }))
    ler.mockClear()
    rerender({ busca: 'sup' })
    await waitFor(() => expect(ler).toHaveBeenCalledWith({ busca: 'sup', pagina: 1 }))
    expect(ler).toHaveBeenCalledTimes(1)
    expect(result.current.pagina).toBe(1)
  })

  it('a página que deixou de existir (foraDaFaixa) volta para a 1', async () => {
    const ler = vi.fn(async ({ pagina: p }) => (p > 1 ? { itens: [], total: 15, foraDaFaixa: true } : pagina(['a'], 15)))
    const { result } = renderHook(() => useListaPaginada(ler, {}))
    await waitFor(() => expect(result.current.itens).toEqual(['a']))
    act(() => result.current.paginacao.aoMudar(2))
    await waitFor(() => expect(result.current.pagina).toBe(1))
    expect(ler).toHaveBeenLastCalledWith({ pagina: 1 })
    expect(result.current.itens).toEqual(['a'])
  })

  it('recarregar lê de novo a mesma página, sem voltar para a 1', async () => {
    const ler = vi.fn().mockResolvedValue(pagina(['a'], 31))
    const { result } = renderHook(() => useListaPaginada(ler, {}))
    await waitFor(() => expect(result.current.itens).toEqual(['a']))
    act(() => result.current.paginacao.aoMudar(2))
    await waitFor(() => expect(ler).toHaveBeenLastCalledWith({ pagina: 2 }))
    ler.mockClear()
    act(() => result.current.recarregar())
    await waitFor(() => expect(ler).toHaveBeenCalledWith({ pagina: 2 }))
  })

  it('a versão de fora (outra parte da tela mudou algo) também relê a mesma página', async () => {
    const ler = vi.fn().mockResolvedValue(pagina(['a'], 31))
    const { result, rerender } = renderHook(({ versao }) => useListaPaginada(ler, {}, { versao }), { initialProps: { versao: 0 } })
    await waitFor(() => expect(result.current.itens).toEqual(['a']))
    act(() => result.current.paginacao.aoMudar(2))
    await waitFor(() => expect(ler).toHaveBeenLastCalledWith({ pagina: 2 }))
    ler.mockClear()
    rerender({ versao: 1 })
    await waitFor(() => expect(ler).toHaveBeenCalledWith({ pagina: 2 }))
  })

  it('resposta velha (de um filtro que já mudou) é descartada', async () => {
    const velha = adiada()
    const ler = vi.fn(({ busca }) => (busca === 'velha' ? velha.promessa : Promise.resolve(pagina(['nova']))))
    const { result, rerender } = renderHook(({ busca }) => useListaPaginada(ler, { busca }), { initialProps: { busca: 'velha' } })
    rerender({ busca: 'nova' })
    await waitFor(() => expect(result.current.itens).toEqual(['nova']))
    await act(async () => velha.resolver(pagina(['velha'])))
    expect(result.current.itens).toEqual(['nova'])
  })

  it('enquanto o filtro novo carrega, a lista de antes continua; limparAoMudar some com ela (aba com outras colunas)', async () => {
    const segunda = adiada()
    const ler = vi.fn(({ aba }) => (aba === 'b' ? segunda.promessa : Promise.resolve(pagina([`de ${aba}`]))))
    const { result, rerender } = renderHook(({ aba, busca }) => useListaPaginada(ler, { aba, busca }, { limparAoMudar: ['aba'] }),
      { initialProps: { aba: 'a', busca: '' } })
    await waitFor(() => expect(result.current.itens).toEqual(['de a']))
    rerender({ aba: 'a', busca: 'x' })
    expect(result.current.itens).toEqual(['de a'])
    rerender({ aba: 'b', busca: 'x' })
    expect(result.current.resultado).toBeNull()
    await act(async () => segunda.resolver(pagina(['de b'])))
    expect(result.current.itens).toEqual(['de b'])
  })

  it('erro na leitura vira erro: true (a tela diz o quê); a próxima leitura que dá certo limpa', async () => {
    const ler = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(pagina(['a']))
    const { result } = renderHook(() => useListaPaginada(ler, {}))
    await waitFor(() => expect(result.current.erro).toBe(true))
    act(() => result.current.recarregar())
    await waitFor(() => expect(result.current.itens).toEqual(['a']))
    expect(result.current.erro).toBe(false)
  })

  it('parametros null não lê', async () => {
    const ler = vi.fn().mockResolvedValue(pagina([]))
    const { result } = renderHook(() => useListaPaginada(ler, null))
    await act(async () => {})
    expect(ler).not.toHaveBeenCalled()
    expect(result.current.resultado).toBeNull()
  })
})
