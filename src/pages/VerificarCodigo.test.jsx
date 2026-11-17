import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { confirmarCodigo } from '@/data/verificacao'
import VerificarCodigo from './VerificarCodigo'

vi.mock('@/data/verificacao', () => ({ confirmarCodigo: vi.fn() }))

function montar(valor = {}) {
  const auth = { verificacao: 'codigo', recarregarPerfil: vi.fn().mockResolvedValue(undefined), sair: vi.fn().mockResolvedValue(undefined), ...valor }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/verificar']}>
        <Routes>
          <Route path="/verificar" element={<VerificarCodigo />} />
          <Route path="/" element={<p>tela início</p>} />
          <Route path="/entrar" element={<p>tela entrar</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return auth
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(confirmarCodigo).mockResolvedValue({ erro: null })
})

describe('Entrar: tela do código do app autenticador', () => {
  it('pede o código de 6 dígitos e, certo, entra no app', async () => {
    const auth = montar()
    expect(screen.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument()
    expect(screen.getByText('Digite o código do seu app autenticador.')).toBeInTheDocument()
    const campo = screen.getByLabelText('Código de 6 dígitos')
    expect(campo).toHaveFocus()
    expect(campo).toHaveAttribute('autocomplete', 'one-time-code')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    await userEvent.type(campo, '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(confirmarCodigo).toHaveBeenCalledWith('123456')
    await waitFor(() => expect(screen.getByText('tela início')).toBeInTheDocument())
    expect(auth.recarregarPerfil).toHaveBeenCalled()
  })

  it('código errado: diz o motivo e continua na tela', async () => {
    vi.mocked(confirmarCodigo).mockResolvedValue({ erro: 'Código incorreto ou vencido. Confira o app e tente de novo.' })
    montar()
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '000000{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Código incorreto')
    expect(screen.queryByText('tela início')).not.toBeInTheDocument()
  })

  it('menos de 6 dígitos não vai para o Auth', async () => {
    montar()
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '123{Enter}')
    expect(confirmarCodigo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Digite os 6 dígitos')
  })

  it('perdeu o celular: diz a quem pedir; Sair volta para o entrar', async () => {
    const auth = montar()
    expect(screen.getByText(/Perdeu o celular\?/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(auth.sair).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('tela entrar')).toBeInTheDocument())
  })

  it('sem código a pedir, vai para o início', () => {
    montar({ verificacao: 'ok' })
    expect(screen.getByText('tela início')).toBeInTheDocument()
  })
})
