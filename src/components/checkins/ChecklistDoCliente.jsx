import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, CalendarClock, CheckCheck, Eye, ListOrdered, ShieldCheck, TriangleAlert, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import BarraDeFiltros from '@/components/comum/BarraDeFiltros'
import { GraficoCarregando } from '@/components/comum/Carregando'
import CartoesDeNumeros from '@/components/comum/CartoesDeNumeros'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { anotarTarefa, lerChecklist, marcarTarefa, tirarModelo } from '@/data/checklists'
import { formatarDia, hoje as hojeEmSP } from '@/lib/mes'
import { juntar } from '@/lib/nomes'
import CartaoDoModelo from './CartaoDoModelo'
import Fluxograma, { LegendaDoFluxo } from './Fluxograma'
import JanelaAplicarModelo from './JanelaAplicarModelo'
import JanelaDaTarefa from './JanelaDaTarefa'
import JanelaInicioDosPrazos from './JanelaInicioDosPrazos'
import ListaDoChecklist from './ListaDoChecklist'
import PainelDaSessao from './PainelDaSessao'
import { ehCelular } from './fluxo'
import { quandoVence, resumoDaSituacao, rotuloDaSituacao, situacaoDaTarefa } from './situacao'

const VISOES = [{ valor: 'lista', rotulo: 'Lista', icone: ListOrdered }, { valor: 'fluxo', rotulo: 'Fluxograma', icone: Workflow }]
const ORIENTACOES = [{ valor: 'deitado', rotulo: 'Deitado', icone: ArrowRight }, { valor: 'em-pe', rotulo: 'Em pé', icone: ArrowDown }]

// O aviso depois de mudar a situação de uma tarefa: o que liberou e se ela entrou no check-in aberto.
function avisoDaMarcacao(tarefa, estado, resposta) {
  if (estado === 'andamento') return `${tarefa.titulo} em andamento.`
  if (estado === 'a_fazer') return `${tarefa.titulo} voltou para a fazer.`
  const liberadas = resposta.liberadas?.length ? ` Agora dá para fazer: ${juntar(resposta.liberadas.map((t) => t.titulo))}.` : ''
  const sessao = resposta.na_sessao ? ' Entrou no resumo deste check-in.' : ' Sem check-in aberto neste cliente: fica feita, fora de uma sessão.'
  return `${tarefa.titulo} feita.${liberadas}${sessao}`
}

// A releitura traz objetos novos para todas as tarefas; as que não mudaram ficam com o objeto de antes, para a lista
// (memorizada por item) só redesenhar o que mudou.
function estabilizar(antes, lido) {
  if (!antes?.tarefas || !lido?.tarefas) return lido
  const velhas = new Map(antes.tarefas.map((t) => [t.id, t]))
  const tarefas = lido.tarefas.map((t) => {
    const velha = velhas.get(t.id)
    return velha && JSON.stringify(velha) === JSON.stringify(t) ? velha : t
  })
  return { ...lido, tarefas }
}

// Por que a caixa do modelo não tem "Aplicar modelo" (para quem não aplica).
function semModeloPorque(cliente) {
  if (cliente.arquivado) return 'Cliente arquivado: reative o cliente para aplicar um modelo.'
  if (!cliente.consultoria_id) return 'Mande o cliente para uma consultoria antes de aplicar um modelo.'
  return 'A gestão aplica o modelo. Enquanto isso, o check-in funciona como hoje.'
}

// Para quem vê as tarefas mas não marca: por quê, e quem marca.
function avisoDeQuemAcompanha(cliente, consultor) {
  if (cliente.arquivado) return 'Este cliente está arquivado: o check-list fica só para ler.'
  if (!consultor) return 'Ninguém marca as tarefas até a consultoria escolher o consultor do cliente.'
  if (!consultor.nome) return 'Você acompanha o andamento. Quem marca as tarefas é o consultor do cliente.'
  return `Você acompanha o andamento. Quem marca as tarefas é ${consultor.nome}, o consultor do cliente.`
}

