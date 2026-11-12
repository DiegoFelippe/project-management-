import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
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
})
