import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deslocarMes, rotuloDoMes } from '@/lib/mes'

// "‹ Anterior · Novembro de 2026 · Próximo ›" (no celular, só os ícones) para a barra de filtros das telas com números do mês.
// maximo (opcional, "AAAA-MM-01"): o Próximo fica desabilitado a partir desse mês (ex.: gráficos não passam do mês atual).
// minimo (opcional, "AAAA-MM-01"): o Anterior fica desabilitado nesse mês (ex.: o mês do cadastro do cliente).
// No toque, as setas têm 44 × 44 px (no celular elas são só o ícone).
export default function NavegacaoDoMes({ mes, aoMudar, maximo, minimo }) {
  return (
    <div role="group" aria-label="Mês" className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      <Button variant="ghost" size="sm" aria-label="Mês anterior" className="pointer-coarse:min-w-11" disabled={minimo ? mes <= minimo : false}
        onClick={() => aoMudar(deslocarMes(mes, -1))}>
        <ChevronLeft /> <span className="hidden sm:inline">Anterior</span>
      </Button>
      <span aria-live="polite" className="min-w-28 px-2 sm:min-w-36 text-center text-corpo font-semibold tabular-nums">{rotuloDoMes(mes)}</span>
      <Button variant="ghost" size="sm" aria-label="Próximo mês" className="pointer-coarse:min-w-11" disabled={maximo ? mes >= maximo : false} onClick={() => aoMudar(deslocarMes(mes, 1))}>
        <span className="hidden sm:inline">Próximo</span> <ChevronRight />
      </Button>
    </div>
  )
}
