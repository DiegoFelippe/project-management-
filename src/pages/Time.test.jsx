import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buscarPessoas } from '@/data/pessoas'
import { adicionarMembro, buscarTime, idsDosMembros, listarMembros, removerMembro } from '@/data/times'
import { escolherNoSeletor } from '@/test/campos'
import { renderizarTela } from '@/test/renderizar'
import Time from './Time'

vi.mock('@/data/times', () => ({
  buscarTime: vi.fn(), listarMembros: vi.fn(), idsDosMembros: vi.fn().mockResolvedValue(new Set()),
  adicionarMembro: vi.fn(), removerMembro: vi.fn(), editarTime: vi.fn(), apagarTime: vi.fn(),
}))
vi.mock('@/data/pessoas', () => ({ buscarPessoas: vi.fn() }))

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
  vi.mocked(adicionarMembro).mockResolvedValue({ erro: null })
  vi.mocked(idsDosMembros).mockResolvedValue(new Set(['p1', 'p2']))
  vi.mocked(buscarPessoas).mockResolvedValue({ itens: [{ id: 'p3', nome: 'Carla', email: 'carla@x.test', papel: 'pessoa' }], total: 1 })
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

  it('Colocar pessoa busca no banco (sem quem já está e sem o gestor) e coloca a escolhida', async () => {
    renderizarTela(<Time />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' }, endereco: '/times/t1', rota: '/times/:id' })
    await screen.findByRole('table', { name: 'Pessoas do time' })
    await escolherNoSeletor(userEvent, 'Colocar pessoa', 'Carla')
    expect(buscarPessoas).toHaveBeenLastCalledWith(expect.objectContaining({
      consultoriaId: 'c1', termo: '', excluirIds: expect.arrayContaining(['p1', 'p2', 'g1']),
    }))
    await userEvent.click(screen.getByRole('button', { name: 'Colocar no time' }))
    expect(adicionarMembro).toHaveBeenCalledWith('t1', 'p3')
  })
})
