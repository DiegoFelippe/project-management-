import { useState } from 'react'
import { urlPublica } from '@/lib/imagem'
import { corDaPessoa, corDoTextoSobre } from '@/lib/cores'
import { iniciais } from '@/lib/nomes'
import { cn } from '@/lib/utils'

// Foto da pessoa; sem foto (ou se ela não carregar), as iniciais na cor que a pessoa escolheu (ou numa cor automática por pessoa),
// em branco ou, nas cores claras, em escuro (contraste de 4,5:1).
export default function Avatar({ pessoa, className }) {
  const [quebrada, setQuebrada] = useState(null)
  const url = urlPublica('fotos', pessoa.foto)
  const base = 'size-7 shrink-0 rounded-full ring-2 ring-card'

  if (url && url !== quebrada) {
    return (
      <img src={url} alt={pessoa.nome} title={pessoa.nome} loading="lazy" decoding="async"
        className={cn(base, 'bg-muted object-cover', className)} onError={() => setQuebrada(url)} />
    )
  }
  const cor = corDaPessoa(pessoa)
  return (
    <span title={pessoa.nome} style={{ backgroundColor: cor, color: corDoTextoSobre(cor) }}
      className={cn(base, 'grid place-items-center text-mini font-bold', className)}>
      {iniciais(pessoa.nome)}
    </span>
  )
}
