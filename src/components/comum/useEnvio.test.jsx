import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEnvio } from './useEnvio'

// Uma ação que só termina quando o teste manda (para ver o estado no meio do envio).
function acaoPendente() {
  let terminar
  const promessa = new Promise((resolver) => { terminar = resolver })
  return { acao: vi.fn(() => promessa), terminar }
}

describe('useEnvio', () => {
  it('começa sem erro e sem enviar', () => {
    const { result } = renderHook(() => useEnvio(vi.fn()))
    expect(result.current.erro).toBeNull()
    expect(result.current.enviando).toBe(false)
  })

  it('durante o envio marca "enviando" e limpa o erro; ao dar certo, chama aoConcluir e devolve true', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    act(() => result.current.setErro('Use pelo menos 2 caracteres.'))
    const { acao, terminar } = acaoPendente()
    let envio
    act(() => { envio = result.current.enviar(acao) })
    expect(result.current.enviando).toBe(true)
    expect(result.current.erro).toBeNull()
    expect(aoConcluir).not.toHaveBeenCalled()
    let deuCerto
    await act(async () => {
      terminar({ erro: null })
      deuCerto = await envio
    })
    expect(deuCerto).toBe(true)
    expect(result.current.enviando).toBe(false)
    expect(aoConcluir).toHaveBeenCalledTimes(1)
  })

  it('resposta sem nada (undefined) também conta como sucesso', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    await act(async () => { await result.current.enviar(async () => undefined) })
    expect(aoConcluir).toHaveBeenCalledTimes(1)
  })

  it('com { erro }, mostra o erro, não chama aoConcluir e devolve false', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    let deuCerto
    await act(async () => { deuCerto = await result.current.enviar(async () => ({ erro: 'Já existe um time com esse nome.' })) })
    expect(deuCerto).toBe(false)
    expect(result.current.erro).toBe('Já existe um time com esse nome.')
    expect(result.current.enviando).toBe(false)
    expect(aoConcluir).not.toHaveBeenCalled()
  })

  it('sem aoConcluir, só devolve o resultado', async () => {
    const { result } = renderHook(() => useEnvio())
    let deuCerto
    await act(async () => { deuCerto = await result.current.enviar(async () => ({ erro: null })) })
    expect(deuCerto).toBe(true)
  })

  it('um segundo envio enquanto o primeiro roda é ignorado', async () => {
    const { result } = renderHook(() => useEnvio(vi.fn()))
    const { acao, terminar } = acaoPendente()
    let primeiro
    let segundo
    act(() => {
      primeiro = result.current.enviar(acao)
      segundo = result.current.enviar(acao)
    })
    expect(acao).toHaveBeenCalledTimes(1)
    await act(async () => {
      terminar({ erro: null })
      await primeiro
    })
    expect(await segundo).toBe(false)
  })

  it('se a ação falhar, os botões voltam e a falha segue para quem chamou', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    await act(async () => {
      await expect(result.current.enviar(() => Promise.reject(new Error('sem rede')))).rejects.toThrow('sem rede')
    })
    expect(result.current.enviando).toBe(false)
    expect(aoConcluir).not.toHaveBeenCalled()
    // E dá para enviar de novo.
    await act(async () => { await result.current.enviar(async () => ({ erro: null })) })
    expect(aoConcluir).toHaveBeenCalledTimes(1)
  })
})
