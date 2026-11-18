import { useRef } from 'react'
import { cn } from '@/lib/utils'

const PASSOS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

// Cartões de opção, um de cada vez (auditoria, C7): "Como a pessoa entra" na ficha e "Para quem" do modelo de check-in.
// Cada cartão é um radio (ícone, título e dica); o escolhido ganha a borda e o anel da cor principal. Teclado como um
// grupo de rádios: o Tab para só no escolhido (no primeiro, se nenhum estiver) e as setas escolhem o vizinho, dando a
// volta nas pontas. `opcoes`: [{ valor, titulo, dica, icone }]. `className` vai na grade (ex.: `sm:grid-cols-2`).
export default function CartoesDeOpcao({ rotulo, opcoes, valor, aoMudar, className }) {
  const cartoes = useRef([])
  const temEscolhido = opcoes.some((o) => o.valor === valor)

  function teclar(evento, indice) {
    const passo = PASSOS[evento.key]
    if (!passo) return
    evento.preventDefault()
    const proximo = (indice + passo + opcoes.length) % opcoes.length
    aoMudar(opcoes[proximo].valor)
    cartoes.current[proximo]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={rotulo} className={cn('grid gap-2', className)}>
      {opcoes.map((o, i) => {
        const escolhida = valor === o.valor
        return (
          <button key={o.valor} ref={(el) => { cartoes.current[i] = el }} type="button" role="radio" aria-checked={escolhida}
            tabIndex={escolhida || (!temEscolhido && i === 0) ? 0 : -1} onClick={() => aoMudar(o.valor)} onKeyDown={(e) => teclar(e, i)}
            className={cn('botao-animado flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow,translate,scale] outline-none hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50',
              escolhida ? 'border-primary bg-primary/5 ring-primary/15 ring-2' : 'bg-card hover:border-primary/40')}>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', escolhida ? 'bg-primary-cheio text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <o.icone className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-rotulo font-semibold">{o.titulo}</span>
              <span className="text-muted-foreground block text-legenda">{o.dica}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
