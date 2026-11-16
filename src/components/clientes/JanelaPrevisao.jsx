import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoNumero from '@/components/campos/CampoNumero'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { Button } from '@/components/ui/button'
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
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={`Ajustar a previsão de ${cliente.nome}`} icone={Gauge} enviando={enviando}
      descricao="Quantas horas por mês estão previstas para este cliente."
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-previsao" disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</Button>
        </>
      )}>
      <form id="form-previsao" noValidate onSubmit={salvar} className="space-y-5">
        <div className="grid gap-2">
          <Label htmlFor="previsao-horas">Previsão de horas por mês</Label>
          <CampoNumero id="previsao-horas" valor={horas} aoMudar={setHoras} min={0} max={999} passo={0.5} decimal unidade="h" />
        </div>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
