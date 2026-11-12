import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { AuthContext } from '@/auth/useAuth'

// Renderiza uma tela com a pessoa logada (perfil) e o endereço dado.
export function renderizarTela(elemento, { perfil, endereco = '/', rota = '*' }) {
  return render(
    <AuthContext.Provider value={{ perfil }}>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path={rota} element={elemento} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}
