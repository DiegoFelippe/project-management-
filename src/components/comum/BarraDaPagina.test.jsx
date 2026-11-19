import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarraDaPagina from './BarraDaPagina'
import BarraDeFiltros from './BarraDeFiltros'

describe('BarraDaPagina', () => {
  it('é o mesmo cartão da BarraDeFiltros (que é feita com ela)', () => {
    const { container } = render(<><BarraDaPagina><span>a</span></BarraDaPagina><BarraDeFiltros><span>b</span></BarraDeFiltros></>)
    const [pagina, filtros] = container.children
    expect(pagina.className).toBe(filtros.className)
    expect(pagina).toHaveClass('card', 'mb-4', 'flex', 'flex-wrap', 'items-center', 'gap-3', 'p-3')
  })

  it('não tem o rótulo "Filtros"', () => {
    render(<BarraDaPagina><span>a</span></BarraDaPagina>)
    expect(screen.queryByText('Filtros')).not.toBeInTheDocument()
  })

  it('com `rotulo` vira uma região com nome; sem ele, não', () => {
    const { unmount } = render(<BarraDaPagina rotulo="Abas e ações"><span>a</span></BarraDaPagina>)
    expect(screen.getByRole('region', { name: 'Abas e ações' })).toBeInTheDocument()
    unmount()
    render(<BarraDaPagina><span>a</span></BarraDaPagina>)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('aceita classes a mais (ex.: mb-0 dentro de uma grade com gap)', () => {
    const { container } = render(<BarraDaPagina className="mb-0"><span>a</span></BarraDaPagina>)
    expect(container.firstChild).toHaveClass('mb-0')
    expect(container.firstChild).not.toHaveClass('mb-4')
  })
})
