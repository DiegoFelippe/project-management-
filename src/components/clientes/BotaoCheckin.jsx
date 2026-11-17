import { LogIn, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fazerCheckin, fazerCheckout } from '@/data/checkins'
import { formatarDuracao } from '@/lib/horas'
import { estiloDaAcao } from './estiloDaAcao'
import JanelaCheckin from './JanelaCheckin'

// "Fazer check-in" no cliente; se o check-in aberto é deste cliente vira "Fazer check-out · 1 h 05"
// (o tempo atualiza a cada 30 s, só na tela). Com outro cliente aberto, fica desabilitado.
// Quem usa deve passar key={aberto?.id} para o relógio recomeçar quando o check-in aberto muda.
// idDoAviso: id do aviso da tela (check-in aberto em outro cliente) que explica o botão desabilitado.
// aoMudar() é chamado depois de um check-in ou check-out feito, para a tela recarregar.
export default function BotaoCheckin({ cliente, aberto, aoMudar, idDoAviso, noCabecalho = false }) {
  const [agora, setAgora] = useState(() => Date.now())
  const [saindo, setSaindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
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

  async function sair(dados) {
    const resposta = await fazerCheckout(aberto.id, dados)
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
        <Button {...estiloDaAcao(noCabecalho, true)} onClick={() => setSaindo(true)}><LogOut /> Fazer check-out · {tempo}</Button>
        {saindo && (
          <JanelaCheckin aberto modo="checkout" nomeDoCliente={cliente.nome} checkin={aberto}
            aoFechar={() => setSaindo(false)} aoSalvar={sair} />
        )}
      </>
    )
  }

  const emOutro = Boolean(aberto)
  // Desabilitado não recebe mouse nem foco: o motivo é o aviso único da tela, ligado ao botão.
  return (
    <Button {...estiloDaAcao(noCabecalho, true)} disabled={emOutro || enviando} onClick={entrar} aria-describedby={emOutro ? idDoAviso : undefined}>
      <LogIn /> Fazer check-in
    </Button>
  )
}
