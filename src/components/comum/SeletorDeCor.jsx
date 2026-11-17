// Cor do avatar (fundo das iniciais): 8 amostras num radiogroup, como no Hub. A escolhida ganha o check branco e o
// anel na própria cor. Setas e Home/End mudam a escolha; só a escolhida entra na ordem do Tab.
import { Check } from 'lucide-react'
import { useId } from 'react'
import { CORES_DO_AVATAR } from '@/lib/cores'
import { cn } from '@/lib/utils'

export default function SeletorDeCor({ valor, aoMudar, rotulo = 'Cor do avatar' }) {
  const id = useId()
  const indiceAtual = Math.max(0, CORES_DO_AVATAR.findIndex((c) => c.valor === valor))

  function teclar(evento, indice) {
    const total = CORES_DO_AVATAR.length
    const destino = { ArrowRight: indice + 1, ArrowDown: indice + 1, ArrowLeft: indice - 1, ArrowUp: indice - 1, Home: 0, End: total - 1 }[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    const cor = CORES_DO_AVATAR[(destino + total) % total]
    aoMudar(cor.valor)
    document.getElementById(`${id}-${cor.valor.slice(1)}`)?.focus()
  }

  return (
    <div className="grid gap-2">
      <span id={`${id}-rotulo`} className="text-sm font-medium">{rotulo}</span>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className="flex flex-wrap gap-2.5">
        {CORES_DO_AVATAR.map((cor, i) => {
          const escolhida = i === indiceAtual && Boolean(valor)
          return (
            <button key={cor.valor} id={`${id}-${cor.valor.slice(1)}`} type="button" role="radio" aria-checked={escolhida} aria-label={cor.nome}
              title={cor.nome} tabIndex={i === indiceAtual ? 0 : -1} onClick={() => aoMudar(cor.valor)} onKeyDown={(e) => teclar(e, i)}
              style={{ backgroundColor: cor.valor, '--tw-ring-color': cor.valor }}
              className={cn('botao-animado grid size-8 place-items-center rounded-xl text-white outline-none transition-[box-shadow,translate,scale] hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-offset-2',
                escolhida && 'scale-105 ring-2 ring-offset-2')}>
              {escolhida && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
