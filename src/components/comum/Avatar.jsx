import { useState } from 'react'
import { urlPublica } from '@/lib/imagem'
import { corDaPessoa } from '@/lib/cores'
import { iniciais } from '@/lib/nomes'
import { cn } from '@/lib/utils'

// Foto da pessoa; sem foto (ou se ela não carregar), as iniciais na cor que a pessoa escolheu (ou numa cor automática por pessoa).
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
  return (
    <span title={pessoa.nome} style={{ backgroundColor: corDaPessoa(pessoa) }}
      className={cn(base, 'grid place-items-center text-[10px] font-bold text-white', className)}>
      {iniciais(pessoa.nome)}
    </span>
  )
}
