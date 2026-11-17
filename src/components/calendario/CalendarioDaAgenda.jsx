import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignLeft, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Loader2, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/useAuth'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import AbasSegmentadas from '@/components/comum/AbasSegmentadas'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import { Button } from '@/components/ui/button'
import {
  ausenciasDoPeriodo, buscarEvento, concluirGoogle, conectarGoogle, desconectarGoogle, eventosDoPeriodo, feriadosDoPeriodo,
  indicadoresDaAgenda, meuGoogle, voltaDoGoogle,
} from '@/data/agenda'
import {
  agruparPorDia, diasEntre, limitesEmSP, navegar, periodoDaVisao, rotuloDoPeriodo, somarDias,
} from '@/lib/calendario'
import { hoje as hojeEmSP } from '@/lib/mes'
import { veTudo } from '@/lib/papeis'
import BarraDoCalendario from './BarraDoCalendario'
import DetalheDoDia from './DetalheDoDia'
import IndicadoresDaAgenda from './IndicadoresDaAgenda'
import JanelaEvento from './JanelaEvento'
import ProximosDias from './ProximosDias'
import VisaoAgenda from './VisaoAgenda'
import VisaoMes from './VisaoMes'
import VisaoSemana from './VisaoSemana'
import { TIPOS, TUDO } from './cores'

const VISOES = [
  { valor: 'mes', rotulo: 'Mês', icone: LayoutGrid },
  { valor: 'semana', rotulo: 'Semana', icone: CalendarDays },
  { valor: 'agenda', rotulo: 'Agenda', icone: AlignLeft },
]
// O que o Google pode pôr no endereço na volta do "Conectar Google" (sai dele depois de lido).
const PARAMETROS_DO_GOOGLE = ['code', 'state', 'scope', 'authuser', 'prompt', 'hd', 'iss', 'error', 'error_description', 'error_uri']
const SEM_FILTRO = { valor: '', nome: null }
// Na agenda do cliente, o "Mostrar" fica com reuniões e feriados: as ausências são das pessoas, não do cliente (design,
// "Agenda dentro do cliente"), e compromisso é evento sem cliente (nunca aparece dentro de um). Com as reuniões, o banco
// recebe tipo 'reunioes' (todo evento do cliente é uma); sem elas, os eventos nem são lidos.
const TIPOS_DO_CLIENTE = TIPOS.filter((t) => t.chave === 'reunioes' || t.chave === 'feriados')
const TUDO_DO_CLIENTE = { ...TUDO, compromissos: false, ausencias: false }

// No celular (abaixo de md) a visão inicial é a Agenda: o mês do Hub não cabe.
const ehCelular = () => typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 768px)').matches

// Leituras do banco (uma chamada cada, só do intervalo pedido; os filtros rodam lá).
const lerEventos = ({ de, ate, consultorId, consultoriaId, clienteId, tipo }) => eventosDoPeriodo({ de, ate, consultorId, consultoriaId, clienteId, tipo })
const lerAusencias = ({ de, ate, consultorId, consultoriaId }) => ausenciasDoPeriodo({ de, ate, consultorId, consultoriaId })
const lerFeriados = ({ de, ate }) => feriadosDoPeriodo(de, ate)
// Sem recorte, só o dia; na agenda do cliente, os números só daquele cliente.
const lerIndicadores = ({ dia, clienteId }) => (clienteId ? indicadoresDaAgenda(dia, { clienteId }) : indicadoresDaAgenda(dia))

// Uma leitura por chave (os parâmetros): muda a chave, lê de novo; parametros null = não lê. Resposta de uma chave
// velha é descartada. Devolve { dados } da chave atual, { erro } ou { carregando }.
function useLeitura(ler, parametros) {
  const chave = parametros ? JSON.stringify(parametros) : null
  const [estado, setEstado] = useState({ chave: null })
  useEffect(() => {
    if (!chave) return undefined
    let ativo = true
    ler(JSON.parse(chave)).then(
      (dados) => ativo && setEstado({ chave, dados }),
      () => ativo && setEstado({ chave, erro: true }),
    )
    return () => {
      ativo = false
    }
  }, [ler, chave])
  return estado.chave === chave ? estado : { carregando: Boolean(chave) }
}

