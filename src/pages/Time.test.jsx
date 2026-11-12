import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarTime, listarMembros, removerMembro } from '@/data/times'
import { renderizarTela } from '@/test/renderizar'
import Time from './Time'

vi.mock('@/data/times', () => ({
  buscarTime: vi.fn(), listarMembros: vi.fn(), idsDosMembros: vi.fn().mockResolvedValue(new Set()),
  adicionarMembro: vi.fn(), removerMembro: vi.fn(), editarTime: vi.fn(), apagarTime: vi.fn(),
}))
vi.mock('@/data/pessoas', () => ({ listarPessoas: vi.fn().mockResolvedValue([]) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(buscarTime).mockResolvedValue({
    id: 't1', nome: 'Implantação', descricao: null, gestor_id: 'g1', gestor: { id: 'g1', nome: 'Gil' }, consultoria_id: 'c1',
  })
  vi.mocked(listarMembros).mockResolvedValue({
    itens: [
      { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa' },
      { id: 'p2', nome: 'Bruno', email: 'bruno@x.test', papel: 'pessoa' },
    ],
    total: 2,
  })
  vi.mocked(removerMembro).mockResolvedValue({ erro: null })
})

describe('Time', () => {
  it('as pessoas do time ficam numa tabela, e o gestor tira alguém pela linha', async () => {
    renderizarTela(<Time />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' }, endereco: '/times/t1', rota: '/times/:id' })
    const tabela = await screen.findByRole('table', { name: 'Pessoas do time' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
    const bruno = within(tabela).getByRole('row', { name: /Bruno/ })
    expect(within(bruno).getByText('bruno@x.test')).toBeInTheDocument()
    await userEvent.click(within(bruno).getByRole('button', { name: 'Tirar do time' }))
    expect(removerMembro).toHaveBeenCalledWith('t1', 'p2')
  })

  it('as pessoas do time paginam no banco acima de 15', async () => {
    vi.mocked(listarMembros).mockResolvedValue({ itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa' }], total: 18 })
    renderizarTela(<Time />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' }, endereco: '/times/t1', rota: '/times/:id' })
    expect(await screen.findByText('1–15 de 18')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarMembros).toHaveBeenLastCalledWith('t1', { pagina: 2 })
  })
})
