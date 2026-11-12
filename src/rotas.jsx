import { Navigate, Route, Routes } from 'react-router'
import RotaProtegida from '@/auth/RotaProtegida'
import Moldura from '@/components/shell/Moldura'
import DefinirSenha from '@/pages/DefinirSenha'
import Entrar from '@/pages/Entrar'
import EsqueciSenha from '@/pages/EsqueciSenha'
import Inicio from '@/pages/Inicio'
import Time from '@/pages/Time'
import Times from '@/pages/Times'
import TrocarSenha from '@/pages/TrocarSenha'
import Usuarios from '@/pages/Usuarios'

export default function Rotas() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/definir-senha" element={<DefinirSenha />} />
      <Route element={<RotaProtegida />}>
        <Route path="/trocar-senha" element={<TrocarSenha />} />
        <Route element={<Moldura />}>
          <Route path="/" element={<Inicio />} />
          <Route element={<RotaProtegida papeis={['dono', 'admin', 'gestor']} />}>
            <Route path="/times" element={<Times />} />
            <Route path="/times/:id" element={<Time />} />
            <Route path="/usuarios" element={<Usuarios />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
