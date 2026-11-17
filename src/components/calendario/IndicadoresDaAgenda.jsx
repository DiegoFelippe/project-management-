import { CalendarCheck, CalendarDays, FolderCheck, Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'

// Os 4 números da agenda, como os do Hub, do banco (indicadores_da_agenda, no recorte de quem vê). "Reunião" é evento
// com cliente ou com Meet; a semana vai de domingo a sábado.
const CARTOES = [
  { chave: 'semana', rotulo: 'Reuniões na semana', icone: CalendarDays, tom: 'bg-primary/10 text-primary' },
  { chave: 'mes', rotulo: 'Reuniões no mês', icone: CalendarCheck, tom: 'bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  { chave: 'aguardando', rotulo: 'Aguardando transcrição', icone: Hourglass, tom: 'bg-notice-soft text-notice' },
  { chave: 'pastas_no_mes', rotulo: 'Pastas criadas no mês', icone: FolderCheck, tom: 'bg-positive-soft text-positive' },
]

export default function IndicadoresDaAgenda({ indicadores }) {
  return (
    <section aria-label="Indicadores da agenda" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARTOES.map(({ chave, rotulo, icone: Icone, tom }) => (
        <div key={chave} className="card flex items-center gap-3 px-4 py-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', tom)}>
            <Icone className="size-[17px]" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-titulo leading-none font-bold tabular-nums">
              {indicadores ? Number(indicadores[chave] ?? 0).toLocaleString('pt-BR') : '—'}
            </span>
            <span className="mt-1 text-rotulo text-muted-foreground max-sm:line-clamp-2 sm:truncate">{rotulo}</span>
          </span>
        </div>
      ))}
    </section>
  )
}