// O "Mostrar" dos eventos vai ao banco: as duas caixas = todos (sem tipo); uma só = aquele tipo; nenhuma = não lê.
function tipoDosEventos(mostrar) {
  if (mostrar.reunioes && mostrar.compromissos) return { ler: true, tipo: undefined }
  if (mostrar.reunioes) return { ler: true, tipo: 'reunioes' }
  return { ler: mostrar.compromissos, tipo: 'compromissos' }
}

// Eventos, ausências e feriados de [de, ate) (dias), com os filtros da barra e o "Mostrar" (tudo no banco; ausências e
// feriados escondidos nem são lidos), agrupados por dia.
function useItensDoPeriodo({ de, ate, filtros, mostrar, versao, ligado = true }) {
  const ultimo = somarDias(ate, -1)
  const { ler, tipo } = tipoDosEventos(mostrar)
  const eventos = useLeitura(lerEventos, ligado && ler ? { ...limitesEmSP(de, ate), ...filtros, tipo, versao } : null)
  const pessoa = { consultorId: filtros.consultorId, consultoriaId: filtros.consultoriaId }
  const ausencias = useLeitura(lerAusencias, ligado && mostrar.ausencias ? { de, ate: ultimo, ...pessoa, versao } : null)
  const feriados = useLeitura(lerFeriados, ligado && mostrar.feriados ? { de, ate: ultimo } : null)
  const porDia = useMemo(() => agruparPorDia({
    dias: diasEntre(de, ate),
    eventos: eventos.dados?.itens ?? [],
    ausencias: ausencias.dados?.itens ?? [],
    feriados: feriados.dados ?? [],
  }), [de, ate, eventos.dados, ausencias.dados, feriados.dados])
  return {
    porDia,
    carregando: eventos.carregando || ausencias.carregando || feriados.carregando,
    erro: eventos.erro || ausencias.erro || feriados.erro,
    haMais: Boolean(eventos.dados?.haMais || ausencias.dados?.haMais),
  }
}

