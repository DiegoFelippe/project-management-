import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { buscarPessoas } from '@/data/pessoas'
import { adicionarMembros, buscarTime, idsDosMembros, listarMembros, removerMembro } from '@/data/times'
import { escolherNoSeletor } from '@/test/campos'
import { renderizarTela } from '@/test/renderizar'
import Time from './Time'

vi.mock('@/data/times', () => ({
  buscarTime: vi.fn(), listarMembros: vi.fn(), idsDosMembros: vi.fn().mockResolvedValue(new Set()),
  adicionarMembros: vi.fn(), removerMembro: vi.fn(), editarTime: vi.fn(), apagarTime: vi.fn(),
}))
vi.mock('@/data/pessoas', () => ({ buscarPessoas: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1' }
const tela = (perfil = gestor) => renderizarTela(<Time />, { perfil, endereco: '/times/t1', rota: '/times/:id' })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(buscarTime).mockResolvedValue({
    id: 't1', nome: 'Implantação', descricao: null, gestor_id: 'g1', gestor: { id: 'g1', nome: 'Gil', email: 'gil@x.test' }, consultoria_id: 'c1',
  })
  vi.mocked(listarMembros).mockResolvedValue({
    itens: [
      { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa' },
      { id: 'p2', nome: 'Bruno', email: 'bruno@x.test', papel: 'pessoa' },
    ],
    total: 2,
  })
  vi.mocked(removerMembro).mockResolvedValue({ erro: null })
  vi.mocked(adicionarMembros).mockResolvedValue({ erro: null })
  vi.mocked(idsDosMembros).mockResolvedValue(new Set(['p1', 'p2']))
  vi.mocked(buscarPessoas).mockResolvedValue({ itens: [
    { id: 'p3', nome: 'Carla', email: 'carla@x.test', papel: 'pessoa' },
    { id: 'p4', nome: 'Davi', email: 'davi@x.test', papel: 'pessoa' },
  ], total: 2 })
})

describe('Time', () => {
  it('as pessoas do time ficam numa tabela, e o gestor tira alguém pela linha (só o ícone, com o nome)', async () => {
    tela()
    const tabela = await screen.findByRole('table', { name: 'Pessoas do time' })
    const bruno = within(tabela).getByRole('row', { name: /Bruno/ })
    expect(within(bruno).getByText('bruno@x.test')).toBeInTheDocument()
    const tirar = within(bruno).getByRole('button', { name: 'Tirar do time' })
    expect(tirar).toHaveAttribute('title', 'Tirar do time')
    expect(tirar).toHaveTextContent('')
    await userEvent.click(tirar)
    expect(removerMembro).toHaveBeenCalledWith('t1', 'p2')
    expect(toast.success).toHaveBeenCalledWith('Bruno saiu do time.')
  })

  it('o gestor vem na primeira linha, como "Gestor do time" e sem "Tirar do time"; a conta fecha com a lista de times (auditoria, R8)', async () => {
    tela()
    const tabela = await screen.findByRole('table', { name: 'Pessoas do time' })
    const [, primeira, ...resto] = within(tabela).getAllByRole('row')
    expect(primeira).toHaveTextContent('Gil')
    expect(within(primeira).getByText('gil@x.test')).toBeInTheDocument()
    expect(within(primeira).getByText('Gestor do time')).toBeInTheDocument()
    expect(within(primeira).queryByRole('button')).not.toBeInTheDocument()
    expect(resto).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Implantação' }).nextElementSibling).toHaveTextContent('3 pessoas')
  })

  it('sem ninguém além do gestor, a tabela mostra só ele', async () => {
    vi.mocked(listarMembros).mockResolvedValue({ itens: [], total: 0 })
    tela()
    const tabela = await screen.findByRole('table', { name: 'Pessoas do time' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(2)
    expect(screen.getByText('1 pessoa')).toBeInTheDocument()
  })

  it('as pessoas do time paginam no banco acima de 15; o gestor fica só na primeira página', async () => {
    vi.mocked(listarMembros).mockResolvedValue({ itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa' }], total: 18 })
    tela()
    expect(await screen.findByText('1–15 de 18')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarMembros).toHaveBeenLastCalledWith('t1', { pagina: 2 })
    expect(await screen.findByText('16–18 de 18')).toBeInTheDocument()
    expect(screen.queryByText('Gestor do time')).not.toBeInTheDocument()
  })

  it('Colocar pessoas: várias de uma vez, buscadas no banco (sem quem já está e sem o gestor), numa chamada só (usabilidade, U7)', async () => {
    tela()
    await screen.findByRole('table', { name: 'Pessoas do time' })
    expect(screen.getByRole('button', { name: 'Colocar no time' })).toBeDisabled()
    await escolherNoSeletor(userEvent, 'Colocar pessoas', 'Carla')
    expect(buscarPessoas).toHaveBeenLastCalledWith(expect.objectContaining({
      consultoriaId: 'c1', termo: '', excluirIds: expect.arrayContaining(['p1', 'p2', 'g1']),
    }))
    await userEvent.click(screen.getByRole('option', { name: /Davi/ }))
    await userEvent.keyboard('{Escape}')
    expect(within(screen.getByRole('list', { name: 'Pessoas escolhidas' })).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Colocar no time' }))
    expect(adicionarMembros).toHaveBeenCalledWith('t1', ['p3', 'p4'])
    expect(toast.success).toHaveBeenCalledWith('Carla e Davi entraram no time.')
    expect(screen.queryByRole('list', { name: 'Pessoas escolhidas' })).not.toBeInTheDocument()
    expect(listarMembros).toHaveBeenCalledTimes(2)
  })

  it('se o banco recusa, o aviso diz quem não entrou e elas continuam escolhidas para tentar de novo', async () => {
    vi.mocked(adicionarMembros).mockResolvedValue({ erro: 'Só entra no time quem é da mesma consultoria.' })
    tela()
    await screen.findByRole('table', { name: 'Pessoas do time' })
    await escolherNoSeletor(userEvent, 'Colocar pessoas', 'Carla')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Colocar no time' }))
    expect(toast.error).toHaveBeenCalledWith('Carla não entrou no time: Só entra no time quem é da mesma consultoria.')
    expect(within(screen.getByRole('list', { name: 'Pessoas escolhidas' })).getByText('Carla')).toBeInTheDocument()
  })

  it('vindo do Novo time com pessoas que não entraram, elas já chegam escolhidas', async () => {
    render(
      <AuthContext.Provider value={{ perfil: gestor }}>
        <MemoryRouter initialEntries={[{ pathname: '/times/t1', state: { pessoasQueFaltam: [{ id: 'p3', nome: 'Carla' }] } }]}>
          <Routes><Route path="/times/:id" element={<Time />} /></Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await screen.findByRole('table', { name: 'Pessoas do time' })
    expect(within(screen.getByRole('list', { name: 'Pessoas escolhidas' })).getByText('Carla')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Colocar no time' })).toBeEnabled()
  })

  it('quem não gerencia o time só olha: sem Colocar pessoas e sem a coluna de ações', async () => {
    tela({ id: 'p1', papel: 'pessoa', consultoria_id: 'c1' })
    const tabela = await screen.findByRole('table', { name: 'Pessoas do time' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Nome', 'Papel'])
    expect(screen.queryByLabelText('Colocar pessoas')).not.toBeInTheDocument()
  })

  it('Editar abre o formulário com o time preenchido; o "← Times" volta para a lista', async () => {
    tela()
    expect(await screen.findByRole('link', { name: 'Times' })).toHaveAttribute('href', '/times')
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(within(screen.getByRole('dialog', { name: 'Editar time' })).getByLabelText('Nome do time')).toHaveValue('Implantação')
  })
})
