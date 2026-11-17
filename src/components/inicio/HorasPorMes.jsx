import { formatarHoras } from '@/lib/horas'
import { rotuloCurto } from '@/lib/mes'
const COLUNA = 60 // largura de cada mês no viewBox; as linhas de texto em HTML usam o mesmo grid de colunas.
const ALTURA = 100
// Até 6 meses cabe um rótulo e um valor por coluna mesmo a 360 px. Com mais (o período chega a 24), o valor fica só no
// título de cada barra e na descrição do gráfico, e o mês aparece a cada `passo` meses (no máximo 6 rótulos, sempre o
// último): a 360 px os rótulos ficam a ~49 px um do outro, e "jan/26" (~33 px) não encosta no vizinho.
const MESES_COM_TEXTO = 6
const passoDosRotulos = (n) => (n <= MESES_COM_TEXTO ? 1 : Math.ceil(n / MESES_COM_TEXTO))

// Barras do realizado de cada mês (6 no Mês; no período, os meses que ele toca, de 6 a 24), cada uma com o mês
// inteiro; os meses do período (`no_periodo`, do banco) ficam em destaque. A previsão atual é só uma linha de referência
// (não há previsão de meses passados) e não vem no período. O SVG guarda só as barras e a linha tracejada (estica com a
// largura); os textos são HTML, então ficam do mesmo tamanho em qualquer largura de tela.
export default function HorasPorMes({ meses, previsao, intervalo = false }) {
  const maximo = Math.max(1, previsao ?? 0, ...meses.map((m) => m.realizado))
  const alturaDe = (v) => (ALTURA * v) / maximo
  const largura = COLUNA * meses.length
  const colunas = { gridTemplateColumns: `repeat(${meses.length}, minmax(0, 1fr))` }
  const texto = (m) => `${rotuloCurto(m.mes)}: ${formatarHoras(m.realizado)}`
  const descricao = meses.map(texto).join('; ')
  const passo = passoDosRotulos(meses.length)
  const comRotulo = (i) => (meses.length - 1 - i) % passo === 0
  return (
    <section aria-label="Horas por mês" className="card min-w-0 p-4">
      <h2 className="text-subtitulo font-semibold text-muted-foreground">Horas por mês</h2>
      <p className="mb-2 text-legenda text-muted-foreground">
        {intervalo ? `Realizado de ${rotuloCurto(meses[0].mes)} a ${rotuloCurto(meses.at(-1).mes)}, mês a mês; em destaque, os meses do período`
          : `Realizado nos últimos ${meses.length} meses`}
      </p>
      <div className="mx-auto w-full max-w-xl">
        {previsao > 0 && <p className="mb-1 text-right text-legenda text-notice">previsão atual {formatarHoras(previsao)}</p>}
        <div role="img" aria-label={`Horas por mês. ${descricao}.${previsao ? ` Previsão atual: ${formatarHoras(previsao)}.` : ''}`}>
          {passo === 1 && (
            <ul className="grid text-center text-legenda tabular-nums" style={colunas}>
              {meses.map((m) => <li key={m.mes} className="text-legenda">{formatarHoras(m.realizado)}</li>)}
            </ul>
          )}
          <svg aria-hidden="true" viewBox={`0 0 ${largura} ${ALTURA}`} preserveAspectRatio="none" className="mt-1 h-32 w-full">
            <line x1="0" x2={largura} y1={ALTURA} y2={ALTURA} stroke="var(--input)" vectorEffect="non-scaling-stroke" />
            {previsao > 0 && <line x1="0" x2={largura} y1={ALTURA - alturaDe(previsao)} y2={ALTURA - alturaDe(previsao)} stroke="var(--notice)" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
            {meses.map((m, i) => m.realizado > 0 && (
              <rect key={m.mes} x={i * COLUNA + 12} y={ALTURA - alturaDe(m.realizado)} width={COLUNA - 24} height={alturaDe(m.realizado)}
                fill="var(--primary)" fillOpacity={(m.no_periodo ?? i === meses.length - 1) ? 1 : 0.6}>
                <title>{texto(m)}</title>
              </rect>
            ))}
          </svg>
          <ul className="mt-1 grid text-legenda text-muted-foreground" style={colunas}>
            {meses.map((m, i) => (
              // Centrado na coluna mesmo quando o texto é mais largo que ela (os vizinhos sem rótulo ficam vazios).
              <li key={m.mes} data-rotulo-mes className="flex justify-center whitespace-nowrap text-legenda">{comRotulo(i) ? rotuloCurto(m.mes) : ''}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
