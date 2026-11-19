import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { corDe } from './cores'
import Dica from './Dica'
import LegendaComNumeros from './LegendaComNumeros'
import { pontoDoFoco, useDica } from './useDica'

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
// com a nota; a legenda continua com os números de verdade. Entram em cascata. Dica do grupo ("Chapecó/SC", "22 (54%)")
// no mouse e no toque (o quadradinho embaixo do ponteiro, por `data-grupo`; os outros grupos apagam) e no teclado: a
// imagem é um alvo focável só, e as setas (Home, End) andam de grupo; o leitor de tela ouve o grupo novo. Total 0: nada
// (o cartão mostra o vazio). grupos: [{ nome, n, cor (nome de COR ou valor de CSS) }].
export default function Quadradinhos(props) {
  const total = props.grupos.reduce((soma, g) => soma + (g.n > 0 ? g.n : 0), 0)
  if (!(total > 0)) return null
  return <Grade {...props} total={total} />
}

function Grade({ rotulo, grupos, total }) {
  const contem = useRef(null)
  const { dica, mostrar, esconder } = useDica(contem)
  const [ativo, setAtivo] = useState(null)
  const [anuncio, setAnuncio] = useState('')
  const ultimo = useRef(null)

  const porcento = (n) => Math.round((n / total) * 100)
  const numero = (g) => `${INTEIRO.format(g.n)} (${porcento(g.n)}%)`
  const emPorcento = total > MAXIMO
  const quantos = emPorcento ? maioresRestos(grupos.map((g) => (Math.max(0, g.n) * MAXIMO) / total), MAXIMO) : grupos.map((g) => Math.max(0, g.n))
  const doGrupo = grupos.flatMap((_, i) => Array(quantos[i]).fill(i))
  const comQuadradinhos = grupos.flatMap((_, i) => (quantos[i] > 0 ? [i] : []))
  // Os outros grupos apagam só com a dica aberta (Esc, rolar ou tocar fora tiram as duas coisas).
  const destacado = dica ? ativo : null

  const mostrarGrupo = (i, x, y) => {
    setAtivo(i)
    ultimo.current = i
    mostrar({ titulo: grupos[i].nome, linhas: [{ valor: numero(grupos[i]), cor: grupos[i].cor }] }, x, y)
  }
  const noPonteiro = (e) => {
    const quadradinho = e.target.closest?.('[data-grupo]')
    if (quadradinho) mostrarGrupo(Number(quadradinho.dataset.grupo), e.clientX, e.clientY)
  }
  // O grupo pedido pode ter sumido (ou zerado) numa releitura: volta ao primeiro com quadradinhos.
  const focarGrupo = (pedido) => {
    const i = comQuadradinhos.includes(pedido) ? pedido : comQuadradinhos[0]
    mostrarGrupo(i, ...pontoDoFoco(contem.current.querySelector(`[data-grupo="${i}"]`)))
  }
  const soltar = () => {
    setAtivo(null)
    esconder()
  }
  const tecla = (e) => {
    const atual = comQuadradinhos.indexOf(ativo ?? ultimo.current ?? comQuadradinhos[0])
    const destino = { ArrowRight: atual + 1, ArrowDown: atual + 1, ArrowLeft: atual - 1, ArrowUp: atual - 1, Home: 0, End: comQuadradinhos.length - 1 }[e.key]
    if (destino === undefined) return
    e.preventDefault()
    const i = comQuadradinhos[Math.max(0, Math.min(comQuadradinhos.length - 1, destino))]
    focarGrupo(i)
    setAnuncio(`${grupos[i].nome}: ${numero(grupos[i])}`)
  }

  return (
    <div ref={contem} className="grid min-w-0 gap-3">
      <div role="img" tabIndex={0} data-alvo-da-dica=""
        aria-label={`${rotulo}: ${grupos.map((g) => `${g.nome} ${numero(g)}`).join(', ')}. Use as setas para percorrer os grupos.`}
        className="flex flex-wrap gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        onPointerMove={noPonteiro} onPointerDown={noPonteiro}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch' && document.activeElement !== e.currentTarget) soltar()
        }}
        onFocus={() => focarGrupo(ultimo.current ?? comQuadradinhos[0])} onBlur={soltar} onKeyDown={tecla}>
        {doGrupo.map((g, i) => (
          <span key={i} data-quadradinho="" data-grupo={g} style={{ background: corDe(grupos[g].cor), '--i': i }}
            className={cn('grafico-cascata size-3.5 rounded-[4px] transition-opacity', destacado != null && destacado !== g && 'opacity-35')} />
        ))}
      </div>
      {emPorcento && <p className="text-legenda text-muted-foreground">Cada quadradinho é 1% do total ({INTEIRO.format(total)}).</p>}
      <LegendaComNumeros itens={grupos.map((g) => ({ nome: g.nome, cor: g.cor, valor: INTEIRO.format(g.n), porcento: porcento(g.n) }))} />
      <span className="sr-only" aria-live="polite">{anuncio}</span>
      <Dica estado={dica} />
    </div>
  )
}
