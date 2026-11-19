import { useRef } from 'react'
import { corDe } from './cores'
import Dica from './Dica'
import LegendaComNumeros from './LegendaComNumeros'
import { alvoDaDica, useDica } from './useDica'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

// Faixa de grupos (pedido do Diego, 19/11): uma faixa só (fila de clientes, cartões por coluna do quadro), cada parte do
// tamanho do número e na cor do grupo, 2 px entre elas, crescendo da esquerda uma depois da outra; a legenda embaixo com
// o número de cada grupo (o zero também, que não desenha). Cada parte é focável (aria-label "Nome: N (P%)") e mostra a
// dica no mouse, no toque e no foco. Total 0: nada (o cartão mostra o vazio).
// grupos: [{ nome, n, cor (nome de COR ou valor de CSS) }].
export default function FaixaDeGrupos(props) {
  const total = props.grupos.reduce((soma, g) => soma + (g.n > 0 ? g.n : 0), 0)
  if (!(total > 0)) return null
  return <Faixa {...props} total={total} />
}

function Faixa({ rotulo, grupos, total }) {
  const contem = useRef(null)
  const { dica, mostrar, esconder } = useDica(contem)
  const visiveis = grupos.flatMap((g, chave) => (g.n > 0 ? [{ ...g, chave }] : []))
  return (
    <div ref={contem} className="grid min-w-0 gap-3">
      <div role="group" aria-label={rotulo} className="flex h-3.5 gap-0.5">
        {visiveis.map((g, i) => {
          const numero = `${INTEIRO.format(g.n)} (${Math.round((g.n / total) * 100)}%)`
          return (
            <span key={g.chave} role="img" aria-label={`${g.nome}: ${numero}`} tabIndex={0} data-parte=""
              style={{ flexGrow: g.n, background: corDe(g.cor), '--i': i }}
              className="grafico-onda-deitada min-w-1 basis-0 outline-none transition-[filter] first:rounded-l-full last:rounded-r-full hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              {...alvoDaDica({ titulo: g.nome, linhas: [{ valor: numero, cor: g.cor }] }, mostrar, esconder)} />
          )
        })}
      </div>
      <LegendaComNumeros itens={grupos.map((g) => ({ nome: g.nome, cor: g.cor, valor: INTEIRO.format(g.n) }))} />
      <Dica estado={dica} />
    </div>
  )
}
