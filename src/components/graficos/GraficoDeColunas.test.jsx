import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { simularResizeObserver } from '@/test/resizeObserver'
import GraficoDeColunas from './GraficoDeColunas'

const MESES = ['jun/26', 'jul/26', 'ago/26', 'set/26', 'out/26', 'nov/26']
const itens = (n = 6, extra = () => ({})) => Array.from({ length: n }, (_, i) => ({
  chave: `m${i}`,
  rotulo: MESES[i] ?? `m${i}`,
  valor: 100 + i * 50,
  referencia: 400,
  aria: `${MESES[i] ?? `m${i}`}: ${100 + i * 50} h de 400 h`,
  dica: { titulo: `Mês ${i + 1}`, linhas: [{ valor: `${100 + i * 50} h`, rotulo: 'realizado', cor: 'serie' }] },
  ...extra(i),
}))

const grafico = () => screen.getByRole('group', { name: 'Realizado e capacidade por mês' })

afterEach(() => vi.unstubAllGlobals())

describe('GraficoDeColunas', () => {
  it('uma coluna por item, no máximo 24 px, ponta arredondada e base reta', () => {
    render(<GraficoDeColunas itens={itens()} rotuloAria="Realizado e capacidade por mês" />)
    const colunas = grafico().querySelectorAll('[data-coluna]')
    expect(colunas).toHaveLength(6)
    for (const coluna of colunas) {
      expect(Number(coluna.dataset.largura)).toBeLessThanOrEqual(24)
      const d = coluna.getAttribute('d')
      expect(d).toMatch(/A4,4 0 0 1/) // cantos de cima com raio de 4
      expect(d).toMatch(/V[\d.]+Z$/) // desce reto até a base
      expect(coluna).toHaveClass('fill-grafico-serie')
    }
  })

  it('coluna esmaecida (fora do período) mais clara', () => {
    render(<GraficoDeColunas itens={itens(6, (i) => ({ esmaecido: i < 2 }))} rotuloAria="Realizado e capacidade por mês" />)
    const colunas = grafico().querySelectorAll('[data-coluna]')
    expect(colunas[0]).toHaveAttribute('fill-opacity', '0.42')
    expect(colunas[5]).not.toHaveAttribute('fill-opacity')
  })

  it('linha de referência com um ponto por item e o último trecho tracejado com ponto vazado quando parcial', () => {
    const { rerender } = render(<GraficoDeColunas linhaDeReferencia itens={itens()} rotuloAria="Realizado e capacidade por mês" />)
    expect(grafico().querySelectorAll('[data-ponto-referencia]')).toHaveLength(6)
    expect(grafico().querySelector('[data-referencia-tracejada]')).toBeNull()

    rerender(<GraficoDeColunas linhaDeReferencia itens={itens(6, (i) => ({ parcial: i === 5, referencia: i === 5 ? 250 : 400 }))} rotuloAria="Realizado e capacidade por mês" />)
    const pontos = grafico().querySelectorAll('[data-ponto-referencia]')
    expect(pontos).toHaveLength(6)
    const cheia = grafico().querySelector('[data-referencia]')
    expect(cheia.getAttribute('points').trim().split(/\s+/)).toHaveLength(5)
    const tracejada = grafico().querySelector('[data-referencia-tracejada]')
    expect(tracejada).toHaveAttribute('stroke-dasharray', '5 4')
    expect(tracejada.getAttribute('points').trim().split(/\s+/)).toHaveLength(2)
    expect(pontos[5]).toHaveClass('fill-card', 'stroke-grafico-ref')
    expect(pontos[4]).toHaveClass('fill-grafico-ref', 'stroke-card')
  })

  it('referência horizontal (previsão) com o rótulo', () => {
    render(<GraficoDeColunas itens={itens()} referenciaHorizontal={{ valor: 300, rotulo: 'Previsão 30 h' }} rotuloAria="Realizado e capacidade por mês" />)
    expect(grafico().querySelector('[data-referencia-horizontal]')).toHaveClass('stroke-grafico-ref')
    expect(within(grafico()).getByText('Previsão 30 h')).toBeInTheDocument()
  })

  it('todo <text> com font-size 11 e o SVG com width = largura medida (sem viewBox que estica)', () => {
    const { redimensionar } = simularResizeObserver()
    render(<GraficoDeColunas linhaDeReferencia itens={itens(6, (i) => ({ rotuloNaColuna: i === 5 ? '350' : undefined }))}
      referenciaHorizontal={{ valor: 300, rotulo: 'Previsão 30 h' }} rotuloAria="Realizado e capacidade por mês" />)
    redimensionar(512)
    const svg = grafico()
    expect(svg.tagName).toBe('svg')
    expect(svg).toHaveAttribute('width', '512')
    expect(svg).toHaveAttribute('height', '210')
    expect(svg).not.toHaveAttribute('viewBox')
    expect(svg).not.toHaveAttribute('preserveAspectRatio')
    const textos = svg.querySelectorAll('text')
    expect(textos.length).toBeGreaterThan(8)
    for (const t of textos) expect(t).toHaveAttribute('font-size', '11')
    expect(within(svg).getByText('350')).toHaveClass('fill-foreground', 'font-semibold')
  })

  it('coluna focável com aria-label; a dica aparece no foco e some com Esc', async () => {
    render(<GraficoDeColunas itens={itens()} rotuloAria="Realizado e capacidade por mês" />)
    await userEvent.tab()
    const primeira = within(grafico()).getByRole('img', { name: 'jun/26: 100 h de 400 h' })
    expect(primeira).toHaveFocus()
    const dica = screen.getByRole('tooltip')
    expect(within(dica).getByText('Mês 1')).toBeInTheDocument()
    expect(within(dica).getByText('100 h')).toBeInTheDocument()
    await userEvent.tab()
    expect(within(screen.getByRole('tooltip')).getByText('Mês 2')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('a dica também no mouse (ponteiro sobre a coluna) e some ao sair', async () => {
    render(<GraficoDeColunas itens={itens()} rotuloAria="Realizado e capacidade por mês" />)
    const terceira = within(grafico()).getByRole('img', { name: 'ago/26: 200 h de 400 h' })
    await userEvent.hover(terceira)
    expect(within(screen.getByRole('tooltip')).getByText('Mês 3')).toBeInTheDocument()
    await userEvent.unhover(terceira)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('24 itens a 320 px: rótulos a cada N (44 px entre eles), sempre o último', () => {
    const { redimensionar } = simularResizeObserver()
    render(<GraficoDeColunas itens={itens(24)} rotuloAria="Realizado e capacidade por mês" />)
    redimensionar(320)
    const rotulos = [...grafico().querySelectorAll('[data-rotulo-x]')]
    expect(rotulos.map((t) => t.textContent)).toEqual(['set/26', 'm8', 'm13', 'm18', 'm23'])
    const xs = rotulos.map((t) => Number(t.getAttribute('x')))
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(44)
    // Os valores continuam em cada coluna (aria-label e dica), mesmo sem o rótulo.
    expect(within(grafico()).getAllByRole('img')).toHaveLength(24)
  })
})
