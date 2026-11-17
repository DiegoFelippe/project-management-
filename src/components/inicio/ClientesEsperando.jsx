import { Link } from 'react-router'
import { Celula, Linha, Tabela } from '@/components/comum/Tabela'
import { Badge } from '@/components/ui/badge'

const SITUACAO = { a_distribuir: 'A distribuir', sem_consultor: 'Sem consultor' }
const DIA = 86_400_000

// "hoje", "há 1 dia", "há 9 dias" (só formatação; a ordem e o corte vêm do banco).
function haQuantoTempo(iso, agora = Date.now()) {
  const dias = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / DIA))
  if (dias === 0) return 'hoje'
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

// Os que esperam há mais tempo (até 5, já ordenados pelo banco). Cada nome leva à página do cliente.
export default function ClientesEsperando({ recorte, esperando }) {
  return (
    <section aria-label="Clientes esperando há mais tempo">
      {esperando.length === 0 ? (
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Clientes esperando há mais tempo</h2>
          <p className="text-sm text-muted-foreground">Nenhum cliente esperando. Tudo distribuído.</p>
        </div>
      ) : (
        <Tabela rotulo="Clientes esperando" titulo="Clientes esperando há mais tempo" semAcoes colunas={['Cliente', 'Situação', 'Esperando']} larguraMinima={420}>
          {esperando.map((c) => (
            <Linha key={c.id}>
              <Celula>
                <Link to={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nome}</Link>
                {recorte === 'tudo' && c.consultoria_nome && <span className="block text-xs text-muted-foreground">{c.consultoria_nome}</span>}
              </Celula>
              <Celula><Badge variant="notice">{SITUACAO[c.situacao] ?? c.situacao}</Badge></Celula>
              <Celula className="tabular-nums">{haQuantoTempo(c.desde)}</Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </section>
  )
}
