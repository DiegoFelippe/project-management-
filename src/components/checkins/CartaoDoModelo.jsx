import { CalendarCog, ListChecks, Replace, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { diaEmSP } from '@/lib/calendario'
import { formatarDia } from '@/lib/mes'
import { cn } from '@/lib/utils'

const BOTAO_PERIGO = 'hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive'

// Barra de progresso do check-list (a caixa do modelo e cada etapa da lista). Verde quando chega a 100%.
export function BarraDeProgresso({ pct, rotulo, className }) {
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      className={cn('bg-muted h-2 overflow-hidden rounded-full', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-300', pct === 100 ? 'bg-positive' : 'bg-primary')}
        style={{ width: `${pct}%` }} />
    </div>
  )
}

function Topo({ rotulo, titulo, children, fim }) {
  return (
    <div className="flex items-start gap-3">
      <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
        <ListChecks className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="section-label">{rotulo}</p>
        <h3 className="text-janela font-bold break-words">{titulo}</h3>
        {children}
      </div>
      {fim}
    </div>
  )
}

// Caixa do modelo na aba Check-ins do cliente. Com check-list: "Modelo aplicado" (nome, quem aplicou e quando, de quando
// contam os prazos, % e barra, contados no banco) e, para quem aplica, Trocar modelo, Início dos prazos e Tirar modelo.
// Sem: "Este cliente ainda não tem um modelo" e, para quem aplica, Aplicar modelo; para os outros, `semModelo` diz o
// porquê. `resumo` é o do checklist_do_cliente.
export default function CartaoDoModelo({ checklist, resumo, podeAplicar, semModelo, aoAplicar, aoMudarInicio, aoTirar }) {
  if (!checklist) {
    return (
      <section aria-label="Modelo de check-in" className="card flex min-w-0 flex-col gap-3 p-4">
        <Topo rotulo="Modelo de check-in" titulo="Este cliente ainda não tem um modelo">
          <p className="text-muted-foreground mt-1 text-rotulo">
            {podeAplicar
              ? 'Escolha um modelo para o consultor seguir como check-list. Os prazos contam a partir do início que você escolher.'
              : semModelo}
          </p>
        </Topo>
        {podeAplicar && (
          <div>
            <Button onClick={aoAplicar}><ListChecks /> Aplicar modelo</Button>
          </div>
        )}
      </section>
    )
  }

  const pct = resumo.tarefas ? Math.round((resumo.feitas / resumo.tarefas) * 100) : 0
  const quem = checklist.aplicado_por?.nome ? `Aplicado por ${checklist.aplicado_por.nome} em` : 'Aplicado em'
  return (
    <section aria-label="Modelo aplicado" className="card flex min-w-0 flex-col gap-3 p-4">
      <Topo rotulo="Modelo aplicado" titulo={checklist.modelo_nome}
        fim={<p className="text-destaque shrink-0 font-bold tabular-nums">{pct}%</p>}>
        <p className="text-muted-foreground mt-0.5 text-legenda">
          {quem} {formatarDia(diaEmSP(checklist.aplicado_em))} · prazos contam de {formatarDia(checklist.inicio)}
        </p>
      </Topo>
      <BarraDeProgresso pct={pct} rotulo="Progresso do check-list" />
      {podeAplicar && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={aoAplicar}><Replace /> Trocar modelo</Button>
          <Button variant="outline" size="sm" onClick={aoMudarInicio}><CalendarCog /> Início dos prazos</Button>
          <Button variant="outline" size="sm" onClick={aoTirar} className={BOTAO_PERIGO}><Trash2 /> Tirar modelo</Button>
        </div>
      )}
    </section>
  )
}
