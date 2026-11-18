import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import Rotas from './rotas'

vi.mock('@/auth/RotaProtegida', () => ({ default: () => <Outlet /> }))
vi.mock('@/components/shell/Moldura', () => ({ default: () => <Outlet /> }))
vi.mock('@/pages/Usuarios', () => ({ default: () => <p>Tela de Usuários</p> }))
vi.mock('@/pages/Calendario', () => ({ default: () => <p>Tela do Calendário</p> }))
vi.mock('@/pages/Checkins', () => ({ default: () => <p>Tela dos Check-ins</p> }))
vi.mock('@/pages/Cliente', () => ({ default: () => null }))
vi.mock('@/pages/Clientes', () => ({ default: () => null }))
vi.mock('@/pages/Consultorias', () => ({ default: () => null }))
vi.mock('@/pages/DefinirSenha', () => ({ default: () => null }))
vi.mock('@/pages/Entrar', () => ({ default: () => null }))
vi.mock('@/pages/EsqueciSenha', () => ({ default: () => null }))
vi.mock('@/pages/Inicio', () => ({ default: () => <p>Tela de Início</p> }))
vi.mock('@/pages/Integracoes', () => ({ default: () => null }))
vi.mock('@/pages/Time', () => ({ default: () => null }))
vi.mock('@/pages/Times', () => ({ default: () => null }))
vi.mock('@/pages/TrocarSenha', () => ({ default: () => null }))

describe('rotas', () => {
  it('/calendario abre o Calendário (para todos os papéis; o Google volta para lá)', () => {
    render(<MemoryRouter initialEntries={['/calendario?code=abc&state=xyz']}><Rotas /></MemoryRouter>)
    expect(screen.getByText('Tela do Calendário')).toBeInTheDocument()
  })

  it('/checkins abre os Check-ins (para todos os papéis)', () => {
    render(<MemoryRouter initialEntries={['/checkins?aba=modelos']}><Rotas /></MemoryRouter>)
    expect(screen.getByText('Tela dos Check-ins')).toBeInTheDocument()
  })

  it('/capacidade vai para Usuários, onde o resumo do mês agora fica', () => {
    render(<MemoryRouter initialEntries={['/capacidade']}><Rotas /></MemoryRouter>)
    expect(screen.getByText('Tela de Usuários')).toBeInTheDocument()
  })
})
