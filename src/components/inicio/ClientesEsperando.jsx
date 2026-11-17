import { Link } from 'react-router'
import { Celula, Linha, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'

const SITUACAO = { a_distribuir: 'A distribuir', sem_consultor: 'Sem consultor' }
const data = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

// Os que esperam há mais tempo (até 5, já ordenados pelo banco). Cada nome leva à página do cliente.
export default function ClientesEsperando({ recorte, esperando }) {
  const comOrigem = recorte === 'tudo'
  return (
    <section aria-label="Clientes esperando há mais tempo" className="grid gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Clientes esperando há mais tempo</h2>
      {esperando.length === 0 ? (
        <div className="card p-4 text-sm text-muted-foreground">Nenhum cliente esperando. Tudo distribuído.</div>
      ) : (
        <Tabela rotulo="Clientes esperando" colunas={['Cliente', ...(comOrigem ? ['Situação'] : []), 'Desde']} larguraMinima={420}>
          {esperando.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <Link to={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nome}</Link>
                {c.consultoria_nome && <span className="block text-xs text-muted-foreground">{c.consultoria_nome}</span>}
              </Celula>
              {comOrigem && <Celula><Badge variant="notice">{SITUACAO[c.situacao] ?? c.situacao}</Badge></Celula>}
              <Celula className="tabular-nums">{data(c.desde)}</Celula>
              <td />
            </Linha>
          ))}
        </Tabela>
      )}
    </section>
  )
}
