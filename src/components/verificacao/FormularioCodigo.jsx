import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { confirmarCodigo } from '@/data/verificacao'
import { codigoCompleto } from '@/lib/verificacao'
import CampoCodigo from './CampoCodigo'

// Código do app autenticador ao entrar (e antes de criar senha nova, para quem tem o app). Certo, a sessão passa a
// aal2 e `aoConfirmar()` segue.
export default function FormularioCodigo({ aoConfirmar }) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando) return
    if (!codigoCompleto(codigo)) return setErro('Digite os 6 dígitos que aparecem no app.')
    setErro(null)
    setEnviando(true)
    const { erro: falha } = await confirmarCodigo(codigo)
    if (falha) {
      setEnviando(false)
      return setErro(falha)
    }
    await aoConfirmar()
  }

  return (
    <form noValidate onSubmit={enviar} aria-label="Código do app autenticador" className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="codigo-verificacao">Código de 6 dígitos</Label>
        <CampoCodigo id="codigo-verificacao" valor={codigo} aoMudar={setCodigo} invalido={!!erro} autoFocus className="max-w-none" />
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <Button type="submit" size="lg" disabled={enviando}>{enviando ? 'Confirmando…' : 'Confirmar'}</Button>
    </form>
  )
}
