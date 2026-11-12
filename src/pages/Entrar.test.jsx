import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/useAuth'
import Entrar, { CHAVE_EMAIL_LEMBRADO } from './Entrar'

function montar() {
  const entrarComSenha = vi.fn().mockResolvedValue({ erro: null })
  render(
    <AuthContext.Provider value={{ carregando: false, sessao: null, perfil: null, entrarComSenha }}>
      <MemoryRouter>
        <Entrar />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return entrarComSenha
}

afterEach(() => localStorage.clear())

describe('Entrar: lembrar o e-mail', () => {
  it('preenche o e-mail lembrado', () => {
    localStorage.setItem(CHAVE_EMAIL_LEMBRADO, 'ana@exemplo.test')
    montar()
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.test')
    expect(screen.getByRole('checkbox', { name: 'Lembrar meu e-mail' })).toBeChecked()
  })

  it('guarda o e-mail ao entrar com a opção marcada', async () => {
    const entrarComSenha = montar()
    await userEvent.type(screen.getByLabelText('E-mail'), 'bruno@exemplo.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'exemplo-123')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar meu e-mail' }))
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(entrarComSenha).toHaveBeenCalledWith('bruno@exemplo.test', 'exemplo-123')
    expect(localStorage.getItem(CHAVE_EMAIL_LEMBRADO)).toBe('bruno@exemplo.test')
  })

  it('esquece o e-mail quando a opção é desmarcada', async () => {
    localStorage.setItem(CHAVE_EMAIL_LEMBRADO, 'ana@exemplo.test')
    montar()
    await userEvent.type(screen.getByLabelText('Senha'), 'exemplo-123')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar meu e-mail' }))
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(localStorage.getItem(CHAVE_EMAIL_LEMBRADO)).toBeNull()
  })

  it('a senha nunca é guardada pelo app', async () => {
    montar()
    await userEvent.type(screen.getByLabelText('E-mail'), 'bruno@exemplo.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'exemplo-123')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Lembrar meu e-mail' }))
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(JSON.stringify({ ...localStorage })).not.toContain('exemplo-123')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'username')
  })
})
