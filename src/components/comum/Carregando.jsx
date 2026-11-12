import { cn } from '@/lib/utils'

// Carregamento em forma de gráfico: barras que sobem e descem em onda.
const BARRAS = [0.55, 0.85, 0.4, 1, 0.7]

export function GraficoCarregando({ texto = 'Carregando…', grande = false, className }) {
  return (
    <div role="status" className={cn('flex flex-col items-center gap-3', className)}>
      <div aria-hidden="true"
        className={cn('flex items-end gap-1.5 border-b-2 border-primary/15 px-1', grande ? 'h-16' : 'h-10')}>
        {BARRAS.map((altura, i) => (
          <span key={i} data-barra=""
            className={cn('origin-bottom animate-barra rounded-t-[3px] bg-primary', grande ? 'w-3.5' : 'w-2.5')}
            style={{ height: `${altura * 100}%`, animationDelay: `${i * 0.12}s`, opacity: 0.45 + altura * 0.55 }} />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{texto}</span>
    </div>
  )
}

// Tela inteira (enquanto a sessão carrega).
export default function Carregando() {
  return (
    <div className="grid min-h-dvh place-items-center bg-moldura">
      <GraficoCarregando grande />
    </div>
  )
}
