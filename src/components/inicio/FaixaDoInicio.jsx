import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural } from '@/lib/nomes'

export const ID_DO_RISCO = 'clientes-em-risco'

// A faixa "está tudo bem?" do Início (Névoa, pedido do Diego, 19/11): para a central e a gestão, "N clientes precisam de
// você" (o total do bloco Clientes em risco) e "Ver os N", que leva ao bloco (rola até ele e põe o foco). Nada com 0.
export default function FaixaDoInicio({ total }) {
  if (!total) return null
  const ver = () => {
    const alvo = document.getElementById(ID_DO_RISCO)
    alvo?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    alvo?.focus({ preventScroll: true })
  }
  return (
    <div role="status" data-faixa-do-inicio="" className="flex flex-wrap items-center gap-3 rounded-2xl bg-notice-soft px-4 py-3 text-corpo text-foreground">
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-notice" />
      <p className="min-w-0 flex-1"><b className="font-semibold">{plural(total, 'cliente precisa', 'clientes precisam')} de você.</b></p>
      <Button type="button" variant="outline" size="sm" onClick={ver}>Ver os {total}</Button>
    </div>
  )
}
