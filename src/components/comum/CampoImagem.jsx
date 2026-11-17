// Foto da pessoa ou logo da empresa dentro de um formulário: colocar, trocar ou tirar.
// Só vale quando o formulário é salvo (valor: null = não mexer, { arquivo } = nova, { tirar: true } = tirar).
import { Camera, ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TIPOS_ACEITOS, validarImagem } from '@/lib/imagem'
import { cn } from '@/lib/utils'

// `aparencia="cartao"` (ficha da pessoa, Padrão Hub): foto quadrada de 96 px com cantos arredondados, botão câmera
// "Trocar a foto" no canto e "Tirar foto" pequeno embaixo; `reservaCor` pinta o fundo das iniciais.
export default function CampoImagem({ rotulo, atual, reserva, reservaCor, aparencia = 'linha', redondo = true, valor, aoMudar }) {
  const id = useId()
  const entrada = useRef(null)
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

  if (aparencia === 'cartao') {
    return (
      <div className="flex shrink-0 flex-col items-center gap-2">
        <div className="relative">
          <div className="bg-muted text-muted-foreground grid size-24 place-items-center overflow-hidden rounded-2xl text-destaque font-bold">
            {mostrada
              ? <img src={mostrada} alt={`Prévia da ${rotulo}`} className="size-full object-cover" />
              : <span className="grid size-full place-items-center text-white" style={reservaCor ? { backgroundColor: reservaCor } : undefined}>{reserva}</span>}
          </div>
          <Button type="button" size="icon" aria-label={`Trocar a ${rotulo}`} title={`Trocar a ${rotulo}`}
            className="ring-card absolute -right-2 -bottom-2 size-9 rounded-xl ring-4" onClick={() => entrada.current?.click()}>
            <Camera />
          </Button>
          <input ref={entrada} id={id} type="file" accept={TIPOS_ACEITOS.join(',')} aria-label={`Escolher ${rotulo}`} className="sr-only" tabIndex={-1} onChange={escolher} />
        </div>
        {mostrada && (
          <Button type="button" variant="ghost" size="sm" onClick={tirar}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive h-7 px-2 text-rotulo">
            <Trash2 /> Tirar {rotulo}
          </Button>
        )}
        {erro && <p role="alert" className="text-destructive max-w-24 text-center text-rotulo">{erro}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <div style={!mostrada && reservaCor ? { backgroundColor: reservaCor } : undefined}
        className={cn('grid size-16 shrink-0 place-items-center overflow-hidden text-janela font-bold',
          !mostrada && reservaCor ? 'text-white' : 'text-muted-foreground',
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
        <p className="text-rotulo text-muted-foreground">PNG, JPG ou WebP, até 10 MB.</p>
        {erro && <p role="alert" className="text-rotulo text-destructive">{erro}</p>}
      </div>
    </div>
  )
}
