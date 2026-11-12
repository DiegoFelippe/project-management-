import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Carregando, { GraficoCarregando } from './Carregando'

describe('Carregando', () => {
  it('mostra o gráfico animado e avisa leitores de tela', () => {
    const { container } = render(<Carregando />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…')
    expect(container.querySelectorAll('[data-barra]')).toHaveLength(5)
  })

  it('versão pequena dentro das telas', () => {
    const { container } = render(<GraficoCarregando texto="Carregando os times…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando os times…')
    expect(container.querySelectorAll('[data-barra]')).toHaveLength(5)
  })
})