// O calendário, no layout do Hub: barra de filtros, 4 indicadores, Mês/Semana/Agenda e, embaixo, o detalhe do dia e os
// próximos 7 dias. Cada pessoa vê o que o banco deixa (consultor: a própria agenda e os convites; gestão: a da
// consultoria; central: todas). Só o período visível é lido. ?evento=<id> no endereço abre o evento.
// - Sem `cliente`: o menu Calendário. Aqui também termina a conexão do Google da pessoa (o Google volta para
//   /calendario?code=…&state=…).
// - Com `cliente` ({ id, nome, consultoria_id, arquivado, contato_nome, contato_email }, a aba Agenda do cliente): só os
//   eventos daquele cliente e os números só dele; a barra fica sem consultor, consultoria e cliente, e o "Mostrar", só
//   com reuniões e feriados; "Novo evento" já nasce no cliente (travado). Cliente arquivado ou sem consultoria não ganha
//   evento novo.
export default function CalendarioDaAgenda({ cliente = null }) {
  const { perfil } = useAuth()
  const central = veTudo(perfil)
  const gestao = !central && perfil.papel !== 'pessoa'
  const tipos = cliente ? TIPOS_DO_CLIENTE : TIPOS
  const mostrarTudo = cliente ? TUDO_DO_CLIENTE : TUDO
  const podeCriar = !cliente || Boolean(cliente.consultoria_id && !cliente.arquivado)
  const [parametros, setParametros] = useSearchParams()
  const [hoje] = useState(hojeEmSP)
  const [visao, setVisao] = useState(() => (ehCelular() ? 'agenda' : 'mes'))
  const [diaDaVisao, setDiaDaVisao] = useState(hoje)
  const [selecionado, setSelecionado] = useState(hoje)
  const [mostrar, setMostrar] = useState(mostrarTudo)
  const [consultoria, setConsultoria] = useState('')
  const [consultor, setConsultor] = useState(SEM_FILTRO)
  const [clienteDoFiltro, setClienteDoFiltro] = useState(SEM_FILTRO)
  const [versao, setVersao] = useState(0)
  const [janela, setJanela] = useState(null) // { evento } (abrir) | { dia } (novo)
  const [google, setGoogle] = useState(null)
  const [versaoDoGoogle, setVersaoDoGoogle] = useState(0)
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  // A volta do "Conectar Google" chega com a página do menu (o Google recarrega o app em /calendario?code=…&state=…).
  const [volta] = useState(() => (cliente ? null : voltaDoGoogle(parametros)))
  const [avisoDoGoogle, setAvisoDoGoogle] = useState(() => (volta?.recusou
    ? 'Você não autorizou o Google, então nada mudou. Clique em Conectar Google quando quiser.' : null))
  const voltaTratada = useRef(false)
  const recarregar = () => setVersao((v) => v + 1)

  const clienteId = cliente?.id
  const filtros = useMemo(() => ({
    consultorId: consultor.valor || undefined,
    consultoriaId: consultoria || undefined,
    clienteId: clienteId ?? (clienteDoFiltro.valor || undefined),
  }), [consultor.valor, consultoria, clienteId, clienteDoFiltro.valor])
  // Na visão de mais de uma pessoa, a cor do chip é a do consultor (design, "Quem vê o quê").
  const deVariasPessoas = perfil.papel !== 'pessoa' && !consultor.valor
  const temFiltros = Boolean(consultor.valor || consultoria || clienteDoFiltro.valor) || tipos.some((t) => !mostrar[t.chave])

  const periodo = useMemo(() => periodoDaVisao(visao, diaDaVisao, hoje), [visao, diaDaVisao, hoje])
  const doPeriodo = useItensDoPeriodo({ de: periodo.de, ate: periodo.ate, filtros, mostrar, versao })
  // Próximos 7 dias: do mesmo pedido quando o período visível já os cobre; senão, uma leitura só deles.
  const proximos = { de: hoje, ate: somarDias(hoje, 7) }
  const cobre = periodo.de <= proximos.de && periodo.ate >= proximos.ate
  const daSemana = useItensDoPeriodo({ ...proximos, filtros, mostrar, versao, ligado: !cobre })
  const porDiaProximos = cobre ? doPeriodo.porDia : daSemana.porDia
  const indicadores = useLeitura(lerIndicadores, { dia: hoje, clienteId, versao })

  // O dia do detalhe: o clicado, se está no período; senão hoje (ou o primeiro dia do mês/período).
  const diaDoDetalhe = periodo.dias.includes(selecionado) ? selecionado
    : periodo.dias.includes(hoje) ? hoje : visao === 'mes' ? `${diaDaVisao.slice(0, 7)}-01` : periodo.de

  // O meu Google (o selo da barra e o aviso da janela). Central e dono nunca organizam eventos: não leem.
  useEffect(() => {
    if (central) return undefined
    let ativo = true
    meuGoogle()
      .then((g) => ativo && setGoogle(g))
      .catch(() => ativo && setGoogle({ conectado: false, email: null, erro: null }))
    return () => {
      ativo = false
    }
  }, [central, versaoDoGoogle])

  // Volta do "Conectar Google": conclui com o login da pessoa (uma vez só: o pedido é de uso único) e tira o
  // ?code=…&state=… do endereço na hora (history.replaceState, pelo roteador), antes de esperar a resposta.
  useEffect(() => {
    if (!volta || voltaTratada.current) return
    voltaTratada.current = true
    setParametros((anteriores) => {
      const novos = new URLSearchParams(anteriores)
      for (const p of PARAMETROS_DO_GOOGLE) novos.delete(p)
      return novos
    }, { replace: true })
    if (volta.recusou) return
    concluirGoogle(volta)
      .then((r) => {
        if (r.erro) return setAvisoDoGoogle(r.erro)
        setAvisoDoGoogle(null)
        toast.success(`Google conectado: ${r.email}`)
        setVersaoDoGoogle((v) => v + 1)
      })
      .catch(() => setAvisoDoGoogle('Não foi possível concluir a conexão com o Google. Clique em Conectar Google de novo.'))
  }, [volta, setParametros])

  // ?evento=<id> abre o evento (no menu e na aba do cliente) e sai do endereço (o resto dele, como a aba, fica).
  const eventoDoEndereco = parametros.get('evento')
  useEffect(() => {
    if (!eventoDoEndereco) return undefined
    let ativo = true
    buscarEvento(eventoDoEndereco)
      .then((evento) => {
        if (!ativo) return
        if (evento) setJanela({ evento })
        else toast.error('Este evento não existe mais ou você não o vê.')
      })
      .catch(() => ativo && toast.error('Não foi possível abrir o evento.'))
      .finally(() => {
        if (!ativo) return
        setParametros((anteriores) => {
          const novos = new URLSearchParams(anteriores)
          novos.delete('evento')
          return novos
        }, { replace: true })
      })
    return () => {
      ativo = false
    }
  }, [eventoDoEndereco, setParametros])

  async function conectar() {
    setConectando(true)
    let resposta
    try {
      resposta = await conectarGoogle()
    } catch {
      resposta = { erro: 'Não foi possível falar com o Google agora. Tente de novo.' }
    }
    if (resposta.erro) {
      setConectando(false)
      toast.error(resposta.erro)
      return
    }
    window.location.assign(resposta.url)
  }

  async function desconectar() {
    let resposta
    try {
      resposta = await desconectarGoogle()
    } catch {
      resposta = { erro: 'Não foi possível desconectar agora. Tente de novo.' }
    }
    if (resposta.erro) return resposta
    setGoogle({ conectado: false, email: null, erro: null })
    toast.success(resposta.revogado === false ? 'Google desconectado aqui; o Google não confirmou a revogação.' : 'Google desconectado.')
    return resposta
  }

  function mudarVisao(nova) {
    setVisao(nova)
    if (nova !== 'agenda') setDiaDaVisao(diaDoDetalhe)
  }

  function limpar() {
    setMostrar(mostrarTudo)
    setConsultoria('')
    setConsultor(SEM_FILTRO)
    setClienteDoFiltro(SEM_FILTRO)
  }

  const abrir = (evento) => setJanela({ evento })
  const criar = podeCriar ? (dia) => setJanela({ dia }) : undefined
  const fecharJanela = () => setJanela(null)
  const gravou = () => {
    setJanela(null)
    recarregar()
  }

  const rotulo = rotuloDoPeriodo(visao, diaDaVisao)
  const propsDaVisao = {
    dias: periodo.dias, porDia: doPeriodo.porDia, hoje, selecionado: diaDoDetalhe, deVariasPessoas,
    aoSelecionar: setSelecionado, aoCriar: criar, aoAbrir: abrir,
  }

  return (
    <>
      {avisoDoGoogle && (
        <div className="mb-4 flex items-start gap-2">
          <div className="min-w-0 flex-1"><Aviso>{avisoDoGoogle}</Aviso></div>
          <Button type="button" variant="ghost" size="icon" aria-label="Fechar o aviso" onClick={() => setAvisoDoGoogle(null)}><X /></Button>
        </div>
      )}
      <BarraDoCalendario perfil={perfil} central={central} gestao={gestao} doCliente={Boolean(cliente)} tipos={tipos}
        mostrar={mostrar} aoMostrar={setMostrar}
        consultoria={consultoria} aoConsultoria={(id) => { setConsultoria(id); setConsultor(SEM_FILTRO); setClienteDoFiltro(SEM_FILTRO) }}
        consultor={consultor} aoConsultor={setConsultor} cliente={clienteDoFiltro} aoCliente={setClienteDoFiltro} temFiltros={temFiltros} aoLimpar={limpar}
        google={google} conectando={conectando} aoConectar={conectar} aoDesconectar={() => setDesconectando(true)}
        aoNovo={criar && (() => criar(diaDoDetalhe))} />
      <IndicadoresDaAgenda indicadores={indicadores.dados} />
      {doPeriodo.haMais && (
        <p role="status" className="mb-3 text-corpo text-notice">
          Há mais eventos neste período do que o calendário mostra.
          {cliente ? ' Use a visão Semana para ver menos de cada vez.' : ' Use os filtros (consultor, cliente) para ver menos de cada vez.'}
        </p>
      )}
      <div className="space-y-4">
        <section aria-label="Calendário" className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3 sm:px-4">
            {visao !== 'agenda' ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => { setDiaDaVisao(hoje); setSelecionado(hoje) }}>Hoje</Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Período anterior" onClick={() => setDiaDaVisao((d) => navegar(visao, d, -1))}>
                  <ChevronLeft />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Próximo período" onClick={() => setDiaDaVisao((d) => navegar(visao, d, 1))}>
                  <ChevronRight />
                </Button>
                <h2 aria-live="polite" className="ml-1 text-janela font-bold">{rotulo}</h2>
              </>
            ) : (
              <h2 className="text-janela font-bold">{rotulo}</h2>
            )}
            {doPeriodo.carregando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
            <div className="ml-auto">
              <AbasSegmentadas rotulo="Visão do calendário" abas={VISOES} valor={visao} aoMudar={mudarVisao} />
            </div>
          </div>
          <div className="p-2 sm:p-4">
            {doPeriodo.erro && <p role="alert" className="mb-3 text-corpo text-destructive">Não foi possível carregar a agenda. Tente de novo.</p>}
            {visao === 'mes' && <VisaoMes {...propsDaVisao} mes={diaDaVisao.slice(0, 7)} rotulo={rotulo} mostrar={mostrar} />}
            {visao === 'semana' && <VisaoSemana {...propsDaVisao} />}
            {visao === 'agenda' && <VisaoAgenda {...propsDaVisao} />}
          </div>
        </section>
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          <DetalheDoDia dia={diaDoDetalhe} itens={doPeriodo.porDia.get(diaDoDetalhe) ?? []} deVariasPessoas={deVariasPessoas} aoCriar={criar} aoAbrir={abrir} />
          <ProximosDias dias={diasEntre(proximos.de, proximos.ate)} porDia={porDiaProximos} deVariasPessoas={deVariasPessoas}
            aoSelecionar={(dia) => { setSelecionado(dia); if (!periodo.dias.includes(dia)) setDiaDaVisao(dia) }} aoAbrir={abrir} />
        </div>
      </div>
      {janela && (
        <JanelaEvento key={janela.evento?.id ?? `novo-${janela.dia}`} aberto evento={janela.evento ?? null} diaInicial={janela.dia ?? hoje}
          perfil={perfil} google={google} clienteDaAgenda={cliente} aoFechar={fecharJanela} aoSalvo={gravou} aoApagado={gravou}
          aoMudar={recarregar} aoConectarGoogle={conectar} />
      )}
      {desconectando && (
        <ConfirmarAcao aberto aoFechar={() => setDesconectando(false)} titulo="Desconectar o Google?" rotuloConfirmar="Desconectar"
          descricao="O app deixa de criar e mudar eventos no seu Google Agenda e de buscar a gravação das suas reuniões. Os eventos que já estão lá continuam. Dá para conectar de novo quando quiser."
          aoConfirmar={desconectar} />
      )}
    </>
  )
}
