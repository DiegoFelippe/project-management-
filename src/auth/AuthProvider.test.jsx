import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AuthProvider from './AuthProvider'
import { useAuth } from './useAuth'

const controle = vi.hoisted(() => ({ ouvinte: null, consultas: 0 }))

vi.mock('@/lib/supabase', () => ({
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
            return { data: { id: 'u1', nome: 'Ana Lima', papel: 'gestor', precisa_trocar_senha: false }, error: null }
          },
        }),
      }),
    }),
  },
}))

function Sonda() {
  const { carregando, perfil } = useAuth()
  return <p>{carregando ? 'carregando' : `pronto ${perfil?.nome ?? ''}`}</p>
}

const sessao = (id) => ({ user: { id }, access_token: `token-${id}` })

describe('AuthProvider', () => {
  it('voltar para a aba (SIGNED_IN do mesmo usuário) não recarrega o app', async () => {
    render(
      <AuthProvider>
        <Sonda />
      </AuthProvider>,
    )
    act(() => controle.ouvinte('INITIAL_SESSION', sessao('u1')))
    await waitFor(() => expect(screen.getByText('pronto Ana Lima')).toBeInTheDocument())
    const consultasAntes = controle.consultas

    act(() => controle.ouvinte('SIGNED_IN', sessao('u1')))
    act(() => controle.ouvinte('TOKEN_REFRESHED', sessao('u1')))

    expect(screen.getByText('pronto Ana Lima')).toBeInTheDocument()
    await new Promise((pronto) => setTimeout(pronto, 10))
    expect(controle.consultas).toBe(consultasAntes)
  })
})
