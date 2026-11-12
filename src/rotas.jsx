import { Navigate, Route, Routes } from 'react-router'
import RotaProtegida from '@/auth/RotaProtegida'
import { useAuth } from '@/auth/useAuth'
import DefinirSenha from '@/pages/DefinirSenha'
import Entrar from '@/pages/Entrar'
import EsqueciSenha from '@/pages/EsqueciSenha'
import TrocarSenha from '@/pages/TrocarSenha'

// Provisório até a moldura (Tarefa 6): só confirma que entrou.
function Entrou() {
  const { perfil, sair } = useAuth()
  return (
    <div className="grid min-h-dvh place-items-center">
      <p>
        Você entrou como {perfil.nome}.{' '}
        <button type="button" className="font-semibold text-primary" onClick={sair}>Sair</button>
      </p>
    </div>
  )
}

export default function Rotas() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/definir-senha" element={<DefinirSenha />} />
      <Route element={<RotaProtegida />}>
        <Route path="/trocar-senha" element={<TrocarSenha />} />
        <Route path="/" element={<Entrou />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
