import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '@/auth/useAuth'
import { concluirCadastro, iniciarCadastro } from '@/data/verificacao'
import ConfigurarVerificacao from './ConfigurarVerificacao'

vi.mock('@/data/verificacao', () => ({ iniciarCadastro: vi.fn(), concluirCadastro: vi.fn(), cancelarCadastro: vi.fn() }))

function montar(valor = {}) {
  const auth = { verificacao: 'configurar', recarregarPerfil: vi.fn().mockResolvedValue(undefined), sair: vi.fn().mockResolvedValue(undefined), ...valor }
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/configurar-verificacao']}>
        <Routes>
          <Route path="/configurar-verificacao" element={<ConfigurarVerificacao />} />
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
  vi.mocked(iniciarCadastro).mockResolvedValue({ erro: null, fatorId: 'f1', qr: 'data:image/svg+xml;utf-8,<svg/>', segredo: 'ABCDEFGH', uri: 'otpauth://x' })
  vi.mocked(concluirCadastro).mockResolvedValue({ erro: null })
})

describe('Entrar: configurar a verificação exigida', () => {
  it('explica por quê, mostra o QR code e entra depois do primeiro código', async () => {
    const auth = montar()
    expect(screen.getByRole('heading', { name: 'Configure a verificação em duas etapas' })).toBeInTheDocument()
    expect(screen.getByText(/exigida para o seu acesso/)).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Código do app'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e entrar' }))
    expect(concluirCadastro).toHaveBeenCalledWith('f1', '123456')
    await waitFor(() => expect(screen.getByText('tela início')).toBeInTheDocument())
    expect(auth.recarregarPerfil).toHaveBeenCalled()
  })

  it('não tem como pular: só Sair', async () => {
    const auth = montar()
    await screen.findByRole('img', { name: /QR code/ })
    expect(screen.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(auth.sair).toHaveBeenCalled()
  })

  it('sem nada a configurar, vai para o início', () => {
    montar({ verificacao: 'ok' })
    expect(screen.getByText('tela início')).toBeInTheDocument()
    expect(iniciarCadastro).not.toHaveBeenCalled()
  })
})
