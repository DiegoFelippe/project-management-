import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVENTO_CONFERIR_ACESSO } from '@/lib/supabase'
import AuthProvider from './AuthProvider'
import { useAuth } from './useAuth'

const controle = vi.hoisted(() => ({ ouvinte: null, consultas: 0, dados: null }))

vi.mock('@/lib/supabase', () => ({
  EVENTO_CONFERIR_ACESSO: 'consultoria:conferir-acesso',
  provedorLigado: vi.fn(),
  supabase: {
    auth: {
      onAuthStateChange: (fn) => {
        controle.ouvinte = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
      signOut: vi.fn(),
      getSession: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            controle.consultas += 1
            return { data: controle.dados ?? { id: 'u1', nome: 'Ana Lima', papel: 'gestor', precisa_trocar_senha: false }, error: null }
          },
        }),
      }),
    }),
  },
}))

function Sonda() {
  const { carregando, perfil, verificacao } = useAuth()
  return <p>{carregando ? 'carregando' : `pronto ${perfil?.nome ?? ''} ${verificacao}`}</p>
}

const sessao = (id) => ({ user: { id }, access_token: `token-${id}` })
const token = (carga) => `x.${btoa(JSON.stringify(carga))}.y`
const sessaoCom = (id, aal) => ({ user: { id }, access_token: token({ sub: id, aal }) })

beforeEach(() => {
  controle.dados = null
  controle.consultas = 0
})

describe('AuthProvider', () => {
  it('voltar para a aba (SIGNED_IN do mesmo usuário) não recarrega o app', async () => {
    render(
      <AuthProvider>
        <Sonda />
      </AuthProvider>,
    )
    act(() => controle.ouvinte('INITIAL_SESSION', sessao('u1')))
    await waitFor(() => expect(screen.getByText('pronto Ana Lima ok')).toBeInTheDocument())
    const consultasAntes = controle.consultas

    act(() => controle.ouvinte('SIGNED_IN', sessao('u1')))
    act(() => controle.ouvinte('TOKEN_REFRESHED', sessao('u1')))

    expect(screen.getByText('pronto Ana Lima ok')).toBeInTheDocument()
    await new Promise((pronto) => setTimeout(pronto, 10))
    expect(controle.consultas).toBe(consultasAntes)
  })

  it('com o app ativo e sessão aal1 pede o código; depois do código (MFA_CHALLENGE_VERIFIED, aal2) libera', async () => {
    controle.dados = { id: 'u1', nome: 'Ana Lima', papel: 'gestor', precisa_trocar_senha: false, verificacao_desde: '2026-11-10T15:00:00Z' }
    render(<AuthProvider><Sonda /></AuthProvider>)
    act(() => controle.ouvinte('SIGNED_IN', sessaoCom('u1', 'aal1')))
    await waitFor(() => expect(screen.getByText('pronto Ana Lima codigo')).toBeInTheDocument())
    act(() => controle.ouvinte('MFA_CHALLENGE_VERIFIED', sessaoCom('u1', 'aal2')))
    expect(screen.getByText('pronto Ana Lima ok')).toBeInTheDocument()
  })

  it('sessão antiga: o aviso de recusa confere de novo e quem passou a ter a verificação exigida vai configurar', async () => {
    render(<AuthProvider><Sonda /></AuthProvider>)
    act(() => controle.ouvinte('INITIAL_SESSION', sessaoCom('u1', 'aal1')))
    await waitFor(() => expect(screen.getByText('pronto Ana Lima ok')).toBeInTheDocument())
    controle.dados = { id: 'u1', nome: 'Ana Lima', papel: 'gestor', precisa_trocar_senha: false, exige_2fa: true, verificacao_desde: null }
    act(() => window.dispatchEvent(new Event(EVENTO_CONFERIR_ACESSO)))
    await waitFor(() => expect(screen.getByText('pronto Ana Lima configurar')).toBeInTheDocument())
  })

  describe('janela de 2 s entre as conferências', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
    afterEach(() => vi.useRealTimers())
    const avancar = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
    const avisar = () => act(() => window.dispatchEvent(new Event(EVENTO_CONFERIR_ACESSO)))

    async function entrar() {
      render(<AuthProvider><Sonda /></AuthProvider>)
      act(() => controle.ouvinte('INITIAL_SESSION', sessaoCom('u1', 'aal1')))
      await waitFor(() => expect(screen.getByText('pronto Ana Lima ok')).toBeInTheDocument())
    }

    it('vários avisos seguidos: uma conferência na hora e só mais uma no fim da janela', async () => {
      await entrar()
      const antes = controle.consultas
      act(() => {
        for (let i = 0; i < 5; i++) window.dispatchEvent(new Event(EVENTO_CONFERIR_ACESSO))
      })
      await avancar(10)
      expect(controle.consultas - antes).toBe(1)
      await avancar(2000)
      expect(controle.consultas - antes).toBe(2)
      await avancar(5000)
      expect(controle.consultas - antes).toBe(2)
    })

    it('aviso que chega dentro da janela não se perde: a conferência fica para o fim dela', async () => {
      await entrar()
      avisar()
      await avancar(10)
      // Quem administra passou a exigir a verificação logo depois da primeira conferência.
      controle.dados = { id: 'u1', nome: 'Ana Lima', papel: 'gestor', precisa_trocar_senha: false, exige_2fa: true, verificacao_desde: null }
      avisar()
      await avancar(10)
      expect(screen.getByText('pronto Ana Lima ok')).toBeInTheDocument()
      await avancar(2000)
      expect(screen.getByText('pronto Ana Lima configurar')).toBeInTheDocument()
    })
  })
})
