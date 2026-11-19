import { LogIn, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { avisar } from '@/components/comum/avisar'
import { Button } from '@/components/ui/button'
import { apagarCheckin, fazerCheckin, fazerCheckout } from '@/data/checkins'
import { aoMudarOCheckin } from '@/lib/checkinMudou'
import { formatarDuracao } from '@/lib/horas'
import { estiloDaAcao } from './estiloDaAcao'
import JanelaCheckin from './JanelaCheckin'

// "Fazer check-in" no cliente; se o check-in aberto é deste cliente vira "Fazer check-out · 1 h 05"
// (o tempo atualiza a cada 30 s, só na tela). Com outro cliente aberto, fica desabilitado.
// Quem usa deve passar key={aberto?.id} para o relógio recomeçar quando o check-in aberto muda.
// idDoAviso: id do aviso da tela (check-in aberto em outro cliente) que explica o botão desabilitado.
// aoMudar() é chamado depois de um check-in ou check-out feito (ou desfeito), para a tela recarregar; também quando um
// check-in muda em outra parte do app (o selo da barra de cima, a aba Check-ins), para a tela do botão não ficar velha
// (auditoria, G2). Várias chamadas juntas viram uma releitura só (o recarregar das telas só muda a versão).
// Enquanto grava, "Fazendo check-in…"; o aviso do check-in traz "Desfazer" (apaga o check-in recém-feito, como o Apagar da
// aba Check-ins) e "Ver cliente"; o tempo esgotado no banco traz "Tentar de novo" (usabilidade, U3 e U11).
// compacto: só o ícone (em cada barra do Início do consultor), com o nome do cliente no aria-label e no title: "Fazer
// check-in em Conecta Fibra" ou "Fazer check-out de Conecta Fibra · 1 h 05" (este cheio, para se ver qual está aberto).
export default function BotaoCheckin({ cliente, aberto, aoMudar, idDoAviso, noCabecalho = false, compacto = false }) {
  const [agora, setAgora] = useState(() => Date.now())
  const [saindo, setSaindo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const esteAberto = aberto?.cliente_id === cliente.id

  useEffect(() => aoMudarOCheckin(() => aoMudar?.()), [aoMudar])

  useEffect(() => {
    if (!esteAberto) return undefined
    const tique = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(tique)
  }, [esteAberto])

  async function entrar() {
    setEnviando(true)
    const resposta = await fazerCheckin(cliente.id)
    setEnviando(false)
    if (resposta.tempoEsgotado) return avisar(resposta.erro, { erro: true, acoes: [{ rotulo: 'Tentar de novo', aoClicar: entrar }] })
    if (resposta.erro) return toast.error(resposta.erro)
    avisar(`Check-in feito em ${cliente.nome}.`, {
      acoes: [{ rotulo: 'Desfazer', aoClicar: () => desfazer(resposta.id) }, { rotulo: 'Ver cliente', para: `/clientes/${cliente.id}` }],
    })
    aoMudar()
  }

  async function desfazer(id) {
    const { erro } = await apagarCheckin(id)
    if (erro) return toast.error(erro)
    toast.success(`Check-in desfeito em ${cliente.nome}.`)
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
        {compacto ? (
          <Button size="icon" onClick={() => setSaindo(true)} aria-label={`Fazer check-out de ${cliente.nome} · ${tempo}`}
            title={`Fazer check-out de ${cliente.nome} · ${tempo}`}><LogOut aria-hidden="true" /></Button>
        ) : <Button {...estiloDaAcao(noCabecalho, true)} onClick={() => setSaindo(true)}><LogOut /> Fazer check-out · {tempo}</Button>}
        {saindo && (
          <JanelaCheckin aberto modo="checkout" nomeDoCliente={cliente.nome} checkin={aberto}
            aoFechar={() => setSaindo(false)} aoSalvar={sair} />
        )}
      </>
    )
  }

  const emOutro = Boolean(aberto)
  // Desabilitado não recebe mouse nem foco: o motivo é o aviso único da tela, ligado ao botão.
  if (compacto) {
    return (
      <Button variant="ghost" size="icon" disabled={emOutro || enviando} onClick={entrar} aria-describedby={emOutro ? idDoAviso : undefined}
        aria-label={`${enviando ? 'Fazendo' : 'Fazer'} check-in em ${cliente.nome}${enviando ? '…' : ''}`}
        title={`Fazer check-in em ${cliente.nome}`}><LogIn aria-hidden="true" /></Button>
    )
  }
  return (
    <Button {...estiloDaAcao(noCabecalho, true)} disabled={emOutro || enviando} onClick={entrar} aria-describedby={emOutro ? idDoAviso : undefined}>
      <LogIn /> {enviando ? 'Fazendo check-in…' : 'Fazer check-in'}
    </Button>
  )
}
