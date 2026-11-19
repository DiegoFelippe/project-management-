import { useId, useMemo, useRef } from 'react'
import { ArrowRight, Ban, Check, Circle, Clock, Lock, Pause, Play, TriangleAlert } from 'lucide-react'
import { TAMANHO } from '@/lib/tipografia'
import { cn } from '@/lib/utils'
import { ALTURA_DO_NO, LARGURA_DO_NO, caminhoDaSeta, cortar, layoutDoFluxo, quebrarTitulo } from './fluxo'

// Fluxograma das tarefas por etapa (SVG próprio, o desenho do protótipo): uma raia por etapa, uma caixa por tarefa com a
// cor da situação e as setas do "depende de". Com `aoEscolher`, cada caixa é um botão ("título: situação"; clique, Enter
// ou espaço); sem ele, é só desenho (a prévia do modelo), sem nada focável. O quadro rola dentro do cartão (a página
// nunca rola para o lado) e, com o mouse, arrastar o fundo rola o quadro; no celular o dedo já rola.
// Cores só pelos tokens do tema (mudam sozinhas no escuro); texto pela escala (TAMANHO), nunca abaixo de 11 px.

// Cor de cada situação: `tom` pinta o ícone, a bolinha e a linha de baixo (currentColor); `fundo`, a caixa. As mesmas cores
// de estado dos gráficos (COR de graficos/cores.js; cores vivas, 19/11): feita verde, não se aplica grafite, em andamento
// azul, pausada turquesa, a fazer violeta, atrasada vermelha (o suave na caixa, o forte na borda, o texto na linha de baixo).
const ESTILO = {
  livre: { tom: 'text-cor-violeta-texto', fundo: 'fill-cor-violeta-suave stroke-cor-violeta-forte' },
  feita: { tom: 'text-positive', fundo: 'fill-positive-soft stroke-positive' },
  andamento: { tom: 'text-cor-azul-texto', fundo: 'fill-cor-azul-suave stroke-cor-azul-forte' },
  pausada: { tom: 'text-cor-turquesa-texto', fundo: 'fill-cor-turquesa-suave stroke-cor-turquesa-forte' },
  bloqueada: { tom: 'text-muted-foreground', fundo: 'fill-muted stroke-input', tracejada: true, titulo: 'fill-muted-foreground' },
  hoje: { tom: 'text-notice', fundo: 'fill-notice-soft stroke-notice' },
  atrasada: { tom: 'text-destructive', fundo: 'fill-destructive-soft stroke-destructive' },
  // Não se aplica: grafite (borda cheia, a bloqueada é tracejada) com o ícone próprio, nunca o check verde.
  nao_se_aplica: { tom: 'text-cor-grafite-texto', fundo: 'fill-cor-grafite-suave stroke-cor-grafite-forte', titulo: 'fill-cor-grafite-texto' },
}
const ICONE = {
  livre: Circle, feita: Check, andamento: Play, pausada: Pause, bloqueada: Lock, hoje: Clock, atrasada: TriangleAlert, nao_se_aplica: Ban,
}

// Setas: a que sai de tarefa feita fica verde; as da tarefa escolhida, em destaque (por cima das outras); a que aponta
// para uma tarefa que vem depois (só num rascunho do editor de modelos) fica tracejada, em vermelho.
const SETA = {
  normal: { linha: 'stroke-input stroke-[1.5]', ponta: 'fill-input' },
  feita: { linha: 'stroke-positive/55 stroke-[1.5]', ponta: 'fill-positive/70' },
  invalida: { linha: 'stroke-destructive-cheio stroke-[1.5]', ponta: 'fill-destructive-cheio', tracejada: true },
  realce: { linha: 'stroke-primary stroke-[2.25]', ponta: 'fill-primary' },
}

