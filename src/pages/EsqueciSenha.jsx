import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import TelaDeAcesso, { Aviso, Titulo } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function EsqueciSenha() {
  const { enviarRecuperacao } = useAuth()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    evento.preventDefault()
    if (!email.includes('@')) return setErro('Digite o e-mail do seu acesso.')
    setErro(null)
    setEnviando(true)
    const { erro: falha } = await enviarRecuperacao(email)
    setEnviando(false)
    if (falha) return setErro(falha)
    setEnviado(true)
  }

  return (
    <TelaDeAcesso>
      <Titulo titulo="Esqueci minha senha">
        Digite o e-mail do seu acesso. Vamos mandar um link para criar uma senha nova.
      </Titulo>
      {enviado ? (
        <Aviso tipo="info">Se esse e-mail tiver acesso, enviamos um link para criar uma senha nova.</Aviso>
      ) : (
        <form noValidate onSubmit={enviar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" autoFocus className="h-10"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <Button type="submit" size="lg" disabled={enviando}>Enviar link</Button>
        </form>
      )}
      <Link to="/entrar" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">
        Voltar para entrar
      </Link>
    </TelaDeAcesso>
  )
}
