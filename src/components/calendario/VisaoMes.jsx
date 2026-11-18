import { useId } from 'react'
import { DIAS_DA_SEMANA, diaDaSemana, nomeDoDia, somarDias } from '@/lib/calendario'
import { cn } from '@/lib/utils'
import ChipDoEvento from './ChipDoEvento'
import { TIPOS } from './cores'

const CHIPS_POR_DIA = 3

// Mês, como no Hub: grade de 7 colunas começando no domingo, até 3 chips por dia e "+N", hoje em destaque, fora do mês
// apagado. Clicar seleciona o dia (o detalhe aparece embaixo), dois cliques criam evento. Setas andam entre os dias.
// No celular as células encolhem e os chips viram faixas de cor, para a grade caber em 360 px sem rolar de lado.
// `detalheAbaixo` false (a agenda do cliente, que tem a tabela dos eventos no lugar do detalhe): a dica não o promete.
export default function VisaoMes({
  dias, mes, rotulo, porDia, hoje, selecionado, deVariasPessoas, mostrar, detalheAbaixo = true, aoSelecionar, aoCriar, aoAbrir,
}) {
  const base = useId()
  const semanas = Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7))
  const focavel = dias.includes(selecionado) ? selecionado : dias.includes(hoje) ? hoje : `${mes}-01`

  function teclar(e, dia) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      aoSelecionar(dia)
      return
    }
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!passo) return
    e.preventDefault()
    const novo = somarDias(dia, passo)
    if (!dias.includes(novo)) return
    aoSelecionar(novo)
    document.getElementById(`${base}-${novo}`)?.focus()
  }

  return (
    <>
      <div role="grid" aria-label={`Calendário de ${rotulo}`} className="grid gap-0.5 sm:gap-1">
        <div role="row" className="grid grid-cols-7">
          {DIAS_DA_SEMANA.map((d, i) => (
            <div key={d} role="columnheader" className={cn('py-1.5 text-center text-legenda font-semibold tracking-wide uppercase',
              i === 0 ? 'text-rose-500' : i === 6 ? 'text-violet-500' : 'text-muted-foreground')}>
              {d}
            </div>
          ))}
        </div>
        {semanas.map((semana) => (
          <div key={semana[0]} role="row" className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {semana.map((dia) => {
              const itens = porDia.get(dia) ?? []
              const visiveis = itens.slice(0, CHIPS_POR_DIA)
              const mais = itens.length - visiveis.length
              const ehHoje = dia === hoje
              const doMes = dia.startsWith(mes)
              const semana = diaDaSemana(dia)
              const escolhido = dia === selecionado
              return (
                <div key={dia} id={`${base}-${dia}`} role="gridcell" tabIndex={dia === focavel ? 0 : -1}
                  aria-label={`${nomeDoDia(dia)}${ehHoje ? ', hoje' : ''}${itens.length ? `, ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}` : ''}`}
                  aria-selected={escolhido} aria-current={ehHoje ? 'date' : undefined}
                  onClick={() => aoSelecionar(dia)} onDoubleClick={aoCriar ? () => aoCriar(dia) : undefined} onKeyDown={(e) => teclar(e, dia)}
                  className={cn(
                    'min-h-16 min-w-0 cursor-pointer rounded-lg border p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-24 sm:rounded-xl sm:p-1.5',
                    escolhido ? 'border-primary/30 bg-accent shadow-[0_0_0_3px] shadow-primary/10'
                      : cn('border-transparent hover:border-border hover:bg-muted/60', (semana === 0 || semana === 6) && 'bg-muted/40'),
                    !doMes && 'opacity-40',
                  )}>
                  <div className="mb-1 flex items-center justify-between gap-0.5">
                    <span className={cn('grid size-6 place-items-center rounded-full text-rotulo font-semibold tabular-nums',
                      ehHoje ? 'bg-primary text-primary-foreground' : semana === 0 ? 'text-rose-500' : semana === 6 ? 'text-violet-500' : 'text-foreground/80')}>
                      {Number(dia.slice(8, 10))}
                    </span>
                    {mais > 0 && <span className="text-mini font-semibold text-muted-foreground" aria-hidden="true">+{mais}</span>}
                  </div>
                  <div className="grid gap-0.5">
                    {visiveis.map((item) => (
                      <ChipDoEvento key={`${item.tipo}-${item.id}`} item={item} dia={dia} deVariasPessoas={deVariasPessoas} compacto aoAbrir={aoAbrir} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {TIPOS.filter((t) => mostrar[t.chave]).map((t) => (
          <span key={t.chave} className="inline-flex items-center gap-1.5 text-legenda text-muted-foreground">
            <span className={cn('size-2 rounded-full', t.bolinha)} aria-hidden="true" />{t.rotulo}
          </span>
        ))}
        {detalheAbaixo ? (
          <span className="text-legenda text-muted-foreground sm:ml-auto">
            Clique num dia para ver os detalhes abaixo{aoCriar ? ' · dois cliques criam um evento' : ''}
          </span>
        ) : aoCriar && <span className="text-legenda text-muted-foreground sm:ml-auto">Dois cliques num dia criam um evento</span>}
      </div>
    </>
  )
}
