import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { horasEntre } from '@/lib/horas'

const MAXIMO_DE_HORAS = 24
const dois = (n) => String(n).padStart(2, '0')
// Data e hora no horário local do navegador (o da equipe), nos formatos dos campos nativos.
const dataLocal = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
const horaLocal = (d) => `${dois(d.getHours())}:${dois(d.getMinutes())}`

const TEXTOS = {
  checkout: { titulo: 'Fazer check-out em', botao: 'Fazer check-out', descricao: 'Conte o que foi feito neste atendimento.' },
  lancar: { titulo: 'Lançar horas em', botao: 'Lançar horas', descricao: 'Registre um atendimento que já aconteceu.' },
  editar: { titulo: 'Editar check-in em', botao: 'Salvar', descricao: 'Corrija o horário ou o que foi feito.' },
}

// Janela do check-in. modo: "checkout" (só o que foi feito), "lancar" (período passado) ou "editar".
// aoSalvar recebe { descricao } no check-out e { inicio, fim, descricao } (ISO) nos outros; devolve { erro }.
export default function JanelaCheckin({ aberto, modo, nomeDoCliente, checkin, aoFechar, aoSalvar }) {
  const inicioAtual = checkin?.inicio ? new Date(checkin.inicio) : null
  const fimAtual = checkin?.fim ? new Date(checkin.fim) : null
  const [data, setData] = useState(inicioAtual ? dataLocal(inicioAtual) : '')
  // Check-in que atravessa a meia-noite: o fim tem a própria data, mostrada só nesse caso.
  const viraODia = Boolean(inicioAtual && fimAtual && dataLocal(inicioAtual) !== dataLocal(fimAtual))
  const [dataFim, setDataFim] = useState(fimAtual ? dataLocal(fimAtual) : '')
  const [inicio, setInicio] = useState(inicioAtual ? horaLocal(inicioAtual) : '')
  const [fim, setFim] = useState(fimAtual ? horaLocal(fimAtual) : '')
  const [descricao, setDescricao] = useState(checkin?.descricao ?? '')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const textos = TEXTOS[modo]
  const comHorario = modo !== 'checkout'

  async function salvar(evento) {
    evento.preventDefault()
    const dados = { descricao: descricao.trim() }
    if (comHorario) {
      if (!data || !inicio || !fim || (viraODia && !dataFim)) return setErro('Informe a data, o início e o fim.')
      const de = new Date(`${data}T${inicio}`)
      const ate = new Date(`${viraODia ? dataFim : data}T${fim}`)
      if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime())) return setErro('Informe a data, o início e o fim.')
      if (ate <= de) return setErro('O fim precisa ser depois do início.')
      if (ate > new Date()) return setErro('O horário não pode estar no futuro.')
      if (horasEntre(de, ate) > MAXIMO_DE_HORAS) return setErro(`Um check-in tem no máximo ${MAXIMO_DE_HORAS} horas.`)
      dados.inicio = de.toISOString()
      dados.fim = ate.toISOString()
    }
    if (!dados.descricao) return setErro('Conte o que foi feito.')
    setErro(null)
    setEnviando(true)
    const resposta = await aoSalvar(dados)
    setEnviando(false)
    if (resposta?.erro) return setErro(resposta.erro)
    aoFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{textos.titulo} {nomeDoCliente}</DialogTitle>
          <DialogDescription>{textos.descricao}</DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={salvar} className="grid gap-4">
          {comHorario && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 grid gap-2 sm:col-span-1">
                <Label htmlFor="checkin-data">Data</Label>
                <Input id="checkin-data" type="date" className="h-10" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="checkin-inicio">Início</Label>
                <Input id="checkin-inicio" type="time" className="h-10" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="checkin-fim">Fim</Label>
                <Input id="checkin-fim" type="time" className="h-10" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
              {viraODia && (
                <div className="col-span-3 grid gap-2">
                  <Label htmlFor="checkin-data-fim">Data do fim</Label>
                  <Input id="checkin-data-fim" type="date" className="h-10" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="checkin-descricao">O que foi feito</Label>
            <textarea id="checkin-descricao" rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/30 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none hover:border-primary/40 focus-visible:ring-4" />
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" disabled={enviando}>{textos.botao}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
