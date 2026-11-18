import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { fazerCheckin, fazerCheckout, tarefasDoCheckin } from '@/data/checkins'
import BotaoCheckin from './BotaoCheckin'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/data/checkins', () => ({ fazerCheckin: vi.fn(), fazerCheckout: vi.fn(), tarefasDoCheckin: vi.fn() }))

const cliente = { id: 'k1', nome: 'Alfa' }
const HORA = 3_600_000

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fazerCheckin).mockResolvedValue({ erro: null })
  vi.mocked(fazerCheckout).mockResolvedValue({ erro: null })
  vi.mocked(tarefasDoCheckin).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('BotaoCheckin', () => {
  it('sem check-in aberto: Fazer check-in chama fazerCheckin e avisa', async () => {
    const aoMudar = vi.fn()
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }))
    expect(fazerCheckin).toHaveBeenCalledWith('k1')
    expect(aoMudar).toHaveBeenCalled()
  })

  it('erro do banco no check-in não avisa a tela e mostra a mensagem', async () => {
    vi.mocked(fazerCheckin).mockResolvedValue({ erro: 'Você não é o consultor deste cliente.' })
    const aoMudar = vi.fn()
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }))
    expect(aoMudar).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Você não é o consultor deste cliente.')
  })

  it('com aberto neste cliente vira check-out com o tempo e atualiza a cada 30 s', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T12:00:00'), shouldAdvanceTime: true })
    const aberto = { id: 'a1', cliente_id: 'k1', inicio: new Date(Date.now() - HORA - 5 * 60_000).toISOString(), cliente: { nome: 'Alfa' } }
    render(<BotaoCheckin cliente={cliente} aberto={aberto} aoMudar={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Fazer check-out · 1 h 05' })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(30_000) })
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByRole('button', { name: 'Fazer check-out · 1 h 06' })).toBeInTheDocument()
  })

  it('check-out abre a janela, exige a descrição e chama fazerCheckout', async () => {
    const aoMudar = vi.fn()
    const aberto = { id: 'a1', cliente_id: 'k1', inicio: new Date(Date.now() - HORA).toISOString(), cliente: { nome: 'Alfa' } }
    render(<BotaoCheckin cliente={cliente} aberto={aberto} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: /Fazer check-out/ }))
    const janela = screen.getByRole('dialog', { name: 'Fazer check-out em Alfa' })
    expect(within(janela).getByLabelText('Fim')).toBeInTheDocument()
    await userEvent.click(within(janela).getByRole('button', { name: 'Fazer check-out' }))
    expect(fazerCheckout).not.toHaveBeenCalled()
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Migração')
    await userEvent.click(within(janela).getByRole('button', { name: 'Fazer check-out' }))
    expect(fazerCheckout).toHaveBeenCalledWith('a1', { fim: expect.any(String), descricao: 'Migração' })
    expect(Math.abs(new Date(vi.mocked(fazerCheckout).mock.calls[0][1].fim) - Date.now())).toBeLessThan(5_000)
    expect(aoMudar).toHaveBeenCalled()
  })

  it('com aberto em outro cliente fica desabilitado e descrito pelo aviso da tela', () => {
    const aberto = { id: 'a1', cliente_id: 'k9', inicio: new Date().toISOString(), cliente: { nome: 'Beta' } }
    render(
      <>
        <p id="aviso">Você está com check-in aberto em Beta.</p>
        <BotaoCheckin cliente={cliente} aberto={aberto} aoMudar={vi.fn()} idDoAviso="aviso" />
      </>,
    )
    const botao = screen.getByRole('button', { name: 'Fazer check-in' })
    expect(botao).toBeDisabled()
    expect(botao).toHaveAccessibleDescription('Você está com check-in aberto em Beta.')
  })

  it('sem check-in aberto não aponta para aviso nenhum', () => {
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={vi.fn()} idDoAviso="aviso" />)
    expect(screen.getByRole('button', { name: 'Fazer check-in' })).not.toHaveAttribute('aria-describedby')
  })
})
