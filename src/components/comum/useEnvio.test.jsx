import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FALHA_NO_ENVIO, useEnvio } from './useEnvio'

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
    expect(result.current.erros).toEqual({})
    expect(result.current.enviando).toBe(false)
  })

  // Usabilidade, U2: os erros da tela vão todos de uma vez, cada um para o seu campo.
  it('conferir: guarda os erros dos campos, limpa o aviso de antes e diz se pode enviar', () => {
    const { result } = renderHook(() => useEnvio(vi.fn()))
    act(() => result.current.setErro('O servidor recusou.'))
    let pode
    act(() => { pode = result.current.conferir({ nome: 'Use pelo menos 2 caracteres.', email: 'Digite um e-mail válido.' }) })
    expect(pode).toBe(false)
    expect(result.current.erros).toEqual({ nome: 'Use pelo menos 2 caracteres.', email: 'Digite um e-mail válido.' })
    expect(result.current.erro).toBeNull()
    act(() => { pode = result.current.conferir({}) })
    expect(pode).toBe(true)
    expect(result.current.erros).toEqual({})
  })

  it('conferir com os mesmos erros cria outro objeto (a janela leva o foco ao primeiro de novo)', () => {
    const { result } = renderHook(() => useEnvio(vi.fn()))
    act(() => { result.current.conferir({ nome: 'x' }) })
    const antes = result.current.erros
    act(() => { result.current.conferir({ nome: 'x' }) })
    expect(result.current.erros).not.toBe(antes)
    expect(result.current.erros).toEqual(antes)
  })

  it('com { erros } (o servidor recusou um campo), marca os campos, não conclui e devolve false', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    let deuCerto
    await act(async () => { deuCerto = await result.current.enviar(async () => ({ erros: { senha: 'A senha não foi aceita.' } })) })
    expect(deuCerto).toBe(false)
    expect(result.current.erros).toEqual({ senha: 'A senha não foi aceita.' })
    expect(result.current.erro).toBeNull()
    expect(aoConcluir).not.toHaveBeenCalled()
  })

  it('{ erros } junto com { erro }: os dois aparecem', async () => {
    const { result } = renderHook(() => useEnvio(vi.fn()))
    await act(async () => { await result.current.enviar(async () => ({ erro: 'Confira os campos.', erros: { nome: 'Já existe.' } })) })
    expect(result.current.erro).toBe('Confira os campos.')
    expect(result.current.erros).toEqual({ nome: 'Já existe.' })
  })

  it('um envio novo limpa os erros dos campos; { erros: {} } vazio conta como sucesso', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    act(() => { result.current.conferir({ nome: 'x' }) })
    await act(async () => { await result.current.enviar(async () => ({ erro: null, erros: {} })) })
    expect(result.current.erros).toEqual({})
    expect(aoConcluir).toHaveBeenCalledTimes(1)
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

  it('uma ação que lança sem ser promessa também vira o aviso, e o erro fica no console (um defeito deixa rastro)', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useEnvio(vi.fn()))
    const falha = new Error('quebrou')
    let deuCerto
    await act(async () => { deuCerto = await result.current.enviar(() => { throw falha }) })
    expect(deuCerto).toBe(false)
    expect(result.current.erro).toBe(FALHA_NO_ENVIO)
    expect(consola).toHaveBeenCalledWith(falha)
    consola.mockRestore()
  })

  it('se a ação lançar (sem rede), mostra o aviso de falha, devolve false, os botões voltam e nada é relançado', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    let deuCerto
    await act(async () => { deuCerto = await result.current.enviar(() => Promise.reject(new TypeError('Failed to fetch'))) })
    expect(deuCerto).toBe(false)
    expect(result.current.erro).toBe('Não deu para salvar. Tente de novo.')
    expect(result.current.erro).toBe(FALHA_NO_ENVIO)
    expect(result.current.enviando).toBe(false)
    expect(aoConcluir).not.toHaveBeenCalled()
    // E dá para enviar de novo.
    await act(async () => { await result.current.enviar(async () => ({ erro: null })) })
    expect(aoConcluir).toHaveBeenCalledTimes(1)
    consola.mockRestore()
  })
})
