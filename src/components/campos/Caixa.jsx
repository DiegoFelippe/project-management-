import { useEffect, useRef } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

// Caixa de marcar do padrão Hub no lugar do <input type="checkbox">. O input de verdade continua lá (escondido):
// teclado e leitor de tela funcionam igual. `aoMudar(marcado)`; `indeterminado` mostra um traço (ex.: "marcar
// todos" com só alguns marcados). Com `rotulo`, o texto também marca. `nome`: o nome para o leitor de tela quando o
// texto fica fora da caixa (ex.: item de checklist, cujo texto é um botão de editar). `descritoPor`: o id de um texto
// da tela que descreve a caixa (ex.: por que ela está desligada). Cantos de 5 px: quadrada, para não parecer a de escolha
// única (auditoria, R1). No toque (pointer-coarse), o alvo tem 44 px: com `rotulo`, o rótulo inteiro; sem ele (item de
// lista, com o texto ao lado), uma área em volta do quadrado, sem mudar a altura nem o alinhamento com a 1ª linha.
export default function Caixa({ id, marcado, aoMudar, rotulo, nome, descritoPor, indeterminado = false, desabilitado = false, className }) {
  const entrada = useRef(null)
  useEffect(() => { if (entrada.current) entrada.current.indeterminate = indeterminado }, [indeterminado])
  const ligada = marcado || indeterminado

  return (
    <label className={cn('inline-flex items-center gap-2.5 text-corpo', rotulo && 'pointer-coarse:min-h-11', desabilitado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}>
      <span className={cn('relative inline-flex shrink-0', !rotulo && 'pointer-coarse:before:absolute pointer-coarse:before:-inset-[13px]')}>
        <input ref={entrada} id={id} type="checkbox" aria-label={nome} aria-describedby={descritoPor} checked={!!marcado} disabled={desabilitado} onChange={(e) => aoMudar(e.target.checked)}
          className="peer absolute inset-0 m-0 cursor-[inherit] opacity-0" />
        <span aria-hidden="true" className={cn('peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-card pointer-events-none flex size-[18px] items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1',
          ligada ? 'bg-primary-cheio border-primary-cheio text-primary-foreground' : 'bg-card border-input peer-hover:border-primary/60')}>
          {indeterminado ? <Minus className="size-3" strokeWidth={3} /> : marcado ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
      </span>
      {rotulo && <span className="text-foreground">{rotulo}</span>}
    </label>
  )
}
