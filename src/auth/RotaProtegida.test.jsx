import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import RotaProtegida from './RotaProtegida'
import { AuthContext } from './useAuth'

const sessao = { user: { id: 'u1' } }

function montar({ valor, rota }) {
  render(
    <AuthContext.Provider value={{ carregando: false, sessao: null, perfil: null, ...valor }}>
      <MemoryRouter initialEntries={[rota]}>
        <Routes>
          <Route path="/entrar" element={<p>tela entrar</p>} />
          <Route element={<RotaProtegida />}>
            <Route path="/trocar-senha" element={<p>tela trocar</p>} />
            <Route path="/verificar" element={<p>tela código</p>} />
            <Route path="/configurar-verificacao" element={<p>tela configurar</p>} />
            <Route path="/" element={<p>tela início</p>} />
            <Route element={<RotaProtegida papeis={['dono', 'admin', 'gestor']} />}>
              <Route path="/times" element={<p>tela times</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('RotaProtegida', () => {
  it('sem sessão vai para entrar', () => {
    montar({ valor: {}, rota: '/times' })
    expect(screen.getByText('tela entrar')).toBeInTheDocument()
  })

  it('enquanto carrega mostra o aviso', () => {
    montar({ valor: { carregando: true }, rota: '/times' })
    expect(screen.getByText('Carregando…')).toBeInTheDocument()
  })

  it('senha provisória vai para trocar a senha', () => {
    montar({ valor: { sessao, perfil: { papel: 'gestor', precisa_trocar_senha: true } }, rota: '/times' })
    expect(screen.getByText('tela trocar')).toBeInTheDocument()
  })

  it('pessoa sem o papel volta para o início', () => {
    montar({ valor: { sessao, perfil: { papel: 'pessoa', precisa_trocar_senha: false } }, rota: '/times' })
    expect(screen.getByText('tela início')).toBeInTheDocument()
  })

  it('gestor vê a tela', () => {
    montar({ valor: { sessao, perfil: { papel: 'gestor', precisa_trocar_senha: false } }, rota: '/times' })
    expect(screen.getByText('tela times')).toBeInTheDocument()
  })

  describe('verificação em duas etapas', () => {
    const perfil = { papel: 'gestor', precisa_trocar_senha: false }

    it('sem o código (app ativo, sessão aal1) vai para a tela do código', () => {
      montar({ valor: { sessao, perfil, verificacao: 'codigo' }, rota: '/times' })
      expect(screen.getByText('tela código')).toBeInTheDocument()
    })

    it('o código vem antes da senha provisória', () => {
      montar({ valor: { sessao, perfil: { ...perfil, precisa_trocar_senha: true }, verificacao: 'codigo' }, rota: '/' })
      expect(screen.getByText('tela código')).toBeInTheDocument()
    })

    it('exigida e sem o app: vai configurar antes de entrar', () => {
      montar({ valor: { sessao, perfil, verificacao: 'configurar' }, rota: '/times' })
      expect(screen.getByText('tela configurar')).toBeInTheDocument()
    })

    it('na própria tela do código não há desvio', () => {
      montar({ valor: { sessao, perfil, verificacao: 'codigo' }, rota: '/verificar' })
      expect(screen.getByText('tela código')).toBeInTheDocument()
    })

    it('sem 2FA nada muda (verificacao "ok")', () => {
      montar({ valor: { sessao, perfil, verificacao: 'ok' }, rota: '/times' })
      expect(screen.getByText('tela times')).toBeInTheDocument()
    })

    it('a cada tela, confere de novo (sessão antiga de quem passou a precisar do código)', () => {
      const conferirVerificacao = vi.fn()
      montar({ valor: { sessao, perfil, verificacao: 'ok', conferirVerificacao }, rota: '/times' })
      expect(conferirVerificacao).toHaveBeenCalledTimes(1)
    })
  })
})
