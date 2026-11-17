import { useCallback, useRef, useState } from 'react'
import { CalendarDays, Check, CheckCircle2, Info, Mail, Plus, Trash2, Users, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { Aviso } from '@/components/auth/TelaDeAcesso'
import CampoData from '@/components/campos/CampoData'
import CampoHora from '@/components/campos/CampoHora'
import Chave from '@/components/campos/Chave'
import Seletor from '@/components/campos/Seletor'
import Avatar from '@/components/comum/Avatar'
import ConfirmarAcao from '@/components/comum/ConfirmarAcao'
import JanelaFormulario, { SecaoFormulario } from '@/components/comum/JanelaFormulario'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apagarEvento, novoIdDeEvento, pessoasParaConvidar, responderConvite, salvarEvento } from '@/data/agenda'
import { consultoresPorOcupacao } from '@/data/capacidade'
import { buscarClientes } from '@/data/clientes'
import {
  cuidaDoEvento, diaCurtoComSemana, diaDaSemana, diaEmSP, horaEmSP, horarioNoDia, montarHorario, somarDias,
} from '@/lib/calendario'
import { hoje as hojeEmSP } from '@/lib/mes'
import { primeiroNome } from '@/lib/nomes'
import { veTudo } from '@/lib/papeis'
import { cn } from '@/lib/utils'
import { CORES_DO_EVENTO, corDoEvento } from './cores'
import DetalheDoEvento from './DetalheDoEvento'

// Limites da Edge Function e do banco, conferidos também aqui (o banco continua mandando).
const MAXIMO_DE_FORA = 20
const POR_BUSCA = 20 // pessoas por busca no seletor de quem convidar
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const SO_QUEM_ORGANIZA = 'Só quem organiza e a gestão da consultoria editam.'

const RESPOSTAS = {
  confirmou: { rotulo: 'Confirmou', variante: 'positive' },
  pendente: { rotulo: 'Pendente', variante: 'notice' },
  recusou: { rotulo: 'Recusou', variante: 'outline', classe: 'text-destructive' },
  novo: { rotulo: 'Novo', variante: 'secondary' },
}

function SeloDaResposta({ resposta }) {
  const r = RESPOSTAS[resposta] ?? RESPOSTAS.pendente
  return <Badge variant={r.variante} className={cn('text-mini', r.classe)}>{r.rotulo}</Badge>
}

