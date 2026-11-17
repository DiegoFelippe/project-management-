import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'

// "Sair" das telas de acesso (trocar senha, código, configurar o app): volta para o entrar.
export default function BotaoSair() {
  const { sair } = useAuth()
  const navigate = useNavigate()
  return (
    <button type="button" className="botao-animado mt-6 text-sm font-semibold text-muted-foreground transition-[color,translate] hover:-translate-y-px hover:text-foreground"
      onClick={async () => { await sair(); navigate('/entrar', { replace: true }) }}>
      Sair
    </button>
  )
}
