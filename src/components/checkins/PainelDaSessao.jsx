import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatarDuracao } from '@/lib/horas'
import TarefasMarcadas from './TarefasMarcadas'

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

function textoSemSessao(souConsultor, comChecklist, emOutroCliente) {
  if (!souConsultor) return 'Nenhum check-in aberto neste cliente agora.'
  if (emOutroCliente) {
    const desde = emOutroCliente.inicio ? ` desde ${HORA.format(new Date(emOutroCliente.inicio))}` : ''
    return `Você tem um check-in aberto em ${emOutroCliente.nome ?? 'outro cliente'}${desde}. Faça o check-out lá para começar aqui.`
  }
  return comChecklist
    ? 'Faça o check-in no botão lá em cima ao começar a trabalhar. O que você marcar no check-list com ele aberto entra no resumo da sessão.'
    : 'Faça o check-in no botão lá em cima ao começar a trabalhar.'
}

// Caixa "Check-in" da aba Check-ins do cliente: o check-in aberto neste cliente (o relógio, quem, desde quando e o que foi
// marcado nele, "Nesta sessão"), ou "Sem check-in aberto"; embaixo, o último check-in fechado. Só mostra: o botão de
// check-in e check-out continua no topo da página. O relógio anda a cada 30 s, como o do botão. `sessao` e `ultimo` são
// os do checklist_do_cliente; `souConsultor`: quem vê é o consultor do cliente (o texto diz onde fazer o check-in);
// `emOutroCliente` ({ nome, inicio }): o check-in aberto dele em outro cliente (o texto diz onde ele está).
export default function PainelDaSessao({ sessao, ultimo, souConsultor = false, comChecklist = false, emOutroCliente = null }) {
  const [agora, setAgora] = useState(() => Date.now())
  const aberta = Boolean(sessao)

  useEffect(() => {
    if (!aberta) return undefined
    const tique = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(tique)
  }, [aberta])

  let textoDoUltimo = 'Ainda não há check-ins neste cliente.'
  if (ultimo) {
    const inicio = new Date(ultimo.inicio)
    const duracao = formatarDuracao(new Date(ultimo.fim).getTime() - inicio.getTime())
    textoDoUltimo = `Último: ${DATA.format(inicio)}, ${duracao} (${ultimo.consultor?.nome ?? 'outro consultor'})`
  }

  return (
    <section aria-label="Check-in" className="card flex min-w-0 flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
          <Clock className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="section-label">Check-in</p>
          <h3 className="text-janela font-bold">{sessao ? 'Check-in em andamento' : 'Sessão de trabalho'}</h3>
        </div>
        {sessao ? (
          <Badge variant="positive">
            <span aria-hidden="true" className="bg-positive size-1.5 animate-pulse rounded-full" />
            Em andamento
          </Badge>
        ) : (
          <Badge variant="outline">Sem check-in aberto</Badge>
        )}
      </div>

      {sessao ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span data-relogio className="text-destaque font-bold tabular-nums">
              {formatarDuracao(agora - new Date(sessao.inicio).getTime())}
            </span>
            <span className="text-muted-foreground text-rotulo">
              {sessao.consultor?.nome ? `${sessao.consultor.nome} · ` : ''}desde {HORA.format(new Date(sessao.inicio))}
            </span>
          </p>
          {sessao.tarefas?.length ? (
            <div className="grid min-w-0 gap-1.5">
              <p className="text-muted-foreground text-legenda">Nesta sessão:</p>
              <TarefasMarcadas tarefas={sessao.tarefas} rotulo="Nesta sessão" />
            </div>
          ) : (
            <p className="text-muted-foreground text-legenda">
              Nesta sessão: nenhuma tarefa marcada ainda.{souConsultor && comChecklist ? ' Marque no check-list abaixo.' : ''}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-rotulo">{textoSemSessao(souConsultor, comChecklist, emOutroCliente)}</p>
      )}

      <p className="text-muted-foreground mt-auto text-legenda">{textoDoUltimo}</p>
    </section>
  )
}