// O check-list do cliente na aba Check-ins (em cima da tabela de check-ins), numa leitura do banco (checklist_do_cliente).
// Com modelo: barra (Lista/Fluxograma, Todas/Pendentes/Feitas, Deitado/Em pé, a próxima tarefa) → cartões "Andamento do
// check-list" (contados no banco) → caixas Modelo aplicado e Check-in → aviso para quem só acompanha → lista por etapa
// ou fluxograma. Sem modelo: a caixa do modelo (Aplicar modelo para quem aplica) e a caixa Check-in.
// Filtro e orientação rodam na tela (o check-list já veio inteiro; exceção aprovada pelo Diego em 17/11); no celular o
// fluxograma começa em pé. Marcar pela caixa é otimista (se o banco recusar, volta e avisa); pela janela da tarefa, grava
// e fecha. Toda mudança relê o check-list e chama `aoMudar` (o recarregar da página: o botão de check-in, a sessão e a
// tabela andam juntos). `versao` muda quando a página recarrega. Quem faz o quê vem do banco (pode_aplicar, pode_marcar).
export default function ChecklistDoCliente({ cliente, perfil, versao, aoMudar, checkinAberto = null }) {
  const [dados, setDados] = useState(undefined) // undefined = carregando; null = não vê o cliente
  const [erro, setErro] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [visao, setVisao] = useState('lista')
  const [filtro, setFiltro] = useState('todas')
  const [vertical, setVertical] = useState(ehCelular)
  const [otimista, setOtimista] = useState({}) // estado mostrado antes de o banco responder, por tarefa
  const [ocupadas, setOcupadas] = useState(() => new Set())
  const [janela, setJanela] = useState(null)
  const indo = useRef(new Set()) // marcações a caminho do banco (a leitura não apaga o otimista delas)
  const jaLeu = useRef(false)
  const aoMudarAtual = useRef(aoMudar)
  const idTitulo = useId()

  useEffect(() => {
    aoMudarAtual.current = aoMudar
  }, [aoMudar])

  useEffect(() => {
    let ativo = true
    lerChecklist(cliente.id).then(
      (lido) => {
        if (!ativo) return
        jaLeu.current = true
        setDados((antes) => estabilizar(antes, lido ?? null))
        setErro(null)
        setOtimista((antes) => Object.fromEntries(Object.entries(antes).filter(([id]) => indo.current.has(id))))
      },
      () => {
        if (!ativo) return
        // Só a primeira leitura troca a aba pelo erro; depois, o check-list que está na tela fica e um aviso pede atualizar.
        if (jaLeu.current) toast.error('Não foi possível atualizar o check-list. Atualize a página para ver o de agora.')
        else setErro('Não foi possível carregar o check-list.')
      },
    )
    return () => {
      ativo = false
    }
  }, [cliente.id, versao, recarga])

  const tarefas = useMemo(
    () => (dados?.tarefas ?? []).map((t) => (otimista[t.id] ? { ...t, estado: otimista[t.id] } : t)),
    [dados, otimista],
  )
  const dia = hojeEmSP()
  const situacoes = useMemo(() => {
    const porId = new Map(tarefas.map((t) => [t.id, t]))
    return new Map(tarefas.map((t) => [t.id, situacaoDaTarefa(t, porId, dia)]))
  }, [tarefas, dia])

  // Funções estáveis (o memo dos itens da lista depende disso): relê o check-list e avisa a página.
  const mudou = useCallback(() => {
    setRecarga((n) => n + 1)
    aoMudarAtual.current?.()
  }, [])

  const ocupar = useCallback((id, sim) => {
    if (sim) indo.current.add(id)
    else indo.current.delete(id)
    setOcupadas(new Set(indo.current))
  }, [])

  // Pela caixa: na hora (otimista). Recusa: volta e avisa; se a tela ficou velha (check-list trocado ou tirado, outro
  // consultor, cliente arquivado…), relê a aba e a página.
  const marcar = useCallback(async (tarefa, estado) => {
    if (indo.current.has(tarefa.id)) return
    ocupar(tarefa.id, true)
    setOtimista((antes) => ({ ...antes, [tarefa.id]: estado }))
    const resposta = await marcarTarefa(tarefa.id, estado)
    ocupar(tarefa.id, false)
    if (resposta.erro) {
      setOtimista((antes) => {
        const resto = { ...antes }
        delete resto[tarefa.id]
        return resto
      })
      toast.error(resposta.erro)
      if (resposta.desatualizado) mudou()
      return
    }
    toast.success(avisoDaMarcacao(tarefa, estado, resposta))
    mudou()
  }, [mudou, ocupar])

  const abrirTarefa = useCallback((t) => setJanela({ tipo: 'tarefa', id: t.id }), [])

  // Pela janela da tarefa: a nota (se mudou) e depois a situação (se pediu). { erro } fica na janela; recusa de tela
  // velha fecha a janela, avisa e relê (a tarefa pode nem estar mais na aba).
  async function agir(tarefa, { estado, nota }) {
    const recusou = (resposta) => {
      if (!resposta.desatualizado) return resposta
      toast.error(resposta.erro)
      mudou()
      return { erro: null }
    }
    const notaNova = nota?.trim() ?? ''
    const mudouNota = nota !== undefined && notaNova !== (tarefa.nota ?? '')
    if (mudouNota) {
      const resposta = await anotarTarefa(tarefa.id, notaNova)
      if (resposta.erro) return recusou(resposta)
    }
    if (estado) {
      const resposta = await marcarTarefa(tarefa.id, estado)
      if (resposta.erro) {
        if (mudouNota && !resposta.desatualizado) mudou()
        return recusou(resposta)
      }
      toast.success(avisoDaMarcacao(tarefa, estado, resposta))
    } else if (mudouNota) {
      toast.success('Nota salva.')
    }
    if (estado || mudouNota) mudou()
    return { erro: null }
  }

  if (erro) return <p role="alert" className="text-corpo text-destructive">{erro}</p>
  if (dados === undefined) return <GraficoCarregando texto="Carregando o check-list…" className="py-8" />
  if (dados === null) return null

  const { checklist, resumo } = dados
  const fechar = () => setJanela(null)
  const souConsultor = Boolean(dados.consultor && dados.consultor.id === perfil?.id && !cliente.arquivado)
  const emOutroCliente = souConsultor && checkinAberto && checkinAberto.cliente_id !== cliente.id
    ? { nome: checkinAberto.cliente?.nome, inicio: checkinAberto.inicio }
    : null
  const titulo = <h2 id={idTitulo} className="sr-only">Check-list do cliente</h2>
  const caixas = (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <CartaoDoModelo checklist={checklist} resumo={resumo} podeAplicar={dados.pode_aplicar} semModelo={semModeloPorque(cliente)}
        aoAplicar={() => setJanela({ tipo: 'aplicar' })} aoMudarInicio={() => setJanela({ tipo: 'inicio' })}
        aoTirar={() => setJanela({ tipo: 'tirar' })} />
      <PainelDaSessao key={dados.sessao?.checkin_id ?? 'sem-sessao'} sessao={dados.sessao} ultimo={dados.ultimo_checkin}
        souConsultor={souConsultor} comChecklist={Boolean(checklist)} emOutroCliente={emOutroCliente} />
    </div>
  )
  const janelaDeAplicar = janela?.tipo === 'aplicar' && (
    <JanelaAplicarModelo cliente={{ ...cliente, consultor: dados.consultor ?? cliente.consultor }}
      checklist={checklist ? { ...checklist, tarefas: resumo.tarefas, feitas: resumo.feitas } : null}
      aoFechar={fechar}
      aoAplicar={({ modelo }) => {
        toast.success(checklist
          ? `Modelo trocado para "${modelo.nome}". O check-list começa do zero.`
          : `"${modelo.nome}" aplicado em ${cliente.nome}.`)
        mudou()
      }} />
  )

  if (!checklist) {
    return (
      <section aria-labelledby={idTitulo} className="grid min-w-0 grid-cols-1 gap-4">
        {titulo}
        {caixas}
        {janelaDeAplicar}
      </section>
    )
  }

  const pct = resumo.tarefas ? Math.round((resumo.feitas / resumo.tarefas) * 100) : 0
  const tarefaAberta = janela?.tipo === 'tarefa' ? tarefas.find((t) => t.id === janela.id) : null
  const apagada = (t) => (filtro === 'pendentes' && t.estado === 'feita') || (filtro === 'feitas' && t.estado !== 'feita')
  const infoNoFluxo = (t) => {
    const s = situacoes.get(t.id)
    return { cor: s.cor, sub: resumoDaSituacao(t, s), rotulo: rotuloDaSituacao(t, s), apagado: apagada(t) }
  }
  const proxima = resumo.proxima
  const quemAcompanha = !dados.pode_marcar && avisoDeQuemAcompanha(cliente, dados.consultor)

  return (
    <section aria-labelledby={idTitulo} className="grid min-w-0 grid-cols-1 gap-4">
      {titulo}
      <BarraDeFiltros className="mb-0">
        <AbasSegmentadas rotulo="Visualização" abas={VISOES} valor={visao} aoMudar={setVisao} />
        <AbasSegmentadas rotulo="Mostrar" valor={filtro} aoMudar={setFiltro} abas={[
          { valor: 'todas', rotulo: 'Todas', contador: resumo.tarefas },
          { valor: 'pendentes', rotulo: 'Pendentes', contador: resumo.tarefas - resumo.feitas, pendente: resumo.atrasadas > 0 },
          { valor: 'feitas', rotulo: 'Feitas', contador: resumo.feitas },
        ]} />
        {visao === 'fluxo' && (
          <AbasSegmentadas rotulo="Orientação do fluxograma" abas={ORIENTACOES} valor={vertical ? 'em-pe' : 'deitado'}
            aoMudar={(valor) => setVertical(valor === 'em-pe')} />
        )}
        <p className="text-muted-foreground min-w-0 text-rotulo sm:ml-auto">
          {proxima
            ? <>Próxima: <strong className="text-foreground font-semibold">{proxima.titulo}</strong> · {quandoVence(proxima.vence_em, dia)}</>
            : 'Tudo feito.'}
        </p>
      </BarraDeFiltros>
      <CartoesDeNumeros rotulo="Andamento do check-list" className="mb-0" cartoes={[
        { chave: 'feitas', rotulo: 'Tarefas feitas', icone: CheckCheck, tom: 'positivo', valor: resumo.feitas,
          detalhe: `de ${resumo.tarefas.toLocaleString('pt-BR')} · ${pct}%` },
        { chave: 'obrigatorias', rotulo: 'Obrigatórias feitas', icone: ShieldCheck, valor: resumo.obrigatorias_feitas,
          detalhe: `de ${resumo.obrigatorias.toLocaleString('pt-BR')}` },
        { chave: 'vencem', rotulo: 'Vencem em 7 dias', icone: CalendarClock, tom: 'aviso', valor: resumo.vencem_7_dias,
          destaque: resumo.vencem_7_dias ? 'atencao' : undefined },
        { chave: 'atrasadas', rotulo: 'Atrasadas', icone: TriangleAlert, tom: 'perigo', valor: resumo.atrasadas,
          destaque: resumo.atrasadas ? 'perigo' : undefined },
      ]} />
      {caixas}
      {quemAcompanha && (
        <p className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-xl border px-3 py-2 text-rotulo">
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{quemAcompanha}</span>
        </p>
      )}
      {visao === 'lista' ? (
        <ListaDoChecklist etapas={dados.etapas} tarefas={tarefas} situacoes={situacoes} filtro={filtro} podeMarcar={dados.pode_marcar}
          ocupadas={ocupadas} aoMarcar={marcar} aoAbrir={abrirTarefa} />
      ) : (
        <section aria-label="Fluxograma" className="card min-w-0 overflow-hidden">
          <Fluxograma etapas={dados.etapas} tarefas={tarefas} vertical={vertical} infoDaTarefa={infoNoFluxo}
            selecionada={tarefaAberta?.id ?? null} aoEscolher={abrirTarefa} rotulo={`Fluxograma das tarefas de ${cliente.nome}`}
            contagemDaEtapa={(_etapa, daEtapa) => `${daEtapa.filter((t) => t.estado === 'feita').length} de ${daEtapa.length} feitas`} />
          <LegendaDoFluxo dica={`Clique numa tarefa para ${dados.pode_marcar ? 'ver os detalhes e marcar' : 'ver os detalhes'}. Arraste o quadro para os lados.`} />
        </section>
      )}

      {tarefaAberta && (
        <JanelaDaTarefa key={tarefaAberta.id} tarefa={tarefaAberta} etapas={dados.etapas} tarefas={tarefas} situacoes={situacoes}
          nomeDoCliente={cliente.nome} inicio={checklist.inicio} podeMarcar={dados.pode_marcar}
          aoAgir={(pedido) => agir(tarefaAberta, pedido)} aoAbrir={abrirTarefa} aoFechar={fechar} />
      )}
      {janelaDeAplicar}
      {janela?.tipo === 'inicio' && (
        <JanelaInicioDosPrazos checklist={checklist} tarefas={tarefas} proximaId={proxima?.id} aoFechar={fechar}
          aoSalvar={(inicio) => {
            toast.success(`Os prazos agora contam de ${formatarDia(inicio)}.`)
            mudou()
          }} />
      )}
      {janela?.tipo === 'tirar' && (
        <ConfirmarAcao aberto aoFechar={fechar} titulo={`Tirar "${checklist.modelo_nome}" de ${cliente.nome}?`}
          descricao={`O check-list sai da aba (${resumo.feitas} de ${resumo.tarefas} feitas). O que foi feito continua nos check-ins e no Histórico.`}
          rotuloConfirmar="Tirar modelo"
          aoConfirmar={async () => {
            const resposta = await tirarModelo(checklist.id)
            if (!resposta.erro) {
              toast.success(`"${checklist.modelo_nome}" saiu de ${cliente.nome}. O que foi feito continua nos check-ins e no Histórico.`)
              mudou()
            }
            return resposta
          }} />
      )}
    </section>
  )
}
