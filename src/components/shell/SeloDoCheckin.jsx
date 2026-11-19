import { LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import JanelaCheckin from '@/components/clientes/JanelaCheckin'
import { Button } from '@/components/ui/button'
import { fazerCheckout } from '@/data/checkins'
import { formatarDuracao } from '@/lib/horas'

// "Check-in aberto · Provedor X · 1 h 05" (leva ao cliente) e "Fazer check-out", na barra de cima de qualquer tela. O tempo
// anda a cada 30 s, como o do botão do cliente. No celular fica o nome e o tempo, e o check-out só com o ícone.
// Quem usa passa key={aberto.id}.
export default function SeloDoCheckin({ aberto }) {
  const [agora, setAgora] = useState(() => Date.now())
  const [saindo, setSaindo] = useState(false)
  const nome = aberto.cliente?.nome ?? 'cliente'
  const tempo = formatarDuracao(agora - new Date(aberto.inicio).getTime())
  const rotulo = `Check-in aberto · ${nome} · ${tempo}`

  useEffect(() => {
    const tique = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(tique)
  }, [])

  // O selo some sozinho: o check-out avisa que o check-in mudou e a moldura relê.
  async function sair(dados) {
    const resposta = await fazerCheckout(aberto.id, dados)
    if (!resposta.erro) toast.success(`Check-out feito em ${nome}.`)
    return resposta
  }

  return (
    <div className="flex min-w-0 items-center gap-2 max-sm:flex-1">
      <Link to={`/clientes/${aberto.cliente_id}`} aria-label={rotulo} title={rotulo}
        className="botao-animado flex min-w-0 items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1 text-rotulo font-semibold text-positive outline-none transition-[translate,scale,box-shadow] hover:-translate-y-px hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] max-sm:flex-1 pointer-coarse:min-h-11">
        <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-positive" />
        <span className="shrink-0 max-sm:hidden">Check-in aberto ·</span>
        <span className="min-w-0 truncate">{nome}</span>
        <span className="shrink-0 tabular-nums">· {tempo}</span>
      </Link>
      <Button variant="outline" size="sm" onClick={() => setSaindo(true)} title={`Fazer check-out de ${nome}`}>
        <LogOut aria-hidden="true" /> <span className="max-sm:sr-only">Fazer check-out</span>
      </Button>
      {saindo && (
        <JanelaCheckin aberto modo="checkout" nomeDoCliente={nome} checkin={aberto} aoFechar={() => setSaindo(false)} aoSalvar={sair} />
      )}
    </div>
  )
}
