import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/useAuth'
import EsqueciSenha from './EsqueciSenha'

describe('EsqueciSenha', () => {
  it('responde igual exista ou não o e-mail', async () => {
    const enviarRecuperacao = vi.fn().mockResolvedValue({ erro: null })
    render(
      <AuthContext.Provider value={{ carregando: false, sessao: null, perfil: null, enviarRecuperacao }}>
        <MemoryRouter>
          <EsqueciSenha />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.type(screen.getByLabelText('E-mail'), 'ninguem@exemplo.test')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }))
    expect(
      await screen.findByText('Se esse e-mail tiver acesso, enviamos um link para criar uma senha nova.'),
    ).toBeInTheDocument()
    expect(enviarRecuperacao).toHaveBeenCalledWith('ninguem@exemplo.test')
  })
})
