import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { gerenciarConsultoria, listarConsultorias } from '@/data/consultorias'
import { trocarLogo } from '@/data/imagens'
import { renderizarTela } from '@/test/renderizar'
import Consultorias from './Consultorias'

vi.mock('@/data/consultorias', () => ({
  listarConsultorias: vi.fn(), criarConsultoria: vi.fn(), gerenciarConsultoria: vi.fn(),
}))
vi.mock('@/data/usuarios', () => ({ criarAcesso: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarLogo: vi.fn().mockResolvedValue({ erro: null }), tirarLogo: vi.fn() }))

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

const dono = { id: 'd1', papel: 'dono', consultoria_id: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarConsultorias).mockResolvedValue({
    itens: [
      { id: 'c1', nome: 'Acme', arquivada: false, pessoas: 5, times: 2,
        admins: [{ id: 'a1', nome: 'Rita', email: 'rita@acme.test', convite_pendente: false }] },
      { id: 'c2', nome: 'Beta', arquivada: false, pessoas: 1, times: 0, admins: [] },
    ],
    total: 2,
  })
  vi.mocked(gerenciarConsultoria).mockResolvedValue({ erro: null })
})

describe('Consultorias', () => {
  it('lista as consultorias numa tabela: nome, administração, pessoas e times', async () => {
    renderizarTela(<Consultorias />, { perfil: dono })
    const tabela = await screen.findByRole('table', { name: 'Consultorias' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
    const acme = screen.getByRole('row', { name: /Acme/ })
    expect(within(acme).getByText('Rita')).toBeInTheDocument()
    expect(within(acme).getByText('5')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Beta/ })).getByText('Sem administrador')).toBeInTheDocument()
  })

  it('Editar abre o formulário com a consultoria escolhida já preenchida', async () => {
    renderizarTela(<Consultorias />, { perfil: dono })
    await userEvent.click(within(await screen.findByRole('row', { name: /Beta/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar consultoria' })
    const nome = within(janela).getByLabelText('Nome da consultoria')
    expect(nome).toHaveValue('Beta')
    await userEvent.type(nome, ' Brasil')
    await userEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(gerenciarConsultoria).toHaveBeenCalledWith('renomear', 'c2', { nome: 'Beta Brasil' })
  })

  it('a logo escolhida no Editar vai para o Storage, sem renomear se o nome não mudou', async () => {
    renderizarTela(<Consultorias />, { perfil: dono })
    await userEvent.click(within(await screen.findByRole('row', { name: /Acme/ })).getByRole('button', { name: 'Editar' }))
    const arquivo = new File(['x'], 'logo.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher logo'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(trocarLogo).toHaveBeenCalledWith('c1', arquivo, undefined)
    expect(gerenciarConsultoria).not.toHaveBeenCalled()
  })

  it('pagina no banco, e Arquivadas pede as arquivadas desde a página 1', async () => {
    vi.mocked(listarConsultorias).mockResolvedValueOnce({ itens: [], total: 0 })
    renderizarTela(<Consultorias />, { perfil: dono })
    await screen.findByText(/Nenhuma consultoria ainda/)
    expect(listarConsultorias).toHaveBeenLastCalledWith({ arquivadas: false, pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: 'Arquivadas' }))
    expect(listarConsultorias).toHaveBeenLastCalledWith({ arquivadas: true, pagina: 1 })
  })
})
