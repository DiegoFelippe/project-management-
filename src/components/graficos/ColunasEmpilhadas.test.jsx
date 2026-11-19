import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { simularResizeObserver } from '@/test/resizeObserver'
import ColunasEmpilhadas from './ColunasEmpilhadas'
import { COR_OUTROS, corDaSerie } from './cores'

const SEMANAS = ['03/11', '10/11', '17/11']
const SERIES = [
  { nome: 'Ana Lima', cor: corDaSerie(0), valores: [18, 20, 0] },
  { nome: 'Bruno Costa', cor: corDaSerie(1), valores: [14, 12, 5] },
  { nome: 'Outros', cor: COR_OUTROS, valores: [2, 0, 1] },
]
const desenhar = (props = {}) => render(<ColunasEmpilhadas rotulo="Horas por consultor por semana" categorias={SEMANAS} series={SERIES} {...props} />)
const grafico = () => screen.getByRole('group', { name: 'Horas por consultor por semana' })

afterEach(() => vi.unstubAllGlobals())

describe('ColunasEmpilhadas', () => {
  it('uma coluna focável por categoria, com o total e as séries no aria-label', () => {
    desenhar()
    const colunas = within(grafico()).getAllByRole('img')
    expect(colunas.map((c) => c.getAttribute('aria-label'))).toEqual([
      '03/11: 34 h (Ana Lima 18 h, Bruno Costa 14 h, Outros 2 h)',
      '10/11: 32 h (Ana Lima 20 h, Bruno Costa 12 h)',
      '17/11: 6 h (Bruno Costa 5 h, Outros 1 h)',
    ])
    for (const c of colunas) expect(c).toHaveAttribute('tabindex', '0')
  })

  it('as séries empilham de baixo para cima na ordem dada, cada uma na sua cor; zero não desenha; a de cima tem a ponta arredondada', () => {
    desenhar()
    const [primeira, , terceira] = within(grafico()).getAllByRole('img')
    const segmentos = [...primeira.querySelectorAll('[data-segmento]')]
    expect(segmentos.map((s) => s.dataset.segmento)).toEqual(['Ana Lima', 'Bruno Costa', 'Outros'])
    expect(segmentos[0].style.fill).toBe('var(--cor-azul-forte)')
    expect(segmentos[2].style.fill).toBe('var(--cor-grafite-forte)')
    // Cada segmento começa onde o de baixo acaba (a base dele é o topo do anterior).
    const topo = (s) => Number(/V([\d.]+)/.exec(s.getAttribute('d'))[1])
    const base = (s) => Number(/^M[\d.]+,([\d.]+)/.exec(s.getAttribute('d'))[1])
    expect(base(segmentos[1])).toBeCloseTo(topo(segmentos[0]), 5)
    expect(segmentos[2].getAttribute('d')).toMatch(/A4,4 0 0 1/)
    expect(segmentos[0].getAttribute('d')).not.toMatch(/A4,4/)
    expect([...terceira.querySelectorAll('[data-segmento]')].map((s) => s.dataset.segmento)).toEqual(['Bruno Costa', 'Outros'])
  })

  it('cresce em onda da esquerda para a direita (grafico-onda com --i)', () => {
    desenhar()
    const ondas = grafico().querySelectorAll('.grafico-onda')
    expect(ondas).toHaveLength(3)
    expect(ondas[2].style.getPropertyValue('--i')).toBe('2')
  })

  it('dica no foco: a categoria, cada série com a cor e o total; Esc fecha', async () => {
    desenhar()
    await userEvent.tab()
    expect(within(grafico()).getByRole('img', { name: /^03\/11/ })).toHaveFocus()
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('03/11')).toBeInTheDocument()
    expect(within(dica).getByText('Ana Lima')).toBeInTheDocument()
    expect(within(dica).getByText('18 h')).toBeInTheDocument()
    expect(within(dica).getByText('34 h')).toBeInTheDocument()
    expect(within(dica).getByText('total')).toBeInTheDocument()
    await userEvent.tab()
    expect(within(screen.getByRole('tooltip')).getByText('10/11')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('a dica também no mouse e some ao sair', async () => {
    desenhar()
    const coluna = within(grafico()).getByRole('img', { name: /^17\/11/ })
    await userEvent.hover(coluna)
    expect(within(screen.getByRole('tooltip')).getByText('17/11')).toBeInTheDocument()
    await userEvent.unhover(coluna)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('destaque: o rótulo da categoria em evidência (a semana atual)', () => {
    desenhar({ destaque: 2 })
    const rotulos = [...grafico().querySelectorAll('[data-rotulo-x]')]
    expect(rotulos[2]).toHaveClass('fill-foreground', 'font-semibold')
    expect(rotulos[0]).toHaveClass('fill-muted-foreground')
  })

  it('nome longo inteiro na dica', async () => {
    const nome = 'Consultoria Regional de Telecomunicações do Oeste Catarinense'
    desenhar({ series: [{ nome, cor: corDaSerie(0), valores: [3, 4, 5] }] })
    await userEvent.tab()
    expect(within(screen.getByRole('tooltip')).getByText(nome)).toBeInTheDocument()
  })

  it('SVG na largura medida, sem viewBox; texto em 11 px', () => {
    const { redimensionar } = simularResizeObserver()
    desenhar()
    redimensionar(360)
    expect(grafico()).toHaveAttribute('width', '360')
    expect(grafico()).not.toHaveAttribute('viewBox')
    for (const t of grafico().querySelectorAll('text')) expect(t).toHaveAttribute('font-size', '11')
  })

  it('tudo zero (ou sem categorias) não desenha nada: o cartão mostra o vazio', () => {
    const { container } = render(<ColunasEmpilhadas rotulo="Zero" categorias={SEMANAS} series={SERIES.map((s) => ({ ...s, valores: [0, 0, 0] }))} />)
    expect(container).toBeEmptyDOMElement()
    const { container: semNada } = render(<ColunasEmpilhadas rotulo="Sem" categorias={[]} series={[]} />)
    expect(semNada).toBeEmptyDOMElement()
  })
})
