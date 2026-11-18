import { Gauge } from 'lucide-react'
import { useState } from 'react'
import CampoNumero from '@/components/campos/CampoNumero'
import { GerirAusencias } from '@/components/capacidade/GerirAusencias'
import { lerHoras } from '@/components/clientes/rotulos'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useEnvio } from '@/components/comum/useEnvio'
import { Label } from '@/components/ui/label'

// Janela "Capacidade de <nome>": carga semanal e ausências, sem abrir a ficha inteira. Quem pode é decidido
// em Usuários (e conferido de novo pelo banco). `aoSalvar(horas)` devolve { erro }; `aoMudarAusencias` avisa
// a página para buscar os números do mês de novo.
export default function CapacidadeDaPessoa({ pessoa, aoFechar, aoSalvar, aoMudarAusencias }) {
  const [carga, setCarga] = useState(String(Number(pessoa.carga_semanal ?? 44)).replace('.', ','))
  const { erro, setErro, enviando, enviar } = useEnvio(aoFechar)

  // Sem <form>: as ausências têm o formulário delas, então o Salvar do rodapé chama esta função.
  async function salvar() {
    if (enviando) return
    const horas = lerHoras(carga)
    if (horas === null || horas > 60) return setErro('Use de 0 a 60 horas.')
    await enviar(() => aoSalvar(horas))
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={`Capacidade de ${pessoa.nome}`} icone={Gauge} largura="xl" enviando={enviando}
      descricao="A carga semanal e as ausências (férias, licenças) definem a capacidade do mês."
      rotuloEnviar="Salvar" aoEnviar={salvar}>
      <SecaoFormulario titulo="Carga semanal">
        <div className="grid max-w-xs gap-2">
          <Label htmlFor="capacidade-carga">Carga semanal (horas)</Label>
          <CampoNumero id="capacidade-carga" valor={carga} aoMudar={setCarga} min={0} max={99} passo={0.5} decimal unidade="h" />
          {erro && <p role="alert" className="text-rotulo text-destructive">{erro}</p>}
          <p className="text-rotulo text-muted-foreground">De 0 a 60. Com 0, a pessoa sai da sugestão de consultor.</p>
        </div>
      </SecaoFormulario>
      <SecaoFormulario titulo="Ausências">
        <GerirAusencias pessoa={pessoa} aoMudar={aoMudarAusencias} />
      </SecaoFormulario>
    </JanelaFormulario>
  )
}
