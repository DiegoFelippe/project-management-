import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import OcupacaoPorUnidade from './OcupacaoPorUnidade'

const MES = '2026-11-01'
const unidade = (i, ocupacao, extra = {}) => ({ id: `u${i}`, nome: `Pessoa ${i}`, ocupacao, capacidade: 160, reservado: 160 * ocupacao, realizado: 100, visivel: true, ...extra })
const DOZE = [1.3, 1.1, 1, 0.95, 0.9, 0.85, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].map((o, i) => unidade(i, o))
const painel = (extra = {}) => ({
  recorte: 'consultoria', mes: MES, passado: false, intervalo: false, ranking: DOZE,
  ranking_resumo: { total: 14, acima: 2, folga: 7, no_meio: 2 }, ...extra,
})
const ver = (p) => renderizarTela(<OcupacaoPorUnidade painel={p} />, { perfil: {} })

describe('OcupacaoPorUnidade', () => {
  it('12 barras com "… 2 no meio" depois das 6 primeiras; acima em alerta e folga em âmbar', () => {
    ver(painel())
    const cartao = screen.getByRole('region', { name: 'Ocupação por consultor' })
    const lista = within(cartao).getByRole('list', { name: 'Ocupação por consultor' })
    const linhas = within(lista).getAllByRole('listitem')
    expect(linhas).toHaveLength(13)
    expect(linhas[6]).toHaveTextContent('… 2 no meio')
    expect(within(linhas[0]).getByRole('img', { name: 'Pessoa 0: 130% de ocupação' })).toBeInTheDocument()
    expect(linhas[0].querySelector('[data-icone="alerta"]')).not.toBeNull()
    expect(linhas[7].querySelector('[data-icone="folga"]')).not.toBeNull()
  })

  it('as sem capacidade que ficaram de fora aparecem depois da última barra (sem_capacidade); com 0, nada', () => {
    const { unmount } = ver(painel({ ranking_resumo: { total: 16, acima: 2, folga: 7, no_meio: 2, sem_capacidade: 2 } }))
    expect(screen.getByText('+ 2 consultores sem capacidade')).toBeInTheDocument()
    unmount()
    const { unmount: fechar } = ver(painel({ recorte: 'tudo', ranking_resumo: { total: 15, acima: 2, folga: 7, no_meio: 2, sem_capacidade: 1 } }))
    expect(screen.getByText('+ 1 consultoria sem capacidade')).toBeInTheDocument()
    fechar()
    ver(painel({ ranking_resumo: { total: 14, acima: 2, folga: 7, no_meio: 2, sem_capacidade: 0 } }))
    expect(screen.queryByText(/sem capacidade/)).not.toBeInTheDocument()
  })

  it('leitura pelo ranking_resumo (todos, não só as 12 barras)', () => {
    ver(painel())
    expect(screen.getByText(/acima de 100%/).textContent).toBe('2 consultores acima de 100% · 7 com folga')
  })

  it('links de hoje: consultoria → Consultorias (aba Ocupação); consultor visível → Usuários; não visível sem link', async () => {
    const { unmount } = ver(painel({ ranking: [unidade(1, 0.8), unidade(2, 0.5, { visivel: false, nome: 'Oculto' })], ranking_resumo: { total: 2, acima: 0, folga: 1, no_meio: 0 } }))
    expect(screen.getByRole('link', { name: 'Pessoa 1' })).toHaveAttribute('href', `/usuarios?pessoa=u1&mes=${MES}`)
    expect(screen.queryByRole('link', { name: 'Oculto' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', `/usuarios?mes=${MES}`)
    await userEvent.click(screen.getByRole('button', { name: 'Ver em tabela' }))
    expect(within(screen.getByRole('table', { name: 'Ocupação por consultor' })).getByRole('cell', { name: '128 h' })).toBeInTheDocument()
    unmount()

    ver(painel({ recorte: 'tudo', passado: true, ranking: [{ ...unidade(1, 0.8), nome: 'Consultoria Exemplo', pessoas: 6 }], ranking_resumo: { total: 1, acima: 0, folga: 0, no_meio: 0 } }))
    const cartao = screen.getByRole('region', { name: 'Utilização por consultoria' })
    expect(within(cartao).getByRole('link', { name: 'Consultoria Exemplo' })).toHaveAttribute('href', `/consultorias?aba=ocupacao&mes=${MES}`)
    expect(within(cartao).getByText('6 consultores')).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', `/consultorias?aba=ocupacao&mes=${MES}`)
    expect(within(cartao).getByText('Todos entre 70% e 100%')).toBeInTheDocument()
  })

  it('vazio: nenhum consultor com capacidade', () => {
    ver(painel({ ranking: [], ranking_resumo: { total: 0, acima: 0, folga: 0, no_meio: 0 } }))
    expect(screen.getByText('Nenhum consultor com capacidade neste mês.')).toBeInTheDocument()
  })
})
