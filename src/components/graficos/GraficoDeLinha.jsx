import { useRef, useState } from 'react'
import { TAMANHO } from '@/lib/tipografia'
import { cn } from '@/lib/utils'
import { corDe } from './cores'
import Dica from './Dica'
import EixoY from './EixoY'
import { escalaBonita, formatarEixo, formatarValor, margemDoEixo, passoDosRotulos } from './escala'
import { useDica } from './useDica'
import { useLargura } from './useLargura'

// Linha como <path> ("Mx,yLx,y…"), não <polyline>: o pathLength do desenho (.grafico-desenha) vale no path em todo navegador.
const caminho = (pontos) => `M${pontos.map((p) => p.join(',')).join('L')}`
const textoDaDica = (d) => `${d.titulo}: ${d.linhas.map((l) => [l.valor, l.rotulo].filter(Boolean).join(' ')).join(', ')}`

// Linha (e área clara) por posição no eixo X (semanas, dias do mês), em SVG na largura real do contêiner. Um alvo
// focável só: o mouse acha o X mais perto e as setas ← → (Home, End) andam de ponto em ponto, com a cruz e a dica
// (a do ponto em `dicas`, ou as séries do ponto); o leitor de tela ouve o ponto novo. Série `tracejada` (projeção,
// semana em andamento) começa no último ponto real da primeira série. Opcional: faixa de fundo [início, fim] (as
// semanas do período), referência horizontal (previsão) e marcas com rótulo (fim, pico; lado 'acima' | 'abaixo' |
// 'esquerda'). series: [{ pontos: (número | nulo)[], nome?, area?, tracejada?, cor? }]; `cor` (nome de COR ou valor de CSS)
// troca o azul da série no traço e na dica (ex.: a projeção em 'acima' quando passa da previsão). A linha cheia se
// desenha (.grafico-desenha); a área, a tracejada e as marcas entram depois, pela opacidade.
export default function GraficoDeLinha({
  rotulos, series, dicas, altura = 200, unidade = '', referenciaHorizontal = null, faixa = null, marcas = [], rotuloAria,
}) {
  const contem = useRef(null)
  const svg = useRef(null)
  const largura = useLargura(contem)
  const { dica, mostrar, esconder } = useDica(contem)
  const [indice, setIndice] = useState(null)
  const [anuncio, setAnuncio] = useState('')
  const ultimoVisto = useRef(null)

  const n = rotulos.length
  const horizontal = referenciaHorizontal?.valor > 0 ? referenciaHorizontal : null
  const valores = series.flatMap((s) => s.pontos.filter((v) => v != null))
  const { topo, marcas: marcasDoEixo } = escalaBonita(Math.max(1, horizontal?.valor ?? 0, ...valores) * 1.08, 4, !unidade)
  // A margem da esquerda cabe o maior rótulo do eixo Y.
  const m = { l: margemDoEixo(marcasDoEixo.map((v) => formatarEixo(v, unidade))), r: 16, t: 22, b: 26 }
  const larguraUtil = Math.max(20, largura - m.l - m.r)
  const alturaUtil = altura - m.t - m.b
  // A cruz só aparece com a dica aberta: Esc, rolar ou tocar fora fecham as duas (o foco fica no alvo).
  const cruz = dica ? indice : null
  const x = (i) => (n === 1 ? m.l + larguraUtil / 2 : m.l + (i * larguraUtil) / (n - 1))
  const y = (v) => m.t + alturaUtil - (v / topo) * alturaUtil

  // Pontos desenhados de cada série; a tracejada liga no último ponto real da primeira série não tracejada.
  const base = series.find((s) => !s.tracejada)
  const desenhos = series.map((serie) => {
    const pontos = serie.pontos.flatMap((v, i) => (v == null ? [] : [[i, v]]))
    if (serie.tracejada && base && pontos.length) {
      const [primeiro] = pontos[0]
      if (base.pontos[primeiro] == null) {
        const anterior = base.pontos.slice(0, primeiro).findLastIndex((v) => v != null)
        if (anterior >= 0) pontos.unshift([anterior, base.pontos[anterior]])
      }
    }
    return pontos.map(([i, v]) => [x(i), y(v)])
  })

  const dicaDe = (i) => dicas?.[i] ?? {
    titulo: rotulos[i],
    linhas: series.filter((s) => s.pontos[i] != null)
      .map((s) => ({ valor: formatarValor(s.pontos[i], unidade), rotulo: s.nome, cor: s.cor ?? 'serie', tracejado: s.tracejada })),
  }
  const yDoPonto = (i) => {
    const serie = series.find((s) => s.pontos[i] != null)
    return y(serie ? serie.pontos[i] : 0)
  }
  const irPara = (i, ponteiro = null) => {
    const limitado = Math.max(0, Math.min(n - 1, i))
    setIndice(limitado)
    ultimoVisto.current = limitado
    const caixa = svg.current.getBoundingClientRect()
    if (ponteiro) mostrar(dicaDe(limitado), ponteiro.x, ponteiro.y)
    else mostrar(dicaDe(limitado), caixa.left + x(limitado), caixa.top + yDoPonto(limitado))
    return limitado
  }
  const soltar = () => {
    setIndice(null)
    esconder()
  }
  const maisPerto = (clientX) => {
    const px = clientX - svg.current.getBoundingClientRect().left
    let melhor = 0
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i
    return melhor
  }
  const tecla = (e) => {
    const atual = indice ?? ultimoVisto.current ?? n - 1
    const destino = { ArrowRight: atual + 1, ArrowLeft: atual - 1, Home: 0, End: n - 1 }[e.key]
    if (destino === undefined) return
    e.preventDefault()
    const i = irPara(destino)
    setAnuncio(textoDaDica(dicaDe(i)))
  }

  const passo = passoDosRotulos(n, larguraUtil, 46)
  const meio = n > 1 ? larguraUtil / (n - 1) / 2 : 0
  const faixaDe = faixa ? Math.max(m.l, x(faixa[0]) - meio) : 0
  const faixaAte = faixa ? Math.min(largura - m.r, x(faixa[1]) + meio) : 0

  return (
    <div ref={contem} className="relative min-w-0">
      <svg ref={svg} width={largura} height={altura} role="group" aria-label={rotuloAria} className="block overflow-visible">
        {faixa && <rect data-faixa="" x={faixaDe} y={m.t} width={Math.max(0, faixaAte - faixaDe)} height={alturaUtil} rx="6" className="fill-muted" />}
        <EixoY marcas={marcasDoEixo} y={y} esquerda={m.l} direita={largura - m.r} unidade={unidade} />
        {horizontal && (
          <g className="pointer-events-none">
            <line data-referencia-horizontal="" x1={m.l} x2={largura - m.r} y1={y(horizontal.valor)} y2={y(horizontal.valor)} strokeWidth="1.5" className="stroke-grafico-ref" />
            {horizontal.rotulo && <text x={m.l + 6} y={y(horizontal.valor) - 6} fontSize={TAMANHO.legenda} className="fill-muted-foreground">{horizontal.rotulo}</text>}
          </g>
        )}
        {series.map((serie, s) => {
          const pontos = desenhos[s]
          if (!pontos.length) return null
          return (
            <g key={s} className="pointer-events-none">
              {serie.area && (
                <path data-area="" className="grafico-cascata fill-grafico-lavado"
                  d={`M${pontos[0][0]},${y(0)}L${pontos.map((p) => p.join(',')).join('L')}L${pontos.at(-1)[0]},${y(0)}Z`} />
              )}
              {/* pathLength="1" só na cheia: no tracejado ele mudaria o "5 4". A tracejada aparece quando a cheia termina. */}
              <path data-serie={s} d={caminho(pontos)} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                strokeDasharray={serie.tracejada ? '5 4' : undefined} pathLength={serie.tracejada ? undefined : 1}
                style={{ stroke: serie.cor ? corDe(serie.cor) : undefined, animationDelay: serie.tracejada ? '0.9s' : undefined }}
                className={cn('stroke-grafico-serie', serie.tracejada ? 'grafico-cascata' : 'grafico-desenha')} />
            </g>
          )
        })}
        {marcas.map((marca) => {
          const valor = series[marca.serie]?.pontos[marca.i]
          if (valor == null) return null
          const lado = marca.lado ?? 'acima'
          const ancora = lado !== 'acima' ? 'end' : marca.i > n * 0.8 ? 'end' : marca.i < n * 0.2 ? 'start' : 'middle'
          const tx = lado !== 'acima' ? x(marca.i) - 8 : x(marca.i) + (ancora === 'end' ? 4 : ancora === 'start' ? -4 : 0)
          const ty = lado === 'abaixo' ? Math.min(y(valor) + 18, m.t + alturaUtil - 4) : y(valor) - 10
          return (
            <g key={`${marca.serie}-${marca.i}`} data-marca="" className="grafico-cascata pointer-events-none" style={{ animationDelay: '0.9s' }}>
              {/* O ponto na cor da série dele (a projeção vermelha termina num ponto vermelho). */}
              <circle cx={x(marca.i)} cy={y(valor)} r="4" strokeWidth="2" className="fill-grafico-serie stroke-card"
                style={series[marca.serie].cor ? { fill: corDe(series[marca.serie].cor) } : undefined} />
              <text x={tx} y={ty} textAnchor={ancora} fontSize={TAMANHO.legenda} className="fill-foreground font-semibold tabular-nums">{marca.texto}</text>
            </g>
          )
        })}
        {rotulos.map((rotulo, i) => ((n - 1 - i) % passo === 0 && (i === n - 1 || x(n - 1) - x(i) >= 52) ? (
          <text key={i} data-rotulo-x="" x={x(i)} y={altura - 8} fontSize={TAMANHO.legenda}
            textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
            className="pointer-events-none fill-muted-foreground tabular-nums">{rotulo}</text>
        ) : null))}
        <line data-cruz="" x1={cruz == null ? 0 : x(cruz)} x2={cruz == null ? 0 : x(cruz)} y1={m.t} y2={m.t + alturaUtil}
          strokeWidth="1" shapeRendering="crispEdges" visibility={cruz == null ? 'hidden' : 'visible'} className="pointer-events-none stroke-grafico-ref" />
        <circle cx={cruz == null ? 0 : x(cruz)} cy={cruz == null ? 0 : yDoPonto(cruz)} r="4" strokeWidth="2"
          visibility={cruz == null ? 'hidden' : 'visible'} className="pointer-events-none fill-grafico-serie stroke-card" />
        <rect role="img" tabIndex={0} aria-label={`${rotuloAria}. Use as setas ← → para percorrer os pontos.`} data-alvo-da-dica=""
          x={m.l - 6} y={m.t} width={larguraUtil + 12} height={alturaUtil}
          className="cursor-crosshair fill-transparent outline-none focus-visible:stroke-ring focus-visible:stroke-2"
          onPointerMove={(e) => irPara(maisPerto(e.clientX), { x: e.clientX, y: e.clientY })}
          onPointerDown={(e) => irPara(maisPerto(e.clientX), { x: e.clientX, y: e.clientY })}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'touch' && document.activeElement !== e.currentTarget) soltar()
          }}
          onFocus={() => irPara(ultimoVisto.current ?? n - 1)} onBlur={soltar} onKeyDown={tecla} />
      </svg>
      <span className="sr-only" aria-live="polite">{anuncio}</span>
      <Dica estado={dica} />
    </div>
  )
}
