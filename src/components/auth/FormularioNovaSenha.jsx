import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import CampoSenha from '@/components/campos/CampoSenha'
import { avaliarSenha } from '@/lib/senha'
import { Label } from '@/components/ui/label'
import { Aviso } from './TelaDeAcesso'

// Usado ao aceitar o convite, ao recuperar a senha e ao trocar a senha provisória.
export default function FormularioNovaSenha() {
  const { definirSenha, recarregarPerfil } = useAuth()
  const navigate = useNavigate()
  const [senha, setSenha] = useState('')
  const [repetida, setRepetida] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    evento.preventDefault()
    if (!avaliarSenha(senha).forte) return setErro('A senha precisa ser forte: confira as regras abaixo do campo.')
    if (senha !== repetida) return setErro('As senhas não são iguais.')
    setErro(null)
    setEnviando(true)
    const { erro: falha } = await definirSenha(senha)
    if (falha) {
      setErro(falha)
      setEnviando(false)
      return
    }
    await recarregarPerfil()
    navigate('/', { replace: true })
  }

  return (
    <form noValidate onSubmit={enviar} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="senha-nova">Senha nova</Label>
        <CampoSenha id="senha-nova" valor={senha} aoMudar={setSenha} autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="senha-repetida">Repita a senha</Label>
        <Input id="senha-repetida" type="password" autoComplete="new-password" className="h-10"
          value={repetida} onChange={(e) => setRepetida(e.target.value)} />
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <Button type="submit" size="lg" disabled={enviando}>
        Salvar senha
      </Button>
    </form>
  )
}
