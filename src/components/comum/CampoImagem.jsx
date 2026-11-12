// Foto da pessoa ou logo da empresa dentro de um formulário: colocar, trocar ou tirar.
// Só vale quando o formulário é salvo (valor: null = não mexer, { arquivo } = nova, { tirar: true } = tirar).
import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TIPOS_ACEITOS, validarImagem } from '@/lib/imagem'
import { cn } from '@/lib/utils'

export default function CampoImagem({ rotulo, atual, reserva, redondo = true, valor, aoMudar }) {
  const id = useId()
  const [erro, setErro] = useState(null)
  const arquivo = valor?.arquivo
  const previa = useMemo(() => (arquivo ? (URL.createObjectURL?.(arquivo) ?? null) : null), [arquivo])
  useEffect(() => () => previa && URL.revokeObjectURL?.(previa), [previa])
  const mostrada = valor?.tirar ? null : (previa ?? atual)

  function escolher(evento) {
    const escolhido = evento.target.files?.[0]
    evento.target.value = ''
    if (!escolhido) return
    const problema = validarImagem(escolhido)
    if (problema) return setErro(problema)
    setErro(null)
    aoMudar({ arquivo: escolhido })
  }

  function tirar() {
    setErro(null)
    // tirando só a escolhida agora (sem imagem antes): volta ao que era
    aoMudar(arquivo && !atual ? null : { tirar: true })
  }

  return (
    <div className="flex items-center gap-4">
      <div className={cn('grid size-16 shrink-0 place-items-center overflow-hidden text-lg font-bold text-muted-foreground',
        redondo ? 'rounded-full bg-muted' : 'rounded-lg border bg-white')}>
        {mostrada
          ? <img src={mostrada} alt={`Prévia da ${rotulo}`} className={redondo ? 'size-full object-cover' : 'size-full object-contain p-1.5'} />
          : reserva}
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <label htmlFor={id} className="cursor-pointer has-[+input:focus-visible]:ring-2 has-[+input:focus-visible]:ring-ring">
              <ImagePlus /> {mostrada ? `Trocar ${rotulo}` : `Colocar ${rotulo}`}
            </label>
          </Button>
          <input id={id} type="file" accept={TIPOS_ACEITOS.join(',')} aria-label={`Escolher ${rotulo}`} className="sr-only" onChange={escolher} />
          {mostrada && (
            <Button type="button" variant="ghost" size="sm" onClick={tirar}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 /> Tirar {rotulo}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG ou WebP, até 10 MB.</p>
        {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
      </div>
    </div>
  )
}
