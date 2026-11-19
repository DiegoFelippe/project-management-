import { useRef } from 'react'
import { ArrowDown, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { corDe } from './cores'
import Dica from './Dica'
import { pontoDoFoco, useDica } from './useDica'

const COR_DO_TOM = { serie: 'bg-grafico-serie', folga: 'bg-grafico-folga' }
// As situações do check-list (cores em COR), nessa ordem; `neutro` (a fazer, sem separar) fica por último.
const ORDEM_DAS_PARTES = ['feita', 'nsa', 'andamento', 'pausada', 'afazer', 'atrasada', 'neutro']
// Nome | trilha | valor (| ação): as mesmas colunas em toda linha, para as barras começarem e acabarem juntas.
const COLUNAS = {
  sem: 'grid-cols-[minmax(84px,34%)_minmax(0,1fr)_76px] max-sm:grid-cols-[minmax(70px,32%)_minmax(0,1fr)_64px]',
  com: 'grid-cols-[minmax(84px,34%)_minmax(0,1fr)_76px_auto] max-sm:grid-cols-[minmax(70px,32%)_minmax(0,1fr)_64px_auto]',
}
const ICONES = {
  alerta: <TriangleAlert data-icone="alerta" aria-hidden="true" className="size-3.5 shrink-0 text-grafico-acima" />,
  // Ao lado das partes do check-list: o vermelho da parte atrasada (COR.atrasada), não o do trecho acima do limite.
  atrasada: <TriangleAlert data-icone="atrasada" aria-hidden="true" className="size-3.5 shrink-0 text-destructive-cheio" />,
  folga: <ArrowDown data-icone="folga" aria-hidden="true" className="size-3.5 shrink-0 text-grafico-folga" />,
}

const arredondar = (n) => Math.round(n * 1000) / 1000

// posicao(v): '%' na trilha (preso entre 0 e 100); porcento(v): o mesmo, em número. Só a barra cresce da esquerda, em
// onda pela linha `i` (.grafico-onda-deitada); as marcas e as zonas ficam paradas (a marca do valor entra no fim).
function Barra({ item, posicao, porcento, limite, marca100, zonas, i }) {
  const onda = (barra) => <span className="grafico-onda-deitada absolute inset-0" style={{ '--i': i }}>{barra}</span>
  if (item.partes) {
    const partes = ORDEM_DAS_PARTES.flatMap((tom) => item.partes.filter((p) => p.tom === tom && p.valor > 0))
    return onda(
      <span className="absolute inset-x-0 top-[5px] flex h-3 gap-0.5 overflow-hidden rounded-[4px]">
        {partes.map((p) => <span key={p.tom} data-parte={p.tom} className="min-w-0 basis-0" style={{ flexGrow: p.valor, background: corDe(p.tom) }} />)}
      </span>,
    )
  }
  const cor = item.cor ? undefined : COR_DO_TOM[item.tom] ?? COR_DO_TOM.serie
  const fundo = item.cor ? { background: corDe(item.cor) } : {}
  // Com zonas, o fundo já mostra onde passa do limite: a barra é uma só, mais fina, e a marca do valor fica em cima.
  const acima = !zonas && limite != null && item.valor > limite
  // O trecho vermelho vai do limite (+ 2 px de vão) até o valor, sem passar do fim da trilha (escalaMax menor que o
  // valor): no máximo o que sobra depois do limite. Limite fora da escala: a barra enche a trilha, sem trecho.
  const sobra = acima ? arredondar(100 - porcento(limite)) : 0
  let barra = null
  if (zonas) {
    barra = item.valor > 0 && <span data-trecho="base" className={cn('absolute top-[8px] left-0 h-1.5 rounded-full', cor)} style={{ width: posicao(item.valor), ...fundo }} />
  } else if (acima && sobra > 0) {
    barra = (
      <>
        <span data-trecho="base" className={cn('absolute top-[5px] left-0 h-3 rounded-none', cor)} style={{ width: posicao(limite), ...fundo }} />
        <span data-trecho="acima" className="absolute top-[5px] h-3 rounded-r-[4px] bg-grafico-acima"
          style={{ left: `calc(${posicao(limite)} + 2px)`, width: `min(max(2px, ${posicao(item.valor - limite)} - 2px), ${sobra}% - 2px)` }} />
      </>
    )
  } else if (acima) {
    barra = <span data-trecho="base" className={cn('absolute top-[5px] left-0 h-3 rounded-r-[4px]', cor)} style={{ width: '100%', ...fundo }} />
  } else if (item.valor > 0) {
    barra = <span data-trecho="base" className={cn('absolute top-[5px] left-0 h-3 rounded-r-[4px]', cor)} style={{ width: posicao(item.valor), ...fundo }} />
  }
  return (
    <>
      {zonas && (
        <span className="absolute inset-x-0 top-[5px] h-3 overflow-hidden rounded-[4px]">
          {zonas.map((zona, k) => {
            const de = k ? zonas[k - 1].ate : 0
            return <span key={k} data-zona="" className="absolute inset-y-0"
              style={{ left: posicao(de), width: `${arredondar(porcento(zona.ate) - porcento(de))}%`, background: corDe(zona.cor) }} />
          })}
        </span>
      )}
      {onda(barra)}
      {marca100 && <span data-marca-100="" className="absolute -top-1 -bottom-1 w-0 border-l border-foreground/45" style={{ left: posicao(marca100.valor) }} />}
      {item.marca != null && <span data-marca="" className="absolute top-px h-5 w-0.5 -ml-px rounded-[1px] bg-foreground" style={{ left: posicao(item.marca) }} />}
      {zonas && (
        <span data-marca-do-valor="" className="grafico-cascata absolute top-px h-5 w-1 -ml-0.5 rounded-[2px] bg-foreground ring-2 ring-card"
          style={{ left: posicao(item.valor), animationDelay: `${Math.min(i * 60, 720) + 500}ms` }} />
      )}
    </>
  )
}

// Barras horizontais em HTML (o texto segue a escala e corta com reticências, o nome inteiro no title): nome (link
// opcional) e sub embaixo, a trilha com a barra, o valor e uma ação opcional no fim. Acima do limite (o do item ou a
// marca de 100%), a barra segue em vermelho depois da marca, com 2 px de vão e ícone de alerta; `tom: 'folga'` é âmbar,
// com a seta para baixo; `cor` (nome de COR ou valor de CSS, ex.: corDaSerie(i)) pinta a barra do item (ranking
// colorido). Variante empilhada (`partes`, tom: feita | nsa | andamento | pausada | afazer | atrasada | neutro, nessa
// ordem). `zonas` [{ ate, cor }] (pedido do Diego, 19/11): faixas de fundo na trilha (folga, ideal, acima), cada uma até
// o seu `ate`, com a barra fina e a marca do valor em cima (o ícone vem de `icone`, ou do limite/marca100). `separador`:
// a linha "… 18 no meio" depois dos `depoisDe` primeiros. Cada barra é focável (aria-label) e mostra a dica no mouse, no
// toque e no foco.
// itens: [{ chave, nome, href?, sub?, valor, limite?, marca?, tom?, cor?, partes?, valorTexto, icone?, aria, dica, acao? }].
export default function BarrasHorizontais({ itens, rotulo, escalaMax, marca100 = null, zonas = null, separador = null, rodape }) {
  const contem = useRef(null)
  const { dica, mostrar, esconder } = useDica(contem)
  const maximo = escalaMax ?? Math.max(1e-9, ...itens.flatMap((i) => [i.valor ?? 0, i.limite ?? 0, i.marca ?? 0]), marca100?.valor ?? 0, zonas?.at(-1)?.ate ?? 0) * 1.04
  const porcento = (v) => arredondar(Math.max(0, Math.min(100, (v / maximo) * 100)))
  const posicao = (v) => `${porcento(v)}%`
  const comAcao = itens.some((i) => i.acao)
  const colunas = comAcao ? COLUNAS.com : COLUNAS.sem
  const sair = (e) => {
    if (e.pointerType !== 'touch') esconder()
  }
  // No toque, o link do nome e o botão da ação são deles: tocar neles não abre a dica.
  const tocar = (item, e) => {
    if (!e.target.closest?.('a, button')) mostrar(item.dica, e.clientX, e.clientY)
  }

  const linhas = itens.map((item, i) => {
    const limite = item.partes ? null : item.limite ?? marca100?.valor ?? null
    const acima = limite != null && item.valor > limite
    const icone = item.icone ?? (acima ? 'alerta' : item.tom === 'folga' ? 'folga' : null)
    return (
      <li key={item.chave} data-alvo-da-dica="" className={cn('group/linha -mx-1.5 grid min-h-[30px] items-center gap-2.5 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-muted/70 max-sm:gap-2', colunas)}
        onPointerMove={(e) => mostrar(item.dica, e.clientX, e.clientY)} onPointerDown={(e) => tocar(item, e)} onPointerLeave={sair}>
        <span className="flex min-w-0 flex-col">
          {item.href
            ? <Link to={item.href} title={item.nome} className="block truncate text-rotulo font-medium hover:text-primary hover:underline pointer-coarse:py-3">{item.nome}</Link>
            : <span title={item.nome} className="truncate text-rotulo font-medium">{item.nome}</span>}
          {item.sub && <span title={item.sub} className="truncate text-legenda text-muted-foreground">{item.sub}</span>}
        </span>
        <span role="img" aria-label={item.aria} tabIndex={0}
          className="relative h-[22px] rounded-sm outline-none group-hover/linha:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          onFocus={(e) => mostrar(item.dica, ...pontoDoFoco(e.currentTarget))} onBlur={esconder}>
          <Barra item={item} posicao={posicao} porcento={porcento} limite={limite} marca100={marca100} zonas={zonas} i={i} />
        </span>
        <span className="flex items-center justify-end gap-1 text-rotulo whitespace-nowrap tabular-nums">
          {icone && ICONES[icone]}
          <span className="font-semibold">{item.valorTexto}</span>
        </span>
        {comAcao && <span className="flex justify-end">{item.acao}</span>}
      </li>
    )
  })
  if (separador && separador.depoisDe < linhas.length) {
    linhas.splice(separador.depoisDe, 0, (
      <li key="separador" className="py-0.5 text-legenda text-muted-foreground">{separador.texto}</li>
    ))
  }

  return (
    <div ref={contem} className="min-w-0">
      {marca100 && (
        <div aria-hidden="true" className={cn('grid gap-2.5 text-legenda text-muted-foreground max-sm:gap-2', colunas)}>
          <span />
          <span className="relative h-4">
            <span data-rotulo-marca="" className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: posicao(marca100.valor) }}>{marca100.rotulo}</span>
          </span>
        </div>
      )}
      <ul role="list" aria-label={rotulo} className="grid gap-1">{linhas}</ul>
      {rodape && <p className="mt-1 text-legenda text-muted-foreground">{rodape}</p>}
      <Dica estado={dica} />
    </div>
  )
}
