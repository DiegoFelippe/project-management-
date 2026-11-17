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
    expect(screen.getByText('previsão atual')).toBeInTheDocument()
    expect(container.querySelector('line[stroke-dasharray]')).not.toBeNull()
  })
  it('sem previsão, não desenha a linha', () => {
    const { container } = render(<HorasPorMes meses={meses} previsao={0} />)
    expect(screen.queryByText('previsão atual')).not.toBeInTheDocument()
    expect(container.querySelector('line[stroke-dasharray]')).toBeNull()
  })
  it('texto do gráfico com pelo menos 11 px de viewBox e viewBox estreito (legível no celular)', () => {
    const { container } = render(<HorasPorMes meses={meses} previsao={0} />)
    expect(container.querySelector('svg').getAttribute('viewBox')).toMatch(/^0 0 3\d\d /)
    for (const t of container.querySelectorAll('text')) expect(Number(t.getAttribute('font-size'))).toBeGreaterThanOrEqual(11)
  })
})
