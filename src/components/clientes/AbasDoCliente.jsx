import { useId } from 'react'
import { useSearchParams } from 'react-router'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'

// Abas da página do cliente. `abas` é a lista, na ordem em que aparecem: { id, rotulo, conteudo }. A escolhida
// vive em ?aba= (a primeira é a padrão; valor desconhecido volta para ela). Só o painel aberto monta o conteúdo.
export default function AbasDoCliente({ abas }) {
  const [parametros, setParametros] = useSearchParams()
  const base = useId()
  const pedida = parametros.get('aba')
  const atual = abas.find((a) => a.id === pedida) ?? abas[0]

  function escolher(id) {
    setParametros((anteriores) => {
      const novos = new URLSearchParams(anteriores)
      if (id === abas[0].id) novos.delete('aba')
      else novos.set('aba', id)
      return novos
    }, { replace: true })
  }

  return (
    <div className="grid gap-4">
      <div>
        <AbasSegmentadas comoAbas idBase={base} rotulo="Seções do cliente" valor={atual.id} aoMudar={escolher}
          abas={abas.map((a) => ({ valor: a.id, rotulo: a.rotulo }))} />
      </div>
      {abas.map((aba) => (
        <div key={aba.id} role="tabpanel" id={`${base}-painel-${aba.id}`} aria-labelledby={`${base}-aba-${aba.id}`}
          hidden={aba.id !== atual.id} tabIndex={0}>
          {aba.id === atual.id && aba.conteudo}
        </div>
      ))}
    </div>
  )
}
