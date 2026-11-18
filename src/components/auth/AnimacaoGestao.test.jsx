import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AnimacaoGestao from './AnimacaoGestao'

describe('AnimacaoGestao', () => {
  it('é só enfeite: leitores de tela ignoram', () => {
    const { container } = render(<AnimacaoGestao />)
    const raiz = container.querySelector('[data-animacao-gestao]')
    expect(raiz).toHaveAttribute('aria-hidden', 'true')
  })

  it('mostra a rede da consultoria e os quatro cartões com o que o app faz', () => {
    const { container } = render(<AnimacaoGestao />)
    expect(container.querySelectorAll('[data-no]')).toHaveLength(5)
    expect(container.querySelectorAll('[data-cartao]')).toHaveLength(4)
    for (const texto of ['Clientes', 'Times', 'Check-ins', 'Agenda', 'Clientes em atendimento', 'Check-ins da semana', 'Ocupação do time', 'Agenda de hoje']) {
      expect(container).toHaveTextContent(texto)
    }
  })

  it('não promete o que o app não tem (auditoria, R10)', () => {
    const { container } = render(<AnimacaoGestao />)
    for (const texto of ['Projetos', 'Sprint', 'Metas', 'Empresas', 'Crescimento']) {
      expect(container.textContent).not.toContain(texto)
    }
  })
})
