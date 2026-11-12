import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { trocarFoto } from '@/data/imagens'
import { gerenciarAcesso, listarUsuarios } from '@/data/usuarios'
import { renderizarTela } from '@/test/renderizar'
import Usuarios from './Usuarios'

vi.mock('@/data/usuarios', () => ({
  listarUsuarios: vi.fn(), criarAcesso: vi.fn(), gerenciarAcesso: vi.fn(), reenviarConvite: vi.fn(),
}))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn().mockResolvedValue({ erro: null }), tirarFoto: vi.fn() }))
vi.mock('@/data/times', () => ({
  listarOpcoesDeTimes: vi.fn().mockResolvedValue([]), adicionarMembro: vi.fn(), removerMembro: vi.fn(),
}))

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listarUsuarios).mockResolvedValue({
    itens: [
      { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [] },
      { id: 'p2', nome: 'Bruno', email: 'bruno@x.test', papel: 'gestor', ativo: true, times: [] },
    ],
    total: 2,
  })
})

describe('Usuários', () => {
  it('lista as pessoas numa tabela e Editar abre o formulário com a pessoa escolhida', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    const tabela = await screen.findByRole('table', { name: 'Usuários' })
    expect(within(tabela).getAllByRole('row')).toHaveLength(3)
    await userEvent.click(within(screen.getByRole('row', { name: /Bruno/ })).getByRole('button', { name: 'Editar' }))
    const janela = screen.getByRole('dialog', { name: 'Editar acesso' })
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Bruno')
    expect(within(janela).getByLabelText('E-mail')).toHaveValue('bruno@x.test')
  })

  it('a foto escolhida no Editar vai para o Storage', async () => {
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    await userEvent.click(within(await screen.findByRole('row', { name: /Ana/ })).getByRole('button', { name: 'Editar' }))
    const arquivo = new File(['x'], 'ana.png', { type: 'image/png' })
    await userEvent.upload(screen.getByLabelText('Escolher foto'), arquivo)
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(trocarFoto).toHaveBeenCalledWith('p1', arquivo, undefined)
    expect(gerenciarAcesso).not.toHaveBeenCalled()
  })

  it('pagina no banco acima de 15 pessoas, e o filtro volta para a página 1', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      itens: [{ id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [] }],
      total: 40,
    })
    renderizarTela(<Usuarios />, { perfil: { id: 'a1', papel: 'admin', consultoria_id: 'c1' } })
    expect(await screen.findByText('1–15 de 40')).toBeInTheDocument()
    expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 1 })
    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: true, pagina: 2 })
    await userEvent.click(screen.getByRole('button', { name: 'Desativados' }))
    expect(listarUsuarios).toHaveBeenLastCalledWith({ consultoriaId: 'c1', ativos: false, pagina: 1 })
  })
})
