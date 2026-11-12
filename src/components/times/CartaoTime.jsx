import { Link } from 'react-router'
import Avatar from '@/components/comum/Avatar'
import { Badge } from '@/components/ui/badge'

// Cartão da lista: nome, gestor, rostos (gestor primeiro) e quantas pessoas (gestor + membros).
export default function CartaoTime({ time }) {
  const pessoas = [time.gestor, ...time.membros.filter((m) => m.id !== time.gestor?.id)].filter(Boolean)
  const visiveis = pessoas.slice(0, 4)
  const resto = pessoas.length - visiveis.length

  return (
    <Link to={`/times/${time.id}`}
      className="grid gap-2.5 rounded-xl border bg-card p-4 shadow-xs outline-none transition-[border-color,box-shadow,translate] hover:-translate-y-px hover:border-primary/35 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring">
      <h2 className="truncate text-base font-semibold">{time.nome}</h2>
      <p className="text-xs text-muted-foreground">Gestor: {time.gestor?.nome ?? '—'}</p>
      <div className="flex items-center">
        {visiveis.map((p, i) => (
          <Avatar key={p.id} pessoa={p} className={i ? '-ml-1.5' : ''} />
        ))}
        {resto > 0 && (
          <span className="-ml-1.5 grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-2 ring-card">
            +{resto}
          </span>
        )}
      </div>
      <Badge variant="secondary" className="bg-accent text-accent-foreground">
        {pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
      </Badge>
    </Link>
  )
}
