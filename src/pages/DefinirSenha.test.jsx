import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/useAuth'
import DefinirSenha from './DefinirSenha'

function montar(valor) {
  const auth = {
    carregando: false,
    sessao: null,
    perfil: null,
    definirSenha: vi.fn().mockResolvedValue({ erro: null }),
    recarregarPerfil: vi.fn(),
    ...valor,
  }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <DefinirSenha />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return auth
}

describe('DefinirSenha', () => {
  it('sem sessão avisa que o link venceu', () => {
    montar({})
    expect(screen.getByText('Esse link expirou ou já foi usado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/esqueci-senha')
  })

  it('com sessão mostra os campos da senha', () => {
    montar({ sessao: { user: { id: 'u1' } } })
    expect(screen.getByLabelText('Senha nova')).toBeInTheDocument()
    expect(screen.getByLabelText('Repita a senha')).toBeInTheDocument()
  })

  it('senhas diferentes não são enviadas', async () => {
    const auth = montar({ sessao: { user: { id: 'u1' } } })
    await userEvent.type(screen.getByLabelText('Senha nova'), 'abcdefgh')
    await userEvent.type(screen.getByLabelText('Repita a senha'), 'abcdefgi')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }))
    expect(screen.getByText('As senhas não são iguais.')).toBeInTheDocument()
    expect(auth.definirSenha).not.toHaveBeenCalled()
  })
})
