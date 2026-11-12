import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import FormularioNovaSenha from '@/components/auth/FormularioNovaSenha'
import TelaDeAcesso, { Aviso, Titulo } from '@/components/auth/TelaDeAcesso'
import Carregando from '@/components/comum/Carregando'

// Destino do link do convite e do "esqueci minha senha": o link já traz a sessão.
export default function DefinirSenha() {
  const { sessao, carregando } = useAuth()
  if (carregando) return <Carregando />

  if (!sessao) {
    return (
      <TelaDeAcesso>
        <Titulo titulo="Criar senha" />
        <Aviso>Esse link expirou ou já foi usado.</Aviso>
        <p className="mt-4 text-sm text-muted-foreground">
          Peça um link novo em{' '}
          <Link to="/esqueci-senha" className="font-semibold text-primary hover:underline">Esqueci minha senha</Link>.
        </p>
      </TelaDeAcesso>
    )
  }

  return (
    <TelaDeAcesso>
      <Titulo titulo="Crie sua senha">Escolha uma senha com pelo menos 8 caracteres.</Titulo>
      <FormularioNovaSenha />
    </TelaDeAcesso>
  )
}
