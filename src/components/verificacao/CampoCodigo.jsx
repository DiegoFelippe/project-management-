import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Código de 6 dígitos do app autenticador: só números (o resto some ao digitar ou colar), teclado numérico no
// celular e o "código recebido" que o navegador oferece (one-time-code). `aoMudar(texto)`.
export default function CampoCodigo({ id, valor, aoMudar, autoFocus = false, invalido = false, className }) {
  return (
    <Input id={id} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} spellCheck={false}
      autoFocus={autoFocus} placeholder="000000" aria-invalid={invalido || undefined}
      className={cn('h-11 max-w-48 text-center sm:text-janela font-semibold tracking-[0.4em] tabular-nums', className)}
      value={valor} onChange={(e) => aoMudar(e.target.value.replace(/\D/g, '').slice(0, 6))} />
  )
}
