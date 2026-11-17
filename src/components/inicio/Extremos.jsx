import { Link } from 'react-router'
import { formatarOcupacao } from '@/lib/horas'

function Lista({ titulo, itens, vazio, tom }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{titulo}</h3>
      {itens.length === 0 ? <p className="text-sm text-muted-foreground">{vazio}</p> : (
        <ul className="grid gap-2">
          {itens.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
              <Link to="/usuarios" className="min-w-0 truncate font-medium hover:underline">
                {c.nome}{c.consultoria_nome && <span className="font-normal text-muted-foreground"> · {c.consultoria_nome}</span>}
              </Link>
              <span className={`shrink-0 font-semibold tabular-nums ${tom}`}>{formatarOcupacao(c.ocupacao)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Quem passou de 100% e quem tem mais folga (até 3 de cada). Cada nome leva a Usuários, onde se age.
export default function Extremos({ extremos, passado }) {
  return (
    <section aria-label="Consultores nos extremos" className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Consultores nos extremos</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Lista titulo={passado ? 'Acima de 100% de utilização' : 'Acima de 100%'} itens={extremos.acima} vazio="Ninguém acima da capacidade." tom="text-destructive" />
        <Lista titulo="Com mais folga" itens={extremos.folga} vazio="Ninguém com folga." tom="text-primary" />
      </div>
    </section>
  )
}
