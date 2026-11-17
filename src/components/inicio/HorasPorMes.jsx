import { formatarHoras } from '@/lib/horas'

// viewBox estreito: no celular (375-390 px) o texto sai com ~11 px; no computador o gráfico não passa de max-w-xl.
const LARGURA = 360
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloCurto = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`

// Barras do realizado dos 6 meses; a previsão atual é só uma linha de referência (não há previsão de meses passados).
export default function HorasPorMes({ meses, previsao }) {
  const base = 170
  const topo = 26
  const maximo = Math.max(1, previsao ?? 0, ...meses.map((m) => m.realizado))
  const alturaDe = (v) => ((base - topo) * v) / maximo
  const faixa = (LARGURA - 16) / meses.length
  const largura = Math.min(36, faixa - 14)
  const y = base - alturaDe(previsao ?? 0)
  const descricao = meses.map((m) => `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)}`).join('; ')
  return (
    <section aria-label="Horas por mês" className="card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Horas por mês</h2>
      <p className="mb-2 text-xs text-muted-foreground">Realizado nos últimos {meses.length} meses</p>
      <svg role="img" aria-label={`Horas por mês. ${descricao}.${previsao ? ` Previsão atual: ${formatarHoras(previsao)}.` : ''}`}
        viewBox={`0 0 ${LARGURA} 192`} className="mx-auto h-auto w-full max-w-xl">
        <line x1="8" x2={LARGURA - 8} y1={base} y2={base} stroke="var(--input)" />
        {previsao > 0 && (
          <g>
            <line x1="8" x2={LARGURA - 8} y1={y} y2={y} stroke="var(--notice)" strokeDasharray="5 4" />
            <text x={LARGURA - 8} y={y - 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--notice)' }}>previsão atual</text>
          </g>
        )}
        {meses.map((m, i) => {
          const x = 8 + i * faixa + (faixa - largura) / 2
          const h = alturaDe(m.realizado)
          return (
            <g key={m.mes}>
              {m.realizado > 0 && <rect x={x} y={base - h} width={largura} height={h} rx="4" fill="var(--primary)" fillOpacity={i === meses.length - 1 ? 1 : 0.6} />}
              <text x={x + largura / 2} y={base - h - 5} textAnchor="middle" fontSize="11" style={{ fill: 'var(--foreground)' }}>{formatarHoras(m.realizado)}</text>
              <text x={x + largura / 2} y={base + 16} textAnchor="middle" fontSize="11" style={{ fill: 'var(--muted-foreground)' }}>{rotuloCurto(m.mes)}</text>
            </g>
          )
        })}
      </svg>
    </section>
  )
}
