import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import TelaDeAcesso from '@/components/auth/TelaDeAcesso'
import BarraTopo from '@/components/shell/BarraTopo'
import { salvarTema } from '@/data/preferencias'
import { CHAVE_TEMA, COR_DA_BARRA, adotarTemaDoPerfil, aplicarTema, escuroAtivo, lerTema } from './tema'

vi.mock('@/data/preferencias', () => ({ salvarTema: vi.fn().mockResolvedValue(undefined) }))

const corDaBarra = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
const arquivo = (nome) => readFileSync(join(process.cwd(), nome), 'utf8')

function sistemaEscuro(escuro) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: escuro, addEventListener: vi.fn(), removeEventListener: vi.fn() })
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  document.head.innerHTML = ''
})

describe('tema', () => {
  it('sem escolha, segue o sistema', () => {
    expect(lerTema()).toBe('sistema')
    sistemaEscuro(true)
    expect(escuroAtivo('sistema')).toBe(true)
    sistemaEscuro(false)
    expect(escuroAtivo('sistema')).toBe(false)
  })

  it('escuro e claro ligam e desligam a classe dark', () => {
    sistemaEscuro(false)
    aplicarTema('escuro')
    expect(document.documentElement).toHaveClass('dark')
    aplicarTema('claro')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('o botão da barra de cima alterna Claro → Escuro → Sistema e guarda a escolha', async () => {
    sistemaEscuro(false)
    localStorage.setItem(CHAVE_TEMA, 'claro')
    render(
      <AuthContext.Provider value={{ perfil: { id: 'me', papel: 'gestor', consultoria: { nome: 'Exemplo' } } }}>
        <MemoryRouter>
          <BarraTopo aoAbrirMenu={() => {}} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Tema: Claro/ }))
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('escuro')
    expect(document.documentElement).toHaveClass('dark')
    await userEvent.click(screen.getByRole('button', { name: /Tema: Escuro/ }))
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('sistema')
    expect(screen.getByRole('button', { name: /Tema: Sistema/ })).toBeInTheDocument()
    expect(salvarTema).toHaveBeenLastCalledWith('me', 'sistema')
  })

  it('a tela de login também tem o botão de tema, e a escolha fica guardada', async () => {
    sistemaEscuro(false)
    localStorage.setItem(CHAVE_TEMA, 'claro')
    render(<MemoryRouter><TelaDeAcesso>formulário</TelaDeAcesso></MemoryRouter>)
    await userEvent.click(screen.getByRole('button', { name: /Tema: Claro/ }))
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('escuro')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('ao entrar, o tema salvo no perfil vira o padrão deste navegador', () => {
    sistemaEscuro(false)
    localStorage.setItem(CHAVE_TEMA, 'claro')
    render(
      <AuthContext.Provider value={{ perfil: { id: 'me', papel: 'gestor', consultoria: { nome: 'Exemplo' } } }}>
        <MemoryRouter>
          <BarraTopo aoAbrirMenu={() => {}} />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    act(() => adotarTemaDoPerfil('escuro'))
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('escuro')
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByRole('button', { name: /Tema: Escuro/ })).toBeInTheDocument()
    act(() => adotarTemaDoPerfil(null))
    expect(localStorage.getItem(CHAVE_TEMA)).toBe('escuro')
  })

  it('a barra da janela do app instalado (theme-color) fica escura no tema escuro e branca no claro', () => {
    sistemaEscuro(false)
    aplicarTema('escuro')
    expect(corDaBarra()).toBe(COR_DA_BARRA.escuro)
    aplicarTema('claro')
    expect(corDaBarra()).toBe(COR_DA_BARRA.claro)
    sistemaEscuro(true)
    aplicarTema('sistema')
    expect(corDaBarra()).toBe(COR_DA_BARRA.escuro)
  })

  it('a cor da barra da janela é a mesma da moldura do app (index.css)', () => {
    const css = arquivo('src/index.css')
    const moldura = (bloco) => css.match(new RegExp(`^${bloco} \\{[^}]*--moldura: (#[0-9a-f]+);`, 'm'))?.[1]
    expect(COR_DA_BARRA.claro).toBe(moldura(':root'))
    expect(COR_DA_BARRA.escuro).toBe(moldura('\\.dark'))
  })

  it('o index.html já abre com a barra da janela escura quando o tema salvo é escuro', () => {
    sistemaEscuro(false)
    localStorage.setItem(CHAVE_TEMA, 'escuro')
    const html = arquivo('index.html')
    document.head.innerHTML = html.match(/<meta name="theme-color"[^>]*>/)[0]
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    window.eval(script)
    expect(document.documentElement).toHaveClass('dark')
    expect(corDaBarra()).toBe(COR_DA_BARRA.escuro)
  })
})
