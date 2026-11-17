import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkinsDoMes } from '@/data/checkins'
import { eventosDoMes } from '@/data/clientes'
import AgendaDoCliente from './AgendaDoCliente'

vi.mock('@/data/checkins', () => ({ checkinsDoMes: vi.fn() }))
vi.mock('@/data/clientes', () => ({ eventosDoMes: vi.fn() }))

const CHECKIN = {
  id: 'c1', inicio: '2026-11-16T12:00:00Z', fim: '2026-11-16T13:00:00Z', descricao: 'Revisão do plano',
  consultor_id: 'p1', consultor: { nome: 'Ana Lima' },
}
const EVENTO = {
  id: 'e1', tipo: 'enviado', em: '2026-11-16T18:30:00Z', para_consultoria: 'Consultoria Exemplo', autor: 'Bia Central',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-16T15:00:00Z'))
  vi.clearAllMocks()
  vi.mocked(checkinsDoMes).mockResolvedValue([CHECKIN])
  vi.mocked(eventosDoMes).mockResolvedValue({ itens: [EVENTO], total: 1 })
})
afterEach(() => vi.useRealTimers())

describe('AgendaDoCliente', () => {
  it('novembro/2026 começa no domingo: seis dias de outubro esmaecidos antes do dia 1', async () => {
    render(<AgendaDoCliente clienteId="k1" />)
    await screen.findByText('Ana Lima · 1 h')
    expect(screen.getByText('Novembro de 2026')).toBeInTheDocument()
    const primeira = screen.getAllByRole('row')[1]
    const celulas = within(primeira).getAllByRole('gridcell')
    expect(celulas).toHaveLength(7)
    expect(celulas.slice(0, 6).every((c) => c.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(celulas[6]).not.toHaveAttribute('aria-disabled')
    expect(celulas[6]).toHaveTextContent('1')
    expect(checkinsDoMes).toHaveBeenCalledWith('k1', '2026-11-01')
    expect(eventosDoMes).toHaveBeenCalledWith('k1', '2026-11-01')
  })

  it('mostra check-in e evento no dia 16, e destaca hoje', async () => {
    render(<AgendaDoCliente clienteId="k1" />)
    const d16 = await screen.findByRole('gridcell', { name: /^16/ })
    expect(within(d16).getByText('Ana Lima · 1 h')).toBeInTheDocument()
    expect(within(d16).getByText('Mandado para Consultoria Exemplo')).toBeInTheDocument()
    expect(d16).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('grid')).toBeInTheDocument()
  })

  it('check-in curto mostra minutos e aberto mostra em andamento', async () => {
    vi.mocked(checkinsDoMes).mockResolvedValue([
      { ...CHECKIN, fim: '2026-11-16T12:25:00Z' },
      { ...CHECKIN, id: 'c2', inicio: '2026-11-17T12:00:00Z', fim: null },
    ])
    render(<AgendaDoCliente clienteId="k1" />)
    expect(await screen.findByText('Ana Lima · 25 min')).toBeInTheDocument()
    expect(screen.getByText('Ana Lima · em andamento')).toBeInTheDocument()
  })

  it('mais de três marcas no dia viram +N', async () => {
    vi.mocked(checkinsDoMes).mockResolvedValue(
      [1, 2, 3, 4].map((i) => ({ ...CHECKIN, id: `c${i}`, inicio: `2026-11-16T${10 + i}:00:00Z`, fim: `2026-11-16T${10 + i}:30:00Z` })),
    )
    render(<AgendaDoCliente clienteId="k1" />)
    const d16 = await screen.findByRole('gridcell', { name: /^16/ })
    await waitFor(() => expect(within(d16).getByText('+2')).toBeInTheDocument())
    expect(within(d16).getAllByText(/Ana Lima/)).toHaveLength(3)
  })

  it('clicar no dia abre o detalhe com check-ins e eventos', async () => {
    const usuario = userEvent.setup()
    render(<AgendaDoCliente clienteId="k1" />)
    await usuario.click(await screen.findByRole('gridcell', { name: /^16/ }))
    const janela = await screen.findByRole('dialog')
    expect(within(janela).getByText(/16\/11\/2026/)).toBeInTheDocument()
    expect(within(janela).getByText(/09:00/)).toBeInTheDocument()
    expect(within(janela).getByText('Ana Lima')).toBeInTheDocument()
    expect(within(janela).getByText('Revisão do plano')).toBeInTheDocument()
    expect(within(janela).getByText('Mandado para Consultoria Exemplo')).toBeInTheDocument()
    expect(within(janela).getByText('Bia Central')).toBeInTheDocument()
  })

  it('setas movem o dia e Enter abre o detalhe', async () => {
    const usuario = userEvent.setup()
    render(<AgendaDoCliente clienteId="k1" />)
    const d16 = await screen.findByRole('gridcell', { name: /^16/ })
    d16.focus()
    await usuario.keyboard('{ArrowRight}')
    expect(screen.getByRole('gridcell', { name: /^17/ })).toHaveFocus()
    await usuario.keyboard('{ArrowDown}')
    expect(screen.getByRole('gridcell', { name: /^24/ })).toHaveFocus()
    expect(screen.getByRole('gridcell', { name: /^24/ })).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{ArrowLeft}{ArrowUp}')
    expect(screen.getByRole('gridcell', { name: /^16/ })).toHaveFocus()
    await usuario.keyboard('{Enter}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('Próximo pede dezembro; Anterior volta a outubro', async () => {
    const usuario = userEvent.setup()
    render(<AgendaDoCliente clienteId="k1" />)
    await screen.findByText('Ana Lima · 1 h')
    await usuario.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await waitFor(() => expect(checkinsDoMes).toHaveBeenLastCalledWith('k1', '2026-12-01'))
    expect(eventosDoMes).toHaveBeenLastCalledWith('k1', '2026-12-01')
    expect(await screen.findByText('Dezembro de 2026')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await usuario.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await waitFor(() => expect(checkinsDoMes).toHaveBeenLastCalledWith('k1', '2026-10-01'))
  })

  it('avisa quando há mais eventos que o carregado', async () => {
    vi.mocked(eventosDoMes).mockResolvedValue({ itens: [EVENTO], total: 251 })
    render(<AgendaDoCliente clienteId="k1" />)
    expect(await screen.findByText('e mais 250 eventos')).toBeInTheDocument()
  })

  it('recarrega quando a versão da página muda', async () => {
    const { rerender } = render(<AgendaDoCliente clienteId="k1" versao={0} />)
    await screen.findByText('Ana Lima · 1 h')
    rerender(<AgendaDoCliente clienteId="k1" versao={1} />)
    await waitFor(() => expect(checkinsDoMes).toHaveBeenCalledTimes(2))
    expect(eventosDoMes).toHaveBeenCalledTimes(2)
  })

  it('erro ao carregar avisa', async () => {
    vi.mocked(checkinsDoMes).mockRejectedValue(new Error('x'))
    render(<AgendaDoCliente clienteId="k1" />)
    expect(await screen.findByText('Não foi possível carregar a agenda.')).toBeInTheDocument()
  })
})
