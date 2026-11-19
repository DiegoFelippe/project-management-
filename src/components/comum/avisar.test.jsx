import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { DURACAO_DO_AVISO } from './AvisoComAcoes'
import { avisar } from './avisar'

// O aviso fecha pelo toast.dismiss do sonner (o sumir da tela é dele).
const fechou = () => vi.mocked(toast.dismiss).mock.calls.length > 0
const montar = (endereco = '/inicio') => render(<MemoryRouter initialEntries={[endereco]}><Toaster /></MemoryRouter>)
const passar = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms) }) }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.spyOn(toast, 'dismiss')
})
afterEach(() => {
  vi.mocked(toast.dismiss).mockRestore()
  act(() => { toast.dismiss() })
  vi.useRealTimers()
})

describe('avisar (aviso com botões: usabilidade, U3 e U11)', () => {
  it('mostra o texto e as ações: o botão chama e fecha; "Ver cliente" é link para o cliente', async () => {
    const desfazer = vi.fn()
    montar()
    act(() => { avisar('Check-in feito em Alfa.', { acoes: [{ rotulo: 'Desfazer', aoClicar: desfazer }, { rotulo: 'Ver cliente', para: '/clientes/k1' }] }) })
    expect(await screen.findByText('Check-in feito em Alfa.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver cliente' })).toHaveAttribute('href', '/clientes/k1')
    const botao = screen.getByRole('button', { name: 'Desfazer' })
    expect(botao).toHaveClass('botao-animado')
    // fireEvent: o sonner usa setPointerCapture no toque, que o jsdom não tem.
    fireEvent.click(botao)
    expect(desfazer).toHaveBeenCalledTimes(1)
    expect(fechou()).toBe(true)
  })

  it('fica uns 10 s e fecha sozinho', async () => {
    montar()
    act(() => { avisar('Check-in feito em Alfa.', { acoes: [{ rotulo: 'Desfazer', aoClicar: vi.fn() }] }) })
    expect(await screen.findByText('Check-in feito em Alfa.')).toBeInTheDocument()
    await passar(DURACAO_DO_AVISO - 1_000)
    expect(fechou()).toBe(false)
    await passar(2_000)
    expect(fechou()).toBe(true)
  })

  it('o tempo para com o mouse em cima ou com o foco dentro, e volta a correr quando saem', async () => {
    montar()
    act(() => { avisar('Check-in feito em Alfa.', { acoes: [{ rotulo: 'Desfazer', aoClicar: vi.fn() }] }) })
    const caixa = (await screen.findByText('Check-in feito em Alfa.')).closest('[data-aviso-com-acoes]')
    fireEvent.mouseEnter(caixa)
    await passar(DURACAO_DO_AVISO * 3)
    expect(fechou()).toBe(false)
    fireEvent.mouseLeave(caixa)
    act(() => { screen.getByRole('button', { name: 'Desfazer' }).focus() })
    await passar(DURACAO_DO_AVISO * 3)
    expect(fechou()).toBe(false)
    act(() => { screen.getByRole('button', { name: 'Desfazer' }).blur() })
    await passar(DURACAO_DO_AVISO + 1_000)
    expect(fechou()).toBe(true)
  })

  it('"Ver cliente" não aparece na página do próprio cliente', async () => {
    montar('/clientes/k1')
    act(() => { avisar('Check-in feito em Alfa.', { acoes: [{ rotulo: 'Desfazer', aoClicar: vi.fn() }, { rotulo: 'Ver cliente', para: '/clientes/k1' }] }) })
    expect(await screen.findByText('Check-in feito em Alfa.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ver cliente' })).not.toBeInTheDocument()
  })
})
