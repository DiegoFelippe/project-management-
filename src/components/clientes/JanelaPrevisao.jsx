import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { lerHoras, MAXIMO_DE_HORAS_NO_MES } from './rotulos'

// Ajustar a previsão de horas por mês de um cliente. aoSalvar(horas) devolve { erro }.
export default function JanelaPrevisao({ aberto, cliente, aoFechar, aoSalvar }) {
  const [horas, setHoras] = useState(String(cliente.horas_mes ?? '').replace('.', ','))
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(evento) {
    evento.preventDefault()
    const valor = lerHoras(horas)
    if (valor === null || valor <= 0) return setErro('Informe as horas por mês, maior que zero.')
    if (valor > MAXIMO_DE_HORAS_NO_MES) return setErro(`O mês tem no máximo ${MAXIMO_DE_HORAS_NO_MES} horas.`)
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
          <DialogTitle>Ajustar a previsão de {cliente.nome}</DialogTitle>
          <DialogDescription>Quantas horas por mês estão previstas para este cliente.</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={salvar} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="previsao-horas">Previsão de horas por mês</Label>
            <Input id="previsao-horas" className="h-10" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
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
