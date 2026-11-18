import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import Checkins from './Checkins'

vi.mock('@/components/modelos/ModelosDeCheckin', () => ({
  default: ({ perfil }) => <p>Modelos para {perfil.papel}</p>,
}))

const central = { id: 'u1', papel: 'central', consultoria_id: null }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }

describe('Check-ins', () => {
  it('cabeçalho "Check-ins" sem botões e as abas de página "Seções de Check-ins", com Modelos aberta', () => {
    renderizarTela(<Checkins />, { perfil: central, endereco: '/checkins' })
    const titulo = screen.getByRole('heading', { level: 1, name: 'Check-ins' })
    expect(within(titulo.closest('.mb-5')).queryByRole('button')).not.toBeInTheDocument()
    const abas = screen.getByRole('tablist', { name: 'Seções de Check-ins' })
    expect(within(abas).getAllByRole('tab').map((a) => a.textContent)).toEqual(['Modelos'])
    expect(screen.getByRole('tab', { name: 'Modelos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Modelos para central')
  })

  it('?aba=modelos abre a aba Modelos', () => {
    renderizarTela(<Checkins />, { perfil: gestor, endereco: '/checkins?aba=modelos' })
    expect(screen.getByRole('tab', { name: 'Modelos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Modelos para gestor')
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
