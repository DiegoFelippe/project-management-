// Cor do avatar (fundo das iniciais): 8 amostras e a opção "Automática" num radiogroup, como no Hub. A escolhida ganha
// o check branco e o anel na própria cor. `valor` é a cor (#hex) ou null = automática (a que o app calcula pela pessoa);
// aoMudar recebe o #hex ou null. Setas e Home/End mudam a escolha; só a escolhida entra na ordem do Tab.
import { Check } from 'lucide-react'
import { useId } from 'react'
import { CORES_DO_AVATAR } from '@/lib/cores'
import { cn } from '@/lib/utils'

export default function SeletorDeCor({ valor = null, aoMudar, rotulo = 'Cor do avatar' }) {
  const id = useId()
  // As opções na ordem do teclado: as 8 cores e, por último, a automática (valor null).
  const opcoes = [...CORES_DO_AVATAR.map((c) => c.valor), null]
  const indiceAtual = Math.max(0, opcoes.findIndex((o) => o === (valor || null)))
  const idDe = (opcao) => `${id}-${opcao ? opcao.slice(1) : 'automatica'}`

  function teclar(evento, indice) {
    const total = opcoes.length
    const destino = { ArrowRight: indice + 1, ArrowDown: indice + 1, ArrowLeft: indice - 1, ArrowUp: indice - 1, Home: 0, End: total - 1 }[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    const opcao = opcoes[(destino + total) % total]
    aoMudar(opcao)
    document.getElementById(idDe(opcao))?.focus()
  }

  return (
    <div className="grid gap-2">
      <span id={`${id}-rotulo`} className="text-corpo font-medium">{rotulo}</span>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className="flex flex-wrap items-center gap-2.5">
        {CORES_DO_AVATAR.map((cor, i) => {
          const escolhida = i === indiceAtual
          return (
            <button key={cor.valor} id={idDe(cor.valor)} type="button" role="radio" aria-checked={escolhida} aria-label={cor.nome}
              title={cor.nome} tabIndex={escolhida || (indiceAtual === opcoes.length - 1 && i === 0) ? 0 : -1}
              onClick={() => aoMudar(cor.valor)} onKeyDown={(e) => teclar(e, i)}
              style={{ backgroundColor: cor.valor, '--tw-ring-color': cor.valor }}
              className={cn('botao-animado grid size-8 place-items-center rounded-xl text-white outline-none transition-[box-shadow,translate,scale] hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-offset-2',
                escolhida && 'scale-105 ring-2 ring-offset-2')}>
              {escolhida && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
            </button>
          )
        })}
        {(() => {
          const escolhida = indiceAtual === opcoes.length - 1
          return (
            <button id={idDe(null)} type="button" role="radio" aria-checked={escolhida} tabIndex={escolhida ? 0 : -1}
              title="Cor automática: a que o sistema escolhe para a pessoa" onClick={() => aoMudar(null)}
              onKeyDown={(e) => teclar(e, opcoes.length - 1)}
              className={cn('botao-animado h-8 rounded-xl border px-3 text-rotulo font-medium outline-none transition-[box-shadow,translate,scale,border-color] hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50',
                escolhida ? 'border-primary bg-primary/5 ring-primary/15 ring-2' : 'bg-card hover:border-primary/40')}>
              Automática
            </button>
          )
        })()}
      </div>
    </div>
  )
}
