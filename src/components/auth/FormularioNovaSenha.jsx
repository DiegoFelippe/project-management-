import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
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
        <Input id="senha-nova" type="password" autoComplete="new-password" autoFocus className="h-10"
          value={senha} onChange={(e) => setSenha(e.target.value)} />
        <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
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
