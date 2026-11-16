import { useId } from 'react'
import { useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'

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

  function aoTeclar(e, indice) {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!passo) return
    e.preventDefault()
    const proxima = abas[(indice + passo + abas.length) % abas.length]
    escolher(proxima.id)
    document.getElementById(`${base}-aba-${proxima.id}`)?.focus()
  }

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Seções do cliente" className="flex gap-1 overflow-x-auto border-b">
        {abas.map((aba, i) => {
          const selecionada = aba.id === atual.id
          return (
            <button key={aba.id} type="button" role="tab" id={`${base}-aba-${aba.id}`}
              aria-selected={selecionada} aria-controls={`${base}-painel-${aba.id}`} tabIndex={selecionada ? 0 : -1}
              onClick={() => escolher(aba.id)} onKeyDown={(e) => aoTeclar(e, i)}
              className={cn(
                'botao-animado -mb-px whitespace-nowrap rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-all hover:-translate-y-px active:scale-[0.97]',
                selecionada ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}>
              {aba.rotulo}
            </button>
          )
        })}
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
