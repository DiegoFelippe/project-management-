import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarUsuarios } from '@/data/usuarios'
import { renderizarTela } from '@/test/renderizar'
import Usuarios from './Usuarios'

vi.mock('@/data/usuarios', () => ({
  listarUsuarios: vi.fn(), criarAcesso: vi.fn(), gerenciarAcesso: vi.fn(), reenviarConvite: vi.fn(),
}))
vi.mock('@/data/times', () => ({
  listarTimes: vi.fn().mockResolvedValue([]), adicionarMembro: vi.fn(), removerMembro: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(listarUsuarios).mockResolvedValue([
    { id: 'p1', nome: 'Ana', email: 'ana@x.test', papel: 'pessoa', ativo: true, times: [] },
    { id: 'p2', nome: 'Bruno', email: 'bruno@x.test', papel: 'gestor', ativo: true, times: [] },
  ])
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
})
