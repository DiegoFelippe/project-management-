import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import GraficoDeMeses from './GraficoDeMeses'

const MESES = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01'].map((mes, i) => ({
  mes, realizado: 100 * (i + 1), capacidade: i === 5 ? 700 : 1000, no_periodo: i === 5, parcial: i === 5,
}))
const painel = (extra = {}) => ({
  recorte: 'consultoria', intervalo: false, mes: '2026-11-01', ate_efetivo: '2026-11-17', horas_por_mes: MESES,
  indicadores: { realizado: 600, capacidade_ate_hoje: 700 }, ...extra,
})
const MES = { tipo: 'mes', mes: '2026-11-01' }
const cartao = () => screen.getByRole('region', { name: 'Realizado × capacidade por mês' })
const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim()

describe('GraficoDeMeses', () => {
  it('capacidade por mês e o mês parcial tracejado com "Capacidade até 17/11" na legenda', async () => {
    render(<GraficoDeMeses painel={painel()} periodo={MES} />)
    const grafico = within(cartao()).getByRole('group', { name: 'Realizado e capacidade por mês' })
    expect(grafico.querySelectorAll('[data-coluna]')).toHaveLength(6)
    expect(grafico.querySelectorAll('[data-ponto-referencia]')).toHaveLength(6)
    expect(grafico.querySelector('[data-referencia-tracejada]')).not.toBeNull()
    const legenda = within(cartao()).getByRole('list', { name: 'Legenda' })
    expect(within(legenda).getByText('Capacidade até 17/11')).toBeInTheDocument()
    expect(within(legenda).getByText('Fora do período')).toBeInTheDocument()
    expect(within(cartao()).getByRole('img', { name: 'nov/26: 600 h de 700 h' })).toBeInTheDocument()

    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Realizado e capacidade por mês' })
    expect(within(tabela).getByRole('cell', { name: 'Novembro de 2026 (até 17/11)' })).toBeInTheDocument()
    expect(within(tabela).getByRole('cell', { name: '86%' })).toBeInTheDocument()
  })

  it('R7: tudo zero mostra a frase e a capacidade em texto, sem gráfico', () => {
    render(<GraficoDeMeses periodo={MES} painel={painel({ horas_por_mes: MESES.map((m) => ({ ...m, realizado: 0 })), indicadores: { realizado: 0, capacidade_ate_hoje: 700 } })} />)
    expect(within(cartao()).getByText('Sem horas nos últimos 6 meses.')).toBeInTheDocument()
    expect(texto(within(cartao()).getByText(/Capacidade de novembro/))).toBe('Capacidade de novembro até hoje: 700 h')
    expect(within(cartao()).queryByRole('group', { name: 'Realizado e capacidade por mês' })).toBeNull()
    expect(within(cartao()).queryByRole('button', { name: 'Ver em tabela' })).toBeNull()
  })

  it('leitura com livres e com acima', () => {
    const { rerender } = render(<GraficoDeMeses painel={painel()} periodo={MES} />)
    expect(within(cartao()).getByText(/livres/).textContent).toBe('No mês: 600 h de 700 h (86%) · 100 h livres')
    rerender(<GraficoDeMeses painel={painel({ indicadores: { realizado: 800, capacidade_ate_hoje: 700 } })} periodo={{ tipo: 'ano' }} />)
    expect(within(cartao()).getByText(/acima da capacidade/).textContent).toBe('No ano: 800 h de 700 h (114%) · 100 h acima da capacidade')
  })

  it('carregando (com a legenda reservada) e erro com "Tentar de novo"', async () => {
    const aoTentarDeNovo = vi.fn()
    const { rerender, container } = render(<GraficoDeMeses painel={null} />)
    expect(within(cartao()).getByRole('status')).toHaveTextContent('Carregando…')
    expect(container.querySelector('[data-reserva="legenda"]')).not.toBeNull()
    rerender(<GraficoDeMeses painel={null} erro aoTentarDeNovo={aoTentarDeNovo} />)
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })
})
