import { useRef, useState } from 'react'
import { TAMANHO } from '@/lib/tipografia'
import { cn } from '@/lib/utils'
import { corDe } from './cores'
import Dica from './Dica'
import { formatarValor, margemDoEixo, passoDosRotulos } from './escala'
import { useDica } from './useDica'
import { useLargura } from './useLargura'

const preso = (v, maximo) => Math.max(0, Math.min(maximo, v))
const NIVEIS = [0.18, 0.45, 0.72, 1]

// Mapa de calor (pedido do Diego, 19/11): linhas × colunas (dia da semana × hora; dias × semanas), a força do valor numa
// cor só (`cor`: nome de COR ou valor de CSS); zero fica no fundo afundado. SVG na largura real; as células encolhem
// (até 53 semanas cabem a 360 px) e os rótulos do eixo X (`rotulosX`: '' pula) ficam a 44 px uns dos outros. Um alvo
// focável só: o mouse acha a célula embaixo dele e as setas ← → ↑ ↓ (Home e End: começo e fim da linha) andam de célula,
// com o contorno e a dica ("seg, 10h: 12 check-ins"); o leitor de tela ouve a célula nova. As células entram em cascata.
// valores[linha][coluna]; sem linhas ou colunas, nada.
export default function MapaDeCalor(props) {
  if (!props.linhas?.length || !props.colunas?.length) return null
  return <Mapa {...props} />
}

function Mapa({ rotulo, linhas, colunas, valores, cor, unidade = '', rotulosX = colunas }) {
  const contem = useRef(null)
  const svg = useRef(null)
  const largura = useLargura(contem)
  const { dica, mostrar, esconder } = useDica(contem)
  const [celula, setCelula] = useState(null)
  const [anuncio, setAnuncio] = useState('')
  const ultima = useRef([0, 0])

  const k = linhas.length
  const n = colunas.length
  const m = { l: margemDoEixo(linhas), r: 4, b: 22 }
  const util = Math.max(n, largura - m.l - m.r)
  const vao = Math.min(3, Math.max(1, (util / n) * 0.15))
  const larguraDaCelula = Math.max(1, (util - vao * (n - 1)) / n)
  const alturaDaCelula = Math.min(24, Math.max(14, larguraDaCelula))
  const alturaDaGrade = k * alturaDaCelula + (k - 1) * vao
  const altura = alturaDaGrade + m.b
  const x = (j) => m.l + j * (larguraDaCelula + vao)
  const y = (i) => i * (alturaDaCelula + vao)
  const valorDe = (i, j) => valores[i]?.[j] ?? 0
  const maior = Math.max(0, ...valores.flat())
  const conteudoDe = (i, j) => ({ titulo: `${linhas[i]}, ${colunas[j]}`, linhas: [{ valor: formatarValor(valorDe(i, j), unidade) }] })
  const passo = passoDosRotulos(n, util)
  // O contorno só aparece com a dica aberta: Esc, rolar ou tocar fora fecham os dois (o foco fica no alvo).
  const cursor = dica ? celula : null

  const irPara = (i, j, ponteiro = null) => {
    const destino = [preso(i, k - 1), preso(j, n - 1)]
    setCelula(destino)
    ultima.current = destino
    const caixa = svg.current.getBoundingClientRect()
    const [a, b] = destino
    if (ponteiro) mostrar(conteudoDe(a, b), ponteiro.x, ponteiro.y)
    else mostrar(conteudoDe(a, b), caixa.left + x(b) + larguraDaCelula / 2, caixa.top + y(a) + alturaDaCelula / 2)
    return destino
  }
  const naPosicao = (e) => {
    const caixa = svg.current.getBoundingClientRect()
    irPara(Math.floor((e.clientY - caixa.top) / (alturaDaCelula + vao)), Math.floor((e.clientX - caixa.left - m.l) / (larguraDaCelula + vao)),
      { x: e.clientX, y: e.clientY })
  }
  const soltar = () => {
    setCelula(null)
    esconder()
  }
  const tecla = (e) => {
    const [i, j] = celula ?? ultima.current
    const destino = { ArrowRight: [i, j + 1], ArrowLeft: [i, j - 1], ArrowDown: [i + 1, j], ArrowUp: [i - 1, j], Home: [i, 0], End: [i, n - 1] }[e.key]
    if (!destino) return
    e.preventDefault()
    const { titulo, linhas: [linha] } = conteudoDe(...irPara(...destino))
    setAnuncio(`${titulo}: ${linha.valor}`)
  }

  return (
    <div ref={contem} className="relative min-w-0">
      <svg ref={svg} width={largura} height={altura} role="group" aria-label={rotulo} className="block overflow-visible">
        {linhas.map((nome, i) => (
          <text key={i} data-rotulo-y="" x={m.l - 8} y={y(i) + alturaDaCelula / 2 + 4} textAnchor="end" fontSize={TAMANHO.legenda}
            className="pointer-events-none fill-muted-foreground">{nome}</text>
        ))}
        {linhas.map((_, i) => colunas.map((__, j) => {
          const v = valorDe(i, j)
          const cheia = v > 0 && maior > 0
          return (
            <rect key={`${i}-${j}`} data-celula={`${i}-${j}`} x={x(j)} y={y(i)} width={larguraDaCelula} height={alturaDaCelula}
              rx={Math.min(4, larguraDaCelula / 3)} fillOpacity={cheia ? Number((0.18 + (0.82 * v) / maior).toFixed(2)) : undefined}
              style={{ fill: cheia ? corDe(cor) : undefined, '--i': i + j }} className={cn('grafico-cascata pointer-events-none', !cheia && 'fill-muted')} />
          )
        }))}
        {colunas.map((_, j) => (rotulosX[j] && (n - 1 - j) % passo === 0 ? (
          <text key={j} data-rotulo-x="" x={x(j) + larguraDaCelula / 2} y={altura - 6} textAnchor="middle" fontSize={TAMANHO.legenda}
            className="pointer-events-none fill-muted-foreground tabular-nums">{rotulosX[j]}</text>
        ) : null))}
        <rect data-cursor="" x={cursor ? x(cursor[1]) - 1 : 0} y={cursor ? y(cursor[0]) - 1 : 0} width={larguraDaCelula + 2} height={alturaDaCelula + 2}
          rx={Math.min(5, larguraDaCelula / 3 + 1)} fill="none" strokeWidth="2" visibility={cursor ? 'visible' : 'hidden'}
          className="pointer-events-none stroke-foreground" />
        <rect role="img" tabIndex={0} aria-label={`${rotulo}. Use as setas para percorrer as células.`} data-alvo-da-dica=""
          x={m.l} y={0} width={util} height={alturaDaGrade}
          className="cursor-crosshair fill-transparent outline-none focus-visible:stroke-ring focus-visible:stroke-2"
          onPointerMove={naPosicao} onPointerDown={naPosicao}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'touch' && document.activeElement !== e.currentTarget) soltar()
          }}
          onFocus={() => irPara(...ultima.current)} onBlur={soltar} onKeyDown={tecla} />
      </svg>
      <div aria-hidden="true" className="mt-2 flex items-center gap-1 text-legenda text-muted-foreground">
        <span className="mr-0.5">Menos</span>
        {NIVEIS.map((nivel) => <i key={nivel} className="size-2.5 rounded-[3px]" style={{ background: corDe(cor), opacity: nivel }} />)}
        <span className="ml-0.5">Mais</span>
      </div>
      <span className="sr-only" aria-live="polite">{anuncio}</span>
      <Dica estado={dica} />
    </div>
  )
}
