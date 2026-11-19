import { useRef } from 'react'
import { TAMANHO } from '@/lib/tipografia'
import { corDe } from './cores'
import Dica from './Dica'
import LegendaComNumeros from './LegendaComNumeros'
import { alvoDaDica, useDica } from './useDica'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const LADO = 160
const C = LADO / 2
const R = 58
const ESPESSURA = 20
const VOLTA = 2 * Math.PI * R
const VAO = 2 / VOLTA // 2 px entre os arcos, em fração da volta
const MINIMO = 1 / VOLTA // a parte pequena ainda aparece (1 px)

const doisDigitos = (v) => Number(v.toFixed(2))
const ponto = (f) => `${doisDigitos(C + R * Math.sin(2 * Math.PI * f))},${doisDigitos(C - R * Math.cos(2 * Math.PI * f))}`

// Arco de `ini` a `fim` (frações da volta, 0 = no alto, sentido horário); a volta inteira vai em dois meios.
function caminhoDoArco(ini, fim) {
  if (fim - ini >= 0.9999) return `M${C},${C - R}A${R},${R} 0 1 1 ${C},${C + R}A${R},${R} 0 1 1 ${C},${C - R}`
  return `M${ponto(ini)}A${R},${R} 0 ${fim - ini > 0.5 ? 1 : 0} 1 ${ponto(fim)}`
}

// Rosca (pedido do Diego, 19/11): as partes de um todo (situações das tarefas, horas por consultor), o valor do meio
// (`centro`: { valor, rotulo }) e, ao lado, a legenda com o valor e o % de cada parte. SVG de 160 px (sem viewBox que
// estica). Cada arco com valor é focável (aria-label "Nome: valor (N%)") e mostra a dica no mouse, no toque e no foco; a
// parte zero fica só na legenda. Os arcos se desenham em sequência (.grafico-desenha). Total 0: nada (o cartão mostra o
// vazio). partes: [{ nome (único: é a chave do arco, que não se desenha de novo numa releitura), valor, cor (nome de COR
// ou valor de CSS), icone? (estado: vai na legenda) }]; `formatar` dá o texto do valor ("12 h").
export default function Rosca({ rotulo, partes, centro, formatar = INTEIRO.format }) {
  const contem = useRef(null)
  const { dica, mostrar, esconder } = useDica(contem)
  const total = partes.reduce((soma, p) => soma + (p.valor > 0 ? p.valor : 0), 0)
  if (!(total > 0)) return null

  const porcento = (valor) => Math.round((valor / total) * 100)
  const visiveis = partes.filter((p) => p.valor > 0)
  const vao = visiveis.length > 1 ? VAO : 0
  // Onde cada arco começa (frações da volta): [0, f1, f1 + f2, …].
  const limites = visiveis.reduce((lista, p) => [...lista, lista.at(-1) + p.valor / total], [0])
  const arcos = visiveis.map((p, i) => {
    const d = caminhoDoArco(limites[i], Math.max(limites[i] + MINIMO, limites[i + 1] - vao))
    const conteudo = { titulo: p.nome, linhas: [{ valor: formatar(p.valor), rotulo: `${porcento(p.valor)}%`, cor: p.cor }] }
    return (
      <g key={p.nome} role="img" aria-label={`${p.nome}: ${formatar(p.valor)} (${porcento(p.valor)}%)`} tabIndex={0}
        className="group/arco outline-none" {...alvoDaDica(conteudo, mostrar, esconder)}>
        <path d={d} fill="none" strokeWidth={ESPESSURA + 6} className="stroke-transparent group-focus-visible/arco:stroke-ring" />
        <path data-arco="" d={d} pathLength="1" fill="none" strokeWidth={ESPESSURA} style={{ stroke: corDe(p.cor), '--i': i }}
          className="grafico-desenha pointer-events-none transition-[filter] group-hover/arco:brightness-110 group-focus-visible/arco:brightness-110" />
      </g>
    )
  })

  const valorNoCentro = { x: C, y: centro?.rotulo ? C + 2 : C + 7, textAnchor: 'middle', className: 'pointer-events-none fill-foreground font-bold tabular-nums' }

  return (
    <div ref={contem} className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4">
      <svg width={LADO} height={LADO} role="group" aria-label={rotulo} className="block shrink-0 overflow-visible">
        <circle cx={C} cy={C} r={R} fill="none" strokeWidth={ESPESSURA} className="stroke-muted" />
        {arcos}
        {centro && (
          <>
            {/* O furo tem 96 px: valor comprido ("1.234,5 h") desce um passo da escala para caber. */}
            {centro.valor.length <= 7
              ? <text {...valorNoCentro} fontSize={TAMANHO.titulo}>{centro.valor}</text>
              : <text {...valorNoCentro} fontSize={TAMANHO.janela}>{centro.valor}</text>}
            {centro.rotulo && (
              <text x={C} y={C + 20} textAnchor="middle" fontSize={TAMANHO.legenda} className="pointer-events-none fill-muted-foreground">{centro.rotulo}</text>
            )}
          </>
        )}
      </svg>
      <div className="min-w-[180px] flex-1">
        <LegendaComNumeros itens={partes.map((p) => ({ nome: p.nome, cor: p.cor, icone: p.icone, valor: formatar(p.valor), porcento: porcento(p.valor) }))} />
      </div>
      <Dica estado={dica} />
    </div>
  )
}
