import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AnimacaoGestao from './AnimacaoGestao'

describe('AnimacaoGestao', () => {
  it('é só enfeite: leitores de tela ignoram', () => {
    const { container } = render(<AnimacaoGestao />)
    const raiz = container.querySelector('[data-animacao-gestao]')
    expect(raiz).toHaveAttribute('aria-hidden', 'true')
  })

  it('mostra a rede da consultoria e os quatro cartões de gestão', () => {
    const { container } = render(<AnimacaoGestao />)
    expect(container.querySelectorAll('[data-no]')).toHaveLength(5)
    expect(container.querySelectorAll('[data-cartao]')).toHaveLength(4)
    expect(container).toHaveTextContent('Projetos no prazo')
    expect(container).toHaveTextContent('Crescimento')
  })
})
