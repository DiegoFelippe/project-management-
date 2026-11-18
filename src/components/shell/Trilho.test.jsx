import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { corDe } from '@/lib/cores'
import BarraDeBaixo from './BarraDeBaixo'
import MenuDoCelular from './MenuDoCelular'
import Moldura from './Moldura'
import Trilho from './Trilho'

vi.mock('@/data/usuarios', () => ({ gerenciarAcesso: vi.fn() }))
vi.mock('@/data/capacidade', () => ({ listarAusencias: vi.fn().mockResolvedValue({ itens: [], total: 0 }) }))
vi.mock('@/data/imagens', () => ({ trocarFoto: vi.fn(), tirarFoto: vi.fn() }))
vi.mock('@/data/preferencias', () => ({ salvarTema: vi.fn().mockResolvedValue() }))
vi.mock('@/pwa/useInstalar', () => ({ useInstalar: () => ({ podeInstalar: false, instalar: vi.fn() }) }))

afterEach(() => localStorage.clear())

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
    expect(itens.length).toBe(11) // 9 itens do dono + bolinha + Sair
    for (const item of itens) {
      expect(item.querySelector('[class*="anim-"]'), item.textContent).not.toBeNull()
    }
    const calendario = [...itens].find((item) => item.textContent === 'Calendário')
    expect(calendario).toHaveAttribute('href', '/calendario')
    expect(calendario.querySelector('.anim-folhear')).not.toBeNull()
    const checkins = [...itens].find((item) => item.textContent === 'Check-lists')
    expect(checkins).toHaveAttribute('href', '/checklists')
    expect(checkins.querySelector('.anim-abrir')).not.toBeNull()
    expect(checkins.previousElementSibling).toBe(calendario)
    const quadros = [...itens].find((item) => item.textContent === 'Quadros')
    expect(quadros).toHaveAttribute('href', '/quadros')
    expect(quadros.querySelector('.anim-arrastar')).not.toBeNull()
    expect(quadros.previousElementSibling).toBe(checkins)
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

// Celular (auditoria, G7): no lugar da gaveta com o trilho, uma barra embaixo com até 5 itens do papel e o ☰ com o resto,
// o perfil, o tema e o Sair. Os ícones têm as mesmas animações do trilho.
const comPerfil = (perfil, elemento, endereco = '/') => render(
  <AuthContext.Provider value={{ perfil, sair: vi.fn() }}>
    <MemoryRouter initialEntries={[endereco]}>{elemento}</MemoryRouter>
  </AuthContext.Provider>,
)
const PESSOA = { id: 'me', nome: 'Ana Lima', email: 'ana@exemplo.test', papel: 'pessoa', consultoria_id: 'c1', consultoria: { nome: 'Acme' } }

