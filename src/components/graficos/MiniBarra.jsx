import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

const posicao = (v, maximo) => `${Math.round(Math.max(0, Math.min(100, (v / maximo) * 100)) * 1000) / 1000}%`

// Trilha curta com a marca do limite e o valor ao lado (clientes em risco: "Último check-in" com a marca de 30 dias,
// "Ritmo × previsão" com a de 120%). Acima do limite: vermelho, com ícone. `rotulo`: o nome pequeno em cima, visível
// só no celular (lá o cabeçalho das colunas some); no largo fica só para o leitor de tela.
export default function MiniBarra({ valor, limite, maximo, texto, acima = false, rotulo }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      {rotulo && <span className="text-legenda text-muted-foreground sm:sr-only">{rotulo}</span>}
      <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <span aria-hidden="true" className="relative h-1.5 rounded-full bg-grafico-trilha">
          {valor > 0 && (
            <span data-preenchido="" className={cn('absolute inset-y-0 left-0 rounded-full', acima ? 'bg-grafico-acima' : 'bg-grafico-serie')}
              style={{ width: posicao(valor, maximo) }} />
          )}
          {limite != null && <span data-limite="" className="absolute inset-y-[-3px] w-0 border-l border-foreground/55" style={{ left: posicao(limite, maximo) }} />}
        </span>
        <span className={cn('inline-flex min-w-[54px] items-center justify-end gap-1 text-rotulo whitespace-nowrap tabular-nums', acima && 'font-semibold text-destructive')}>
          {acima && <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />}
          {texto}
        </span>
      </span>
    </span>
  )
}
