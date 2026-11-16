import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { lerHoras } from '@/components/clientes/rotulos'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Carga semanal de uma pessoa (horas por semana). aoSalvar(horas) devolve { erro }.
export default function EditarCarga({ aberto, pessoa, aoFechar, aoSalvar }) {
  const [horas, setHoras] = useState(String(pessoa.carga_semanal ?? '').replace('.', ','))
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(evento) {
    evento.preventDefault()
    const valor = lerHoras(horas)
    if (valor === null || valor > 60) return setErro('Use de 0 a 60 horas.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar(valor)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Carga semanal de {pessoa.nome}</DialogTitle>
          <DialogDescription>Quantas horas por semana esta pessoa atende clientes. Com 0, ela sai da sugestão de consultor.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={salvar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="carga-horas">Carga semanal (horas)</Label>
            <Input id="carga-horas" className="h-10" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
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
