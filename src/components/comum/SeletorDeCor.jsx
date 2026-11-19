// Seletor de cor, um só para o app (auditoria de 17/11, C6): a cor do avatar (FichaDoConsultor), a do evento (JanelaEvento)
// e a da coluna do quadro. As amostras de `cores` num radiogroup, como no Hub: a escolhida ganha o check e o anel.
// - cores: [{ valor, nome, fundo?: '#hex' (pinta pelo style; o check segue o corDoTextoSobre), classe?: 'bg-… text-…' (o check
//   branco, a não ser que a classe traga o texto, como as amostras das colunas do quadro, na cor forte) }].
// - automatica ({ rotulo, titulo?, classe? }): a opção sem cor (valor null) no fim, com a bolinha da cor que valeria.
// - mostrarRotulo={false}: o rótulo fica só para o leitor de tela (a seção em volta já diz "Cor").
// - Setas e Home/End andam entre as opções e só a escolhida entra na ordem do Tab. marcarAoAndar (padrão): a seta já
//   escolhe (o formulário grava depois); false (a coluna do quadro, que grava na hora): a seta só leva o foco, e Enter,
//   espaço ou clique escolhem.
import { Check } from 'lucide-react'
import { useId } from 'react'
import { corDoTextoSobre } from '@/lib/cores'
import { cn } from '@/lib/utils'

const ANIMACAO = 'outline-none transition-[box-shadow,translate,scale,background-color,border-color] hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card'

export default function SeletorDeCor({
  cores, valor = null, aoMudar, rotulo, mostrarRotulo = true, automatica = null, marcarAoAndar = true, className,
}) {
  const id = useId()
  const opcoes = automatica ? [...cores.map((c) => c.valor), null] : cores.map((c) => c.valor)
  const escolhida = opcoes.indexOf(valor ?? null)
  const naOrdemDoTab = Math.max(0, escolhida)
  const idDe = (indice) => `${id}-${indice}`

  function teclar(evento, indice) {
    const total = opcoes.length
    const destino = { ArrowRight: indice + 1, ArrowDown: indice + 1, ArrowLeft: indice - 1, ArrowUp: indice - 1, Home: 0, End: total - 1 }[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    const proximo = (destino + total) % total
    if (marcarAoAndar) aoMudar(opcoes[proximo])
    document.getElementById(idDe(proximo))?.focus()
  }

  const comum = (indice) => ({
    id: idDe(indice), type: 'button', role: 'radio', 'aria-checked': indice === escolhida, tabIndex: indice === naOrdemDoTab ? 0 : -1,
    onClick: () => aoMudar(opcoes[indice]), onKeyDown: (e) => teclar(e, indice),
  })

  return (
    <div className={cn('grid gap-2', className)}>
      <span id={`${id}-rotulo`} className={mostrarRotulo ? 'text-corpo font-medium' : 'sr-only'}>{rotulo}</span>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className="flex flex-wrap items-center gap-2.5">
        {cores.map((cor, i) => {
          const marcada = i === escolhida
          return (
            <button key={String(cor.valor)} {...comum(i)} aria-label={cor.nome} title={cor.nome}
              style={cor.fundo ? { backgroundColor: cor.fundo, color: corDoTextoSobre(cor.fundo) } : undefined}
              className={cn('botao-animado', ANIMACAO, 'grid size-8 shrink-0 place-items-center rounded-full pointer-coarse:size-11', !cor.fundo && 'text-white', cor.classe,
                marcada && 'scale-105 ring-2 ring-foreground ring-offset-2 ring-offset-card')}>
              {marcada && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
            </button>
          )
        })}
        {automatica && (() => {
          const indice = opcoes.length - 1
          const marcada = indice === escolhida
          return (
            <button {...comum(indice)} title={automatica.titulo}
              className={cn('botao-animado', ANIMACAO, 'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-rotulo font-medium pointer-coarse:min-h-11',
                marcada ? 'border-primary bg-primary/10 text-foreground ring-2 ring-primary/15' : 'bg-card text-foreground hover:border-primary/40')}>
              {automatica.classe && <span className={cn('size-3 shrink-0 rounded-full opacity-70', automatica.classe)} aria-hidden="true" />}
              {automatica.rotulo}
            </button>
          )
        })()}
      </div>
    </div>
  )
}
