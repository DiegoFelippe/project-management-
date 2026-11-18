import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// As tarefas do check-list marcadas num check-in, em chips, na ordem que vem do banco (marcada_em, titulo, tarefa_id):
// na tabela Check-ins, na caixa Check-in ("Nesta sessão") e na janela do check-out e do Editar. `total`, quando
// `tarefas` traz só as primeiras, faz o "+N" do resto. `rotulo` é o nome da lista para o leitor de tela.
// Sem texto só para o leitor de tela: dentro de uma tabela que rola para o lado, ele faria a página rolar (a 360 px).
export default function TarefasMarcadas({ tarefas, total = tarefas.length, rotulo, className }) {
  const resto = total - tarefas.length
  return (
    <ul aria-label={rotulo} className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
      {tarefas.map((t, i) => (
        <li key={t.tarefa_id ?? i} title={t.titulo}
          className="bg-positive-soft inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-legenda font-medium">
          <Check className="text-positive size-3 shrink-0" strokeWidth={3} aria-hidden="true" />
          <span className="min-w-0 truncate">{t.titulo}</span>
        </li>
      ))}
      {resto > 0 && (
        <li title={`Mais ${resto} ${resto === 1 ? 'tarefa' : 'tarefas'}`}
          className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-legenda font-semibold tabular-nums">
          +{resto}
        </li>
      )}
    </ul>
  )
}
