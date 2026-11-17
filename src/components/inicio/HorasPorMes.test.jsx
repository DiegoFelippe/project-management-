import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HorasPorMes from './HorasPorMes'

const meses = [['2026-06-01', 0], ['2026-07-01', 10], ['2026-08-01', 20], ['2026-09-01', 30], ['2026-10-01', 40], ['2026-11-01', 50]].map(([mes, realizado]) => ({ mes, realizado }))

describe('HorasPorMes', () => {
  it('descreve o gráfico, desenha uma barra por mês com horas e a linha da previsão atual', () => {
    const { container } = render(<HorasPorMes meses={meses} previsao={120} />)
    const grafico = screen.getByRole('img')
    expect(grafico).toHaveAttribute('aria-label', expect.stringContaining('nov/26: 50 h'))
    expect(grafico).toHaveAttribute('aria-label', expect.stringContaining('Previsão atual: 120 h'))
    expect(container.querySelectorAll('rect')).toHaveLength(5)
    expect(screen.getByText('previsão atual 120 h')).toBeInTheDocument()
    expect(container.querySelector('line[stroke-dasharray]')).not.toBeNull()
  })
  it('sem previsão, não desenha a linha', () => {
    const { container } = render(<HorasPorMes meses={meses} previsao={0} />)
    expect(screen.queryByText(/previsão atual/)).not.toBeInTheDocument()
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull()
  })
  it('período: os meses do período em destaque (no_periodo, do banco) e o subtítulo diz de quando a quando', () => {
    const doPeriodo = meses.map((m, i) => ({ ...m, no_periodo: i >= 4 }))
    const { container } = render(<HorasPorMes meses={doPeriodo} previsao={null} intervalo />)
    expect([...container.querySelectorAll('rect')].map((r) => r.getAttribute('fill-opacity'))).toEqual(['0.6', '0.6', '0.6', '1', '1'])
    expect(screen.getByText('Realizado de jun/26 a nov/26, mês a mês; em destaque, os meses do período')).toBeInTheDocument()
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull()
  })
  it('24 meses: rótulo de mês só a cada poucos meses (sempre o último), valores no título de cada barra e na descrição', () => {
    const anos = Array.from({ length: 24 }, (_, i) => {
      const data = new Date(Date.UTC(2024, 11 + i, 1))
      return { mes: data.toISOString().slice(0, 10), realizado: 1953.6, no_periodo: true }
    })
    const { container } = render(<HorasPorMes meses={anos} previsao={null} intervalo />)
    const rotulos = [...container.querySelectorAll('[data-rotulo-mes]')].map((li) => li.textContent).filter(Boolean)
    expect(rotulos.length).toBeLessThanOrEqual(6)
    expect(rotulos.at(-1)).toBe('nov/26')
    expect(screen.queryByText('1.953,6 h')).not.toBeInTheDocument()
    expect(container.querySelectorAll('rect title')).toHaveLength(24)
    expect(container.querySelector('rect title').textContent).toBe('dez/24: 1.953,6 h')
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringContaining('dez/24: 1.953,6 h'))
    for (const li of container.querySelectorAll('[data-rotulo-mes]')) expect(li).toHaveClass('text-legenda')
  })
  it('até 6 meses: um rótulo e um valor por mês, como antes', () => {
    const { container } = render(<HorasPorMes meses={meses} previsao={120} />)
    expect([...container.querySelectorAll('[data-rotulo-mes]')].map((li) => li.textContent)).toEqual(['jun/26', 'jul/26', 'ago/26', 'set/26', 'out/26', 'nov/26'])
    expect(screen.getByText('50 h')).toBeInTheDocument()
  })
  it('textos em HTML com a classe de legenda (não <text> do SVG), então não encolhem no celular', () => {
    const { container } = render(<HorasPorMes meses={meses} previsao={120} />)
    expect(container.querySelectorAll('svg text')).toHaveLength(0)
    expect(screen.getByText('nov/26')).toHaveClass('text-legenda')
    expect(screen.getByText('50 h')).toHaveClass('text-legenda')
    expect(screen.getByText('previsão atual 120 h')).toHaveClass('text-legenda')
  })
})
