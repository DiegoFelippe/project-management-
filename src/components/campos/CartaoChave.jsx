import { useId } from 'react'
import { cn } from '@/lib/utils'

// Cartão com chave do padrão Hub (SwitchCard): o cartão inteiro é a chave (role="switch"). Ligado, ganha a borda e o
// fundo claro da cor principal. Ícone de 32 px, título 12,5 px, dica 11,5 px e a chave de 32×18 à direita.
// `aoMudar(ligada)`. `embutido`: a chave é a linha de cima de um cartão maior (`CartaoDaSecao` com `divide-y`), sem a
// borda e o canto próprios; ligada, só o fundo claro (a borda fica por conta do cartão).
export default function CartaoChave({ id, ligada, aoMudar, titulo, dica, icone: Icone, desabilitado = false, embutido = false }) {
  const base = useId()
  return (
    <button id={id} type="button" role="switch" aria-checked={!!ligada} disabled={desabilitado}
      aria-labelledby={`${base}-titulo`} aria-describedby={dica ? `${base}-dica` : undefined}
      onClick={() => aoMudar(!ligada)}
      className={cn('botao-animado flex w-full items-start gap-3 px-3 py-2.5 text-left transition-[background-color,border-color,translate,scale] outline-none hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-60',
        embutido
          ? cn('focus-visible:ring-inset', ligada ? 'bg-primary/5' : 'hover:bg-muted/40')
          : cn('rounded-xl border', ligada ? 'border-primary/50 bg-primary/5' : 'bg-card hover:border-primary/40'))}>
      {Icone && (
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', ligada ? 'bg-primary-cheio text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          <Icone className="size-4" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span id={`${base}-titulo`} className="block text-rotulo font-semibold">{titulo}</span>
        {dica && <span id={`${base}-dica`} className="text-muted-foreground block text-legenda">{dica}</span>}
      </span>
      <span aria-hidden="true" className={cn('relative mt-1.5 h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150', ligada ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white shadow transition-transform duration-150', ligada && 'translate-x-3.5')} />
      </span>
    </button>
  )
}
