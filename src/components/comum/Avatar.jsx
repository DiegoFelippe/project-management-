import { useState } from 'react'
import { urlPublica } from '@/lib/imagem'
import { iniciais } from '@/lib/nomes'
import { cn } from '@/lib/utils'

const CORES = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#475569', '#ca8a04']

function corDe(chave = '') {
  let soma = 0
  for (const letra of chave) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0
  return CORES[soma % CORES.length]
}

// Foto da pessoa; sem foto (ou se ela não carregar), as iniciais numa cor fixa por pessoa.
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
    <span title={pessoa.nome} style={{ backgroundColor: corDe(pessoa.id) }}
      className={cn(base, 'grid place-items-center text-[10px] font-bold text-white', className)}>
      {iniciais(pessoa.nome)}
    </span>
  )
}
