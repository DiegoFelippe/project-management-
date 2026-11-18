import { cn } from '@/lib/utils'

const porcento = (fracao, de = 0, ate = 100) => `${Math.round(Math.max(de, Math.min(ate, fracao * 100)) * 1000) / 1000}%`

// Medidor da previsão do mês (faixa "Hoje" do cliente): a parte feita (vermelha acima da previsão, sem passar da
// trilha) e a marca "hoje" (quanto do mês já passou), com o rótulo embaixo sem encostar nas bordas.
export default function Medidor({ fracao, hoje, acima = false }) {
  return (
    <div aria-hidden="true">
      <div className="relative mt-0.5 h-2 rounded-full bg-grafico-trilha">
        {fracao > 0 && (
          <span data-preenchido="" className={cn('absolute inset-y-0 left-0 rounded-full', acima ? 'bg-grafico-acima' : 'bg-grafico-serie')}
            style={{ width: porcento(fracao) }} />
        )}
        {hoje != null && <span data-hoje="" className="absolute inset-y-[-4px] w-0.5 -ml-px rounded-[1px] bg-foreground" style={{ left: porcento(hoje) }} />}
      </div>
      {hoje != null && (
        <div className="relative h-4">
          <span className="absolute -translate-x-1/2 text-legenda whitespace-nowrap text-muted-foreground" style={{ left: porcento(hoje, 12, 88) }}>hoje</span>
        </div>
      )}
    </div>
  )
}
