import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Abas que não cabem rolam dentro do trilho (no celular). A borda que esconde abas esmaece (auditoria, R12), pela máscara
// do próprio trilho (vale em qualquer fundo): 'fim' (direita), 'inicio' (esquerda) ou 'ambas'.
const ESMAECIDO = 28
const MASCARAS = {
  fim: `linear-gradient(to right, #000 calc(100% - ${ESMAECIDO}px), transparent)`,
  inicio: `linear-gradient(to left, #000 calc(100% - ${ESMAECIDO}px), transparent)`,
  ambas: `linear-gradient(to right, transparent, #000 ${ESMAECIDO}px, #000 calc(100% - ${ESMAECIDO}px), transparent)`,
}
// Folga ao rolar a aba ativa para a vista: ela não fica embaixo do esmaecido.
const FOLGA = 24

function bordasDe(el) {
  const inicio = el.scrollLeft > 1
  const fim = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
  return inicio && fim ? 'ambas' : inicio ? 'inicio' : fim ? 'fim' : null
}

// Abas em controle segmentado (trilho cinza, aba ativa branca e elevada, com o texto no azul do realce). `abas`: [{ valor, rotulo, icone?, erro?, contador?, pendente?,
// desligada? }]. `desligada`: a aba não clica e fica esmaecida (ex.: a situação que espera outra tarefa no Editar da tarefa).
// `icone` (componente lucide) vem antes do rótulo; `erro` põe um ponto vermelho (e "tem erro" para leitor de tela).
// `contador` é o número na pílula ao lado do rótulo (só quando a tela já o tem do banco); `pendente` pinta a pílula de âmbar.
// Nas listas, são botões de alternância (aria-pressed). Com `comoAbas` (página do cliente) viram role="tablist"/"tab":
// aria-selected, aria-controls (`idBase`), tabindex móvel e setas. `idBase` combina os ids com os painéis:
// `${idBase}-aba-<valor>` e `${idBase}-painel-<valor>`. No toque (pointer-coarse), cada aba tem 44 px e 8 px entre elas.
// Quando não cabem, rolam dentro do trilho, com a borda esmaecida e a ativa à vista (auditoria, R12).
export default function AbasSegmentadas({ rotulo, abas, valor, aoMudar, comoAbas = false, idBase }) {
  const trilho = useRef(null)
  const [borda, setBorda] = useState(null)

  // Mede ao montar, ao rolar e quando o trilho muda de tamanho (tela girou, barra quebrou linha).
  useLayoutEffect(() => {
    const el = trilho.current
    const medir = () => setBorda(bordasDe(el))
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null
    observador?.observe(el)
    window.addEventListener('resize', medir)
    return () => {
      el.removeEventListener('scroll', medir)
      observador?.disconnect()
      window.removeEventListener('resize', medir)
    }
  }, [])

  // A aba ativa sempre à vista (R12): ao abrir (ex.: ?aba=historico no cliente) e ao trocar. Rola só o trilho, nunca a página.
  useLayoutEffect(() => {
    const el = trilho.current
    const ativa = el.querySelector('[aria-pressed="true"], [aria-selected="true"]')
    if (!ativa || el.scrollWidth <= el.clientWidth) return
    const esquerda = ativa.offsetLeft
    const direita = esquerda + ativa.offsetWidth
    let alvo = null
    if (esquerda - FOLGA < el.scrollLeft) alvo = Math.max(0, esquerda - FOLGA)
    else if (direita + FOLGA > el.scrollLeft + el.clientWidth) alvo = direita + FOLGA - el.clientWidth
    if (alvo === null) return
    if (typeof el.scrollTo === 'function') el.scrollTo({ left: alvo })
    else el.scrollLeft = alvo
    setBorda(bordasDe(el))
  }, [valor])

  function aoTeclar(e, indice) {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!passo) return
    e.preventDefault()
    const proxima = abas[(indice + passo + abas.length) % abas.length]
    aoMudar(proxima.valor)
    document.getElementById(`${idBase}-aba-${proxima.valor}`)?.focus()
  }

  return (
    <div ref={trilho} role={comoAbas ? 'tablist' : 'group'} aria-label={rotulo} data-borda={borda ?? undefined}
      style={borda ? { maskImage: MASCARAS[borda], WebkitMaskImage: MASCARAS[borda] } : undefined}
      className="relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-muted p-1 text-rotulo font-semibold pointer-coarse:gap-2">
      {abas.map((aba, i) => {
        const ativa = aba.valor === valor
        const propriedades = comoAbas
          ? {
              role: 'tab', id: `${idBase}-aba-${aba.valor}`, 'aria-selected': ativa,
              'aria-controls': `${idBase}-painel-${aba.valor}`, tabIndex: ativa ? 0 : -1, onKeyDown: (e) => aoTeclar(e, i),
            }
          : { 'aria-pressed': ativa }
        return (
          <button key={aba.valor} type="button" {...propriedades} disabled={aba.desligada} data-erro={aba.erro ? '' : undefined}
            onClick={() => aoMudar(aba.valor)}
            className={cn(
              'botao-animado inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 transition-[background-color,color,box-shadow,translate,scale] outline-none hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11',
              ativa ? 'bg-card text-primary-texto shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}>
            {aba.icone && <aba.icone className="size-[13px]" aria-hidden="true" />}
            {aba.rotulo}
            {aba.erro && (
              <>
                <span data-ponto-erro aria-hidden="true" className="bg-destructive-cheio size-1.5 rounded-full" />
                <span className="sr-only">, tem erro</span>
              </>
            )}
            {aba.contador != null && (
              <span data-contador className={cn(
                'rounded-full px-1.5 text-legenda font-semibold tabular-nums',
                aba.pendente ? 'bg-notice-soft text-notice' : 'bg-foreground/10 text-muted-foreground',
              )}>
                {aba.contador}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
