import { iniciais } from '@/lib/nomes'
import { cn } from '@/lib/utils'

const CORES = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#475569', '#ca8a04']

function corDe(chave = '') {
  let soma = 0
  for (const letra of chave) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0
  return CORES[soma % CORES.length]
}

export default function Avatar({ pessoa, className }) {
  return (
    <span
      title={pessoa.nome}
      style={{ backgroundColor: corDe(pessoa.id) }}
      className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ring-2 ring-card', className)}
    >
      {iniciais(pessoa.nome)}
    </span>
  )
}
