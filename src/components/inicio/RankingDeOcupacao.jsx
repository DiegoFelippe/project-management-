import { Link } from 'react-router'
import { formatarHoras, formatarOcupacao } from '@/lib/horas'

// Do mais ocupado ao menos (a ordem vem do banco). Barra cheia = 100%; acima disso a barra segue cheia e fica vermelha.
export default function RankingDeOcupacao({ recorte, passado, ranking }) {
  const porConsultoria = recorte === 'tudo'
  const titulo = porConsultoria ? 'Ocupação por consultoria' : 'Ocupação por consultor'
  const destino = porConsultoria ? '/consultorias' : '/usuarios'
  const rotulo = passado ? 'utilização' : 'ocupação'
  return (
    <section aria-label={titulo} className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{titulo}</h2>
        <Link to={porConsultoria ? '/consultorias?aba=ocupacao' : destino} className="text-xs font-medium text-primary hover:underline">{porConsultoria ? 'Ver todas' : 'Ver todos'}</Link>
      </div>
      {ranking.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{porConsultoria ? 'Nenhuma consultoria com capacidade neste mês.' : 'Nenhum consultor com capacidade neste mês.'}</p>
      ) : (
        <ul className="grid gap-3">
          {ranking.map((r) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <Link to={destino} className="min-w-0 truncate font-medium hover:underline">{r.nome}</Link>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatarOcupacao(r.ocupacao)} <span className="text-xs">de {formatarHoras(r.capacidade)}</span>
                </span>
              </div>
              <div role="img" aria-label={`${r.nome}: ${formatarOcupacao(r.ocupacao)} de ${rotulo}`} className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${r.ocupacao > 1 ? 'bg-destructive' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, (r.ocupacao ?? 0) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
