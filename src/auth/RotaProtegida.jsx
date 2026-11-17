import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import Carregando from '@/components/comum/Carregando'
import { destinoObrigatorio } from '@/lib/verificacao'
import { useAuth } from './useAuth'

// Só passa quem entrou, confirmou o código do app autenticador (se tem o app ou a verificação exigida), já trocou a
// senha provisória, configurou o app (se exigido) e (se "papeis" vier) tem um desses papéis.
// A cada tela, a rota de fora confere de novo a verificação: a sessão antiga (aal1) de quem passou a precisar do
// código vai para a tela do código, não para listas vazias.
export default function RotaProtegida({ papeis }) {
  const { sessao, perfil, carregando, verificacao, conferirVerificacao } = useAuth()
  const { pathname, search, state } = useLocation()
  const temPerfil = Boolean(perfil)

  useEffect(() => {
    if (!papeis && temPerfil) conferirVerificacao?.()
  }, [pathname, papeis, temPerfil, conferirVerificacao])

  if (carregando) return <Carregando />
  if (!sessao || !perfil) return <Navigate to="/entrar" replace />
  const destino = destinoObrigatorio(perfil, verificacao)
  // O endereço pedido vai junto (state.de) e a tela de verificação volta para ele: assim a volta do Google no
  // Calendário (/calendario?code=…&state=…) sobrevive à tela do código.
  if (destino && pathname !== destino) return <Navigate to={destino} replace state={{ de: state?.de ?? `${pathname}${search}` }} />
  if (papeis && !papeis.includes(perfil.papel)) return <Navigate to="/" replace />
  return <Outlet />
}
