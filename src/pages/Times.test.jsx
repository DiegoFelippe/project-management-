import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apagarTime, editarTime, listarTimes } from '@/data/times'
import { renderizarTela } from '@/test/renderizar'
import Times from './Times'

vi.mock('@/data/times', () => ({ listarTimes: vi.fn(), criarTime: vi.fn(), editarTime: vi.fn(), apagarTime: vi.fn() }))
vi.mock('@/data/pessoas', () => ({ listarPessoas: vi.fn().mockResolvedValue([]) }))
vi.mock('@/data/consultorias', () => ({ listarNomesDeConsultorias: vi.fn().mockResolvedValue([]) }))

const gil = { id: 'g1', nome: 'Gil Gestor' }
const TIMES = [
  { id: 't1', nome: 'Implantação', descricao: 'Clientes novos', gestor_id: 'g1', gestor: gil, consultoria_id: 'c1',
    membros: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa' }], totalMembros: 1 },
  { id: 't2', nome: 'Suporte', descricao: null, gestor_id: 'g2', gestor: { id: 'g2', nome: 'Outro' }, consultoria_id: 'c1', membros: [], totalMembros: 0 },
]
const admin = { id: 'a1', papel: 'admin', consultoria_id: 'c1' }
const linha = (nome) => screen.getByRole('row', { name: new RegExp(nome) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarTimes).mockResolvedValue({ itens: TIMES, total: 2 })
  vi.mocked(editarTime).mockResolvedValue({ erro: null })
  vi.mocked(apagarTime).mockResolvedValue({ erro: null })
})

describe('Times', () => {
  it('lista os times numa tabela: nome (abre o time), gestor e pessoas', async () => {
    renderizarTela(<Times />, { perfil: admin })
    const tabela = await screen.findByRole('table', { name: 'Times' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
    expect(within(linha('Implantação')).getByRole('link', { name: 'Implantação' })).toHaveAttribute('href', '/times/t1')
    expect(within(linha('Implantação')).getByText('Gil Gestor')).toBeInTheDocument()
    expect(within(linha('Implantação')).getByText('2 pessoas')).toBeInTheDocument()
  })

  it('Editar abre o formulário com o time escolhido já preenchido', async () => {
    renderizarTela(<Times />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /Suporte/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar time' })
    expect(within(janela).getByLabelText('Nome do time')).toHaveValue('Suporte')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(editarTime).toHaveBeenCalledWith('t2', expect.objectContaining({ nome: 'Suporte' }))
  })

  it('Apagar pede confirmação e apaga o time escolhido', async () => {
    renderizarTela(<Times />, { perfil: admin })
    await userEvent.click(within(await screen.findByRole('row', { name: /Implantação/ })).getByRole('button', { name: 'Apagar' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Apagar time' }))
    expect(apagarTime).toHaveBeenCalledWith('t1')
  })

  it('o gestor só edita e apaga os times dele; o dono só olha', async () => {
    const { unmount } = renderizarTela(<Times />, { perfil: { id: 'g1', papel: 'gestor', consultoria_id: 'c1' } })
    expect(within(await screen.findByRole('row', { name: /Implantação/ })).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(within(linha('Suporte')).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    unmount()
    renderizarTela(<Times />, { perfil: { id: 'd1', papel: 'dono', consultoria_id: null } })
    await screen.findByRole('table', { name: 'Times' })
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apagar' })).not.toBeInTheDocument()
  })

  it('o número de pessoas vem do total do banco, não da amostra de rostos', async () => {
    vi.mocked(listarTimes).mockResolvedValue({ itens: [{ ...TIMES[0], totalMembros: 120 }], total: 1 })
    renderizarTela(<Times />, { perfil: admin })
    expect(within(await screen.findByRole('row', { name: /Implantação/ })).getByText('121 pessoas')).toBeInTheDocument()
  })

  it('pagina no banco acima de 15 times', async () => {
    vi.mocked(listarTimes).mockResolvedValue({ itens: TIMES, total: 31 })
    renderizarTela(<Times />, { perfil: admin })
    expect(await screen.findByText('1–15 de 31')).toBeInTheDocument()
    expect(listarTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c1', pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarTimes).toHaveBeenLastCalledWith({ consultoriaId: 'c1', pagina: 2 })
  })
})
