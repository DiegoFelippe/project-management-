// Enfeite do lado esquerdo da tela de entrar: a consultoria no centro de uma rede (times, projetos,
// metas e empresas), com dados correndo pelas linhas, e cartões de gestão flutuando em volta.
// Só transform/opacity (leve para o processador); com "reduzir movimento" fica parado.
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Número que conta de 0 até o valor (com "reduzir movimento", já mostra o valor final).
function Contador({ ate, prefixo = '', sufixo = '', atraso = 0, duracao = 1400 }) {
  const parado = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [valor, setValor] = useState(parado ? ate : 0)
  useEffect(() => {
    if (parado) return
    let quadro
    const inicio = performance.now() + atraso * 1000
    const passo = (agora) => {
      const t = Math.min(Math.max((agora - inicio) / duracao, 0), 1)
      setValor(Math.round(ate * (1 - (1 - t) ** 3)))
      if (t < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [ate, atraso, duracao, parado])
  return <>{prefixo}{valor}{sufixo}</>
}

const CENTRO = { x: 250, y: 200 }
const NOS = [
  { id: 'times', rotulo: 'Times', x: 95, y: 92, curva: 'M250 200 Q150 175 95 92' },
  { id: 'projetos', rotulo: 'Projetos', x: 405, y: 88, curva: 'M250 200 Q350 168 405 88' },
  { id: 'metas', rotulo: 'Metas', x: 90, y: 312, curva: 'M250 200 Q150 242 90 312' },
  { id: 'empresas', rotulo: 'Empresas', x: 410, y: 316, curva: 'M250 200 Q350 236 410 316' },
]

// Ícones simples desenhados em volta de (0, 0), no traço do lucide.
function Icone({ id }) {
  const traco = { fill: 'none', stroke: 'var(--primary)', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === 'times') {
    return (
      <g {...traco}>
        <circle cx="-3" cy="-4" r="3.5" />
        <path d="M-10 7c.6-4 3.5-6 7-6s6.4 2 7 6" />
        <path d="M5 -7.5a3.5 3.5 0 0 1 0 7" />
        <path d="M7 1.5c2 .7 3.2 2.5 3.4 5.5" />
      </g>
    )
  }
  if (id === 'projetos') {
    return <path {...traco} d="M-9 -6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H-7a2 2 0 0 1-2-2z" />
  }
  if (id === 'metas') {
    return (
      <g {...traco}>
        <circle r="8.5" />
        <circle r="4.5" />
        <circle r="1" fill="var(--primary)" />
      </g>
    )
  }
  return (
    <g {...traco}>
      <path d="M-8 9V-6l7-3v18M-1 9V-3l9 3v9M-11 9h22" />
      <path d="M-5 -2h1M-5 2h1M3 2h1" />
    </g>
  )
}

function Rede() {
  return (
    <svg viewBox="0 0 500 400" className="absolute inset-0 size-full overflow-visible">
      {NOS.map((no, i) => (
        <g key={no.id}>
          <path d={no.curva} fill="none" stroke="var(--primary)" strokeOpacity="0.2" strokeWidth="2"
            pathLength="1" strokeDasharray="1" style={{ animation: `desenhar 0.9s ease-out ${0.3 + i * 0.12}s both` }} />
          <path d={no.curva} fill="none" stroke="var(--primary)" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="3 9"
            strokeLinecap="round" style={{ animation: `aparecer 0.6s ease-out ${1.2 + i * 0.12}s both, fluxo 1.6s linear infinite` }} />
          <g className="motion-reduce:hidden" style={{ animation: `aparecer 0.4s ease-out ${1.4 + i * 0.2}s both` }}>
            <circle r="4" fill="var(--primary)">
              <animateMotion dur={`${2.6 + i * 0.35}s`} begin={`${1.4 + i * 0.2}s`} repeatCount="indefinite" path={no.curva} />
            </circle>
            <circle r="3" fill="#22c55e">
              <animateMotion dur={`${3.2 + i * 0.3}s`} begin={`${2 + i * 0.25}s`} repeatCount="indefinite" path={no.curva}
                keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
            </circle>
          </g>
        </g>
      ))}

      {NOS.map((no, i) => (
        <g key={no.id} data-no="" transform={`translate(${no.x} ${no.y})`}>
          <g style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `surgir 0.45s cubic-bezier(0.2, 0.8, 0.2, 1.3) ${0.7 + i * 0.12}s both` }}>
            <circle r="23" fill="var(--card)" stroke="var(--primary)" strokeOpacity="0.3" strokeWidth="1.5"
              style={{ filter: 'drop-shadow(0 6px 14px rgb(15 23 42 / 0.12))' }} />
            <Icone id={no.id} />
            <text y="40" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--muted-foreground)">{no.rotulo}</text>
          </g>
        </g>
      ))}

      <defs>
        <linearGradient id="grad-centro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      {[
        { r: 62, tempo: 16, sentido: 'normal', tracos: '2 7' },
        { r: 88, tempo: 24, sentido: 'reverse', tracos: '1 10' },
      ].map((orbita, i) => (
        <g key={orbita.r} transform={`translate(${CENTRO.x} ${CENTRO.y})`}>
          <g style={{ animation: `aparecer 0.8s ease-out ${0.5 + i * 0.2}s both` }}>
            <g style={{ animation: `girar ${orbita.tempo}s linear infinite ${orbita.sentido}` }}>
              <circle r={orbita.r} fill="none" stroke="var(--primary)" strokeOpacity="0.28" strokeWidth="1.5"
                strokeDasharray={orbita.tracos} strokeLinecap="round" />
              <circle cx={orbita.r} r="4.5" fill="var(--primary)" style={{ filter: 'drop-shadow(0 0 6px rgb(37 99 235 / 0.8))' }} />
              <circle cx={-orbita.r} r="3" fill="#22c55e" />
            </g>
          </g>
        </g>
      ))}

      <g data-no="" transform={`translate(${CENTRO.x} ${CENTRO.y})`}>
        {[0, 1.2].map((atraso) => (
          <circle key={atraso} r="38" fill="var(--primary)" className="motion-reduce:hidden"
            style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `pulso 2.4s ease-out ${1 + atraso}s infinite` }} />
        ))}
        <g style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'surgir 0.5s cubic-bezier(0.2, 0.8, 0.2, 1.3) 0.15s both' }}>
          <circle r="38" fill="url(#grad-centro)" style={{ filter: 'drop-shadow(0 12px 28px rgb(37 99 235 / 0.55))' }} />
          <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="-13" y="-6" width="26" height="18" rx="3" />
            <path d="M-5 -6v-3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3M-13 2h26" />
          </g>
        </g>
      </g>
    </svg>
  )
}