const INFO_PADRAO = { cor: 'livre', sub: '', rotulo: '' }
const LETRAS_DO_TITULO = 20 // por linha da caixa (12,5 px, semibold, em 140 px)
const LETRAS_DA_SITUACAO = 24 // a linha de baixo (11 px)
const PX_POR_LETRA = 7.5 // estimativa para cortar o nome da etapa (12,5 px, negrito)
const plural = (n) => `${n} ${n === 1 ? 'tarefa' : 'tarefas'}`

export default function Fluxograma({
  etapas, tarefas, vertical = false, infoDaTarefa, selecionada = null, aoEscolher, rotulo = 'Fluxograma das tarefas',
  contagemDaEtapa,
}) {
  const interativo = typeof aoEscolher === 'function'
  // O id dos marcadores das setas (mais de um fluxograma na tela não se misturam); sem os sinais do useId, que o url() não aceita.
  const prefixo = `fluxo${useId().replace(/[^\w-]/g, '')}`
  const caixa = useRef(null)
  const arraste = useRef(null)

  // O desenho só depende da estrutura (as etapas, a ordem das tarefas, a etapa de cada uma e o "depende de") e da
  // orientação: marcar uma tarefa (que só muda a cor) não recalcula o desenho, nem num check-list de 500. A estrutura vira
  // um texto (a chave do memo) e o desenho é feito a partir dele.
  const estrutura = JSON.stringify([etapas.map((e) => e.id), tarefas.map((t) => [t.id, t.etapa_id, t.depende_de ?? []])])
  const layout = useMemo(() => {
    const [idsDasEtapas, esqueleto] = JSON.parse(estrutura)
    return layoutDoFluxo(
      idsDasEtapas.map((id) => ({ id })),
      esqueleto.map(([id, etapa, dependeDe]) => ({ id, etapa_id: etapa, depende_de: dependeDe })),
      { vertical },
    )
  }, [estrutura, vertical])
  const daEtapa = useMemo(() => {
    const grupos = new Map(etapas.map((e) => [e.id, []]))
    for (const t of tarefas) grupos.get(t.etapa_id)?.push(t)
    return grupos
  }, [etapas, tarefas])
  const { nos, raias, largura, altura } = layout

  const infos = new Map(tarefas.map((t) => [t.id, { ...INFO_PADRAO, ...infoDaTarefa?.(t) }]))
  const etapaPorId = new Map(etapas.map((e, i) => [e.id, { etapa: e, numero: i + 1 }]))

  const ordem = new Map(tarefas.map((t, i) => [t.id, i]))
  const setas = []
  const vistas = new Set()
  for (const t of tarefas) {
    for (const d of t.depende_de ?? []) {
      const de = nos[d]
      const para = nos[t.id]
      if (!de || !para || vistas.has(`${d}>${t.id}`)) continue
      vistas.add(`${d}>${t.id}`)
      const tipo = selecionada && (selecionada === d || selecionada === t.id) ? 'realce'
        : ordem.get(d) > ordem.get(t.id) ? 'invalida'
          : infos.get(d)?.cor === 'feita' ? 'feita'
            : 'normal'
      setas.push({ de: d, para: t.id, tipo, d: caminhoDaSeta(de, para, { vertical }) })
    }
  }
  setas.sort((a, b) => (a.tipo === 'realce') - (b.tipo === 'realce'))

  function aoApertar(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (interativo && e.target.closest?.('[role="button"]')) return
    const el = caixa.current
    arraste.current = { id: e.pointerId, x: e.clientX, y: e.clientY, esquerda: el.scrollLeft, topo: el.scrollTop }
    el.setAttribute('data-arrastando', '')
    el.setPointerCapture?.(e.pointerId)
  }
  function aoMover(e) {
    const a = arraste.current
    if (!a || e.pointerId !== a.id) return
    caixa.current.scrollLeft = a.esquerda - (e.clientX - a.x)
    caixa.current.scrollTop = a.topo - (e.clientY - a.y)
  }
  function aoSoltar() {
    if (!arraste.current) return
    arraste.current = null
    caixa.current.removeAttribute('data-arrastando')
  }

  return (
    <div
      ref={caixa}
      data-caixa-do-fluxo=""
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onLostPointerCapture={aoSoltar}
      className="bg-card relative max-h-[80dvh] max-w-full min-w-0 cursor-grab overflow-auto overscroll-x-contain data-arrastando:cursor-grabbing data-arrastando:select-none"
    >
      <svg
        width={largura}
        height={altura}
        viewBox={`0 0 ${largura} ${altura}`}
        role={interativo ? 'group' : 'img'}
        aria-label={rotulo}
        className="mx-auto block"
      >
        <defs>
          {Object.entries(SETA).map(([tipo, estilo]) => (
            <marker key={tipo} id={`${prefixo}-seta-${tipo}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerUnits="userSpaceOnUse"
              markerWidth="9" markerHeight="9" orient="auto">
              <path d="M0 1 L9 5 L0 9 z" className={estilo.ponta} />
            </marker>
          ))}
          {/* Texto da caixa nunca passa da borda (título com letras largas). */}
          <clipPath id={`${prefixo}-texto`}>
            <rect width={LARGURA_DO_NO - 6} height={ALTURA_DO_NO} />
          </clipPath>
        </defs>

        {raias.map((raia) => {
          const { etapa, numero } = etapaPorId.get(raia.etapaId)
          const titulo = `${numero} · ${etapa.nome || 'Etapa sem nome'}`
          const contagem = String(contagemDaEtapa ? contagemDaEtapa(etapa, daEtapa.get(etapa.id)) : plural(daEtapa.get(etapa.id).length))
          if (vertical) {
            const letras = Math.max(8, Math.floor((largura - 56 - contagem.length * 6.5) / PX_POR_LETRA))
            return (
              <g key={raia.etapaId}>
                <rect x={8} y={raia.inicio - 10} width={largura - 16} height={raia.fim - raia.inicio + 24} rx={14} className="fill-muted/75" />
                <text x={22} y={raia.inicio + 12} fontSize={TAMANHO.rotulo} className="fill-foreground font-bold">{cortar(titulo, letras)}</text>
                <text x={largura - 22} y={raia.inicio + 12} textAnchor="end" fontSize={TAMANHO.legenda} className="fill-muted-foreground">
                  {contagem}
                </text>
              </g>
            )
          }
          const larguraDaRaia = raia.fim - raia.inicio
          return (
            <g key={raia.etapaId}>
              <rect x={raia.inicio - 14} y={10} width={larguraDaRaia + 28} height={altura - 20} rx={14} className="fill-muted/75" />
              <text x={raia.inicio} y={31} fontSize={TAMANHO.rotulo} className="fill-foreground font-bold">
                {cortar(titulo, Math.floor((larguraDaRaia + 8) / PX_POR_LETRA))}
              </text>
              <text x={raia.inicio} y={46} fontSize={TAMANHO.legenda} className="fill-muted-foreground">{contagem}</text>
            </g>
          )
        })}

        {setas.map((s) => (
          <path
            key={`${s.de}>${s.para}`}
            data-de={s.de}
            data-para={s.para}
            d={s.d}
            markerEnd={`url(#${prefixo}-seta-${s.tipo})`}
            strokeDasharray={SETA[s.tipo].tracejada ? '4 3' : undefined}
            className={`seta ${s.tipo} fill-none ${SETA[s.tipo].linha}`}
          />
        ))}

        {tarefas.map((t) => {
          const p = nos[t.id]
          if (!p) return null
          const info = infos.get(t.id)
          const estilo = ESTILO[info.cor] ?? ESTILO.livre
          const Icone = info.icone ?? ICONE[info.cor] ?? Circle
          const titulo = t.titulo?.trim() || 'Sem título'
          const linhas = quebrarTitulo(titulo, LETRAS_DO_TITULO)
          const yTitulo = linhas.length === 1 ? 27 : 21
          const ySituacao = linhas.length === 1 ? 45 : 52
          const escolhida = selecionada === t.id
          const comoBotao = interativo
            ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': info.rotulo ? `${titulo}: ${info.rotulo}` : titulo,
              onClick: () => aoEscolher(t),
              onKeyDown: (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                aoEscolher(t)
              },
            }
            : {}
          return (
            <g
              key={t.id}
              transform={`translate(${p.x} ${p.y})`}
              data-tarefa={t.id}
              data-situacao={info.cor}
              data-selecionada={escolhida || undefined}
              className={cn('group', estilo.tom, interativo && 'cursor-pointer outline-none', info.apagado && 'opacity-30')}
              {...comoBotao}
            >
              <title>{info.sub ? `${titulo} — ${info.sub}` : titulo}</title>
              <g className={interativo ? 'transition-transform duration-150 group-hover:-translate-y-px' : undefined}>
                <rect
                  width={LARGURA_DO_NO}
                  height={ALTURA_DO_NO}
                  rx={12}
                  strokeDasharray={estilo.tracejada ? '5 4' : undefined}
                  className={cn(
                    'stroke-[1.25] transition-[stroke,stroke-width,filter] duration-150',
                    estilo.fundo,
                    escolhida && 'stroke-[2.5]',
                    interativo && 'group-hover:stroke-primary group-hover:drop-shadow-md group-focus-visible:stroke-ring group-focus-visible:stroke-[3]',
                  )}
                />
                <circle cx={19} cy={yTitulo - 5} r={10} fillOpacity={0.14} className="fill-current" />
                <Icone x={12} y={yTitulo - 12} width={14} height={14} strokeWidth={2.5} aria-hidden="true" />
                <text fontSize={TAMANHO.rotulo} clipPath={`url(#${prefixo}-texto)`} className={cn('font-semibold', estilo.titulo ?? 'fill-foreground')}>
                  {linhas.map((linha, i) => <tspan key={i} x={36} y={yTitulo + i * 15}>{linha}</tspan>)}
                </text>
                {info.sub && (
                  <text x={36} y={ySituacao} fontSize={TAMANHO.legenda} clipPath={`url(#${prefixo}-texto)`} className="fill-current">
                    {cortar(info.sub, LETRAS_DA_SITUACAO)}
                  </text>
                )}
              </g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const ITENS_DA_LEGENDA = [
  ['feita', 'Feita'], ['nao_se_aplica', 'Não se aplica'], ['andamento', 'Em andamento'], ['pausada', 'Pausada'], ['livre', 'A fazer'],
  ['bloqueada', 'Bloqueada'], ['hoje', 'Vence hoje'], ['atrasada', 'Atrasada'],
]
const AMOSTRA = {
  feita: 'bg-positive-soft border-positive',
  andamento: 'bg-cor-azul-suave border-cor-azul-forte',
  livre: 'bg-cor-violeta-suave border-cor-violeta-forte',
  bloqueada: 'bg-muted border-input border-dashed',
  hoje: 'bg-notice-soft border-notice',
  atrasada: 'bg-destructive-soft border-destructive',
}

// Legenda embaixo do fluxograma (no mesmo cartão): as cores das situações, a seta e uma dica de uso.
export function LegendaDoFluxo({ dica }) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-4 py-2.5 text-legenda">
      <ul aria-label="Legenda do fluxograma" className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {ITENS_DA_LEGENDA.map(([cor, texto]) => (
          <li key={cor} className="inline-flex items-center gap-1.5">
            {cor === 'nao_se_aplica' ? <Ban aria-hidden="true" className="text-cor-grafite-texto size-3.5" />
              : cor === 'pausada' ? <Pause aria-hidden="true" className="text-cor-turquesa-texto size-3.5" />
                : <span aria-hidden="true" className={cn('inline-block h-2.5 w-3.5 rounded-[3px] border', AMOSTRA[cor])} />}
            {texto}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <ArrowRight aria-hidden="true" className="size-3.5" />
          depende de
        </li>
      </ul>
      {dica && <p className="text-legenda sm:ml-auto">{dica}</p>}
    </div>
  )
}
