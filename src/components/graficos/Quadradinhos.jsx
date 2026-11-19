import { corDe } from './cores'
import LegendaComNumeros from './LegendaComNumeros'

const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const MAXIMO = 100

// Inteiros que somam `alvo`, o mais perto possível das partes (maiores restos).
function maioresRestos(partes, alvo) {
  const inteiros = partes.map(Math.floor)
  const falta = alvo - inteiros.reduce((soma, v) => soma + v, 0)
  partes.map((p, i) => [p - inteiros[i], i]).sort((a, b) => b[0] - a[0]).slice(0, falta).forEach(([, i]) => { inteiros[i] += 1 })
  return inteiros
}

// Quadradinhos (pedido do Diego, 19/11): um por item (cliente), na cor do grupo (cidade), numa imagem com o resumo; a
// legenda embaixo com o número e o %. Mais de 100 itens: 100 quadradinhos, cada um 1% (maiores restos, somando 100),
// com a nota; a legenda continua com os números de verdade. Entram em cascata. Total 0: nada (o cartão mostra o vazio).
// grupos: [{ nome, n, cor (nome de COR ou valor de CSS) }].
export default function Quadradinhos({ rotulo, grupos }) {
  const total = grupos.reduce((soma, g) => soma + (g.n > 0 ? g.n : 0), 0)
  if (!(total > 0)) return null
  const porcento = (n) => Math.round((n / total) * 100)
  const emPorcento = total > MAXIMO
  const quantos = emPorcento ? maioresRestos(grupos.map((g) => (Math.max(0, g.n) * MAXIMO) / total), MAXIMO) : grupos.map((g) => Math.max(0, g.n))
  const cores = grupos.flatMap((g, i) => Array(quantos[i]).fill(g.cor))
  return (
    <div className="grid min-w-0 gap-3">
      <div role="img" aria-label={`${rotulo}: ${grupos.map((g) => `${g.nome} ${INTEIRO.format(g.n)} (${porcento(g.n)}%)`).join(', ')}`}
        className="flex flex-wrap gap-1">
        {cores.map((cor, i) => <span key={i} data-quadradinho="" className="grafico-cascata size-3.5 rounded-[4px]" style={{ background: corDe(cor), '--i': i }} />)}
      </div>
      {emPorcento && <p className="text-legenda text-muted-foreground">Cada quadradinho é 1% do total ({INTEIRO.format(total)}).</p>}
      <LegendaComNumeros itens={grupos.map((g) => ({ nome: g.nome, cor: g.cor, valor: INTEIRO.format(g.n), porcento: porcento(g.n) }))} />
    </div>
  )
}
