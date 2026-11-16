import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deslocarMes, rotuloDoMes } from '@/lib/mes'

// "‹ Anterior · Novembro de 2026 · Próximo ›" para a barra de filtros das telas com números do mês.
export default function NavegacaoDoMes({ mes, aoMudar }) {
  return (
    <div role="group" aria-label="Mês" className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      <Button variant="ghost" size="sm" onClick={() => aoMudar(deslocarMes(mes, -1))}><ChevronLeft /> Anterior</Button>
      <span aria-live="polite" className="min-w-36 px-2 text-center text-sm font-semibold tabular-nums">{rotuloDoMes(mes)}</span>
      <Button variant="ghost" size="sm" onClick={() => aoMudar(deslocarMes(mes, 1))}>Próximo <ChevronRight /></Button>
    </div>
  )
}
