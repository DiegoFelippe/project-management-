import { Navigate, Route, Routes } from 'react-router'
import RotaProtegida from '@/auth/RotaProtegida'
import Moldura from '@/components/shell/Moldura'
import Cliente from '@/pages/Cliente'
import Clientes from '@/pages/Clientes'
import Consultorias from '@/pages/Consultorias'
import DefinirSenha from '@/pages/DefinirSenha'
import Entrar from '@/pages/Entrar'
import EsqueciSenha from '@/pages/EsqueciSenha'
import Inicio from '@/pages/Inicio'
import Integracoes from '@/pages/Integracoes'
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
          <Route path="/capacidade" element={<Navigate to="/usuarios" replace />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<Cliente />} />
          <Route element={<RotaProtegida papeis={['dono', 'central', 'admin', 'gestor']} />}>
            <Route path="/times" element={<Times />} />
            <Route path="/times/:id" element={<Time />} />
            <Route path="/usuarios" element={<Usuarios />} />
          </Route>
          <Route element={<RotaProtegida papeis={['dono', 'central']} />}>
            <Route path="/consultorias" element={<Consultorias />} />
          </Route>
          <Route element={<RotaProtegida papeis={['dono', 'admin']} />}>
            <Route path="/integracoes" element={<Integracoes />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
