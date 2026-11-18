import { TAMANHO } from '@/lib/tipografia'
import { formatarEixo } from './escala'

// Grade horizontal (1 px, contínua, discreta) e os números redondos do eixo Y, à esquerda; a linha do zero é a base.
export default function EixoY({ marcas, y, esquerda, direita, unidade }) {
  return (
    <g className="pointer-events-none">
      {marcas.map((valor) => (
        <g key={valor}>
          <line x1={esquerda} x2={direita} y1={y(valor)} y2={y(valor)} strokeWidth="1" shapeRendering="crispEdges"
            className={valor === 0 ? 'stroke-input' : 'stroke-grafico-grade'} />
          <text x={esquerda - 8} y={y(valor) + 4} textAnchor="end" fontSize={TAMANHO.legenda} className="fill-muted-foreground tabular-nums">
            {formatarEixo(valor, unidade)}
          </text>
        </g>
      ))}
    </g>
  )
}
