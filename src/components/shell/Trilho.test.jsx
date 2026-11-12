import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import Trilho from './Trilho'

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
})
