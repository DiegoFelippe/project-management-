import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientesEmRisco } from '@/data/painel'
import { renderizarTela } from '@/test/renderizar'
import ClientesEmRisco from './ClientesEmRisco'

vi.mock('@/data/painel', () => ({ clientesEmRisco: vi.fn() }))

const cliente = (i, extra = {}) => ({
  id: `c${i}`, nome: `Cliente ${i}`, ultimo_checkin: '2026-10-01', sem_checkin_dias: 40 - i, ritmo: 0.5, horas_30: 10, horas_mes: 20,
  sem_checkin: 40 - i >= 30, acima_do_ritmo: false, consultor_nome: 'Ana Lima', ...extra,
})
const NOVE = { itens: Array.from({ length: 9 }, (_, i) => cliente(i)), total: 9, sem_checkin: 9, acima_do_ritmo: 0 }

beforeEach(() => vi.clearAllMocks())

describe('ClientesEmRisco', () => {
  it('6 linhas e "Ver todos os 16" abre a tabela; Próxima pede a página 2 ao banco', async () => {
    vi.mocked(clientesEmRisco).mockImplementation(async (pagina) => (pagina === 2
      ? { itens: [cliente(20, { nome: 'Da Página 2' })], total: 16, sem_checkin: 16, acima_do_ritmo: 0 }
      : { ...NOVE, total: 16, sem_checkin: 16 }))
    renderizarTela(<ClientesEmRisco recorte="consultoria" />, { perfil: {} })
    const lista = await screen.findByRole('list', { name: 'Clientes em risco' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(6)
    expect(within(within(lista).getAllByRole('listitem')[0]).getByText('Ana Lima')).toBeInTheDocument()
    expect(within(lista).getByRole('img', { name: 'Cliente 0, último check-in: há 40 dias (01/10/2026), passou de 30 dias' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(/sem check-in há 30\+ dias/).textContent).toBe('16 sem check-in há 30+ dias · 0 acima de 120% da previsão')

    await userEvent.click(screen.getByRole('button', { name: 'Ver todos os 16' }))
    const tabela = await screen.findByRole('table', { name: 'Clientes em risco' })
    expect(screen.getByRole('button', { name: 'Ver em tabela' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tabela.querySelectorAll('tbody tr')).toHaveLength(9))
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() => expect(clientesEmRisco).toHaveBeenLastCalledWith(2))
    expect(await within(tabela).findByRole('link', { name: 'Da Página 2' })).toHaveAttribute('href', '/clientes/c20')
  })

  it('vazio: "Nenhum cliente em risco hoje" e a frase do vazio', async () => {
    vi.mocked(clientesEmRisco).mockResolvedValue({ itens: [], total: 0, sem_checkin: 0, acima_do_ritmo: 0 })
    renderizarTela(<ClientesEmRisco recorte="pessoa" />, { perfil: {} })
    expect(await screen.findByText('Todos com check-in recente e dentro da previsão.')).toBeInTheDocument()
    expect(screen.getByText('Nenhum cliente em risco hoje')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meus clientes em risco' })).toBeInTheDocument()
  })

  it('ritmo nulo (menos de 30 dias com consultor) mostra "—"; acima de 120% em vermelho com o alerta', async () => {
    vi.mocked(clientesEmRisco).mockResolvedValue({
      itens: [cliente(1, { ritmo: null, sem_checkin_dias: 31, sem_checkin: true }), cliente(2, { ritmo: 1.35, acima_do_ritmo: true, sem_checkin_dias: 3, sem_checkin: false })],
      total: 2, sem_checkin: 1, acima_do_ritmo: 1,
    })
    renderizarTela(<ClientesEmRisco recorte="tudo" />, { perfil: {} })
    const lista = await screen.findByRole('list', { name: 'Clientes em risco' })
    expect(within(lista).getByRole('img', { name: 'Cliente 1, ritmo dos últimos 30 dias: — da previsão' })).toHaveTextContent('—')
    const acima = within(lista).getByRole('img', { name: 'Cliente 2, ritmo dos últimos 30 dias: 135% da previsão, acima de 120%' })
    expect(within(acima).getByText('135%').closest('span')).toHaveClass('text-destructive')
    expect(screen.queryByRole('button', { name: /Ver todos/ })).toBeNull()
  })

  it('erro: "Tentar de novo" lê de novo', async () => {
    vi.mocked(clientesEmRisco).mockRejectedValueOnce(new Error('x')).mockResolvedValue({ itens: [], total: 0, sem_checkin: 0, acima_do_ritmo: 0 })
    renderizarTela(<ClientesEmRisco recorte="tudo" />, { perfil: {} })
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Nenhum cliente em risco hoje')).toBeInTheDocument()
    expect(clientesEmRisco).toHaveBeenCalledTimes(2)
  })
})
