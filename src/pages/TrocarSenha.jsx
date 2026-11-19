import { Navigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import FormularioNovaSenha from '@/components/auth/FormularioNovaSenha'
import TelaDeAcesso, { Titulo } from '@/components/auth/TelaDeAcesso'
import BotaoSair from '@/components/auth/BotaoSair'

// Quem entrou com a senha provisória (ou pelo Google, tendo uma) troca antes de usar o sistema.
export default function TrocarSenha() {
  const { perfil } = useAuth()
  if (!perfil?.precisa_trocar_senha) return <Navigate to="/" replace />

  return (
    <TelaDeAcesso>
      <Titulo titulo="Troque a senha provisória">Antes de continuar, crie uma senha só sua.</Titulo>
      <FormularioNovaSenha />
      <BotaoSair />
    </TelaDeAcesso>
  )
}
