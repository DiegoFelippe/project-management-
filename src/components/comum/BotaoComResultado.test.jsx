import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BotaoComResultado from './BotaoComResultado'

describe('BotaoComResultado', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('carrega por pelo menos 300 ms, mostra o rótulo feito por 2 s e volta', async () => {
    const acao = vi.fn().mockResolvedValue({})
    render(<BotaoComResultado acao={acao} rotulo="Testar" />)
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }))
    expect(screen.getByRole('button')).toHaveAttribute('data-estado', 'indo')
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(screen.getByRole('button')).toHaveAttribute('data-estado', 'indo')
    await act(async () => { await vi.advanceTimersByTimeAsync(250) })
    expect(screen.getByRole('button', { name: '✓ Salvo' })).toHaveAttribute('data-estado', 'feito')
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(screen.getByRole('button', { name: 'Testar' })).not.toHaveAttribute('data-estado')
  })

  it('erro volta ao rótulo e avisa', async () => {
    const aoErro = vi.fn()
    render(<BotaoComResultado acao={() => Promise.resolve({ erro: 'Falhou' })} rotulo="Testar" aoErro={aoErro} />)
    fireEvent.click(screen.getByRole('button'))
    await act(async () => { await vi.advanceTimersByTimeAsync(400) })
    expect(aoErro).toHaveBeenCalledWith('Falhou')
    expect(screen.getByRole('button', { name: 'Testar' })).not.toHaveAttribute('data-estado')
  })

  it('não muda a largura: o rótulo fica numa grade com o feito escondido', async () => {
    render(<BotaoComResultado acao={() => Promise.resolve({})} rotulo="Testar" rotuloFeito="✓ Testado" />)
    expect(screen.getByRole('button').textContent).toContain('Testar')
    expect(screen.getByRole('button').querySelector('[aria-hidden="true"]')?.textContent).toBe('✓ Testado')
  })
})
