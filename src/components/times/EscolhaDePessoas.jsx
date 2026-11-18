import { X } from 'lucide-react'
import { useMemo } from 'react'
import { buscarComoOpcoes } from '@/components/campos/opcoesDePessoa'
import Seletor from '@/components/campos/Seletor'
import Avatar from '@/components/comum/Avatar'
import { Button } from '@/components/ui/button'

const resumo = (n) => (n === 1 ? '1 pessoa escolhida' : `${n} pessoas escolhidas`)

// Várias pessoas de uma vez (usabilidade, U7): o Seletor com busca no banco no modo `multiplo` (a lista fica aberta e
// cada clique marca ou desmarca) e, embaixo, as escolhidas com o nome e "Tirar". `escolhidas`: [pessoa { id, nome,
// email?, foto?, cor? }]; `buscar(termo)` devolve { itens: [pessoa], total }, já sem quem não pode entrar (quem está no
// time, o gestor). `children` fica ao lado do campo (ex.: o botão "Colocar no time"); o rótulo (Label htmlFor=id) é de
// quem usa.
export default function EscolhaDePessoas({ id, escolhidas, aoMudar, buscar, children }) {
  const buscarOpcoes = useMemo(() => buscarComoOpcoes(buscar), [buscar])
  const alternar = (_valores, opcao) => aoMudar(escolhidas.some((p) => p.id === opcao.valor)
    ? escolhidas.filter((p) => p.id !== opcao.valor)
    : [...escolhidas, opcao.avatar ?? { id: opcao.valor, nome: opcao.rotulo }])

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <Seletor id={id} multiplo valor={escolhidas.map((p) => p.id)} aoMudar={alternar} buscar={buscarOpcoes}
            placeholder="Buscar pessoa da consultoria" resumo={resumo} />
        </div>
        {children}
      </div>
      {escolhidas.length > 0 && (
        <ul aria-label="Pessoas escolhidas" className="grid gap-1.5">
          {escolhidas.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-1.5">
              <Avatar pessoa={p} className="size-6" />
              <span className="min-w-0 flex-1 truncate text-rotulo font-medium">{p.nome}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Tirar ${p.nome}`} title={`Tirar ${p.nome}`}
                className="hover:bg-destructive/10 hover:text-destructive" onClick={() => aoMudar(escolhidas.filter((e) => e.id !== p.id))}>
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
