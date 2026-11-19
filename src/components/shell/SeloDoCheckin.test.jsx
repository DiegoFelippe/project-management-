import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { AuthContext } from '@/auth/useAuth'
import { fazerCheckout, meuCheckinAberto, tarefasDoCheckin } from '@/data/checkins'
import { avisarQueOCheckinMudou } from '@/lib/checkinMudou'
import Moldura from './Moldura'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/data/checkins', () => ({ meuCheckinAberto: vi.fn(), fazerCheckout: vi.fn(), tarefasDoCheckin: vi.fn() }))
vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn() }))
vi.mock('@/data/capacidade', () => ({ listarAusencias: vi.fn().mockResolvedValue({ itens: [], total: 0 }) }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn() }))
vi.mock('@/data/preferencias', () => ({ salvarTema: vi.fn().mockResolvedValue() }))
vi.mock('@/pwa/useInstalar', () => ({ useInstalar: () => ({ podeInstalar: false, instalar: vi.fn() }) }))

const ANA = { id: 'ana', nome: 'Ana Lima', email: 'ana@exemplo.test', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'Acme' } }
const HORA = 3_600_000
const abertoHa = (ms) => ({ id: 'a1', cliente_id: 'k1', inicio: new Date(Date.now() - ms).toISOString(), cliente: { nome: 'Alfa' } })

function moldura(perfil = ANA) {
  return render(
    <AuthContext.Provider value={{ perfil, sair: vi.fn() }}>
      <MemoryRouter initialEntries={['/inicio']}>
        <Routes>
          <Route element={<Moldura />}>
            <Route path="/inicio" element={<Link to="/calendario">Ir ao calendário</Link>} />
            <Route path="/calendario" element={<p>Tela do calendário</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
const barra = () => within(screen.getByRole('banner'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(meuCheckinAberto).mockResolvedValue(null)
  vi.mocked(fazerCheckout).mockResolvedValue({ erro: null })
  vi.mocked(tarefasDoCheckin).mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('selo do check-in aberto na barra de cima (auditoria, G2)', () => {
  it('sem check-in aberto não aparece', async () => {
    moldura()
    await waitFor(() => expect(meuCheckinAberto).toHaveBeenCalledWith('ana'))
    expect(barra().queryByRole('link', { name: /Check-in aberto/ })).not.toBeInTheDocument()
    expect(barra().queryByRole('button', { name: /Fazer check-out/ })).not.toBeInTheDocument()
  })

  it('com check-in aberto: "Check-in aberto · cliente · tempo", leva ao cliente e o tempo anda', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00'), shouldAdvanceTime: true })
    vi.mocked(meuCheckinAberto).mockResolvedValue(abertoHa(HORA + 5 * 60_000))
    moldura()
    const selo = await barra().findByRole('link', { name: 'Check-in aberto · Alfa · 1 h 05' })
    expect(selo).toHaveAttribute('href', '/clientes/k1')
    expect(selo).toHaveTextContent('Check-in aberto')
    expect(barra().getByRole('button', { name: 'Fazer check-out' })).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(barra().getByRole('link', { name: 'Check-in aberto · Alfa · 1 h 06' })).toBeInTheDocument()
  })

  it('no celular o selo ocupa o lugar do caminho e do papel (o papel fica no ☰)', async () => {
    vi.mocked(meuCheckinAberto).mockResolvedValue(abertoHa(HORA))
    moldura()
    await barra().findByRole('link', { name: /Check-in aberto/ })
    expect(barra().getByText('Consultor')).toHaveClass('max-sm:hidden')
    expect(barra().getByText(/Acme/)).toHaveClass('max-sm:hidden')
  })

  it('Fazer check-out abre a janela do check-out e fecha o check-in aberto', async () => {
    vi.mocked(meuCheckinAberto).mockResolvedValue(abertoHa(HORA))
    moldura()
    await userEvent.click(await barra().findByRole('button', { name: 'Fazer check-out' }))
    const janela = screen.getByRole('dialog', { name: 'Fazer check-out em Alfa' })
    await userEvent.type(within(janela).getByLabelText('O que foi feito'), 'Migração')
    await userEvent.click(within(janela).getByRole('button', { name: 'Fazer check-out' }))
    expect(fazerCheckout).toHaveBeenCalledWith('a1', { fim: expect.any(String), descricao: 'Migração' })
    expect(toast.success).toHaveBeenCalledWith('Check-out feito em Alfa.')
  })

  it('relê quando um check-in muda em outra parte do app e ao trocar de tela', async () => {
    vi.mocked(meuCheckinAberto).mockResolvedValue(abertoHa(HORA))
    moldura()
    await barra().findByRole('link', { name: /Check-in aberto/ })
    vi.mocked(meuCheckinAberto).mockResolvedValue(null)
    act(() => { avisarQueOCheckinMudou() })
    await waitFor(() => expect(barra().queryByRole('link', { name: /Check-in aberto/ })).not.toBeInTheDocument())
    const leituras = vi.mocked(meuCheckinAberto).mock.calls.length
    await userEvent.click(screen.getByRole('link', { name: 'Ir ao calendário' }))
    await waitFor(() => expect(meuCheckinAberto).toHaveBeenCalledTimes(leituras + 1))
  })

  it('a central (e o dono) não fazem check-in: não lê nem mostra', async () => {
    moldura({ id: 'c0', nome: 'Cora', papel: 'central', consultoria: null })
    await screen.findByText('Ir ao calendário')
    expect(meuCheckinAberto).not.toHaveBeenCalled()
  })
})
