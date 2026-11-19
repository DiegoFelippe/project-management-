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

  it('cada conferir com erro soma uma tentativa (a janela leva o foco ao primeiro campo só nessa hora)', () => {
    const { result } = renderHook(() => useEnvio(vi.fn()))
    expect(result.current.tentativa).toBe(0)
    act(() => { result.current.conferir({ nome: 'x' }) })
    act(() => { result.current.conferir({ nome: 'x' }) })
    expect(result.current.tentativa).toBe(2)
    act(() => { result.current.conferir({}) })
    expect(result.current.tentativa).toBe(2)
  })

  it('com validar, os erros só aparecem depois do primeiro Salvar e, dali em diante, acompanham a tela', () => {
    const { result, rerender } = renderHook(({ nome }) => useEnvio(vi.fn(), { validar: () => (nome.length < 2 ? { nome: 'Curto.' } : {}) }),
      { initialProps: { nome: '' } })
    expect(result.current.erros).toEqual({})
    let pode
    act(() => { pode = result.current.conferir() })
    expect(pode).toBe(false)
    expect(result.current.erros).toEqual({ nome: 'Curto.' })
    rerender({ nome: 'Ana' })
    expect(result.current.erros).toEqual({})
    expect(result.current.tentativa).toBe(1)
    rerender({ nome: 'A' })
    expect(result.current.erros).toEqual({ nome: 'Curto.' })
  })

  it('limpar zera os erros e o aviso (a janela que fica montada volta ao começo)', () => {
    const { result } = renderHook(() => useEnvio(vi.fn(), { validar: () => ({ nome: 'Curto.' }) }))
    act(() => { result.current.conferir() })
    act(() => result.current.setErro('Falhou.'))
    act(() => result.current.limpar())
    expect(result.current.erros).toEqual({})
    expect(result.current.erro).toBeNull()
  })

  it('com { erros } (o servidor recusou um campo), marca os campos, não conclui e devolve false', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    let deuCerto
    await act(async () => { deuCerto = await result.current.enviar(async () => ({ erros: { senha: 'A senha não foi aceita.' } })) })
    expect(deuCerto).toBe(false)
    expect(result.current.erros).toEqual({ senha: 'A senha não foi aceita.' })
    expect(result.current.erro).toBeNull()
    expect(result.current.tentativa).toBe(1)
    expect(aoConcluir).not.toHaveBeenCalled()
  })

  it('{ erros } junto com { erro }: os dois aparecem', async () => {
    const { result } = renderHook(() => useEnvio(vi.fn()))
    await act(async () => { await result.current.enviar(async () => ({ erro: 'Confira os campos.', erros: { nome: 'Já existe.' } })) })
    expect(result.current.erro).toBe('Confira os campos.')
    expect(result.current.erros).toEqual({ nome: 'Já existe.' })
  })

  // Revisão do lote F: o campo recusado pelo servidor volta ao normal quando a pessoa muda o valor dele.
  it('com valores, o erro que o servidor deu num campo some quando o valor daquele campo muda (o dos outros fica)', async () => {
    const { result, rerender } = renderHook(({ valores }) => useEnvio(vi.fn(), { valores }),
      { initialProps: { valores: { nome: 'Alfa', email: 'a@b.co' } } })
    await act(async () => { await result.current.enviar(async () => ({ erros: { nome: 'Já existe.', email: 'Recusado.' } })) })
    expect(result.current.erros).toEqual({ nome: 'Já existe.', email: 'Recusado.' })
    rerender({ valores: { nome: 'Alfa', email: 'a@b.co' } })
    expect(result.current.erros).toEqual({ nome: 'Já existe.', email: 'Recusado.' })
    rerender({ valores: { nome: 'Beta', email: 'a@b.co' } })
    expect(result.current.erros).toEqual({ email: 'Recusado.' })
    rerender({ valores: { nome: 'Alfa', email: 'a@b.co' } })
    expect(result.current.erros).toEqual({ nome: 'Já existe.', email: 'Recusado.' })
  })

  it('um envio novo limpa os erros que o servidor deu; { erros: {} } vazio conta como sucesso', async () => {
    const aoConcluir = vi.fn()
    const { result } = renderHook(() => useEnvio(aoConcluir))
    await act(async () => { await result.current.enviar(async () => ({ erros: { nome: 'Já existe.' } })) })
    expect(result.current.erros).toEqual({ nome: 'Já existe.' })
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
