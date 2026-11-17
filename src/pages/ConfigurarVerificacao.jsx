import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { voltaDepoisDaVerificacao } from '@/lib/verificacao'
import TelaDeAcesso, { Titulo } from '@/components/auth/TelaDeAcesso'
import BotaoSair from '@/components/auth/BotaoSair'
import CadastroDoAutenticador from '@/components/verificacao/CadastroDoAutenticador'

// Quem tem a verificação em duas etapas exigida e ainda não tem o app configura antes de entrar. Não dá para pular.
export default function ConfigurarVerificacao() {
  const { verificacao, recarregarPerfil } = useAuth()
  const navigate = useNavigate()
  const volta = voltaDepoisDaVerificacao(useLocation().state)
  // Com o primeiro código a sessão vira aal2 na hora; o Início só abre depois do perfil recarregado.
  const [entrando, setEntrando] = useState(false)
  if (verificacao !== 'configurar' && !entrando) return <Navigate to={volta} replace />

  return (
    <TelaDeAcesso>
      <Titulo titulo="Configure a verificação em duas etapas">
        A verificação em duas etapas é exigida para o seu acesso: além da senha, você vai usar um código do app
        autenticador do celular.
      </Titulo>
      <CadastroDoAutenticador rotuloConfirmar="Confirmar e entrar" idCodigo="codigo-configurar" focar aoEnviando={setEntrando}
        aoConcluir={async () => {
          await recarregarPerfil()
          navigate(volta, { replace: true })
        }} />
      <BotaoSair />
    </TelaDeAcesso>
  )
}
