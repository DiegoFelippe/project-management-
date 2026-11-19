import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { numeroDoCartao } from '@/test/cartoes'
import Indicadores from './Indicadores'

const IND = { realizado: 112, ocupacao: 0.65, clientes_em_atendimento: 12, aguardando: 4, checkins: 9 }
const painel = (recorte, extra = {}) => ({ recorte, passado: false, intervalo: false, indicadores: IND, ...extra })
const COMP = { de: '2026-10-01', ate: '2026-10-17', forma: 'mes_parcial', indicadores: { realizado: 100, ocupacao: 0.61, clientes_em_atendimento: 10, aguardando: 2, checkins: 8 } }
const rotulos = (regiao) => [...regiao.querySelectorAll('[data-cartao]')].map((c) => c.dataset.cartao)
const variacaoDe = (regiao, chave) => regiao.querySelector(`[data-cartao="${chave}"] [data-variacao]`)

describe('Indicadores', () => {
  it('central, gestão e consultor: os 4 cartões de cada papel, com a variação e o período anterior', () => {
    const { unmount } = render(<Indicadores painel={painel('tudo')} comparacao={COMP} papel="central" />)
    let regiao = screen.getByRole('region', { name: 'Indicadores do mês' })
    expect(rotulos(regiao)).toEqual(['realizado', 'ocupacao', 'clientes', 'aguardando'])
    expect(within(regiao).getByText('Aguardando (consultoria ou consultor)')).toBeInTheDocument()
    expect(variacaoDe(regiao, 'realizado')).toHaveTextContent('▲ 12%vs 1–17 de out.')
    expect(variacaoDe(regiao, 'ocupacao')).toHaveTextContent('▲ 4 p.p.')
    expect(variacaoDe(regiao, 'aguardando').querySelector('.text-destructive')).toHaveTextContent('▲ 2') // subir é ruim
    unmount()

    render(<Indicadores painel={painel('pessoa', { passado: true })} comparacao={COMP} papel="pessoa" />)
    regiao = screen.getByRole('region', { name: 'Indicadores do mês' })
    expect(rotulos(regiao)).toEqual(['realizado', 'ocupacao', 'clientes', 'checkins'])
    expect(within(regiao).getByText('Minha utilização')).toBeInTheDocument()
    expect(within(regiao).getByText('Meus clientes')).toBeInTheDocument()
    expect(numeroDoCartao(regiao, 'Check-ins')).toBe('9')
    expect(variacaoDe(regiao, 'checkins')).toHaveTextContent('▲ 13%')
  })

  it('"—" enquanto a comparação carrega; sem linha quando ela falha ou vem vazia (Mês futuro)', () => {
    const { rerender } = render(<Indicadores painel={painel('consultoria')} comparacao={null} papel="admin" />)
    const regiao = screen.getByRole('region', { name: 'Indicadores do mês' })
    expect(variacaoDe(regiao, 'realizado')).toHaveTextContent('—')
    expect(within(regiao).getByText('Aguardando consultor')).toBeInTheDocument()
    rerender(<Indicadores painel={painel('consultoria')} comparacao={undefined} papel="admin" />)
    expect(regiao.querySelector('[data-variacao]')).toBeNull()
    rerender(<Indicadores painel={painel('consultoria')} comparacao={{ de: null, ate: null, forma: null, indicadores: null }} papel="admin" />)
    expect(regiao.querySelector('[data-variacao]')).toBeNull()
    expect(numeroDoCartao(regiao, 'Realizado')).toBe('112 h')
  })

  it('carregando: rótulos pelo papel e pelo período, números "—"', () => {
    render(<Indicadores painel={null} comparacao={null} papel="central" passado intervalo />)
    const regiao = screen.getByRole('region', { name: 'Indicadores do período' })
    expect(numeroDoCartao(regiao, 'Utilização')).toBe('—')
    expect(within(regiao).getByText('Aguardando (consultoria ou consultor)')).toBeInTheDocument()
  })
})
