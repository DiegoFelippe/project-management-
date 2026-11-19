import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FaixaDoInicio from './FaixaDoInicio'

describe('FaixaDoInicio', () => {
  it('mostra N clientes precisam de você e o Ver os N leva ao bloco', () => {
    document.body.innerHTML = '<div id="clientes-em-risco" tabindex="-1"></div>'
    const alvo = document.getElementById('clientes-em-risco')
    alvo.scrollIntoView = vi.fn()
    render(<FaixaDoInicio total={3} />, { container: document.body.appendChild(document.createElement('div')) })
    expect(screen.getByText(/3 clientes precisam de você/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver os 3' }))
    expect(alvo.scrollIntoView).toHaveBeenCalled()
    expect(document.activeElement).toBe(alvo)
  })

  it('singular e nada com 0 ou sem número', () => {
    const { rerender, container } = render(<FaixaDoInicio total={1} />)
    expect(screen.getByText(/1 cliente precisa de você/)).toBeInTheDocument()
    rerender(<FaixaDoInicio total={0} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<FaixaDoInicio total={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
