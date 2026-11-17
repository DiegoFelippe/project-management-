import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'

// "+ Nova coluna" no fim do quadro, como no Mochi: o botão vira um campo; Enter (ou sair do campo) cria no fim, Esc
// desiste. `aoCriar(nome)` devolve { erro } (o aviso fica com quem chama; o campo continua para tentar de novo).
export default function NovaColuna({ aoCriar }) {
  const [aberta, setAberta] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const desistiu = useRef(false)

  async function terminar() {
    const limpo = nome.trim()
    if (desistiu.current || !limpo) {
      desistiu.current = false
      setNome('')
      setAberta(false)
      return
    }
    setSalvando(true)
    const resposta = await aoCriar(limpo)
    setSalvando(false)
    if (resposta?.erro) return
    setNome('')
    setAberta(false)
  }

  if (aberta) {
    return (
      <div className="w-[300px] shrink-0 space-y-2 rounded-2xl border bg-muted/60 p-2.5">
        <p className="section-label px-1 pt-1">Nova coluna</p>
        <Input autoFocus aria-label="Nome da nova coluna" placeholder="Nome da coluna" maxLength={60} value={nome} disabled={salvando}
          onChange={(e) => setNome(e.target.value)} onBlur={terminar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              desistiu.current = true
              e.currentTarget.blur()
            }
          }} />
      </div>
    )
  }
  return (
    <button type="button" onClick={() => setAberta(true)}
      className="botao-animado flex w-[300px] shrink-0 items-center justify-center gap-2 self-start rounded-2xl border-2 border-dashed border-foreground/15 py-5 text-corpo font-semibold text-muted-foreground outline-none transition-[color,background-color,border-color,translate,scale] duration-150 hover:-translate-y-px hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.97]">
      <Plus className="size-4" aria-hidden="true" /> Nova coluna
    </button>
  )
}
