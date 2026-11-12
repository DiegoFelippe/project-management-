import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import FormularioNovaSenha from '@/components/auth/FormularioNovaSenha'
import TelaDeAcesso, { Titulo } from '@/components/auth/TelaDeAcesso'

// Quem entrou com a senha provisória (ou pelo Google, tendo uma) troca antes de usar o sistema.
export default function TrocarSenha() {
  const { perfil, sair } = useAuth()
  const navigate = useNavigate()
  if (!perfil?.precisa_trocar_senha) return <Navigate to="/" replace />

  return (
    <TelaDeAcesso>
      <Titulo titulo="Troque a senha provisória">Antes de continuar, crie uma senha só sua.</Titulo>
      <FormularioNovaSenha />
      <button type="button" className="botao-animado mt-6 text-sm font-semibold text-muted-foreground transition-[color,translate] hover:-translate-y-px hover:text-foreground"
        onClick={async () => { await sair(); navigate('/entrar', { replace: true }) }}>
        Sair
      </button>
    </TelaDeAcesso>
  )
}
