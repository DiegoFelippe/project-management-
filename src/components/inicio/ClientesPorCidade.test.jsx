import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import ClientesPorCidade from './ClientesPorCidade'

const cidade = (nome, clientes, uf = 'SC') => ({ cidade: nome, uf, clientes })
const DADOS = {
  cidades: [cidade('Chapecó', 22), cidade('Xanxerê', 12), cidade('Concórdia', 10), cidade('Joaçaba', 9), cidade('Videira', 8), cidade('Caçador', 2),
    { cidade: null, uf: null, clientes: 3 }],
  outras: 5, total: 71,
}
const ver = (props) => renderizarTela(<ClientesPorCidade {...props} />, { perfil: {} })
const cartao = () => screen.getByRole('region', { name: 'Clientes por cidade' })

describe('ClientesPorCidade', () => {
  it('um quadradinho por cliente, as 6 maiores com a paleta, Outras em grafite e Sem cidade por último', () => {
    ver({ dados: DADOS })
    expect(within(cartao()).getByText('Situação de hoje · 71 clientes')).toBeInTheDocument()
    const imagem = within(cartao()).getByRole('img', { name: /^Clientes por cidade: Chapecó\/SC 22 \(31%\)/ })
    const quadradinhos = imagem.querySelectorAll('[data-quadradinho]')
    expect(quadradinhos).toHaveLength(71)
    expect(quadradinhos[0].style.background).toBe('var(--cor-azul-forte)')
    expect(quadradinhos[63].style.background).toBe('var(--cor-grafite-forte)') // Outras: depois dos 63 das 6 cidades
    expect(quadradinhos[70].style.background).toBe('var(--cor-laranja-forte)') // Sem cidade
    const legenda = within(within(cartao()).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem').map((li) => li.textContent)
    expect(legenda).toEqual(['Chapecó/SC2231%', 'Xanxerê/SC1217%', 'Concórdia/SC1014%', 'Joaçaba/SC913%', 'Videira/SC811%', 'Caçador/SC23%',
      'Outras57%', 'Sem cidade34%'])
    expect(within(cartao()).getByText(/dos clientes/).textContent).toBe('Chapecó/SC tem 31% dos clientes (22 de 71)')
  })

  it('Ver em tabela: cada grupo com os clientes e o %', async () => {
    ver({ dados: DADOS })
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Ver em tabela' }))
    const tabela = within(cartao()).getByRole('table', { name: 'Clientes por cidade' })
    const linhas = [...tabela.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))
    expect(linhas).toHaveLength(8)
    expect(linhas[0]).toEqual(['Chapecó/SC', '22', '31%'])
    expect(linhas[7]).toEqual(['Sem cidade', '3', '4%'])
  })

  it('sem "Outras" quando não há (nada de grupo zero na legenda)', () => {
    ver({ dados: { cidades: [cidade('Chapecó', 2)], outras: 0, total: 2 } })
    const legenda = within(within(cartao()).getByRole('list', { name: 'Legenda' })).getAllByRole('listitem')
    expect(legenda).toHaveLength(1)
  })

  it('nenhum cliente: o vazio do cartão; erro com "Tentar de novo"', async () => {
    const { unmount } = ver({ dados: { cidades: [], outras: 0, total: 0 } })
    expect(within(cartao()).getByText('Nenhum cliente ainda.')).toBeInTheDocument()
    expect(within(cartao()).queryByRole('img')).toBeNull()
    unmount()
    const aoTentarDeNovo = vi.fn()
    ver({ dados: null, erro: true, aoTentarDeNovo })
    expect(within(cartao()).getByRole('alert')).toHaveTextContent('Não foi possível carregar os clientes por cidade.')
    await userEvent.click(within(cartao()).getByRole('button', { name: 'Tentar de novo' }))
    expect(aoTentarDeNovo).toHaveBeenCalled()
  })
})
