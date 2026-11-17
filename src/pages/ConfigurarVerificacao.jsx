import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import TelaDeAcesso, { Titulo } from '@/components/auth/TelaDeAcesso'
import BotaoSair from '@/components/auth/BotaoSair'
import CadastroDoAutenticador from '@/components/verificacao/CadastroDoAutenticador'

// Quem tem a verificação em duas etapas exigida e ainda não tem o app configura antes de entrar. Não dá para pular.
export default function ConfigurarVerificacao() {
  const { verificacao, recarregarPerfil } = useAuth()
  const navigate = useNavigate()
  if (verificacao !== 'configurar') return <Navigate to="/" replace />

  return (
    <TelaDeAcesso>
      <Titulo titulo="Configure a verificação em duas etapas">
        A verificação em duas etapas é exigida para o seu acesso: além da senha, você vai usar um código do app
        autenticador do celular.
      </Titulo>
      <CadastroDoAutenticador rotuloConfirmar="Confirmar e entrar" idCodigo="codigo-configurar" focar
        aoConcluir={async () => {
          await recarregarPerfil()
          navigate('/', { replace: true })
        }} />
      <BotaoSair />
    </TelaDeAcesso>
  )
}
