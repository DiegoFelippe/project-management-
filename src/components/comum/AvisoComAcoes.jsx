import { CircleAlert, CircleCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const DURACAO_DO_AVISO = 10_000

// O aviso com botões (usabilidade, U3 e U11): "Desfazer", "Ver cliente", "Tentar de novo". Fica uns 10 s, e o tempo para
// enquanto o mouse está em cima ou o foco está dentro dele (dá tempo de chegar aos botões pelo teclado). Clicar num botão
// fecha o aviso; o link que leva à tela em que a pessoa já está não aparece.
export default function AvisoComAcoes({ id, texto, erro, acoes }) {
  const { pathname } = useLocation()
  const [mouse, setMouse] = useState(false)
  const [foco, setFoco] = useState(false)
  const restante = useRef(DURACAO_DO_AVISO)

  useEffect(() => {
    if (mouse || foco) return undefined
    const comeco = Date.now()
    const relogio = setTimeout(() => toast.dismiss(id), restante.current)
    return () => {
      clearTimeout(relogio)
      restante.current -= Date.now() - comeco
    }
  }, [id, mouse, foco])

  const Icone = erro ? CircleAlert : CircleCheck
  const visiveis = acoes.filter((acao) => acao.para !== pathname)
  return (
    <div data-aviso-com-acoes="" onMouseEnter={() => setMouse(true)} onMouseLeave={() => setMouse(false)}
      onFocus={() => setFoco(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFoco(false)}
      className="grid w-(--width) gap-3 rounded-[14px] border bg-popover p-4 text-corpo font-normal text-popover-foreground max-[600px]:w-full">
      <p className="flex items-start gap-2">
        <Icone aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', erro ? 'text-destructive' : 'text-positive')} />
        <span className="min-w-0">{texto}</span>
      </p>
      {visiveis.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {visiveis.map((acao, i) => (acao.para ? (
            <Button key={acao.rotulo} asChild size="sm" variant={i === 0 ? 'default' : 'outline'}>
              <Link to={acao.para} onClick={() => toast.dismiss(id)}>{acao.rotulo}</Link>
            </Button>
          ) : (
            <Button key={acao.rotulo} size="sm" variant={i === 0 ? 'default' : 'outline'}
              onClick={() => { toast.dismiss(id); acao.aoClicar() }}>{acao.rotulo}</Button>
          )))}
        </div>
      )}
    </div>
  )
}
