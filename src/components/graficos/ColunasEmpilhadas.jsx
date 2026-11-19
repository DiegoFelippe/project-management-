import { useRef } from 'react'
import { TAMANHO } from '@/lib/tipografia'
import { cn } from '@/lib/utils'
import { corDe } from './cores'
import Dica from './Dica'
import EixoY from './EixoY'
import { caminhoDaColuna, escalaBonita, formatarEixo, formatarValor, margemDoEixo, passoDosRotulos } from './escala'
import { alvoDaDica, useDica } from './useDica'
import { useLargura } from './useLargura'

// Colunas empilhadas (pedido do Diego, 19/11): uma coluna por categoria (semanas) com as séries (consultores, consultorias;
// a cor de cada uma, da paleta) de baixo para cima na ordem dada; a de cima com a ponta arredondada. SVG na largura real,
// eixo Y com números redondos, rótulos do eixo X a 44 px (`destaque`: o índice da categoria em evidência, a semana
// atual). Cada coluna é focável, com a dica (cada série com a cor e o total) no mouse, no toque e no foco, e cresce em
// onda (.grafico-onda). Tudo zero: nada (o cartão mostra o vazio). series: [{ nome, cor, valores: número[] }].
export default function ColunasEmpilhadas(props) {
  const totais = props.categorias.map((_, c) => props.series.reduce((soma, s) => soma + (s.valores[c] > 0 ? s.valores[c] : 0), 0))
  if (!(Math.max(0, ...totais) > 0)) return null
  return <Colunas {...props} totais={totais} />
}

function Colunas({ rotulo, categorias, series, destaque, altura = 210, unidade = 'h', totais }) {
  const contem = useRef(null)
  const largura = useLargura(contem)
  const { dica, mostrar, esconder } = useDica(contem)

  const { topo, marcas } = escalaBonita(Math.max(...totais) * 1.08, 4, !unidade)
  const m = { l: margemDoEixo(marcas.map((v) => formatarEixo(v, unidade))), r: 12, t: 12, b: 26 }
  const larguraUtil = Math.max(20, largura - m.l - m.r)
  const alturaUtil = altura - m.t - m.b
  const y = (v) => m.t + alturaUtil - (v / topo) * alturaUtil
  const banda = larguraUtil / categorias.length
  const larguraDaColuna = Math.min(28, Math.max(4, banda * 0.6))
  const centro = (c) => m.l + banda * (c + 0.5)
  const passo = passoDosRotulos(categorias.length, larguraUtil)
  const valor = (v) => formatarValor(v, unidade)

  return (
    <div ref={contem} className="relative min-w-0">
      <svg width={largura} height={altura} role="group" aria-label={rotulo} className="block overflow-visible">
        <EixoY marcas={marcas} y={y} esquerda={m.l} direita={largura - m.r} unidade={unidade} />
        {categorias.map((categoria, c) => {
          const daqui = series.filter((s) => s.valores[c] > 0)
          const conteudo = {
            titulo: categoria,
            linhas: [...daqui.map((s) => ({ valor: valor(s.valores[c]), rotulo: s.nome, cor: s.cor })), { valor: valor(totais[c]), rotulo: 'total' }],
          }
          const partes = daqui.map((s) => `${s.nome} ${valor(s.valores[c])}`).join(', ')
          const bases = daqui.reduce((lista, s) => [...lista, lista.at(-1) + s.valores[c]], [0])
          return (
            <g key={categoria} role="img" aria-label={`${categoria}: ${valor(totais[c])}${partes ? ` (${partes})` : ''}`} tabIndex={0}
              className="group/coluna outline-none" {...alvoDaDica(conteudo, mostrar, esconder)}>
              <rect x={centro(c) - banda / 2 + 1} y={m.t} width={Math.max(0, banda - 2)} height={alturaUtil} rx="6"
                className="fill-transparent group-hover/coluna:fill-muted/70 group-focus-visible/coluna:fill-muted/70 group-focus-visible/coluna:stroke-ring group-focus-visible/coluna:stroke-2" />
              <g className="grafico-onda pointer-events-none" style={{ '--i': c }}>
                {daqui.map((s, k) => {
                  const d = caminhoDaColuna(centro(c) - larguraDaColuna / 2, y(bases[k]), larguraDaColuna, y(bases[k]) - y(bases[k + 1]), k === daqui.length - 1 ? 4 : 0)
                  return d && (
                    <path key={k} data-segmento={s.nome} d={d} strokeWidth="1" style={{ fill: corDe(s.cor) }}
                      className="stroke-card transition-[filter] group-hover/coluna:brightness-110 group-focus-visible/coluna:brightness-110" />
                  )
                })}
              </g>
            </g>
          )
        })}
        {categorias.map((categoria, c) => ((categorias.length - 1 - c) % passo === 0 ? (
          <text key={categoria} data-rotulo-x="" x={centro(c)} y={altura - 8} textAnchor="middle" fontSize={TAMANHO.legenda}
            className={cn('pointer-events-none tabular-nums', c === destaque ? 'fill-foreground font-semibold' : 'fill-muted-foreground')}>{categoria}</text>
        ) : null))}
      </svg>
      <Dica estado={dica} />
    </div>
  )
}
