import { Navigate, Outlet, useLocation } from 'react-router'
import Carregando from '@/components/comum/Carregando'
import { useAuth } from './useAuth'

// Só passa quem entrou, já trocou a senha provisória e (se "papeis" vier) tem um desses papéis.
export default function RotaProtegida({ papeis }) {
  const { sessao, perfil, carregando } = useAuth()
  const { pathname } = useLocation()

  if (carregando) return <Carregando />
  if (!sessao || !perfil) return <Navigate to="/entrar" replace />
  if (perfil.precisa_trocar_senha && pathname !== '/trocar-senha') return <Navigate to="/trocar-senha" replace />
  if (papeis && !papeis.includes(perfil.papel)) return <Navigate to="/" replace />
  return <Outlet />
}
