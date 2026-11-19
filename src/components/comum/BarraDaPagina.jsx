import { cn } from '@/lib/utils'

// O cartão das barras da página: fundo, borda, cantos, sombra e espaçamento da BarraDeFiltros (que é feita com ele).
// Quebra linha em telas estreitas. Com `rotulo` vira uma região com nome (ex.: a barra de abas e ações do cliente).
export default function BarraDaPagina({ rotulo, children, className }) {
  const Elemento = rotulo ? 'section' : 'div'
  return (
    <Elemento aria-label={rotulo} className={cn('card mb-4 flex flex-wrap items-center gap-3 p-3', className)}>
      {children}
    </Elemento>
  )
}
