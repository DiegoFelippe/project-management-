import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import Rotas from './rotas'

vi.mock('@/auth/RotaProtegida', () => ({ default: () => <Outlet /> }))
vi.mock('@/components/shell/Moldura', () => ({ default: () => <Outlet /> }))
vi.mock('@/pages/Usuarios', () => ({ default: () => <p>Tela de Usuários</p> }))
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
  it('/capacidade vai para Usuários, onde o resumo do mês agora fica', () => {
    render(<MemoryRouter initialEntries={['/capacidade']}><Rotas /></MemoryRouter>)
    expect(screen.getByText('Tela de Usuários')).toBeInTheDocument()
  })
})
