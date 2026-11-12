import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import Trilho from './Trilho'

vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn() }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn() }))

describe('Trilho', () => {
  it('todo ícone do trilho anima ao passar o mouse, inclusive a bolinha e o Sair', () => {
    const perfil = { nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'dono' }
    const { container } = render(
      <AuthContext.Provider value={{ perfil, sair: () => {} }}>
        <MemoryRouter>
          <Trilho />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    const itens = container.querySelectorAll('[data-item-trilho]')
    expect(itens.length).toBe(7) // 5 itens do dono + bolinha + Sair
    for (const item of itens) {
      expect(item.querySelector('[class*="anim-"]'), item.textContent).not.toBeNull()
    }
  })

  it('a bolinha da pessoa, acima do Sair, abre o Meu perfil', async () => {
    const perfil = { id: 'me', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin', consultoria: { nome: 'Acme' } }
    render(
      <AuthContext.Provider value={{ perfil, sair: () => {} }}>
        <MemoryRouter>
          <Trilho />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Meu perfil/ }))
    expect(screen.getByRole('dialog', { name: 'Meu perfil' })).toBeInTheDocument()
  })
})
