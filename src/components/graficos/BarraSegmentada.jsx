import { cn } from '@/lib/utils'
import { corDe } from './cores'

// Barra fina de partes (faixa "Hoje" do cliente: quadro atrasados × no prazo; check-list feitas × atrasadas × a fazer),
// na ordem dada, cada parte do tamanho do seu valor e 2 px entre elas. Parte zero não desenha; tudo zero, só a trilha.
// partes: [{ valor, tom (nome de COR: as cores de estado de todo gráfico, 'feita' verde e 'atrasada' vermelha) }].
export default function BarraSegmentada({ partes }) {
  const visiveis = partes.filter((p) => p.valor > 0)
  return (
    <div aria-hidden="true" className={cn('mt-0.5 flex h-2 gap-0.5 overflow-hidden rounded-full', !visiveis.length && 'bg-grafico-trilha')}>
      {visiveis.map((p, i) => <span key={i} data-parte={p.tom} className="min-w-0 basis-0" style={{ flexGrow: p.valor, background: corDe(p.tom) }} />)}
    </div>
  )
}
