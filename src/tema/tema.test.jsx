import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import BarraTopo from '@/components/shell/BarraTopo'
import { CHAVE_TEMA, aplicarTema, escuroAtivo, lerTema } from './tema'

function sistemaEscuro(escuro) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: escuro, addEventListener: vi.fn(), removeEventListener: vi.fn() })
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('tema', () => {
  it('sem escolha, segue o sistema', () => {
    expect(lerTema()).toBe('sistema')
    sistemaEscuro(true)
    expect(escuroAtivo('sistema')).toBe(true)
    sistemaEscuro(false)
    expect(escuroAtivo('sistema')).toBe(false)
  })

  it('escuro e claro ligam e desligam a classe dark', () => {
    sistemaEscuro(false)
    aplicarTema('escuro')
    expect(document.documentElement).toHaveClass('dark')
    aplicarTema('claro')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('o botão da barra de cima alterna Claro → Escuro → Sistema e guarda a escolha', async () => {
    sistemaEscuro(false)
    localStorage.setItem(CHAVE_TEMA, 'claro')
    render(
      <AuthContext.Provider value={{ perfil: { papel: 'gestor', consultoria: { nome: 'Exemplo' } } }}>
        <MemoryRouter>
          <BarraTopo aoAbrirMenu={() => {}} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Tema: Claro/ }))
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('escuro')
    expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(screen.getByRole('button', { name: /Tema: Escuro/ }))
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('sistema')
    expect(screen.getByRole('button', { name: /Tema: Sistema/ })).toBeInTheDocument()
  })
})