describe('BarraDeBaixo (menu do celular)', () => {
  it('até 5 itens do papel, na ordem do trilho, cada um com a animação do trilho', () => {
    const papeis = {
      pessoa: ['/', '/clientes', '/calendario', '/checklists', '/quadros'],
      gestor: ['/', '/clientes', '/calendario', '/quadros', '/usuarios'],
      admin: ['/', '/clientes', '/calendario', '/quadros', '/usuarios'],
      central: ['/', '/clientes', '/calendario', '/usuarios', '/consultorias'],
      dono: ['/', '/clientes', '/calendario', '/usuarios', '/consultorias'],
    }
    for (const [papel, rotas] of Object.entries(papeis)) {
      const { unmount } = comPerfil({ ...PESSOA, papel }, <BarraDeBaixo />)
      const barra = screen.getByRole('navigation', { name: 'Menu principal' })
      const itens = barra.querySelectorAll('[data-item-trilho]')
      expect([...itens].map((item) => item.getAttribute('href')), papel).toEqual(rotas)
      for (const item of itens) {
        expect(item).toHaveClass('group')
        expect(item.querySelector('[class*="anim-"]'), item.textContent).not.toBeNull()
      }
      unmount()
    }
  })

  it('só no celular, com a área segura do iPhone embaixo; o item aberto acende', () => {
    comPerfil(PESSOA, <BarraDeBaixo />, '/clientes')
    const barra = screen.getByRole('navigation', { name: 'Menu principal' })
    expect(barra).toHaveClass('md:hidden', 'pb-[env(safe-area-inset-bottom)]')
    const clientes = within(barra).getByRole('link', { name: 'Clientes' })
    expect(clientes).toHaveAttribute('aria-current', 'page')
    expect(clientes.querySelector('.anim-transmitir').parentElement).toHaveClass('bg-primary-cheio')
    expect(within(barra).getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current')
  })
})

describe('MenuDoCelular (o ☰)', () => {
  it('tem os itens que não couberam na barra, o perfil, o tema e o Sair, todos com animação', () => {
    comPerfil({ ...PESSOA, papel: 'dono' }, <MenuDoCelular aoFechar={() => {}} aoAbrirPerfil={() => {}} />)
    const secoes = screen.getByRole('navigation', { name: 'Mais seções' })
    expect(within(secoes).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Check-lists', '/checklists'], ['Quadros', '/quadros'], ['Times', '/times'], ['Integrações', '/integracoes'],
    ])
    expect(screen.getByRole('button', { name: /Meu perfil/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tema/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sair da conta' })).toBeInTheDocument()
    const itens = document.querySelectorAll('[data-item-trilho]')
    expect(itens).toHaveLength(7)
    for (const item of itens) {
      expect(item).toHaveClass('group')
      expect(item.querySelector('[class*="anim-"]'), item.textContent).not.toBeNull()
    }
  })

  it('o consultor, que tem tudo na barra, não tem "Mais seções": só perfil, tema e Sair', () => {
    comPerfil(PESSOA, <MenuDoCelular aoFechar={() => {}} aoAbrirPerfil={() => {}} />)
    expect(screen.queryByRole('navigation', { name: 'Mais seções' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Meu perfil/ })).toHaveTextContent('Ana Lima')
  })

  it('ir a uma seção fecha o ☰; Meu perfil fecha e abre a ficha; o tema troca sem fechar; Sair sai', async () => {
    const aoFechar = vi.fn()
    const aoAbrirPerfil = vi.fn()
    const sair = vi.fn().mockResolvedValue()
    render(
      <AuthContext.Provider value={{ perfil: { ...PESSOA, papel: 'gestor' }, sair }}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<MenuDoCelular aoFechar={aoFechar} aoAbrirPerfil={aoAbrirPerfil} />} />
            <Route path="/entrar" element={<p>Tela de entrar</p>} />
            <Route path="/times" element={<p>Tela de times</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    const tema = screen.getByRole('button', { name: /Tema/ })
    expect(tema).toHaveTextContent('Tema: Sistema')
    await userEvent.click(tema)
    expect(tema).toHaveTextContent('Tema: Claro')
    expect(aoFechar).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Meu perfil/ }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
    expect(aoAbrirPerfil).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    expect(sair).toHaveBeenCalled()
    expect(await screen.findByText('Tela de entrar')).toBeInTheDocument()
  })

  it('a seção do ☰ leva para a tela e fecha o menu', async () => {
    const aoFechar = vi.fn()
    render(
      <AuthContext.Provider value={{ perfil: { ...PESSOA, papel: 'gestor' }, sair: vi.fn() }}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<MenuDoCelular aoFechar={aoFechar} aoAbrirPerfil={() => {}} />} />
            <Route path="/times" element={<p>Tela de times</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Times' }))
    expect(aoFechar).toHaveBeenCalled()
    expect(await screen.findByText('Tela de times')).toBeInTheDocument()
  })
})

describe('Moldura', () => {
  const moldura = (perfil) => render(
    <AuthContext.Provider value={{ perfil, sair: vi.fn() }}>
      <MemoryRouter initialEntries={['/clientes']}>
        <Routes>
          <Route element={<Moldura />}>
            <Route path="/clientes" element={<p>Tela de clientes</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )

  it('no computador o trilho fica como era; no celular, a barra embaixo (o ☰ abre o resto e o Meu perfil)', async () => {
    moldura({ ...PESSOA, papel: 'admin' })
    const trilho = screen.getByRole('complementary', { name: 'Menu principal' })
    expect(trilho).toHaveClass('hidden', 'md:flex')
    expect(trilho.querySelectorAll('[data-item-trilho]')).toHaveLength(10) // 8 itens do admin + bolinha + Sair
    expect(screen.getByRole('navigation', { name: 'Menu principal' })).toHaveClass('md:hidden')
    // O tema vai para o ☰ no celular (a barra de cima o esconde lá).
    expect(screen.getByRole('button', { name: /^Tema: .*Clique para trocar/ })).toHaveClass('max-md:hidden')
    await userEvent.click(screen.getByRole('button', { name: 'Abrir o menu' }))
    const menu = screen.getByRole('dialog', { name: 'Menu' })
    expect(within(menu).getAllByRole('link').map((link) => link.textContent)).toEqual(['Check-lists', 'Times', 'Integrações'])
    await userEvent.click(within(menu).getByRole('button', { name: /Meu perfil/ }))
    expect(await screen.findByRole('dialog', { name: 'Meu perfil' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
  })
})
