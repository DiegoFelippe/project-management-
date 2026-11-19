import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { simularResizeObserver } from '@/test/resizeObserver'
import MapaDeCalor from './MapaDeCalor'

const LINHAS = ['seg', 'ter', 'qua']
const COLUNAS = ['8h', '9h', '10h', '11h']
const VALORES = [[0, 2, 12, 1], [3, 0, 0, 4], [0, 0, 6, 0]]
const desenhar = (props = {}) => render(
  <MapaDeCalor rotulo="Quando os check-ins acontecem" linhas={LINHAS} colunas={COLUNAS} valores={VALORES}
    cor="var(--cor-violeta-forte)" unidade="check-ins" {...props} />,
)
const grafico = () => screen.getByRole('group', { name: 'Quando os check-ins acontecem' })
const alvo = () => within(grafico()).getByRole('img')
const anuncio = () => grafico().parentElement.querySelector('[aria-live="polite"]')
const celula = (i, j) => grafico().querySelector(`[data-celula="${i}-${j}"]`)

afterEach(() => vi.unstubAllGlobals())

describe('MapaDeCalor', () => {
  it('uma célula por linha × coluna; zero no fundo afundado, o resto numa cor só com a força do valor', () => {
    desenhar()
    expect(grafico().querySelectorAll('[data-celula]')).toHaveLength(12)
    expect(celula(0, 0)).toHaveClass('fill-muted')
    expect(celula(0, 0).style.fill).toBe('')
    expect(celula(0, 2).style.fill).toBe('var(--cor-violeta-forte)')
    expect(Number(celula(0, 2).getAttribute('fill-opacity'))).toBe(1) // o maior
    expect(Number(celula(0, 3).getAttribute('fill-opacity'))).toBeLessThan(Number(celula(1, 0).getAttribute('fill-opacity')))
    // Entram em cascata (opacidade), em diagonal.
    expect(celula(1, 2)).toHaveClass('grafico-cascata')
    expect(celula(1, 2).style.getPropertyValue('--i')).toBe('3')
  })

  it('um alvo focável só; as setas ← → ↑ ↓ andam de célula, Home e End vão ao começo e ao fim da linha', async () => {
    desenhar()
    expect(within(grafico()).getAllByRole('img')).toHaveLength(1)
    await userEvent.tab()
    expect(alvo()).toHaveFocus()
    expect(within(screen.getByRole('tooltip')).getByText('seg, 8h')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(anuncio()).toHaveTextContent('seg, 10h: 12 check-ins')
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('seg, 10h')).toBeInTheDocument()
    expect(within(dica).getByText('12 check-ins')).toBeInTheDocument()
    expect(grafico().querySelector('[data-cursor]')).toHaveAttribute('visibility', 'visible')
    await userEvent.keyboard('{ArrowDown}')
    expect(anuncio()).toHaveTextContent('ter, 10h: 0 check-ins')
    await userEvent.keyboard('{End}')
    expect(anuncio()).toHaveTextContent('ter, 11h: 4 check-ins')
    await userEvent.keyboard('{ArrowRight}') // na borda, fica
    expect(anuncio()).toHaveTextContent('ter, 11h: 4 check-ins')
    await userEvent.keyboard('{Home}{ArrowUp}{ArrowUp}')
    expect(anuncio()).toHaveTextContent('seg, 8h: 0 check-ins')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(grafico().querySelector('[data-cursor]')).toHaveAttribute('visibility', 'hidden')
    expect(alvo()).toHaveFocus()
  })

  it('mouse e toque: a dica da célula embaixo do ponteiro', () => {
    desenhar()
    const c = celula(2, 2)
    const x = Number(c.getAttribute('x')) + Number(c.getAttribute('width')) / 2
    const y = Number(c.getAttribute('y')) + Number(c.getAttribute('height')) / 2
    fireEvent.pointerMove(alvo(), { clientX: x, clientY: y })
    expect(within(screen.getByRole('tooltip')).getByText('qua, 10h')).toBeInTheDocument()
    expect(within(screen.getByRole('tooltip')).getByText('6 check-ins')).toBeInTheDocument()
    fireEvent.pointerDown(document.body, { pointerType: 'touch' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.pointerDown(alvo(), { pointerType: 'touch', clientX: Number(celula(1, 0).getAttribute('x')) + 2, clientY: Number(celula(1, 0).getAttribute('y')) + 2 })
    expect(within(screen.getByRole('tooltip')).getByText('ter, 8h')).toBeInTheDocument()
  })

  it('tudo zero: só o fundo (nenhuma célula colorida)', () => {
    desenhar({ valores: VALORES.map((l) => l.map(() => 0)) })
    for (const c of grafico().querySelectorAll('[data-celula]')) {
      expect(c).toHaveClass('fill-muted')
      expect(c.style.fill).toBe('')
      expect(c.getAttribute('fill-opacity')).toBeNull()
    }
  })

  it('rotulosX escolhe quais rótulos do eixo X aparecem (os nomes inteiros continuam na dica)', () => {
    desenhar({ rotulosX: ['8h', '', '10h', ''] })
    expect([...grafico().querySelectorAll('[data-rotulo-x]')].map((t) => t.textContent)).toEqual(['8h', '10h'])
    expect([...grafico().querySelectorAll('[data-rotulo-y]')].map((t) => t.textContent)).toEqual(LINHAS)
  })

  it('SVG na largura medida, sem viewBox; texto em 11 px; 53 semanas a 300 px cabem sem rolar', () => {
    const { redimensionar } = simularResizeObserver()
    const semanas = Array.from({ length: 53 }, (_, i) => `semana ${i + 1}`)
    render(<MapaDeCalor rotulo="Dias com check-in" linhas={['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']} colunas={semanas}
      valores={Array.from({ length: 7 }, (_, i) => semanas.map((_, j) => (i + j) % 3))} cor="var(--cor-turquesa-forte)" unidade="h" />)
    redimensionar(300)
    const svg = screen.getByRole('group', { name: 'Dias com check-in' })
    expect(svg).toHaveAttribute('width', '300')
    expect(svg).not.toHaveAttribute('viewBox')
    for (const t of svg.querySelectorAll('text')) expect(t).toHaveAttribute('font-size', '11')
    const ultima = svg.querySelector('[data-celula="6-52"]')
    expect(Number(ultima.getAttribute('x')) + Number(ultima.getAttribute('width'))).toBeLessThanOrEqual(300)
    expect(Number(ultima.getAttribute('width'))).toBeGreaterThan(0)
    // Rótulos do eixo X com 44 px entre eles.
    const xs = [...svg.querySelectorAll('[data-rotulo-x]')].map((t) => Number(t.getAttribute('x')))
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(44)
  })

  it('sem linhas ou colunas, nada', () => {
    const { container } = render(<MapaDeCalor rotulo="Nada" linhas={[]} colunas={[]} valores={[]} cor="var(--cor-azul-forte)" />)
    expect(container).toBeEmptyDOMElement()
  })
})