// "2 confirmaram · 1 pendente", como no Hub.
function resumoDasRespostas(lista) {
  const conta = (r) => lista.filter((p) => p.resposta === r).length
  return [
    [conta('confirmou'), 'confirmou', 'confirmaram'], [conta('pendente'), 'pendente', 'pendentes'], [conta('recusou'), 'recusou', 'recusaram'],
  ].filter(([n]) => n > 0).map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`).join(' · ')
}

const separar = (participantes = []) => ({
  daCasa: participantes.filter((p) => p.perfil_id).map((p) => ({ perfil_id: p.perfil_id, nome: p.nome ?? 'Consultor', resposta: p.resposta })),
  deFora: participantes.filter((p) => p.email).map((p) => ({ email: p.email, resposta: p.resposta })),
})

function BotaoTirar({ rotulo, aoTirar }) {
  return (
    <button type="button" aria-label={rotulo} title={rotulo} onClick={aoTirar}
      className="botao-animado grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color,translate,scale] outline-none hover:-translate-y-px hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]">
      <X className="size-3.5" aria-hidden="true" />
    </button>
  )
}

function ListaDaCasa({ participantes, aoTirar }) {
  return (
    <ul aria-label="Participantes" className="grid gap-1.5">
      {participantes.map((p) => (
        <li key={p.perfil_id} className="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-1.5">
          <Avatar pessoa={{ id: p.perfil_id, nome: p.nome }} className="size-6" />
          <span className="min-w-0 flex-1 truncate text-rotulo font-medium">{p.nome}</span>
          <SeloDaResposta resposta={p.resposta} />
          {aoTirar && <BotaoTirar rotulo={`Tirar ${p.nome}`} aoTirar={() => aoTirar(p.perfil_id)} />}
        </li>
      ))}
    </ul>
  )
}

function ListaDeFora({ convidados, aoTirar }) {
  return (
    <ul aria-label="Convidados de fora" className="grid gap-1.5">
      {convidados.map((c) => (
        <li key={c.email} className="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-1.5">
          <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-rotulo">{c.email}</span>
          <SeloDaResposta resposta={c.resposta} />
          {aoTirar && <BotaoTirar rotulo={`Tirar ${c.email}`} aoTirar={() => aoTirar(c.email)} />}
        </li>
      ))}
    </ul>
  )
}

// Confirmar ou recusar o convite (o participante da casa responde no app; no Google, quem responde é a pessoa).
function ConviteDoEvento({ evento, convite, aoMudar }) {
  const [resposta, setResposta] = useState(convite.resposta)
  const [enviando, setEnviando] = useState(null)
  const [erro, setErro] = useState(null)

  async function responder(nova) {
    if (enviando) return
    setEnviando(nova)
    setErro(null)
    let r
    try {
      r = await responderConvite(evento.id, nova)
    } catch {
      r = { erro: 'Não foi possível responder agora. Tente de novo.' }
    }
    setEnviando(null)
    if (r.erro) return setErro(r.erro)
    setResposta(r.resposta)
    toast.success(r.resposta === 'confirmou' ? 'Presença confirmada.' : 'Convite recusado.')
    aoMudar?.()
  }

  return (
    <section aria-label="Seu convite" className="space-y-2.5">
      <h3 className="section-label">Seu convite</h3>
      <p className="text-corpo">Sua resposta: {(RESPOSTAS[resposta] ?? RESPOSTAS.pendente).rotulo}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={resposta === 'confirmou' ? 'default' : 'outline'} aria-pressed={resposta === 'confirmou'}
          disabled={!!enviando} onClick={() => responder('confirmou')}>
          <Check /> {enviando === 'confirmou' ? 'Confirmando…' : 'Confirmar'}
        </Button>
        <Button type="button" size="sm" variant="outline" aria-pressed={resposta === 'recusou'} disabled={!!enviando} onClick={() => responder('recusou')}
          className={cn(resposta === 'recusou' && 'border-destructive/40 text-destructive')}>
          <X /> {enviando === 'recusou' ? 'Recusando…' : 'Recusar'}
        </Button>
      </div>
      {erro && <p role="alert" className="text-rotulo text-destructive">{erro}</p>}
    </section>
  )
}

// Cor do evento: as 8 do Hub, num radiogroup (setas mudam a escolha).
function CorDoEvento({ valor, aoMudar }) {
  function teclar(e, i) {
    const destino = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1 }[e.key]
    if (destino === undefined) return
    e.preventDefault()
    const proxima = (destino + CORES_DO_EVENTO.length) % CORES_DO_EVENTO.length
    aoMudar(proxima)
    e.currentTarget.parentElement.children[proxima]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap items-center gap-2">
      {CORES_DO_EVENTO.map((cor, i) => (
        <button key={cor.valor} type="button" role="radio" aria-checked={valor === i} aria-label={cor.nome} title={cor.nome}
          tabIndex={valor === i ? 0 : -1} onClick={() => aoMudar(i)} onKeyDown={(e) => teclar(e, i)}
          style={{ backgroundColor: cor.valor, '--tw-ring-color': cor.valor }}
          className={cn('botao-animado grid size-7 place-items-center rounded-full text-white transition-[box-shadow,translate,scale] outline-none hover:-translate-y-px active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-offset-2',
            valor === i && 'scale-110 ring-2 ring-offset-2 ring-offset-card')}>
          {valor === i && <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
}

// Atalhos do Quando, como no Hub ("Semana que vem" é a próxima segunda).
function atalhosDeData() {
  const hoje = hojeEmSP()
  return [
    { rotulo: 'Hoje', dia: hoje },
    { rotulo: 'Amanhã', dia: somarDias(hoje, 1) },
    { rotulo: 'Semana que vem', dia: somarDias(hoje, (8 - diaDaSemana(hoje)) % 7 || 7) },
  ]
}

function camposIniciais(evento, diaInicial) {
  if (!evento) return { titulo: '', descricao: '', data: diaInicial, horaInicio: '', horaFim: '', dataFim: '', cor: 0 }
  const data = diaEmSP(evento.inicio)
  const base = { titulo: evento.titulo, descricao: evento.descricao ?? '', data, cor: evento.cor ?? 0 }
  if (evento.dia_inteiro) {
    const ultimo = diaEmSP(Date.parse(evento.fim) - 1)
    return { ...base, horaInicio: '', horaFim: '', dataFim: ultimo > data ? ultimo : '' }
  }
  const diaDoFim = diaEmSP(evento.fim)
  return { ...base, horaInicio: horaEmSP(evento.inicio), horaFim: horaEmSP(evento.fim), dataFim: diaDoFim !== data ? diaDoFim : '' }
}

// Prévia do "Quando": "Sex, 20 de nov. · 14:00–15:00", "… até 22/11 · dia inteiro".
function quandoDaPrevia({ data, horaInicio, horaFim, dataFim }) {
  if (!data) return 'Escolha a data'
  const ate = dataFim && dataFim !== data ? ` até ${diaCurtoComSemana(dataFim)}` : ''
  const horario = horaInicio ? `${horaInicio}${horaFim ? `–${horaFim}` : ''}` : 'dia inteiro'
  return `${diaCurtoComSemana(data)}${ate} · ${horario}`
}

// O "Quando" de um evento gravado, para a leitura.
function quandoDoEvento(evento) {
  const primeiro = diaEmSP(evento.inicio)
  const ultimo = diaEmSP(Date.parse(evento.fim) - 1)
  const ate = ultimo > primeiro ? ` até ${diaCurtoComSemana(ultimo)}` : ''
  return `${diaCurtoComSemana(primeiro)}${ate} · ${evento.dia_inteiro ? 'dia inteiro' : horarioNoDia(evento, primeiro)}`
}

// ── Criar e editar ──

function FormularioDoEvento({ aberto, evento, diaInicial, perfil, google, aoFechar, aoSalvo, aoApagado, aoMudar, aoConectarGoogle }) {
  const novo = !evento
  const central = veTudo(perfil)
  const gestao = !central && perfil.papel !== 'pessoa'
  // O id nasce uma vez por janela: se a resposta de uma tentativa se perder, a próxima manda o mesmo (não duplica no Google).
  const [id] = useState(() => evento?.id ?? novoIdDeEvento())
  const [iniciais] = useState(() => camposIniciais(evento, diaInicial))
  const [titulo, setTitulo] = useState(iniciais.titulo)
  const [descricao, setDescricao] = useState(iniciais.descricao)
  const [data, setData] = useState(iniciais.data)
  const [horaInicio, setHoraInicio] = useState(iniciais.horaInicio)
  const [horaFim, setHoraFim] = useState(iniciais.horaFim)
  const [outroDia, setOutroDia] = useState(Boolean(iniciais.dataFim))
  const [dataFim, setDataFim] = useState(iniciais.dataFim)
  const [cor, setCor] = useState(iniciais.cor)
  const [consultor, setConsultor] = useState(() => (evento
    ? { id: evento.consultor_id, nome: evento.consultor?.nome ?? 'Consultor', consultoria_id: evento.consultoria_id }
    : central ? null : { id: perfil.id, nome: perfil.nome, consultoria_id: perfil.consultoria_id }))
  const [cliente, setCliente] = useState(() => (evento?.cliente ? { id: evento.cliente.id, nome: evento.cliente.nome } : null))
  const [participantes, setParticipantes] = useState(() => separar(evento?.participantes).daCasa)
  const [convidados, setConvidados] = useState(() => separar(evento?.participantes).deFora)
  const [novoConvidado, setNovoConvidado] = useState('')
  const [erroConvidado, setErroConvidado] = useState(null)
  const [comMeet, setComMeet] = useState(evento?.com_meet ?? false)
  const [gravar, setGravar] = useState(evento?.gravar ?? false)
  const [meetTocado, setMeetTocado] = useState(false)
  const [erro, setErro] = useState(null)
  const [erroDoQuando, setErroDoQuando] = useState(null) // { erro, campo } do horário, mostrado junto dos campos
  const [enviando, setEnviando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const gravando = useRef(false)

  // O erro do horário some quando a pessoa mexe em algum campo do Quando.
  const chaveDoQuando = [data, horaInicio, horaFim, outroDia ? dataFim : ''].join('|')
  const erroDoHorario = erroDoQuando?.chave === chaveDoQuando ? erroDoQuando : null
  const souOrganizador = consultor?.id === perfil.id
  const meetFixo = !novo && Boolean(evento.com_meet)
  const semGoogleProprio = souOrganizador && !google?.conectado
  const meuConvite = evento?.participantes?.find((p) => p.perfil_id === perfil.id)
  const consultoriaDoEvento = consultor?.consultoria_id ?? null

  const buscarConsultores = useCallback(async (termo) => {
    const { itens, total } = await consultoresPorOcupacao({ consultoriaId: central ? null : perfil.consultoria_id, busca: termo || undefined, limite: 8 })
    return {
      itens: itens.map((p) => ({ valor: p.id, rotulo: p.nome, detalhe: central ? p.consultoria_nome : p.email, avatar: p, consultoriaId: p.consultoria_id })),
      total,
    }
  }, [central, perfil.consultoria_id])

  const buscarOsClientes = useCallback(async (termo) => {
    const { itens, total } = await buscarClientes({ termo, consultoriaId: consultoriaDoEvento ?? undefined, ativos: true, limite: 8 })
    return { itens: itens.map((c) => ({ valor: c.id, rotulo: c.nome, detalhe: c.contato_email ?? undefined, cliente: c })), total }
  }, [consultoriaDoEvento])

  // Colegas para convidar (qualquer papel, inclusive o consultor): as pessoas da consultoria do evento, pela função do
  // banco (o consultor não lê os colegas direto), menos o dono da agenda e quem já está na lista.
  const buscarColegas = useCallback(async (termo) => {
    const fora = new Set([consultor?.id, ...participantes.map((p) => p.perfil_id)])
    const { itens } = await pessoasParaConvidar({ consultoriaId: consultoriaDoEvento, termo, limite: Math.min(50, POR_BUSCA + fora.size) })
    const livres = itens.filter((p) => !fora.has(p.id)).slice(0, POR_BUSCA)
    return { itens: livres.map((p) => ({ valor: p.id, rotulo: p.nome, avatar: p })), total: livres.length }
  }, [consultor?.id, consultoriaDoEvento, participantes])

  function ligarMeet(ligar) {
    setComMeet(ligar)
    setGravar(ligar)
  }

  function escolherConsultor(valor, opcao) {
    const mudouDeConsultoria = opcao.consultoriaId !== consultor?.consultoria_id
    setConsultor({ id: valor, nome: opcao.rotulo, consultoria_id: opcao.consultoriaId })
    // Cliente e convidados da casa são da consultoria do evento: outra consultoria, outra escolha.
    if (mudouDeConsultoria) {
      setCliente(null)
      setParticipantes([])
    } else {
      setParticipantes((lista) => lista.filter((p) => p.perfil_id !== valor))
    }
  }

  function escolherCliente(valor, opcao) {
    const escolhido = valor ? opcao.cliente ?? { id: valor, nome: opcao.rotulo } : null
    setCliente(escolhido)
    // Com cliente, a reunião nasce com Meet e gravação (quem já mexeu na chave decide).
    if (novo && !meetTocado && !semGoogleProprio) ligarMeet(Boolean(escolhido))
  }

  function convidarDeFora(email) {
    const limpo = email.trim().toLowerCase()
    if (!EMAIL.test(limpo) || limpo.length > 254) return setErroConvidado('Confira o e-mail do convidado.')
    if (convidados.some((c) => c.email === limpo)) return setErroConvidado('Esse e-mail já está na lista.')
    if (convidados.length >= MAXIMO_DE_FORA) return setErroConvidado(`No máximo ${MAXIMO_DE_FORA} convidados de fora por evento.`)
    setConvidados((lista) => [...lista, { email: limpo, resposta: 'novo' }])
    setNovoConvidado('')
    setErroConvidado(null)
  }

  const contato = cliente?.contato_email?.toLowerCase()
  const sugestao = contato && !convidados.some((c) => c.email === contato) ? cliente : null

  async function salvar(e) {
    e.preventDefault()
    if (gravando.current) return
    if (!titulo.trim()) return setErro('Escreva o título do evento.')
    if (!consultor) return setErro('Escolha o consultor: o evento fica na agenda dele.')
    const horario = montarHorario({ data, horaInicio, horaFim, dataFim: outroDia ? dataFim : '' })
    setErroDoQuando(horario.erro ? { ...horario, chave: chaveDoQuando } : null)
    if (horario.erro) return setErro(null)
    const dados = {
      id,
      ...(novo ? { novo: true, consultor_id: consultor.id } : {}),
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      cliente_id: cliente?.id ?? null,
      ...horario,
      cor,
      com_meet: comMeet,
      gravar: comMeet && gravar,
      participantes: participantes.map((p) => p.perfil_id),
      convidados: convidados.map((c) => c.email),
    }
    gravando.current = true
    setEnviando(true)
    setErro(null)
    let resposta
    try {
      resposta = await salvarEvento(dados)
    } catch {
      resposta = { erro: 'Não foi possível salvar agora. Tente de novo.' }
    }
    gravando.current = false
    setEnviando(false)
    if (resposta.erro) return setErro(resposta.erro)
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success(novo ? 'Evento criado.' : 'Alterações salvas.')
    aoSalvo?.(resposta.evento)
  }

  async function apagar() {
    let resposta
    try {
      resposta = await apagarEvento(evento.id)
    } catch {
      resposta = { erro: 'Não foi possível apagar agora. Tente de novo.' }
    }
    if (resposta.erro) return resposta
    if (resposta.aviso) toast.warning(resposta.aviso)
    else toast.success('Evento apagado.')
    aoApagado?.()
    return resposta
  }

  const organizador = evento?.consultor?.nome ?? 'o organizador'
  const textoDoApagar = evento ? [
    evento.google_evento_id
      ? `O evento é cancelado no Google Agenda de ${organizador} e os convidados recebem o cancelamento.`
      : 'O evento só está no app: sai daqui, e os participantes deixam de vê-lo.',
    evento.google_evento_id && `Se o Google de ${organizador} não aceitar mais a conexão, o evento sai só do app e pode continuar na agenda dele.`,
    (evento.pasta_id || (evento.com_meet && evento.cliente_id)) && 'A pasta da reunião fica nos Arquivos do cliente.',
  ].filter(Boolean).join(' ') : ''

  const avisoDoGoogle = (() => {
    if (!novo) {
      const agenda = souOrganizador ? 'seu Google Agenda' : `Google Agenda de ${organizador}`
      return evento.google_evento_id
        ? `Este evento está no ${agenda}: as mudanças vão para lá, e os convidados são avisados.`
        : `Este evento está só no app. Ao salvar, ele vai para o ${agenda} se o Google estiver conectado.`
    }
    if (!consultor) return 'O evento vai para o Google Agenda do consultor escolhido, com os convidados.'
    if (!souOrganizador) {
      return `Vai para o Google Agenda de ${consultor.nome}, com os convidados. Se ${primeiroNome(consultor.nome)} não conectou o Google, o evento fica só no app, sem Meet.`
    }
    return google?.conectado ? 'Vai para o seu Google Agenda, com os convidados.' : null
  })()

  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={novo ? 'Novo evento' : 'Editar evento'} icone={CalendarDays} largura="5xl" enviando={enviando}
      descricao={novo ? 'Marque a reunião ou o compromisso e convide quem vai.' : 'Mude o que precisar: o Google e os convidados são avisados.'}
      acaoEsquerda={!novo && (
        <Button type="button" variant="ghost" disabled={enviando} onClick={() => setApagando(true)}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 /> Apagar
        </Button>
      )}
      rodape={(
        <>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>Cancelar</Button>
          <Button type="submit" form="form-evento" disabled={enviando}>
            {enviando ? (novo ? 'Criando…' : 'Salvando…') : (novo ? 'Criar evento' : 'Salvar alterações')}
          </Button>
        </>
      )}>
      <form id="form-evento" noValidate onSubmit={salvar} className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <SecaoFormulario titulo="O evento">
            <div className="grid gap-2">
              <Label htmlFor="evento-titulo">Título</Label>
              <Input id="evento-titulo" className="h-10" maxLength={200} value={titulo} placeholder="Ex.: Reunião de kickoff"
                onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evento-cliente">Cliente</Label>
              <Seletor id="evento-cliente" valor={cliente?.id ?? ''} buscar={buscarOsClientes} rotuloTodos="Sem cliente"
                desabilitado={!consultoriaDoEvento} placeholder={consultoriaDoEvento ? 'Sem cliente' : 'Escolha o consultor primeiro'}
                opcoes={cliente ? [{ valor: cliente.id, rotulo: cliente.nome }] : []} aoMudar={escolherCliente} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="evento-descricao">Descrição</Label>
              <textarea id="evento-descricao" rows={2} maxLength={5000} value={descricao} placeholder="Pauta, o que levar…" onChange={(e) => setDescricao(e.target.value)} className="input texto-de-campo resize-none" />
            </div>
            {(central || gestao) && (
              <div className="grid gap-2">
                <Label htmlFor="evento-consultor">Consultor</Label>
                <Seletor id="evento-consultor" valor={consultor?.id ?? ''} buscar={buscarConsultores} desabilitado={!novo} placeholder="Escolha o consultor"
                  opcoes={consultor ? [{ valor: consultor.id, rotulo: consultor.nome }] : []} aoMudar={escolherConsultor} />
                <p className="text-legenda text-muted-foreground">
                  {novo ? 'De quem é a agenda: o evento vai para o Google dele.'
                    : 'O consultor não muda: para levar o evento à agenda de outra pessoa, apague e crie de novo.'}
                </p>
              </div>
            )}
          </SecaoFormulario>

          <SecaoFormulario titulo="Quando">
            <div className="flex flex-wrap gap-1">
              {atalhosDeData().map((a) => (
                <button key={a.rotulo} type="button" aria-pressed={data === a.dia} onClick={() => { setData(a.dia); if (dataFim && dataFim < a.dia) setDataFim('') }}
                  className={cn('botao-animado rounded-md px-2 py-1 text-legenda font-medium transition-[background-color,color,translate,scale] outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]',
                    data === a.dia ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary hover:bg-primary/15')}>
                  {a.rotulo}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Quando" aria-describedby={erroDoHorario ? 'evento-quando-erro' : undefined} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="col-span-2 grid gap-2 sm:col-span-1">
                  <Label htmlFor="evento-data">{outroDia ? 'Começa em' : 'Data'}</Label>
                  <CampoData id="evento-data" valor={data} obrigatorio aoMudar={(v) => { setData(v); if (dataFim && dataFim < v) setDataFim('') }} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="evento-das">Das</Label>
                  <CampoHora id="evento-das" valor={horaInicio} aoMudar={setHoraInicio} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="evento-ate">Até</Label>
                  <CampoHora id="evento-ate" valor={horaFim} aoMudar={setHoraFim} />
                </div>
              </div>
              {outroDia ? (
                <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)]">
                  <div className="col-span-2 grid gap-2 sm:col-span-1">
                    <Label htmlFor="evento-termina">Termina em</Label>
                    <CampoData id="evento-termina" valor={dataFim} min={data} aoMudar={setDataFim} />
                  </div>
                  <Button type="button" variant="link" size="sm" className="justify-self-start" onClick={() => { setOutroDia(false); setDataFim('') }}>
                    Termina no mesmo dia
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setOutroDia(true)}><Plus /> Termina em outro dia</Button>
                  <span className="text-legenda text-muted-foreground">Sem horário, o evento fica como dia inteiro.</span>
                </div>
              )}
              {erroDoHorario && (
                <p id="evento-quando-erro" role="alert" data-campo={erroDoHorario.campo} className="text-rotulo text-destructive">{erroDoHorario.erro}</p>
              )}
            </div>
          </SecaoFormulario>

          <SecaoFormulario titulo="Participantes">
            {participantes.length > 0 && !novo && <p className="text-legenda text-muted-foreground">{resumoDasRespostas(participantes)}</p>}
            <div className="grid gap-2">
              <Label htmlFor="evento-participante">Convidar consultor</Label>
              <Seletor id="evento-participante" valor="" buscar={buscarColegas} desabilitado={!consultoriaDoEvento}
                placeholder={consultoriaDoEvento ? 'Buscar pessoa da consultoria' : 'Escolha o consultor primeiro'}
                aoMudar={(valor, opcao) => valor && setParticipantes((lista) => (lista.some((p) => p.perfil_id === valor) ? lista
                  : [...lista, { perfil_id: valor, nome: opcao.rotulo, resposta: 'novo' }]))} />
            </div>
            {participantes.length > 0 ? (
              <ListaDaCasa participantes={participantes} aoTirar={(perfilId) => setParticipantes((lista) => lista.filter((p) => p.perfil_id !== perfilId))} />
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-legenda text-muted-foreground">
                <Users className="size-3.5 shrink-0" aria-hidden="true" /> Ninguém do time convidado ainda.
              </p>
            )}
          </SecaoFormulario>

          <SecaoFormulario titulo="Convidados de fora">
            <p className="text-legenda text-muted-foreground">
              Recebem o convite do Google com o link do Meet e entram na reunião como convidados. Até {MAXIMO_DE_FORA}.
            </p>
            {sugestao && (
              <div role="group" aria-label="Sugestão de convidado" className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
                <Mail className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-rotulo">
                  Contato do cliente: {sugestao.contato_nome && <strong className="font-semibold">{sugestao.contato_nome} </strong>}
                  <span className="text-muted-foreground">{sugestao.contato_email}</span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => convidarDeFora(sugestao.contato_email)}>
                  <Plus /> Convidar
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              <Input id="evento-convidado" type="email" aria-label="E-mail do convidado de fora" placeholder="nome@empresa.com.br" value={novoConvidado}
                aria-invalid={erroConvidado ? true : undefined} aria-describedby={erroConvidado ? 'evento-convidado-erro' : undefined}
                onChange={(e) => { setNovoConvidado(e.target.value); setErroConvidado(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); convidarDeFora(novoConvidado) } }} />
              <Button type="button" variant="outline" onClick={() => convidarDeFora(novoConvidado)}><Plus /> Adicionar</Button>
            </div>
            {erroConvidado && <p id="evento-convidado-erro" role="alert" className="text-rotulo text-destructive">{erroConvidado}</p>}
            {convidados.length > 0 && (
              <ListaDeFora convidados={convidados} aoTirar={(email) => setConvidados((lista) => lista.filter((c) => c.email !== email))} />
            )}
          </SecaoFormulario>
          {erro && <Aviso>{erro}</Aviso>}
        </div>

        <div className="min-w-0 space-y-6 rounded-xl border bg-muted/40 p-4">
          {evento && <DetalheDoEvento evento={evento} podeEditar aoMudar={aoMudar} />}
          {meuConvite && <ConviteDoEvento evento={evento} convite={meuConvite} aoMudar={aoMudar} />}

          <SecaoFormulario titulo="Prévia">
            <div className="space-y-2 rounded-xl border bg-card p-3">
              <p className="text-legenda text-muted-foreground">Como aparece no calendário</p>
              <span className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-legenda font-medium text-white" style={{ backgroundColor: corDoEvento(cor) }}>
                {comMeet && <Video className="size-3 shrink-0" strokeWidth={2.2} aria-hidden="true" />}
                <span className="truncate">{titulo.trim() || 'Título do evento'}</span>
              </span>
              <p className="text-rotulo text-foreground/80">{quandoDaPrevia({ data, horaInicio, horaFim, dataFim: outroDia ? dataFim : '' })}</p>
              {(participantes.length > 0 || convidados.length > 0) && (
                <p className="text-legenda text-muted-foreground">
                  {[participantes.length && `${participantes.length} do time`, convidados.length && `${convidados.length} de fora`].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </SecaoFormulario>

          <SecaoFormulario titulo="Cor">
            <CorDoEvento valor={cor} aoMudar={setCor} />
          </SecaoFormulario>

          <SecaoFormulario titulo="Google Meet">
            <Chave id="evento-meet" rotulo="Google Meet" ligada={comMeet} desabilitado={meetFixo || semGoogleProprio}
              aoMudar={(ligar) => { setMeetTocado(true); ligarMeet(ligar) }} />
            {meetFixo && <p className="text-legenda text-muted-foreground">O Meet desta reunião já foi criado no Google e não sai pelo app.</p>}
            {semGoogleProprio && !meetFixo && <p className="text-legenda text-muted-foreground">Conecte o Google para a reunião ter Meet.</p>}
            <Chave id="evento-gravar" rotulo="Gravar e transcrever" ligada={comMeet && gravar} desabilitado={!comMeet} aoMudar={setGravar} />
            <p className="flex gap-2 text-legenda text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              A gravação começa quando o organizador entra na reunião; precisa de Google Workspace com gravação. Depois da reunião, a
              transcrição e a documentação viram uma pasta nos Arquivos do cliente.
            </p>
          </SecaoFormulario>

          <SecaoFormulario titulo="Google Agenda">
            {avisoDoGoogle ? (
              <p className="flex items-start gap-2 text-rotulo text-foreground/80">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden="true" /> {avisoDoGoogle}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
                <span className="min-w-0 flex-1 text-rotulo text-foreground/80">Conecte o Google para o evento ir para a sua agenda, com o Meet e os convidados.</span>
                <Button type="button" variant="outline" size="sm" onClick={aoConectarGoogle}>Conectar Google</Button>
              </div>
            )}
          </SecaoFormulario>
        </div>
      </form>
      {apagando && (
        <ConfirmarAcao aberto aoFechar={() => setApagando(false)} titulo={`Apagar o evento ${evento.titulo}?`} descricao={textoDoApagar}
          rotuloConfirmar="Apagar evento" aoConfirmar={apagar} />
      )}
    </JanelaFormulario>
  )
}

// ── Só leitura (quem não organiza nem é da gestão) ──

function EventoSoLeitura({ aberto, evento, perfil, aoFechar, aoMudar }) {
  const { daCasa, deFora } = separar(evento.participantes)
  const meuConvite = evento.participantes?.find((p) => p.perfil_id === perfil.id)
  return (
    <JanelaFormulario aberto={aberto} aoFechar={aoFechar} titulo={evento.titulo} icone={CalendarDays} largura="lg"
      descricao={`Na agenda de ${evento.consultor?.nome ?? 'outro consultor'}`}
      rodape={<Button type="button" onClick={aoFechar}>Fechar</Button>}>
      <SecaoFormulario titulo="Quando">
        <p className="flex items-center gap-2 text-corpo"><CalendarDays className="size-3.5 text-muted-foreground" aria-hidden="true" />{quandoDoEvento(evento)}</p>
      </SecaoFormulario>
      {evento.cliente && <SecaoFormulario titulo="Cliente"><p className="text-corpo">{evento.cliente.nome}</p></SecaoFormulario>}
      {evento.descricao && <SecaoFormulario titulo="Descrição"><p className="text-corpo whitespace-pre-line text-foreground/80">{evento.descricao}</p></SecaoFormulario>}
      {daCasa.length > 0 && (
        <SecaoFormulario titulo="Participantes">
          <p className="text-legenda text-muted-foreground">{resumoDasRespostas(daCasa)}</p>
          <ListaDaCasa participantes={daCasa} />
        </SecaoFormulario>
      )}
      {deFora.length > 0 && <SecaoFormulario titulo="Convidados de fora"><ListaDeFora convidados={deFora} /></SecaoFormulario>}
      <DetalheDoEvento evento={evento} podeEditar={false} />
      {meuConvite && <ConviteDoEvento evento={evento} convite={meuConvite} aoMudar={aoMudar} />}
      <p className="flex items-start gap-2.5 rounded-xl border border-notice/25 bg-notice-soft px-3 py-2.5 text-rotulo text-notice">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {SO_QUEM_ORGANIZA}
      </p>
    </JanelaFormulario>
  )
}

// Janela do evento (padrão Hub, larga, em 2 colunas como a do Hub): Novo evento, Editar (quem organiza, a gestão da
// consultoria e a central) e só leitura para os outros (o participante responde Confirmar/Recusar). `evento` null =
// novo, no `diaInicial`. `google`: o meu Google ({ conectado }). aoSalvo/aoApagado: a tela fecha e relê; aoMudar: a
// tela relê e a janela continua aberta (resposta ao convite, Buscar agora).
export default function JanelaEvento(props) {
  const podeEditar = !props.evento || cuidaDoEvento(props.perfil, props.evento)
  return podeEditar ? <FormularioDoEvento {...props} /> : <EventoSoLeitura {...props} />
}
