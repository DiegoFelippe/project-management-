import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Editar consultoria (só o dono): o nome. Arquivar e reativar ficam na linha da tabela.
export default function EditarConsultoria({ aberto, aoFechar, consultoria, aoSalvar }) {
  const [nome, setNome] = useState(consultoria?.nome ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(evento) {
    evento.preventDefault()
    if (nome.trim().length < 2) return setErro('Use pelo menos 2 caracteres.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar(nome.trim())
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar consultoria</DialogTitle>
          <DialogDescription>O nome aparece para todos da consultoria.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={salvar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="editar-consultoria">Nome da consultoria</Label>
            <Input id="editar-consultoria" className="h-10" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
