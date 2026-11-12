import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthContext } from '../auth/useAuth'
import Inicio from './Inicio'

describe('Inicio', () => {
  it('cumprimenta e mostra o gráfico animado só como enfeite', () => {
    const perfil = { nome: 'Ana Lima', papel: 'pessoa', consultoria: { nome: 'Consultoria Exemplo' } }
    const { container } = render(
      <AuthContext.Provider value={{ perfil }}>
        <Inicio />
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('heading', { name: 'Olá, Ana.' })).toBeInTheDocument()
    const grafico = container.querySelector('[data-grafico-inicio]')
    expect(grafico).toHaveAttribute('aria-hidden', 'true')
    expect(grafico.querySelectorAll('[data-barra]').length).toBeGreaterThanOrEqual(6)
  })
})
