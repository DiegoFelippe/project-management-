import { useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { marcarFavorito } from '@/data/quadros'
import { cn } from '@/lib/utils'

// A estrela do quadro aberto (cabeçalho da tela Quadros): botão de alternância (aria-pressed) que marca ou desmarca o
// favorito de quem está logado (tabela quadro_favoritos; o favorito não tem o que editar). Acende na hora; o banco
// recusou, volta e diz por quê. Depois de gravar (ou da recusa), `aoMudar()` para quem chama reler o quadro.
export default function EstrelaDoQuadro({ quadro, aoMudar }) {
  // O que a pessoa acabou de escolher, valendo enquanto o quadro (relido) ainda traz o favorito de antes.
  const [escolha, setEscolha] = useState(null) // { de, para }
  const gravando = useRef(false)
  const doBanco = Boolean(quadro.favorito)
  const ligada = escolha && escolha.de === doBanco ? escolha.para : doBanco

  async function alternar() {
    if (gravando.current) return
    gravando.current = true
    const para = !ligada
    setEscolha({ de: doBanco, para })
    const { erro } = await marcarFavorito(quadro.id, para)
    gravando.current = false
    if (erro) {
      setEscolha(null)
      toast.error(erro)
    }
    aoMudar()
  }

  return (
    <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Favorito" aria-pressed={ligada}
      title={ligada ? 'Tirar dos favoritos' : 'Marcar como favorito'} onClick={alternar}>
      <Star className={cn(ligada && 'fill-current text-notice')} />
    </Button>
  )
}
