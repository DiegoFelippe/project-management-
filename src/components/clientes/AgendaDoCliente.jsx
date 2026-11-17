import { useEffect, useId, useMemo, useState } from 'react'
import { GraficoCarregando } from '@/components/comum/Carregando'
import NavegacaoDoMes from '@/components/comum/NavegacaoDoMes'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { checkinsDoMes } from '@/data/checkins'
import { eventosDoMes } from '@/data/clientes'
import { formatarDuracao, formatarHoras, horasEntre } from '@/lib/horas'
import { formatarDia, mesAtual, rotuloDoMes } from '@/lib/mes'
import { cn } from '@/lib/utils'
import { textoDoEvento } from './rotulos'

// Agenda do mês: grade de segunda a domingo com os check-ins e os eventos de cada dia. Dia e hora no fuso de
// São Paulo. Clicar (ou Enter) abre o detalhe do dia; setas movem o dia.
const FUSO = 'America/Sao_Paulo'
const MARCAS_POR_DIA = 3
const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const DIA_DE_SP = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, timeStyle: 'short' })
const DIA_DA_SEMANA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' })

const diaDe = (instante) => DIA_DE_SP.format(new Date(instante))
const pad = (n) => String(n).padStart(2, '0')
const nomeDe = (nome) => nome ?? 'outro consultor'

function duracaoDoCheckin(c) {
  if (!c.fim) return null
  const inicio = new Date(c.inicio)
  const fim = new Date(c.fim)
  const minutos = (fim - inicio) / 60_000
  return minutos < 60 ? formatarDuracao(fim - inicio) : formatarHoras(horasEntre(inicio, fim))
}

// Semanas do mês (cada uma com 7 dias): { dia: 'YYYY-MM-DD', numero, doMes }.
function semanasDoMes(mes) {
  const [ano, numero] = mes.split('-').map(Number)
  const primeiro = Date.UTC(ano, numero - 1, 1)
  const deslocamento = (new Date(primeiro).getUTCDay() + 6) % 7
  const diasNoMes = new Date(Date.UTC(ano, numero, 0)).getUTCDate()
  const total = Math.ceil((deslocamento + diasNoMes) / 7) * 7
  const dias = Array.from({ length: total }, (_, i) => {
    const d = new Date(primeiro + (i - deslocamento) * 86_400_000)
    const doMes = d.getUTCMonth() === numero - 1
    const dia = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    return { dia, numero: d.getUTCDate(), doMes }
  })
  return Array.from({ length: total / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7))
}

// Marcas e detalhes do dia, em ordem de horário: check-ins e eventos juntos.
function agruparPorDia(checkins, eventos) {
  const porDia = new Map()
  const guardar = (instante, item) => {
    const dia = diaDe(instante)
    if (!porDia.has(dia)) porDia.set(dia, [])
    porDia.get(dia).push({ ...item, instante: new Date(instante).getTime() })
  }
  checkins.forEach((c) => guardar(c.inicio, { tipo: 'checkin', id: c.id, checkin: c }))
  eventos.forEach((e) => guardar(e.em, { tipo: 'evento', id: e.id, evento: e }))
  porDia.forEach((lista) => lista.sort((a, b) => a.instante - b.instante))
  return porDia
}

function textoDaMarca(item) {
  if (item.tipo === 'evento') return textoDoEvento(item.evento)
  const c = item.checkin
  return `${nomeDe(c.consultor?.nome)} · ${c.fim ? duracaoDoCheckin(c) : 'em andamento'}`
}

