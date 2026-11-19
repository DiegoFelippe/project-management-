import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// O estado da gravação do campo, ao lado do rótulo (useGravacao): "Salvando…", "Salvo" ou "Erro ao salvar"; vazio quando
// não há nada a dizer (a região avisa o leitor de tela).
export default function EstadoDaGravacao({ estado }) {
  return (
    <span aria-live="polite"
      className={cn('inline-flex items-center gap-1 text-legenda', estado === 'erro' ? 'font-medium text-destructive'
        : estado === 'salvo' ? 'font-medium text-positive' : 'text-muted-foreground')}>
      {estado === 'salvando' && 'Salvando…'}
      {estado === 'salvo' && <><Check className="size-3" aria-hidden="true" />Salvo</>}
      {estado === 'erro' && 'Erro ao salvar'}
    </span>
  )
}
