import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deslocarMes, rotuloDoMes } from '@/lib/mes'

// "‹ Anterior · Novembro de 2026 · Próximo ›" (no celular, só os ícones) para a barra de filtros das telas com números do mês.
export default function NavegacaoDoMes({ mes, aoMudar }) {
  return (
    <div role="group" aria-label="Mês" className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      <Button variant="ghost" size="sm" aria-label="Mês anterior" onClick={() => aoMudar(deslocarMes(mes, -1))}>
        <ChevronLeft /> <span className="hidden sm:inline">Anterior</span>
      </Button>
      <span aria-live="polite" className="min-w-28 px-2 sm:min-w-36 text-center text-sm font-semibold tabular-nums">{rotuloDoMes(mes)}</span>
      <Button variant="ghost" size="sm" aria-label="Próximo mês" onClick={() => aoMudar(deslocarMes(mes, 1))}>
        <span className="hidden sm:inline">Próximo</span> <ChevronRight />
      </Button>
    </div>
  )
}
