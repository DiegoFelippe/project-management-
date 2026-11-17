import { Link } from 'react-router'
import { Celula, Linha, Tabela } from '@/components/comum/Tabela'
import { formatarHoras } from '@/lib/horas'

// Até 5 clientes do mês. Mês passado: só o realizado (o previsto de hoje não vale para aquele mês).
export default function MeusClientes({ passado, clientes }) {
  return (
    <section aria-label="Meus clientes no mês">
      {clientes.length === 0 ? (
        <div className="card p-4">
          <h2 className="mb-2 text-subtitulo font-semibold text-muted-foreground">Meus clientes no mês</h2>
          <p className="text-corpo text-muted-foreground">Nenhum cliente seu neste mês.</p>
        </div>
      ) : (
        <Tabela rotulo="Meus clientes" titulo="Meus clientes no mês" semAcoes colunas={['Cliente', ...(passado ? [] : ['Previsto']), 'Realizado']} larguraMinima={380}>
          {clientes.map((c) => (
            <Linha key={c.id}>
              <Celula><Link to={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nome}</Link></Celula>
              {!passado && <Celula className="tabular-nums">{formatarHoras(c.previsto)}</Celula>}
              <Celula className="tabular-nums">{formatarHoras(c.realizado)}</Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </section>
  )
}
