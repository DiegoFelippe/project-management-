import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import TelaDeAcesso, { Titulo } from '@/components/auth/TelaDeAcesso'
import BotaoSair from '@/components/auth/BotaoSair'
import FormularioCodigo from '@/components/verificacao/FormularioCodigo'

// Depois da senha (ou do Google), quem tem o app autenticador ativo digita o código antes de entrar no app.
// Também é para onde vai a sessão antiga (aal1) de quem passou a precisar do código.
export default function VerificarCodigo() {
  const { verificacao, recarregarPerfil } = useAuth()
  const navigate = useNavigate()
  // Com o código certo a sessão vira aal2 na hora (verificacao 'ok'), mas o Início só abre depois do perfil
  // recarregado: antes disso ele apareceria um instante sem o nome da consultoria.
  const [entrando, setEntrando] = useState(false)
  if (verificacao !== 'codigo' && !entrando) return <Navigate to="/" replace />

  return (
    <TelaDeAcesso>
      <Titulo titulo="Verificação em duas etapas">Digite o código do seu app autenticador.</Titulo>
      <FormularioCodigo aoEnviando={setEntrando} aoConfirmar={async () => {
        // Com o código, o banco libera o resto do perfil (a consultoria, a logo).
        await recarregarPerfil()
        navigate('/', { replace: true })
      }} />
      <p className="mt-4 text-sm text-muted-foreground text-pretty">
        Perdeu o celular? Peça a quem administra o seu acesso para zerar a verificação em duas etapas.
      </p>
      <BotaoSair />
    </TelaDeAcesso>
  )
}
