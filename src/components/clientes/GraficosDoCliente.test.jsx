import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkinsPorSemana, horasPorConsultor, horasPorMes } from '@/data/clientes'
import { mesAtual, deslocarMes } from '@/lib/mes'
import GraficosDoCliente from './GraficosDoCliente'

vi.mock('@/data/clientes', () => ({ horasPorMes: vi.fn(), horasPorConsultor: vi.fn(), checkinsPorSemana: vi.fn() }))

const CLIENTE = { id: 'k1', horas_mes: 32.5 }
const MESES = [
  { mes: '2026-06-01', realizado: 0 }, { mes: '2026-07-01', realizado: 12 }, { mes: '2026-08-01', realizado: 20.5 },
  { mes: '2026-09-01', realizado: 0 }, { mes: '2026-10-01', realizado: 30 }, { mes: '2026-11-01', realizado: 8.5 },
]
const CONSULTORES = [
  { consultorId: 'p1', nome: 'Ana Souza', horas: 6.5 },
  { consultorId: 'p2', nome: null, horas: 2 },
]
const SEMANAS = [
  { semana: '2026-11-02', quantidade: 2, horas: 3.5 },
  { semana: '2026-11-09', quantidade: 0, horas: 0 },
  { semana: '2026-11-16', quantidade: 4, horas: 5 },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(horasPorMes).mockResolvedValue(MESES)
  vi.mocked(horasPorConsultor).mockResolvedValue(CONSULTORES)
  vi.mocked(checkinsPorSemana).mockResolvedValue(SEMANAS)
})

describe('GraficosDoCliente', () => {
  it('mostra os três gráficos com os valores no texto alternativo', async () => {
    render(<GraficosDoCliente cliente={CLIENTE} />)
    const meses = await screen.findByRole('img', { name: /Horas por mês/ })
    expect(meses).toHaveAccessibleName(/jun\/26: 0 h.*jul\/26: 12 h.*ago\/26: 20,5 h.*nov\/26: 8,5 h/)
    expect(meses).toHaveAccessibleName(/Previsão: 32,5 h/)
    const consultores = await screen.findByRole('img', { name: /Horas por consultor/ })
    expect(consultores).toHaveAccessibleName(/Ana Souza: 6,5 h.*outro consultor: 2 h/)
    const semanas = await screen.findByRole('img', { name: /Check-ins por semana/ })
    expect(semanas).toHaveAccessibleName(/sem\. de 02\/11: 2 check-ins, 3,5 h.*sem\. de 09\/11: 0 check-ins.*sem\. de 16\/11: 4 check-ins, 5 h/)
  })

  it('desenha a previsão atual como linha de referência com o rótulo', async () => {
    const { container } = render(<GraficosDoCliente cliente={CLIENTE} />)
    await screen.findByRole('img', { name: /Horas por mês/ })
    expect(container.querySelector('[data-previsao]')).not.toBeNull()
    expect(screen.getByText('Previsão: 32,5 h')).toBeInTheDocument()
  })

  it('mostra os números e os nomes na tela', async () => {
    render(<GraficosDoCliente cliente={CLIENTE} />)
    await screen.findByRole('img', { name: /Horas por consultor/ })
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('outro consultor')).toBeInTheDocument()
    expect(screen.getByText('sem. de 16/11')).toBeInTheDocument()
  })

  it('sem horas nos 6 meses: estado vazio no primeiro gráfico', async () => {
    vi.mocked(horasPorMes).mockResolvedValue(MESES.map((m) => ({ ...m, realizado: 0 })))
    render(<GraficosDoCliente cliente={CLIENTE} />)
    expect(await screen.findByText('Sem horas nos últimos 6 meses.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Horas por mês/ })).toBeNull()
  })

  it('sem check-ins no mês: estado vazio nos gráficos 2 e 3', async () => {
    vi.mocked(horasPorConsultor).mockResolvedValue([])
    vi.mocked(checkinsPorSemana).mockResolvedValue(SEMANAS.map((s) => ({ ...s, quantidade: 0, horas: 0 })))
    render(<GraficosDoCliente cliente={CLIENTE} />)
    expect(await screen.findAllByText('Sem check-ins neste mês.')).toHaveLength(2)
  })

  it('trocar o mês chama as funções com o mês novo; Próximo não passa do mês atual', async () => {
    const usuario = userEvent.setup()
    render(<GraficosDoCliente cliente={CLIENTE} />)
    await screen.findByRole('img', { name: /Horas por consultor/ })
    expect(horasPorConsultor).toHaveBeenLastCalledWith('k1', mesAtual())
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled()
    await usuario.click(screen.getByRole('button', { name: 'Anterior' }))
    const anterior = deslocarMes(mesAtual(), -1)
    await waitFor(() => expect(horasPorConsultor).toHaveBeenLastCalledWith('k1', anterior))
    expect(checkinsPorSemana).toHaveBeenLastCalledWith('k1', anterior)
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeEnabled()
    // O gráfico dos meses não depende do mês escolhido.
    expect(horasPorMes).toHaveBeenCalledTimes(1)
  })

  it('recarrega os três gráficos quando a versão da página muda', async () => {
    const { rerender } = render(<GraficosDoCliente cliente={CLIENTE} versao={0} />)
    await screen.findByRole('img', { name: /Horas por mês/ })
    rerender(<GraficosDoCliente cliente={CLIENTE} versao={1} />)
    await waitFor(() => expect(horasPorMes).toHaveBeenCalledTimes(2))
    expect(horasPorConsultor).toHaveBeenCalledTimes(2)
    expect(checkinsPorSemana).toHaveBeenCalledTimes(2)
  })

  it('erro ao carregar avisa', async () => {
    vi.mocked(horasPorMes).mockRejectedValue(new Error('x'))
    render(<GraficosDoCliente cliente={CLIENTE} />)
    expect(await screen.findByText('Não foi possível carregar o gráfico de horas por mês.')).toBeInTheDocument()
  })
})
