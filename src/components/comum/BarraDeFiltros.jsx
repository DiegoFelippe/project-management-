import { Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Cartão que reúne, nesta ordem, o rótulo "Filtros" (ícone + texto, sempre, como no Calendário), as abas, a busca, os filtros pequenos e a ação principal (no fim, à direita).
export default function BarraDeFiltros({ children, className }) {
  return (
    <div className={cn('card mb-4 flex flex-wrap items-center gap-3 p-3', className)}>
      <span className="inline-flex items-center gap-1.5 text-rotulo font-semibold text-foreground/80">
        <SlidersHorizontal className="size-3.5" aria-hidden="true" /> Filtros
      </span>
      {children}
    </div>
  )
}

// Busca com lupa. `rotulo` é o nome acessível do campo.
export function CampoBusca({ rotulo, placeholder, valor, aoMudar }) {
  return (
    <div className="relative min-w-48 max-w-xs flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input type="search" aria-label={rotulo} placeholder={placeholder} className="pl-9" value={valor}
        onChange={(e) => aoMudar(e.target.value)} />
    </div>
  )
}

// Ação principal da barra (botão azul): vai para o fim da linha.
export function AcaoPrincipal({ children }) {
  return <div className="ml-auto flex items-center gap-2">{children}</div>
}
