import { cn } from '@/lib/utils'

const COR = { feita: 'bg-grafico-serie', atrasada: 'bg-grafico-acima', neutro: 'bg-grafico-neutro' }

// Barra fina de partes (faixa "Hoje" do cliente: quadro atrasados × no prazo; check-list feitas × atrasadas × a fazer),
// na ordem dada, cada parte do tamanho do seu valor e 2 px entre elas. Parte zero não desenha; tudo zero, só a trilha.
// partes: [{ valor, tom: 'feita' | 'atrasada' | 'neutro' }].
export default function BarraSegmentada({ partes }) {
  const visiveis = partes.filter((p) => p.valor > 0)
  return (
    <div aria-hidden="true" className={cn('mt-0.5 flex h-2 gap-0.5 overflow-hidden rounded-full', !visiveis.length && 'bg-grafico-trilha')}>
      {visiveis.map((p, i) => <span key={i} data-parte={p.tom} className={cn('min-w-0 basis-0', COR[p.tom] ?? COR.neutro)} style={{ flexGrow: p.valor }} />)}
    </div>
  )
}