function DetalheDoDia({ dia, itens, aoFechar }) {
  const data = dia ? new Date(`${dia}T12:00:00Z`) : null
  return (
    <Dialog open={Boolean(dia)} onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{data && `${DIA_DA_SEMANA.format(data)}, ${formatarDia(dia)}`}</DialogTitle>
          <DialogDescription>{itens.length === 0 ? 'Nada neste dia.' : 'Check-ins e eventos do dia.'}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-3">
          {itens.map((item) => (
            <li key={`${item.tipo}-${item.id}`} className="rounded-lg border p-3 text-corpo">
              {item.tipo === 'checkin' ? (
                <>
                  <p className="font-medium">
                    <span className="tabular-nums">
                      {HORA.format(new Date(item.checkin.inicio))}
                      {item.checkin.fim ? `–${HORA.format(new Date(item.checkin.fim))}` : ''}
                    </span>
                    {' · '}
                    <span>{nomeDe(item.checkin.consultor?.nome)}</span>
                  </p>
                  <p className="text-muted-foreground">{duracaoDoCheckin(item.checkin) ?? 'em andamento'}</p>
                  {item.checkin.descricao && <p className="mt-1">{item.checkin.descricao}</p>}
                </>
              ) : (
                <>
                  <p className="font-medium">
                    <span className="tabular-nums">{HORA.format(new Date(item.evento.em))}</span>
                    {' · '}
                    <span>{textoDoEvento(item.evento)}</span>
                  </p>
                  <p className="text-muted-foreground">{item.evento.autor ?? '—'}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

// versao muda quando a página mudou algo (check-out, edição...) e a agenda recarrega.
export default function AgendaDoCliente({ clienteId, versao }) {
  const base = useId()
  const [mes, setMes] = useState(mesAtual)
  const [estado, setEstado] = useState({ chave: null })
  const [foco, setFoco] = useState(null)
  const [aberto, setAberto] = useState(null)
  const chave = `${clienteId}:${mes}:${versao ?? 0}`

  useEffect(() => {
    let ativo = true
    Promise.all([checkinsDoMes(clienteId, mes), eventosDoMes(clienteId, mes)])
      .then(([checkins, eventos]) => ativo && setEstado({ chave, checkins, eventos: eventos.itens, totalDeEventos: eventos.total }))
      .catch(() => ativo && setEstado({ chave, erro: 'Não foi possível carregar a agenda.' }))
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const pronto = estado.chave === chave
  const porDia = useMemo(
    () => (pronto && !estado.erro ? agruparPorDia(estado.checkins, estado.eventos) : new Map()),
    [pronto, estado],
  )
  const semanas = useMemo(() => semanasDoMes(mes), [mes])
  const hoje = diaDe(new Date())
  const diaFocavel = foco?.startsWith(mes.slice(0, 7)) ? foco : hoje.startsWith(mes.slice(0, 7)) ? hoje : mes
  const diasNoMes = semanas.flat().filter((d) => d.doMes).length
  const eventosAlemDosCarregados = pronto && !estado.erro ? Math.max(0, estado.totalDeEventos - estado.eventos.length) : 0

  function mudarMes(novo) {
    setMes(novo)
    setFoco(null)
    setAberto(null)
  }

  function aoTeclar(e, dia) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setAberto(dia)
      return
    }
    const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (!passo) return
    e.preventDefault()
    const numero = Math.min(diasNoMes, Math.max(1, Number(dia.slice(8, 10)) + passo))
    const novo = `${mes.slice(0, 8)}${pad(numero)}`
    setFoco(novo)
    document.getElementById(`${base}-${novo}`)?.focus()
  }

  return (
    <section aria-label="Agenda" className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <NavegacaoDoMes mes={mes} aoMudar={mudarMes} />
        {eventosAlemDosCarregados > 0 && (
          <span className="text-corpo text-muted-foreground">
            e mais {eventosAlemDosCarregados} {eventosAlemDosCarregados === 1 ? 'evento' : 'eventos'}
          </span>
        )}
      </div>
      {estado.erro && pronto && <p role="alert" className="text-corpo text-destructive">{estado.erro}</p>}
      {!pronto && <GraficoCarregando texto="Carregando a agenda…" className="py-2" />}
      <div className="overflow-x-auto">
        <div role="grid" aria-label={`Agenda de ${rotuloDoMes(mes)}`} className="grid min-w-[44rem] gap-px rounded-xl border bg-border">
          <div role="row" className="grid grid-cols-7 gap-px">
            {SEMANA.map((s) => (
              <div key={s} role="columnheader" className="bg-muted px-2 py-1 text-center text-rotulo font-medium uppercase text-muted-foreground">{s}</div>
            ))}
          </div>
          {semanas.map((semana) => (
            <div key={semana[0].dia} role="row" className="grid grid-cols-7 gap-px">
              {semana.map(({ dia, numero, doMes }) => {
                if (!doMes) {
                  return (
                    <div key={dia} role="gridcell" aria-disabled="true" aria-label={String(numero)}
                      className="min-h-24 bg-muted/40 p-1.5 text-rotulo text-muted-foreground/50">
                      {numero}
                    </div>
                  )
                }
                const itens = porDia.get(dia) ?? []
                const ehHoje = dia === hoje
                return (
                  <div key={dia} id={`${base}-${dia}`} role="gridcell" tabIndex={dia === diaFocavel ? 0 : -1}
                    aria-selected={dia === diaFocavel} aria-current={ehHoje ? 'date' : undefined}
                    onClick={() => { setFoco(dia); setAberto(dia) }} onKeyDown={(e) => aoTeclar(e, dia)}
                    onFocus={() => setFoco(dia)}
                    className={cn(
                      'min-h-24 cursor-pointer bg-card p-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                      dia === diaFocavel && 'bg-accent/50',
                    )}>
                    <span className={cn('inline-grid size-6 place-items-center rounded-full text-rotulo font-medium', ehHoje && 'bg-primary text-primary-foreground')}>
                      {numero}
                    </span>
                    <ul className="mt-1 grid gap-0.5">
                      {itens.slice(0, MARCAS_POR_DIA).map((item) => (
                        <li key={`${item.tipo}-${item.id}`}
                          className={cn('truncate rounded px-1 text-rotulo', item.tipo === 'checkin' ? 'bg-primary/10 text-foreground' : 'bg-muted text-muted-foreground')}>
                          {textoDaMarca(item)}
                        </li>
                      ))}
                      {itens.length > MARCAS_POR_DIA && (
                        <li className="px-1 text-rotulo font-medium text-muted-foreground">+{itens.length - MARCAS_POR_DIA}</li>
                      )}
                    </ul>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <DetalheDoDia dia={aberto} itens={aberto ? porDia.get(aberto) ?? [] : []} aoFechar={() => setAberto(null)} />
    </section>
  )
}
