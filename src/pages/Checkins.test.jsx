import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import Checkins, { SecoesDeCheckins } from './Checkins'

vi.mock('@/components/modelos/ModelosDeCheckin', () => ({
  default: ({ perfil }) => <p>Modelos para {perfil.papel}</p>,
}))

const central = { id: 'u1', papel: 'central', consultoria_id: null }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }

describe('Check-ins', () => {
  it('cabeçalho "Check-ins" sem botões; com uma seção só (Modelos), sem barra de abas: o conteúdo vem direto', () => {
    renderizarTela(<Checkins />, { perfil: central, endereco: '/checkins' })
    const titulo = screen.getByRole('heading', { level: 1, name: 'Check-ins' })
    expect(within(titulo.closest('.mb-5')).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(screen.getByText('Modelos para central')).toBeInTheDocument()
  })

  it('?aba=modelos (o endereço antigo) continua mostrando os Modelos', () => {
    renderizarTela(<Checkins />, { perfil: gestor, endereco: '/checkins?aba=modelos' })
    expect(screen.getByText('Modelos para gestor')).toBeInTheDocument()
  })

  it('com duas seções ou mais, a barra de abas "Seções de Check-ins" aparece (a primeira aberta; ?aba= escolhe)', () => {
    const secoes = [
      { id: 'andamento', rotulo: 'Andamento', conteudo: <p>Andamento dos clientes</p> },
      { id: 'modelos', rotulo: 'Modelos', conteudo: <p>Os modelos</p> },
    ]
    const { unmount } = renderizarTela(<SecoesDeCheckins secoes={secoes} />, { perfil: central, endereco: '/checkins' })
    const abas = screen.getByRole('tablist', { name: 'Seções de Check-ins' })
    expect(within(abas).getAllByRole('tab').map((a) => a.textContent)).toEqual(['Andamento', 'Modelos'])
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Andamento dos clientes')
    unmount()
    renderizarTela(<SecoesDeCheckins secoes={secoes} />, { perfil: central, endereco: '/checkins?aba=modelos' })
    expect(screen.getByRole('tab', { name: 'Modelos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Os modelos')
  })

  it('o subtítulo diz o que cada papel faz com os modelos', () => {
    const { unmount } = renderizarTela(<Checkins />, { perfil: central, endereco: '/checkins' })
    expect(screen.getByText(/Você cria modelos para todas as consultorias ou para uma só/)).toBeInTheDocument()
    unmount()
    const outro = renderizarTela(<Checkins />, { perfil: gestor, endereco: '/checkins' })
    expect(screen.getByText(/os da Central você duplica e adapta/)).toBeInTheDocument()
    outro.unmount()
    renderizarTela(<Checkins />, { perfil: consultor, endereco: '/checkins' })
    expect(screen.getByText(/Em cada cliente você segue o modelo que foi aplicado/)).toBeInTheDocument()
  })
})
