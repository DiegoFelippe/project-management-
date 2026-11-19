import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import HorasNoPeriodoDoPainel from './HorasNoPeriodoDoPainel'

const MES = { tipo: 'mes', mes: '2026-11-01', de: '2026-11-01', ate: '2026-11-30' }
// Novembro: 10 h por dia até o dia 19 (hoje).
const dias = (n, horas, ate = n) => Array.from({ length: n }, (_, i) => ({ dia: `2026-11-${String(i + 1).padStart(2, '0')}`, horas: i < ate ? horas : 0 }))
const NOV = (extra = {}) => ({ dias: dias(30, 10, 19), capacidade: 400, hoje: '2026-11-19', ...extra })
const ver = (props) => renderizarTela(<HorasNoPeriodoDoPainel periodo={MES} {...props} />, { perfil: {} })
const cartao = (nome = 'Horas no mês × capacidade') => screen.getByRole('region', { name: nome })

describe('HorasNoPeriodoDoPainel', () => {
  it('Mês em andamento: o acumulado até hoje, a projeção tracejada no ritmo de hoje, a capacidade e a leitura do banco', () => {
    ver({ dados: NOV() })
    const grafico = within(cartao()).getByRole('group', { name: 'Horas no mês: 190 h até hoje de 400 h de capacidade' })
    expect(within(cartao()).getByText(/No ritmo de hoje/).textContent).toBe('No ritmo de hoje, o mês fecha com ≈ 300 h: 75% da capacidade (400 h)')
    const realizado = grafico.querySelector('[data-serie="0"]')
    const projecao = grafico.querySelector('[data-serie="1"]')
    expect(realizado.getAttribute('d').split('L')).toHaveLength(19)
    expect(projecao).toHaveAttribute('stroke-dasharray', '5 4')
    // Abaixo da capacidade, a projeção fica na cor da série.
    expect(projecao.style.stroke).toBe('')
    expect(grafico.querySelector('[data-referencia-horizontal]')).not.toBeNull()
    expect(within(grafico).getByText('Capacidade 400 h')).toBeInTheDocument()
    expect(within(cartao()).getByText('Projeção no ritmo de hoje')).toBeInTheDocument()
  })

  it('a projeção que passa da capacidade fica vermelha (linha e legenda)', () => {
    ver({ dados: NOV({ capacidade: 250 }) })
    expect(cartao().querySelector('[data-serie="1"]').style.stroke).toBe('var(--grafico-acima)')
    expect(within(cartao()).getByText(/No ritmo de hoje/).textContent).toBe('No ritmo de hoje, o mês fecha com ≈ 300 h: 120% da capacidade (250 h)')
  })

  it('Ver em tabela: no Mês, cada dia até hoje com o do dia, o acumulado e a parte da capacidade', async () => {
    ver({ dados: NOV() })
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Horas por dia' })
    const linhas = [...tabela.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))
    expect(linhas).toHaveLength(19)
    expect(linhas[0]).toEqual(['01/11', '10 h', '10 h', '3%'])
    expect(linhas[18]).toEqual(['19/11', '10 h', '190 h', '48%'])
  })

  it('período que já acabou: sem projeção; na tabela só os dias com horas', async () => {
    const periodo = { tipo: 'personalizado', de: '2026-10-01', ate: '2026-10-31' }
    const outubro = Array.from({ length: 31 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, '0')}`, horas: i === 4 ? 2.5 : i === 9 ? 4 : 0 }))
    ver({ dados: { dias: outubro, capacidade: 0, hoje: '2026-11-19' }, periodo })
    expect(cartao('Horas no período × capacidade').querySelector('[data-serie="1"]')).toBeNull()
    expect(within(cartao('Horas no período × capacidade')).getByText(/No período/).textContent).toBe('No período: 6,5 h')
    await userEvent.click(screen.getByRole('button', { name: 'Ver em tabela' }))
    const linhas = [...screen.getByRole('table').querySelectorAll('tbody tr')].map((tr) => tr.firstElementChild.textContent)
    expect(linhas).toEqual(['05/10/2026', '10/10/2026'])
  })

  it('sem horas: o vazio do cartão (nada de linha em zero)', () => {
    ver({ dados: NOV({ dias: dias(30, 0) }) })
    expect(within(cartao()).getByText('Nenhuma hora no mês.')).toBeInTheDocument()
    expect(within(cartao()).queryByRole('group')).toBeNull()
  })

  it('menos de 0,1 h (um check-in de minutos) também é vazio, como nos blocos que o banco arredonda a 1 casa (nada de "≈ 0 h")', () => {
    ver({ dados: NOV({ dias: dias(30, 0).map((d, i) => (i === 3 ? { ...d, horas: 0.04 } : d)) }) })
    expect(within(cartao()).getByText('Nenhuma hora no mês.')).toBeInTheDocument()
  })

  it('carregando e erro com "Tentar de novo"', async () => {
    const aoTentarDeNovo = vi.fn()
    const { rerender } = ver({ dados: null })
    expect(within(cartao()).getByRole('status')).toBeInTheDocument()
    rerender(<HorasNoPeriodoDoPainel periodo={MES} dados={null} erro aoTentarDeNovo={aoTentarDeNovo} />)
    expect(within(cartao()).getByRole('alert')).toHaveTextContent('Não foi possível carregar as horas do período.')
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })
})