function Cartao({ className, atraso, children }) {
  return (
    <div data-cartao="" className={cn('absolute w-[37%] min-w-[150px] max-w-[190px]', className)}
      style={{ animation: `entrar3d 0.8s cubic-bezier(0.2, 0.9, 0.25, 1.15) ${atraso}s both` }}>
      <div className="rounded-xl border border-white/80 bg-card/85 p-3 shadow-[0_18px_40px_-18px_rgb(15_23_42/0.45)] ring-1 ring-primary/5 backdrop-blur-md"
        style={{ animation: `flutuar 6s ease-in-out ${atraso * 1.7}s infinite` }}>
        {children}
      </div>
    </div>
  )
}

const rotulo = 'text-[11px] font-medium text-muted-foreground'

export default function AnimacaoGestao({ className }) {
  return (
    <div data-animacao-gestao="" aria-hidden="true" className={cn('relative mx-auto aspect-[5/4] w-full max-w-[560px] select-none [perspective:900px]', className)}>
      {[
        'left-[-8%] top-[8%] size-[55%] bg-[#60a5fa]',
        'right-[-6%] top-[30%] size-[48%] bg-[#818cf8]',
        'bottom-[-6%] left-[25%] size-[50%] bg-[#22d3ee]',
      ].map((mancha, i) => (
        <span key={mancha} className={cn('absolute rounded-full opacity-25 blur-3xl motion-reduce:hidden', mancha)}
          style={{ animation: `deriva ${14 + i * 3}s ease-in-out ${i * -4}s infinite alternate` }} />
      ))}

      <svg viewBox="0 0 500 110" preserveAspectRatio="none" className="absolute inset-x-[-4%] bottom-[-4%] h-[34%] w-[108%]">
        <defs>
          <linearGradient id="grad-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 92 C60 88 90 70 140 72 S220 50 270 56 S350 30 400 34 S470 12 500 8 V110 H0 Z" fill="url(#grad-area)"
          style={{ animation: 'subir 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s both' }} />
        <path d="M0 92 C60 88 90 70 140 72 S220 50 270 56 S350 30 400 34 S470 12 500 8" fill="none" stroke="var(--primary)"
          strokeOpacity="0.6" strokeWidth="2" pathLength="1" strokeDasharray="1" vectorEffect="non-scaling-stroke"
          style={{ animation: 'desenhar 1.8s ease-out 0.4s both' }} />
      </svg>

      <Rede />

      <Cartao className="top-[1%] left-[31%]" atraso={1.3}>
        <p className={rotulo}>Projetos no prazo</p>
        <div className="mt-1.5 flex items-center gap-3">
          <svg viewBox="0 0 44 44" className="size-11 -rotate-90">
            <circle cx="22" cy="22" r="17" fill="none" stroke="var(--muted)" strokeWidth="5" />
            <circle cx="22" cy="22" r="17" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round"
              pathLength="100" strokeDasharray="100" strokeDashoffset="13"
              style={{ animation: 'anel 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) 1.6s both' }} />
          </svg>
          <div>
            <p className="text-lg leading-none font-bold tabular-nums"><Contador ate={87} sufixo="%" atraso={1.6} /></p>
            <p className="mt-1 text-[10px] font-semibold text-positive">+5 esta semana</p>
          </div>
        </div>
      </Cartao>

      <Cartao className="top-[36%] -right-[3%]" atraso={1.5}>
        <div className="flex items-center justify-between">
          <p className={rotulo}>Crescimento</p>
          <span className="rounded-full bg-positive-soft px-1.5 py-0.5 text-[10px] font-bold text-positive tabular-nums"><Contador ate={24} prefixo="+" sufixo="%" atraso={1.8} /></span>
        </div>
        <div className="mt-2 flex h-10 items-end gap-1">
          {[40, 55, 48, 70, 82, 100].map((altura, i) => (
            <span key={i} className="flex-1 origin-bottom rounded-t-[3px] bg-primary"
              style={{ height: `${altura}%`, opacity: 0.35 + i * 0.13, animation: `crescer 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) ${1.8 + i * 0.08}s both` }} />
          ))}
        </div>
      </Cartao>

      <Cartao className="top-[38%] -left-[3%]" atraso={1.7}>
        <p className={rotulo}>Sprint atual</p>
        <div className="mt-2 grid gap-1.5">
          {[
            ['Diagnóstico', 100],
            ['Plano de ação', 72],
            ['Implantação', 38],
          ].map(([nome, feito], i) => (
            <div key={nome}>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{nome}</span>
                <span className="font-semibold text-foreground">{feito}%</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full origin-left rounded-full bg-primary"
                  style={{ width: `${feito}%`, animation: `encher 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) ${2 + i * 0.15}s both` }} />
              </div>
            </div>
          ))}
        </div>
      </Cartao>

      <Cartao className="bottom-[0%] left-[31%]" atraso={1.9}>
        <div className="flex items-center justify-between">
          <p className={rotulo}>Time Implantação</p>
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
        </div>
        <div className="mt-2 flex items-center">
          {[
            ['AL', '#2563eb'],
            ['BR', '#7c3aed'],
            ['CS', '#db2777'],
            ['GG', '#0891b2'],
          ].map(([sigla, cor], i) => (
            <span key={sigla} className={cn('grid size-6 place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-card', i && '-ml-1.5')}
              style={{ backgroundColor: cor }}>
              {sigla}
            </span>
          ))}
          <span className="-ml-1.5 grid size-6 place-items-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground ring-2 ring-card">+2</span>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">6 pessoas · 2 projetos</p>
      </Cartao>
    </div>
  )
}
