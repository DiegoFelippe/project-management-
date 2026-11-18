import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { corDe } from '@/lib/cores'
import Trilho from './Trilho'

vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn() }))
vi.mock('@/data/capacidade', () => ({ listarAusencias: vi.fn().mockResolvedValue({ itens: [], total: 0 }) }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn() }))

describe('Trilho', () => {
  it('todo ícone do trilho anima ao passar o mouse, inclusive a bolinha e o Sair', () => {
    const perfil = { nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'dono' }
    const { container } = render(
      <AuthContext.Provider value={{ perfil, sair: () => {} }}>
        <MemoryRouter>
          <Trilho />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    const itens = container.querySelectorAll('[data-item-trilho]')
    expect(itens.length).toBe(10) // 8 itens do dono + bolinha + Sair
    for (const item of itens) {
      expect(item.querySelector('[class*="anim-"]'), item.textContent).not.toBeNull()
    }
    const calendario = [...itens].find((item) => item.textContent === 'Calendário')
    expect(calendario).toHaveAttribute('href', '/calendario')
    expect(calendario.querySelector('.anim-folhear')).not.toBeNull()
    const checkins = [...itens].find((item) => item.textContent === 'Check-ins')
    expect(checkins).toHaveAttribute('href', '/checkins')
    expect(checkins.querySelector('.anim-abrir')).not.toBeNull()
    expect(checkins.previousElementSibling).toBe(calendario)
  })

  it('o nome que não cabe quebra em duas linhas, sem reticências e com a mesma letra (auditoria, R3)', () => {
    const perfil = { nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'dono' }
    const { container } = render(
      <AuthContext.Provider value={{ perfil, sair: () => {} }}>
        <MemoryRouter>
          <Trilho />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    const consultorias = [...container.querySelectorAll('[data-item-trilho]')].find((item) => item.textContent === 'Consultorias')
    const nome = within(consultorias).getByText('Consultorias')
    expect(nome).not.toHaveClass('truncate')
    expect(nome).toHaveClass('text-mini', 'line-clamp-2', 'hyphens-auto', 'text-center')
  })

  it('a bolinha usa a cor escolhida (ou a automática) quando não há foto, e mantém a animação', () => {
    const base = { id: 'me', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin' }
    const { rerender } = render(
      <AuthContext.Provider value={{ perfil: { ...base, cor: '#db2777' }, sair: () => {} }}>
        <MemoryRouter><Trilho /></MemoryRouter>
      </AuthContext.Provider>,
    )
    const bolinha = screen.getByText('DF')
    expect(bolinha).toHaveStyle({ backgroundColor: '#db2777' })
    expect(bolinha.className).toContain('anim-pulsar')
    expect(bolinha.closest('[data-item-trilho]')).not.toBeNull()
    rerender(
      <AuthContext.Provider value={{ perfil: { ...base, cor: null }, sair: () => {} }}>
        <MemoryRouter><Trilho /></MemoryRouter>
      </AuthContext.Provider>,
    )
    expect(screen.getByText('DF')).toHaveStyle({ backgroundColor: corDe('me') })
  })

  it('a bolinha da pessoa, acima do Sair, abre o Meu perfil: a mesma ficha de Usuários, no modo próprio', async () => {
    const perfil = {
      id: 'me', nome: 'Diego Felippe', email: 'diego@exemplo.test', papel: 'admin', consultoria_id: 'c1', consultoria: { nome: 'Acme' },
      cargo: 'Consultor sênior',
    }
    render(
      <AuthContext.Provider value={{ perfil, sair: () => {} }}>
        <MemoryRouter>
          <Trilho />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Meu perfil/ }))
    const janela = screen.getByRole('dialog', { name: 'Meu perfil' })
    expect(within(janela).getAllByRole('tab').map((aba) => aba.textContent)).toEqual(['Dados pessoais', 'Acesso'])
    expect(within(janela).getByRole('group', { name: 'Identificação' })).toBeInTheDocument()
    expect(within(janela).getByLabelText('Nome')).toHaveValue('Diego Felippe')
    expect(within(janela).getByLabelText('Nome')).toBeEnabled()
    expect(within(janela).getByLabelText('E-mail')).toBeDisabled()
    expect(within(janela).getByLabelText('Cargo')).toBeDisabled()
    expect(within(janela).getByLabelText('Cargo')).toHaveValue('Consultor sênior')
  })
})
