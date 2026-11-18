import { Plus } from 'lucide-react'
import { DIAS_DA_SEMANA, diaDaSemana, nomeDoDia } from '@/lib/calendario'
import { cn } from '@/lib/utils'
import ChipDoEvento from './ChipDoEvento'

// Semana, como no Hub: 7 cartões, um por dia, com os chips e a hora ao lado e "+ adicionar" (lista por dia, sem
// grade de horas). No celular os dias ficam um embaixo do outro. O dia escolhido mostra o detalhe embaixo (e a página
// rola até ele).
export default function VisaoSemana({ dias, porDia, hoje, selecionado, deVariasPessoas, aoSelecionar, aoCriar, aoAbrir }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {dias.map((dia) => {
        const itens = porDia.get(dia) ?? []
        const ehHoje = dia === hoje
        const semana = diaDaSemana(dia)
        return (
          <section key={dia} aria-label={nomeDoDia(dia)}
            className={cn('flex min-w-0 flex-col rounded-xl border p-2.5 sm:min-h-44',
              ehHoje ? 'border-primary/25 bg-primary/5' : 'border-border/70',
              dia === selecionado && !ehHoje && 'border-primary/30 bg-accent')}>
            <button type="button" onClick={() => aoSelecionar(dia, { escolheu: true })} aria-label={`Ver o detalhe de ${nomeDoDia(dia)}`}
              className="botao-animado mb-2 flex items-baseline gap-2 rounded-lg text-left transition-[translate,scale] outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] sm:block">
              <span className={cn('block text-legenda font-semibold', semana === 0 ? 'text-domingo' : semana === 6 ? 'text-sabado' : 'text-muted-foreground')}>
                {DIAS_DA_SEMANA[semana]}
              </span>
              <span className={cn('block text-titulo leading-tight font-bold tabular-nums', ehHoje ? 'text-primary' : 'text-foreground')}>
                {Number(dia.slice(8, 10))}
              </span>
            </button>
            <div className="grid gap-1">
              {itens.map((item) => (
                <ChipDoEvento key={`${item.tipo}-${item.id}`} item={item} dia={dia} deVariasPessoas={deVariasPessoas} comHora aoAbrir={aoAbrir} />
              ))}
              {aoCriar && (
                <button type="button" onClick={() => aoCriar(dia)} aria-label={`Novo evento em ${nomeDoDia(dia)}`}
                  className="botao-animado inline-flex items-center justify-center gap-1 rounded-md py-1 text-mini text-muted-foreground transition-[color,translate,scale] outline-none hover:-translate-y-px hover:text-primary focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]">
                  <Plus className="size-3" aria-hidden="true" /> adicionar
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
