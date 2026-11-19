import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { numeroDoCartao } from '@/test/cartoes'
import Indicadores from './Indicadores'

const IND = { realizado: 112, ocupacao: 0.65, clientes_em_atendimento: 12, aguardando: 4, checkins: 9 }
const painel = (recorte, extra = {}) => ({ recorte, de: '2026-11-01', ate: '2026-11-30', passado: false, intervalo: false, indicadores: IND, ...extra })
const COMP = { de: '2026-10-01', ate: '2026-10-17', forma: 'mes_parcial', indicadores: { realizado: 100, ocupacao: 0.61, clientes_em_atendimento: 10, aguardando: 2, checkins: 8 } }
const rotulos = (regiao) => [...regiao.querySelectorAll('[data-cartao]')].map((c) => c.dataset.cartao)
const variacaoDe = (regiao, chave) => regiao.querySelector(`[data-cartao="${chave}"] [data-variacao]`)

const reduzirMovimento = () => vi.stubGlobal('matchMedia', vi.fn((consulta) => ({
  matches: consulta.includes('reduce'), media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn(),
})))

// Os números correm até o valor (useContagem): aqui, com "reduzir movimento", vêm prontos; o teste da contagem tira isso.
beforeEach(reduzirMovimento)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

  it('cores da paleta nos ícones (azul, violeta, turquesa, mostarda); ocupação acima de 100% fica no vermelho do perigo', () => {
    const { rerender } = render(<Indicadores painel={painel('consultoria')} comparacao={COMP} papel="admin" />)
    const regiao = screen.getByRole('region', { name: 'Indicadores do mês' })
    const icone = (chave) => regiao.querySelector(`[data-cartao="${chave}"] .icone-do-cartao`).parentElement
    expect(icone('realizado')).toHaveClass('bg-primary/10')
    expect(icone('ocupacao')).toHaveClass('bg-cor-violeta-suave', 'text-cor-violeta-texto')
    expect(icone('clientes')).toHaveClass('bg-cor-turquesa-suave')
    expect(icone('aguardando')).toHaveClass('bg-cor-mostarda-suave')
    rerender(<Indicadores painel={painel('consultoria', { indicadores: { ...IND, ocupacao: 1.2 } })} comparacao={COMP} papel="admin" />)
    expect(icone('ocupacao')).toHaveClass('bg-destructive/10')
  })

  it('os números correm até o valor; a releitura do mesmo período (check-in no Início) mostra o novo direto; outro período conta de novo', () => {
    vi.unstubAllGlobals()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const avancar = (ms) => act(() => vi.advanceTimersByTime(ms))
    const { rerender } = render(<Indicadores painel={painel('pessoa')} comparacao={COMP} papel="pessoa" />)
    const regiao = screen.getByRole('region', { name: 'Indicadores do mês' })
    expect(numeroDoCartao(regiao, 'Realizado')).toBe('0 h')
    // O leitor de tela recebe só o valor final.
    expect(within(regiao).getByText('112 h')).toHaveClass('sr-only')
    avancar(1500)
    expect(numeroDoCartao(regiao, 'Realizado')).toBe('112 h')
    expect(numeroDoCartao(regiao, 'Check-ins')).toBe('9')

    rerender(<Indicadores painel={painel('pessoa', { indicadores: { ...IND, realizado: 114, checkins: 10 } })} comparacao={COMP} papel="pessoa" atualizando />)
    expect(numeroDoCartao(regiao, 'Realizado')).toBe('114 h')
    expect(numeroDoCartao(regiao, 'Check-ins')).toBe('10')

    rerender(<Indicadores painel={painel('pessoa', { de: '2026-10-01', ate: '2026-10-31', indicadores: { ...IND, realizado: 90 } })} comparacao={COMP} papel="pessoa" />)
    expect(numeroDoCartao(regiao, 'Realizado')).toBe('0 h')
    avancar(1500)
    expect(numeroDoCartao(regiao, 'Realizado')).toBe('90 h')
  })
})
