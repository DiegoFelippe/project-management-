import { Ban, Check } from 'lucide-react'
import { plural } from '@/lib/nomes'
import { cn } from '@/lib/utils'

// As tarefas do check-list fechadas num check-in, em chips, na ordem que vem do banco (marcada_em, titulo, tarefa_id):
// na tabela Check-ins, na caixa Check-in ("Nesta sessão") e na janela do check-out e do Editar. A feita tem o check
// verde; a que não se aplica, o chip cinza com o ícone próprio, "(não se aplica)" no nome e o motivo no título. `total`,
// quando `tarefas` traz só as primeiras, faz o "+N" do resto. `rotulo` é o nome da lista para o leitor de tela.
// O "+N" e o "não se aplica" se leem pelo aria-label, sem texto só para o leitor de tela: dentro de uma tabela que rola
// para o lado, um sr-only faria a página rolar (a 360 px).
export default function TarefasMarcadas({ tarefas, total = tarefas.length, rotulo, className }) {
  const resto = total - tarefas.length
  return (
    <ul aria-label={rotulo} className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
      {tarefas.map((t, i) => (t.estado === 'nao_se_aplica' ? (
        <li key={t.tarefa_id ?? i} aria-label={`${t.titulo} (não se aplica)`}
          title={`Não se aplica: ${t.titulo}${t.motivo ? ` (${t.motivo})` : ''}`}
          className="bg-muted text-muted-foreground inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-legenda font-medium">
          <Ban className="size-3 shrink-0" strokeWidth={3} aria-hidden="true" />
          <span className="min-w-0 truncate">{t.titulo}</span>
        </li>
      ) : (
        <li key={t.tarefa_id ?? i} title={t.titulo}
          className="bg-positive-soft inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-2 py-0.5 text-legenda font-medium">
          <Check className="text-positive size-3 shrink-0" strokeWidth={3} aria-hidden="true" />
          <span className="min-w-0 truncate">{t.titulo}</span>
        </li>
      )))}
      {resto > 0 && (
        <li aria-label={`mais ${plural(resto, 'tarefa marcada', 'tarefas marcadas')}`} title={`Mais ${plural(resto, 'tarefa marcada', 'tarefas marcadas')}`}
          className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-legenda font-semibold tabular-nums">
          +{resto}
        </li>
      )}
    </ul>
  )
}
