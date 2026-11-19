import { corDe } from './cores'
import LegendaComNumeros from './LegendaComNumeros'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

// Faixa de grupos (pedido do Diego, 19/11): uma faixa só (fila de clientes, cartões por coluna do quadro), cada parte do
// tamanho do número e na cor do grupo, 2 px entre elas, crescendo da esquerda uma depois da outra; a legenda embaixo com
// o número de cada grupo (o zero também, que não desenha). Total 0: nada (o cartão mostra o vazio).
// grupos: [{ nome, n, cor (nome de COR ou valor de CSS) }].
export default function FaixaDeGrupos({ rotulo, grupos }) {
  const total = grupos.reduce((soma, g) => soma + (g.n > 0 ? g.n : 0), 0)
  if (!(total > 0)) return null
  const visiveis = grupos.flatMap((g, chave) => (g.n > 0 ? [{ ...g, chave }] : []))
  return (
    <div className="grid min-w-0 gap-3">
      <div role="img" aria-label={`${rotulo}: ${grupos.map((g) => `${g.nome} ${INTEIRO.format(g.n)}`).join(', ')}`}
        className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
        {visiveis.map((g, i) => (
          <span key={g.chave} data-parte="" className="grafico-onda-deitada min-w-0 basis-0" style={{ flexGrow: g.n, background: corDe(g.cor), '--i': i }} />
        ))}
      </div>
      <LegendaComNumeros itens={grupos.map((g) => ({ nome: g.nome, cor: g.cor, valor: INTEIRO.format(g.n) }))} />
    </div>
  )
}
