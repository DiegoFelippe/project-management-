import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CheckinsPorSemana from './CheckinsPorSemana'

const SEMANAS = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']
const dados = (extra = {}) => ({
  semanas: SEMANAS.map((semana, i) => ({ semana, checkins: [10, 12, 48, 20, 22, 30, 25, 6][i], horas: 10 * i, no_periodo: i >= 4, parcial: i === 7 })),
  media: 25.7, pico: { semana: '2026-10-12', checkins: 48 }, ...extra,
})
const MES = { tipo: 'mes', mes: '2026-11-01' }
const cartao = () => screen.getByRole('region', { name: 'Check-ins por semana' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-18T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('CheckinsPorSemana', () => {
  it('faixa do período, semana parcial tracejada com "6 até hoje" e o pico', () => {
    render(<CheckinsPorSemana dados={dados()} periodo={MES} />)
    const grafico = within(cartao()).getByRole('group', { name: 'Check-ins por semana' })
    expect(grafico.querySelector('[data-faixa]')).not.toBeNull()
    expect(grafico.querySelector('[data-serie="1"]')).toHaveAttribute('stroke-dasharray', '5 4')
    const marcas = [...grafico.querySelectorAll('[data-marca] text')].map((t) => t.textContent)
    expect(marcas).toEqual(['6 até hoje', 'pico 48'])
    const legenda = within(cartao()).getByRole('list', { name: 'Legenda' })
    expect(within(legenda).getByText('Semana em andamento')).toBeInTheDocument()
    expect(within(legenda).getByText('Semanas do período')).toBeInTheDocument()
    expect(within(cartao()).getByText(/Média de/).textContent).toBe('Média de 26 por semana no mês · pico na semana de 12/10')
  })

  it('← → andam de semana em semana e a dica diz a semana (e "até hoje" na parcial)', () => {
    render(<CheckinsPorSemana dados={dados()} periodo={MES} />)
    const alvo = within(cartao()).getByRole('img', { name: /Check-ins por semana\. Use as setas/ })
    fireEvent.focus(alvo)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Semana de 16/11 (até 18/11)')
    fireEvent.keyDown(alvo, { key: 'ArrowLeft' })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Semana de 09/11')
    expect(screen.getByRole('tooltip')).toHaveTextContent('25 check-ins')
  })

  it('sem nenhum check-in: a frase no lugar do gráfico', () => {
    render(<CheckinsPorSemana dados={dados({ semanas: dados().semanas.map((s) => ({ ...s, checkins: 0 })), media: null, pico: null })} periodo={MES} />)
    expect(within(cartao()).getByText('Nenhum check-in no mês.')).toBeInTheDocument()
    expect(within(cartao()).queryByRole('group', { name: 'Check-ins por semana' })).toBeNull()
  })
})
