import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderizarTela } from '@/test/renderizar'
import Checkins, { SecoesDeCheckins } from './Checkins'

vi.mock('@/components/modelos/ModelosDeCheckin', () => ({
  default: ({ perfil }) => <p>Modelos para {perfil.papel}</p>,
}))
vi.mock('@/components/checkins/AndamentoDosClientes', () => ({
  default: ({ perfil }) => <p>Andamento para {perfil.papel}</p>,
}))

const central = { id: 'u1', papel: 'central', consultoria_id: null }
const gestor = { id: 'g1', papel: 'gestor', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }
const consultor = { id: 'p1', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'STI Consult' } }

describe('Check-lists (o menu; Check-in fica só para as horas: auditoria, G3)', () => {
  it('cabeçalho "Check-lists" sem botões; abas Andamento (a primeira, aberta) e Modelos', () => {
    renderizarTela(<Checkins />, { perfil: central, endereco: '/checklists' })
    const titulo = screen.getByRole('heading', { level: 1, name: 'Check-lists' })
    expect(within(titulo.closest('.mb-5')).queryByRole('button')).not.toBeInTheDocument()
    const abas = screen.getByRole('tablist', { name: 'Seções de Check-lists' })
    expect(within(abas).getAllByRole('tab').map((a) => a.textContent)).toEqual(['Andamento', 'Modelos'])
    expect(screen.getByRole('tab', { name: 'Andamento' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Andamento para central')
    expect(screen.queryByText('Modelos para central')).not.toBeInTheDocument()
  })

  it('o consultor também vê o Andamento (os clientes dele) e os Modelos', () => {
    renderizarTela(<Checkins />, { perfil: consultor, endereco: '/checklists' })
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Andamento para pessoa')
    expect(screen.getByRole('tab', { name: 'Modelos' })).toBeInTheDocument()
  })

  it('?aba=modelos abre os Modelos; ?aba=andamento, o Andamento', async () => {
    const { unmount } = renderizarTela(<Checkins />, { perfil: gestor, endereco: '/checklists?aba=modelos' })
    expect(screen.getByRole('tab', { name: 'Modelos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Modelos para gestor')
    unmount()
    renderizarTela(<Checkins />, { perfil: gestor, endereco: '/checklists?aba=andamento' })
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Andamento para gestor')
  })

  it('com uma seção só, sem barra de abas: o conteúdo vem direto', () => {
    renderizarTela(<SecoesDeCheckins secoes={[{ id: 'modelos', rotulo: 'Modelos', conteudo: <p>Os modelos</p> }]} />,
      { perfil: central, endereco: '/checklists' })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument()
    expect(screen.getByText('Os modelos')).toBeInTheDocument()
  })

  it('com duas seções ou mais, a barra de abas "Seções de Check-lists" aparece (a primeira aberta; ?aba= escolhe)', () => {
    const secoes = [
      { id: 'andamento', rotulo: 'Andamento', conteudo: <p>Andamento dos clientes</p> },
      { id: 'modelos', rotulo: 'Modelos', conteudo: <p>Os modelos</p> },
    ]
    const { unmount } = renderizarTela(<SecoesDeCheckins secoes={secoes} />, { perfil: central, endereco: '/checklists' })
    const abas = screen.getByRole('tablist', { name: 'Seções de Check-lists' })
    expect(within(abas).getAllByRole('tab').map((a) => a.textContent)).toEqual(['Andamento', 'Modelos'])
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Andamento dos clientes')
    unmount()
    renderizarTela(<SecoesDeCheckins secoes={secoes} />, { perfil: central, endereco: '/checklists?aba=modelos' })
    expect(screen.getByRole('tab', { name: 'Modelos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Os modelos')
  })

  it('o subtítulo diz o que cada papel acompanha e faz com os modelos', () => {
    const { unmount } = renderizarTela(<Checkins />, { perfil: central, endereco: '/checklists' })
    expect(screen.getByText(/^O andamento do check-list em cada cliente.*Você cria modelos para todas as consultorias ou para uma só/))
      .toBeInTheDocument()
    unmount()
    const outro = renderizarTela(<Checkins />, { perfil: gestor, endereco: '/checklists' })
    expect(screen.getByText(/^O andamento do check-list nos clientes da consultoria.*os da Central você duplica e adapta/))
      .toBeInTheDocument()
    outro.unmount()
    renderizarTela(<Checkins />, { perfil: consultor, endereco: '/checklists' })
    expect(screen.getByText(/^O que falta em cada cliente seu.*Em cada cliente você segue o modelo que foi aplicado/))
      .toBeInTheDocument()
  })
})
