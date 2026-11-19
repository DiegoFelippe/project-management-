import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { avisar } from '@/components/comum/avisar'
import { apagarCheckin, fazerCheckin, fazerCheckout, tarefasDoCheckin } from '@/data/checkins'
import { avisarQueOCheckinMudou } from '@/lib/checkinMudou'
import BotaoCheckin from './BotaoCheckin'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/comum/avisar', () => ({ avisar: vi.fn() }))
vi.mock('@/data/checkins', () => ({ fazerCheckin: vi.fn(), fazerCheckout: vi.fn(), tarefasDoCheckin: vi.fn(), apagarCheckin: vi.fn() }))

const cliente = { id: 'k1', nome: 'Alfa' }
const HORA = 3_600_000

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fazerCheckin).mockResolvedValue({ erro: null, id: 'c9' })
  vi.mocked(apagarCheckin).mockResolvedValue({ erro: null })
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

  it('o aviso do check-in traz Desfazer (apaga o check-in recém-feito) e Ver cliente (usabilidade, U3)', async () => {
    const aoMudar = vi.fn()
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }))
    expect(avisar).toHaveBeenCalledWith('Check-in feito em Alfa.', {
      acoes: [{ rotulo: 'Desfazer', aoClicar: expect.any(Function) }, { rotulo: 'Ver cliente', para: '/clientes/k1' }],
    })
    await act(() => vi.mocked(avisar).mock.calls[0][1].acoes[0].aoClicar())
    expect(apagarCheckin).toHaveBeenCalledWith('c9')
    expect(toast.success).toHaveBeenCalledWith('Check-in desfeito em Alfa.')
    expect(aoMudar).toHaveBeenCalledTimes(2)
  })

  it('Desfazer recusado pelo banco mostra a mensagem e não recarrega de novo', async () => {
    vi.mocked(apagarCheckin).mockResolvedValue({ erro: 'Você não tem permissão para isso.' })
    const aoMudar = vi.fn()
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }))
    await act(() => vi.mocked(avisar).mock.calls[0][1].acoes[0].aoClicar())
    expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para isso.')
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('enquanto grava, o botão diz "Fazendo check-in…" (usabilidade, U11)', async () => {
    let responder
    vi.mocked(fazerCheckin).mockReturnValue(new Promise((r) => { responder = r }))
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }))
    expect(screen.getByRole('button', { name: 'Fazendo check-in…' })).toBeDisabled()
    await act(async () => responder({ erro: null, id: 'c9' }))
    expect(screen.getByRole('button', { name: 'Fazer check-in' })).toBeEnabled()
  })

  it('tempo esgotado: o aviso diz que o check-in não foi feito e traz "Tentar de novo" (usabilidade, U11)', async () => {
    const demorou = 'O sistema demorou para responder. O check-in não foi feito; tente de novo.'
    vi.mocked(fazerCheckin).mockResolvedValueOnce({ erro: demorou, tempoEsgotado: true })
    const aoMudar = vi.fn()
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={aoMudar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fazer check-in' }))
    expect(avisar).toHaveBeenCalledWith(demorou, { erro: true, acoes: [{ rotulo: 'Tentar de novo', aoClicar: expect.any(Function) }] })
    expect(toast.error).not.toHaveBeenCalled()
    expect(aoMudar).not.toHaveBeenCalled()
    await act(() => vi.mocked(avisar).mock.calls[0][1].acoes[0].aoClicar())
    expect(fazerCheckin).toHaveBeenCalledTimes(2)
    expect(avisar).toHaveBeenLastCalledWith('Check-in feito em Alfa.', expect.anything())
    expect(aoMudar).toHaveBeenCalledTimes(1)
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

  it('compacto: só o ícone, com o nome do cliente no aria-label e no title', async () => {
    const aoMudar = vi.fn()
    render(<BotaoCheckin compacto cliente={{ id: 'k1', nome: 'Conecta Fibra' }} aberto={null} aoMudar={aoMudar} />)
    const botao = screen.getByRole('button', { name: 'Fazer check-in em Conecta Fibra' })
    expect(botao).toHaveAttribute('title', 'Fazer check-in em Conecta Fibra')
    expect(screen.queryByRole('button', { name: /Fazendo/ })).not.toBeInTheDocument()
    expect(botao).toHaveTextContent('')
    expect(botao.querySelector('svg')).not.toBeNull()
    await userEvent.click(botao)
    expect(fazerCheckin).toHaveBeenCalledWith('k1')
    expect(aoMudar).toHaveBeenCalled()
  })

  it('compacto com o check-in aberto nele: check-out com o tempo no nome; desabilitado e descrito pelo aviso com outro aberto', async () => {
    const inicio = new Date(Date.now() - HORA - 5 * 60_000).toISOString()
    const { rerender } = render(
      <BotaoCheckin compacto cliente={{ id: 'k1', nome: 'Conecta Fibra' }} aberto={{ id: 'a1', cliente_id: 'k1', inicio }} aoMudar={vi.fn()} />,
    )
    const saida = screen.getByRole('button', { name: 'Fazer check-out de Conecta Fibra · 1 h 05' })
    expect(saida).toHaveAttribute('title', 'Fazer check-out de Conecta Fibra · 1 h 05')
    expect(saida).toHaveTextContent('')
    await userEvent.click(saida)
    expect(screen.getByRole('dialog', { name: 'Fazer check-out em Conecta Fibra' })).toBeInTheDocument()

    rerender(
      <>
        <p id="aviso">Você está com check-in aberto em Beta.</p>
        <BotaoCheckin compacto cliente={{ id: 'k1', nome: 'Conecta Fibra' }} aberto={{ id: 'a1', cliente_id: 'k9', inicio }} aoMudar={vi.fn()} idDoAviso="aviso" />
      </>,
    )
    const entrada = screen.getByRole('button', { name: 'Fazer check-in em Conecta Fibra' })
    expect(entrada).toBeDisabled()
    expect(entrada).toHaveAccessibleDescription('Você está com check-in aberto em Beta.')
  })

  it('check-in mudado em outra parte do app (o selo da barra de cima) também recarrega a tela do botão (auditoria, G2)', () => {
    const aoMudar = vi.fn()
    const { unmount } = render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={aoMudar} />)
    act(() => { avisarQueOCheckinMudou() })
    expect(aoMudar).toHaveBeenCalledTimes(1)
    unmount()
    avisarQueOCheckinMudou()
    expect(aoMudar).toHaveBeenCalledTimes(1)
  })

  it('sem check-in aberto não aponta para aviso nenhum', () => {
    render(<BotaoCheckin cliente={cliente} aberto={null} aoMudar={vi.fn()} idDoAviso="aviso" />)
    expect(screen.getByRole('button', { name: 'Fazer check-in' })).not.toHaveAttribute('aria-describedby')
  })
})
