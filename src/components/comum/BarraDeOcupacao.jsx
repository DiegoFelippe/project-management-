import { cn } from '@/lib/utils'

// Barra da ocupação (0 a 1; acima de 1 a barra segue cheia e fica vermelha). Só desenho: o número fica escrito ao lado,
// por quem usa. Sem ocupação conhecida (null, sem capacidade), a barra fica vazia.
export default function BarraDeOcupacao({ ocupacao, className }) {
  const n = Number(ocupacao)
  const conhecida = ocupacao !== null && ocupacao !== undefined && !Number.isNaN(n)
  const largura = conhecida ? Math.max(0, Math.min(n, 1)) * 100 : 0
  return (
    <div aria-hidden="true" className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full', conhecida && n > 1 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${largura}%` }} />
    </div>
  )
}
