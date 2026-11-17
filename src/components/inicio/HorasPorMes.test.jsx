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
  it('textos em HTML com a classe de legenda (não <text> do SVG), então não encolhem no celular', () => {
    const { container } = render(<HorasPorMes meses={meses} previsao={120} />)
    expect(container.querySelectorAll('svg text')).toHaveLength(0)
    expect(screen.getByText('nov/26')).toHaveClass('text-legenda')
    expect(screen.getByText('50 h')).toHaveClass('text-legenda')
    expect(screen.getByText('previsão atual 120 h')).toHaveClass('text-legenda')
  })
})
