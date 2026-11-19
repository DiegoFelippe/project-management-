import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const CARREGANDO_MIN = 300
const FEITO_POR = 2000

// Botão que termina em "✓ Salvo" (Névoa, pedido do Diego, 19/11): `acao` devolve { erro }; enquanto roda, gira (por 300 ms
// no mínimo, para não piscar); com sucesso, o rótulo feito sobre o verde-suave por 2 s; com erro, volta ao rótulo e
// avisa (`aoErro`, por padrão um toast). `rotuloIndo`: o nome do botão enquanto roda (leitor de tela). Os dois rótulos ocupam o mesmo lugar: a largura não muda. Usa o Button (anima).
export default function BotaoComResultado({ acao, rotulo, rotuloFeito = '✓ Salvo', rotuloIndo, aoErro = (texto) => toast.error(texto), icone, className, ...resto }) {
  const [estado, setEstado] = useState(null) // null | 'indo' | 'feito'
  const relogio = useRef(null)
  useEffect(() => () => clearTimeout(relogio.current), [])

  async function clicar() {
    if (estado === 'indo') return
    clearTimeout(relogio.current)
    setEstado('indo')
    const comeco = Date.now()
    const resposta = await acao().catch((e) => ({ erro: e?.message || 'Não foi possível concluir.' }))
    await new Promise((ok) => setTimeout(ok, Math.max(0, CARREGANDO_MIN - (Date.now() - comeco))))
    if (resposta?.erro) {
      setEstado(null)
      aoErro(resposta.erro)
      return
    }
    setEstado('feito')
    relogio.current = setTimeout(() => setEstado(null), FEITO_POR)
  }

  const feito = estado === 'feito'
  return (
    <Button type="button" {...resto} disabled={resto.disabled || estado === 'indo'} aria-label={estado === 'indo' ? rotuloIndo : undefined}
      onClick={clicar} data-estado={estado ?? undefined} aria-busy={estado === 'indo' || undefined}
      className={cn('relative min-w-26 data-[estado=indo]:text-transparent data-[estado=feito]:border-transparent data-[estado=feito]:bg-positive-soft data-[estado=feito]:text-positive data-[estado=feito]:shadow-none data-[estado=feito]:animate-[botao-mola_0.5s_cubic-bezier(0.34,1.56,0.64,1)] data-[estado=feito]:hover:bg-positive-soft',
        className)}>
      <span className="inline-grid">
        <span aria-hidden={feito || undefined} className={cn('col-start-1 row-start-1 inline-flex items-center justify-center gap-2', feito && 'invisible')}>{icone}{rotulo}</span>
        <span aria-hidden={!feito || undefined} className={cn('col-start-1 row-start-1 inline-flex items-center justify-center', !feito && 'invisible')}>{rotuloFeito}</span>
      </span>
      {estado === 'indo' && (
        <span aria-hidden="true" className={cn('absolute size-4 animate-spin rounded-full border-2 border-current border-r-transparent', resto.variant === 'outline' || resto.variant === 'ghost' ? 'text-muted-foreground' : 'text-primary-foreground')} />
      )}
    </Button>
  )
}
