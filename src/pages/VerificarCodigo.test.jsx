import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
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

// A sessão vira aal2 assim que o código é aceito (o AuthProvider muda `verificacao` para 'ok' na hora).
const controle = {}
function ComEstado({ auth, children }) {
  const [verificacao, setVerificacao] = useState('codigo')
  useEffect(() => {
    controle.mudar = setVerificacao
  }, [])
  return <AuthContext.Provider value={{ ...auth, verificacao }}>{children}</AuthContext.Provider>
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

  it('código certo: o Início só aparece depois do perfil recarregado (nada de um instante sem o nome da consultoria)', async () => {
    let terminar
    const recarregarPerfil = vi.fn(() => new Promise((pronto) => { terminar = pronto }))
    vi.mocked(confirmarCodigo).mockImplementation(async () => {
      controle.mudar('ok')
      return { erro: null }
    })
    render(
      <ComEstado auth={{ recarregarPerfil, sair: vi.fn() }}>
        <MemoryRouter initialEntries={['/verificar']}>
          <Routes>
            <Route path="/verificar" element={<VerificarCodigo />} />
            <Route path="/" element={<p>tela início</p>} />
          </Routes>
        </MemoryRouter>
      </ComEstado>,
    )
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '123456{Enter}')
    await waitFor(() => expect(recarregarPerfil).toHaveBeenCalled())
    expect(screen.queryByText('tela início')).not.toBeInTheDocument()
    await act(async () => terminar())
    expect(await screen.findByText('tela início')).toBeInTheDocument()
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
    // Botão escrito à mão: sobe no hover e afunda ao apertar, como o Button (regra do CLAUDE.md).
    expect(screen.getByRole('button', { name: 'Sair' }).className).toMatch(/botao-animado.*hover:-translate-y-px.*active:scale-\[0\.97\]/)
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(auth.sair).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('tela entrar')).toBeInTheDocument())
  })

  it('volta para o endereço que a pessoa pediu antes do código (ex.: a volta do Google no Calendário)', async () => {
    function Calendario() {
      return <p>tela calendário {useLocation().search}</p>
    }
    const de = '/calendario?code=abc&state=xyz'
    render(
      <AuthContext.Provider value={{ verificacao: 'codigo', recarregarPerfil: vi.fn().mockResolvedValue(undefined), sair: vi.fn() }}>
        <MemoryRouter initialEntries={[{ pathname: '/verificar', state: { de } }]}>
          <Routes>
            <Route path="/verificar" element={<VerificarCodigo />} />
            <Route path="/calendario" element={<Calendario />} />
            <Route path="/" element={<p>tela início</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '123456{Enter}')
    expect(await screen.findByText('tela calendário ?code=abc&state=xyz')).toBeInTheDocument()
  })

  it('endereço de fora do app não vale como volta: vai para o início', async () => {
    render(
      <AuthContext.Provider value={{ verificacao: 'codigo', recarregarPerfil: vi.fn().mockResolvedValue(undefined), sair: vi.fn() }}>
        <MemoryRouter initialEntries={[{ pathname: '/verificar', state: { de: '//golpe.test/x' } }]}>
          <Routes>
            <Route path="/verificar" element={<VerificarCodigo />} />
            <Route path="/" element={<p>tela início</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '123456{Enter}')
    expect(await screen.findByText('tela início')).toBeInTheDocument()
  })

  it('sem código a pedir, vai para o início', () => {
    montar({ verificacao: 'ok' })
    expect(screen.getByText('tela início')).toBeInTheDocument()
  })
})
