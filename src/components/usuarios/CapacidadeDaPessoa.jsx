import { Gauge } from 'lucide-react'
import { useState } from 'react'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import Campo from '@/components/campos/Campo'
import CampoNumero from '@/components/campos/CampoNumero'
import { GerirAusencias } from '@/components/capacidade/GerirAusencias'
import { lerHoras } from '@/components/clientes/rotulos'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { useAlterado } from '@/components/comum/useAlterado'
import { useEnvio } from '@/components/comum/useEnvio'

// Janela "Capacidade de <nome>": carga semanal e ausências, sem abrir a ficha inteira. Quem pode é decidido
// em Usuários (e conferido de novo pelo banco). `aoSalvar(horas)` devolve { erro }; `aoMudarAusencias` avisa
// a página para buscar os números do mês de novo. O erro da carga fica embaixo dela, e fechar com a carga mudada
// pergunta antes (usabilidade, U2 e U4; as ausências gravam na hora, no formulário delas).
export default function CapacidadeDaPessoa({ pessoa, aoFechar, aoSalvar, aoMudarAusencias }) {
  const [carga, setCarga] = useState(String(Number(pessoa.carga_semanal ?? 44)).replace('.', ','))
  const { erro, erros, tentativa, conferir, enviando, enviar } = useEnvio(aoFechar, {
    validar: () => {
      const horas = lerHoras(carga)
      return horas === null || horas > 60 ? { carga: 'Use de 0 a 60 horas.' } : {}
    },
  })
  const alterado = useAlterado(carga)

  // Sem <form>: as ausências têm o formulário delas, então o Salvar do rodapé chama esta função.
  async function salvar() {
    if (enviando) return
    if (!conferir()) return
    await enviar(() => aoSalvar(lerHoras(carga)))
  }

  return (
    <JanelaFormulario aberto aoFechar={aoFechar} titulo={`Capacidade de ${pessoa.nome}`} icone={Gauge} largura="xl" enviando={enviando}
      descricao="A carga semanal e as ausências (férias, licenças) definem a capacidade do mês." tentativa={tentativa} alterado={alterado}
      rotuloEnviar="Salvar" aoEnviar={salvar}>
      <SecaoFormulario titulo="Carga semanal">
        <Campo id="capacidade-carga" rotulo="Carga semanal (horas)" erro={erros.carga} dica="De 0 a 60. Com 0, a pessoa sai da sugestão de consultor."
          className="max-w-xs">
          <CampoNumero id="capacidade-carga" valor={carga} aoMudar={setCarga} min={0} max={99} passo={0.5} decimal unidade="h" />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
      </SecaoFormulario>
      <SecaoFormulario titulo="Ausências">
        <GerirAusencias pessoa={pessoa} aoMudar={aoMudarAusencias} />
      </SecaoFormulario>
    </JanelaFormulario>
  )
}
