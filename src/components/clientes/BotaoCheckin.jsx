import { LogIn, LogOut } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fazerCheckin, fazerCheckout } from '@/data/checkins'
import { formatarDuracao } from '@/lib/horas'
import JanelaCheckin from './JanelaCheckin'

// "Fazer check-in" no cliente; se o check-in aberto é deste cliente vira "Fazer check-out · 1 h 05"
// (o tempo atualiza a cada 30 s, só na tela). Com outro cliente aberto, fica desabilitado.
// Quem usa deve passar key={aberto?.id} para o relógio recomeçar quando o check-in aberto muda.
// aoMudar() é chamado depois de um check-in ou check-out feito, para a tela recarregar.
export default function BotaoCheckin({ cliente, aberto, aoMudar }) {
  const [agora, setAgora] = useState(() => Date.now())
  const [saindo, setSaindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const idDaDica = useId()
  const esteAberto = aberto?.cliente_id === cliente.id

  useEffect(() => {
    if (!esteAberto) return undefined
    const tique = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(tique)
  }, [esteAberto])

  async function entrar() {
    setEnviando(true)
    const { erro } = await fazerCheckin(cliente.id)
    setEnviando(false)
    if (erro) return toast.error(erro)
    toast.success(`Check-in feito em ${cliente.nome}.`)
    aoMudar()
  }

  async function sair({ descricao }) {
    const resposta = await fazerCheckout(aberto.id, descricao)
    if (!resposta.erro) {
      toast.success(`Check-out feito em ${cliente.nome}.`)
      aoMudar()
    }
    return resposta
  }

  if (esteAberto) {
    const tempo = formatarDuracao(agora - new Date(aberto.inicio).getTime())
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setSaindo(true)}><LogOut /> Fazer check-out · {tempo}</Button>
        {saindo && (
          <JanelaCheckin aberto modo="checkout" nomeDoCliente={cliente.nome} aoFechar={() => setSaindo(false)} aoSalvar={sair} />
        )}
      </>
    )
  }

  const emOutro = Boolean(aberto)
  // O botão desabilitado não recebe mouse nem foco, então o motivo fica escrito ao lado e ligado a ele.
  const dica = emOutro ? `Check-in aberto em ${aberto.cliente?.nome ?? 'outro cliente'}. Faça o check-out primeiro.` : null
  return (
    <span className="inline-flex flex-col items-end align-middle">
      <Button variant="ghost" size="sm" disabled={emOutro || enviando} onClick={entrar} aria-describedby={dica ? idDaDica : undefined}>
        <LogIn /> Fazer check-in
      </Button>
      {dica && <span id={idDaDica} className="max-w-48 whitespace-normal text-right text-xs text-muted-foreground">{dica}</span>}
    </span>
  )
}
