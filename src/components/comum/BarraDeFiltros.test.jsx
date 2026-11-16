import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AbasSegmentadas from './AbasSegmentadas'
import BarraDeFiltros, { AcaoPrincipal, CampoBusca } from './BarraDeFiltros'

describe('BarraDeFiltros', () => {
  it('mantém a ordem: abas, busca, filtros e a ação principal no fim', () => {
    render(
      <BarraDeFiltros>
        <AbasSegmentadas rotulo="Mostrar" abas={[{ valor: 'a', rotulo: 'Ativos' }]} valor="a" aoMudar={() => {}} />
        <CampoBusca rotulo="Buscar" placeholder="Buscar" valor="" aoMudar={() => {}} />
        <button type="button">Filtro</button>
        <AcaoPrincipal><button type="button">Novo</button></AcaoPrincipal>
      </BarraDeFiltros>,
    )
    const ordem = [
      screen.getByRole('group', { name: 'Mostrar' }),
      screen.getByRole('searchbox', { name: 'Buscar' }),
      screen.getByRole('button', { name: 'Filtro' }),
      screen.getByRole('button', { name: 'Novo' }),
    ]
    for (let i = 0; i < ordem.length - 1; i++) {
      expect(ordem[i].compareDocumentPosition(ordem[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Novo' }).parentElement).toHaveClass('ml-auto')
  })

  it('é um cartão que quebra linha em telas estreitas', () => {
    const { container } = render(<BarraDeFiltros><span>x</span></BarraDeFiltros>)
    expect(container.firstChild).toHaveClass('card', 'flex', 'flex-wrap')
  })

  it('a busca avisa o texto digitado', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const textos = []
    render(<CampoBusca rotulo="Buscar" valor="" aoMudar={(t) => textos.push(t)} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'ab')
    expect(textos).toEqual(['a', 'b'])
  })
})
