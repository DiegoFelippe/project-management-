import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoNumero from '@/components/campos/CampoNumero'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Label } from '@/components/ui/label'
import { lerHoras, MAXIMO_DE_HORAS_NO_MES } from './rotulos'

// Ajustar a previsão de horas por mês de um cliente. aoSalvar(horas) devolve { erro }.
export default function JanelaPrevisao({ aberto, cliente, aoFechar, aoSalvar }) {
  const [horas, setHoras] = useState(String(cliente.horas_mes ?? '').replace('.', ','))
  const { erro, setErro, enviando, enviar } = useEnvio(aoFechar)

  async function salvar(evento) {
    evento.preventDefault()
    const valor = lerHoras(horas)
    if (valor === null || valor <= 0) return setErro('Informe as horas por mês, maior que zero.')
    if (valor > MAXIMO_DE_HORAS_NO_MES) return setErro(`O mês tem no máximo ${MAXIMO_DE_HORAS_NO_MES} horas.`)
    await enviar(() => aoSalvar(valor))
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={`Ajustar a previsão de ${cliente.nome}`} icone={Gauge} enviando={enviando}
      descricao="Quantas horas por mês estão previstas para este cliente." form="form-previsao" rotuloEnviar="Salvar">
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
