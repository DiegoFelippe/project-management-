import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// <select> do navegador com a cara dos campos do app (acessível e simples de testar).
function SelectNativo({ className, children, ...props }) {
  return (
    <div className={cn('relative', className)}>
      <select
        data-slot="select"
        className="h-10 w-full appearance-none rounded-md border border-input bg-card pr-9 pl-3 text-sm shadow-xs outline-none hover:border-primary/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/30 disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { SelectNativo }
