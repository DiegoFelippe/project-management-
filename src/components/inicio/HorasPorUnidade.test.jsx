import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import HorasPorUnidade from './HorasPorUnidade'

const MES = { tipo: 'mes', mes: '2026-11-01', de: '2026-11-01', ate: '2026-11-30' }
const SEMANAS = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']
const GESTAO = {
  recorte: 'consultoria', semanas: SEMANAS,
  series: [
    { id: 'p1', nome: 'Ana Lima', horas: [10, 24, 8, 6] },
    { id: 'p2', nome: null, horas: [2, 3, 0, 0] }, // mudou de consultoria: o nome a gestão não vê
    { id: null, nome: 'Outros', horas: [1, 4, 1, 0] },
  ],
}
const ver = (props) => renderizarTela(<HorasPorUnidade periodo={MES} recorte="consultoria" {...props} />, { perfil: {} })
const cartao = (nome = 'Horas por consultor por semana') => screen.getByRole('region', { name: nome })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  return () => vi.useRealTimers()
})

describe('HorasPorUnidade', () => {
  it('gestão: uma coluna empilhada por semana, uma cor por consultor (Outros em grafite), a semana atual em destaque', () => {
    ver({ dados: GESTAO })
    expect(within(cartao()).getByText('Por semana, de segunda a domingo')).toBeInTheDocument()
    const grafico = within(cartao()).getByRole('group', { name: 'Horas por consultor por semana' })
    expect(within(grafico).getByRole('img', { name: '02/11: 31 h (Ana Lima 24 h, Outro consultor 3 h, Outros 4 h)' })).toBeInTheDocument()
    const coluna = within(grafico).getByRole('img', { name: /^02\/11/ })
    expect(coluna.querySelector('[data-segmento="Ana Lima"]').style.fill).toBe('var(--cor-azul-forte)')
    expect(coluna.querySelector('[data-segmento="Outro consultor"]').style.fill).toBe('var(--cor-turquesa-forte)')
    expect(coluna.querySelector('[data-segmento="Outros"]').style.fill).toBe('var(--cor-grafite-forte)')
    expect(within(grafico).getByText('16/11')).toHaveClass('font-semibold')
    const legenda = within(within(cartao()).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(legenda).toEqual(['Ana Lima', 'Outro consultor', 'Outros'])
    expect(within(cartao()).getByText(/Semana mais cheia/).textContent).toBe('Semana mais cheia: 02/11, com 31 h · Ana Lima, 24 h')
  })

  it('central: por consultoria', () => {
    ver({ recorte: 'tudo', dados: { ...GESTAO, recorte: 'tudo', series: [
      { id: 'k1', nome: 'Consultoria Exemplo', horas: [5, 5, 5, 5] }, { id: 'k2', nome: 'Consultoria Sul', horas: [1, 1, 1, 1] },
    ] } })
    expect(within(cartao('Horas por consultoria por semana')).getByRole('group', { name: 'Horas por consultoria por semana' })).toBeInTheDocument()
  })

  it('dois consultores sem nome visível: "Outro consultor" e "Outro consultor 2"', () => {
    ver({ dados: { ...GESTAO, series: [{ id: 'p1', nome: null, horas: [1, 1, 1, 1] }, { id: 'p2', nome: null, horas: [1, 0, 0, 0] }] } })
    const legenda = within(within(cartao()).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(legenda).toEqual(['Outro consultor', 'Outro consultor 2'])
  })

  it('Ver em tabela: uma linha por semana, uma coluna por consultor (nome inteiro) e o total', async () => {
    ver({ dados: GESTAO })
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Horas por consultor por semana' })
    expect(within(tabela).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Semana de', 'Ana Lima', 'Outro consultor', 'Outros', 'Total'])
    expect([...tabela.querySelectorAll('tbody tr')][1].textContent).toBe('02/1124 h3 h4 h31 h')
  })

  it('sem horas: o vazio do cartão; erro com "Tentar de novo"', async () => {
    const { unmount } = ver({ dados: { ...GESTAO, series: [] } })
    expect(within(cartao()).getByText('Nenhuma hora no mês.')).toBeInTheDocument()
    unmount()
    const aoTentarDeNovo = vi.fn()
    ver({ dados: null, erro: true, aoTentarDeNovo })
    expect(within(cartao()).getByRole('alert')).toHaveTextContent('Não foi possível carregar as horas por semana.')
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })
})
