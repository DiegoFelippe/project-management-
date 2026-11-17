import { formatarHoras } from '@/lib/horas'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloCurto = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`
const COLUNA = 60 // largura de cada mês no viewBox; as linhas de texto em HTML usam o mesmo grid de colunas.
const ALTURA = 100

// Barras do realizado dos 6 meses; a previsão atual é só uma linha de referência (não há previsão de meses passados).
// O SVG guarda só as barras e a linha tracejada (estica com a largura); os textos são HTML, então ficam do mesmo
// tamanho em qualquer largura de tela.
export default function HorasPorMes({ meses, previsao }) {
  const maximo = Math.max(1, previsao ?? 0, ...meses.map((m) => m.realizado))
  const alturaDe = (v) => (ALTURA * v) / maximo
  const largura = COLUNA * meses.length
  const colunas = { gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }
  const descricao = meses.map((m) => `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)}`).join('; ')
  return (
    <section aria-label="Horas por mês" className="card min-w-0 p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Horas por mês</h2>
      <p className="mb-2 text-xs text-muted-foreground">Realizado nos últimos {meses.length} meses</p>
      <div className="mx-auto w-full max-w-xl">
        {previsao > 0 && <p className="mb-1 text-right text-xs text-notice">previsão atual {formatarHoras(previsao)}</p>}
        <div role="img" aria-label={`Horas por mês. ${descricao}.${previsao ? ` Previsão atual: ${formatarHoras(previsao)}.` : ''}`}>
          <ul className="grid text-center text-xs tabular-nums" style={colunas}>
            {meses.map((m) => <li key={m.mes} className="text-xs">{formatarHoras(m.realizado)}</li>)}
          </ul>
          <svg aria-hidden="true" viewBox={`0 0 ${largura} ${ALTURA}`} preserveAspectRatio="none" className="mt-1 h-32 w-full">
            <line x1="0" x2={largura} y1={ALTURA} y2={ALTURA} stroke="var(--input)" vectorEffect="non-scaling-stroke" />
            {previsao > 0 && <line x1="0" x2={largura} y1={ALTURA - alturaDe(previsao)} y2={ALTURA - alturaDe(previsao)} stroke="var(--notice)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
            {meses.map((m, i) => m.realizado > 0 && (
              <rect key={m.mes} x={i * COLUNA + 12} y={ALTURA - alturaDe(m.realizado)} width={COLUNA - 24} height={alturaDe(m.realizado)}
                fill="var(--primary)" fillOpacity={i === meses.length - 1 ? 1 : 0.6} />
            ))}
          </svg>
          <ul className="mt-1 grid text-center text-xs text-muted-foreground" style={colunas}>
            {meses.map((m) => <li key={m.mes} className="text-xs">{rotuloCurto(m.mes)}</li>)}
          </ul>
        </div>
      </div>
    </section>
  )
}
