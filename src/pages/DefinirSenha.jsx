import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import FormularioNovaSenha from '@/components/auth/FormularioNovaSenha'
import TelaDeAcesso, { Aviso, Titulo } from '@/components/auth/TelaDeAcesso'
import Carregando from '@/components/comum/Carregando'
import FormularioCodigo from '@/components/verificacao/FormularioCodigo'
import { codigoDeErroNoEndereco } from '@/lib/endereco'
import { REGRA_DA_SENHA } from '@/lib/senha'

// Destino do link do convite e do "esqueci minha senha": o link já traz a sessão.
// Quem tem o app autenticador ativo digita o código antes: o Auth só troca a senha de uma sessão aal2.
export default function DefinirSenha() {
  const { sessao, carregando, verificacao, recarregarPerfil } = useAuth()
  // Link vencido ou já usado: o motivo vem no endereço. Vale mesmo com outra conta aberta neste
  // navegador, para o formulário nunca trocar a senha da pessoa errada.
  const [linkComErro] = useState(() => codigoDeErroNoEndereco() !== null)
  if (!linkComErro && carregando) return <Carregando />

  if (linkComErro || !sessao) {
    return (
      <TelaDeAcesso>
        <Titulo titulo="Criar senha" />
        <Aviso>Esse link expirou ou já foi usado.</Aviso>
        <p className="mt-4 text-corpo text-muted-foreground">
          Peça um link novo em{' '}
          <Link to="/esqueci-senha" className="font-semibold text-primary hover:underline">Esqueci minha senha</Link>.
        </p>
      </TelaDeAcesso>
    )
  }

  if (verificacao === 'codigo') {
    return (
      <TelaDeAcesso>
        <Titulo titulo="Crie sua senha">Antes de criar a senha, digite o código do seu app autenticador.</Titulo>
        <FormularioCodigo aoConfirmar={recarregarPerfil} />
      </TelaDeAcesso>
    )
  }

  return (
    <TelaDeAcesso>
      <Titulo titulo="Crie sua senha">Escolha uma senha com {REGRA_DA_SENHA}.</Titulo>
      <FormularioNovaSenha />
    </TelaDeAcesso>
  )
}
