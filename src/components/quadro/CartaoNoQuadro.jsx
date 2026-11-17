import { memo } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import { CalendarDays, Check, ListChecks, MessageSquare, Paperclip } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import { cn } from '@/lib/utils'
import { PRIORIDADES, seloDoPrazo, TONS_DO_PRAZO } from './cores'

const ROSTOS = 3
const contar = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

// Cartão na coluna, como no Mochi: prioridade, título, começo da descrição, até 3 rostos + "+N", selo do prazo, progresso
// do checklist e quantos comentários e anexos. Clicar (ou Enter) abre o cartão. `arrastavel`: quem mexe, sem filtro
// ligado; sem arrastar, o cartão continua um botão que abre.
function CartaoNoQuadro({ cartao, indice, concluidos, hoje, arrastavel, aoAbrir }) {
  const prioridade = PRIORIDADES[cartao.prioridade]
  const prazo = seloDoPrazo(cartao.prazo, hoje, concluidos)
  const rostos = cartao.responsaveis ?? []
  const { total = 0, feitos = 0 } = cartao.checklist ?? {}
  const comentarios = cartao.comentarios ?? 0
  const anexos = cartao.anexos ?? 0
  const abrir = () => aoAbrir(cartao.id)

  return (
    <Draggable draggableId={cartao.id} index={indice} isDragDisabled={!arrastavel}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} role="button" tabIndex={0} {...provided.dragHandleProps}
          aria-label={`Cartão ${cartao.titulo}`} onClick={abrir}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === ' ' && !arrastavel)) {
              e.preventDefault()
              abrir()
            }
          }}
          className={cn(
            'card flex flex-col gap-2 rounded-xl p-3 text-left outline-none transition-[box-shadow,translate,border-color] duration-200 focus-visible:ring-2 focus-visible:ring-primary/50',
            arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
            snapshot.isDragging ? 'rotate-[1.5deg] border-primary/40 shadow-lg ring-2 ring-primary/20' : 'hover:-translate-y-px hover:border-primary/30 hover:shadow-md',
          )}>
          {prioridade && (
            <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-legenda font-semibold', prioridade.selo)}>
              <span className={cn('size-1.5 rounded-full', prioridade.ponto)} aria-hidden="true" />{prioridade.rotulo}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-corpo font-semibold break-words text-foreground">{cartao.titulo}</p>
            {cartao.resumo && <p className="mt-0.5 line-clamp-2 text-rotulo text-muted-foreground">{cartao.resumo}</p>}
          </div>
          {(rostos.length > 0 || prazo) && (
            <div className="flex items-center justify-between gap-2">
              {rostos.length > 0 ? (
                <div className="flex items-center -space-x-1.5">
                  {rostos.slice(0, ROSTOS).map((p) => <Avatar key={p.id} pessoa={p} className="size-6" />)}
                  {rostos.length > ROSTOS && (
                    <span title={`Mais ${contar(rostos.length - ROSTOS, 'responsável', 'responsáveis')}`}
                      className="grid size-6 place-items-center rounded-full bg-muted text-mini font-bold text-muted-foreground ring-2 ring-card">
                      +{rostos.length - ROSTOS}
                    </span>
                  )}
                </div>
              ) : <span />}
              {prazo && (
                <span title={prazo.titulo} className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-legenda font-semibold tabular-nums', TONS_DO_PRAZO[prazo.tom])}>
                  <CalendarDays className="size-3" aria-hidden="true" />
                  {prazo.texto}
                  {prazo.concluido && <Check className="size-3 text-positive" aria-hidden="true" />}
                </span>
              )}
            </div>
          )}
          {(total > 0 || comentarios > 0 || anexos > 0) && (
            <div className="flex items-center gap-3 border-t pt-2 text-legenda text-muted-foreground">
              {total > 0 && (
                <span title={`Checklist: ${feitos} de ${total} feitos`} className="flex min-w-0 flex-1 items-center gap-1.5 tabular-nums">
                  <ListChecks className="size-3.5 shrink-0" aria-hidden="true" />
                  {feitos}/{total}
                  <span className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className={cn('block h-full rounded-full', feitos === total ? 'bg-positive' : 'bg-primary')}
                      style={{ width: `${Math.round((feitos / total) * 100)}%` }} />
                  </span>
                </span>
              )}
              {comentarios > 0 && (
                <span title={contar(comentarios, 'comentário', 'comentários')} className="ml-auto inline-flex items-center gap-1 tabular-nums">
                  <MessageSquare className="size-3.5" aria-hidden="true" />{comentarios}
                </span>
              )}
              {anexos > 0 && (
                <span title={contar(anexos, 'anexo', 'anexos')} className={cn('inline-flex items-center gap-1 tabular-nums', !comentarios && 'ml-auto')}>
                  <Paperclip className="size-3.5" aria-hidden="true" />{anexos}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  )
}

export default memo(CartaoNoQuadro)
