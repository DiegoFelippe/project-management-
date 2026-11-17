import { Link } from 'react-router'
import { formatarOcupacao } from '@/lib/horas'

function Lista({ titulo, itens, vazio, tom, comConsultoria, mes }) {
  return (
    <div>
      <h3 className="mb-2 text-rotulo font-semibold text-muted-foreground">{titulo}</h3>
      {itens.length === 0 ? <p className="text-corpo text-muted-foreground">{vazio}</p> : (
        <ul className="grid gap-2">
          {itens.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-3 text-corpo">
              {(() => {
                const nome = <>{c.nome}{comConsultoria && c.consultoria_nome && <span className="font-normal text-muted-foreground"> · {c.consultoria_nome}</span>}</>
                return c.visivel
                  ? <Link to={`/usuarios?pessoa=${c.id}&mes=${mes}`} className="min-w-0 truncate font-medium hover:underline">{nome}</Link>
                  : <span className="min-w-0 truncate font-medium">{nome}</span>
              })()}
              <span className={`shrink-0 font-semibold tabular-nums ${tom}`}>{formatarOcupacao(c.ocupacao)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Quem passou de 100% e quem tem mais folga (até 3 de cada). Cada nome visível abre a pessoa em Usuários, no mês do painel.
export default function Extremos({ recorte, extremos, passado, mes }) {
  return (
    <section aria-label="Consultores nos extremos" className="card p-4">
      <h2 className="mb-3 text-subtitulo font-semibold text-muted-foreground">Consultores nos extremos</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Lista titulo={passado ? 'Acima de 100% de utilização' : 'Acima de 100%'} itens={extremos.acima} vazio="Ninguém acima da capacidade." tom="text-destructive" comConsultoria={recorte === 'tudo'} mes={mes} />
        <Lista titulo="Com mais folga" itens={extremos.folga} vazio="Ninguém com folga." tom="text-primary" comConsultoria={recorte === 'tudo'} mes={mes} />
      </div>
    </section>
  )
}
