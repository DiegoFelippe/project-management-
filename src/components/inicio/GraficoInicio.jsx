// Enfeite da tela Início: um painel que se monta ao abrir (barras sobem uma a uma,
// a linha se desenha e os pontos aparecem). Anima uma vez só, para não gastar processador parado.
const BARRAS = [38, 56, 44, 72, 60, 88, 76, 104]
const LARGURA = 24
const ESPACO = 14
const BASE = 128

const pontos = BARRAS.map((altura, i) => ({
  x: 22 + i * (LARGURA + ESPACO) + LARGURA / 2,
  y: BASE - altura - 14,
}))
const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')

export default function GraficoInicio({ className }) {
  return (
    <svg data-grafico-inicio="" aria-hidden="true" viewBox="0 0 340 140" className={className}>
      {[32, 64, 96].map((y) => (
        <line key={y} x1="10" x2="330" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 5" />
      ))}
      <line x1="10" x2="330" y1={BASE} y2={BASE} stroke="var(--input)" />
      {BARRAS.map((altura, i) => (
        <rect key={i} data-barra="" x={22 + i * (LARGURA + ESPACO)} y={BASE - altura} width={LARGURA} height={altura} rx="5"
          fill="var(--primary)" fillOpacity={0.25 + (i / BARRAS.length) * 0.6}
          style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animation: `crescer 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) ${0.15 + i * 0.08}s both` }} />
      ))}
      <path d={linha} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        pathLength="1" strokeDasharray="1"
        style={{ animation: 'desenhar 1.1s ease-out 0.85s both' }} />
      {pontos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--card)" stroke="var(--primary)" strokeWidth="2.5"
          style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `surgir 0.35s ease-out ${0.95 + i * 0.12}s both` }} />
      ))}
    </svg>
  )
}
