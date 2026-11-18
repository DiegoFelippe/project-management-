import { CalendarDays } from 'lucide-react'
import { DIAS_DA_AGENDA, diaDaSemanaPorExtenso, horarioNoDia, nomeDoDia, textoDoItem } from '@/lib/calendario'
import { cn } from '@/lib/utils'
import { BOLINHA, corDoChip } from './cores'

const MES_E_ANO = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const mesEAno = (dia) => MES_E_ANO.format(new Date(`${dia}T12:00:00Z`))

// Agenda, como no Hub: os próximos 60 dias que têm algo, um bloco por dia (número grande, dia da semana, "Hoje") e
// uma linha por item com a bolinha da cor, o título e o horário. É a visão inicial no celular. O dia é um título, não
// um botão: a visão já lista tudo e não tem o detalhe do dia embaixo (auditoria, R5).
export default function VisaoAgenda({ dias, porDia, hoje, deVariasPessoas, aoAbrir }) {
  const comItens = dias.filter((dia) => porDia.get(dia)?.length)
  return (
    <section aria-label={`Agenda dos próximos ${DIAS_DA_AGENDA} dias`} className="grid gap-2">
      {comItens.length === 0 && (
        <div className="py-14 text-center">
          <CalendarDays className="mx-auto mb-2.5 size-7 text-muted-foreground/50" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-corpo text-muted-foreground">Nenhum evento nos próximos {DIAS_DA_AGENDA} dias</p>
        </div>
      )}
      {comItens.map((dia) => {
        const ehHoje = dia === hoje
        return (
          <div key={dia} className="overflow-hidden rounded-xl border">
            <h3 aria-label={`${diaDaSemanaPorExtenso(dia)}, ${nomeDoDia(dia)}${ehHoje ? ', hoje' : ''}`}
              className={cn('flex w-full items-center gap-3 border-b px-4 py-2.5 text-left', ehHoje ? 'bg-primary/10' : 'bg-muted/50')}>
              <span className={cn('w-8 text-center text-titulo leading-none font-bold tabular-nums', ehHoje ? 'text-primary' : 'text-foreground/80')}>
                {Number(dia.slice(8, 10))}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-rotulo font-semibold first-letter:uppercase', ehHoje ? 'text-foreground' : 'text-foreground/80')}>
                  {diaDaSemanaPorExtenso(dia)}
                  {ehHoje && <span className="ml-2 rounded-full bg-primary-cheio px-1.5 py-0.5 text-mini text-primary-foreground">Hoje</span>}
                </span>
                <span className="block text-legenda text-muted-foreground">{mesEAno(dia)}</span>
              </span>
            </h3>
            <ul className="divide-y">
              {porDia.get(dia).map((item) => {
                const linha = 'flex w-full items-center gap-3 px-4 py-2.5 text-left'
                if (item.tipo !== 'evento') {
                  return (
                    <li key={`${item.tipo}-${item.id}`} className={linha}>
                      <span className={cn('size-2 shrink-0 rounded-full', BOLINHA[item.tipo])} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-corpo text-foreground/80">{textoDoItem(item)}</span>
                      {item.tipo === 'ausencia' && <span className="shrink-0 text-legenda text-muted-foreground">{item.ausencia.motivo}</span>}
                    </li>
                  )
                }
                const { evento } = item
                const horario = horarioNoDia(evento, dia)
                return (
                  <li key={`evento-${evento.id}`}>
                    <button type="button" onClick={() => aoAbrir(evento)} aria-label={`${evento.titulo}, ${horario}`}
                      className={cn(linha, 'botao-animado transition-[background-color,translate,scale] outline-none hover:-translate-y-px hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-[0.97]')}>
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: corDoChip(evento, deVariasPessoas) }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-corpo text-foreground">{evento.titulo}</span>
                        {deVariasPessoas && evento.consultor?.nome && <span className="block truncate text-legenda text-muted-foreground">{evento.consultor.nome}</span>}
                      </span>
                      <span className="shrink-0 text-legenda text-muted-foreground tabular-nums">{horario}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
