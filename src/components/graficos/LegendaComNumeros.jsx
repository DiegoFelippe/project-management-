import { cn } from '@/lib/utils'
import { corDe } from './cores'

// Legenda com o número (e o %, quando vem) de cada item: a da Rosca, dos Quadradinhos e da FaixaDeGrupos. O nome corta
// com reticências e vai inteiro no title. itens: [{ nome, cor, valor (texto pronto), porcento? }].
export default function LegendaComNumeros({ itens }) {
  const comPorcento = itens.some((item) => item.porcento != null)
  return (
    <ul role="list" aria-label="Legenda" className="grid min-w-0 gap-1.5 text-rotulo">
      {itens.map((item, i) => (
        <li key={i} className={cn('grid items-center gap-2',
          comPorcento ? 'grid-cols-[10px_minmax(0,1fr)_auto_2.5rem]' : 'grid-cols-[10px_minmax(0,1fr)_auto]')}>
          <i aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: corDe(item.cor) }} />
          <span title={item.nome} className="truncate">{item.nome}</span>
          <span className="font-semibold tabular-nums">{item.valor}</span>
          {comPorcento && <span className="text-right text-muted-foreground tabular-nums">{item.porcento}%</span>}
        </li>
      ))}
    </ul>
  )
}
