import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoNumero from '@/components/campos/CampoNumero'
import JanelaFormulario from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'
import { lerHoras, MAXIMO_DE_HORAS_NO_MES } from './rotulos'

function erroDasHoras(horas) {
  const valor = lerHoras(horas)
  if (valor === null || valor <= 0) return 'Informe as horas por mês, maior que zero.'
  if (valor > MAXIMO_DE_HORAS_NO_MES) return `O mês tem no máximo ${MAXIMO_DE_HORAS_NO_MES} horas.`
  return null
}

// Ajustar a previsão de horas por mês de um cliente. aoSalvar(horas) devolve { erro }. O erro fica embaixo do campo, e
// fechar com o número mudado pergunta antes (usabilidade, U2 e U4).
export default function JanelaPrevisao({ aberto, cliente, aoFechar, aoSalvar }) {
  const [horas, setHoras] = useState(String(cliente.horas_mes ?? '').replace('.', ','))
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(aoFechar, {
    validar: () => (erroDasHoras(horas) ? { horas: erroDasHoras(horas) } : {}),
  })
  const alterado = useAlterado(horas)

  async function salvar(evento) {
    evento.preventDefault()
    if (!conferir()) return
    await enviar(() => aoSalvar(lerHoras(horas)))
  }

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={`Ajustar a previsão de ${cliente.nome}`} icone={Gauge} enviando={enviando}
      descricao="Quantas horas por mês estão previstas para este cliente." tentativa={tentativa} alterado={alterado} form="form-previsao" rotuloEnviar="Salvar">
      <form id="form-previsao" noValidate onSubmit={salvar} className="space-y-5">
        <Campo id="previsao-horas" rotulo="Previsão de horas por mês" erro={erros.horas}>
          <CampoNumero id="previsao-horas" valor={horas} aoMudar={setHoras} min={0} max={999} passo={0.5} decimal unidade="h" />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
      </form>
    </JanelaFormulario>
  )
}
