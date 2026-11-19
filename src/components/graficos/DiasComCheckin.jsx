import { cn } from '@/lib/utils'

const diaMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// Os últimos 30 dias do cliente, um traço por dia (faixa "Hoje", cartão "Último check-in"): cheio no dia com check-in,
// mais fino no fim de semana; embaixo, o primeiro dia e "hoje". dias: [{ dia: 'AAAA-MM-DD', com, fimDeSemana }].
export default function DiasComCheckin({ dias, rotulos = true }) {
  const com = dias.filter((d) => d.com).length
  return (
    <div>
      <div role="img" aria-label={`Dias com check-in nos últimos ${dias.length} dias: ${com}`} className="mt-0.5 flex h-[18px] gap-0.5">
        {dias.map((d) => (
          <span key={d.dia} data-dia={d.dia} data-com={d.com ? '' : undefined} data-fim-de-semana={d.fimDeSemana ? '' : undefined}
            className={cn('min-w-0 basis-0 rounded-[2px]', d.com ? 'bg-grafico-serie' : 'bg-grafico-trilha')}
            style={{ flexGrow: d.fimDeSemana ? 0.5 : 1 }} />
        ))}
      </div>
      {rotulos && dias.length > 0 && (
        <div aria-hidden="true" className="flex justify-between text-legenda text-muted-foreground tabular-nums">
          <span>{diaMes(dias[0].dia)}</span>
          <span>hoje</span>
        </div>
      )}
    </div>
  )
}
