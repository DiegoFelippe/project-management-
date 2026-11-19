import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarCheckins } from '@/data/checkins'
import CheckinsDoCliente from './CheckinsDoCliente'

vi.mock('@/data/checkins', () => ({ listarCheckins: vi.fn(), editarCheckin: vi.fn(), apagarCheckin: vi.fn() }))

const cliente = { id: 'k1', nome: 'Provedor Alfa' }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 's1' }
const checkins = (n) => Array.from({ length: n }, (_, i) => ({
  id: `c${i}`, inicio: new Date('2026-11-10T09:00').toISOString(), fim: new Date('2026-11-10T10:00').toISOString(),
  descricao: `Atendimento ${i}`, consultor_id: 'p1', consultoria_id: 's1', consultor: { nome: 'Ana' }, tarefas: [],
}))
const tela = (perfil = gestor) => render(<CheckinsDoCliente cliente={cliente} perfil={perfil} versao={0} aoMudar={vi.fn()} />)

beforeEach(() => vi.clearAllMocks())

describe('CheckinsDoCliente (paginação no banco e ações)', () => {
  it('some com 15, aparece com 16 e Próxima pede a página 2', async () => {
    vi.mocked(listarCheckins).mockResolvedValue({ itens: checkins(15), total: 15 })
    const { unmount } = tela()
    await screen.findByRole('table', { name: 'Check-ins' })
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).not.toBeInTheDocument()
    unmount()
    vi.mocked(listarCheckins).mockResolvedValue({ itens: checkins(15), total: 16 })
    tela()
    expect(await screen.findByText('1–15 de 16')).toBeInTheDocument()
    expect(listarCheckins).toHaveBeenLastCalledWith({ clienteId: 'k1', pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarCheckins).toHaveBeenLastCalledWith({ clienteId: 'k1', pagina: 2 })
  })

  it('Editar e Apagar só com o ícone; quem não mexe naquele check-in fica com o espaço guardado', async () => {
    vi.mocked(listarCheckins).mockResolvedValue({ itens: [checkins(1)[0], { ...checkins(2)[1], consultoria_id: 'outra' }], total: 2 })
    tela()
    const [, minha, deOutra] = within(await screen.findByRole('table', { name: 'Check-ins' })).getAllByRole('row')
    expect(within(minha).getByRole('button', { name: 'Editar' })).toHaveAttribute('title', 'Editar')
    expect(within(deOutra).queryByRole('button')).toBeNull()
    expect([...deOutra.querySelector('td:last-child').children].every((el) => el.getAttribute('aria-hidden') === 'true')).toBe(true)
  })
})
