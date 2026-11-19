import { useRef } from 'react'
import { TAMANHO } from '@/lib/tipografia'
import { corDe } from './cores'
import Dica from './Dica'
import EixoY from './EixoY'
import { caminhoDaColuna, escalaBonita, formatarEixo, margemDoEixo, passoDosRotulos } from './escala'
import { pontoDoFoco, useDica } from './useDica'
import { useLargura } from './useLargura'

// Colunas por categoria (meses, semanas) em SVG desenhado na largura real do contêiner (sem viewBox que estica: o texto
// fica sempre em 11 px). Colunas de no máximo 24 px, ponta de 4 px; esmaecida = fora do período; rótulos do eixo X com
// 44 px entre eles (sempre o último). Opcional: a linha de referência por categoria (capacidade de cada mês, com um
// ponto por item; o último trecho tracejado e o ponto vazado quando o último item é `parcial`) ou uma referência
// horizontal (previsão), com rótulo. Cada coluna é focável (aria-label) e mostra a dica no mouse, no toque e no foco.
// As colunas crescem em onda da esquerda para a direita (.grafico-onda), só quando aparecem (chave nova).
// `cor` (nome de COR ou valor de CSS) pinta a coluna no lugar do azul da série (o mês que passou da previsão).
// itens: [{ chave, rotulo, valor, cor?, referencia?, esmaecido?, parcial?, rotuloNaColuna?, aria, dica }].
export default function GraficoDeColunas({
  itens, altura = 210, unidade = 'h', linhaDeReferencia = false, referenciaHorizontal = null, rotuloAria,
}) {
  const contem = useRef(null)
  const largura = useLargura(contem)
  const { dica, mostrar, esconder } = useDica(contem)

  const horizontal = referenciaHorizontal?.valor > 0 ? referenciaHorizontal : null
  const maior = Math.max(1, horizontal?.valor ?? 0, ...itens.map((i) => Math.max(i.valor ?? 0, linhaDeReferencia ? i.referencia ?? 0 : 0)))
  const { topo, marcas } = escalaBonita(maior * 1.08, 4, !unidade)
  // A margem da esquerda cabe o maior rótulo do eixo Y ("15 mil h" pede mais que "40 h").
  const m = { l: margemDoEixo(marcas.map((v) => formatarEixo(v, unidade))), r: 12, t: 22, b: 26 }
  const larguraUtil = Math.max(20, largura - m.l - m.r)
  const alturaUtil = altura - m.t - m.b
  const y = (v) => m.t + alturaUtil - (v / topo) * alturaUtil
  const banda = larguraUtil / Math.max(1, itens.length)
  const larguraDaColuna = Math.min(24, Math.max(4, banda * 0.56))
  const centro = (i) => m.l + banda * (i + 0.5)
  const passo = passoDosRotulos(itens.length, larguraUtil)

  const pontos = linhaDeReferencia ? itens.map((item, i) => [centro(i), y(item.referencia ?? 0)]) : []
  const parcial = linhaDeReferencia && itens.at(-1)?.parcial && pontos.length > 1
  const cheios = parcial ? pontos.slice(0, -1) : pontos
  const emTexto = (lista) => lista.map((p) => p.join(',')).join(' ')

  const sair = (e) => {
    if (e.pointerType !== 'touch') esconder()
  }

  return (
    <div ref={contem} className="relative min-w-0">
      <svg width={largura} height={altura} role="group" aria-label={rotuloAria} className="block overflow-visible">
        <EixoY marcas={marcas} y={y} esquerda={m.l} direita={largura - m.r} unidade={unidade} />
        {itens.map((item, i) => {
          const d = caminhoDaColuna(centro(i) - larguraDaColuna / 2, y(0), larguraDaColuna, y(0) - y(item.valor ?? 0))
          return (
            <g key={item.chave} role="img" aria-label={item.aria} tabIndex={0} data-alvo-da-dica="" className="group/coluna outline-none"
              onPointerMove={(e) => mostrar(item.dica, e.clientX, e.clientY)} onPointerDown={(e) => mostrar(item.dica, e.clientX, e.clientY)}
              onPointerLeave={sair} onFocus={(e) => mostrar(item.dica, ...pontoDoFoco(e.currentTarget))} onBlur={esconder}>
              <rect x={centro(i) - banda / 2 + 1} y={m.t} width={Math.max(0, banda - 2)} height={alturaUtil} rx="6"
                className="fill-transparent group-hover/coluna:fill-muted/70 group-focus-visible/coluna:fill-muted/70 group-focus-visible/coluna:stroke-ring group-focus-visible/coluna:stroke-2" />
              {d && (
                <path data-coluna="" data-largura={larguraDaColuna} d={d} fillOpacity={item.esmaecido ? 0.42 : undefined}
                  style={{ '--i': i, fill: item.cor ? corDe(item.cor) : undefined }}
                  className="grafico-onda pointer-events-none fill-grafico-serie transition-[filter] group-hover/coluna:brightness-115 group-focus-visible/coluna:brightness-115" />
              )}
            </g>
          )
        })}
        {itens.map((item, i) => ((itens.length - 1 - i) % passo === 0 ? (
          <text key={item.chave} data-rotulo-x="" x={centro(i)} y={altura - 8} textAnchor="middle" fontSize={TAMANHO.legenda}
            className="pointer-events-none fill-muted-foreground tabular-nums">{item.rotulo}</text>
        ) : null))}
        {itens.map((item, i) => (item.rotuloNaColuna ? (
          <text key={item.chave} x={centro(i)} textAnchor="middle" fontSize={TAMANHO.legenda}
            y={Math.min(y(item.valor ?? 0), linhaDeReferencia ? y(item.referencia ?? 0) - 4 : Infinity) - 8}
            className="pointer-events-none fill-foreground font-semibold tabular-nums">{item.rotuloNaColuna}</text>
        ) : null))}
        {linhaDeReferencia && pontos.length > 0 && (
          <g className="pointer-events-none">
            {cheios.length > 1 && <polyline data-referencia="" points={emTexto(cheios)} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-grafico-ref" />}
            {parcial && <polyline data-referencia-tracejada="" points={emTexto(pontos.slice(-2))} fill="none" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" className="stroke-grafico-ref" />}
            {pontos.map(([px, py], i) => {
              const vazado = parcial && i === pontos.length - 1
              return <circle key={itens[i].chave} data-ponto-referencia="" cx={px} cy={py} r="4" strokeWidth="2"
                className={vazado ? 'fill-card stroke-grafico-ref' : 'fill-grafico-ref stroke-card'} />
            })}
          </g>
        )}
        {horizontal && (
          <g className="pointer-events-none">
            <line data-referencia-horizontal="" x1={m.l} x2={largura - m.r} y1={y(horizontal.valor)} y2={y(horizontal.valor)} strokeWidth="1.5" className="stroke-grafico-ref" />
            {horizontal.rotulo && (
              <text x={largura - m.r} y={y(horizontal.valor) - 6} textAnchor="end" fontSize={TAMANHO.legenda} className="fill-muted-foreground">{horizontal.rotulo}</text>
            )}
          </g>
        )}
      </svg>
      <Dica estado={dica} />
    </div>
  )
}
