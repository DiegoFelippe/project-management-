import { cn } from '@/lib/utils'

// Chave liga/desliga do padrão Hub (switch). `aoMudar(ligada)`. O rótulo também aciona a chave.
export default function Chave({ id, ligada, aoMudar, rotulo, desabilitado = false, className }) {
  return (
    <label className={cn('inline-flex items-center gap-3 text-[13px]', desabilitado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer', className)}>
      <button id={id} type="button" role="switch" aria-checked={!!ligada} disabled={desabilitado} onClick={() => aoMudar(!ligada)}
        className={cn('botao-animado focus-visible:ring-primary/40 relative h-5 w-9 shrink-0 rounded-full transition-[background-color,translate,scale] duration-150 outline-none hover:-translate-y-px focus-visible:ring-2 active:scale-[0.97]', ligada ? 'bg-primary' : 'bg-input')}>
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-150', ligada && 'translate-x-4')} />
      </button>
      <span className="text-foreground">{rotulo}</span>
    </label>
  )
}
