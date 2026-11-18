import { CalendarDays, Folder, Plus, Video } from 'lucide-react'
import Avatar from '@/components/comum/Avatar'
import { Button } from '@/components/ui/button'
import { diaEMes, horarioNoDia, nomeDoDia } from '@/lib/calendario'
import { cn } from '@/lib/utils'
import { BolinhaDaCor } from './ChipDoEvento'
import { VISUAL_DO_TIPO, corDoChip, tipoDoItem } from './cores'

// "Detalhe do dia" (o dia clicado), como no Hub: feriado, quem está ausente e os eventos com o horário, no visual do
// tipo e com a bolinha da cor escolhida, como os chips (auditoria, M2). Clicar num evento abre a janela dele; o "+" cria
// um evento naquele dia. `ref`: a seção (o calendário rola até ela quando o detalhe fica embaixo; auditoria, M3).
export default function DetalheDoDia({ ref, dia, itens, deVariasPessoas, aoCriar, aoAbrir }) {
  return (
    <section ref={ref} aria-label="Detalhe do dia" className="card flex h-full min-w-0 scroll-mt-4 flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-label flex items-center gap-1.5">
          <CalendarDays className="size-3" aria-hidden="true" />
          <span>{diaEMes(dia)}</span>
        </h2>
        {aoCriar && (
          <Button type="button" variant="ghost" size="icon" aria-label={`Novo evento em ${nomeDoDia(dia)}`} onClick={() => aoCriar(dia)}>
            <Plus />
          </Button>
        )}
      </div>
      {itens.length === 0 && <p className="text-rotulo text-muted-foreground">Nenhum evento neste dia.</p>}
      {itens.length > 0 && (
        <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1">
          {itens.map((item) => {
            if (item.tipo === 'feriado') {
              return (
                <li key={`feriado-${item.id}`} className={cn('rounded-lg px-2.5 py-1.5 text-rotulo font-medium', VISUAL_DO_TIPO.feriado.chip)}>
                  {item.nome}
                </li>
              )
            }
            if (item.tipo === 'ausencia') {
              const { pessoa, motivo } = item.ausencia
              return (
                <li key={`ausencia-${item.id}`} className="flex items-center gap-2">
                  <Avatar pessoa={{ id: pessoa?.id, nome: pessoa?.nome ?? '?', cor: pessoa?.cor }} className="size-6" />
                  <span className="min-w-0 flex-1 truncate text-rotulo font-medium">{pessoa?.nome}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-mini font-semibold', VISUAL_DO_TIPO.ausencia.chip)}>Ausente · {motivo}</span>
                </li>
              )
            }
            const { evento } = item
            return (
              <li key={`evento-${evento.id}`}>
                <button type="button" onClick={() => aoAbrir(evento)}
                  className={cn('botao-animado flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-[filter,translate,scale] outline-none hover:-translate-y-px hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-[0.97] dark:hover:brightness-125 pointer-coarse:min-h-11',
                    VISUAL_DO_TIPO[tipoDoItem(item)].chip)}>
                  <BolinhaDaCor cor={corDoChip(evento, deVariasPessoas)} />
                  {(evento.meet_link || evento.com_meet) && <Video className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />}
                  {evento.pasta_id && <Folder className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-rotulo font-medium">{evento.titulo}</span>
                    {(deVariasPessoas || evento.cliente) && (
                      <span className="block truncate text-mini font-normal">
                        {[deVariasPessoas && evento.consultor?.nome, evento.cliente?.nome].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-legenda tabular-nums">{horarioNoDia(evento, dia)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
