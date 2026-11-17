import { cn } from '@/lib/utils'

// Abas em controle segmentado (trilho cinza, aba ativa branca e elevada). `abas`: [{ valor, rotulo, icone?, erro?, contador?, pendente? }].
// `icone` (componente lucide) vem antes do rótulo; `erro` põe um ponto vermelho (e "tem erro" para leitor de tela).
// `contador` é o número na pílula ao lado do rótulo (só quando a tela já o tem do banco); `pendente` pinta a pílula de âmbar.
// Nas listas, são botões de alternância (aria-pressed). Com `comoAbas` (página do cliente) viram role="tablist"/"tab":
// aria-selected, aria-controls (`idBase`), tabindex móvel e setas. `idBase` combina os ids com os painéis:
// `${idBase}-aba-<valor>` e `${idBase}-painel-<valor>`.
export default function AbasSegmentadas({ rotulo, abas, valor, aoMudar, comoAbas = false, idBase }) {
  function aoTeclar(e, indice) {
    const passo = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
    if (!passo) return
    e.preventDefault()
    const proxima = abas[(indice + passo + abas.length) % abas.length]
    aoMudar(proxima.valor)
    document.getElementById(`${idBase}-aba-${proxima.valor}`)?.focus()
  }

  return (
    <div role={comoAbas ? 'tablist' : 'group'} aria-label={rotulo}
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-muted p-1 text-rotulo font-semibold">
      {abas.map((aba, i) => {
        const ativa = aba.valor === valor
        const propriedades = comoAbas
          ? {
              role: 'tab', id: `${idBase}-aba-${aba.valor}`, 'aria-selected': ativa,
              'aria-controls': `${idBase}-painel-${aba.valor}`, tabIndex: ativa ? 0 : -1, onKeyDown: (e) => aoTeclar(e, i),
            }
          : { 'aria-pressed': ativa }
        return (
          <button key={aba.valor} type="button" {...propriedades} data-erro={aba.erro ? '' : undefined} onClick={() => aoMudar(aba.valor)}
            className={cn(
              'botao-animado inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 transition-[background-color,color,box-shadow,translate,scale] outline-none hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50',
              ativa ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}>
            {aba.icone && <aba.icone className="size-[13px]" aria-hidden="true" />}
            {aba.rotulo}
            {aba.erro && (
              <>
                <span data-ponto-erro aria-hidden="true" className="bg-destructive size-1.5 rounded-full" />
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
