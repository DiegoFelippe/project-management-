import { cn } from '@/lib/utils'
import { corDe } from './cores'

// Amostra de cada forma: quadrado para barras e colunas, traço para linhas, traço tracejado para parcial/projeção,
// faixa (quadrado com contorno) para o fundo do período e marca (traço em pé) para a previsão nas barras.
function Amostra({ forma, cor }) {
  const valor = corDe(cor)
  if (forma === 'linha' || forma === 'tracejado') {
    return <i aria-hidden="true" className={cn('h-0 w-4 shrink-0 border-t-2', forma === 'tracejado' && 'border-dashed')} style={{ borderTopColor: valor }} />
  }
  if (forma === 'marca') return <i aria-hidden="true" className="h-3 w-0.5 shrink-0 rounded-[1px] bg-foreground" style={valor ? { background: valor } : undefined} />
  return (
    <i aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-[3px]', forma === 'faixa' && 'ring-1 ring-input ring-inset')}
      style={{ background: valor }} />
  )
}

// Legenda de um gráfico: itens [{ forma: 'quadrado' | 'linha' | 'tracejado' | 'faixa' | 'marca', cor, texto, icone? }]
// (`icone`, um ícone do lucide, quando o item é um estado: estado sempre com ícone e palavra). Texto
// maior que o cartão (nome de consultoria) corta com reticências e vai inteiro no title.
export default function Legenda({ itens }) {
  if (!itens?.length) return null
  return (
    <ul role="list" aria-label="Legenda" className="flex flex-wrap gap-x-3.5 gap-y-1 text-legenda text-muted-foreground">
      {itens.map((item, i) => (
        <li key={`${item.texto}-${i}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5">
          <Amostra forma={item.forma} cor={item.cor} />
          {item.icone && <item.icone aria-hidden="true" className="size-3.5 shrink-0" />}
          <span title={item.texto} className="truncate">{item.texto}</span>
        </li>
      ))}
    </ul>
  )
}
